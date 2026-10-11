import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UploadManager, batchSummary, type UploadRpc, type UploadState } from "./upload-manager.js";
import { createUploads, type Uploads } from "./uploads.js";
import type { ScopeRef } from "./route.js";

const HOME: ScopeRef = { kind: "home", id: "local" };
const CONTENT = "The quick brown fox jumps over the lazy dog";

let base: string;
let root: string;
let server: Uploads;

beforeEach(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), "files-editor-upload-manager-")));
  root = path.join(base, "home");
  await mkdir(path.join(root, "Downloads"), { recursive: true });
  server = createUploads({ stagingDir: path.join(base, "staging") });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** The RPC side, straight into the server module. */
function rpcFor(uploads: Uploads): UploadRpc {
  const scopeKey = (scope: ScopeRef) => `${scope.kind}:${scope.id}`;
  return {
    create: (input) =>
      uploads.create({
        scopeKey: scopeKey(input.scope),
        root,
        folder: input.folder,
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        lastModifiedMs: input.lastModifiedMs,
      }),
    status: async (uploadId) => {
      const status = await uploads.status(uploadId);
      return status === null ? null : { receivedBytes: status.receivedBytes };
    },
    finish: (scope, uploadId) => uploads.finish({ uploadId, scopeKey: scopeKey(scope), root }),
    abort: (uploadId) => uploads.abort(uploadId),
  };
}

type Fault = "drop-before" | "cut-mid" | "unauthorized" | null;

/**
 * An XMLHttpRequest that hands its body to the server module's chunk route.
 * `fault(n)` decides what happens to the n-th request: lost before it reached
 * the server, cut off half-way, or turned away for a stale token.
 */
function fakeXhrFactory(uploads: Uploads, fault: (index: number) => Fault, log: { offsets: number[] }) {
  let index = 0;
  return () => {
    const xhr = {
      status: 0,
      responseText: "",
      upload: { onprogress: null as ((event: ProgressEvent) => void) | null },
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      ontimeout: null as (() => void) | null,
      onabort: null as (() => void) | null,
      url: "",
      headers: new Map<string, string>(),
      open(_method: string, url: string) {
        xhr.url = url;
      },
      setRequestHeader(name: string, value: string) {
        xhr.headers.set(name, value);
      },
      abort() {
        xhr.onabort?.();
      },
      send(blob: Blob) {
        const current = (index += 1);
        const query = new URL(xhr.url, "http://bb.local").searchParams;
        const offset = Number(query.get("offset"));
        log.offsets.push(offset);
        void (async () => {
          const what = fault(current);
          if (what === "drop-before") {
            xhr.onerror?.();
            return;
          }
          // BB's token check, before the plugin's handler ever runs.
          if (what === "unauthorized" || xhr.headers.get("x-bb-plugin-token") !== "token-2") {
            xhr.status = 401;
            xhr.responseText = "";
            xhr.onload?.();
            return;
          }
          let bodyStream: ReadableStream<Uint8Array> = blob.stream();
          const controller = new AbortController();
          if (what === "cut-mid") {
            const half = new Uint8Array(await blob.slice(0, Math.max(1, Math.floor(blob.size / 2))).arrayBuffer());
            let sent = false;
            bodyStream = new ReadableStream<Uint8Array>({
              pull(stream) {
                if (!sent) {
                  sent = true;
                  stream.enqueue(half);
                  return;
                }
                controller.abort();
                stream.error(new Error("connection reset"));
              },
            });
          }
          const outcome = await uploads.writeChunk({
            uploadId: query.get("uploadId"),
            offset: query.get("offset"),
            body: bodyStream,
            signal: controller.signal,
          });
          xhr.upload.onprogress?.({ loaded: blob.size } as ProgressEvent);
          xhr.status = outcome.status;
          xhr.responseText = JSON.stringify(outcome.body);
          xhr.onload?.();
        })();
      },
    };
    return xhr as unknown as XMLHttpRequest;
  };
}

function manager(options: {
  fault?: (index: number) => Fault;
  log?: { offsets: number[] };
  maxAttempts?: number;
  tokens?: string[];
}) {
  const tokens = [...(options.tokens ?? ["token-2"])];
  return new UploadManager({
    rpc: rpcFor(server),
    tokenUrl: "/api/v1/plugins/files-editor/token",
    chunkUrl: (uploadId, offset) => `/api/v1/plugins/files-editor/http/upload/chunk?uploadId=${uploadId}&offset=${offset}`,
    createXhr: fakeXhrFactory(server, options.fault ?? (() => null), options.log ?? { offsets: [] }),
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, token: tokens.shift() ?? "token-2" }), { status: 200 }),
    sleep: async () => {},
    minChunkBytes: 8,
    maxChunkBytes: 8,
    maxAttempts: options.maxAttempts ?? 3,
  });
}

function settled(target: UploadManager): Promise<UploadState[]> {
  return new Promise((resolve) => {
    const check = (states: UploadState[]) => {
      if (states.length > 0 && states.every((state) => ["done", "error", "canceled"].includes(state.status))) {
        unsubscribe();
        resolve(states);
      }
    };
    const unsubscribe = target.subscribe(check);
    check(target.getState());
  });
}

const fileOf = (text: string, name = "fox.txt") => new File([text], name, { lastModified: 1_700_000_000_000 });

describe("UploadManager", () => {
  it("sends a file in chunks and places it", async () => {
    const log = { offsets: [] as number[] };
    const uploads = manager({ log });
    uploads.enqueue([{ file: fileOf(CONTENT), scope: HOME, folder: "Downloads" }]);
    const [state] = await settled(uploads);
    expect(state).toMatchObject({ status: "done", resultPath: "Downloads/fox.txt", sentBytes: CONTENT.length });
    expect(log.offsets).toEqual([0, 8, 16, 24, 32, 40]);
    expect(await readFile(path.join(root, "Downloads", "fox.txt"), "utf8")).toBe(CONTENT);
  });

  it("goes on after a lost chunk and after one cut off half-way", async () => {
    const log = { offsets: [] as number[] };
    const uploads = manager({
      log,
      fault: (index) => (index === 2 ? "drop-before" : index === 4 ? "cut-mid" : null),
    });
    uploads.enqueue([{ file: fileOf(CONTENT), scope: HOME, folder: "Downloads" }]);
    const [state] = await settled(uploads);
    expect(state?.status).toBe("done");
    expect(await readFile(path.join(root, "Downloads", "fox.txt"), "utf8")).toBe(CONTENT);
    // The lost chunk was sent again from the same offset.
    expect(log.offsets.filter((offset) => offset === 8).length).toBeGreaterThanOrEqual(2);
  });

  it("resumes in a new session (a reopened panel) from what the server kept", async () => {
    // First attempt: every request after the first is lost, and retries run out.
    const first = manager({ fault: (index) => (index > 1 ? "drop-before" : null), maxAttempts: 0 });
    first.enqueue([{ file: fileOf(CONTENT), scope: HOME, folder: "Downloads" }]);
    const [failed] = await settled(first);
    expect(failed?.status).toBe("error");

    const log = { offsets: [] as number[] };
    const second = manager({ log });
    second.enqueue([{ file: fileOf(CONTENT), scope: HOME, folder: "Downloads" }]);
    const [state] = await settled(second);
    expect(state?.status).toBe("done");
    // Picked up at byte 8, not from zero.
    expect(log.offsets[0]).toBe(8);
    expect(await readFile(path.join(root, "Downloads", "fox.txt"), "utf8")).toBe(CONTENT);
  });

  it("asks for a new token once when the old one is refused", async () => {
    const uploads = manager({ tokens: ["stale", "token-2"] });
    uploads.enqueue([{ file: fileOf("short"), scope: HOME, folder: "Downloads" }]);
    const [state] = await settled(uploads);
    expect(state?.status).toBe("done");
  });

  it("does not overwrite: a second copy lands as name (1)", async () => {
    const uploads = manager({});
    uploads.enqueue([{ file: fileOf("one"), scope: HOME, folder: "Downloads" }]);
    await settled(uploads);
    uploads.clearFinished();
    uploads.enqueue([{ file: fileOf("two!"), scope: HOME, folder: "Downloads" }]);
    const [state] = await settled(uploads);
    expect(state?.resultPath).toBe("Downloads/fox (1).txt");
    expect(await readFile(path.join(root, "Downloads", "fox.txt"), "utf8")).toBe("one");
  });

  it("reports a refusal, and a retry after it is fixed goes through", async () => {
    const uploads = manager({});
    uploads.enqueue([{ file: fileOf("x"), scope: HOME, folder: "Missing" }]);
    const [state] = await settled(uploads);
    expect(state?.status).toBe("error");
    expect(state?.errorMessage).toMatch(/Missing/u);
    await mkdir(path.join(root, "Missing"));
    uploads.retry(state!.id);
    const [again] = await settled(uploads);
    expect(again?.status).toBe("done");
  });

  it("cancels and drops the staged bytes", async () => {
    const uploads = manager({ fault: () => "drop-before", maxAttempts: 5 });
    const [queued] = uploads.enqueue([{ file: fileOf(CONTENT), scope: HOME, folder: "Downloads" }]);
    uploads.cancel(queued!.id);
    const [state] = await settled(uploads);
    expect(state?.status).toBe("canceled");
    // The session being opened as the cancel came is dropped once it exists.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await readdir(path.join(base, "staging")).catch(() => [])).toEqual([]);
  });
});

describe("batchSummary", () => {
  it("adds up a batch, leaving canceled files out of the bytes", () => {
    const state = (status: UploadState["status"], sent: number, size: number): UploadState => ({
      id: status,
      batchId: "b",
      fileName: "f",
      scope: HOME,
      folder: "",
      sizeBytes: size,
      sentBytes: sent,
      status,
      errorMessage: null,
      resultPath: null,
    });
    expect(
      batchSummary([state("done", 10, 10), state("uploading", 5, 20), state("canceled", 1, 100), state("error", 0, 4)]),
    ).toEqual({ total: 4, done: 1, failed: 1, canceled: 1, active: 1, sentBytes: 15, sizeBytes: 34 });
  });
});
