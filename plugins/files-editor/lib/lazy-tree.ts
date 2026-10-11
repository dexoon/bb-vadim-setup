/**
 * The panel's side of a tree read folder by folder (Home): folding one
 * folder's fresh listing into what is already loaded, and working out which
 * open folders still need reading. Pure, so the merge rules are tested
 * without a server.
 */
import type { FlatEntry } from "./tree.js";

function isUnder(candidate: string, folder: string): boolean {
  return folder === "" ? candidate !== "" : candidate.startsWith(`${folder}/`);
}

/** The child of `folder` that `candidate` sits in: `a/b/c` under `a` → `a/b`. */
function childOf(candidate: string, folder: string): string {
  const rest = folder === "" ? candidate : candidate.slice(folder.length + 1);
  const slash = rest.indexOf("/");
  const head = slash === -1 ? rest : rest.slice(0, slash);
  return folder === "" ? head : `${folder}/${head}`;
}

/**
 * `entries` with the direct children of `folder` replaced by `children`.
 *
 * What was loaded deeper down stays when its branch is still there as a
 * folder — re-reading Downloads must not fold up a subfolder that is open —
 * and goes when that branch was removed or became a file. Everything outside
 * `folder` is untouched.
 */
export function mergeListing(
  entries: readonly FlatEntry[],
  folder: string,
  children: readonly FlatEntry[],
): FlatEntry[] {
  const survivingFolders = new Set(
    children.filter((child) => child.kind === "directory").map((child) => child.path),
  );
  const kept: FlatEntry[] = [];
  for (const entry of entries) {
    if (!isUnder(entry.path, folder)) {
      kept.push(entry);
      continue;
    }
    const branch = childOf(entry.path, folder);
    // A direct child is replaced by the fresh listing; deeper ones stay with
    // their branch.
    if (branch === entry.path) continue;
    if (survivingFolders.has(branch)) kept.push(entry);
  }
  return [...kept, ...children];
}

/**
 * The read folders still in the tree. After a merge dropped a branch, the
 * folders under it are no longer loaded — reopening one must read it again.
 */
export function pruneListed(
  listed: readonly string[],
  entries: readonly FlatEntry[],
): string[] {
  const folders = new Set(entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path));
  return listed.filter((folder) => folder === "" || folders.has(folder));
}

/**
 * Open folders that still need reading, parents first: present in the tree as
 * folders (so their own parent is loaded), not read yet, not being read, and
 * not already refused this session.
 */
export function foldersToLoad(options: {
  expanded: Iterable<string>;
  entries: readonly FlatEntry[];
  listed: ReadonlySet<string>;
  loading: ReadonlySet<string>;
  failed: ReadonlySet<string>;
}): string[] {
  const folders = new Set(
    options.entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path),
  );
  const wanted: string[] = [];
  for (const folder of options.expanded) {
    if (!folders.has(folder)) continue;
    if (options.listed.has(folder) || options.loading.has(folder) || options.failed.has(folder)) {
      continue;
    }
    wanted.push(folder);
  }
  return wanted.sort((left, right) => left.split("/").length - right.split("/").length);
}
