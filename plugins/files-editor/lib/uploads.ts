/**
 * Chunked, resumable uploads into a checkout on this Mac or into Home.
 * Server-side only: `node:fs`, no BB in between.
 *
 * Ported from `file-manager` (MIT, © Foma, github.com/xMinor-1/bb-plugins,
 * plugins/file-manager/src/uploads.ts) and cut to what this panel needs: one
 * file per session (no folder drops), a destination given as a workspace root
 * plus a folder inside it, and the final placement through `placeFile` in
 * lib/mutations.ts (never over an existing name — `name (1)` instead).
 *
 * The invariants are file-manager's:
 *  1. Nothing is buffered: a chunk streams from the request straight into a
 *     positional write on the `.part` file.
 *  2. Positional writes (`r+` at the offset), never append, so a retried chunk
 *     cannot be written twice.
 *  3. The `.part` file's size is the truth about what arrived. Sessions live
 *     in JSON files beside it, not in `bb.storage`, so the streaming path holds
 *     no `bb.*` handle that a `bb plugin reload` could close under it.
 *  4. Every accepted chunk is fsync'ed before the answer, so "received" is a
 *     resume point that survives a crash.
 *  5. One chunk at a time per upload: a second one racing in gets 409.
 */
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { MutationError, placeFile, resolveFolderPath, toMutationError, validateName } from "./mutations.js";
import {
  DEFAULT_CHUNK_BYTES,
  MAX_CHUNK_BYTES,
  MIN_CHUNK_BYTES,
  UPLOAD_ID_PATTERN,
  parseStagingName,
  partFileName,
  sessionFileName,
} from "./transfer.js";

/** What one upload is, kept beside its `.part` file. */
export interface UploadSession {
  uploadId: string;
  /** `kind:id` of the workspace it goes to; finishing in another one is refused. */
  scopeKey: string;
  /** The folder it goes into, relative to the workspace root. */
  folder: string;
  fileName: string;
  sizeBytes: number;
  lastModifiedMs: number;
  /** Same file, same place → same session: how a re-dropped file resumes. */
  sessionKey: string;
  createdAtMs: number;
}

export type UploadErrorCode =
  | "invalid_params"
  | "upload_not_found"
  | "upload_busy"
  | "size_mismatch"
  | "wrong_workspace";

/** A refusal with a sentence the panel can show. */
export class UploadError extends Error {
  constructor(
    readonly code: UploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export interface ChunkRequest {
  uploadId: string | null | undefined;
  offset: string | number | null | undefined;
  /** The request body as `context.req.raw.body` hands it over. */
  body: ReadableStream<Uint8Array> | null | undefined;
  /** Aborted when the client goes away. */
  signal?: AbortSignal;
}

/** The chunk route's answers, as data: the route only turns them into JSON. */
export type ChunkOutcome =
  | { status: 200; body: { ok: true; uploadId: string; received: number } }
  | { status: 400; body: { ok: false; error: "invalid_params" } }
  | { status: 404; body: { ok: false; error: "upload_not_found" } }
  | { status: 409; body: { ok: false; error: "offset_mismatch" | "upload_busy"; expected: number } }
  | { status: 413; body: { ok: false; error: "size_mismatch" } }
  | { status: 499; body: { ok: false; error: "aborted"; received: number } }
  | { status: 500; body: { ok: false; error: "io_error"; message: string } };

export interface CreateInput {
  scopeKey: string;
  /** The workspace root on this Mac. */
  root: string;
  folder: string;
  fileName: string;
  sizeBytes: number;
  lastModifiedMs: number;
}

export interface UploadsOptions {
  /** Where `.part` files and their sessions live — the plugin's own data folder. */
  stagingDir: string;
  /** A session whose `.part` has not grown for this long is swept. Default 24 h. */
  sessionTtlMs?: number;
  chunkSizeBytes?: number;
  now?: () => number;
}

export interface Uploads {
  create(input: CreateInput): Promise<{
    uploadId: string;
    receivedBytes: number;
    chunkSizeBytes: number;
    resumed: boolean;
  }>;
  /** null: no such upload (finished, aborted, swept). */
  status(uploadId: string): Promise<{ receivedBytes: number; sizeBytes: number } | null>;
  writeChunk(request: ChunkRequest): Promise<ChunkOutcome>;
  /** Places the file; returns its path relative to the root. */
  finish(input: { uploadId: string; scopeKey: string; root: string }): Promise<string>;
  abort(uploadId: string): Promise<void>;
  /** Drops stale sessions; returns how many. */
  sweep(): Promise<number>;
}

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Fails the pipeline the moment a body would run past the declared size. */
class OverflowError extends Error {}

function createLimiter(remaining: number): Transform {
  let left = remaining;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (chunk.length > left) {
        callback(new OverflowError("chunk exceeds the declared size"));
        return;
      }
      left -= chunk.length;
      callback(null, chunk);
    },
  });
}

/** A rollback truncate must not race a write still queued on the descriptor. */
async function closeSink(sink: WriteStream): Promise<void> {
  if (sink.closed) return;
  await new Promise<void>((resolve) => {
    sink.once("close", () => resolve());
    sink.once("error", () => resolve());
    sink.destroy();
  });
}

function isAbortLike(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted === true) return true;
  if (typeof error !== "object" || error === null) return false;
  const { code, name } = error as { code?: unknown; name?: unknown };
  return (
    code === "ABORT_ERR" ||
    code === "ERR_STREAM_PREMATURE_CLOSE" ||
    name === "AbortError" ||
    name === "ResponseAborted"
  );
}

/** A query string or a number; anything but a non-negative safe integer is null. */
export function parseOffset(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string" || !/^\d+$/u.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sessionKeyOf(input: {
  scopeKey: string;
  folderReal: string;
  fileName: string;
  sizeBytes: number;
  lastModifiedMs: number;
}): string {
  return createHash("sha256")
    .update(
      [input.scopeKey, input.folderReal, input.fileName, String(input.sizeBytes), String(input.lastModifiedMs)].join(
        "\0",
      ),
      "utf8",
    )
    .digest("hex");
}

async function sizeOf(absolutePath: string): Promise<number | null> {
  try {
    return (await stat(absolutePath)).size;
  } catch {
    return null;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createUploads(options: UploadsOptions): Uploads {
  const stagingDir = options.stagingDir;
  const ttl = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const now = options.now ?? Date.now;
  const chunkSize = Math.min(
    MAX_CHUNK_BYTES,
    Math.max(MIN_CHUNK_BYTES, Math.floor(options.chunkSizeBytes ?? DEFAULT_CHUNK_BYTES)),
  );
  /** In memory on purpose: a reload clears it, and the `.part` size is what resumes. */
  const locked = new Set<string>();

  const partPath = (uploadId: string) => path.join(stagingDir, partFileName(uploadId));
  const sessionPath = (uploadId: string) => path.join(stagingDir, sessionFileName(uploadId));
  const isUploadId = (candidate: unknown): candidate is string =>
    typeof candidate === "string" && UPLOAD_ID_PATTERN.test(candidate);

  async function ensureStaging(): Promise<void> {
    await mkdir(stagingDir, { recursive: true });
  }

  async function readSession(uploadId: string): Promise<UploadSession | null> {
    if (!isUploadId(uploadId)) return null;
    try {
      const parsed = JSON.parse(await readFile(sessionPath(uploadId), "utf8")) as Partial<UploadSession>;
      if (
        parsed.uploadId !== uploadId ||
        typeof parsed.scopeKey !== "string" ||
        typeof parsed.folder !== "string" ||
        typeof parsed.fileName !== "string" ||
        typeof parsed.sizeBytes !== "number"
      ) {
        return null;
      }
      return {
        uploadId,
        scopeKey: parsed.scopeKey,
        folder: parsed.folder,
        fileName: parsed.fileName,
        sizeBytes: parsed.sizeBytes,
        lastModifiedMs: typeof parsed.lastModifiedMs === "number" ? parsed.lastModifiedMs : 0,
        sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : "",
        createdAtMs: typeof parsed.createdAtMs === "number" ? parsed.createdAtMs : 0,
      };
    } catch {
      return null;
    }
  }

  async function dropSession(uploadId: string): Promise<void> {
    // The session first: a chunk mid-flight then fails its next lookup
    // instead of writing into an orphaned part file.
    await rm(sessionPath(uploadId), { force: true }).catch(() => {});
    await rm(partPath(uploadId), { force: true }).catch(() => {});
  }

  /** The session for this exact file and place; with duplicates, the one with most bytes. */
  async function findByKey(sessionKey: string): Promise<UploadSession | null> {
    let names: string[];
    try {
      names = await readdir(stagingDir);
    } catch {
      return null;
    }
    let best: UploadSession | null = null;
    let bestStaged = -1;
    for (const name of names) {
      const parsed = parseStagingName(name);
      if (parsed === null || parsed.kind !== "session") continue;
      const session = await readSession(parsed.uploadId);
      if (session === null || session.sessionKey !== sessionKey) continue;
      const staged = (await sizeOf(partPath(session.uploadId))) ?? -1;
      if (staged > bestStaged) {
        best = session;
        bestStaged = staged;
      }
    }
    return best;
  }

  async function create(input: CreateInput) {
    // Checked now to fail fast, and again at finish: the folder may be renamed
    // or removed while the bytes are on their way.
    const folderReal = await resolveFolderPath(input.root, input.folder);
    validateName(input.fileName);
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) {
      throw new UploadError("invalid_params", "The file size is not a usable number.");
    }
    const lastModifiedMs = Number.isFinite(input.lastModifiedMs) ? Math.max(0, Math.floor(input.lastModifiedMs)) : 0;
    const sessionKey = sessionKeyOf({
      scopeKey: input.scopeKey,
      folderReal,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      lastModifiedMs,
    });

    await ensureStaging();
    const existing = await findByKey(sessionKey);
    if (existing !== null && !locked.has(existing.uploadId)) {
      const staged = await sizeOf(partPath(existing.uploadId));
      if (staged !== null && staged <= existing.sizeBytes) {
        return { uploadId: existing.uploadId, receivedBytes: staged, chunkSizeBytes: chunkSize, resumed: true };
      }
      // A part file gone or longer than declared: the session is junk.
      await dropSession(existing.uploadId);
    }

    const uploadId = randomBytes(16).toString("hex");
    const session: UploadSession = {
      uploadId,
      scopeKey: input.scopeKey,
      folder: input.folder,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      lastModifiedMs,
      sessionKey,
      createdAtMs: now(),
    };
    try {
      // An empty part file first: every chunk writes with "r+", which needs it.
      await (await open(partPath(uploadId), "w")).close();
      await writeFile(sessionPath(uploadId), `${JSON.stringify(session, null, 2)}\n`, "utf8");
    } catch (error) {
      await dropSession(uploadId);
      throw toMutationError(error, input.fileName);
    }
    return { uploadId, receivedBytes: 0, chunkSizeBytes: chunkSize, resumed: false };
  }

  async function status(uploadId: string) {
    const session = await readSession(uploadId);
    if (session === null) return null;
    const staged = await sizeOf(partPath(uploadId));
    return staged === null ? null : { receivedBytes: staged, sizeBytes: session.sizeBytes };
  }

  /** Nothing in here touches `bb.*`: only raw descriptors live across the stream. */
  async function writeChunk(request: ChunkRequest): Promise<ChunkOutcome> {
    const uploadId = request.uploadId;
    const offset = parseOffset(request.offset);
    if (!isUploadId(uploadId) || offset === null || request.body === null || request.body === undefined) {
      return { status: 400, body: { ok: false, error: "invalid_params" } };
    }
    const session = await readSession(uploadId);
    if (session === null) return { status: 404, body: { ok: false, error: "upload_not_found" } };
    const part = partPath(uploadId);

    if (locked.has(uploadId)) {
      return { status: 409, body: { ok: false, error: "upload_busy", expected: (await sizeOf(part)) ?? 0 } };
    }
    locked.add(uploadId);
    try {
      const current = await sizeOf(part);
      if (current === null) return { status: 404, body: { ok: false, error: "upload_not_found" } };
      if (current !== offset) {
        return { status: 409, body: { ok: false, error: "offset_mismatch", expected: current } };
      }
      const remaining = session.sizeBytes - offset;
      if (remaining < 0) return { status: 413, body: { ok: false, error: "size_mismatch" } };

      const source = Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>);
      const sink = createWriteStream(part, { flags: "r+", start: offset });
      try {
        await pipeline(source, createLimiter(remaining), sink, { signal: request.signal });
      } catch (error) {
        if (error instanceof OverflowError) {
          // A refused chunk must not move the staged size by one byte — or
          // its prefix would count as received and resume past it.
          await closeSink(sink);
          await truncate(part, offset).catch(() => {});
          return { status: 413, body: { ok: false, error: "size_mismatch" } };
        }
        if (isAbortLike(error, request.signal)) {
          // The part file stays: what made it to disk is the resume point.
          return { status: 499, body: { ok: false, error: "aborted", received: (await sizeOf(part)) ?? offset } };
        }
        return { status: 500, body: { ok: false, error: "io_error", message: message(error) } };
      }

      // "received" must survive a power cut: the panel resumes from it.
      const handle = await open(part, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      return { status: 200, body: { ok: true, uploadId, received: (await sizeOf(part)) ?? offset } };
    } catch (error) {
      return { status: 500, body: { ok: false, error: "io_error", message: message(error) } };
    } finally {
      locked.delete(uploadId);
    }
  }

  async function finish(input: { uploadId: string; scopeKey: string; root: string }): Promise<string> {
    const session = await readSession(input.uploadId);
    if (session === null) throw new UploadError("upload_not_found", "This upload is no longer there; start it again.");
    if (session.scopeKey !== input.scopeKey) {
      throw new UploadError("wrong_workspace", "This upload belongs to another workspace.");
    }
    if (locked.has(session.uploadId)) {
      throw new UploadError("upload_busy", "A part of this upload is still arriving.");
    }
    locked.add(session.uploadId);
    try {
      const part = partPath(session.uploadId);
      const staged = await sizeOf(part);
      if (staged === null) throw new UploadError("upload_not_found", "This upload is no longer there; start it again.");
      if (staged !== session.sizeBytes) {
        throw new UploadError(
          "size_mismatch",
          `${session.fileName}: ${staged} of ${session.sizeBytes} bytes arrived.`,
        );
      }
      // The folder is checked again here, against the disk as it is now.
      const placed = await placeFile(input.root, session.folder, session.fileName, part);
      await rm(sessionPath(session.uploadId), { force: true }).catch(() => {});
      return placed;
    } finally {
      locked.delete(session.uploadId);
    }
  }

  async function abort(uploadId: string): Promise<void> {
    if (!isUploadId(uploadId)) return;
    await dropSession(uploadId);
  }

  async function sweep(): Promise<number> {
    let names: string[];
    try {
      names = await readdir(stagingDir);
    } catch {
      return 0;
    }
    const cutoff = now() - ttl;
    // A session owns two files; count it once.
    const seen = new Set<string>();
    let removed = 0;
    for (const name of names) {
      const parsed = parseStagingName(name);
      if (parsed === null) continue;
      const { uploadId } = parsed;
      if (locked.has(uploadId) || seen.has(uploadId)) continue;
      seen.add(uploadId);
      let mtimeMs: number | null = null;
      try {
        mtimeMs = (await stat(partPath(uploadId))).mtimeMs;
      } catch {
        mtimeMs = null;
      }
      if (mtimeMs !== null && mtimeMs >= cutoff) continue;
      // No part file means the session is dead whatever its record says.
      await dropSession(uploadId);
      removed += 1;
    }
    return removed;
  }

  return { create, status, writeChunk, finish, abort, sweep };
}

/** Any error from the module as `{ code, reason }` for an RPC refusal. */
export function uploadRefusal(error: unknown, fileName: string): { code: string; reason: string } {
  if (error instanceof UploadError) return { code: error.code, reason: error.message };
  const mapped = error instanceof MutationError ? error : toMutationError(error, fileName);
  return { code: mapped.code, reason: mapped.message };
}
