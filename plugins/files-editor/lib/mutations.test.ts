import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MutationError,
  createFile,
  createFolder,
  duplicateEntry,
  moveEntry,
  numberedName,
  placeFile,
  renameEntry,
  resolveEntryPath,
  resolveFilePath,
  resolveFolderPath,
  restoreFromTrash,
  splitName,
  trashEntry,
  uniqueName,
  validateName,
} from "./mutations.js";

let base: string;
let root: string;
let outside: string;
let trash: string;

beforeEach(async () => {
  // realpath: on macOS the temp dir sits behind the /var → /private/var link.
  base = await realpath(await mkdtemp(path.join(tmpdir(), "files-editor-mutations-")));
  root = path.join(base, "workspace");
  outside = path.join(base, "outside");
  trash = path.join(base, "Trash");
  await mkdir(path.join(root, "src", "nested"), { recursive: true });
  await mkdir(outside);
  await mkdir(trash);
  await writeFile(path.join(root, "README.md"), "readme");
  await writeFile(path.join(root, "src", "index.ts"), "export {}");
  await writeFile(path.join(root, "src", "nested", "deep.ts"), "deep");
  await writeFile(path.join(outside, "secret.txt"), "secret");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function refusal(promise: Promise<unknown>): Promise<MutationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(MutationError);
    return error as MutationError;
  }
  throw new Error("expected a refusal");
}

describe("validateName", () => {
  it.each(["", ".", "..", "a/b", "a\\b", "nul\u0000byte", "line\nbreak", "x".repeat(256)])(
    "refuses %j",
    (name) => {
      expect(() => validateName(name)).toThrow(MutationError);
    },
  );

  it.each(["notes.md", ".env", "My File (draft).txt", "файл.txt", "a..b"])("accepts %j", (name) => {
    expect(validateName(name)).toBe(name);
  });
});

describe("numbered names", () => {
  it("puts the number before the extension", () => {
    expect(numberedName("report.txt", 1)).toBe("report (1).txt");
    expect(numberedName("archive.tar.gz", 2)).toBe("archive (2).tar.gz");
    expect(numberedName(".env", 1)).toBe(".env (1)");
    expect(numberedName("Makefile", 3)).toBe("Makefile (3)");
  });

  it("splits a dotfile as one stem", () => {
    expect(splitName(".bashrc")).toEqual({ stem: ".bashrc", extension: "" });
  });

  it("skips names already taken", async () => {
    const folder = path.join(root, "src");
    expect(await uniqueName(folder, "free.ts")).toBe("free.ts");
    expect(await uniqueName(folder, "index.ts")).toBe("index (1).ts");
    await writeFile(path.join(folder, "index (1).ts"), "");
    expect(await uniqueName(folder, "index.ts")).toBe("index (2).ts");
    expect(await uniqueName(folder, "free.ts", true)).toBe("free (1).ts");
  });
});

describe("paths stay inside the workspace", () => {
  it("refuses .. in a path", async () => {
    expect((await refusal(createFile(root, "../outside", "x.txt"))).code).toBe("outside");
    expect((await refusal(renameEntry(root, "../outside/secret.txt", "y.txt"))).code).toBe("outside");
    expect(await exists(path.join(outside, "x.txt"))).toBe(false);
  });

  it("refuses a symlinked folder that points outside", async () => {
    await symlink(outside, path.join(root, "escape"));
    expect((await refusal(createFile(root, "escape", "planted.txt"))).code).toBe("outside");
    expect((await refusal(renameEntry(root, "escape/secret.txt", "taken.txt"))).code).toBe("outside");
    expect((await refusal(moveEntry(root, "README.md", "escape", false))).code).toBe("outside");
    expect(await readdir(outside)).toEqual(["secret.txt"]);
  });

  it("acts on a symlink itself, not on what it points to", async () => {
    await symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    expect(await renameEntry(root, "link.txt", "renamed-link.txt")).toBe("renamed-link.txt");
    expect(await readlink(path.join(root, "renamed-link.txt"))).toBe(path.join(outside, "secret.txt"));
    expect(await readFile(path.join(outside, "secret.txt"), "utf8")).toBe("secret");
  });

  it("never targets the workspace itself", async () => {
    expect((await refusal(renameEntry(root, "", "x"))).code).toBe("outside");
    expect((await refusal(trashEntry(root, "", { trashDir: trash }))).code).toBe("outside");
  });

  it("names the entry for Finder", async () => {
    expect(await resolveEntryPath(root, "src/index.ts")).toBe(path.join(root, "src", "index.ts"));
    expect((await refusal(resolveEntryPath(root, "src/missing.ts"))).code).toBe("not_found");
  });
});

describe("create", () => {
  it("creates an empty file and a folder", async () => {
    expect(await createFile(root, "src", "new.ts")).toBe("src/new.ts");
    expect(await readFile(path.join(root, "src", "new.ts"), "utf8")).toBe("");
    expect(await createFolder(root, "", "docs")).toBe("docs");
    expect((await lstat(path.join(root, "docs"))).isDirectory()).toBe(true);
  });

  it("refuses a name already taken, and leaves the file alone", async () => {
    const error = await refusal(createFile(root, "", "README.md"));
    expect(error.code).toBe("exists");
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("readme");
    expect((await refusal(createFolder(root, "", "src"))).code).toBe("exists");
    expect((await refusal(createFolder(root, "", "README.md"))).code).toBe("exists");
  });

  it("refuses a bad name and a missing folder", async () => {
    expect((await refusal(createFile(root, "", "../x"))).code).toBe("invalid_name");
    expect((await refusal(createFile(root, "", ""))).code).toBe("invalid_name");
    expect((await refusal(createFile(root, "gone", "x.txt"))).code).toBe("not_found");
    expect((await refusal(createFile(root, "README.md", "x.txt"))).code).toBe("not_a_directory");
  });
});

describe("rename", () => {
  it("renames a file and a folder", async () => {
    expect(await renameEntry(root, "src/index.ts", "main.ts")).toBe("src/main.ts");
    expect(await readFile(path.join(root, "src", "main.ts"), "utf8")).toBe("export {}");
    expect(await exists(path.join(root, "src", "index.ts"))).toBe(false);
    expect(await renameEntry(root, "src/nested", "inner")).toBe("src/inner");
    expect(await readFile(path.join(root, "src", "inner", "deep.ts"), "utf8")).toBe("deep");
  });

  it("never overwrites an existing file or folder", async () => {
    await writeFile(path.join(root, "src", "taken.ts"), "keep me");
    expect((await refusal(renameEntry(root, "src/index.ts", "taken.ts"))).code).toBe("exists");
    expect(await readFile(path.join(root, "src", "taken.ts"), "utf8")).toBe("keep me");
    expect(await readFile(path.join(root, "src", "index.ts"), "utf8")).toBe("export {}");
    expect((await refusal(renameEntry(root, "src/nested", "index.ts"))).code).toBe("exists");
    expect((await refusal(renameEntry(root, "README.md", "src"))).code).toBe("exists");
  });

  it("refuses ../x and an empty name, and leaves the file in place", async () => {
    expect((await refusal(renameEntry(root, "README.md", "../x"))).code).toBe("invalid_name");
    expect((await refusal(renameEntry(root, "README.md", ""))).code).toBe("invalid_name");
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("readme");
  });

  it("says when the file is already gone", async () => {
    expect((await refusal(renameEntry(root, "src/vanished.ts", "x.ts"))).code).toBe("not_found");
  });

  it("allows a change of case alone", async () => {
    expect(await renameEntry(root, "README.md", "readme.md")).toBe("readme.md");
    expect(await readdir(root)).toContain("readme.md");
    expect(await readdir(root)).not.toContain("README.md");
  });
});

describe("duplicate", () => {
  it("copies a file as name (1), then name (2)", async () => {
    expect(await duplicateEntry(root, "src/index.ts")).toBe("src/index (1).ts");
    expect(await duplicateEntry(root, "src/index.ts")).toBe("src/index (2).ts");
    expect(await readFile(path.join(root, "src", "index (2).ts"), "utf8")).toBe("export {}");
  });

  it("copies a folder with its contents, links as links", async () => {
    await symlink(path.join(outside, "secret.txt"), path.join(root, "src", "nested", "link.txt"));
    expect(await duplicateEntry(root, "src/nested")).toBe("src/nested (1)");
    expect(await readFile(path.join(root, "src", "nested (1)", "deep.ts"), "utf8")).toBe("deep");
    expect(await readlink(path.join(root, "src", "nested (1)", "link.txt"))).toBe(
      path.join(outside, "secret.txt"),
    );
  });
});

describe("move", () => {
  it("moves a file into another folder", async () => {
    expect(await moveEntry(root, "README.md", "src/nested", false)).toBe("src/nested/README.md");
    expect(await exists(path.join(root, "README.md"))).toBe(false);
  });

  it("refuses a taken name, or keeps both", async () => {
    await writeFile(path.join(root, "src", "nested", "README.md"), "other");
    expect((await refusal(moveEntry(root, "README.md", "src/nested", false))).code).toBe("exists");
    expect(await readFile(path.join(root, "src", "nested", "README.md"), "utf8")).toBe("other");
    expect(await moveEntry(root, "README.md", "src/nested", true)).toBe("src/nested/README (1).md");
    expect(await readFile(path.join(root, "src", "nested", "README (1).md"), "utf8")).toBe("readme");
  });

  it("refuses a folder into itself", async () => {
    expect((await refusal(moveEntry(root, "src", "src/nested", false))).code).toBe("into_itself");
    expect((await refusal(moveEntry(root, "src", "src", false))).code).toBe("into_itself");
  });

  it("leaves an entry already in that folder where it is", async () => {
    expect(await moveEntry(root, "src/index.ts", "src", false)).toBe("src/index.ts");
  });
});

describe("trash and put back", () => {
  it("moves into the given Trash folder and back", async () => {
    const result = await trashEntry(root, "src/index.ts", { trashDir: trash });
    expect(result).toEqual({ path: "src/index.ts", trashedPath: path.join(trash, "index.ts") });
    expect(await exists(path.join(root, "src", "index.ts"))).toBe(false);

    expect(await restoreFromTrash(root, result.trashedPath!, result.path, { trashDir: trash })).toBe(
      "src/index.ts",
    );
    expect(await readFile(path.join(root, "src", "index.ts"), "utf8")).toBe("export {}");
    expect(await readdir(trash)).toEqual([]);
  });

  it("takes a free name in the Trash, and trashes folders too", async () => {
    await writeFile(path.join(trash, "nested"), "an older one");
    const result = await trashEntry(root, "src/nested", { trashDir: trash });
    expect(result.trashedPath).toBe(path.join(trash, "nested (1)"));
    expect(await readFile(path.join(trash, "nested (1)", "deep.ts"), "utf8")).toBe("deep");
  });

  it("does not put back over something new in its place", async () => {
    const result = await trashEntry(root, "README.md", { trashDir: trash });
    await writeFile(path.join(root, "README.md"), "new");
    const error = await refusal(
      restoreFromTrash(root, result.trashedPath!, result.path, { trashDir: trash }),
    );
    expect(error.code).toBe("exists");
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("new");
    expect(await readFile(path.join(trash, "README.md"), "utf8")).toBe("readme");
  });

  it("puts back only what sits in the Trash folder", async () => {
    const error = await refusal(
      restoreFromTrash(root, path.join(outside, "secret.txt"), "stolen.txt", { trashDir: trash }),
    );
    expect(error.code).toBe("outside");
    expect(await exists(path.join(root, "stolen.txt"))).toBe(false);
  });

  it("falls back to the system tool when the Trash folder cannot take it", async () => {
    const trashCommand = vi.fn(async () => {});
    const result = await trashEntry(root, "README.md", {
      trashDir: path.join(base, "no-such-trash"),
      trashCommand,
    });
    expect(result).toEqual({ path: "README.md", trashedPath: null });
    expect(trashCommand).toHaveBeenCalledWith(path.join(root, "README.md"));
  });

  it("reports a missing entry instead of calling the tool", async () => {
    const trashCommand = vi.fn(async () => {});
    const error = await refusal(trashEntry(root, "gone.txt", { trashDir: trash, trashCommand }));
    expect(error.code).toBe("not_found");
    expect(trashCommand).not.toHaveBeenCalled();
  });
});

describe("folders and files read through a check (Home listing, downloads, uploads)", () => {
  it("resolves a folder inside, and refuses one through a link out or past the root", async () => {
    expect(await resolveFolderPath(root, "src/nested")).toBe(path.join(root, "src", "nested"));
    expect(await resolveFolderPath(root, "")).toBe(root);
    await symlink(outside, path.join(root, "escape"));
    expect((await refusal(resolveFolderPath(root, "escape"))).code).toBe("outside");
    expect((await refusal(resolveFolderPath(root, "../outside"))).code).toBe("outside");
    expect((await refusal(resolveFolderPath(root, "README.md"))).code).toBe("not_a_directory");
  });

  it("follows a link to a file inside, and refuses a file reached through a link out", async () => {
    await symlink(path.join(root, "README.md"), path.join(root, "readme-link.md"));
    await symlink(path.join(outside, "secret.txt"), path.join(root, "secret-link.txt"));
    expect(await resolveFilePath(root, "readme-link.md")).toBe(path.join(root, "README.md"));
    expect((await refusal(resolveFilePath(root, "secret-link.txt"))).code).toBe("outside");
    expect((await refusal(resolveFilePath(root, "src"))).code).toBe("unsupported");
    expect((await refusal(resolveFilePath(root, "gone.txt"))).code).toBe("not_found");
  });

  it("places a staged file under a free name and never over an existing one", async () => {
    const staged = path.join(base, "staged.part");
    await writeFile(staged, "new");
    expect(await placeFile(root, "", "README.md", staged)).toBe("README (1).md");
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("readme");
    expect(await readFile(path.join(root, "README (1).md"), "utf8")).toBe("new");
    await expect(lstat(staged)).rejects.toThrow();
  });

  it("refuses to place a file through a link out or under an unusable name", async () => {
    const staged = path.join(base, "staged.part");
    await writeFile(staged, "new");
    await symlink(outside, path.join(root, "escape"));
    expect((await refusal(placeFile(root, "escape", "x.txt", staged))).code).toBe("outside");
    expect((await refusal(placeFile(root, "", "../x.txt", staged))).code).toBe("invalid_name");
    expect(await readdir(outside)).toEqual(["secret.txt"]);
  });
});
