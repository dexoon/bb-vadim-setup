// Vditor presses its toolbar buttons on `touchstart` on an iPhone (its
// getEventName(), vditor/src/ts/util/compatibility.ts), and calls
// preventDefault there. With the toolbar turned into one row that scrolls
// sideways (look.ts), a swipe meant to scroll it pressed the button it began
// on — bold, a link, a list — and autosave wrote that to disk. Here a touch on
// the toolbar does not reach those handlers as it happens; only a tap, a touch
// that ends about where it began, is replayed to its button as `touchstart`.

/** How far a finger may drift and still count as a tap, in CSS pixels. */
export const TAP_SLOP_PX = 8;

export interface Point {
  x: number;
  y: number;
}

/** A touch that ended within the slop of where it began. */
export function isTap(start: Point, end: Point, slop = TAP_SLOP_PX): boolean {
  return Math.abs(end.x - start.x) <= slop && Math.abs(end.y - start.y) <= slop;
}

/** Only where Vditor listens for `touchstart` — elsewhere it uses `click`, which a tap already makes. */
export function vditorPressesOnTouchStart(userAgent: string): boolean {
  return userAgent.includes("iPhone");
}

/** Attach to Vditor's toolbar element; returns the detach. */
export function tameToolbarTouches(toolbar: HTMLElement, userAgent = navigator.userAgent): () => void {
  if (!vditorPressesOnTouchStart(userAgent)) return () => {};

  let start: (Point & { target: EventTarget | null }) | null = null;

  const onStart = (event: TouchEvent) => {
    // The replayed press below is not trusted and passes straight through.
    if (!event.isTrusted) return;
    event.stopPropagation();
    const touch = event.touches[0];
    start = touch === undefined ? null : { x: touch.clientX, y: touch.clientY, target: event.target };
  };
  const onMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (start !== null && touch !== undefined && !isTap(start, { x: touch.clientX, y: touch.clientY })) {
      start = null;
    }
  };
  const onEnd = (event: TouchEvent) => {
    const begun = start;
    start = null;
    const touch = event.changedTouches[0];
    if (begun === null || touch === undefined || !(begun.target instanceof Element)) return;
    if (!isTap(begun, { x: touch.clientX, y: touch.clientY })) return;
    // No compatibility click on top of the replayed press.
    event.preventDefault();
    begun.target.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
  };
  const onCancel = () => {
    start = null;
  };

  toolbar.addEventListener("touchstart", onStart, { capture: true, passive: true });
  toolbar.addEventListener("touchmove", onMove, { capture: true, passive: true });
  toolbar.addEventListener("touchend", onEnd, { capture: true });
  toolbar.addEventListener("touchcancel", onCancel, { capture: true });
  return () => {
    toolbar.removeEventListener("touchstart", onStart, { capture: true });
    toolbar.removeEventListener("touchmove", onMove, { capture: true });
    toolbar.removeEventListener("touchend", onEnd, { capture: true });
    toolbar.removeEventListener("touchcancel", onCancel, { capture: true });
  };
}
