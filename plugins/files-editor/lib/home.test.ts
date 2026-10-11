import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOME_SKIPPED_AT_TOP, listFolder, listHome, normalizeFolder } from "./home.js";
import { MutationError } from "./mutations.js";

// A stand-in home folder: the tests never read the real one.
let base: string;
let home: string;
let outside: string;
const NONE: ReadonlySet<string> = new Set();

beforeEach(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), "files-editor-home-")));
  home = path.join(base, "home");
  outside = path.join(base, "outside");
  await mkdir(path.join(home, "Library", "Caches"), { recursive: true });
  await mkdir(path.join(home, ".Trash"), { recursive: true });
  await mkdir(path.join(home, "Downloads", "photos"), { recursive: true });
  await mkdir(path.join(home, "code", "app", "node_modules"), { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(home, ".zshrc"), "export A=1");
  await writeFile(path.join(home, "notes.md"), "notes");
  await writeFile(path.join(home, "Downloads", "report.pdf"), "pdf");
  await writeFile(path.join(home, "Downloads", "photos", "a.jpg"), "jpg");
  await writeFile(path.join(home, "code", "app", "index.ts"), "x");
  await writeFile(path.join(outside, "secret.txt"), "secret");
  await symlink(outside, path.join(home, "escape"));
  await symlink(path.join(outside, "secret.txt"), path.join(home, "Downloads", "secret-link.txt"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const paths = (entries: readonly { path: string }[]) => entries.map((entry) => entry.path).sort();

describe("listFolder", () => {
  it("lists only the top level, without ~/Library and ~/.Trash", async () => {
    const listing = await listFolder({ root: home, folder: "", excludedNames: NONE, includeHidden: true });
    expect(paths(listing.entries)).toEqual([".zshrc", "Downloads", "code", "notes.md"]);
    expect(HOME_SKIPPED_AT_TOP).toEqual(["Library", ".Trash"]);
    expect(listing.truncated).toBe(false);
  });

  it("does not list links, so a link out of home is not a way out", async () => {
    const top = await listFolder({ root: home, folder: "", excludedNames: NONE, includeHidden: true });
    expect(paths(top.entries)).not.toContain("escape");
    const downloads = await listFolder({ root: home, folder: "Downloads", excludedNames: NONE, includeHidden: true });
    expect(paths(downloads.entries)).toEqual(["Downloads/photos", "Downloads/report.pdf"]);
  });

  it("refuses a folder reached through a link that leads outside, and `..`", async () => {
    await expect(
      listFolder({ root: home, folder: "escape", excludedNames: NONE, includeHidden: true }),
    ).rejects.toMatchObject({ code: "outside" });
    await expect(
      listFolder({ root: home, folder: "../outside", excludedNames: NONE, includeHidden: true }),
    ).rejects.toBeInstanceOf(MutationError);
  });

  it("hides dotfiles and excluded directories when asked", async () => {
    const top = await listFolder({ root: home, folder: "", excludedNames: NONE, includeHidden: false });
    expect(paths(top.entries)).not.toContain(".zshrc");
    const app = await listFolder({
      root: home,
      folder: "code/app",
      excludedNames: new Set(["node_modules"]),
      includeHidden: true,
    });
    expect(paths(app.entries)).toEqual(["code/app/index.ts"]);
  });

  it("skips Library only at the top, and keeps modification times", async () => {
    await mkdir(path.join(home, "code", "Library"));
    const code = await listFolder({ root: home, folder: "code/", excludedNames: NONE, includeHidden: true });
    expect(paths(code.entries)).toEqual(["code/Library", "code/app"]);
    expect(code.entries.every((entry) => typeof entry.mtimeMs === "number")).toBe(true);
  });

  it("says it cut a folder short", async () => {
    const listing = await listFolder({ root: home, folder: "", excludedNames: NONE, includeHidden: true, limit: 2 });
    expect(listing.entries).toHaveLength(2);
    expect(listing.truncated).toBe(true);
  });

  it("reports a folder that is gone", async () => {
    await expect(
      listFolder({ root: home, folder: "Nope", excludedNames: NONE, includeHidden: true }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("listHome", () => {
  it("reads the top level and the open folders, parents first", async () => {
    const listing = await listHome({
      root: home,
      folders: ["Downloads/photos", "Downloads"],
      excludedNames: NONE,
      includeHidden: true,
      limit: 1000,
    });
    expect(listing.listed).toEqual(["", "Downloads", "Downloads/photos"]);
    expect(paths(listing.entries)).toContain("Downloads/photos/a.jpg");
    expect(paths(listing.entries)).not.toContain("code/app");
    expect(listing.unreadable).toEqual([]);
  });

  it("skips an open folder whose parent is not open, skipped or outside", async () => {
    const listing = await listHome({
      root: home,
      folders: ["code/app", "Library/Caches", "escape"],
      excludedNames: NONE,
      includeHidden: true,
      limit: 1000,
    });
    expect(listing.listed).toEqual([""]);
  });

  it("records an open folder it cannot read instead of failing the tree", async () => {
    const photos = path.join(home, "Downloads", "photos");
    await chmod(photos, 0o000);
    try {
      const listing = await listHome({
        root: home,
        folders: ["Downloads", "Downloads/photos"],
        excludedNames: NONE,
        includeHidden: true,
        limit: 1000,
      });
      expect(listing.listed).toEqual(["", "Downloads"]);
      expect(listing.unreadable).toEqual(["Downloads/photos"]);
    } finally {
      await chmod(photos, 0o755);
    }
  });

  it("does not follow an open folder that became a link out of home", async () => {
    await rm(path.join(home, "Downloads", "photos"), { recursive: true });
    await symlink(outside, path.join(home, "Downloads", "photos"));
    const listing = await listHome({
      root: home,
      folders: ["Downloads", "Downloads/photos"],
      excludedNames: NONE,
      includeHidden: true,
      limit: 1000,
    });
    expect(listing.listed).toEqual(["", "Downloads"]);
    expect(paths(listing.entries)).not.toContain("Downloads/photos");
  });

  it("stops at the overall limit", async () => {
    const listing = await listHome({
      root: home,
      folders: ["Downloads", "code"],
      excludedNames: NONE,
      includeHidden: true,
      limit: 5,
    });
    expect(listing.entries.length).toBeLessThanOrEqual(5);
    expect(listing.truncated).toBe(true);
  });

  it("normalizes folder paths", () => {
    expect(normalizeFolder("/Downloads/photos/")).toBe("Downloads/photos");
    expect(normalizeFolder("")).toBe("");
  });
});
