import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  ancestorsOf,
  basename,
  buildTree,
  compareForSort,
  extensionOf,
  filterTree,
  fuzzyMatch,
  highlightRuns,
  parseTreeSort,
  rankByName,
  rankEntries,
  visibleRows,
  type FlatEntry,
  type SortableEntry,
  type TreeSort,
} from "./tree.js";

const ENTRIES: FlatEntry[] = [
  { path: "config", kind: "directory" },
  { path: "config/auth.php", kind: "file" },
  { path: "config/app.php", kind: "file" },
  { path: "app/Http/Controllers/AuthController.php", kind: "file" },
  { path: "README.md", kind: "file" },
  { path: "storage/logs", kind: "directory" },
];

describe("buildTree", () => {
  it("creates the directories a file path implies", () => {
    const tree = buildTree([
      { path: "a/b/c.ts", kind: "file" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe("a");
    expect(tree[0]?.children[0]?.path).toBe("a/b");
    expect(tree[0]?.children[0]?.children[0]?.kind).toBe("file");
  });

  it("puts directories before files and sorts each group by name", () => {
    const tree = buildTree(ENTRIES);
    expect(tree.map((node) => node.path)).toEqual([
      "app",
      "config",
      "storage",
      "README.md",
    ]);
  });

  it("keeps a directory that holds no files", () => {
    const tree = buildTree(ENTRIES);
    const storage = tree.find((node) => node.path === "storage");
    expect(storage?.children.map((node) => node.path)).toEqual(["storage/logs"]);
  });

  it("normalises leading ./ and trailing slashes into one node", () => {
    const tree = buildTree([
      { path: "./src/", kind: "directory" },
      { path: "src/index.ts", kind: "file" },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(1);
  });
});

describe("visibleRows", () => {
  it("descends only into expanded directories", () => {
    const tree = buildTree(ENTRIES);
    const collapsed = visibleRows(tree, new Set());
    expect(collapsed.map((row) => row.node.path)).toEqual([
      "app",
      "config",
      "storage",
      "README.md",
    ]);

    const expanded = visibleRows(tree, new Set(["config"]));
    expect(expanded.map((row) => row.node.path)).toContain("config/app.php");
    expect(expanded.find((row) => row.node.path === "config/app.php")?.depth).toBe(1);
  });
});

describe("ancestorsOf", () => {
  it("lists every directory above a path, outermost first", () => {
    expect(ancestorsOf("app/Http/Controllers/AuthController.php")).toEqual([
      "app",
      "app/Http",
      "app/Http/Controllers",
    ]);
  });

  it("returns nothing for a root-level file", () => {
    expect(ancestorsOf("README.md")).toEqual([]);
  });
});

describe("fuzzyMatch", () => {
  it("matches a scattered subsequence", () => {
    expect(fuzzyMatch("config/auth.php", "cauth")).not.toBeNull();
  });

  it("rejects characters that are out of order", () => {
    expect(fuzzyMatch("config/auth.php", "htua")).toBeNull();
  });

  it("scores a segment-boundary match above a mid-word one", () => {
    const boundary = fuzzyMatch("src/auth.ts", "auth");
    const middle = fuzzyMatch("src/reauthorize.ts", "auth");
    expect(boundary?.score).toBeGreaterThan(middle?.score ?? 0);
  });

  it("reports the index of every matched character", () => {
    expect(fuzzyMatch("abc", "ac")?.positions).toEqual([0, 2]);
  });
});

describe("rankEntries", () => {
  it("puts a filename match above a directory-only match", () => {
    const ranked = rankEntries(
      [
        { path: "auth/service/user.ts", kind: "file" },
        { path: "src/auth.ts", kind: "file" },
      ],
      "auth",
      10,
    );
    expect(ranked.matches[0]?.path).toBe("src/auth.ts");
  });

  it("returns nothing for an empty query", () => {
    expect(rankEntries(ENTRIES, "   ", 10).matches).toEqual([]);
  });

  it("flags truncation past the limit", () => {
    const entries: FlatEntry[] = Array.from({ length: 5 }, (_, index) => ({
      path: `src/file${index}.ts`,
      kind: "file",
    }));
    const ranked = rankEntries(entries, "ts", 2);
    expect(ranked.matches).toHaveLength(2);
    expect(ranked.truncated).toBe(true);
  });
});

describe("filterTree", () => {
  it("keeps matching files with their parent directories", () => {
    const filtered = filterTree(buildTree(ENTRIES), "auth");
    const paths = visibleRows(filtered.nodes, filtered.expand).map(
      (row) => row.node.path,
    );
    expect(paths).toContain("config/auth.php");
    expect(paths).toContain("app/Http/Controllers/AuthController.php");
    expect(paths).not.toContain("README.md");
  });

  it("expands every surviving directory so matches are on screen", () => {
    const filtered = filterTree(buildTree(ENTRIES), "auth");
    expect(filtered.expand.has("config")).toBe(true);
    expect(filtered.matchCount).toBe(2);
  });

  it("drops a directory whose files all failed to match", () => {
    const filtered = filterTree(buildTree(ENTRIES), "readme");
    expect(filtered.nodes.map((node) => node.path)).toEqual(["README.md"]);
  });

  it("returns the tree untouched for an empty query", () => {
    const tree = buildTree(ENTRIES);
    expect(filterTree(tree, "").nodes).toHaveLength(tree.length);
  });
});

describe("a POSIX name containing a backslash", () => {
  it("stays one file rather than becoming a directory", () => {
    const nodes = buildTree([{ path: "odd\\name.txt", kind: "file" }]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.kind).toBe("file");
    // The path the explorer hands back to the read RPC must be the path the
    // server listed, or resolveWithinRoot looks for a file that is not there.
    expect(nodes[0]!.path).toBe("odd\\name.txt");
    expect(nodes[0]!.name).toBe("odd\\name.txt");
  });

  it("is not treated as a path separator by basename or ancestorsOf", () => {
    expect(basename("src/odd\\name.txt")).toBe("odd\\name.txt");
    expect(ancestorsOf("src/odd\\name.txt")).toEqual(["src"]);
  });
});

describe("rankByName", () => {
  const FLOOR_PLAN: FlatEntry[] = [
    { path: "_reports", kind: "directory" },
    { path: "_reports/floor-plan", kind: "directory" },
    { path: "_reports/floor-plan/README.md", kind: "file" },
    { path: "_reports/floor-plan/2026-01-15-start-here.md", kind: "file" },
    { path: "_reports/floor-plan/v1/floor-plan-a.pdf", kind: "file" },
    { path: "docs/plans/2026-01-15-floor-plan-prototype.md", kind: "file" },
    { path: "floor.md", kind: "file" },
  ];

  it("puts the folder named exactly like the query above the files inside it", () => {
    const ranked = rankByName(FLOOR_PLAN, "floor-plan", 10);
    expect(ranked.matches[0]).toMatchObject({
      path: "_reports/floor-plan",
      kind: "directory",
      tier: 0,
    });
    expect(ranked.matches.map((match) => match.path)).toContain(
      "_reports/floor-plan/README.md",
    );
  });

  it("orders exact, prefix, substring, then fuzzy-path matches", () => {
    const ranked = rankByName(FLOOR_PLAN, "floor-plan", 10);
    expect(ranked.matches.map((match) => [match.path, match.tier])).toEqual([
      ["_reports/floor-plan", 0],
      ["_reports/floor-plan/v1/floor-plan-a.pdf", 1],
      ["docs/plans/2026-01-15-floor-plan-prototype.md", 2],
      // The files inside match only through the folder in their path.
      ["_reports/floor-plan/README.md", 3],
      ["_reports/floor-plan/2026-01-15-start-here.md", 3],
    ]);
  });

  it("ignores case for the name tiers", () => {
    const ranked = rankByName([{ path: "docs/ReadMe.MD", kind: "file" }], "readme.md", 5);
    expect(ranked.matches[0]?.tier).toBe(0);
  });

  it("puts a folder above a file of the same tier, then the shorter path", () => {
    const ranked = rankByName(
      [
        { path: "a/b/config", kind: "file" },
        { path: "a/config", kind: "file" },
        { path: "deep/er/config", kind: "directory" },
      ],
      "config",
      5,
    );
    expect(ranked.matches.map((match) => match.path)).toEqual([
      "deep/er/config",
      "a/config",
      "a/b/config",
    ]);
  });

  it("breaks a remaining tie in natural order", () => {
    const ranked = rankByName(
      [
        { path: "v10/file", kind: "file" },
        { path: "v9a/file", kind: "file" },
      ],
      "file",
      5,
    );
    // Same tier, kind and length; plain string order would put v10 first.
    expect(ranked.matches.map((match) => match.path)).toEqual(["v9a/file", "v10/file"]);
  });

  it("orders the fuzzy tier by score before kind", () => {
    const ranked = rankByName(
      [
        { path: "sxrxcxaxuxtxh", kind: "directory" },
        { path: "src/my-auth/x.ts", kind: "file" },
      ],
      "src auth",
      5,
    );
    expect(ranked.matches.every((match) => match.tier === 3)).toBe(true);
    expect(ranked.matches[0]?.path).toBe("src/my-auth/x.ts");
  });

  it("highlights the run inside the name for the name tiers", () => {
    const ranked = rankByName([{ path: "src/my-auth.ts", kind: "file" }], "auth", 5);
    expect(ranked.matches[0]?.tier).toBe(2);
    expect(ranked.matches[0]?.positions).toEqual([7, 8, 9, 10]);
  });

  it("returns nothing for an empty query and flags truncation past the limit", () => {
    expect(rankByName(FLOOR_PLAN, "  ", 10).matches).toEqual([]);
    const ranked = rankByName(FLOOR_PLAN, "floor", 2);
    expect(ranked.matches).toHaveLength(2);
    expect(ranked.truncated).toBe(true);
  });

  it("reports a directory listed with a trailing slash by its plain path", () => {
    const ranked = rankByName([{ path: "./dist/", kind: "directory" }], "dist", 5);
    expect(ranked.matches[0]?.path).toBe("dist");
  });
});

describe("highlightRuns", () => {
  it("joins neighbouring characters into runs", () => {
    expect(highlightRuns("abcd", [1, 2])).toEqual([
      { text: "a", isMatch: false },
      { text: "bc", isMatch: true },
      { text: "d", isMatch: false },
    ]);
  });

  it("reads positions relative to an offset", () => {
    // "src/auth.ts" — the name starts at 4.
    expect(highlightRuns("auth.ts", [4, 5, 6, 7], 4)).toEqual([
      { text: "auth", isMatch: true },
      { text: ".ts", isMatch: false },
    ]);
  });
});

describe("compareForSort", () => {
  const sortNames = (items: SortableEntry[], sort: TreeSort) =>
    [...items].sort((left, right) => compareForSort(left, right, sort)).map((item) => item.name);

  const ITEMS: SortableEntry[] = [
    { name: "file10.ts", kind: "file", mtimeMs: 300 },
    { name: "b.md", kind: "file", mtimeMs: 100 },
    { name: "file2.ts", kind: "file", mtimeMs: 200 },
    { name: "src", kind: "directory", mtimeMs: 50 },
    { name: "a.md", kind: "file", mtimeMs: 400 },
    { name: "docs", kind: "directory", mtimeMs: 500 },
  ];

  it("sorts by name in natural order with folders on top", () => {
    expect(sortNames(ITEMS, DEFAULT_SORT)).toEqual([
      "docs",
      "src",
      "a.md",
      "b.md",
      "file2.ts",
      "file10.ts",
    ]);
  });

  it("groups files by extension when sorting by type", () => {
    expect(sortNames(ITEMS, { key: "type", reverse: false })).toEqual([
      "docs",
      "src",
      "a.md",
      "b.md",
      "file2.ts",
      "file10.ts",
    ]);
    expect(
      sortNames(
        [
          { name: "z.css", kind: "file" },
          { name: "a.ts", kind: "file" },
          { name: "Makefile", kind: "file" },
          { name: "m.css", kind: "file" },
        ],
        { key: "type", reverse: false },
      ),
    ).toEqual(["Makefile", "m.css", "z.css", "a.ts"]);
  });

  it("puts the newest first when sorting by date, folders still on top", () => {
    expect(sortNames(ITEMS, { key: "modified", reverse: false })).toEqual([
      "docs",
      "src",
      "a.md",
      "file10.ts",
      "file2.ts",
      "b.md",
    ]);
  });

  it("falls back to the name when there are no times", () => {
    const untimed = ITEMS.map(({ name, kind }) => ({ name, kind }));
    expect(sortNames(untimed, { key: "modified", reverse: false })).toEqual(
      sortNames(untimed, DEFAULT_SORT),
    );
  });

  it("counts an entry without a time as the oldest", () => {
    expect(
      sortNames(
        [
          { name: "a", kind: "file" },
          { name: "b", kind: "file", mtimeMs: 1 },
        ],
        { key: "modified", reverse: false },
      ),
    ).toEqual(["b", "a"]);
  });

  it("reverses each group but keeps folders above files", () => {
    expect(sortNames(ITEMS, { key: "name", reverse: true })).toEqual([
      "src",
      "docs",
      "file10.ts",
      "file2.ts",
      "b.md",
      "a.md",
    ]);
    expect(sortNames(ITEMS, { key: "modified", reverse: true })).toEqual([
      "src",
      "docs",
      "b.md",
      "file2.ts",
      "file10.ts",
      "a.md",
    ]);
  });
});

describe("extensionOf", () => {
  it("reads the part after the last dot, lower-cased", () => {
    expect(extensionOf("Archive.TAR.GZ")).toBe("gz");
  });

  it("finds none in a dotfile or a bare name", () => {
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("Makefile")).toBe("");
  });
});

describe("buildTree with a sort", () => {
  it("orders every level by the chosen key", () => {
    const tree = buildTree(
      [
        { path: "src", kind: "directory", mtimeMs: 1 },
        { path: "src/old.ts", kind: "file", mtimeMs: 10 },
        { path: "src/new.ts", kind: "file", mtimeMs: 20 },
        { path: "z.md", kind: "file", mtimeMs: 30 },
        { path: "a.md", kind: "file", mtimeMs: 5 },
      ],
      { key: "modified", reverse: false },
    );
    expect(tree.map((node) => node.path)).toEqual(["src", "z.md", "a.md"]);
    expect(tree[0]?.children.map((node) => node.path)).toEqual(["src/new.ts", "src/old.ts"]);
  });

  it("keeps the time of a directory listed after a file that implied it", () => {
    const tree = buildTree([
      { path: "src/a.ts", kind: "file", mtimeMs: 1 },
      { path: "src", kind: "directory", mtimeMs: 42 },
    ]);
    expect(tree[0]?.mtimeMs).toBe(42);
  });
});

describe("parseTreeSort", () => {
  it("reads back a stored choice", () => {
    expect(parseTreeSort(JSON.stringify({ key: "modified", reverse: true }))).toEqual({
      key: "modified",
      reverse: true,
    });
  });

  it("falls back to the default for anything unreadable", () => {
    expect(parseTreeSort(null)).toEqual(DEFAULT_SORT);
    expect(parseTreeSort("not json")).toEqual(DEFAULT_SORT);
    expect(parseTreeSort(JSON.stringify({ key: "size" }))).toEqual(DEFAULT_SORT);
    expect(parseTreeSort("null")).toEqual(DEFAULT_SORT);
  });
});
