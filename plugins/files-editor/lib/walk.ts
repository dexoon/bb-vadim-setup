import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import type { FlatEntry } from "./tree.js";

export interface WalkOptions {
  root: string;
  excludedNames: ReadonlySet<string>;
  includeHidden: boolean;
  limit: number;
  /**
   * Stat every entry for its modification time — the tree sorts by it. Off for
   * the text search's listing, which only needs the paths.
   */
  withModifiedTimes?: boolean;
}

export interface WalkResult {
  entries: FlatEntry[];
  truncated: boolean;
}

/**
 * Recursive listing of a directory that lives on the machine running this
 * plugin. BB's own `files.listPaths` silently drops every dotfile, so a
 * workspace listed through it has no `.github`, `.env`, or `.gitignore` — this
 * walk exists so a local workspace really does show all of its files.
 *
 * Breadth-first by directory: when a workspace is larger than `limit`, what
 * survives is the shallow part of the tree rather than an arbitrary deep
 * branch.
 *
 * Symlinks are skipped rather than followed, which is both what BB does and
 * what keeps a cyclic link from hanging the walk.
 *
 * Throws if the ROOT cannot be read — a workspace that was deleted underneath
 * BB must not be reported as an empty one. Directories that fail mid-walk are
 * skipped, since the rest of the tree is still worth returning.
 */
export async function walkDirectory(options: WalkOptions): Promise<WalkResult> {
  const entries: FlatEntry[] = [];
  // Relative prefixes are accumulated with "/" rather than derived from
  // path.relative, so a POSIX file whose name contains a backslash keeps it
  // instead of being folded into a separator.
  const queue: Array<{ absolute: string; prefix: string }> = [];
  let truncated = false;

  /**
   * Fill in the times of what one directory added. The stats are not awaited
   * here: they run alongside the reads of the directories after this one and
   * are collected once at the end, which is what keeps a 40k-entry walk from
   * paying 40k round trips to the thread pool in sequence. `lstat`, because
   * symlinks never get this far and nothing should be followed. A file that
   * vanished in between keeps no time and sorts as the oldest.
   */
  const stamps: Promise<void>[] = [];
  const stamp = (directory: string, from: number): void => {
    if (options.withModifiedTimes !== true) return;
    for (const entry of entries.slice(from)) {
      stamps.push(
        fs.lstat(path.join(directory, basenameOf(entry.path))).then(
          (stats) => {
            // Whole milliseconds: the fraction only adds bytes to a listing
            // that crosses RPC as JSON, tens of thousands of entries at a time.
            entry.mtimeMs = Math.trunc(stats.mtimeMs);
          },
          () => {
            // Left without a time.
          },
        ),
      );
    }
  };

  /** Returns false once the entry cap is hit, to stop the walk. */
  const visit = (
    dirents: readonly Dirent[],
    directory: string,
    prefix: string,
  ): boolean => {
    for (const dirent of dirents) {
      const name = dirent.name;
      if (options.excludedNames.has(name)) continue;
      if (!options.includeHidden && name.startsWith(".")) continue;
      if (dirent.isSymbolicLink()) continue;

      const isDirectory = dirent.isDirectory();
      if (!isDirectory && !dirent.isFile()) continue;

      if (entries.length >= options.limit) {
        truncated = true;
        return false;
      }

      const relativePath = prefix === "" ? name : `${prefix}/${name}`;
      entries.push({
        path: relativePath,
        kind: isDirectory ? "directory" : "file",
      });
      if (isDirectory) {
        queue.push({
          absolute: path.join(directory, name),
          prefix: relativePath,
        });
      }
    }
    return true;
  };

  // Deliberately uncaught: a root that cannot be read is an error, not an
  // empty workspace.
  const rootDirents = await fs.readdir(options.root, { withFileTypes: true });
  let keepGoing = visit(rootDirents, options.root, "");
  stamp(options.root, 0);

  while (keepGoing && queue.length > 0) {
    const next = queue.shift()!;
    let dirents;
    try {
      dirents = await fs.readdir(next.absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    const from = entries.length;
    keepGoing = visit(dirents, next.absolute, next.prefix);
    stamp(next.absolute, from);
  }

  // Each stat settles to success or a missing time, never a rejection.
  await Promise.all(stamps);
  return { entries, truncated };
}

/** The last segment of a walk path; the walk joins with "/" on every platform. */
function basenameOf(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1);
}

export function parseExcludedNames(value: string): Set<string> {
  const names = value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return new Set(names);
}

/**
 * Whether a failed local walk should be retried through BB's own listing.
 *
 * BB answers a missing directory with an empty success rather than an error, so
 * handing it a root that is gone would turn a deleted workspace into one that
 * merely looks empty — the exact failure {@link walkDirectory}'s uncaught root
 * read exists to prevent. A root we simply cannot read from this process
 * (permissions, descriptor exhaustion) is worth a second opinion, because BB
 * can reach the host when `node:fs` cannot.
 */
export function shouldFallBackToBbListing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code !== "ENOENT" && code !== "ENOTDIR";
}
