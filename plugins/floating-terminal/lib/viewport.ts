// Where the *visible* viewport actually is, which on iOS is not where CSS says.
//
// Opening the software keyboard does not change the layout viewport, so a fixed
// element keeps its full height and the bottom of it — the prompt, in a terminal
// — ends up behind the keyboard. visualViewport is the only thing that reports
// the truth, so the sheet's height and offset come from here rather than dvh
// once a keyboard is up.

const HEIGHT_VAR = "--bb-ft-viewport-height";
const TOP_VAR = "--bb-ft-viewport-top";

/**
 * Below this the shortfall is browser chrome (a URL bar collapsing, a toolbar),
 * above it a keyboard. The distinction matters because the home-indicator inset
 * is already inside the keyboard and must not be added twice.
 */
const KEYBOARD_MIN_PX = 120;

export interface ViewportState {
  keyboardOpen: boolean;
}

/**
 * Mirror the visual viewport onto `element` as custom properties, and flag
 * whether a keyboard is up. Returns a teardown.
 */
export function trackVisualViewport(
  element: HTMLElement,
  onChange?: (state: ViewportState) => void,
): () => void {
  const viewport = window.visualViewport;
  if (viewport === undefined || viewport === null) {
    // Every desktop browser bb runs in has it; without it the dvh fallback in
    // the stylesheet is still correct, just not keyboard-aware.
    return () => {};
  }

  let lastKeyboardOpen: boolean | null = null;

  const apply = () => {
    element.style.setProperty(HEIGHT_VAR, `${Math.round(viewport.height)}px`);
    // The layout viewport scrolls under the visual one when the keyboard opens,
    // and a fixed element is positioned against the layout viewport — so this
    // offset is what keeps the sheet inside the part you can actually see.
    element.style.setProperty(TOP_VAR, `${Math.round(viewport.offsetTop)}px`);

    const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
    const keyboardOpen = hidden > KEYBOARD_MIN_PX;
    element.dataset.keyboard = keyboardOpen ? "open" : "closed";
    if (keyboardOpen !== lastKeyboardOpen) {
      lastKeyboardOpen = keyboardOpen;
      onChange?.({ keyboardOpen });
    }
  };

  apply();
  viewport.addEventListener("resize", apply);
  viewport.addEventListener("scroll", apply);
  return () => {
    viewport.removeEventListener("resize", apply);
    viewport.removeEventListener("scroll", apply);
    element.style.removeProperty(HEIGHT_VAR);
    element.style.removeProperty(TOP_VAR);
    delete element.dataset.keyboard;
  };
}

/**
 * Keep an in-flow box above the keyboard. The side-panel tab is not a fixed
 * element we position — bb's drawer places it — so instead of mirroring the
 * viewport into custom properties, this caps the element's height at the part
 * of the visible viewport below its own top edge while a keyboard is up, and
 * hands the height back to the stylesheet once it is gone. Returns a teardown.
 */
export function fitAboveKeyboard(
  element: HTMLElement,
  onChange?: (state: ViewportState) => void,
): () => void {
  const viewport = window.visualViewport;
  if (viewport === undefined || viewport === null) return () => {};

  let lastKeyboardOpen: boolean | null = null;

  const apply = () => {
    const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
    const keyboardOpen = hidden > KEYBOARD_MIN_PX;
    if (keyboardOpen) {
      // Both in layout-viewport coordinates: the visible bottom is where the
      // visual viewport ends, the top is where the drawer put us.
      const visibleBottom = viewport.offsetTop + viewport.height;
      const top = element.getBoundingClientRect().top;
      element.style.height = `${Math.max(0, Math.round(visibleBottom - top))}px`;
    } else {
      element.style.removeProperty("height");
    }
    element.dataset.keyboard = keyboardOpen ? "open" : "closed";
    if (keyboardOpen !== lastKeyboardOpen) {
      lastKeyboardOpen = keyboardOpen;
      onChange?.({ keyboardOpen });
    }
  };

  apply();
  viewport.addEventListener("resize", apply);
  viewport.addEventListener("scroll", apply);
  return () => {
    viewport.removeEventListener("resize", apply);
    viewport.removeEventListener("scroll", apply);
    element.style.removeProperty("height");
    delete element.dataset.keyboard;
  };
}
