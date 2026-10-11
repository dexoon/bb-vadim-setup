import { describe, expect, it } from "vitest";
import { HOME_SCOPE, formatRoute, isHomeScope, isScopeKind, parseRoute, sameScope } from "./route.js";

describe("routes", () => {
  it("carries Home and the file open in it", () => {
    expect(formatRoute(HOME_SCOPE, "Downloads/a b.pdf")).toBe("home/local/Downloads/a b.pdf");
    expect(parseRoute("home/local/Downloads/a%20b.pdf")).toEqual({
      scope: { kind: "home", id: "local" },
      filePath: "Downloads/a b.pdf",
    });
    expect(parseRoute("home/local")).toEqual({ scope: { kind: "home", id: "local" }, filePath: null });
  });

  it("still refuses a kind it does not know", () => {
    expect(parseRoute("disk/x/a.md")).toEqual({ scope: null, filePath: null });
    expect(isScopeKind("home")).toBe(true);
    expect(isScopeKind("disk")).toBe(false);
  });

  it("tells Home from a workspace", () => {
    expect(isHomeScope({ kind: "home", id: "local" })).toBe(true);
    expect(isHomeScope({ kind: "thread", id: "thr_1" })).toBe(false);
    expect(isHomeScope(null)).toBe(false);
    expect(sameScope(HOME_SCOPE, { kind: "home", id: "local" })).toBe(true);
  });
});
