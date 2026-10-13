import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { PAGE_PREVIEW_TTL_MS, pageServing, pageUrl } from "@/lib/html-page";
import { Centered } from "./FileView";

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

/**
 * An HTML file as a browser shows it. The frame runs the page's scripts in a
 * sandbox with an opaque origin: no BB cookies, storage or parent page, and BB
 * refuses its API to requests from there (`Origin: null` gets 403). BB serves
 * the file under the same `sandbox allow-scripts` policy, so the page gets no
 * more even when its address is opened on its own.
 *
 * The page is the file on disk. `revision` — the file's hash — reloads it once
 * a save lands; a fresh address per load also outlives the one-hour lease.
 */
export function HtmlPage({
  hostId,
  root,
  path,
  wholeWorkspace,
  revision,
}: {
  hostId: string;
  /** The panel's root: the workspace, or the home folder. */
  root: string;
  /** The page, relative to `root`. */
  path: string;
  /** Serve the whole workspace to the page, or only its own folder (Home). */
  wholeWorkspace: boolean;
  revision: string | null;
}) {
  const sdk = useSdk();
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    const serving = pageServing(root, path, wholeWorkspace);
    sdk.files
      .createPreview({
        hostId,
        rootPath: serving.rootPath,
        ttlMs: PAGE_PREVIEW_TTL_MS,
        signal: controller.signal,
      })
      .then((preview) => {
        if (!controller.signal.aborted) {
          setState({ kind: "ready", url: pageUrl(preview.baseUrl, serving.pagePath) });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not open the page",
        });
      });
    return () => controller.abort();
  }, [sdk, hostId, root, path, wholeWorkspace, revision]);

  if (state.kind === "loading") {
    return (
      <Centered>
        <Icon name="Loading" aria-hidden className="size-4 animate-spin" />
        <span>Opening {path}…</span>
      </Centered>
    );
  }
  if (state.kind === "error") {
    return (
      <Centered tone="error">
        <Icon name="AlertTriangle" aria-hidden className="size-4" />
        <span>{state.message}</span>
      </Centered>
    );
  }
  return (
    <iframe
      // Keyed by address: a new lease is a new page, not a navigation of the old frame.
      key={state.url}
      src={state.url}
      title={path}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      // White, as a browser draws a page that sets no background of its own:
      // the panel's dark theme behind it would hide black text.
      className="min-h-0 w-full flex-1 border-0 bg-white"
    />
  );
}
