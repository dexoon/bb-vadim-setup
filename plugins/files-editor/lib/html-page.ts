/**
 * Where an HTML page in Preview is loaded from. The frame cannot be handed the
 * text: a `srcdoc` document inherits BB's own content policy, which may stop
 * the page's scripts, and needs a `<base>` that breaks `#section` links. So BB
 * serves a folder for a while (`sdk.files.createPreview`) and the frame loads
 * the page from there — with the files beside it, `style.css`, `img/chart.png`,
 * `../shared.css`, and nothing above that folder.
 */
import { absolutePathFor } from "./entry-paths.js";

/** How long the address lives. BB allows a minute to an hour; Read → Preview asks for a new one. */
export const PAGE_PREVIEW_TTL_MS = 60 * 60 * 1000;

export interface PageServing {
  /** The absolute folder BB serves. */
  rootPath: string;
  /** The page, relative to `rootPath`, with `/` separators. */
  pagePath: string;
}

/**
 * What to serve for `path`, relative to the panel's `root`. A project or a
 * thread serves its whole workspace, so a page reaches anything in it. Home is
 * the whole home folder — far more than a page should reach — so there only
 * the page's own folder is served.
 */
export function pageServing(root: string, path: string, wholeWorkspace: boolean): PageServing {
  const slash = path.lastIndexOf("/");
  if (wholeWorkspace || slash === -1) return { rootPath: absolutePathFor(root, ""), pagePath: path };
  return { rootPath: absolutePathFor(root, path.slice(0, slash)), pagePath: path.slice(slash + 1) };
}

/** The frame's address: BB's base for the folder, then the page, each segment escaped. */
export function pageUrl(baseUrl: string, pagePath: string): string {
  const segments = pagePath
    .split("/")
    .filter((segment) => segment !== "")
    .map(encodeURIComponent);
  return [baseUrl.replace(/\/+$/, ""), ...segments].join("/");
}
