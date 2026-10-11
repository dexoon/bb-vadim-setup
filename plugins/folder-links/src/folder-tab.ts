// The folder tab's identity: the panel action it is opened through and the
// shape of its persisted params.
import type { JsonValue } from "@get-bb/plugin-sdk/app";

export const FOLDER_ACTION_ID = "folder";

/**
 * Tab params come back from persistence: trust only absolute path strings.
 * `missing` is the path a link named when `path`, its nearest existing
 * folder, is shown instead.
 */
export function folderTabOf(params: JsonValue | null): { path: string; missing: string | null } | null {
  if (params === null || typeof params !== "object" || Array.isArray(params)) return null;
  const { path, missing } = params;
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  return { path, missing: typeof missing === "string" && missing.startsWith("/") ? missing : null };
}

export function folderTitle(path: string): string {
  const name = path.replace(/\/+$/u, "").split("/").pop();
  return name === undefined || name === "" ? "/" : name;
}
