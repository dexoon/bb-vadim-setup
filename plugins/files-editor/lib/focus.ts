/**
 * When the explorer may take the keyboard. It focuses its root on mount, so ⌘P
 * and ⌘S work before anything inside is clicked, and a file's textarea when the
 * file opens. But it also mounts by itself — the thread panel shown with ⌘J, a
 * file link opened from the chat, BB or the plugin reloaded — and taking focus
 * then pulled the caret out of whatever the user was typing in: the thread's
 * message box, the terminal. Focus now moves only when nobody types elsewhere.
 */

/** Where focus is free to take: the explorer's surface, marked on its root element. */
export const EXPLORER_ROOT_ATTRIBUTE = "data-explorer-root";

/** The parts of the focused element looked at here; any DOM element has them. */
export interface FocusedElement {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

/** Inputs that hold no typing: a click on them is not text entry. */
const NON_TEXT_INPUTS: ReadonlySet<string> = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

/** Whether keys pressed now would type into `element`: a text field, a textarea, editable content. */
export function isTextEntry(element: FocusedElement): boolean {
  if (element.isContentEditable === true) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea") return true;
  return tag === "input" && !NON_TEXT_INPUTS.has((element.type ?? "text").toLowerCase());
}

/**
 * Whether the explorer may focus something now. Yes when focus is nowhere
 * (`body`), already inside the explorer, or on something that takes no typing —
 * the link in the chat that opened the file, a button. No when another field is
 * being typed into.
 */
export function mayTakeFocus<T extends FocusedElement>(
  root: { contains(node: T): boolean } | null,
  active: T | null,
  body: unknown,
): boolean {
  if (active === null || active === body) return true;
  if (root !== null && root.contains(active)) return true;
  return !isTextEntry(active);
}

/** Focuses `element` unless another field outside the explorer is being typed into. */
export function focusIfFree(element: HTMLElement | null, options?: FocusOptions): void {
  if (element === null) return;
  const root = element.closest<HTMLElement>(`[${EXPLORER_ROOT_ATTRIBUTE}]`) ?? element;
  if (!mayTakeFocus<Element>(root, document.activeElement, document.body)) return;
  element.focus(options);
}
