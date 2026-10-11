// The server answers only for the exact path, only inside the home folder.
// Runs on a throwaway folder tree standing in for the home folder: `npm test`.
// On macOS that tree lives under /var, itself a symlink to /private/var, so
// the home folder's own real path differs from the one written — as it would
// for a home folder on a symlinked volume.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { inspectPath, listFolder, looksLikeFile } from "../src/folders.ts";

const kindOf = async (path: string) => (await inspectPath(path, home)).kind;

let base = "";
let home = "";
let outside = "";

before(async () => {
  base = await mkdtemp(join(tmpdir(), "folder-links-test-"));
  home = join(base, "home");
  outside = join(base, "outside");
  await mkdir(join(home, "repo-a", "docs", "deep"), { recursive: true });
  await mkdir(join(home, "repo-b"), { recursive: true });
  await writeFile(join(home, "repo-a", "docs", "README.md"), "# docs\n");
  await writeFile(join(home, "repo-a", "notes.md"), "notes\n");
  for (const name of [".git", "node_modules", ".venv", "__pycache__", ".claude", "Бэклог", "src"]) {
    await mkdir(join(home, "repo-a", name));
  }
  await writeFile(join(home, "repo-a", ".env"), "SECRET=1\n");
  await mkdir(join(outside, "private"), { recursive: true });
  await writeFile(join(outside, "private", "secret.txt"), "secret\n");
  await symlink(join(outside, "private"), join(home, "repo-a", "link-out"));
  await symlink(join(outside, "private", "secret.txt"), join(home, "repo-a", "file-link-out"));
  await symlink(join(home, "repo-a", "docs"), join(home, "repo-b", "docs-link"));
  await symlink(join(home, "nowhere"), join(home, "repo-a", "broken-link"));
});

after(async () => {
  await rm(base, { recursive: true, force: true });
});

test("an existing folder is a folder, a file is a file", async () => {
  assert.deepEqual(await inspectPath(join(home, "repo-a", "docs"), home), { kind: "directory" });
  assert.deepEqual(await inspectPath(join(home, "repo-a", "docs") + "/", home), { kind: "directory" });
  assert.deepEqual(await inspectPath(join(home, "repo-a", "docs", "README.md"), home), { kind: "file" });
});

test("a missing folder answers with its nearest existing folder up the same path", async () => {
  assert.deepEqual(await inspectPath(join(home, "repo-a", "nope"), home), {
    kind: "missing-folder",
    nearest: join(home, "repo-a"),
  });
  assert.deepEqual(await inspectPath(join(home, "repo-a", "nope") + "/", home), {
    kind: "missing-folder",
    nearest: join(home, "repo-a"),
  });
  // Deep: of a/b/c only a exists.
  assert.deepEqual(await inspectPath(join(home, "repo-a", "src", "b", "c"), home), {
    kind: "missing-folder",
    nearest: join(home, "repo-a", "src"),
  });
  // No higher than the home folder, and the home folder itself is allowed.
  assert.deepEqual(await inspectPath(join(home, "no-such", "deeper"), home), { kind: "missing-folder", nearest: home });
});

test("a missing path with an extension is left to BB", async () => {
  assert.deepEqual(await inspectPath(join(home, "repo-a", "foo.md"), home), { kind: "missing" });
  assert.deepEqual(await inspectPath(join(home, "repo-a", "nope", "foo.md"), home), { kind: "missing" });
  assert.deepEqual(await inspectPath(join(home, "repo-a", ".cache-nope"), home), { kind: "missing" });
  assert.equal(looksLikeFile("/a/foo.md"), true);
  assert.equal(looksLikeFile("/a/.env"), true);
  assert.equal(looksLikeFile("/a/no-such-folder-xyz"), false);
  assert.equal(looksLikeFile("/a/v1.2/"), false, "BB sends a path ending with / to the browser");
});

test("a missing path under a file or a symlink out of home is left to BB", async () => {
  assert.deepEqual(await inspectPath(join(home, "repo-a", "notes.md", "child"), home), { kind: "missing" });
  assert.deepEqual(await inspectPath(join(home, "repo-a", "link-out", "nope"), home), { kind: "outside" });
});

test("only the exact path counts: a folder of the same name in another repository is not found", async () => {
  // repo-a/docs exists, repo-b/docs does not: no jump to the other one, only up the same path.
  assert.deepEqual(await inspectPath(join(home, "repo-b", "docs"), home), {
    kind: "missing-folder",
    nearest: join(home, "repo-b"),
  });
  const listing = await listFolder(join(home, "repo-b", "docs"), home);
  assert.deepEqual(listing, { ok: false, reason: "missing", message: "Такой папки нет." });
});

test("nothing outside the home folder is answered", async () => {
  assert.equal(await kindOf(outside), "outside");
  assert.equal(await kindOf(join(outside, "private")), "outside");
  assert.equal(await kindOf(join(outside, "no-such-folder")), "outside", "missing outside: no nearest folder");
  assert.equal(await kindOf("/etc"), "outside");
  assert.equal(await kindOf("/"), "outside");
  assert.equal(await kindOf(join(home, "..", "outside", "private")), "outside");
  assert.equal(await kindOf(join(home, "..", "no-such-folder")), "outside");
  assert.equal(await kindOf(join(home, "repo-a", "..", "..", "outside")), "outside");
  assert.equal(await kindOf("repo-a/docs"), "outside");
  assert.equal(await kindOf(join(home, "repo-a") + "\0"), "outside");
  const listing = await listFolder(join(outside, "private"), home);
  assert.equal(listing.ok, false);
  assert.equal(listing.ok === false && listing.reason, "outside");
});

test("a symlink out of the home folder is refused, a symlink inside it is followed", async () => {
  assert.equal(await kindOf(join(home, "repo-a", "link-out")), "outside");
  assert.equal(await kindOf(join(home, "repo-a", "file-link-out")), "outside");
  assert.equal(await kindOf(join(home, "repo-a", "link-out", "secret.txt")), "outside");
  const refused = await listFolder(join(home, "repo-a", "link-out"), home);
  assert.equal(refused.ok === false && refused.reason, "outside");

  assert.equal(await kindOf(join(home, "repo-b", "docs-link")), "directory");
  const followed = await listFolder(join(home, "repo-b", "docs-link"), home);
  assert.ok(followed.ok);
  assert.equal(followed.path, join(home, "repo-b", "docs-link"));
  assert.deepEqual(followed.entries.map((entry) => entry.name), ["deep", "README.md"]);
});

test("a listing is one level, folders first, hidden and service folders shown but muted", async () => {
  const listing = await listFolder(join(home, "repo-a"), home);
  assert.ok(listing.ok);
  assert.equal(listing.path, join(home, "repo-a"));
  assert.equal(listing.parent, home);
  assert.equal(listing.truncated, false);
  const kinds = listing.entries.map((entry) => entry.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => Number(a === "file") - Number(b === "file")), "folders come before files");
  const byName = new Map(listing.entries.map((entry) => [entry.name, entry]));
  for (const name of [".git", "node_modules", ".venv", "__pycache__", ".claude", ".env"]) {
    assert.equal(byName.get(name)?.muted, true, `${name} is muted`);
  }
  for (const name of ["docs", "src", "Бэклог", "notes.md"]) {
    assert.equal(byName.get(name)?.muted, false, `${name} is not muted`);
  }
  assert.equal(byName.has("README.md"), false, "nothing from a level below");
  assert.equal(byName.get("docs")?.path, join(home, "repo-a", "docs"));
  assert.deepEqual(
    { kind: byName.get("link-out")?.kind, outside: byName.get("link-out")?.outside },
    { kind: "directory", outside: true },
  );
  assert.deepEqual(
    { kind: byName.get("file-link-out")?.kind, outside: byName.get("file-link-out")?.outside },
    { kind: "file", outside: true },
  );
  assert.deepEqual(
    { kind: byName.get("broken-link")?.kind, outside: byName.get("broken-link")?.outside },
    { kind: "file", outside: false },
  );
  assert.equal(byName.get("docs")?.outside, false);
});

test("going up stops at the home folder", async () => {
  const atHome = await listFolder(home, home);
  assert.ok(atHome.ok);
  assert.equal(atHome.parent, null);
  const below = await listFolder(join(home, "repo-a", "docs", "deep"), home);
  assert.ok(below.ok);
  assert.equal(below.parent, join(home, "repo-a", "docs"));
});

test("listing a file is refused as not a folder", async () => {
  const listing = await listFolder(join(home, "repo-a", "notes.md"), home);
  assert.deepEqual(listing, { ok: false, reason: "not-directory", message: "Это не папка." });
});
