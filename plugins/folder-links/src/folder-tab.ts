// The folder tab's identity: the panel action it is opened through and the
// shape of its persisted params.
import type { JsonValue } from "@get-bb/plugin-sdk/app";
import { isAbsoluteLinkPath } from "./link-path";

export { folderTitle } from "./link-path";

export const FOLDER_ACTION_ID = "folder";

/**
 * Tab params come back from persistence: trust only absolute path strings
 * (`/…`, or `C:\…` from a Windows server). `missing` is the path a link named
 * when `path`, its nearest existing folder, is shown instead.
 */
export function folderTabOf(params: JsonValue | null): { path: string; missing: string | null } | null {
  if (params === null || typeof params !== "object" || Array.isArray(params)) return null;
  const { path, missing } = params;
  if (typeof path !== "string" || !isAbsoluteLinkPath(path)) return null;
  return { path, missing: typeof missing === "string" && isAbsoluteLinkPath(missing) ? missing : null };
}
