// Where a link in the document leads, decided without touching the page: the
// web through BB's browser preference, mail and phone to the OS, a heading of
// this document, or another file — relative paths from this file's folder, the
// way the chat resolves them. Also the base address relative images load from.
import type { ExperimentalLiveFileTarget } from "@get-bb/plugin-sdk/app";
import type { FileLocation } from "./file-access";

export type LinkAction =
  | { kind: "web"; url: string }
  | { kind: "system"; url: string }
  | { kind: "anchor"; id: string }
  | { kind: "file"; target: ExperimentalLiveFileTarget };

const dirname = (path: string) => path.replace(/\/[^/]*$/, "") || "/";
const trimSlash = (path: string) => path.replace(/\/+$/, "") || "/";

/** `/a/b/../c/./d` → `/a/c/d`; null when `..` climbs above the root. */
function normalize(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return `/${parts.join("/")}`;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** What clicking `href` in `file` should do; null for what it should ignore (javascript:, app schemes). */
export function resolveLink(href: string, file: FileLocation): LinkAction | null {
  const url = href.trim();
  if (url === "") return null;
  if (url.startsWith("#")) return url.length > 1 ? { kind: "anchor", id: decode(url.slice(1)) } : null;
  if (/^https?:/i.test(url)) return { kind: "web", url };
  if (/^(mailto|tel):/i.test(url)) return { kind: "system", url };

  let raw = url;
  if (/^file:/i.test(url)) raw = url.replace(/^file:(\/\/(localhost)?)?/i, "");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;

  const path = decode(raw.split(/[?#]/, 1)[0] ?? "");
  if (path === "") return null;
  const absolute = normalize(path.startsWith("/") ? path : `${dirname(file.path)}/${path}`);
  if (absolute === null) return null;

  if (file.checkout) {
    const root = trimSlash(file.checkout.rootPath);
    if (absolute.startsWith(`${root}/`)) {
      return {
        kind: "file",
        target: { kind: "workspace", environmentId: file.checkout.environmentId, path: absolute.slice(root.length + 1) },
      };
    }
  }
  return { kind: "file", target: { kind: "host", hostId: file.hostId, path: absolute } };
}

/**
 * The folder BB serves to the page so relative images show: the checkout for
 * a project file (so `../img.png` works), otherwise the file's own folder.
 */
export const previewRoot = (file: FileLocation) => trimSlash(file.checkout?.rootPath ?? dirname(file.path));

/** `baseUrl` of a preview of `previewRoot(file)` → the prefix a relative image path is appended to. */
export function linkBase(file: FileLocation, baseUrl: string): string {
  const root = previewRoot(file);
  const folder = dirname(file.path);
  const relative = folder.startsWith(`${root}/`) ? folder.slice(root.length + 1) : "";
  const segments = relative === "" ? [] : relative.split("/").map(encodeURIComponent);
  return `${[baseUrl.replace(/\/+$/, ""), ...segments].join("/")}/`;
}
