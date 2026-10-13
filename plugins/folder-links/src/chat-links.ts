// Content script: a click on a chat link to an existing folder opens the
// folder tab in the thread's side panel instead of BB's browser listing.
//
// Which links are folders is decided by the server for the exact path in the
// link, ahead of the click: a click handler cannot wait for the server. Links
// are checked as they appear in a message and again on hover, so a folder
// created or deleted since is seen before the click.
//
// Two answers are intercepted: a folder, and a missing path BB would send to
// its browser — then the nearest existing folder up that path is shown, with
// a note. Everything else — a file, a missing `foo.md`, a path outside the
// home folder, an unanswered question — is left to BB untouched, and so is
// every click with a modifier key.
import { linkPath } from "./link-path";
import { anyPane, onPaneAdded, paneFor } from "./panes";
import type { LinkVerdict } from "./panes";

/** BB marks the rendered body of a chat message with this class. */
const MESSAGE_SELECTOR = ".group\\/message";
const LINK_SELECTOR = `${MESSAGE_SELECTOR} a[href]`;
/** On hover, a verdict older than this is asked again. */
const STALE_MS = 15_000;
const SWEEP_DELAY_MS = 400;
const BATCH = 200;

function chatLinkOf(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement && anchor.closest(MESSAGE_SELECTOR) !== null ? anchor : null;
}

export function mountChatFolderLinks(signal: AbortSignal): void {
  const verdicts = new Map<string, LinkVerdict & { at: number }>();
  const asking = new Set<string>();
  const queued = new Set<string>();
  let sweepTimer: number | null = null;

  const ask = (paths: string[]): void => {
    const pane = anyPane();
    const fresh = paths.filter((path) => !asking.has(path));
    if (pane === null || fresh.length === 0) return;
    for (const path of fresh) asking.add(path);
    void pane
      .inspect(fresh)
      .then((results) => {
        const at = Date.now();
        for (const verdict of results) verdicts.set(verdict.path, { ...verdict, at });
      })
      // A failed question leaves the link to BB; the next sweep or hover asks again.
      .catch(() => undefined)
      .finally(() => {
        for (const path of fresh) asking.delete(path);
      });
  };

  const sweep = (): void => {
    sweepTimer = null;
    if (signal.aborted) return;
    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR))) {
      const path = linkPath(anchor.getAttribute("href") ?? "");
      if (path !== null && !verdicts.has(path)) queued.add(path);
    }
    const paths = Array.from(queued);
    queued.clear();
    for (let i = 0; i < paths.length; i += BATCH) ask(paths.slice(i, i + BATCH));
  };

  const queueSweep = (): void => {
    if (sweepTimer === null && !signal.aborted) sweepTimer = window.setTimeout(sweep, SWEEP_DELAY_MS);
  };

  const onHover = (event: Event): void => {
    const anchor = chatLinkOf(event.target);
    if (anchor === null) return;
    const path = linkPath(anchor.getAttribute("href") ?? "");
    if (path === null) return;
    const verdict = verdicts.get(path);
    if (verdict === undefined || Date.now() - verdict.at > STALE_MS) ask([path]);
  };

  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = chatLinkOf(event.target);
    if (anchor === null) return;
    const path = linkPath(anchor.getAttribute("href") ?? "");
    if (path === null) return;
    const verdict = verdicts.get(path);
    const shown =
      verdict?.kind === "directory" ? path : verdict?.kind === "missing-folder" ? verdict.nearest : undefined;
    if (shown === undefined) return;
    const pane = paneFor(anchor);
    if (pane === null) return;
    let opened = false;
    try {
      opened = pane.openFolder(shown, shown === path ? undefined : path);
    } catch {
      opened = false;
    }
    if (!opened) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  // The window is the first stop of the capture phase, ahead of the React
  // root that runs BB's own link handler.
  window.addEventListener("click", onClick, { capture: true, signal });
  window.addEventListener("pointerover", onHover, { capture: true, passive: true, signal });

  // Only a change inside a message, or a newly added message, can bring a
  // link. The mutation target's own subtree is not searched: the messages are
  // already in the document, so that would match every update of the page.
  const insideMessage = (node: Node): boolean => {
    const element = node instanceof Element ? node : node.parentElement;
    return element !== null && element.closest(MESSAGE_SELECTOR) !== null;
  };
  const bringsMessage = (node: Node): boolean =>
    insideMessage(node) || (node instanceof Element && node.querySelector(MESSAGE_SELECTOR) !== null);
  const observer = new MutationObserver((records) => {
    if (records.some((record) => insideMessage(record.target) || Array.from(record.addedNodes).some(bringsMessage))) {
      queueSweep();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const stopListening = onPaneAdded(queueSweep);

  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      stopListening();
      if (sweepTimer !== null) window.clearTimeout(sweepTimer);
    },
    { once: true },
  );
  queueSweep();
}
