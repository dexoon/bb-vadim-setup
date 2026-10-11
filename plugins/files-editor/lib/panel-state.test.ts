import { describe, expect, it } from "vitest";
import {
  EMPTY_PANEL_STATE,
  RECENT_LIMIT,
  dropRecent,
  panelStateKey,
  parsePanelParams,
  parsePanelState,
  pushRecent,
  readPanelRoot,
  readPanelState,
  writePanelRoot,
  writePanelState,
} from "./panel-state.js";

const scope = { kind: "thread", id: "thr_1" } as const;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("pushRecent", () => {
  it("puts the newest file first", () => {
    expect(pushRecent(["a.md", "b.md"], "c.md")).toEqual(["c.md", "a.md", "b.md"]);
  });

  it("moves a file already listed instead of listing it twice", () => {
    expect(pushRecent(["a.md", "b.md", "c.md"], "b.md")).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("keeps only the most recent ones", () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, index) => `f${index}.md`);
    const next = pushRecent(many, "new.md");
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("new.md");
    expect(next).not.toContain(`f${RECENT_LIMIT - 1}.md`);
  });
});

describe("dropRecent", () => {
  it("removes a file that is gone", () => {
    expect(dropRecent(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });
});

describe("parsePanelState", () => {
  it("reads what was written", () => {
    const state = { file: "plan.md", recent: ["plan.md", "a.pdf"], expanded: ["_reports"] };
    expect(parsePanelState(JSON.stringify(state))).toEqual(state);
  });

  it("treats absent, corrupt or foreign values as empty", () => {
    expect(parsePanelState(null)).toEqual(EMPTY_PANEL_STATE);
    expect(parsePanelState("{not json")).toEqual(EMPTY_PANEL_STATE);
    expect(parsePanelState("42")).toEqual(EMPTY_PANEL_STATE);
    expect(parsePanelState(JSON.stringify({ file: 7, recent: "x", expanded: [1, "src"] }))).toEqual({
      file: null,
      recent: [],
      expanded: ["src"],
    });
  });
});

describe("readPanelState / writePanelState", () => {
  it("round-trips per workspace", () => {
    const storage = memoryStorage();
    writePanelState(storage, panelStateKey(scope), { file: "a.md", recent: ["a.md"], expanded: ["docs"] });
    expect(readPanelState(storage, panelStateKey(scope)).file).toBe("a.md");
    expect(readPanelState(storage, panelStateKey({ kind: "thread", id: "thr_2" }))).toEqual(EMPTY_PANEL_STATE);
  });

  it("keys by the kind and id of the workspace", () => {
    expect(panelStateKey(scope)).toBe("files-editor:panel:thread:thr_1");
  });

  it("does nothing without storage", () => {
    expect(readPanelState(null, "k")).toEqual(EMPTY_PANEL_STATE);
    expect(() => writePanelState(null, "k", EMPTY_PANEL_STATE)).not.toThrow();
  });
});

describe("parsePanelParams", () => {
  it("reads the workspace and file an \"Open in new tab\" passed", () => {
    expect(parsePanelParams({ scope: { kind: "project", id: "proj_1" }, file: "docs/a.md" })).toEqual({
      scope: { kind: "project", id: "proj_1" },
      file: "docs/a.md",
    });
  });

  it("treats a plain tab and malformed params as absent", () => {
    expect(parsePanelParams(null)).toEqual({ scope: null, file: null });
    expect(parsePanelParams("x")).toEqual({ scope: null, file: null });
    expect(parsePanelParams({ scope: { kind: "disk", id: "x" }, file: "" })).toEqual({ scope: null, file: null });
    expect(parsePanelParams({ file: "a.md" })).toEqual({ scope: null, file: "a.md" });
  });
});

describe("Home in a panel", () => {
  it("accepts Home as the scope a tab was opened on, with its own state key", () => {
    expect(parsePanelParams({ scope: { kind: "home", id: "local" }, file: "Downloads/a.pdf" })).toEqual({
      scope: { kind: "home", id: "local" },
      file: "Downloads/a.pdf",
    });
    expect(panelStateKey({ kind: "home", id: "local" })).toBe("files-editor:panel:home:local");
  });

  it("remembers per thread whether the tab shows the project or Home", () => {
    const storage = memoryStorage();
    expect(readPanelRoot(storage, "thr_1")).toBe("project");
    writePanelRoot(storage, "thr_1", "home");
    expect(readPanelRoot(storage, "thr_1")).toBe("home");
    expect(readPanelRoot(storage, "thr_2")).toBe("project");
    storage.setItem("files-editor:root:thr_3", "garbage");
    expect(readPanelRoot(storage, "thr_3")).toBe("project");
    expect(readPanelRoot(null, "thr_1")).toBe("project");
  });
});
