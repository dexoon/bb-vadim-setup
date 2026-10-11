// Hands things the panel can't show over to BB or the OS: the whole file to
// its default macOS app, links clicked inside a document to BB's browser.
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { ExperimentalLiveFileTarget, PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";

/** The file as BB's navigation API names it, or null when the source lacks the id it needs. */
export function liveTarget(path: string, source: PluginFileOpenerSource): ExperimentalLiveFileTarget | null {
  switch (source.kind) {
    case "workspace":
      return source.environmentId === null ? null : { kind: "workspace", environmentId: source.environmentId, path };
    case "thread-storage":
      return source.threadId === null ? null : { kind: "thread-storage", threadId: source.threadId, path };
    case "host":
      return source.experimental_hostId ? { kind: "host", hostId: source.experimental_hostId, path } : null;
  }
}

/** Opens the file in its default app (Word, Keynote, Preview…); null when BB can't address it. */
export function useOpenExternally(path: string, source: PluginFileOpenerSource): (() => boolean) | null {
  const navigate = useBbNavigate();
  const target = liveTarget(path, source);
  return target ? () => navigate.experimental_openFileExternally({ target, location: null }) : null;
}

const SAFE_SCHEME = /^(https?|mailto|tel):/i;

/**
 * Follows a link clicked inside a rendered document: http(s) through BB's
 * browser preference, mailto/tel to the OS. Anything else (javascript:,
 * file:, app schemes) is ignored. Returns whether the link was followed.
 */
export function useFollowLink(): (href: string) => boolean {
  const navigate = useBbNavigate();
  return (href) => {
    const url = href.trim();
    if (!SAFE_SCHEME.test(url)) return false;
    if (/^https?:/i.test(url)) return navigate.openUrl(url);
    // mailto:/tel: — a plain anchor click, like such links in BB's chat: the OS picks the app.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener noreferrer";
    anchor.click();
    return true;
  };
}
