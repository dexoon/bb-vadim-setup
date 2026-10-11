// Folder links — a click on a chat link to an existing folder opens that
// folder as a tree in the thread's side panel, instead of BB's browser listing.
//
// Three pieces: a content script catches the click (src/chat-links.ts); an
// invisible thread-header component lets it open a tab in that thread's panel
// (src/PaneBridge.tsx); the tab itself is a panel action (src/FolderPanel.tsx).
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app come from the BB app at load time (never bundled).
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountChatFolderLinks } from "./src/chat-links";
import { FOLDER_ACTION_ID } from "./src/folder-tab";
import { FolderPanel } from "./src/FolderPanel";
import { PaneBridge } from "./src/PaneBridge";

export default definePluginApp((bb) => {
  bb.contentScripts.register({
    id: "chat-folder-links",
    mount: ({ signal }) => mountChatFolderLinks(signal),
  });

  bb.slots.experimental_threadHeaderAction({
    id: "folder-links-pane",
    title: "Folder links",
    component: PaneBridge,
  });

  bb.slots.threadPanelAction({
    id: FOLDER_ACTION_ID,
    title: "Папка из чата",
    icon: "Folder",
    layout: "flush",
    component: FolderPanel,
  });
});
