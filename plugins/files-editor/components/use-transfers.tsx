import { useCallback, useRef } from "react";
import {
  experimental_usePluginId,
  useRpc,
  type PluginRpcClient,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { entryName } from "@/lib/entry-paths";
import { formatBytes } from "@/lib/file-kind";
import { downloadUrl, pluginTokenUrl, uploadChunkUrl } from "@/lib/transfer";
import {
  UploadManager,
  UploadRefusal,
  batchSummary,
  type UploadRpc,
  type UploadState,
} from "@/lib/upload-manager";
import type { ResolvedScope, rpcContract } from "../server.js";

type Client = PluginRpcClient<typeof rpcContract>;

/** The panel's RPC client, as the four calls the upload manager makes. */
function uploadRpcFrom(client: Client): UploadRpc {
  return {
    async create(input) {
      const result = await client.call("uploadCreate", input);
      if (!result.ok) throw new UploadRefusal(result.code, result.reason);
      return result;
    },
    async status(uploadId) {
      const result = await client.call("uploadStatus", { uploadId });
      return result.found ? { receivedBytes: result.receivedBytes } : null;
    },
    async finish(scope, uploadId) {
      const result = await client.call("uploadFinish", { scope, uploadId });
      if (!result.ok) throw new UploadRefusal(result.code, result.reason);
      return result.path;
    },
    async abort(uploadId) {
      await client.call("uploadAbort", { uploadId });
    },
  };
}

/**
 * One manager for the whole app, not one per panel: BB unmounts a panel tab
 * whenever another tab is picked, and an upload must keep going through that.
 * It reads the RPC client most recently handed to it.
 */
let shared: { pluginId: string; manager: UploadManager; client: { current: Client | null } } | null = null;

function sharedManager(pluginId: string, client: Client): UploadManager {
  if (shared === null || shared.pluginId !== pluginId) {
    const holder: { current: Client | null } = { current: client };
    shared = {
      pluginId,
      client: holder,
      manager: new UploadManager({
        rpc: () => {
          if (holder.current === null) throw new Error("The panel is not connected.");
          return uploadRpcFrom(holder.current);
        },
        tokenUrl: pluginTokenUrl(pluginId),
        chunkUrl: (uploadId, offset) => uploadChunkUrl(pluginId, uploadId, offset),
      }),
    };
  }
  shared.client.current = client;
  return shared.manager;
}

/** A thin bar in the toast; inline styles, because toasts render outside the plugin's styles. */
function ProgressLine({ sent, size }: { sent: number; size: number }) {
  const percent = size === 0 ? 100 : Math.min(100, Math.floor((sent / size) * 100));
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span>
        {formatBytes(sent)} of {formatBytes(size)} · {percent}%
      </span>
      <span style={{ display: "block", height: 3, borderRadius: 2, background: "rgba(127,127,127,0.25)" }}>
        <span
          style={{
            display: "block",
            height: 3,
            borderRadius: 2,
            width: `${percent}%`,
            background: "currentColor",
            transition: "width 150ms linear",
          }}
        />
      </span>
    </span>
  );
}

/**
 * One toast per batch of files: progress while it runs, then what landed
 * where, or why not with a Retry that resumes from the bytes already there.
 */
function trackBatch(
  manager: UploadManager,
  batchId: string,
  folderLabel: string,
  onSettled: (states: UploadState[]) => void,
): void {
  const toastId = `files-editor-upload:${batchId}`;
  let unsubscribe: () => void = () => {};
  const render = (all: readonly UploadState[]) => {
    const states = all.filter((state) => state.batchId === batchId);
    if (states.length === 0) {
      unsubscribe();
      toast.dismiss(toastId);
      return;
    }
    const summary = batchSummary(states);
    const title =
      states.length === 1 ? `Uploading ${states[0]!.fileName}` : `Uploading ${states.length} files`;
    if (summary.active > 0) {
      toast.loading(title, {
        id: toastId,
        description: <ProgressLine sent={summary.sentBytes} size={summary.sizeBytes} />,
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "Cancel",
          onClick: (event) => {
            // Kept open: the same toast turns into "Upload canceled".
            event.preventDefault();
            for (const state of states) manager.cancel(state.id);
          },
        },
      });
      return;
    }

    unsubscribe();
    onSettled(states);
    const failed = states.filter((state) => state.status === "error");
    const done = states.filter((state) => state.status === "done");
    if (failed.length > 0) {
      toast.error(
        failed.length === 1 ? `${failed[0]!.fileName} was not uploaded` : `${failed.length} files were not uploaded`,
        {
          id: toastId,
          description: failed[0]!.errorMessage ?? undefined,
          duration: Number.POSITIVE_INFINITY,
          action: {
            // Picks up from what the server already has, not from zero.
            label: "Retry",
            onClick: (event) => {
              // Kept open: the same toast goes back to showing progress.
              event.preventDefault();
              for (const state of failed) manager.retry(state.id);
              trackBatch(manager, batchId, folderLabel, onSettled);
            },
          },
        },
      );
      return;
    }
    if (done.length === 0) {
      toast("Upload canceled", { id: toastId });
      return;
    }
    // `name (1)` when the name was taken: say what it is called now.
    const landed = done.map((state) => entryName(state.resultPath ?? state.fileName));
    toast.success(done.length === 1 ? `Uploaded ${landed[0]}` : `Uploaded ${done.length} files`, {
      id: toastId,
      description: `Into ${folderLabel}`,
      duration: 4000,
    });
  };
  unsubscribe = manager.subscribe(render);
  render(manager.getState());
}

export interface Transfers {
  /** A checkout on this Mac or Home: the server can place files there. */
  canUpload: boolean;
  canDownload: boolean;
  /** Files from Finder (a drop) or from the picker, into a folder; "" is the root. */
  upload(folder: string, files: readonly File[]): void;
  /** Opens the system file picker for a folder. Call it straight from a click. */
  pickFiles(folder: string): void;
  download(path: string): void;
  /** The hidden file input the picker opens; render it once in the surface. */
  input: React.ReactNode;
}

export function useTransfers({
  scope,
  reloadTree,
}: {
  scope: ResolvedScope | null;
  reloadTree: () => void;
}): Transfers {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = experimental_usePluginId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickedFolder = useRef("");
  // A batch finishes many renders after it started; it reloads the tree as it is then.
  const reloadRef = useRef(reloadTree);
  reloadRef.current = reloadTree;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const canUpload = scope?.isLocal === true;

  const upload = useCallback(
    (folder: string, files: readonly File[]) => {
      const target = scopeRef.current;
      if (target === null || files.length === 0) return;
      if (!target.isLocal) {
        toast.error(`Uploads go to a workspace on this Mac or to Home; this one is on ${target.hostName}.`);
        return;
      }
      const manager = sharedManager(pluginId, rpc);
      const created = manager.enqueue(files.map((file) => ({ file, scope: target.ref, folder })));
      const batchId = created[0]?.batchId;
      if (batchId === undefined) return;
      const folderLabel = folder === "" ? target.label : entryName(folder);
      trackBatch(manager, batchId, folderLabel, () => reloadRef.current());
    },
    [pluginId, rpc],
  );

  const pickFiles = useCallback((folder: string) => {
    const input = inputRef.current;
    if (input === null) return;
    pickedFolder.current = folder;
    // Synchronously, inside the click: a file picker opens only on a live gesture.
    input.click();
  }, []);

  const download = useCallback(
    (path: string) => {
      const target = scopeRef.current;
      if (target === null) return;
      // A navigation, not a fetch: the response streams to disk and the
      // panel never holds the file — the way file-manager's lib/download.ts
      // does it. The server's Content-Disposition names the file.
      const anchor = document.createElement("a");
      anchor.href = downloadUrl(pluginId, target.ref, path);
      anchor.download = entryName(path);
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      toast(`Downloading ${entryName(path)}`, {
        description: target.isLocal ? undefined : `From ${target.hostName}: files up to 25 MB only.`,
      });
    },
    [pluginId],
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      onChange={(event) => {
        const files = event.target.files === null ? [] : Array.from(event.target.files);
        // Cleared, or picking the same file again would not fire a change.
        event.target.value = "";
        upload(pickedFolder.current, files);
      }}
    />
  );

  return { canUpload, canDownload: scope !== null, upload, pickFiles, download, input };
}
