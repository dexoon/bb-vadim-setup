import { describe, expect, it } from "vitest";
import { foldersToLoad, mergeListing, pruneListed } from "./lazy-tree.js";
import type { FlatEntry } from "./tree.js";

const dir = (path: string): FlatEntry => ({ path, kind: "directory" });
const file = (path: string): FlatEntry => ({ path, kind: "file" });
const paths = (entries: readonly FlatEntry[]) => entries.map((entry) => entry.path).sort();

describe("mergeListing", () => {
  const loaded = [
    dir("Downloads"),
    file("notes.md"),
    dir("Downloads/photos"),
    file("Downloads/old.pdf"),
    file("Downloads/photos/a.jpg"),
    dir("Downloads/gone"),
    file("Downloads/gone/x.txt"),
  ];

  it("replaces a folder's children and keeps what is open below a folder that is still there", () => {
    const merged = mergeListing(loaded, "Downloads", [dir("Downloads/photos"), file("Downloads/new.pdf")]);
    expect(paths(merged)).toEqual([
      "Downloads",
      "Downloads/new.pdf",
      "Downloads/photos",
      "Downloads/photos/a.jpg",
      "notes.md",
    ]);
  });

  it("drops what was below a folder that became a file", () => {
    const merged = mergeListing(loaded, "Downloads", [file("Downloads/photos")]);
    expect(paths(merged)).not.toContain("Downloads/photos/a.jpg");
    expect(merged.find((entry) => entry.path === "Downloads/photos")?.kind).toBe("file");
  });

  it("merges into the top level", () => {
    const merged = mergeListing(loaded, "", [dir("Downloads"), file("todo.md")]);
    expect(paths(merged)).toEqual([
      "Downloads",
      "Downloads/gone",
      "Downloads/gone/x.txt",
      "Downloads/old.pdf",
      "Downloads/photos",
      "Downloads/photos/a.jpg",
      "todo.md",
    ]);
  });

  it("is the same when the listing did not change, and leaves sibling prefixes alone", () => {
    const entries = [dir("Down"), file("Down/x"), dir("Downloads"), file("Downloads/a")];
    expect(paths(mergeListing(entries, "Down", [file("Down/x")]))).toEqual(paths(entries));
  });
});

describe("pruneListed", () => {
  it("forgets read folders that are no longer in the tree", () => {
    const entries = [dir("Downloads"), dir("Downloads/photos")];
    expect(pruneListed(["", "Downloads", "Downloads/photos", "Downloads/gone"], entries)).toEqual([
      "",
      "Downloads",
      "Downloads/photos",
    ]);
  });
});

describe("foldersToLoad", () => {
  const entries = [dir("Downloads"), dir("Downloads/photos"), dir("code"), file("notes.md")];
  const none: ReadonlySet<string> = new Set();

  it("asks for open folders not read yet, parents first", () => {
    expect(
      foldersToLoad({
        expanded: ["Downloads/photos", "Downloads", "code"],
        entries,
        listed: new Set([""]),
        loading: none,
        failed: none,
      }),
    ).toEqual(["Downloads", "code", "Downloads/photos"]);
  });

  it("skips what is read, being read, refused, or not in the tree yet", () => {
    expect(
      foldersToLoad({
        expanded: ["Downloads", "Downloads/photos", "code", "code/app", "notes.md"],
        entries,
        listed: new Set(["", "Downloads"]),
        loading: new Set(["Downloads/photos"]),
        failed: new Set(["code"]),
      }),
    ).toEqual([]);
  });
});
