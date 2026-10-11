/**
 * The home folder of this Mac as a tree root, read folder by folder.
 *
 * A project checkout is walked whole; a home folder cannot be. It holds
 * Library (hundreds of thousands of entries, much of it guarded by macOS),
 * every repository ever cloned and every download — a whole walk would spend
 * the 40k-entry budget on whatever comes first and still show a fraction. So
 * Home lists the top level and the folders the panel has open, and the panel
 * asks for each further folder as it is expanded.
 *
 * Every folder goes through `resolveFolderPath` (realpath + prefix test), so a
 * link inside home that points elsewhere is not followed out of it; links are
 * not listed at all, as in the project walk.
 */
import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveFolderPath, toMutationError } from "./mutations.js";
import type { FlatEntry } from "./tree.js";

/**
 * Left out at the top of Home whatever the toggles say. `~/Library` is the
 * apps' own data — huge, and largely unreadable without Full Disk Access;
 * `~/.Trash` is guarded the same way, and the panel's Trash has Undo instead.
 */
export const HOME_SKIPPED_AT_TOP: readonly string[] = ["Library", ".Trash"];

/** One folder's worth: a Downloads folder of thousands is fine, a cache dir is cut. */
export const HOME_FOLDER_LIMIT = 5000;

/** How many open folders one listing re-reads; a session rarely has more open. */
export const HOME_MAX_FOLDERS = 300;

export interface ListFolderOptions {
  /** The home folder; tests pass a temporary one. */
  root: string;
  /** Relative to the root, forward slashes; "" is the root. */
  folder: string;
  excludedNames: ReadonlySet<string>;
  includeHidden: boolean;
  limit?: number;
}

export interface FolderListing {
  entries: FlatEntry[];
  truncated: boolean;
}

/** `a/b/` and `/a/b` → `a/b`. */
export function normalizeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/gu, "");
}

/** Whether one directory entry belongs in a Home listing. */
export function isListedInHome(
  dirent: Pick<Dirent, "name" | "isDirectory" | "isFile" | "isSymbolicLink">,
  atTop: boolean,
  excludedNames: ReadonlySet<string>,
  includeHidden: boolean,
): boolean {
  const name = dirent.name;
  if (atTop && HOME_SKIPPED_AT_TOP.includes(name)) return false;
  if (excludedNames.has(name)) return false;
  if (!includeHidden && name.startsWith(".")) return false;
  // Not followed, as in the project walk: a link could lead out of home.
  if (dirent.isSymbolicLink()) return false;
  return dirent.isDirectory() || dirent.isFile();
}

/**
 * The direct children of one folder, with modification times. Throws a
 * MutationError when the folder is gone, outside the root or unreadable — the
 * panel shows that reason instead of an empty folder.
 */
export async function listFolder(options: ListFolderOptions): Promise<FolderListing> {
  const folder = normalizeFolder(options.folder);
  const limit = options.limit ?? HOME_FOLDER_LIMIT;
  const absolute = await resolveFolderPath(options.root, folder);
  let dirents: Dirent[];
  try {
    dirents = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    throw toMutationError(error, folder === "" ? "The home folder" : folder);
  }

  const kept = dirents.filter((dirent) =>
    isListedInHome(dirent, folder === "", options.excludedNames, options.includeHidden),
  );
  const truncated = kept.length > limit;
  const entries = await Promise.all(
    kept.slice(0, limit).map(async (dirent): Promise<FlatEntry> => {
      const entry: FlatEntry = {
        path: folder === "" ? dirent.name : `${folder}/${dirent.name}`,
        kind: dirent.isDirectory() ? "directory" : "file",
      };
      try {
        entry.mtimeMs = Math.trunc((await lstat(path.join(absolute, dirent.name))).mtimeMs);
      } catch {
        // Gone in between: listed without a time, sorted as the oldest.
      }
      return entry;
    }),
  );
  return { entries, truncated };
}

export interface ListHomeOptions {
  root: string;
  /** The open folders, any order; ones not reachable from the top are skipped. */
  folders: readonly string[];
  excludedNames: ReadonlySet<string>;
  includeHidden: boolean;
  /** The whole listing's cap, the same budget a project walk gets. */
  limit: number;
}

export interface HomeListing extends FolderListing {
  /** Folders whose children are in `entries`; "" is the top. */
  listed: string[];
  /** Open folders that could not be read (permissions, gone in between). */
  unreadable: string[];
}

/**
 * The top level and every open folder that can be reached from it through
 * folders already listed. Parents go first, so a folder whose parent is closed,
 * skipped or gone is never read — it would hang in the tree without a branch.
 */
export async function listHome(options: ListHomeOptions): Promise<HomeListing> {
  const top = await listFolder({ ...options, folder: "", limit: Math.min(options.limit, HOME_FOLDER_LIMIT) });
  const entries = [...top.entries];
  const directories = new Set(
    top.entries.filter((entry) => entry.kind === "directory").map((entry) => entry.path),
  );
  const listed = [""];
  const unreadable: string[] = [];
  let truncated = top.truncated;

  const wanted = [...new Set(options.folders.map(normalizeFolder))]
    .filter((folder) => folder !== "")
    .sort((left, right) => depthOf(left) - depthOf(right) || left.localeCompare(right))
    .slice(0, HOME_MAX_FOLDERS);

  for (const folder of wanted) {
    if (!directories.has(folder)) continue;
    const room = options.limit - entries.length;
    if (room <= 0) {
      truncated = true;
      break;
    }
    try {
      const listing = await listFolder({
        ...options,
        folder,
        limit: Math.min(room, HOME_FOLDER_LIMIT),
      });
      for (const entry of listing.entries) {
        entries.push(entry);
        if (entry.kind === "directory") directories.add(entry.path);
      }
      listed.push(folder);
      if (listing.truncated) truncated = true;
    } catch {
      // One unreadable folder (macOS privacy, gone a moment ago) must not
      // take the rest of the tree down with it.
      unreadable.push(folder);
    }
  }
  return { entries, truncated, listed, unreadable };
}

function depthOf(folder: string): number {
  return folder.split("/").length;
}
