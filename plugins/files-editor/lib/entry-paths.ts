/**
 * Workspace-relative path arithmetic for the panel's file operations: where a
 * renamed or moved entry, and everything under it, now lives. Pure, so the
 * open file, Recent and the expanded folders can all follow it the same way.
 * Paths use forward slashes; "" is the workspace root.
 */

/** True for the path itself or anything below it. "" contains everything. */
export function isSameOrInside(candidate: string, ancestor: string): boolean {
  if (ancestor === "") return true;
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

/** Where `candidate` is after `from` became `to`; null when it was not under `from`. */
export function remapPath(candidate: string, from: string, to: string): string | null {
  if (candidate === from) return to;
  if (from !== "" && candidate.startsWith(`${from}/`)) return `${to}${candidate.slice(from.length)}`;
  return null;
}

/** Every path under `from` moved to `to`; the rest unchanged, no repeats. */
export function remapPaths(list: readonly string[], from: string, to: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of list) {
    const next = remapPath(candidate, from, to) ?? candidate;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
  }
  return result;
}

/** The list without `removed` and anything below it. */
export function dropPathsUnder(list: readonly string[], removed: string): string[] {
  return list.filter((candidate) => !isSameOrInside(candidate, removed));
}

export function parentPath(relativePath: string): string {
  const slash = relativePath.lastIndexOf("/");
  return slash === -1 ? "" : relativePath.slice(0, slash);
}

export function entryName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1);
}

export function joinPath(folder: string, name: string): string {
  return folder === "" ? name : `${folder}/${name}`;
}

/** The absolute path on the workspace's host, in that host's separator. */
export function absolutePathFor(root: string, relativePath: string): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const trimmed = root.endsWith(separator) ? root.slice(0, -1) : root;
  if (relativePath === "") return trimmed;
  const tail = separator === "\\" ? relativePath.replace(/\//g, "\\") : relativePath;
  return `${trimmed}${separator}${tail}`;
}

/**
 * How much of a name a rename field selects: the stem, so typing replaces the
 * name and keeps the extension. A dotfile and a name without an extension are
 * selected whole.
 */
export function stemLength(name: string): number {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name.length : dot;
}

/**
 * The reason a typed name will be refused, or null. The server checks again at
 * the moment of the operation; this only spares a round trip for the obvious.
 */
export function nameProblem(name: string): string | null {
  if (name.trim() === "") return "A name cannot be empty.";
  if (name === "." || name === "..") return `“${name}” is not a usable name.`;
  if (name.includes("/") || name.includes("\\")) return "A name cannot contain / or \\.";
  // eslint-disable-next-line no-control-regex -- deliberate: NUL and control characters
  if (/[\u0000-\u001f\u007f]/u.test(name)) return "A name cannot contain control characters.";
  return null;
}

/**
 * Where a dragged entry may be dropped: a folder that is neither the entry
 * itself, below it, nor the folder it already sits in. "" is the root.
 */
export function canDropInto(source: string, folder: string): boolean {
  if (isSameOrInside(folder, source) && source !== "") return false;
  return parentPath(source) !== folder;
}
