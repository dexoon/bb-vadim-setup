/**
 * What `.gitignore` covers in a local checkout, as git itself reports it.
 *
 * The server asks `git ls-files --others --ignored --exclude-standard
 * --directory -z`: git applies every ignore source (the checkout's
 * `.gitignore` files, `.git/info/exclude`, the global excludes file) exactly as
 * `git status` would, which no reimplementation of the pattern rules can
 * promise. `--directory` folds a wholly ignored folder into one `name/` line,
 * so a `dist/` with ten thousand files costs one entry, not ten thousand.
 */
import { ancestorsOf, normalizeRelative } from "./tree.js";

/** More than this and the rest is dropped: dimming is a hint, not a guarantee. */
export const IGNORED_LIMIT = 5000;

/**
 * Split git's NUL-separated output into paths, folders keeping their trailing
 * `/`. `-z` also turns off git's quoting, so a name with spaces, quotes or
 * non-ASCII characters arrives as it is on disk.
 */
export function parseIgnoredOutput(stdout: string, limit = IGNORED_LIMIT): string[] {
  const paths: string[] = [];
  for (const raw of stdout.split("\u0000")) {
    if (raw === "") continue;
    if (paths.length >= limit) break;
    paths.push(raw);
  }
  return paths;
}

/**
 * A test for "is this listing path gitignored": the path itself is listed, or
 * it lies under a listed folder. Built once per listing; each test then costs
 * one lookup per folder above the path.
 */
export function createIgnoreMatcher(ignored: readonly string[]): (path: string) => boolean {
  if (ignored.length === 0) return () => false;
  const files = new Set<string>();
  const folders = new Set<string>();
  for (const entry of ignored) {
    const isFolder = entry.endsWith("/");
    const path = normalizeRelative(entry);
    if (path === "") continue;
    (isFolder ? folders : files).add(path);
  }
  return (candidate: string) => {
    const path = normalizeRelative(candidate);
    if (files.has(path) || folders.has(path)) return true;
    return ancestorsOf(path).some((ancestor) => folders.has(ancestor));
  };
}
