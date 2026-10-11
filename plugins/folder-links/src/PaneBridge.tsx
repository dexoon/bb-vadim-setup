// Mounted in every thread header, invisible. It registers the thread view as a
// pane, so a chat-link click can open the folder tab in this thread's side
// panel: BB gives that ability only to components inside the thread view.
import { useEffect, useRef } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import type { RpcContract } from "../rpc";
import { registerPane } from "./panes";
import { FOLDER_ACTION_ID, folderTitle } from "./folder-tab";

export function PaneBridge({ threadId }: PluginThreadHeaderActionProps) {
  const navigate = useBbNavigate();
  const rpc = useRpc<RpcContract>();
  const latest = useRef({ navigate, rpc });
  latest.current = { navigate, rpc };
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = marker.current;
    if (element === null) return;
    return registerPane({
      element,
      openFolder: (path, missing) =>
        latest.current.navigate.openThreadPanel({
          actionId: FOLDER_ACTION_ID,
          title: folderTitle(path),
          params: missing === undefined ? { path } : { path, missing },
        }),
      inspect: async (paths) => (await latest.current.rpc.call("inspect", { paths })).results,
    });
  }, [threadId]);

  return <span ref={marker} hidden />;
}
