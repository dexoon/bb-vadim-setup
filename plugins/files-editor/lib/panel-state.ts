/**
 * What a panel remembers about one workspace for the length of the session:
 * the open file, the recently opened ones, and which folders are expanded.
 * BB unmounts a panel tab whenever another tab is selected, so without this
 * every return to the tree started from a collapsed root and an empty editor.
 */
import { isScopeKind, type ScopeRef } from "./route.js";

export interface PanelState {
  file: string | null;
  recent: string[];
  expanded: string[];
}

export const RECENT_LIMIT = 15;

const KEY_PREFIX = "files-editor:panel:";

export const EMPTY_PANEL_STATE: PanelState = { file: null, recent: [], expanded: [] };

export function panelStateKey(scope: ScopeRef): string {
  return `${KEY_PREFIX}${scope.kind}:${scope.id}`;
}

/** Anything unreadable — absent, corrupt, from an older shape — reads as empty. */
export function parsePanelState(raw: string | null): PanelState {
  if (raw === null) return EMPTY_PANEL_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return EMPTY_PANEL_STATE;
    const record = value as Record<string, unknown>;
    return {
      file: typeof record.file === "string" ? record.file : null,
      recent: stringList(record.recent).slice(0, RECENT_LIMIT),
      expanded: stringList(record.expanded),
    };
  } catch {
    return EMPTY_PANEL_STATE;
  }
}

/** The path moves to the front; a repeat is not listed twice. */
export function pushRecent(recent: readonly string[], path: string): string[] {
  return [path, ...recent.filter((candidate) => candidate !== path)].slice(0, RECENT_LIMIT);
}

/** A renamed or deleted file leaves the list rather than lingering as a dead entry. */
export function dropRecent(recent: readonly string[], path: string): string[] {
  return recent.filter((candidate) => candidate !== path);
}

export function readPanelState(storage: Pick<Storage, "getItem"> | null, key: string): PanelState {
  if (storage === null) return EMPTY_PANEL_STATE;
  try {
    return parsePanelState(storage.getItem(key));
  } catch {
    return EMPTY_PANEL_STATE;
  }
}

export function writePanelState(
  storage: Pick<Storage, "setItem"> | null,
  key: string,
  state: PanelState,
): void {
  if (storage === null) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can be full or unavailable; the panel simply forgets on remount.
  }
}

/** The session store, or null where the webview has none. */
export function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * What a panel tab was opened on: the workspace and the file. A plain
 * Explorer_vibecom tab has neither; "Open in new tab" passes both, and BB
 * keeps them with the tab across reloads. Anything malformed reads as absent.
 */
export interface PanelParams {
  scope: ScopeRef | null;
  file: string | null;
}

export function parsePanelParams(params: unknown): PanelParams {
  if (typeof params !== "object" || params === null) return { scope: null, file: null };
  const record = params as Record<string, unknown>;
  const file = typeof record.file === "string" && record.file !== "" ? record.file : null;
  const scope = record.scope;
  const isScope =
    typeof scope === "object" &&
    scope !== null &&
    isScopeKind(String((scope as ScopeRef).kind)) &&
    typeof (scope as ScopeRef).id === "string" &&
    (scope as ScopeRef).id !== "";
  return {
    scope: isScope ? { kind: (scope as ScopeRef).kind, id: (scope as ScopeRef).id } : null,
    file,
  };
}

/**
 * What a thread's plain Explorer_vibecom tab is rooted at: the thread's own
 * project, or the home folder of this Mac. Kept per thread for the session,
 * because BB unmounts the tab whenever another one is selected.
 */
export type PanelRoot = "project" | "home";

const ROOT_KEY_PREFIX = "files-editor:root:";

export function panelRootKey(threadId: string): string {
  return `${ROOT_KEY_PREFIX}${threadId}`;
}

/** Anything but a stored "home" is the project: that is where a thread tab starts. */
export function readPanelRoot(storage: Pick<Storage, "getItem"> | null, threadId: string): PanelRoot {
  if (storage === null) return "project";
  try {
    return storage.getItem(panelRootKey(threadId)) === "home" ? "home" : "project";
  } catch {
    return "project";
  }
}

export function writePanelRoot(
  storage: Pick<Storage, "setItem"> | null,
  threadId: string,
  root: PanelRoot,
): void {
  if (storage === null) return;
  try {
    storage.setItem(panelRootKey(threadId), root);
  } catch {
    // Unavailable storage: the tab starts on the project next time.
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
