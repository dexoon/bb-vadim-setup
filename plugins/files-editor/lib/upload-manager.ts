/**
 * The panel's side of an upload: a queue of files sent in chunks, resumed
 * where the server says it stopped. Free of React, so it outlives the panel
 * tab (BB unmounts it whenever another tab is picked) and is tested with a
 * fake XHR against the real server module.
 *
 * Ported from `file-manager` (MIT, © Foma, github.com/xMinor-1/bb-plugins,
 * plugins/file-manager/lib/upload-manager.ts) and cut down: no pause button or
 * ETA, a destination given as workspace + folder. The reasons stay:
 *  - Node ends a request after 300 s, so a file goes as many bounded chunks,
 *    sized to the measured speed.
 *  - The chunk route is `auth: "token"` (a raw body cannot meet the local
 *    rule's JSON content type); the token is fetched once and refreshed once
 *    on a 401.
 *  - XMLHttpRequest, not fetch: fetch reports no upload progress.
 *  - The server owns the truth about what arrived: every failure re-syncs the
 *    offset from its answer or from `status`, never from a guess.
 */
import { MAX_CHUNK_BYTES, MIN_CHUNK_BYTES, adaptChunkSize, nextChunk } from "./transfer.js";
import type { ScopeRef } from "./route.js";

/** A refusal the server explained, with its code (`upload_not_found`, `exists`…). */
export class UploadRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UploadRefusal";
  }
}

/** The four calls the manager needs; the panel adapts its RPC client to them. */
export interface UploadRpc {
  create(input: {
    scope: ScopeRef;
    folder: string;
    fileName: string;
    sizeBytes: number;
    lastModifiedMs: number;
  }): Promise<{ uploadId: string; receivedBytes: number; chunkSizeBytes: number }>;
  /** null: the server has no such upload any more. */
  status(uploadId: string): Promise<{ receivedBytes: number } | null>;
  /** The placed file's path, relative to the workspace root. */
  finish(scope: ScopeRef, uploadId: string): Promise<string>;
  abort(uploadId: string): Promise<void>;
}

export type UploadStatus = "queued" | "uploading" | "finishing" | "done" | "error" | "canceled";

export interface UploadState {
  id: string;
  /** Which `enqueue` call it came from: one toast per batch. */
  batchId: string;
  fileName: string;
  scope: ScopeRef;
  folder: string;
  sizeBytes: number;
  /** Acknowledged bytes plus the progress of the chunk in flight. */
  sentBytes: number;
  status: UploadStatus;
  errorMessage: string | null;
  /** Where it landed, once finished: `name (1)` when the name was taken. */
  resultPath: string | null;
}

/** What the manager reads of a picked or dropped file — a `File` fits. */
export interface UploadFile {
  name: string;
  size: number;
  lastModified: number;
  slice(start: number, end: number): Blob;
}

export interface UploadRequest {
  file: UploadFile;
  scope: ScopeRef;
  folder: string;
}

export interface UploadManagerOptions {
  rpc: UploadRpc | (() => UploadRpc);
  tokenUrl: string;
  chunkUrl: (uploadId: string, offset: number) => string;
  maxConcurrentFiles?: number;
  /** Network and server-error retries per chunk before the file fails. */
  maxAttempts?: number;
  /** Seconds a chunk should take; drives the chunk size. */
  targetChunkSeconds?: number;
  minChunkBytes?: number;
  maxChunkBytes?: number;
  /** Test seams. */
  createXhr?: () => XMLHttpRequest;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Least gap between progress notifications. */
  progressIntervalMs?: number;
}

class CanceledError extends Error {}
class ChunkAbortedError extends Error {}
class ChunkNetworkError extends Error {}

interface ChunkAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

interface Item {
  state: UploadState;
  file: UploadFile;
  uploadId: string | null;
  /** What the server acknowledged; `state.sentBytes` may run ahead of it. */
  offset: number;
  chunkBytes: number;
  attempt: number;
  busyAttempts: number;
  recreated: boolean;
  tokenRefreshed: boolean;
  canceled: boolean;
  xhr: XMLHttpRequest | null;
  /** Smoothed bytes per second. */
  rate: number;
}

const isTerminal = (status: UploadStatus) => status === "done" || status === "error" || status === "canceled";

function parseJson(text: string | null | undefined): Record<string, unknown> | null {
  if (typeof text !== "string" || text === "") return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function numberField(body: Record<string, unknown> | null, key: string): number | null {
  const value = body?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "The upload failed.";
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter += 1).toString(36)}`;

export class UploadManager {
  private readonly items = new Map<string, Item>();
  private readonly order: string[] = [];
  private readonly queue: string[] = [];
  private readonly running = new Set<string>();
  private readonly listeners = new Set<(state: UploadState[]) => void>();
  private tokenPromise: Promise<string> | null = null;
  private snapshot: UploadState[] = [];
  private dirty = true;
  private lastProgressAt = 0;

  private readonly maxConcurrentFiles: number;
  private readonly maxAttempts: number;
  private readonly targetChunkSeconds: number;
  private readonly bounds: { min: number; max: number };
  private readonly createXhr: () => XMLHttpRequest;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly progressIntervalMs: number;
  private readonly maxBusyAttempts = 10;

  constructor(private readonly options: UploadManagerOptions) {
    this.maxConcurrentFiles = Math.max(1, options.maxConcurrentFiles ?? 2);
    this.maxAttempts = Math.max(0, options.maxAttempts ?? 3);
    this.targetChunkSeconds = options.targetChunkSeconds ?? 30;
    const min = Math.max(1, options.minChunkBytes ?? MIN_CHUNK_BYTES);
    this.bounds = { min, max: Math.max(min, options.maxChunkBytes ?? MAX_CHUNK_BYTES) };
    this.createXhr = options.createXhr ?? (() => new XMLHttpRequest());
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.progressIntervalMs = options.progressIntervalMs ?? 150;
  }

  /** Queues the files as one batch; returns their states. */
  enqueue(requests: readonly UploadRequest[]): UploadState[] {
    const batchId = nextId("batch");
    const created: UploadState[] = [];
    for (const request of requests) {
      const id = nextId("up");
      const item: Item = {
        state: {
          id,
          batchId,
          fileName: request.file.name,
          scope: { kind: request.scope.kind, id: request.scope.id },
          folder: request.folder,
          sizeBytes: request.file.size,
          sentBytes: 0,
          status: "queued",
          errorMessage: null,
          resultPath: null,
        },
        file: request.file,
        uploadId: null,
        offset: 0,
        chunkBytes: this.bounds.min,
        attempt: 0,
        busyAttempts: 0,
        recreated: false,
        tokenRefreshed: false,
        canceled: false,
        xhr: null,
        rate: 0,
      };
      this.items.set(id, item);
      this.order.push(id);
      this.queue.push(id);
      created.push({ ...item.state });
    }
    this.notify(true);
    this.pump();
    return created;
  }

  cancel(id: string): void {
    const item = this.items.get(id);
    if (item === undefined || isTerminal(item.state.status)) return;
    item.canceled = true;
    this.dropFromQueue(id);
    this.abortXhr(item);
    const uploadId = item.uploadId;
    // Canceled means gone: the staged bytes are dropped now rather than at the sweep.
    if (uploadId !== null) void Promise.resolve().then(() => this.rpc().abort(uploadId)).catch(() => {});
    item.state.sentBytes = item.offset;
    this.setStatus(item, "canceled");
  }

  /** A failed upload again, from where the server has it. */
  retry(id: string): void {
    const item = this.items.get(id);
    if (item === undefined || item.state.status !== "error") return;
    item.attempt = 0;
    item.busyAttempts = 0;
    item.recreated = false;
    item.tokenRefreshed = false;
    item.state.errorMessage = null;
    this.setStatus(item, "queued");
    if (!this.queue.includes(id)) this.queue.push(id);
    this.pump();
  }

  /** Drops finished, failed and canceled rows. */
  clearFinished(): void {
    for (const id of [...this.order]) {
      const item = this.items.get(id);
      if (item === undefined || !isTerminal(item.state.status)) continue;
      this.items.delete(id);
      this.order.splice(this.order.indexOf(id), 1);
    }
    this.notify(true);
  }

  subscribe = (listener: (state: UploadState[]) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** A stable snapshot, rebuilt only when something changed. */
  getState = (): UploadState[] => {
    if (this.dirty) {
      this.snapshot = this.order
        .map((id) => this.items.get(id))
        .filter((item): item is Item => item !== undefined)
        .map((item) => ({ ...item.state }));
      this.dirty = false;
    }
    return this.snapshot;
  };

  // --- plumbing ---------------------------------------------------------

  private rpc(): UploadRpc {
    return typeof this.options.rpc === "function" ? this.options.rpc() : this.options.rpc;
  }

  private dropFromQueue(id: string): void {
    const index = this.queue.indexOf(id);
    if (index !== -1) this.queue.splice(index, 1);
  }

  private abortXhr(item: Item): void {
    const xhr = item.xhr;
    item.xhr = null;
    try {
      xhr?.abort();
    } catch {
      // An xhr that already finished may refuse; the loop exits anyway.
    }
  }

  private pump(): void {
    while (this.running.size < this.maxConcurrentFiles && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const item = this.items.get(id);
      if (item === undefined || item.state.status !== "queued") continue;
      this.running.add(id);
      void this.run(item).finally(() => {
        this.running.delete(id);
        this.pump();
      });
    }
  }

  private setStatus(item: Item, status: UploadStatus): void {
    // Canceled stays canceled; only a fresh enqueue sends the file again.
    if (item.canceled && status !== "canceled") return;
    item.state.status = status;
    this.notify(true);
  }

  private notify(immediate: boolean): void {
    this.dirty = true;
    if (!immediate) {
      const now = this.now();
      if (now - this.lastProgressAt < this.progressIntervalMs) return;
      this.lastProgressAt = now;
    }
    const state = this.getState();
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch {
        // A throwing subscriber must not stop the queue.
      }
    }
  }

  private token(force = false): Promise<string> {
    if (force) this.tokenPromise = null;
    this.tokenPromise ??= (async () => {
      const response = await this.fetchImpl(this.options.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const json: unknown = await response.json().catch(() => null);
      const token = (json as { token?: unknown } | null)?.token;
      if (!response.ok || typeof token !== "string" || token === "") {
        throw new Error(`BB did not hand out the upload token (HTTP ${response.status}).`);
      }
      return token;
    })();
    // A failure is not cached: the next chunk asks again.
    this.tokenPromise.catch(() => {
      this.tokenPromise = null;
    });
    return this.tokenPromise;
  }

  // --- one file ---------------------------------------------------------

  private async run(item: Item): Promise<void> {
    try {
      if (item.canceled) throw new CanceledError();
      this.setStatus(item, "uploading");
      await this.ensureSession(item);
      while (item.offset < item.state.sizeBytes) {
        if (item.canceled) throw new CanceledError();
        await this.sendOneChunk(item);
      }
      if (item.canceled) throw new CanceledError();
      this.setStatus(item, "finishing");
      if (item.uploadId === null) throw new Error("The upload session disappeared.");
      item.state.resultPath = await this.rpc().finish(item.state.scope, item.uploadId);
      item.state.sentBytes = item.state.sizeBytes;
      this.setStatus(item, "done");
    } catch (error) {
      item.xhr = null;
      if (item.canceled || error instanceof CanceledError) {
        // Canceled while its session was being opened: drop that one too.
        const uploadId = item.uploadId;
        if (uploadId !== null) await this.rpc().abort(uploadId).catch(() => {});
        item.state.sentBytes = item.offset;
        this.setStatus(item, "canceled");
        return;
      }
      item.state.errorMessage = errorText(error);
      item.state.sentBytes = item.offset;
      this.setStatus(item, "error");
    }
  }

  /** Opens the session — or resumes the one the server kept for this same file. */
  private async ensureSession(item: Item): Promise<void> {
    if (item.uploadId !== null) return;
    const lastModified = Number(item.file.lastModified);
    const created = await this.rpc().create({
      scope: item.state.scope,
      folder: item.state.folder,
      fileName: item.state.fileName,
      sizeBytes: item.state.sizeBytes,
      lastModifiedMs: Number.isFinite(lastModified) ? Math.max(0, Math.floor(lastModified)) : 0,
    });
    item.uploadId = created.uploadId;
    item.offset = Math.min(Math.max(0, created.receivedBytes), item.state.sizeBytes);
    item.state.sentBytes = item.offset;
    item.chunkBytes = Math.min(this.bounds.max, Math.max(this.bounds.min, created.chunkSizeBytes));
    this.notify(true);
  }

  private async sendOneChunk(item: Item): Promise<void> {
    const { start, end } = nextChunk(item.offset, item.chunkBytes, item.state.sizeBytes);
    const startedAt = this.now();
    let answer: ChunkAnswer;
    try {
      const token = await this.token();
      if (item.canceled) throw new CanceledError();
      answer = await this.sendChunk(item, token, item.file.slice(start, end));
    } catch (error) {
      if (error instanceof CanceledError || error instanceof ChunkAbortedError || item.canceled) {
        throw new CanceledError();
      }
      // A dropped socket or the token route down: wait, ask the server where
      // it stands, and go on from there.
      await this.backoffAndResync(item, error);
      return;
    } finally {
      item.xhr = null;
    }

    const { status, body } = answer;
    if (status === 200) {
      const received = numberField(body, "received");
      item.offset = received === null ? end : Math.min(Math.max(0, received), item.state.sizeBytes);
      item.state.sentBytes = item.offset;
      item.attempt = 0;
      item.busyAttempts = 0;
      item.tokenRefreshed = false;
      const elapsed = this.now() - startedAt;
      if (elapsed > 0 && end > start) {
        const observed = ((end - start) / elapsed) * 1000;
        item.rate = item.rate === 0 ? observed : item.rate * 0.6 + observed * 0.4;
        item.chunkBytes = adaptChunkSize(item.rate, this.targetChunkSeconds, this.bounds);
      }
      this.notify(true);
      return;
    }
    if (status === 401) {
      // The token can be rotated under a running upload: refresh once.
      if (item.tokenRefreshed) throw new Error("BB refused the upload token. Reopen the panel and try again.");
      item.tokenRefreshed = true;
      await this.token(true);
      return;
    }
    if (status === 409) {
      const expected = numberField(body, "expected");
      if (expected !== null) {
        item.offset = Math.min(Math.max(0, expected), item.state.sizeBytes);
        item.state.sentBytes = item.offset;
      }
      if (body?.error === "upload_busy") {
        item.busyAttempts += 1;
        if (item.busyAttempts > this.maxBusyAttempts) throw new Error("Another part of this upload never finished.");
        await this.sleep(500);
      }
      // offset_mismatch is a re-sync, not a failure.
      return;
    }
    if (status === 404) {
      // Expired, swept or aborted: one fresh session, from the start.
      if (item.recreated) throw new Error("The upload session expired on the server.");
      item.recreated = true;
      item.uploadId = null;
      item.offset = 0;
      item.state.sentBytes = 0;
      await this.ensureSession(item);
      return;
    }
    if (status === 413) throw new Error("The file changed while it was uploading.");
    if (status === 400) throw new Error("The server refused the upload request.");
    if (status === 499) {
      const received = numberField(body, "received");
      if (received !== null) {
        item.offset = Math.min(Math.max(0, received), item.state.sizeBytes);
        item.state.sentBytes = item.offset;
      }
    }
    const reason = typeof body?.message === "string" ? body.message : `The upload failed (HTTP ${status}).`;
    await this.backoffAndResync(item, new Error(reason));
  }

  private sendChunk(item: Item, token: string, blob: Blob): Promise<ChunkAnswer> {
    const base = item.offset;
    const chunkBytes = blob.size;
    return new Promise<ChunkAnswer>((resolve, reject) => {
      const xhr = this.createXhr();
      item.xhr = xhr;
      xhr.open("POST", this.options.chunkUrl(item.uploadId ?? "", base), true);
      xhr.setRequestHeader("x-bb-plugin-token", token);
      xhr.setRequestHeader("content-type", "application/octet-stream");
      const upload = xhr.upload as XMLHttpRequestUpload | undefined | null;
      if (upload !== undefined && upload !== null) {
        upload.onprogress = (event: ProgressEvent) => {
          const loaded = Math.min(Math.max(0, event.loaded), chunkBytes);
          item.state.sentBytes = Math.min(base + loaded, item.state.sizeBytes);
          this.notify(false);
        };
      }
      xhr.onload = () => resolve({ status: xhr.status, body: parseJson(xhr.responseText) });
      xhr.onerror = () => reject(new ChunkNetworkError("The connection dropped."));
      xhr.ontimeout = () => reject(new ChunkNetworkError("The request timed out."));
      xhr.onabort = () => reject(new ChunkAbortedError());
      xhr.send(blob);
    });
  }

  /** 1 s, 3 s, 9 s, then give up; each time re-read the server's offset. */
  private async backoffAndResync(item: Item, error: unknown): Promise<void> {
    item.attempt += 1;
    if (item.attempt > this.maxAttempts) throw error instanceof Error ? error : new Error(String(error));
    item.state.sentBytes = item.offset;
    this.notify(true);
    await this.sleep(1000 * 3 ** (item.attempt - 1));
    if (item.canceled) throw new CanceledError();
    const uploadId = item.uploadId;
    if (uploadId === null) return;
    try {
      const status = await this.rpc().status(uploadId);
      if (status === null) {
        item.uploadId = null;
        item.offset = 0;
        item.state.sentBytes = 0;
        await this.ensureSession(item);
      } else {
        item.offset = Math.min(Math.max(0, status.receivedBytes), item.state.sizeBytes);
        item.state.sentBytes = item.offset;
      }
    } catch {
      // Keep the local offset: the next chunk either lands or comes back 409
      // with the server's own number.
    }
    this.notify(true);
  }
}

/** One line for a batch's toast: how many, how far. */
export function batchSummary(states: readonly UploadState[]): {
  total: number;
  done: number;
  failed: number;
  canceled: number;
  active: number;
  sentBytes: number;
  sizeBytes: number;
} {
  let done = 0;
  let failed = 0;
  let canceled = 0;
  let sentBytes = 0;
  let sizeBytes = 0;
  for (const state of states) {
    if (state.status === "done") done += 1;
    else if (state.status === "error") failed += 1;
    else if (state.status === "canceled") canceled += 1;
    if (state.status !== "canceled") {
      sentBytes += state.sentBytes;
      sizeBytes += state.sizeBytes;
    }
  }
  return {
    total: states.length,
    done,
    failed,
    canceled,
    active: states.length - done - failed - canceled,
    sentBytes,
    sizeBytes,
  };
}
