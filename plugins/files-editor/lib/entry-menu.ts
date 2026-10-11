/**
 * What the menu of a tree row offers, as data: the same list behind a right
 * click, a long press on a touch screen and the row's "⋯" button.
 *
 * Kept to at most three groups — open, refer to, change — the way Apple's
 * guidelines and VS Code order them. What cannot work here is left out rather
 * than greyed out, and the destructive item comes last.
 */

export type EntryAction =
  | "open"
  | "openInNewTab"
  | "openInMacApp"
  | "revealInFinder"
  | "newFile"
  | "newFolder"
  | "upload"
  | "addToChat"
  | "download"
  | "copyPath"
  | "copyRelativePath"
  | "rename"
  | "duplicate"
  | "moveTo"
  | "trash"
  | "deleteForever";

export interface MenuEntry {
  path: string;
  kind: "file" | "directory";
}

export interface EntryMenuContext {
  /** The checkout is on this Mac: Finder, the Mac app and the Trash are in reach. */
  isLocal: boolean;
  /** A finger, not a mouse: no Finder or Mac app on a phone, and no dragging. */
  isCoarsePointer: boolean;
  /** There is a side panel to open another tab in. */
  canOpenInNewTab: boolean;
  /** There is a thread chat to mention the entry in. */
  canAddToChat: boolean;
  /** Files can be uploaded into this tree's folders: a checkout on this Mac, or Home. */
  canUpload: boolean;
  /** A file can be handed to the browser as a download. */
  canDownload: boolean;
}

export interface EntryMenuItem {
  action: EntryAction;
  label: string;
  isDestructive?: boolean;
}

export const ENTRY_ACTION_LABEL: Readonly<Record<EntryAction, string>> = {
  open: "Open",
  openInNewTab: "Open in new tab",
  openInMacApp: "Open in Mac app",
  revealInFinder: "Reveal in Finder",
  newFile: "New file",
  newFolder: "New folder",
  upload: "Upload…",
  addToChat: "Add to chat",
  download: "Download",
  copyPath: "Copy path",
  copyRelativePath: "Copy relative path",
  rename: "Rename",
  duplicate: "Duplicate",
  moveTo: "Move to…",
  trash: "Move to Trash",
  deleteForever: "Delete forever…",
};

/** Null is the empty space below the rows: new entries at the root. */
export function entryMenuGroups(
  entry: MenuEntry | null,
  context: EntryMenuContext,
): EntryMenuItem[][] {
  const onThisMac = context.isLocal && !context.isCoarsePointer;
  const item = (action: EntryAction, isShown = true): EntryMenuItem[] =>
    isShown
      ? [
          {
            action,
            label: ENTRY_ACTION_LABEL[action],
            ...(action === "trash" || action === "deleteForever" ? { isDestructive: true } : {}),
          },
        ]
      : [];

  if (entry === null) {
    return [[...item("newFile"), ...item("newFolder"), ...item("upload", context.canUpload)]];
  }

  const isFile = entry.kind === "file";
  const open = isFile
    ? [
        ...item("open"),
        ...item("openInNewTab", context.canOpenInNewTab),
        ...item("openInMacApp", onThisMac),
        ...item("revealInFinder", onThisMac),
      ]
    : [
        ...item("newFile"),
        ...item("newFolder"),
        // A plain file picker: on an iPhone it offers Photos and Files.
        ...item("upload", context.canUpload),
        ...item("revealInFinder", onThisMac),
      ];
  const refer = [
    ...item("addToChat", context.canAddToChat),
    ...item("download", isFile && context.canDownload),
    ...item("copyPath"),
    ...item("copyRelativePath"),
  ];
  const change = [
    ...item("rename"),
    // Another machine is reached through BB, which can copy a file's bytes but
    // has no call that copies a folder.
    ...item("duplicate", isFile || context.isLocal),
    // A finger cannot drag a row, so moving gets a menu item instead.
    ...item("moveTo", context.isCoarsePointer),
    // Another machine has no Trash to undo from: deleting there is for good,
    // and asks first.
    ...(context.isLocal ? item("trash") : item("deleteForever")),
  ];
  return [open, refer, change].filter((group) => group.length > 0);
}
