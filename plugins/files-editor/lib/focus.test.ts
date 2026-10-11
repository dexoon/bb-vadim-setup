import { describe, expect, it } from "vitest";
import { isTextEntry, mayTakeFocus, type FocusedElement } from "./focus.js";

const body: FocusedElement = { tagName: "BODY" };
const composer: FocusedElement = { tagName: "DIV", isContentEditable: true };
const terminal: FocusedElement = { tagName: "TEXTAREA" };
const chatLink: FocusedElement = { tagName: "A" };
const treeFilter: FocusedElement = { tagName: "INPUT", type: "search" };

/** An explorer surface holding exactly `inside`. */
const explorer = (...inside: FocusedElement[]) => ({ contains: (node: FocusedElement) => inside.includes(node) });

describe("isTextEntry", () => {
  it("counts what typing goes into", () => {
    expect(isTextEntry(composer)).toBe(true);
    expect(isTextEntry(terminal)).toBe(true);
    expect(isTextEntry(treeFilter)).toBe(true);
    expect(isTextEntry({ tagName: "INPUT" })).toBe(true);
  });

  it("does not count what a click lands on", () => {
    expect(isTextEntry(chatLink)).toBe(false);
    expect(isTextEntry({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEntry({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextEntry({ tagName: "DIV", isContentEditable: false })).toBe(false);
  });
});

describe("mayTakeFocus", () => {
  it("leaves the thread's message box alone while it is typed into", () => {
    expect(mayTakeFocus(explorer(), composer, body)).toBe(false);
  });

  it("leaves the terminal alone", () => {
    expect(mayTakeFocus(explorer(), terminal, body)).toBe(false);
  });

  it("takes focus that is nowhere", () => {
    expect(mayTakeFocus(explorer(), body, body)).toBe(true);
    expect(mayTakeFocus(explorer(), null, body)).toBe(true);
  });

  it("takes it from the chat link that opened the file, so ⌘P and ⌘S work", () => {
    expect(mayTakeFocus(explorer(), chatLink, body)).toBe(true);
  });

  it("moves it within the explorer, from its own filter to the opened file", () => {
    expect(mayTakeFocus(explorer(treeFilter), treeFilter, body)).toBe(true);
  });
});
