// What every opener shares: download the file, show a spinner while it loads
// and parses, a notice with ways out when it can't be shown, and a toolbar.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import type { PluginFileOpenerProps, PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";
import { useOpenExternally } from "./external";
import { FileTooLargeError, locateFile, readFileBytes } from "./fetch-file";

export const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
export const SMALL_BUTTON =
  "inline-flex h-7 flex-none items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string }
  | { status: "no-source" };

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex h-full min-h-0 items-center justify-center gap-2 text-sm text-muted-foreground">
      <span className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground" aria-hidden />
      {label}
    </div>
  );
}

/** A message in the middle of the panel with the ways out that apply. */
export function Notice({
  message,
  alert = false,
  path,
  source,
  onRetry,
  onOriginal,
}: {
  message: string;
  alert?: boolean;
  path: string;
  source: PluginFileOpenerSource;
  onRetry?: () => void;
  onOriginal?: () => void;
}) {
  const openExternally = useOpenExternally(path, source);
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <p role={alert ? "alert" : undefined} className={`text-sm ${alert ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {openExternally && (
            <button type="button" className={BUTTON} onClick={openExternally}>
              Открыть во внешнем приложении
            </button>
          )}
          {onRetry && (
            <button type="button" className={BUTTON} onClick={onRetry}>
              Повторить
            </button>
          )}
          {onOriginal && (
            <button type="button" className={BUTTON} onClick={onOriginal}>
              Стандартный просмотр
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Thin bar above a document: what it is on the left, reload and hand-off on the right. */
export function Toolbar({
  path,
  source,
  onReload,
  children,
}: {
  path: string;
  source: PluginFileOpenerSource;
  onReload: () => void;
  children?: ReactNode;
}) {
  const openExternally = useOpenExternally(path, source);
  return (
    <div className="flex h-10 flex-none items-center gap-2 border-b border-border px-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</div>
      <button type="button" className={SMALL_BUTTON} onClick={onReload} title="Перечитать файл с диска">
        Обновить
      </button>
      {openExternally && (
        <button type="button" className={SMALL_BUTTON} onClick={openExternally} title="Открыть приложением по умолчанию">
          Во внешнем приложении
        </button>
      )}
    </div>
  );
}

/**
 * Downloads the opened file, turns its bytes into T with `load`, and renders
 * `children(value, reload)`. Loading, errors and files over BB's 25 MiB limit
 * get the shared screens; a file BB gave no source for falls back to `Original`.
 */
export function FileOpener<T>({
  path,
  source,
  Original,
  loadingLabel,
  load,
  children,
}: PluginFileOpenerProps & {
  loadingLabel: string;
  load: (bytes: Uint8Array, signal: AbortSignal) => Promise<T>;
  children: (value: T, reload: () => void) => ReactNode;
}) {
  const sdk = useSdk();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [showOriginal, setShowOriginal] = useState(false);
  // Latest values for the effect, which restarts only when the file does.
  const latest = useRef({ sdk, source, load });
  latest.current = { sdk, source, load };
  const key = JSON.stringify([source.kind, source.threadId, source.environmentId, source.projectId, source.experimental_hostId ?? null]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState({ status: "loading" });
    locateFile(latest.current.sdk, path, latest.current.source, signal)
      .then(async (file) => {
        if (file === null) return null;
        const bytes = await readFileBytes(latest.current.sdk, file, signal);
        // Yield once so the spinner paints before parsing blocks the main thread.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { value: await latest.current.load(bytes, signal) };
      })
      .then(
        (loaded) => {
          if (signal.aborted) return;
          setState(loaded === null ? { status: "no-source" } : { status: "ready", value: loaded.value });
        },
        (cause: unknown) => {
          if (signal.aborted) return;
          const message =
            cause instanceof FileTooLargeError
              ? `${cause.message} Откройте его во внешнем приложении.`
              : cause instanceof Error
                ? cause.message
                : String(cause);
          setState({ status: "error", message });
        },
      );
    return () => controller.abort();
  }, [path, key, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  if (state.status === "no-source" || showOriginal) return <Original />;
  if (state.status === "loading") return <Loading label={loadingLabel} />;
  if (state.status === "error") {
    return (
      <Notice
        alert
        message={state.message}
        path={path}
        source={source}
        onRetry={reload}
        onOriginal={() => setShowOriginal(true)}
      />
    );
  }
  return <>{children(state.value, reload)}</>;
}
