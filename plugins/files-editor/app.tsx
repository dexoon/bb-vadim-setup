import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useRpc,
  type PluginFileOpenerProps,
  type PluginNavPanelProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
// Statically imported so the explorer's folder/file glyphs paint on the first
// frame instead of flashing empty while the extended registry loads.
import "@/components/ui/icon-extended";
import { HOME_SCOPE, formatRoute, isScopeKind, parseRoute, sameScope, type ScopeRef } from "@/lib/route";
import { EXPLORER_OPENER_EXTENSIONS } from "@/lib/open-with";
import { pinHtmlPreviewInWindow } from "@/lib/opener-pin";
import {
  panelStateKey,
  parsePanelParams,
  readPanelRoot,
  readPanelState,
  sessionStore,
  writePanelRoot,
  type PanelParams,
  type PanelRoot,
} from "@/lib/panel-state";
import type { rpcContract } from "./server.js";
import { Workspace } from "./components/Workspace";

const PANEL_PATH = "files";
const LAST_SCOPE_KEY = "files-editor:last-scope";

/**
 * The full-page explorer. The route carries both the workspace and the open
 * file, so back/forward walk the files you opened and a link survives a reload.
 */
function FilesPage({ subPath }: PluginNavPanelProps) {
  const navigate = useBbNavigate();
  const context = useBbContext();
  const rpc = useRpc<typeof rpcContract>();
  const route = useMemo(() => parseRoute(subPath), [subPath]);

  // With no workspace in the route, fall back to the thread in view, then to
  // whatever was open last, then to the server's first workspace — a visit
  // straight from the sidebar should land on files, not on an empty pane.
  const [fallback, setFallback] = useState<ScopeRef | null>(null);
  useEffect(() => {
    if (route.scope !== null) return;
    let cancelled = false;

    const guess = async (): Promise<ScopeRef | null> => {
      if (context.threadId !== null) return { kind: "thread", id: context.threadId };
      if (context.projectId !== null) return { kind: "project", id: context.projectId };
      const remembered = readLastScope();
      if (remembered !== null) return remembered;
      return (await rpc.call("workspaces")).defaultRef;
    };

    void guess()
      .then((next) => {
        if (cancelled || next === null) return;
        navigate.toPluginPanel(PANEL_PATH, {
          subPath: formatRoute(next, null),
          replace: true,
        });
        setFallback(next);
      })
      .catch(() => {
        if (!cancelled) setFallback(null);
      });

    return () => {
      cancelled = true;
    };
  }, [context.projectId, context.threadId, navigate, route.scope, rpc]);

  const scope = route.scope ?? fallback;

  useEffect(() => {
    if (scope !== null) storeLastScope(scope);
  }, [scope]);

  const onOpenPath = useCallback(
    (path: string | null) => {
      if (scope === null) return;
      // Compare structurally, not against `subPath`: BB hands the subPath back
      // percent-encoded while formatRoute writes raw segments, so a string
      // compare misses for any path with a space, bracket or non-ASCII name and
      // pushes a duplicate history entry every time that tab is clicked.
      if (sameScope(route.scope, scope) && route.filePath === path) return;
      const next = formatRoute(scope, path);
      // Opening a file is navigation the user should be able to undo, so it
      // pushes. Clearing the last tab only rewinds to the workspace root and
      // would otherwise leave a dead entry between two files.
      navigate.toPluginPanel(PANEL_PATH, {
        subPath: next,
        ...(path === null ? { replace: true } : {}),
      });
    },
    [navigate, route.filePath, route.scope, scope],
  );

  const onChangeScope = useCallback(
    (next: ScopeRef) => {
      navigate.toPluginPanel(PANEL_PATH, { subPath: formatRoute(next, null) });
    },
    [navigate],
  );

  return (
    <Workspace
      scope={scope}
      filePath={route.filePath}
      onOpenPath={onOpenPath}
      onChangeScope={onChangeScope}
      variant="page"
    />
  );
}

/**
 * The same explorer beside a thread, on that thread's workspace — the files
 * the agent in this conversation is actually editing — or, by the switch over
 * the tree, on the home folder of this Mac. Opened by "Open in new tab", it
 * carries the workspace (or Home) and the file it was opened on instead.
 *
 * BB renders every tab of this action through one component instance and only
 * swaps `params`, so the body is keyed by them: each tab then starts from its
 * own file and state rather than from whichever tab mounted first.
 */
function ThreadFilesPanel({ threadId, params }: PluginThreadPanelProps) {
  const opened = useMemo(() => parsePanelParams(params), [params]);
  return (
    <ThreadFilesTab
      key={`${threadId}|${opened.scope?.kind ?? ""}:${opened.scope?.id ?? ""}|${opened.file ?? ""}`}
      threadId={threadId}
      opened={opened}
    />
  );
}

function ThreadFilesTab({ threadId, opened }: { threadId: string; opened: PanelParams }) {
  const isPlainTab = opened.scope === null && opened.file === null;
  const openedRoot: PanelRoot = opened.scope?.kind === "home" ? "home" : "project";
  // A plain tab comes back on the root it was switched to; a tab opened on a
  // file starts where that file is.
  const [root, setRoot] = useState<PanelRoot>(() =>
    isPlainTab ? readPanelRoot(sessionStore(), threadId) : openedRoot,
  );
  const projectKind = opened.scope !== null && opened.scope.kind !== "home" ? opened.scope.kind : "thread";
  const projectId = opened.scope !== null && opened.scope.kind !== "home" ? opened.scope.id : threadId;
  const scope = useMemo<ScopeRef>(
    () => (root === "home" ? { ...HOME_SCOPE } : { kind: projectKind, id: projectId }),
    [projectId, projectKind, root],
  );
  // The tab's own slot while it is on the root its file belongs to.
  const stateKey =
    opened.file === null || root !== openedRoot ? undefined : `${panelStateKey(scope)}#${opened.file}`;
  // Back on the file this tab showed last, not the one it was opened on.
  const [filePath, setFilePath] = useState<string | null>(() =>
    stateKey === undefined || opened.file === null
      ? null
      : (readPanelState(sessionStore(), stateKey).file ?? opened.file),
  );
  const openInNewTab = useOpenInNewTab(scope);

  const changeRoot = useCallback(
    (next: PanelRoot) => {
      if (next === root) return;
      setRoot(next);
      // The other root brings back its own last file from its session slot.
      setFilePath(null);
      if (isPlainTab) writePanelRoot(sessionStore(), threadId, next);
    },
    [isPlainTab, root, threadId],
  );

  return (
    <Workspace
      // Remounted per root: the two trees share nothing but the surface.
      key={`${scope.kind}:${scope.id}`}
      scope={scope}
      filePath={filePath}
      onOpenPath={setFilePath}
      variant="panel"
      stateKey={stateKey}
      onOpenInNewTab={openInNewTab}
      root={root}
      onChangeRoot={changeRoot}
    />
  );
}

/** "Open in new tab": another Explorer_vibecom tab, on this workspace and file. */
function useOpenInNewTab(scope: ScopeRef): (path: string) => void {
  const navigate = useBbNavigate();
  return useCallback(
    (path: string) => {
      const opened = navigate.openThreadPanel({
        actionId: "files",
        title: path.slice(path.lastIndexOf("/") + 1),
        params: { scope: { kind: scope.kind, id: scope.id }, file: path },
      });
      if (!opened) toast.error("This surface has no side panel to open a tab in.");
    },
    [navigate, scope.id, scope.kind],
  );
}

type Located = { status: "locating" } | { status: "found"; scope: ScopeRef; path: string } | { status: "outside" };

/**
 * A file link clicked in the chat: the explorer, with the tree opened down to
 * the file and the file on screen. BB opens one such tab per file. A file the
 * explorer cannot place in a workspace falls back to BB's own preview.
 */
function ExplorerOpener({ path, source, experimental_lineRange, Original }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [located, setLocated] = useState<Located>({ status: "locating" });
  const sourceKey = JSON.stringify([source.kind, source.threadId, source.environmentId, source.projectId, source.experimental_hostId ?? null]);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: Located) => {
      if (!cancelled) setLocated(next);
    };
    if (source.kind === "workspace") {
      const scope: ScopeRef | null =
        source.environmentId !== null
          ? { kind: "environment", id: source.environmentId }
          : source.threadId !== null
            ? { kind: "thread", id: source.threadId }
            : source.projectId !== null
              ? { kind: "project", id: source.projectId }
              : null;
      settle(scope === null ? { status: "outside" } : { status: "found", scope, path });
    } else if (source.kind === "host") {
      // An absolute path, as links in chat are often written: find the
      // workspace it sits in — the thread's own, or any project checkout.
      setLocated({ status: "locating" });
      void rpc
        .call("locate", {
          absolutePath: path,
          hostId: source.experimental_hostId ?? null,
          threadId: source.threadId,
          environmentId: source.environmentId,
        })
        .then((found) =>
          settle(found === null ? { status: "outside" } : { status: "found", scope: found.scope, path: found.path }),
        )
        .catch(() => settle({ status: "outside" }));
    } else {
      settle({ status: "outside" });
    }
    return () => {
      cancelled = true;
    };
    // Keyed on the source's value; BB hands a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, sourceKey, rpc]);

  if (located.status === "outside") return <Original />;
  if (located.status === "locating") return null;
  return (
    <OpenerWorkspace
      key={`${located.scope.kind}:${located.scope.id}:${located.path}`}
      scope={located.scope}
      path={located.path}
      line={experimental_lineRange?.startLineNumber ?? null}
    />
  );
}

function OpenerWorkspace({ scope, path, line }: { scope: ScopeRef; path: string; line: number | null }) {
  const stateKey = `${panelStateKey(scope)}@${path}`;
  // Back on the file this tab showed last, not the one the link named.
  const [startFile] = useState(() => readPanelState(sessionStore(), stateKey).file ?? path);
  const [filePath, setFilePath] = useState<string | null>(startFile);
  // The link's line belongs to the link's file: a tab that comes back (after
  // a reload) on another file is not scrolled to that line number.
  const lineForStart = startFile === path ? line : null;
  const openInNewTab = useOpenInNewTab(scope);
  return (
    <Workspace
      scope={scope}
      filePath={filePath}
      onOpenPath={setFilePath}
      variant="panel"
      stateKey={stateKey}
      initialLine={lineForStart}
      onOpenInNewTab={openInNewTab}
    />
  );
}

function readLastScope(): ScopeRef | null {
  try {
    const raw = window.localStorage.getItem(LAST_SCOPE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "kind" in parsed &&
      "id" in parsed &&
      typeof (parsed as ScopeRef).id === "string" &&
      isScopeKind(String((parsed as ScopeRef).kind))
    ) {
      return parsed as ScopeRef;
    }
    return null;
  } catch {
    return null;
  }
}

function storeLastScope(scope: ScopeRef): void {
  try {
    window.localStorage.setItem(LAST_SCOPE_KEY, JSON.stringify(scope));
  } catch {
    // Storage can be unavailable; the next visit just starts from the thread.
  }
}

/**
 * Rendered on the plugin's own page in Tools, beside the declarative settings.
 * BB has no manifest field for a screenshot, so a plugin that wants to show
 * what it looks like has to draw its own section.
 */
function PreviewSection() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; src: string } | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void rpc
      .call("preview")
      .then(({ baseUrl }) => {
        // A confined, expiring host URL for the plugin's own docs directory —
        // no network fetch, and nothing outside that directory is reachable.
        if (!cancelled) setState({ kind: "ready", src: `${baseUrl}/preview.png` });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  // Silent on failure: an image that will not load is not worth an error box
  // on a page whose job is the settings below it.
  if (state.kind !== "ready") return null;

  return (
    <figure className="space-y-2">
      <img
        src={state.src}
        alt="The Files panel: project and worktree pickers over a file tree, tabs, find-in-file, and the open file"
        className="w-full rounded-lg border border-border"
      />
      <figcaption className="text-xs text-muted-foreground">
        An illustration of the layout, not a screenshot.
      </figcaption>
    </figure>
  );
}

export default definePluginApp((app) => {
  // A link to an HTML file shows the page, not its source: BB's own preview
  // is pinned for .html and .htm on this client, once (lib/opener-pin.ts).
  pinHtmlPreviewInWindow();

  app.slots.settingsSection({
    id: "preview",
    title: "What it looks like",
    description:
      "A searchable tree on the left, tabs across the top, the whole file in the middle.",
    component: PreviewSection,
  });

  app.slots.navPanel({
    id: "files",
    title: "Files",
    icon: "Code",
    path: PANEL_PATH,
    component: FilesPage,
  });

  // Clicking a file link in the chat opens the explorer on that file, once
  // Explorer_vibecom is the file's opener (automatic, or chosen in Settings →
  // File openers on each client).
  app.slots.fileOpener({
    id: "explorer",
    title: "Explorer_vibecom",
    extensions: EXPLORER_OPENER_EXTENSIONS,
    component: ExplorerOpener,
  });

  app.slots.threadPanelAction({
    id: "files",
    title: "Explorer_vibecom",
    icon: "Code",
    layout: "flush",
    component: ThreadFilesPanel,
    run: ({ openPanel }) => {
      openPanel({ title: "Explorer_vibecom" });
    },
  });

  app.slots.commandPaletteAction({
    id: "open-files",
    title: "Files: browse this thread's project",
    // The palette opens anywhere, but this action needs a thread side panel.
    isAvailable: ({ threadId }) => threadId !== null,
    run: ({ openPanel }) => {
      if (!openPanel({ actionId: "files", title: "Explorer_vibecom" })) {
        toast.error("Open a thread to browse its project files.");
      }
    },
  });
});
