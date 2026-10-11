import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSensitivePath } from "@/lib/secrets";
import { useComposer, useRpc, type ComposerInsertPart } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { EntryAction, EntryMenuContext, MenuEntry } from "@/lib/entry-menu";
import {
  absolutePathFor,
  entryName,
  isSameOrInside,
  joinPath,
  parentPath,
} from "@/lib/entry-paths";
import type { FlatEntry } from "@/lib/tree";
import type { MutationResult, ResolvedScope, rpcContract } from "../server.js";
import { ConfirmDialog, MoveToDialog, type ConfirmRequest } from "./FileDialogs";
import type { Transfers } from "./use-transfers";

/** How long "Undo" stays on the toast after a move to the Trash. */
const UNDO_MS = 8000;

/**
 * What the tree asks of the surface. Typing a name happens in the row itself
 * (rename, a new entry); everything else is one call.
 */
export interface ExplorerOperations {
  menuContext: EntryMenuContext;
  run(action: EntryAction, entry: MenuEntry): void;
  /** True once created; false leaves the name field open to correct. */
  create(parent: string, name: string, kind: MenuEntry["kind"]): Promise<boolean>;
  /** The new path, or null when nothing changed. */
  rename(entry: MenuEntry, name: string): Promise<string | null>;
  /** After asking; the new path, or null when nothing moved. */
  move(entry: MenuEntry, destination: string): Promise<string | null>;
}

export interface FileOperationsOptions {
  scope: ResolvedScope | null;
  entries: readonly FlatEntry[];
  isCoarsePointer: boolean;
  reloadTree: () => void;
  openFile: (path: string) => void;
  openInNewTab?: (path: string) => void;
  openInMacApp: (path: string) => void;
  /** The open file, when it has unsaved edits: nothing renames or removes it under them. */
  dirtyPath: string | null;
  /** An entry, and everything under it, now lives at `to`. */
  onMoved: (from: string, to: string) => void;
  /** An entry, and everything under it, is gone. */
  onRemoved: (path: string) => void;
  /** Upload into a folder, download a file. */
  transfers: Pick<Transfers, "canUpload" | "canDownload" | "pickFiles" | "download">;
}

type Dialog =
  | { kind: "confirm"; request: ConfirmRequest; resolve: (confirmed: boolean) => void }
  | { kind: "moveTo"; entry: MenuEntry; resolve: (folder: string | null) => void };

/**
 * File operations for one surface: the server call, then the tree reread, the
 * open file and Recent following the entry, and a toast that says what
 * happened — or why not. Every outcome rereads the tree: a refusal is usually
 * the panel's snapshot being out of date (an agent got there first).
 */
export function useFileOperations(options: FileOperationsOptions): {
  operations: ExplorerOperations | null;
  dialog: React.ReactNode;
  /** Asks before a secret file leaves the panel; resolves true for any other file. */
  confirmSecret: (path: string, verb: string) => Promise<boolean>;
} {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Toast actions and dialog answers arrive renders later; they read this.
  const latest = useRef(options);
  latest.current = options;

  const { scope, isCoarsePointer } = options;
  const { canUpload, canDownload } = options.transfers;
  const canOpenInNewTab = options.openInNewTab !== undefined;
  const canAddToChat = composer.scope.kind === "thread";

  const ask = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => setDialog({ kind: "confirm", request, resolve })),
    [],
  );

  /**
   * Before a secret file (lib/secrets.ts) leaves this panel — into the chat, a
   * download, another app. True straight away for any other file.
   */
  const confirmSecret = useCallback(
    (path: string, verb: string) =>
      isSensitivePath(path)
        ? ask({
            title: `${verb}: ${entryName(path)}?`,
            description:
              "This looks like a secret file — keys, tokens or passwords. Anything that receives it can read it.",
            confirmLabel: verb,
          })
        : Promise.resolve(true),
    [ask],
  );

  /** Shows a refusal; true when the call went through. */
  const settle = useCallback((result: MutationResult | { ok: false; reason: string }) => {
    latest.current.reloadTree();
    if (!result.ok) toast.error(result.reason);
    return result.ok;
  }, []);

  const failed = useCallback((error: unknown) => {
    latest.current.reloadTree();
    toast.error(error instanceof Error ? error.message : "That did not work.");
  }, []);

  /** Unsaved edits are never moved or thrown away by a file operation. */
  const blockedByEdits = useCallback((entry: MenuEntry): boolean => {
    const dirty = latest.current.dirtyPath;
    if (dirty === null || !isSameOrInside(dirty, entry.path)) return false;
    toast.warning(`${entryName(dirty)} has unsaved changes`, {
      description: "Save them with ⌘S first, or discard them, then try again.",
    });
    return true;
  }, []);

  const copy = useCallback(async (text: string, what: string) => {
    if (await writeClipboard(text)) toast.success(`Copied ${what}`, { description: text });
    else toast.error("Could not reach the clipboard here.", { description: text });
  }, []);

  const addToChat = useCallback(
    async (target: ResolvedScope, entry: MenuEntry) => {
      if (composer.scope.kind !== "thread") {
        toast.error("There is no thread chat here to add it to.");
        return;
      }
      const threadId = composer.scope.threadId;
      // A workspace mention resolves against the thread's own workspace, so
      // it fits only when this tree is that workspace. A tab opened on another
      // checkout adds the absolute path as text instead.
      let isThreadWorkspace = target.ref.kind === "thread" && target.ref.id === threadId;
      if (!isThreadWorkspace) {
        const threadScope = await rpc
          .call("resolve", { scope: { kind: "thread", id: threadId } })
          .catch(() => null);
        isThreadWorkspace =
          threadScope?.ok === true &&
          threadScope.scope.root === target.root &&
          threadScope.scope.hostId === target.hostId;
      }
      const label = entryName(entry.path);
      const part: ComposerInsertPart = isThreadWorkspace
        ? {
            kind: "path",
            path: entry.path,
            source: "workspace",
            entryKind: entry.kind,
            label,
            from: 0,
            to: label.length,
          }
        : absolutePathFor(target.root, entry.path);
      try {
        // At the end, not the cursor: the composer may be off screen (a phone
        // shows this panel as a drawer over it). Not sent — only added.
        composer.insert([part, " "], { at: "end" });
        toast.success(`Added ${label} to the message`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The chat could not take it.");
      }
    },
    [composer, rpc],
  );

  const trash = useCallback(
    async (target: ResolvedScope, entry: MenuEntry) => {
      const result = await rpc.call("trash", { scope: target.ref, path: entry.path });
      if (!settle(result) || !result.ok) return;
      latest.current.onRemoved(entry.path);
      const name = entryName(entry.path);
      const trashedPath = result.trashedPath;
      if (trashedPath === null) {
        toast.success(`${name} moved to Trash`, {
          description: "Put it back from the Trash in Finder.",
        });
        return;
      }
      toast.success(`${name} moved to Trash`, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            void rpc
              .call("restoreFromTrash", { scope: target.ref, path: result.path, trashedPath })
              .then((restored) => {
                if (settle(restored)) toast.success(`${name} is back`);
              })
              .catch(failed);
          },
        },
      });
    },
    [failed, rpc, settle],
  );

  const deleteForever = useCallback(
    async (target: ResolvedScope, entry: MenuEntry) => {
      const name = entryName(entry.path);
      const confirmed = await ask({
        title: `Delete ${name} forever?`,
        description: `${target.hostName} has no Trash to put it back from.${
          entry.kind === "directory" ? " Everything inside the folder goes too." : ""
        }`,
        confirmLabel: "Delete forever",
        isDestructive: true,
      });
      if (!confirmed) return;
      const result = await rpc.call("deleteForever", { scope: target.ref, path: entry.path });
      if (!settle(result)) return;
      latest.current.onRemoved(entry.path);
      toast.success(`${name} deleted`);
    },
    [ask, rpc, settle],
  );

  /** Ask, then move; a name taken there is offered as "keep both". */
  const move = useCallback(
    async (target: ResolvedScope, entry: MenuEntry, destination: string, askFirst: boolean) => {
      const name = entryName(entry.path);
      const folderLabel = destination === "" ? "the workspace root" : entryName(destination);
      const taken = latest.current.entries.some(
        (candidate) => candidate.path === joinPath(destination, name),
      );
      if (taken) {
        const keepBoth = await ask({
          title: `${folderLabel} already has ${name}`,
          description: `Keep both? The one you move becomes a numbered copy, like “${numberedPreview(name)}”. Nothing is replaced.`,
          confirmLabel: "Keep both",
        });
        if (!keepBoth) return null;
      } else if (askFirst) {
        const confirmed = await ask({
          title: `Move ${name}?`,
          description: `Move ${name} to ${folderLabel}.`,
          confirmLabel: "Move",
        });
        if (!confirmed) return null;
      }
      const result = await rpc.call("move", {
        scope: target.ref,
        path: entry.path,
        destination,
        keepBoth: taken,
      });
      if (!settle(result) || !result.ok) return null;
      if (result.path === entry.path) return null;
      latest.current.onMoved(entry.path, result.path);
      return result.path;
    },
    [ask, rpc, settle],
  );

  const run = useCallback(
    (action: EntryAction, entry: MenuEntry) => {
      const target = latest.current.scope;
      if (target === null) return;
      const absolute = absolutePathFor(target.root, entry.path);
      switch (action) {
        case "open":
          latest.current.openFile(entry.path);
          return;
        case "openInNewTab":
          latest.current.openInNewTab?.(entry.path);
          return;
        case "openInMacApp":
          void confirmSecret(entry.path, "Open in Mac app").then((go) => {
            if (go) latest.current.openInMacApp(entry.path);
          });
          return;
        case "revealInFinder":
          void rpc
            .call("revealInFinder", { scope: target.ref, path: entry.path })
            .then((result) => {
              if (!result.ok) settle(result);
            })
            .catch(failed);
          return;
        case "addToChat":
          void confirmSecret(entry.path, "Add to chat").then((go) => {
            if (go) void addToChat(target, entry);
          });
          return;
        case "upload":
          // Straight from the menu's click: the picker opens only on a live gesture.
          latest.current.transfers.pickFiles(
            entry.kind === "directory" ? entry.path : parentPath(entry.path),
          );
          return;
        case "download":
          void confirmSecret(entry.path, "Download").then((go) => {
            if (go) latest.current.transfers.download(entry.path);
          });
          return;
        case "copyPath":
          void copy(absolute, "path");
          return;
        case "copyRelativePath":
          void copy(entry.path, "relative path");
          return;
        case "duplicate":
          void rpc
            .call("duplicate", { scope: target.ref, path: entry.path })
            .then((result) => {
              if (settle(result) && result.ok) toast.success(`Created ${entryName(result.path)}`);
            })
            .catch(failed);
          return;
        case "moveTo":
          if (blockedByEdits(entry)) return;
          void new Promise<string | null>((resolve) =>
            setDialog({ kind: "moveTo", entry, resolve }),
          )
            .then((folder) => (folder === null ? null : move(target, entry, folder, false)))
            .catch(failed);
          return;
        case "trash":
          if (blockedByEdits(entry)) return;
          void trash(target, entry).catch(failed);
          return;
        case "deleteForever":
          if (blockedByEdits(entry)) return;
          void deleteForever(target, entry).catch(failed);
          return;
        // Started in the row itself, where the name is typed.
        case "rename":
        case "newFile":
        case "newFolder":
          return;
      }
    },
    [addToChat, blockedByEdits, confirmSecret, copy, deleteForever, failed, move, rpc, settle, trash],
  );

  const create = useCallback(
    async (parent: string, name: string, kind: MenuEntry["kind"]) => {
      const target = latest.current.scope;
      if (target === null) return false;
      try {
        const result = await rpc.call(kind === "file" ? "createFile" : "createFolder", {
          scope: target.ref,
          parent,
          name,
        });
        if (!settle(result) || !result.ok) return false;
        // A new file is something to write in: open it, as Zed and VS Code do.
        if (kind === "file") latest.current.openFile(result.path);
        return true;
      } catch (error) {
        failed(error);
        return false;
      }
    },
    [failed, rpc, settle],
  );

  const rename = useCallback(
    async (entry: MenuEntry, name: string) => {
      const target = latest.current.scope;
      if (target === null || name === entryName(entry.path)) return null;
      if (blockedByEdits(entry)) return null;
      try {
        const result = await rpc.call("rename", { scope: target.ref, path: entry.path, name });
        if (!settle(result) || !result.ok) return null;
        if (result.path !== entry.path) latest.current.onMoved(entry.path, result.path);
        return result.path;
      } catch (error) {
        failed(error);
        return null;
      }
    },
    [blockedByEdits, failed, rpc, settle],
  );

  const dragMove = useCallback(
    async (entry: MenuEntry, destination: string) => {
      const target = latest.current.scope;
      if (target === null || parentPath(entry.path) === destination) return null;
      if (blockedByEdits(entry)) return null;
      try {
        return await move(target, entry, destination, true);
      } catch (error) {
        failed(error);
        return null;
      }
    },
    [blockedByEdits, failed, move],
  );

  const operations = useMemo<ExplorerOperations | null>(
    () =>
      scope === null
        ? null
        : {
            menuContext: {
              isLocal: scope.isLocal,
              isCoarsePointer,
              canOpenInNewTab,
              canAddToChat,
              canUpload,
              canDownload,
            },
            run,
            create,
            rename,
            move: dragMove,
          },
    [
      canAddToChat,
      canDownload,
      canOpenInNewTab,
      canUpload,
      create,
      dragMove,
      isCoarsePointer,
      rename,
      run,
      scope,
    ],
  );

  const close = () => setDialog(null);
  const rendered =
    dialog === null ? null : dialog.kind === "confirm" ? (
      <ConfirmDialog
        request={dialog.request}
        onAnswer={(confirmed) => {
          close();
          dialog.resolve(confirmed);
        }}
      />
    ) : (
      <MoveToDialog
        entryPath={dialog.entry.path}
        entries={options.entries}
        onPick={(folder) => {
          close();
          dialog.resolve(folder);
        }}
      />
    );

  return { operations, dialog: rendered, confirmSecret };
}

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * A finger rather than a mouse — the type of pointer, not the width of the
 * window, the way `file-manager` decides it. A phone gets the "⋯" on every row
 * and "Move to…" instead of dragging, and no Finder or Mac app.
 */
export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(() => matchesCoarse());
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    const update = () => setIsCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isCoarse;
}

function matchesCoarse(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia(COARSE_POINTER_QUERY).matches;
  } catch {
    return false;
  }
}

function numberedPreview(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? `${name} (1)` : `${name.slice(0, dot)} (1)${name.slice(dot)}`;
}

/** The async clipboard first; the old copy command where a webview withholds it. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}
