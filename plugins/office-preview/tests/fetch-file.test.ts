// Where the opened file is read from: every source BB hands an opener resolves
// to a host and an absolute path for `sdk.files`. Runs against a fake SDK.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginBrowserBbSdk, PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";
import { FileTooLargeError, locateFile, readFileBytes } from "../src/fetch-file.ts";

const environments = [
  { id: "env_wt", hostId: "host_a", path: "/work/repo-wt", isWorktree: true },
  { id: "env_main", hostId: "host_a", path: "/work/repo/", isWorktree: false },
];

function fakeSdk(read: (args: { hostId?: string; path: string }) => unknown = () => ({})): PluginBrowserBbSdk {
  return {
    threads: {
      get: async () => ({ environmentId: "env_main" }),
      storageLocation: async ({ threadId }: { threadId: string }) => ({
        hostId: "host_s",
        storageRootPath: `/data/thread-storage/${threadId}`,
      }),
    },
    environments: {
      get: async ({ environmentId }: { environmentId: string }) => environments.find((e) => e.id === environmentId),
      list: async () => environments,
    },
    files: { read: async (args: { hostId?: string; path: string }) => read(args) },
  } as unknown as PluginBrowserBbSdk;
}

const source = (overrides: Partial<PluginFileOpenerSource>): PluginFileOpenerSource => ({
  kind: "workspace",
  threadId: null,
  environmentId: null,
  projectId: null,
  ...overrides,
});
const signal = new AbortController().signal;

test("a workspace file opened in a thread is read from that thread's checkout", async () => {
  const file = await locateFile(fakeSdk(), "out/report.xlsx", source({ threadId: "thr_1" }), signal);
  assert.deepEqual(file, { hostId: "host_a", path: "/work/repo/out/report.xlsx" });
});

test("a project file opened without a thread is read from the project's own checkout", async () => {
  const file = await locateFile(fakeSdk(), "a.docx", source({ projectId: "proj_1" }), signal);
  assert.equal(file?.path, "/work/repo/a.docx");
});

test("a host file keeps its absolute path, on the thread's host", async () => {
  const path = "/Users/me/other-repo/deck.pptx";
  const file = await locateFile(fakeSdk(), path, source({ kind: "host", threadId: "thr_1" }), signal);
  assert.deepEqual(file, { hostId: "host_a", path });
});

test("a thread-storage file is read under the thread's storage root", async () => {
  const file = await locateFile(fakeSdk(), "t.xlsx", source({ kind: "thread-storage", threadId: "thr_9" }), signal);
  assert.deepEqual(file, { hostId: "host_s", path: "/data/thread-storage/thr_9/t.xlsx" });
});

test("a source BB left incomplete has no location", async () => {
  assert.equal(await locateFile(fakeSdk(), "x.xlsx", source({ kind: "thread-storage" }), signal), null);
  assert.equal(await locateFile(fakeSdk(), "x.xlsx", source({ kind: "host" }), signal), null);
  assert.equal(await locateFile(fakeSdk(), "x.xlsx", source({}), signal), null);
});

test("returns the file's bytes for both encodings sdk.files uses", async () => {
  const file = { hostId: "host_a", path: "/work/repo/a.csv" };
  const binary = fakeSdk(() => ({ content: Buffer.from([0x50, 0x4b, 3, 4]).toString("base64"), contentEncoding: "base64" }));
  assert.deepEqual([...(await readFileBytes(binary, file, signal))], [0x50, 0x4b, 3, 4]);
  const text = fakeSdk(() => ({ content: "a;б\n", contentEncoding: "utf8" }));
  assert.equal(new TextDecoder().decode(await readFileBytes(text, file, signal)), "a;б\n");
});

test("BB's 413 becomes FileTooLargeError; other errors pass through", async () => {
  const file = { hostId: "host_a", path: "/big.xlsx" };
  const tooLarge = fakeSdk(() => {
    throw Object.assign(new Error("HTTP 413"), { status: 413, code: "file_too_large" });
  });
  await assert.rejects(readFileBytes(tooLarge, file, signal), FileTooLargeError);
  const missing = fakeSdk(() => {
    throw Object.assign(new Error("HTTP 404"), { status: 404, code: "ENOENT" });
  });
  await assert.rejects(readFileBytes(missing, file, signal), /HTTP 404/);
});
