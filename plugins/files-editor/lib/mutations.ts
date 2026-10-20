/**
 * File operations on a checkout on this Mac: create, rename, duplicate, move,
 * Trash and put back. Server-side only — `node:fs`, no BB in between.
 *
 * The plugin's server runs inside BB with no sandbox, so the workspace root is
 * held here and nowhere else. Every path from the panel is checked at the
 * moment of the operation, against the disk as it is then: an agent writes to
 * the same checkout and may have created, renamed or removed the very entry
 * the panel is pointing at.
 *
 * - A path is joined lexically (no `..`), then its folder is `realpath`ed and
 *   must still lie inside the realpath'ed root, so a symlinked folder that
 *   points outside is refused. The entry itself is never followed: renaming
 *   or trashing a symlink acts on the link, not on what it points to.
 * - Nothing is overwritten. New files are created with O_EXCL, new folders
 *   with a plain mkdir, and a file is moved with link + unlink, which fails
 *   instead of replacing a file that appeared a moment ago.
 *
 * Name rules, `realpath` + prefix containment and `name (1).ext` numbering
 * follow `file-manager` (MIT, github.com/xMinor-1/bb-plugins, plugins/
 * file-manager/src/root.ts: validateName, assertInside, resolveLink,
 * resolveExisting; src/mutations.ts: splitName, numberedName, uniqueName).
 */
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import type { Stats } from "node:fs";
import {
  copyFile,
  cp,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  stat,
  symlink,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveWithinRoot } from "./paths.js";

const execFileAsync = promisify(execFile);

export type MutationErrorCode =
  | "invalid_name"
  | "exists"
  | "not_found"
  | "outside"
  | "not_a_directory"
  | "into_itself"
  | "unsupported"
  | "failed";

/** A refusal with a sentence the panel can show as is. */
export class MutationError extends Error {
  constructor(
    readonly code: MutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MutationError";
  }
}

/** Where `trash` moves things by default: the Trash Finder shows. */
export const DEFAULT_TRASH_DIR = path.join(homedir(), ".Trash");

/** Runs macOS's own `trash` tool; Finder's Trash, but no way to know where it went. */
export async function runTrashCommand(absolutePath: string): Promise<void> {
  // execFile, not a shell: the path is one argument whatever it contains.
  // `-s` turns a failed move into a non-zero exit instead of a silent no-op.
  await execFileAsync("/usr/bin/trash", ["-s", absolutePath]);
}

// --- names -----------------------------------------------------------------

/**
 * One path component a person may type: not empty, not `.` or `..`, no slash,
 * backslash, NUL or other control character, at most 255 bytes (APFS's limit).
 * After `file-manager` src/root.ts validateName; the backslash is refused too,
 * because a remote Windows host would read it as a separator.
 */
export function validateName(name: string): string {
  if (name === "") throw new MutationError("invalid_name", "A name cannot be empty.");
  if (name === "." || name === "..") {
    throw new MutationError("invalid_name", `“${name}” is not a usable name.`);
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new MutationError("invalid_name", "A name cannot contain / or \\.");
  }
  // eslint-disable-next-line no-control-regex -- deliberate: NUL and control characters
  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    throw new MutationError("invalid_name", "A name cannot contain control characters.");
  }
  if (Buffer.byteLength(name, "utf8") > 255) {
    throw new MutationError("invalid_name", "That name is too long.");
  }
  return name;
}

/** Compound archive suffixes keep their whole tail: `a.tar.gz` → `a (1).tar.gz`. */
const COMPOUND_EXTENSION = /\.tar\.(gz|bz2|xz|zst|lz|lzma)$/iu;

/** The stem and the extension a copy number goes between. From `file-manager` src/mutations.ts. */
export function splitName(name: string): { stem: string; extension: string } {
  const compound = COMPOUND_EXTENSION.exec(name);
  if (compound !== null && compound.index > 0) {
    return { stem: name.slice(0, compound.index), extension: compound[0] };
  }
  const extension = path.extname(name);
  // path.extname(".env") is "" — a dotfile keeps its whole name as the stem.
  if (extension === "" || extension === name) return { stem: name, extension: "" };
  return { stem: name.slice(0, name.length - extension.length), extension };
}

/** `report.txt`, 2 → `report (2).txt`. */
export function numberedName(name: string, counter: number): string {
  const { stem, extension } = splitName(name);
  return `${stem} (${counter})${extension}`;
}

const MAX_NUMBERED = 10_000;

/**
 * The first name free in `directory`: the name itself, else `name (1)`,
 * `name (2)`… With `alwaysNumbered` the bare name is skipped — a duplicate
 * sits next to its original, so it always needs a number.
 */
export async function uniqueName(
  directory: string,
  name: string,
  alwaysNumbered = false,
): Promise<string> {
  if (!alwaysNumbered && !(await entryExists(path.join(directory, name)))) return name;
  for (let counter = 1; counter < MAX_NUMBERED; counter += 1) {
    const candidate = numberedName(name, counter);
    if (!(await entryExists(path.join(directory, candidate)))) return candidate;
  }
  throw new MutationError("exists", `No free name left for ${name}.`);
}

// --- paths -----------------------------------------------------------------

/** True for the root itself or anything below it. Both sides already realpath'ed. */
export function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
}

async function realRootOf(root: string): Promise<string> {
  try {
    return await realpath(root);
  } catch (error) {
    throw toMutationError(error, "The workspace folder");
  }
}

/** `a/b` from an absolute path under the root, with forward slashes. */
function relativeOf(realRoot: string, absolutePath: string): string {
  return path.relative(realRoot, absolutePath).split(path.sep).join("/");
}

function lexicalPath(realRoot: string, relativePath: string): string {
  try {
    return resolveWithinRoot(realRoot, relativePath);
  } catch {
    throw new MutationError("outside", "That path leads outside the workspace.");
  }
}

/** An existing folder inside the root, symlinks followed — then checked again. */
async function resolveFolder(realRoot: string, relativePath: string): Promise<string> {
  const lexical = lexicalPath(realRoot, relativePath);
  let real: string;
  try {
    real = await realpath(lexical);
  } catch (error) {
    throw toMutationError(error, displayName(relativePath, "The folder"));
  }
  // THE check: on the realpath'ed value, so a link to /etc is caught here.
  if (!isInside(realRoot, real)) {
    throw new MutationError("outside", "That folder leads outside the workspace.");
  }
  const info = await stat(real);
  if (!info.isDirectory()) {
    throw new MutationError("not_a_directory", `${displayName(relativePath, "It")} is not a folder.`);
  }
  return real;
}

interface ResolvedEntry {
  /** The entry itself — a symlink stays a symlink. */
  absolutePath: string;
  /** Its folder, realpath'ed and inside the root. */
  parent: string;
  name: string;
  stats: Stats;
}

/**
 * An existing entry to act on. Its folder is realpath'ed and must be inside the
 * root; the entry itself is not followed. The root is never a target.
 * After `file-manager` src/root.ts resolveLink.
 */
async function resolveEntry(realRoot: string, relativePath: string): Promise<ResolvedEntry> {
  const lexical = lexicalPath(realRoot, relativePath);
  if (lexical === realRoot) {
    throw new MutationError("outside", "The workspace folder itself cannot be changed here.");
  }
  const name = path.basename(lexical);
  const parent = await resolveFolder(realRoot, relativeOf(realRoot, path.dirname(lexical)));
  const absolutePath = path.join(parent, name);
  if (!isInside(realRoot, absolutePath) || absolutePath === realRoot) {
    throw new MutationError("outside", "That path leads outside the workspace.");
  }
  let stats: Stats;
  try {
    stats = await lstat(absolutePath);
  } catch (error) {
    throw toMutationError(error, name);
  }
  return { absolutePath, parent, name, stats };
}

// --- moving without overwriting ------------------------------------------

/** Errors that mean "this disk cannot hard-link", not "the target exists". */
const LINK_UNSUPPORTED = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV", "EMLINK", "ENOSYS"]);

/**
 * Move an entry to a path that must not exist yet.
 *
 * A plain rename silently replaces a file that appeared between a check and the
 * call. For a regular file, link + unlink closes that gap: link fails with
 * EEXIST rather than replacing anything. Folders and symlinks cannot be
 * hard-linked, so they keep the check — the window is the rename call itself.
 */
async function moveWithoutOverwrite(source: ResolvedEntry, destination: string): Promise<void> {
  if (source.stats.isFile()) {
    let linked = false;
    try {
      await link(source.absolutePath, destination);
      linked = true;
    } catch (error) {
      const code = errorCode(error);
      if (code === "EEXIST") {
        // The same file under another spelling: a case-only rename on a
        // case-insensitive disk (`readme.md` → `README.md`).
        if (await isSameEntry(source.absolutePath, destination)) {
          await rename(source.absolutePath, destination);
          return;
        }
        throw existsError(destination);
      }
      if (code === undefined || !LINK_UNSUPPORTED.has(code)) throw error;
    }
    if (linked) {
      try {
        await unlink(source.absolutePath);
      } catch (error) {
        // Leave one name, not two: take the new link back.
        await unlink(destination).catch(() => {});
        throw error;
      }
      return;
    }
  }
  if ((await entryExists(destination)) && !(await isSameEntry(source.absolutePath, destination))) {
    throw existsError(destination);
  }
  await rename(source.absolutePath, destination);
}

async function isSameEntry(left: string, right: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([lstat(left), lstat(right)]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}

async function entryExists(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function existsError(destination: string): MutationError {
  return new MutationError(
    "exists",
    `${path.basename(destination)} already exists there. Nothing was changed.`,
  );
}

// --- operations ----------------------------------------------------------

/** A new empty file; refuses a name already taken. Returns its path. */
export async function createFile(root: string, parent: string, name: string): Promise<string> {
  const realRoot = await realRootOf(root);
  const folder = await resolveFolder(realRoot, parent);
  const target = path.join(folder, validateName(name));
  try {
    const handle = await open(target, "wx");
    await handle.close();
  } catch (error) {
    if (errorCode(error) === "EEXIST") throw existsError(target);
    throw toMutationError(error, name);
  }
  return relativeOf(realRoot, target);
}

/** A new folder; refuses a name already taken. Returns its path. */
export async function createFolder(root: string, parent: string, name: string): Promise<string> {
  const realRoot = await realRootOf(root);
  const folder = await resolveFolder(realRoot, parent);
  const target = path.join(folder, validateName(name));
  try {
    await mkdir(target);
  } catch (error) {
    if (errorCode(error) === "EEXIST") throw existsError(target);
    throw toMutationError(error, name);
  }
  return relativeOf(realRoot, target);
}

/** Rename in place; refuses a name already taken. Returns the new path. */
export async function renameEntry(root: string, relativePath: string, newName: string): Promise<string> {
  const realRoot = await realRootOf(root);
  const entry = await resolveEntry(realRoot, relativePath);
  const name = validateName(newName);
  if (name === entry.name) return relativeOf(realRoot, entry.absolutePath);
  const destination = path.join(entry.parent, name);
  await guard(() => moveWithoutOverwrite(entry, destination), entry.name);
  return relativeOf(realRoot, destination);
}

/** A copy beside the original as `name (1).ext`, `name (2).ext`… Returns its path. */
export async function duplicateEntry(root: string, relativePath: string): Promise<string> {
  const realRoot = await realRootOf(root);
  const entry = await resolveEntry(realRoot, relativePath);
  // A few rounds: the free name can be taken between picking it and copying.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const destination = path.join(entry.parent, await uniqueName(entry.parent, entry.name, true));
    try {
      await copyWithoutOverwrite(entry, destination);
      return relativeOf(realRoot, destination);
    } catch (error) {
      if (errorCode(error) === "EEXIST") continue;
      throw toMutationError(error, entry.name);
    }
  }
  throw new MutationError("exists", `Could not find a free name for a copy of ${entry.name}.`);
}

async function copyWithoutOverwrite(source: ResolvedEntry, destination: string): Promise<void> {
  if (source.stats.isFile()) {
    // COPYFILE_EXCL: create-only, so a file that just took the name survives.
    await copyFile(source.absolutePath, destination, constants.COPYFILE_EXCL);
    return;
  }
  if (source.stats.isSymbolicLink()) {
    // The link is copied, not what it points to.
    await symlink(await readlink(source.absolutePath), destination);
    return;
  }
  if (source.stats.isDirectory()) {
    // Claim the name first (mkdir fails if taken), then copy the contents
    // into it: `cp` of the folder itself onto the just-claimed name is refused
    // on Node before 25. Links are copied as links, so one pointing outside
    // is not followed.
    await mkdir(destination);
    for (const child of await readdir(source.absolutePath, { withFileTypes: true })) {
      await cp(path.join(source.absolutePath, child.name), path.join(destination, child.name), {
        recursive: true,
        force: false,
        errorOnExist: true,
        verbatimSymlinks: true,
        preserveTimestamps: true,
      });
    }
    return;
  }
  throw new MutationError("unsupported", `${source.name} is not a file or a folder.`);
}

/**
 * Move into another folder of the workspace. A name already taken there is
 * refused, or with `keepBoth` the moved entry takes `name (1)`. Returns the
 * new path.
 */
export async function moveEntry(
  root: string,
  relativePath: string,
  destinationFolder: string,
  keepBoth: boolean,
): Promise<string> {
  const realRoot = await realRootOf(root);
  const entry = await resolveEntry(realRoot, relativePath);
  const folder = await resolveFolder(realRoot, destinationFolder);
  if (entry.stats.isDirectory() && isInside(entry.absolutePath, folder)) {
    throw new MutationError("into_itself", `${entry.name} cannot be moved into itself.`);
  }
  if (folder === entry.parent) return relativeOf(realRoot, entry.absolutePath);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = keepBoth ? await uniqueName(folder, entry.name) : entry.name;
    const destination = path.join(folder, name);
    try {
      await guard(() => moveWithoutOverwrite(entry, destination), entry.name);
      return relativeOf(realRoot, destination);
    } catch (error) {
      if (keepBoth && error instanceof MutationError && error.code === "exists") continue;
      throw error;
    }
  }
  throw new MutationError("exists", `Could not find a free name for ${entry.name} there.`);
}

export interface TrashOptions {
  /** The Trash folder; tests point it at a temporary one. */
  trashDir?: string;
  /** The fallback when moving into `trashDir` is not possible. */
  trashCommand?: (absolutePath: string) => Promise<void>;
}

/** Errors on the way into the Trash that the system tool can still get past. */
const TRASH_FALLBACK = new Set(["EXDEV", "EPERM", "EACCES", "ENOENT"]);

/**
 * Into the Trash under a name that is free there, moved by this code so the
 * panel knows where it went and can put it back. When that is not possible —
 * another disk (EXDEV), or macOS guarding ~/.Trash from this process — the
 * system's `trash` tool moves it instead, and `trashedPath` is null: Finder's
 * Trash still has it, but Undo has nothing to go on.
 */
export async function trashEntry(
  root: string,
  relativePath: string,
  options: TrashOptions = {},
): Promise<{ path: string; trashedPath: string | null }> {
  const realRoot = await realRootOf(root);
  const entry = await resolveEntry(realRoot, relativePath);
  const original = relativeOf(realRoot, entry.absolutePath);
  const trashDir = options.trashDir ?? DEFAULT_TRASH_DIR;
  const command = options.trashCommand ?? runTrashCommand;

  try {
    const realTrash = await realpath(trashDir);
    const destination = path.join(realTrash, await uniqueName(realTrash, entry.name));
    await moveWithoutOverwrite(entry, destination);
    return { path: original, trashedPath: destination };
  } catch (error) {
    if (error instanceof MutationError && error.code !== "exists") throw error;
    const code = errorCode(error);
    if (!(error instanceof MutationError) && (code === undefined || !TRASH_FALLBACK.has(code))) {
      throw toMutationError(error, entry.name);
    }
  }

  try {
    await command(entry.absolutePath);
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    throw new MutationError(
      "failed",
      typeof stderr === "string" && stderr.trim() !== ""
        ? stderr.trim()
        : `macOS could not move ${entry.name} to the Trash.`,
    );
  }
  return { path: original, trashedPath: null };
}

/**
 * Undo of `trashEntry`: back to where it was, if that place is still free. The
 * trashed path must sit directly in the Trash folder, so this cannot pull an
 * arbitrary file into the workspace. Returns the restored path.
 */
export async function restoreFromTrash(
  root: string,
  trashedPath: string,
  originalPath: string,
  options: Pick<TrashOptions, "trashDir"> = {},
): Promise<string> {
  const realRoot = await realRootOf(root);
  const realTrash = await realpath(options.trashDir ?? DEFAULT_TRASH_DIR);
  const name = path.basename(trashedPath);
  if (
    !path.isAbsolute(trashedPath) ||
    name === "" ||
    name === "." ||
    name === ".." ||
    (await realpath(path.dirname(trashedPath)).catch(() => null)) !== realTrash
  ) {
    throw new MutationError("outside", "That is not something this panel moved to the Trash.");
  }
  const absolutePath = path.join(realTrash, name);
  let stats: Stats;
  try {
    stats = await lstat(absolutePath);
  } catch {
    throw new MutationError("not_found", `${name} is no longer in the Trash.`);
  }

  const lexical = lexicalPath(realRoot, originalPath);
  if (lexical === realRoot) throw new MutationError("outside", "That path is the workspace itself.");
  const originalName = path.basename(lexical);
  let folder: string;
  try {
    folder = await resolveFolder(realRoot, relativeOf(realRoot, path.dirname(lexical)));
  } catch (error) {
    if (error instanceof MutationError && error.code === "not_found") {
      throw new MutationError(
        "not_found",
        `The folder ${originalName} was in is gone. It is still in the Trash.`,
      );
    }
    throw error;
  }
  const destination = path.join(folder, originalName);
  try {
    await moveWithoutOverwrite({ absolutePath, parent: realTrash, name, stats }, destination);
  } catch (error) {
    if (error instanceof MutationError && error.code === "exists") {
      throw new MutationError(
        "exists",
        `Something named ${originalName} is already there, so it was left in the Trash.`,
      );
    }
    throw toMutationError(error, originalName);
  }
  return relativeOf(realRoot, destination);
}

/** The absolute path of an existing entry, for Finder to point at. */
export async function resolveEntryPath(root: string, relativePath: string): Promise<string> {
  const realRoot = await realRootOf(root);
  return (await resolveEntry(realRoot, relativePath)).absolutePath;
}

/**
 * An existing folder inside the root, realpath'ed — where a listing reads and
 * an upload lands. "" is the root itself. A folder that is a link to somewhere
 * outside is refused, like everywhere else here.
 */
export async function resolveFolderPath(root: string, relativePath: string): Promise<string> {
  const realRoot = await realRootOf(root);
  return resolveFolder(realRoot, relativePath);
}

/**
 * An existing regular file inside the root, every link followed and the result
 * checked again — what a download may stream. Following is fine here because
 * nothing is changed; what matters is that the bytes come from inside.
 */
export async function resolveFilePath(root: string, relativePath: string): Promise<string> {
  const realRoot = await realRootOf(root);
  const lexical = lexicalPath(realRoot, relativePath);
  const name = displayName(relativePath, "The file");
  let real: string;
  try {
    real = await realpath(lexical);
  } catch (error) {
    throw toMutationError(error, name);
  }
  if (!isInside(realRoot, real) || real === realRoot) {
    throw new MutationError("outside", "That file leads outside the workspace.");
  }
  let info: Stats;
  try {
    info = await stat(real);
  } catch (error) {
    throw toMutationError(error, name);
  }
  if (!info.isFile()) throw new MutationError("unsupported", `${name} is not a file.`);
  return real;
}

/**
 * Put a finished file (an upload's staged bytes) into a folder of the root
 * under `name`, or `name (1)`, `name (2)`… when that is taken — never over
 * anything. The staged file is moved, or copied and removed when it sits on
 * another disk. Returns the new path relative to the root.
 */
export async function placeFile(
  root: string,
  folder: string,
  name: string,
  sourcePath: string,
): Promise<string> {
  const realRoot = await realRootOf(root);
  const target = await resolveFolder(realRoot, folder);
  validateName(name);
  let stats: Stats;
  try {
    stats = await lstat(sourcePath);
  } catch (error) {
    throw toMutationError(error, name);
  }
  const source: ResolvedEntry = {
    absolutePath: sourcePath,
    parent: path.dirname(sourcePath),
    name: path.basename(sourcePath),
    stats,
  };
  // A few rounds: an agent can take the free name between picking and moving.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const destination = path.join(target, await uniqueName(target, name));
    try {
      try {
        await moveWithoutOverwrite(source, destination);
      } catch (error) {
        if (errorCode(error) !== "EXDEV") throw error;
        // COPYFILE_EXCL keeps "never over anything" across disks too.
        await copyFile(sourcePath, destination, constants.COPYFILE_EXCL);
        await unlink(sourcePath).catch(() => {});
      }
      return relativeOf(realRoot, destination);
    } catch (error) {
      if (error instanceof MutationError && error.code === "exists") continue;
      if (errorCode(error) === "EEXIST") continue;
      throw toMutationError(error, name);
    }
  }
  throw new MutationError("exists", `Could not find a free name for ${name} there.`);
}

// --- errors ----------------------------------------------------------------

async function guard<T>(run: () => Promise<T>, name: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toMutationError(error, name);
  }
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

function displayName(relativePath: string, fallback: string): string {
  const name = relativePath.split("/").filter(Boolean).at(-1);
  return name ?? fallback;
}

/** A Node error as a sentence; a MutationError passes through untouched. */
export function toMutationError(error: unknown, name: string): MutationError {
  if (error instanceof MutationError) return error;
  switch (errorCode(error)) {
    case "ENOENT":
      return new MutationError(
        "not_found",
        `${name} is no longer there — it may have been renamed, moved or deleted.`,
      );
    case "EEXIST":
    case "ENOTEMPTY":
      return new MutationError("exists", `${name} already exists there. Nothing was changed.`);
    case "EACCES":
    case "EPERM":
      return new MutationError("failed", `Permission denied for ${name}.`);
    case "ENOTDIR":
      return new MutationError("not_a_directory", `${name}: a part of that path is not a folder.`);
    case "EXDEV":
      return new MutationError("unsupported", `${name} is on another disk and cannot be moved there.`);
    case "EINVAL":
      return new MutationError("into_itself", `${name} cannot be moved into itself.`);
    default:
      return new MutationError(
        "failed",
        error instanceof Error ? error.message : `Could not change ${name}.`,
      );
  }
}
