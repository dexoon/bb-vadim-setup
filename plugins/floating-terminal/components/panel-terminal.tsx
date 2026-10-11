// The terminal as a tab in a thread's side panel: the second frame around a
// TerminalSurface.
//
// bb sizes and places the tab (layout "flush" hands over the whole box), so
// this frame has no geometry of its own. It owns three things the window does
// not need: getting out of the floating window's way, staying above the iOS
// keyboard inside bb's drawer, and keeping a finger drag on the terminal from
// being read as the drawer's swipe-to-close.
//
// The shells are the same ones the window shows — one list on the server — so
// only one frame drives them at a time: opening the tab hides the window, and
// while the window is open the tab steps aside instead of fighting it over the
// PTY's size.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { TerminalSurface } from "@/components/terminal-surface";
import { panelController, windowController } from "@/lib/controller";
import { fitAboveKeyboard } from "@/lib/viewport";

export function PanelTerminal(_props: PluginThreadPanelProps) {
  const windowOpen = useSyncExternalStore(
    windowController.subscribe,
    windowController.isOpen,
  );
  const focusVersion = useSyncExternalStore(
    panelController.subscribe,
    panelController.focusRequests,
  );
  const compact = useIsCompactViewport();
  const [fitVersion, setFitVersion] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    windowController.hide();
  }, []);

  // A desktop panel is never covered by a keyboard; on a phone the drawer is.
  useEffect(() => {
    const node = rootRef.current;
    if (!compact || node === null) return;
    return fitAboveKeyboard(node, () => {
      setFitVersion((version) => version + 1);
    });
  }, [compact]);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Terminal"
      data-layout="panel"
      // bb's drawer closes on a sideways swipe; the terminal owns its gestures.
      data-no-secondary-panel-swipe=""
      className="bb-ft-surface bb-ft-panel relative flex size-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground"
    >
      <TerminalSurface
        active={!windowOpen}
        compact={compact}
        fitVersion={fitVersion}
        focusVersion={focusVersion}
        emptyHint="Pick where it runs. Shells keep going when this tab is closed."
        maximize={null}
        onHide={null}
      />

      {windowOpen ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Your shells are open in the floating window.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              windowController.hide();
              panelController.requestFocus();
            }}
          >
            Show here
          </Button>
        </div>
      ) : null}
    </div>
  );
}
