import { describe, expect, it } from "vitest";
import {
  adaptChunkSize,
  contentDisposition,
  downloadUrl,
  etagFor,
  nextChunk,
  parseRange,
  parseStagingName,
  partFileName,
  pluginTokenUrl,
  sessionFileName,
  uploadChunkUrl,
} from "./transfer.js";

const ID = "0123456789abcdef0123456789abcdef";

describe("parseRange", () => {
  it("reads a plain, an open-ended and a suffix range", () => {
    expect(parseRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=-30", 10)).toEqual({ start: 0, end: 9 });
  });

  it("clamps an end past the file", () => {
    expect(parseRange("bytes=8-100", 10)).toEqual({ start: 8, end: 9 });
  });

  it("answers the whole file for no range, several ranges or garbage", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=0-1,4-5", 10)).toBeNull();
    expect(parseRange("items=0-1", 10)).toBeNull();
    expect(parseRange("bytes=-", 10)).toBeNull();
  });

  it("refuses what cannot be served", () => {
    expect(parseRange("bytes=10-", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=-5", 0)).toBe("unsatisfiable");
  });
});

describe("contentDisposition", () => {
  it("keeps the real name in filename* and an ASCII one beside it", () => {
    expect(contentDisposition("Отчёт 2026.pdf")).toBe(
      `attachment; filename="2026.pdf"; filename*=UTF-8''${encodeURIComponent("Отчёт 2026.pdf")}`,
    );
  });

  it("cannot be broken out of by quotes, backslashes or line breaks", () => {
    const header = contentDisposition('a"b\\c\r\nX-Evil: 1.txt', "inline");
    expect(header.startsWith('inline; filename="abcX-Evil: 1.txt"')).toBe(true);
    expect(header).not.toMatch(/[\r\n]/u);
  });

  it("falls back to a neutral name", () => {
    expect(contentDisposition("файл")).toContain('filename="download"');
  });
});

describe("URLs and names", () => {
  it("builds the plugin's routes", () => {
    expect(pluginTokenUrl("files-editor")).toBe("/api/v1/plugins/files-editor/token");
    expect(uploadChunkUrl("files-editor", ID, 42)).toBe(
      `/api/v1/plugins/files-editor/http/upload/chunk?uploadId=${ID}&offset=42`,
    );
    const url = new URL(downloadUrl("files-editor", { kind: "home", id: "local" }, "Downloads/a b&c.pdf"), "http://x");
    expect(url.pathname).toBe("/api/v1/plugins/files-editor/http/download");
    expect(url.searchParams.get("kind")).toBe("home");
    expect(url.searchParams.get("path")).toBe("Downloads/a b&c.pdf");
  });

  it("names the staging files and recognises only its own", () => {
    expect(partFileName(ID)).toBe(`${ID}.part`);
    expect(sessionFileName(ID)).toBe(`${ID}.json`);
    expect(parseStagingName(`${ID}.part`)).toEqual({ uploadId: ID, kind: "part" });
    expect(parseStagingName(`${ID}.json`)).toEqual({ uploadId: ID, kind: "session" });
    expect(parseStagingName("../x.part")).toBeNull();
    expect(parseStagingName(`${ID}.part.bak`)).toBeNull();
    expect(parseStagingName(".DS_Store")).toBeNull();
  });

  it("tags a file by size and time", () => {
    expect(etagFor(255, 4096.7)).toBe('"ff-1000"');
  });
});

describe("chunks", () => {
  it("takes the next chunk from the acknowledged offset", () => {
    expect(nextChunk(0, 4, 10)).toEqual({ start: 0, end: 4 });
    expect(nextChunk(8, 4, 10)).toEqual({ start: 8, end: 10 });
    expect(nextChunk(12, 4, 10)).toEqual({ start: 10, end: 10 });
  });

  it("sizes a chunk to the speed, within bounds", () => {
    const MiB = 1024 * 1024;
    expect(adaptChunkSize(1 * MiB, 30)).toBe(30 * MiB);
    expect(adaptChunkSize(10 * MiB, 30)).toBe(32 * MiB);
    expect(adaptChunkSize(10 * 1024, 30)).toBe(1 * MiB);
    expect(adaptChunkSize(0, 30)).toBe(1 * MiB);
  });
});
