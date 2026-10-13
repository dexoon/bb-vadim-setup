/**
 * Pins BB's own preview as the opener of `.html` and `.htm` on this client —
 * once per client.
 *
 * Unpinned, BB opens an HTML link with the first plugin that claims it: the
 * builtin File Editor, which shows the source. BB's own preview shows the page.
 * The choice lives in each client's localStorage — Settings → Files → File
 * openers — so the Mac app and a phone's browser each need it, and this plugin
 * runs in both.
 *
 * The key and its value are BB's internals, not the SDK: should BB rename them,
 * nothing is pinned and links show the source again — nothing breaks.
 */

/** Where BB keeps Settings → Files → File openers: extension → opener key. */
export const OPENER_PREFERENCE_KEY = "bb.fileOpenerByExtension";
/** "Built-in preview" in that list. */
export const BUILT_IN_PREVIEW = "__builtin__";
export const PINNED_EXTENSIONS: readonly string[] = ["html", "htm"];
/**
 * Set after the first pass. Picking "Automatic" afterwards removes the pin,
 * and the plugin must not put it back on the next load.
 */
export const PIN_DONE_KEY = "files-editor:html-preview-pinned";

type PinStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Pins each extension of `PINNED_EXTENSIONS` that has no opener chosen yet.
 * Returns the new value when it wrote one — the caller tells BB — and null
 * when there was nothing to do: done before, all chosen already, or the
 * stored value is not the object this expects.
 */
export function pinHtmlPreview(storage: PinStorage): string | null {
  if (storage.getItem(PIN_DONE_KEY) !== null) return null;

  const raw = storage.getItem(OPENER_PREFERENCE_KEY);
  let preferences: unknown = {};
  if (raw !== null) {
    try {
      preferences = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  // Something BB writes differently now: leave it alone, and look again next time.
  if (typeof preferences !== "object" || preferences === null || Array.isArray(preferences)) {
    return null;
  }

  const next: Record<string, unknown> = { ...preferences };
  const missing = PINNED_EXTENSIONS.filter((extension) => !(extension in next));
  for (const extension of missing) next[extension] = BUILT_IN_PREVIEW;

  storage.setItem(PIN_DONE_KEY, new Date().toISOString());
  if (missing.length === 0) return null;
  const value = JSON.stringify(next);
  storage.setItem(OPENER_PREFERENCE_KEY, value);
  return value;
}

/**
 * Pins in this window's localStorage and tells BB. BB listens for `storage`
 * events on that key, so the open app takes the pin at once, without a reload,
 * and never writes its older copy back over it.
 */
export function pinHtmlPreviewInWindow(): void {
  try {
    const storage = window.localStorage;
    const oldValue = storage.getItem(OPENER_PREFERENCE_KEY);
    const newValue = pinHtmlPreview(storage);
    if (newValue === null) return;
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: OPENER_PREFERENCE_KEY,
        oldValue,
        newValue,
        storageArea: storage,
        url: window.location.href,
      }),
    );
  } catch {
    // No storage in this webview, or it is full: links keep BB's own choice.
  }
}
