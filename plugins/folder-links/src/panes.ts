// The bridge between the chat-link listener and the thread views on screen.
//
// A click on a link arrives at the app window, but only a component mounted
// inside a thread view can open a tab in that thread's side panel. So every
// thread header registers a pane here while it is mounted, and the listener
// hands the click to the pane the link belongs to. No pane — no interception:
// the click stays BB's.
import type { PathKind } from "./folders";

/** The server's answer for one link path, as it comes over RPC. */
export interface LinkVerdict {
  path: string;
  kind: PathKind | "missing-folder";
  nearest?: string;
}

export interface Pane {
  /** An element inside this thread view: tells which pane a link belongs to. */
  element: Element;
  /**
   * Opens the folder tab in this thread's side panel; false when BB declined.
   * `missing` is the path the link named when `path` is shown instead of it.
   */
  openFolder(path: string, missing?: string): boolean;
  inspect(paths: string[]): Promise<LinkVerdict[]>;
}

const panes = new Set<Pane>();
const listeners = new Set<() => void>();

export function registerPane(pane: Pane): () => void {
  panes.add(pane);
  for (const listener of Array.from(listeners)) listener();
  return () => {
    panes.delete(pane);
  };
}

/** Called whenever a pane appears: links already on screen can be checked now. */
export function onPaneAdded(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Any pane on screen, for questions that do not depend on the thread. */
export function anyPane(): Pane | null {
  for (const pane of panes) if (pane.element.isConnected) return pane;
  return null;
}

function depthOf(node: Element): number {
  let depth = 0;
  for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) depth += 1;
  return depth;
}

function commonAncestor(a: Element, b: Element): Element | null {
  const ancestors = new Set<Element>();
  for (let node: Element | null = a; node !== null; node = node.parentElement) ancestors.add(node);
  for (let node: Element | null = b; node !== null; node = node.parentElement) if (ancestors.has(node)) return node;
  return null;
}

/**
 * The pane whose thread view holds `node`: in a split layout the link shares
 * a deeper ancestor with its own thread's header than with the other one.
 * Two equally close panes mean the link is in neither — then null.
 */
export function paneFor(node: Element): Pane | null {
  let best: Pane | null = null;
  let bestDepth = -1;
  let tie = false;
  for (const pane of panes) {
    if (!pane.element.isConnected) continue;
    const common = commonAncestor(pane.element, node);
    if (common === null) continue;
    const depth = depthOf(common);
    if (depth > bestDepth) {
      best = pane;
      bestDepth = depth;
      tie = false;
    } else if (depth === bestDepth) {
      tie = true;
    }
  }
  return tie ? null : best;
}
