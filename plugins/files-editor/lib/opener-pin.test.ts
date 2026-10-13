import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PREVIEW,
  OPENER_PREFERENCE_KEY,
  PIN_DONE_KEY,
  pinHtmlPreview,
} from "./opener-pin.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const preferences = (storage: ReturnType<typeof memoryStorage>) =>
  JSON.parse(storage.values.get(OPENER_PREFERENCE_KEY) ?? "null");

describe("pinHtmlPreview", () => {
  it("pins .html and .htm to BB's preview on a client that chose nothing", () => {
    const storage = memoryStorage();
    const written = pinHtmlPreview(storage);
    expect(preferences(storage)).toEqual({ html: BUILT_IN_PREVIEW, htm: BUILT_IN_PREVIEW });
    expect(written).toBe(storage.values.get(OPENER_PREFERENCE_KEY));
    expect(storage.values.has(PIN_DONE_KEY)).toBe(true);
  });

  it("keeps the other extensions as they are", () => {
    const storage = memoryStorage({
      [OPENER_PREFERENCE_KEY]: JSON.stringify({ md: "plugin:markdown-view:markdown" }),
    });
    pinHtmlPreview(storage);
    expect(preferences(storage)).toEqual({
      md: "plugin:markdown-view:markdown",
      html: BUILT_IN_PREVIEW,
      htm: BUILT_IN_PREVIEW,
    });
  });

  it("never overrides an opener already chosen for .html", () => {
    const storage = memoryStorage({
      [OPENER_PREFERENCE_KEY]: JSON.stringify({ html: "plugin:monaco-editor:monaco" }),
    });
    pinHtmlPreview(storage);
    expect(preferences(storage)).toEqual({
      html: "plugin:monaco-editor:monaco",
      htm: BUILT_IN_PREVIEW,
    });
  });

  it("runs once: Automatic picked afterwards stays Automatic", () => {
    const storage = memoryStorage();
    pinHtmlPreview(storage);
    // Settings → File openers → Automatic deletes the extension's entry.
    storage.setItem(OPENER_PREFERENCE_KEY, JSON.stringify({}));
    expect(pinHtmlPreview(storage)).toBeNull();
    expect(preferences(storage)).toEqual({});
  });

  it("writes nothing when both are chosen, and does not ask again", () => {
    const chosen = JSON.stringify({ html: BUILT_IN_PREVIEW, htm: BUILT_IN_PREVIEW });
    const storage = memoryStorage({ [OPENER_PREFERENCE_KEY]: chosen });
    expect(pinHtmlPreview(storage)).toBeNull();
    expect(storage.values.get(OPENER_PREFERENCE_KEY)).toBe(chosen);
    expect(storage.values.has(PIN_DONE_KEY)).toBe(true);
  });

  it("leaves a value it does not understand alone, and tries again later", () => {
    for (const odd of ["not json", "[]", "null", '"html"']) {
      const storage = memoryStorage({ [OPENER_PREFERENCE_KEY]: odd });
      expect(pinHtmlPreview(storage)).toBeNull();
      expect(storage.values.get(OPENER_PREFERENCE_KEY)).toBe(odd);
      expect(storage.values.has(PIN_DONE_KEY)).toBe(false);
    }
  });
});
