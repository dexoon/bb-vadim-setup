// bb-plugin-floating-terminal — frontend entry.
//
// Two frames around the same shells. A tab in the thread's side panel, opened
// from the panel's "+" menu or bb's Ctrl+` command; and the floating window — a
// content script that mounts its React root into document.body — opened from
// the sidebar footer, or by Ctrl+` where there is no thread to dock into. All
// entry points drive the same external controllers, so they work no matter
// which finished mounting first.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FloatingTerminal } from "@/components/floating-terminal";
import { PanelTerminal } from "@/components/panel-terminal";
import { panelController, windowController } from "@/lib/controller";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

const PANEL_ACTION_ID = "terminal";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "floating-window",
    mount({ signal }) {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      root.render(createElement(FloatingTerminal));

      signal.addEventListener(
        "abort",
        () => {
          // Unmount off the current task: React refuses to unmount a root
          // while it is rendering, which is exactly when a reload can land.
          queueMicrotask(() => root.unmount());
          container.remove();
        },
        { once: true },
      );
    },
  });

  app.slots.sidebarFooterAction({
    id: "toggle",
    title: "Floating terminal",
    icon: "Terminal",
    run() {
      windowController.toggle();
    },
  });

  // No params: reopening focuses the one tab a thread has instead of stacking
  // another — the shells are switched inside it, by its own tab strip.
  app.slots.threadPanelAction({
    id: PANEL_ACTION_ID,
    title: "Terminal_vibecom",
    icon: "Terminal",
    layout: "flush",
    component: PanelTerminal,
  });

  // bb owns the key: it is listed in Settings → Keyboard, where it can be
  // rebound or cleared. In a thread it docks the terminal beside it; elsewhere
  // there is no side panel, so it toggles the floating window instead.
  app.commands.register({
    id: "open",
    title: "Terminal_vibecom: open in side panel",
    defaultShortcut: { key: "`", control: true },
    run({ threadId, openPanel }) {
      if (threadId !== null && openPanel({ actionId: PANEL_ACTION_ID })) {
        windowController.hide();
        panelController.requestFocus();
        return;
      }
      windowController.toggle();
    },
  });
});
