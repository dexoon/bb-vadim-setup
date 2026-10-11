/**
 * Files that hold keys, tokens and passwords. They stay visible in the tree,
 * but their contents show only after a question, and
 * nothing hands them on (to the chat, a download, another app) without one. The
 * path itself is not the secret: copying it, renaming or trashing the file asks
 * nothing.
 */

/** Any path segment with one of these names: the folder and everything in it. */
const SECRET_NAMES = new Set([
  ".ssh",
  ".gnupg",
  ".secrets",
  ".aws",
  ".git-credentials",
  ".netrc",
  ".claude.json",
  // A folder some repositories keep credentials in.
  "_credentials",
]);

/** `.env`, `.env.local`, `.env.production` — but not the committed templates. */
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/;

export function isSensitivePath(path: string): boolean {
  const segments = path.split(/[\\/]/).filter((segment) => segment !== "");
  if (segments.some((segment) => SECRET_NAMES.has(segment.toLowerCase()))) return true;
  const name = segments.at(-1)?.toLowerCase() ?? "";
  return ENV_FILE.test(name) && !ENV_TEMPLATE.test(name);
}
