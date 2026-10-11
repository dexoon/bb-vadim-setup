// The symbol font warm-up shared by every terminal in the page.
//
// The contract: the font loads once, and when it lands every terminal still
// open drops its view of the shared atlas together — never one alone, which is
// what scrambled the other tabs. State is module-wide, so each test imports a
// fresh copy.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Module = typeof import("./symbol-font");

async function freshModule(): Promise<Module> {
  vi.resetModules();
  return import("./symbol-font");
}

function terminal() {
  return { clearTextureAtlas: vi.fn() };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let the warm-up's `.then` run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let mod: Module;

beforeEach(async () => {
  mod = await freshModule();
});

describe("trackSymbolFont", () => {
  it("loads the font once, however many terminals open", () => {
    const warm = vi.fn(() => new Promise(() => {}));
    mod.trackSymbolFont(terminal(), warm);
    mod.trackSymbolFont(terminal(), warm);
    mod.trackSymbolFont(terminal(), warm);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("clears every open terminal when the font lands, not just the first", async () => {
    const load = deferred();
    const first = terminal();
    const second = terminal();
    mod.trackSymbolFont(first, () => load.promise);
    mod.trackSymbolFont(second, () => load.promise);

    load.resolve();
    await settle();

    expect(first.clearTextureAtlas).toHaveBeenCalledTimes(1);
    expect(second.clearTextureAtlas).toHaveBeenCalledTimes(1);
  });

  it("leaves terminals opened after the font alone", async () => {
    const early = terminal();
    mod.trackSymbolFont(early, () => Promise.resolve());
    await settle();

    const late = terminal();
    const warm = vi.fn(() => Promise.resolve());
    mod.trackSymbolFont(late, warm);
    await settle();

    expect(warm).not.toHaveBeenCalled();
    expect(late.clearTextureAtlas).not.toHaveBeenCalled();
    expect(early.clearTextureAtlas).toHaveBeenCalledTimes(1);
  });

  it("skips a terminal closed before the font lands", async () => {
    const load = deferred();
    const closed = terminal();
    const open = terminal();
    const untrack = mod.trackSymbolFont(closed, () => load.promise);
    mod.trackSymbolFont(open, () => load.promise);

    untrack();
    load.resolve();
    await settle();

    expect(closed.clearTextureAtlas).not.toHaveBeenCalled();
    expect(open.clearTextureAtlas).toHaveBeenCalledTimes(1);
  });

  it("clears nothing and throws nothing when the font fails to load", async () => {
    const load = deferred();
    const owner = terminal();
    mod.trackSymbolFont(owner, () => load.promise);

    load.reject(new Error("font blocked"));
    await settle();

    expect(owner.clearTextureAtlas).not.toHaveBeenCalled();
  });
});
