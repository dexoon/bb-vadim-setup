import { describe, expect, it } from "vitest";
import { createIgnoreMatcher, parseIgnoredOutput } from "./gitignore.js";

describe("parseIgnoredOutput", () => {
  it("splits NUL-separated paths and keeps a folder's trailing slash", () => {
    expect(parseIgnoredOutput("dist/\u0000.env\u0000notes/a b.md\u0000")).toEqual([
      "dist/",
      ".env",
      "notes/a b.md",
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseIgnoredOutput("")).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(parseIgnoredOutput("a\u0000b\u0000c\u0000", 2)).toEqual(["a", "b"]);
  });
});

describe("createIgnoreMatcher", () => {
  const isIgnored = createIgnoreMatcher(["dist/", ".env", "tools/x/cache/"]);

  it("matches a listed file exactly", () => {
    expect(isIgnored(".env")).toBe(true);
    expect(isIgnored(".env.example")).toBe(false);
  });

  it("matches a listed folder and everything under it", () => {
    expect(isIgnored("dist")).toBe(true);
    expect(isIgnored("dist/app.js")).toBe(true);
    expect(isIgnored("tools/x/cache/deep/file.bin")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(isIgnored("dist2/app.js")).toBe(false);
    expect(isIgnored("tools/x")).toBe(false);
    expect(isIgnored("tools/x/cached.txt")).toBe(false);
  });

  it("matches nothing when git listed nothing", () => {
    expect(createIgnoreMatcher([])("dist")).toBe(false);
  });
});
