// The floating terminal window: the frame around a TerminalSurface.
//
// This component owns only what makes it a window — open state (via the
// external controller), geometry (via the frame helpers), drag and resize, the
// phone sheet with its backdrop, and maximize. The tab strip, the shells, find
// and the key bar are the surface's, shared with the side-panel tab. The only
// imperative islands here are the pointer-capture drag/resize handlers, behind
// refs.
//
// Nothing renders until the window is first opened; from then on it stays
// mounted even while hidden, which is what keeps every tab's scrollback alive.
// Show/hide is a CSS transition driven by data-state.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { TerminalSurface } from "@/components/terminal-surface";
import { windowController } from "@/lib/controller";
import {
  clampFrame,
  installDrag,
  installResize,
  loadFrame,
  RESIZE_EDGES,
  saveFrame,
  type Frame,
} from "@/lib/frame";
import { trackVisualViewport } from "@/lib/viewport";

/** Edge hit areas, wide enough to grab without visually thickening the border. */
const EDGE_CLASS: Record<string, string> = {
  n: "absolute inset-x-3 top-0 h-1.5 cursor-ns-resize",
  s: "absolute inset-x-3 bottom-0 h-1.5 cursor-ns-resize",
  e: "absolute inset-y-3 right-0 w-1.5 cursor-ew-resize",
  w: "absolute inset-y-3 left-0 w-1.5 cursor-ew-resize",
  ne: "absolute right-0 top-0 size-3 cursor-nesw-resize",
  nw: "absolute left-0 top-0 size-3 cursor-nwse-resize",
  se: "absolute bottom-0 right-0 size-3 cursor-nwse-resize",
  sw: "absolute bottom-0 left-0 size-3 cursor-nesw-resize",
};

/** Maximized keeps a sliver of app visible, so it still reads as a window. */
const MAX_GUTTER = 16;

export function FloatingTerminal() {
  const open = useSyncExternalStore(
    windowController.subscribe,
    windowController.isOpen,
  );

  /**
   * Below bb's own compact-viewport breakpoint the window becomes a sheet: it
   * fills the viewport minus one inset, styles.css owns the geometry, and drag
   * and resize are never installed. Everything else about it is unchanged.
   */
  const sheet = useIsCompactViewport();
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const [fitVersion, setFitVersion] = useState(0);
  /** Never persisted: a maximized session is a mood, not a layout. */
  const [maximized, setMaximized] = useState(false);
  /**
   * BB appends the plugin stylesheet to <head> without awaiting its load, so
   * anything rendered before it arrives paints unstyled — a full-width block of
   * raw markup at the end of <body> that snaps away when the CSS lands. Staying
   * out of the DOM until the window is first opened removes that window
   * entirely, and costs nothing for a session where it is never used.
   */
  const [mounted, setMounted] = useState(false);
  /** One frame behind `mounted`, so the first open still animates in. */
  const [armed, setArmed] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const edgeRefs = useRef(new Map<string, HTMLDivElement>());
  const maximizedRef = useRef(false);
  maximizedRef.current = maximized;

  // Geometry lives in a ref (the drag handlers read and write it every pointer
  // move) and is mirrored onto the element directly — re-rendering React 60
  // times a second to move a window is the wrong tool.
  const frameRef = useRef<Frame>(loadFrame());

  const applyFrame = useCallback((next: Frame) => {
    const node = rootRef.current;
    if (sheetRef.current) {
      // Hand geometry back to the stylesheet. Inline styles outrank a class,
      // so leaving the last desktop frame here would pin the sheet to a
      // 760x460 box in the corner.
      //
      // And do not record the frame while the sheet owns layout. Every window
      // resize runs the stored frame through clampFrame, so at phone width the
      // remembered *desktop* geometry was being clamped to the phone's — a
      // window that came back 393px wide the moment the viewport widened again.
      if (node !== null) {
        node.style.removeProperty("left");
        node.style.removeProperty("top");
        node.style.removeProperty("width");
        node.style.removeProperty("height");
      }
      return;
    }
    frameRef.current = next;
    if (node === null) return;
    // Maximized paints its own geometry but must not overwrite the remembered
    // frame — restore has to put the window back exactly where it was.
    const rect = maximizedRef.current
      ? {
          x: MAX_GUTTER,
          y: MAX_GUTTER,
          width: window.innerWidth - 2 * MAX_GUTTER,
          height: window.innerHeight - 2 * MAX_GUTTER,
        }
      : next;
    node.style.left = `${rect.x}px`;
    node.style.top = `${rect.y}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
  }, []);

  const commitFrame = useCallback(
    (next: Frame) => {
      applyFrame(next);
      saveFrame(next);
      setFitVersion((version) => version + 1);
    },
    [applyFrame],
  );

  useEffect(() => {
    if (sheet) setMaximized(false);
  }, [sheet]);

  // ----------------------------------------------------------------- init

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // A freshly inserted element has no previous value to transition from, so
  // the entrance is painted in one step unless the closed state renders first.
  useEffect(() => {
    if (!mounted || armed) return;
    const raf = window.requestAnimationFrame(() => setArmed(true));
    return () => window.cancelAnimationFrame(raf);
  }, [mounted, armed]);

  // ------------------------------------------------------------- gestures

  useEffect(() => {
    const header = headerRef.current;
    // A sheet is pinned to the viewport, and a drag handle across its top would
    // only compete with the scroll gesture underneath it. A maximized window
    // has nowhere to be dragged to.
    if (header === null || sheet || maximized) return;
    const aborter = new AbortController();
    const options = {
      getFrame: () => frameRef.current,
      onChange: applyFrame,
      onCommit: commitFrame,
    };
    installDrag(header, options, aborter.signal);
    for (const edge of RESIZE_EDGES) {
      const node = edgeRefs.current.get(edge);
      if (node !== undefined) {
        installResize(node, edge, options, aborter.signal);
      }
    }
    return () => aborter.abort();
  }, [applyFrame, commitFrame, mounted, sheet, maximized]);

  // ---------------------------------------------------------- environment

  useEffect(() => {
    // Coming back from the sheet, re-read the window's own geometry rather than
    // trusting memory: a frame first computed while the viewport was phone-sized
    // (a session that started narrow and was widened) would otherwise become a
    // 360px desktop window. Storage holds the last committed drag, or nothing,
    // in which case loadFrame derives the default for the viewport we are in now.
    applyFrame(sheet ? frameRef.current : loadFrame());
    setFitVersion((version) => version + 1);
  }, [applyFrame, mounted, sheet, maximized]);

  useEffect(() => {
    if (!open) return;
    applyFrame(clampFrame(frameRef.current));
    setFitVersion((version) => version + 1);
  }, [open, applyFrame]);

  useEffect(() => {
    const onResize = () => applyFrame(clampFrame(frameRef.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyFrame]);

  // Only the sheet needs this: a desktop window is never covered by a keyboard,
  // and writing the custom properties there would fight the inline geometry.
  useEffect(() => {
    const node = rootRef.current;
    if (!sheet || node === null) return;
    return trackVisualViewport(node, () => {
      // The box just changed under xterm; the pump's ResizeObserver catches the
      // height, this makes sure the active tab is scrolled back to the prompt.
      setFitVersion((version) => version + 1);
    });
  }, [sheet, mounted]);

  // --------------------------------------------------------------- render

  const hide = useCallback(() => windowController.hide(), []);

  // The title-bar convention from every desktop OS. Interactive children (tabs,
  // buttons, the picker) stop the double-click the same way they stop the drag.
  const onHeaderDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (sheetRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-drag]") != null) return;
      setMaximized((value) => !value);
    },
    [],
  );

  if (!mounted) return null;

  return (
    <>
      {/* Only the sheet gets a scrim. The desktop window is deliberately
          non-modal — bb stays usable behind it — but at this width the sheet
          covers nearly everything, so a blurred backdrop is what makes it read
          as one layer above the app rather than a panel welded to it. */}
      {sheet ? (
        <div
          className="bb-ft-backdrop"
          data-state={open && armed ? "open" : "closed"}
          aria-hidden="true"
          onPointerDown={hide}
        />
      ) : null}
      <div
        ref={rootRef}
        // A region, not a dialog: bb treats any open [role="dialog"] as a modal
        // and silences every shortcut while it is up — Ctrl+` included, which
        // left the window impossible to put away from the keyboard. Non-modal
        // on purpose: the point of this window is that bb stays usable behind it.
        role="region"
        aria-label="Floating terminal"
        aria-hidden={!open}
        data-state={open && armed ? "open" : "closed"}
        data-layout={sheet ? "sheet" : "window"}
        // Stacking lives in styles.css, where the backdrop and window are kept in
        // one place relative to bb's own layers.
        className="bb-ft-window bb-ft-surface fixed flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
      >
        <TerminalSurface
          active={open}
          compact={sheet}
          fitVersion={fitVersion}
          focusVersion={0}
          emptyHint="Pick where it runs. Shells keep going while this window is hidden."
          maximize={
            sheet
              ? null
              : {
                  on: maximized,
                  toggle: () => setMaximized((value) => !value),
                }
          }
          onHide={hide}
          headerProps={{
            ref: headerRef,
            "data-bb-ft-handle": "",
            onDoubleClick: onHeaderDoubleClick,
          }}
        />

        {sheet || maximized
          ? null
          : RESIZE_EDGES.map((edge) => (
              <div
                key={edge}
                ref={(node) => {
                  if (node === null) edgeRefs.current.delete(edge);
                  else edgeRefs.current.set(edge, node);
                }}
                className={EDGE_CLASS[edge] ?? ""}
                aria-hidden="true"
              />
            ))}
      </div>
    </>
  );
}
