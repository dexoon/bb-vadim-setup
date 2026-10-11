import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploads, parseOffset, uploadRefusal, type Uploads } from "./uploads.js";

let base: string;
let root: string;
let staging: string;
let uploads: Uploads;
const SCOPE = "home:local";

/** A request body as BB hands it over: a web stream. */
function body(text: string): ReadableStream<Uint8Array> {
  return new Blob([text]).stream();
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), "files-editor-uploads-")));
  root = path.join(base, "home");
  staging = path.join(base, "staging");
  await mkdir(path.join(root, "Downloads"), { recursive: true });
  await mkdir(path.join(base, "outside"));
  uploads = createUploads({ stagingDir: staging });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const create = (overrides: Partial<Parameters<Uploads["create"]>[0]> = {}) =>
  uploads.create({
    scopeKey: SCOPE,
    root,
    folder: "Downloads",
    fileName: "photo.jpg",
    sizeBytes: 10,
    lastModifiedMs: 1_700_000_000_000,
    ...overrides,
  });

describe("chunked upload", () => {
  it("stages chunks in a .part file and places the file when every byte is there", async () => {
    const session = await create();
    expect(session.resumed).toBe(false);
    expect(session.receivedBytes).toBe(0);
    expect(await readdir(staging)).toEqual(
      expect.arrayContaining([`${session.uploadId}.part`, `${session.uploadId}.json`]),
    );

    const first = await uploads.writeChunk({ uploadId: session.uploadId, offset: "0", body: body("01234") });
    expect(first).toEqual({ status: 200, body: { ok: true, uploadId: session.uploadId, received: 5 } });
    const second = await uploads.writeChunk({ uploadId: session.uploadId, offset: 5, body: body("56789") });
    expect(second.status).toBe(200);

    expect(await uploads.finish({ uploadId: session.uploadId, scopeKey: SCOPE, root })).toBe("Downloads/photo.jpg");
    expect(await readFile(path.join(root, "Downloads", "photo.jpg"), "utf8")).toBe("0123456789");
    // Nothing left behind once it is placed.
    expect(await readdir(staging)).toEqual([]);
  });

  it("resumes the same file in the same folder from what already arrived", async () => {
    const session = await create();
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body("0123") });
    const again = await create();
    expect(again).toMatchObject({ uploadId: session.uploadId, receivedBytes: 4, resumed: true });
    // Another size or time is another file: a fresh session.
    expect((await create({ sizeBytes: 11 })).uploadId).not.toBe(session.uploadId);
    expect((await create({ folder: "" })).uploadId).not.toBe(session.uploadId);
  });

  it("re-syncs a client whose offset is off, without writing", async () => {
    const session = await create();
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body("0123") });
    const outcome = await uploads.writeChunk({ uploadId: session.uploadId, offset: 2, body: body("xx") });
    expect(outcome).toEqual({ status: 409, body: { ok: false, error: "offset_mismatch", expected: 4 } });
    expect(await uploads.status(session.uploadId)).toEqual({ receivedBytes: 4, sizeBytes: 10 });
  });

  it("refuses a chunk past the declared size and keeps the staged size as it was", async () => {
    const session = await create({ sizeBytes: 4 });
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body("01") });
    const outcome = await uploads.writeChunk({ uploadId: session.uploadId, offset: 2, body: body("2345") });
    expect(outcome).toEqual({ status: 413, body: { ok: false, error: "size_mismatch" } });
    expect((await uploads.status(session.uploadId))?.receivedBytes).toBe(2);
  });

  it("keeps the bytes of a chunk cut off mid-way as the resume point", async () => {
    const session = await create();
    const controller = new AbortController();
    let sent = false;
    const cut = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (!sent) {
          sent = true;
          stream.enqueue(new TextEncoder().encode("012"));
          return;
        }
        controller.abort();
        stream.error(new Error("connection reset"));
      },
    });
    const outcome = await uploads.writeChunk({
      uploadId: session.uploadId,
      offset: 0,
      body: cut,
      signal: controller.signal,
    });
    expect(outcome.status).toBe(499);
    const received = (await uploads.status(session.uploadId))?.receivedBytes ?? -1;
    expect(received).toBeGreaterThanOrEqual(0);
    expect(received).toBeLessThanOrEqual(3);
    // The rest goes on from there and the file comes out whole.
    await uploads.writeChunk({ uploadId: session.uploadId, offset: received, body: body("0123456789".slice(received)) });
    await uploads.finish({ uploadId: session.uploadId, scopeKey: SCOPE, root });
    expect(await readFile(path.join(root, "Downloads", "photo.jpg"), "utf8")).toBe("0123456789");
  });

  it("answers bad requests and unknown uploads", async () => {
    expect((await uploads.writeChunk({ uploadId: "nope", offset: 0, body: body("x") })).status).toBe(400);
    expect((await uploads.writeChunk({ uploadId: "a".repeat(32), offset: -1, body: body("x") })).status).toBe(400);
    expect((await uploads.writeChunk({ uploadId: "a".repeat(32), offset: 0, body: body("x") })).status).toBe(404);
    expect(await uploads.status("a".repeat(32))).toBeNull();
    expect(parseOffset("12")).toBe(12);
    expect(parseOffset("1e3")).toBeNull();
    expect(parseOffset(" ")).toBeNull();
  });
});

describe("placing the file", () => {
  async function upload(text: string, fileName = "photo.jpg", folder = "Downloads"): Promise<string> {
    const session = await create({ fileName, folder, sizeBytes: text.length });
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body(text) });
    return uploads.finish({ uploadId: session.uploadId, scopeKey: SCOPE, root });
  }

  it("never writes over a name that is taken: name (1), name (2)", async () => {
    await writeFile(path.join(root, "Downloads", "photo.jpg"), "original");
    expect(await upload("first")).toBe("Downloads/photo (1).jpg");
    expect(await upload("second")).toBe("Downloads/photo (2).jpg");
    expect(await readFile(path.join(root, "Downloads", "photo.jpg"), "utf8")).toBe("original");
  });

  it("refuses to finish an upload that is not complete", async () => {
    const session = await create();
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body("012") });
    await expect(uploads.finish({ uploadId: session.uploadId, scopeKey: SCOPE, root })).rejects.toMatchObject({
      code: "size_mismatch",
    });
  });

  it("refuses to finish into another workspace", async () => {
    const session = await create({ sizeBytes: 1 });
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body("x") });
    await expect(
      uploads.finish({ uploadId: session.uploadId, scopeKey: "thread:other", root }),
    ).rejects.toMatchObject({ code: "wrong_workspace" });
  });

  it("refuses a folder or a name that leads outside the root", async () => {
    await symlink(path.join(base, "outside"), path.join(root, "escape"));
    await expect(create({ folder: "escape" })).rejects.toMatchObject({ code: "outside" });
    await expect(create({ folder: "../outside" })).rejects.toMatchObject({ code: "outside" });
    await expect(create({ fileName: "../x" })).rejects.toMatchObject({ code: "invalid_name" });
    await expect(create({ fileName: "" })).rejects.toMatchObject({ code: "invalid_name" });
  });

  it("checks the folder again at finish: one swapped for a link out is refused", async () => {
    const session = await create({ sizeBytes: 1 });
    await uploads.writeChunk({ uploadId: session.uploadId, offset: 0, body: body("x") });
    await rm(path.join(root, "Downloads"), { recursive: true });
    await symlink(path.join(base, "outside"), path.join(root, "Downloads"));
    await expect(uploads.finish({ uploadId: session.uploadId, scopeKey: SCOPE, root })).rejects.toMatchObject({
      code: "outside",
    });
    expect(await readdir(path.join(base, "outside"))).toEqual([]);
  });

  it("turns any error into a refusal the panel can show", () => {
    expect(uploadRefusal(Object.assign(new Error("gone"), { code: "ENOENT" }), "a.txt").code).toBe("not_found");
  });
});

describe("cleanup", () => {
  it("drops an aborted upload at once", async () => {
    const session = await create();
    await uploads.abort(session.uploadId);
    expect(await readdir(staging)).toEqual([]);
  });

  it("sweeps uploads left for longer than a day, and keeps fresh ones", async () => {
    const stale = await create({ fileName: "old.bin" });
    const fresh = await create({ fileName: "new.bin" });
    const dayAndAHourAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(path.join(staging, `${stale.uploadId}.part`), dayAndAHourAgo, dayAndAHourAgo);
    // A record whose part file is gone is dead too; foreign files are left alone.
    await writeFile(path.join(staging, `${"b".repeat(32)}.json`), "{}");
    await writeFile(path.join(staging, "notes.txt"), "keep");
    expect(await uploads.sweep()).toBe(2);
    expect((await readdir(staging)).sort()).toEqual(
      [`${fresh.uploadId}.json`, `${fresh.uploadId}.part`, "notes.txt"].sort(),
    );
  });
});
