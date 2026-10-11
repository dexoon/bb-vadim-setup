import { mkdtemp, mkdir, writeFile, symlink, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldFallBackToBbListing, walkDirectory } from "./walk.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "files-editor-walk-"));
  await mkdir(path.join(root, "src", "nested"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(path.join(root, ".github"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "hi");
  await writeFile(path.join(root, ".gitignore"), "dist");
  await writeFile(path.join(root, "src", "index.ts"), "export {}");
  await writeFile(path.join(root, "src", "nested", "deep.ts"), "export {}");
  await writeFile(path.join(root, ".github", "ci.yml"), "on: push");
  await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const walk = (overrides: Partial<Parameters<typeof walkDirectory>[0]> = {}) =>
  walkDirectory({
    root,
    excludedNames: new Set(["node_modules"]),
    includeHidden: true,
    limit: 1000,
    ...overrides,
  });

describe("walkDirectory", () => {
  it("lists dotfiles and dot-directories, which BB's own listing drops", async () => {
    const { entries } = await walk();
    const paths = entries.map((entry) => entry.path);
    expect(paths).toContain(".gitignore");
    expect(paths).toContain(".github");
    expect(paths).toContain(".github/ci.yml");
  });

  it("omits them when hidden files are turned off", async () => {
    const { entries } = await walk({ includeHidden: false });
    expect(entries.map((entry) => entry.path)).not.toContain(".gitignore");
  });

  it("never descends into an excluded directory", async () => {
    const { entries } = await walk();
    expect(
      entries.filter((entry) => entry.path.startsWith("node_modules")),
    ).toEqual([]);
  });

  it("marks directories and reports paths relative to the root", async () => {
    const { entries } = await walk();
    expect(entries).toContainEqual({ path: "src", kind: "directory" });
    expect(entries).toContainEqual({ path: "src/nested/deep.ts", kind: "file" });
  });

  it("skips symlinks rather than following them into a cycle", async () => {
    await symlink(root, path.join(root, "loop"), "dir");
    const { entries } = await walk();
    expect(entries.map((entry) => entry.path)).not.toContain("loop");
  });

  it("keeps the shallow tree when it hits the entry cap", async () => {
    const { entries, truncated } = await walk({ limit: 3 });
    expect(truncated).toBe(true);
    expect(entries).toHaveLength(3);
    // Breadth-first: everything returned is still top level.
    expect(entries.every((entry) => !entry.path.includes("/"))).toBe(true);
  });

  it("leaves out modification times unless asked, so the search listing stays cheap", async () => {
    const { entries } = await walk();
    expect(entries.every((entry) => entry.mtimeMs === undefined)).toBe(true);
  });

  it("records every entry's modification time when asked", async () => {
    const stamp = new Date("2024-01-02T03:04:05Z");
    await utimes(path.join(root, "src", "nested", "deep.ts"), stamp, stamp);
    const { entries } = await walk({ withModifiedTimes: true });
    expect(entries.every((entry) => typeof entry.mtimeMs === "number")).toBe(true);
    const deep = entries.find((entry) => entry.path === "src/nested/deep.ts");
    expect(deep?.mtimeMs).toBe(stamp.getTime());
  });

  it("stamps what it kept when the entry cap cuts a directory short", async () => {
    const { entries, truncated } = await walk({ limit: 3, withModifiedTimes: true });
    expect(truncated).toBe(true);
    expect(entries.every((entry) => typeof entry.mtimeMs === "number")).toBe(true);
  });

  it("throws for a missing root instead of reporting an empty workspace", async () => {
    await expect(walk({ root: path.join(root, "gone") })).rejects.toThrow();
  });
});

describe("shouldFallBackToBbListing", () => {
  it("refuses to fall back for a root that is gone", () => {
    // BB answers these with an empty success, which would read as "this
    // workspace has no files" rather than "this workspace is missing".
    expect(shouldFallBackToBbListing(errorWithCode("ENOENT"))).toBe(false);
    expect(shouldFallBackToBbListing(errorWithCode("ENOTDIR"))).toBe(false);
  });

  it("falls back when this process merely cannot read the root", () => {
    for (const code of ["EACCES", "EPERM", "EMFILE", "ELOOP"]) {
      expect(shouldFallBackToBbListing(errorWithCode(code))).toBe(true);
    }
  });

  it("falls back for anything without an errno code", () => {
    expect(shouldFallBackToBbListing(new Error("boom"))).toBe(true);
    expect(shouldFallBackToBbListing(null)).toBe(true);
    expect(shouldFallBackToBbListing("nope")).toBe(true);
  });
});

function errorWithCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}
