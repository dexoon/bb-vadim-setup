// What the server knows about a path from a chat link: whether it is a folder,
// and what lies one level inside it.
//
// A path is answered only as it was written — no search by name, no guessing
// which repository it meant. Before anything is read, the path goes through
// realpath, and both the path as written and the real path must lie inside the
// home folder: a symlink pointing out of it is refused like any outside path.
//
// A missing path that BB would send to its browser (no dot in the last
// segment) is answered with the nearest existing folder up the same path, no
// higher than the home folder. A missing `foo.md` is left to BB, which shows
// "not found" in its own panel.
import { readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";

/** `file` is anything that is not a folder: BB keeps handling those links. */
export type PathKind = "directory" | "file" | "missing" | "outside" | "denied";

/** What a link path is; for a missing folder, the folder shown instead. */
export type PathVerdict = { kind: PathKind } | { kind: "missing-folder"; nearest: string };

export interface FolderEntry {
  name: string;
  /** Absolute path as seen from the listed folder, not resolved. */
  path: string;
  kind: "directory" | "file";
  /** Hidden entries and heavy service folders: shown dimmed, never expanded on their own. */
  muted: boolean;
  /** A symlink whose target lies outside the home folder: shown, but not opened. */
  outside: boolean;
}

export type FolderListing =
  | { ok: true; path: string; parent: string | null; entries: FolderEntry[]; truncated: boolean }
  | { ok: false; reason: "missing" | "not-directory" | "outside" | "denied"; message: string };

export const MAX_ENTRIES = 5000;
const SERVICE_FOLDERS = new Set([".git", "node_modules", ".venv", "__pycache__"]);

const within = (path: string, root: string) => path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`);

/** `/a/b/` and `/a/./b` become `/a/b`; the root stays `/`. */
function tidy(path: string): string {
  const normalized = normalize(path);
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function errorCode(cause: unknown): string {
  return typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "";
}

type Resolved =
  | { ok: true; path: string; real: string }
  | { ok: false; kind: "outside" | "denied" }
  | { ok: false; kind: "missing"; path: string; base: string; realHome: string };

/** The path inside the home folder, or why it is not served. Nothing outside the home folder is touched. */
async function resolveInHome(path: string, home: string): Promise<Resolved> {
  if (!isAbsolute(path) || path.includes("\0")) return { ok: false, kind: "outside" };
  const tidyHome = tidy(home);
  const realHome = await realpath(tidyHome);
  const tidyPath = tidy(path);
  const base = within(tidyPath, tidyHome) ? tidyHome : realHome;
  if (!within(tidyPath, base)) return { ok: false, kind: "outside" };
  let real: string;
  try {
    real = await realpath(tidyPath);
  } catch (cause) {
    const code = errorCode(cause);
    if (code === "EACCES" || code === "EPERM") return { ok: false, kind: "denied" };
    return { ok: false, kind: "missing", path: tidyPath, base, realHome };
  }
  if (!within(real, realHome)) return { ok: false, kind: "outside" };
  return { ok: true, path: tidyPath, real };
}

/**
 * BB's own test for "a link to a file": the last segment has a dot and the
 * path does not end with `/`. Such a link BB opens in its file panel; any
 * other it treats as a web address.
 */
export function looksLikeFile(path: string): boolean {
  if (path.endsWith("/")) return false;
  return (path.split("/").pop() ?? "").includes(".");
}

/**
 * The first ancestor of a missing path that exists, walking up the same path
 * and stopping at the home folder. It must be a folder inside the home
 * folder; a file or a symlink out on the way leaves the link to BB.
 */
async function nearestFolder(path: string, base: string, realHome: string): Promise<PathVerdict> {
  for (let candidate = dirname(path); within(candidate, base); candidate = dirname(candidate)) {
    let real: string;
    try {
      real = await realpath(candidate);
    } catch (cause) {
      const code = errorCode(cause);
      if (code === "EACCES" || code === "EPERM") return { kind: "denied" };
      if (candidate === base || dirname(candidate) === candidate) break;
      continue;
    }
    if (!within(real, realHome)) return { kind: "outside" };
    try {
      return (await stat(real)).isDirectory() ? { kind: "missing-folder", nearest: candidate } : { kind: "missing" };
    } catch {
      return { kind: "missing" };
    }
  }
  return { kind: "missing" };
}

export async function inspectPath(path: string, home: string): Promise<PathVerdict> {
  const resolved = await resolveInHome(path, home);
  if (!resolved.ok) {
    if (resolved.kind !== "missing" || looksLikeFile(path)) return { kind: resolved.kind };
    return nearestFolder(resolved.path, resolved.base, resolved.realHome);
  }
  try {
    return { kind: (await stat(resolved.real)).isDirectory() ? "directory" : "file" };
  } catch {
    return { kind: "missing" };
  }
}

const MESSAGES = {
  missing: "Такой папки нет.",
  "not-directory": "Это не папка.",
  outside: "Папка вне домашней папки — плагин её не показывает.",
  denied: "Нет доступа к папке.",
} as const;

const refuse = (reason: keyof typeof MESSAGES): FolderListing => ({ ok: false, reason, message: MESSAGES[reason] });

/** One level of the folder: folders first, then files, by name. */
export async function listFolder(path: string, home: string): Promise<FolderListing> {
  const resolved = await resolveInHome(path, home);
  if (!resolved.ok) return refuse(resolved.kind);
  let dirents;
  try {
    if (!(await stat(resolved.real)).isDirectory()) return refuse("not-directory");
    dirents = await readdir(resolved.real, { withFileTypes: true });
  } catch (cause) {
    const code = errorCode(cause);
    return refuse(code === "EACCES" || code === "EPERM" ? "denied" : "missing");
  }
  const realHome = await realpath(tidy(home));
  const truncated = dirents.length > MAX_ENTRIES;
  const entries = await Promise.all(
    dirents.slice(0, MAX_ENTRIES).map(async (dirent): Promise<FolderEntry> => {
      const entryPath = join(resolved.path, dirent.name);
      const muted = dirent.name.startsWith(".") || SERVICE_FOLDERS.has(dirent.name);
      if (!dirent.isSymbolicLink()) {
        return { name: dirent.name, path: entryPath, kind: dirent.isDirectory() ? "directory" : "file", muted, outside: false };
      }
      try {
        const target = await realpath(join(resolved.real, dirent.name));
        const kind = (await stat(target)).isDirectory() ? "directory" : "file";
        return { name: dirent.name, path: entryPath, kind, muted, outside: !within(target, realHome) };
      } catch {
        // A broken link: BB shows its own error if it is opened.
        return { name: dirent.name, path: entryPath, kind: "file", muted, outside: false };
      }
    }),
  );
  entries.sort(
    (a, b) =>
      Number(a.kind === "file") - Number(b.kind === "file") ||
      a.name.localeCompare(b.name, "ru", { numeric: true, sensitivity: "base" }),
  );
  const parentPath = dirname(resolved.path);
  const parent = parentPath !== resolved.path && within(parentPath, tidy(home)) ? parentPath : null;
  return { ok: true, path: resolved.path, parent, entries, truncated };
}
