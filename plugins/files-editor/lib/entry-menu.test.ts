import { describe, expect, it } from "vitest";
import { entryMenuGroups, type EntryMenuContext } from "./entry-menu.js";
import {
  absolutePathFor,
  canDropInto,
  dropPathsUnder,
  isSameOrInside,
  joinPath,
  nameProblem,
  parentPath,
  remapPath,
  remapPaths,
  stemLength,
} from "./entry-paths.js";

const MAC: EntryMenuContext = {
  isLocal: true,
  isCoarsePointer: false,
  canOpenInNewTab: true,
  canAddToChat: true,
  canUpload: true,
  canDownload: true,
};
const PHONE: EntryMenuContext = { ...MAC, isCoarsePointer: true };
const REMOTE: EntryMenuContext = { ...MAC, isLocal: false, canUpload: false };

const actions = (groups: ReturnType<typeof entryMenuGroups>) =>
  groups.map((group) => group.map((item) => item.action));

describe("entryMenuGroups", () => {
  it("lists a file's actions on this Mac in three groups, Trash last", () => {
    expect(actions(entryMenuGroups({ path: "a.md", kind: "file" }, MAC))).toEqual([
      ["open", "openInNewTab", "openInMacApp", "revealInFinder"],
      ["addToChat", "download", "copyPath", "copyRelativePath"],
      ["rename", "duplicate", "trash"],
    ]);
  });

  it("lists a folder's actions", () => {
    expect(actions(entryMenuGroups({ path: "src", kind: "directory" }, MAC))).toEqual([
      ["newFile", "newFolder", "upload", "revealInFinder"],
      ["addToChat", "copyPath", "copyRelativePath"],
      ["rename", "duplicate", "trash"],
    ]);
  });

  it("hides Finder and the Mac app on a phone, and offers Move to… instead of dragging", () => {
    expect(actions(entryMenuGroups({ path: "a.md", kind: "file" }, PHONE))).toEqual([
      ["open", "openInNewTab"],
      ["addToChat", "download", "copyPath", "copyRelativePath"],
      ["rename", "duplicate", "moveTo", "trash"],
    ]);
  });

  it("deletes for good on another machine, and does not copy folders there", () => {
    expect(actions(entryMenuGroups({ path: "src", kind: "directory" }, REMOTE))).toEqual([
      ["newFile", "newFolder"],
      ["addToChat", "copyPath", "copyRelativePath"],
      ["rename", "deleteForever"],
    ]);
    expect(actions(entryMenuGroups({ path: "a.md", kind: "file" }, REMOTE))[2]).toEqual([
      "rename",
      "duplicate",
      "deleteForever",
    ]);
  });

  it("marks only the destructive item red", () => {
    const flat = entryMenuGroups({ path: "a.md", kind: "file" }, MAC).flat();
    expect(flat.filter((item) => item.isDestructive === true).map((item) => item.action)).toEqual([
      "trash",
    ]);
    expect(flat.at(-1)?.action).toBe("trash");
  });

  it("leaves out what has nowhere to go", () => {
    const groups = entryMenuGroups(
      { path: "a.md", kind: "file" },
      { ...MAC, canOpenInNewTab: false, canAddToChat: false },
    );
    expect(actions(groups)[0]).not.toContain("openInNewTab");
    expect(actions(groups)[1]).toEqual(["download", "copyPath", "copyRelativePath"]);
  });

  it("offers new entries and an upload on the empty space", () => {
    expect(actions(entryMenuGroups(null, MAC))).toEqual([["newFile", "newFolder", "upload"]]);
    expect(actions(entryMenuGroups(null, REMOTE))).toEqual([["newFile", "newFolder"]]);
  });

  it("offers Upload… on a phone too — its file picker reaches Photos and Files", () => {
    expect(actions(entryMenuGroups({ path: "src", kind: "directory" }, PHONE))[0]).toEqual([
      "newFile",
      "newFolder",
      "upload",
    ]);
  });

  it("puts Download after Add to chat, for files only, and hides what cannot work", () => {
    expect(actions(entryMenuGroups({ path: "src", kind: "directory" }, MAC))[1]).not.toContain("download");
    expect(actions(entryMenuGroups({ path: "a.md", kind: "file" }, REMOTE))[1]).toEqual([
      "addToChat",
      "download",
      "copyPath",
      "copyRelativePath",
    ]);
    expect(
      actions(entryMenuGroups({ path: "a.md", kind: "file" }, { ...MAC, canDownload: false }))[1],
    ).not.toContain("download");
    expect(actions(entryMenuGroups({ path: "src", kind: "directory" }, REMOTE))[0]).not.toContain("upload");
  });
});

describe("entry paths", () => {
  it("knows what is under a folder", () => {
    expect(isSameOrInside("src/a.ts", "src")).toBe(true);
    expect(isSameOrInside("src", "src")).toBe(true);
    expect(isSameOrInside("srcs/a.ts", "src")).toBe(false);
    expect(isSameOrInside("anything", "")).toBe(true);
  });

  it("follows a rename to everything under it", () => {
    expect(remapPath("src/a.ts", "src", "lib")).toBe("lib/a.ts");
    expect(remapPath("src", "src", "lib")).toBe("lib");
    expect(remapPath("srcs/a.ts", "src", "lib")).toBeNull();
    expect(remapPaths(["src/a.ts", "x.md", "lib/a.ts"], "src", "lib")).toEqual(["lib/a.ts", "x.md"]);
  });

  it("drops a removed folder and its contents", () => {
    expect(dropPathsUnder(["src/a.ts", "src", "srcs/b.ts", "x.md"], "src")).toEqual([
      "srcs/b.ts",
      "x.md",
    ]);
  });

  it("builds the absolute path in the host's separator", () => {
    expect(absolutePathFor("/work/app", "src/a.ts")).toBe("/work/app/src/a.ts");
    expect(absolutePathFor("/work/app/", "a.ts")).toBe("/work/app/a.ts");
    expect(absolutePathFor("C:\\work\\app", "src/a.ts")).toBe("C:\\work\\app\\src\\a.ts");
    expect(absolutePathFor("/work/app", "")).toBe("/work/app");
  });

  it("splits and joins", () => {
    expect(parentPath("a/b/c.md")).toBe("a/b");
    expect(parentPath("c.md")).toBe("");
    expect(joinPath("", "c.md")).toBe("c.md");
    expect(joinPath("a/b", "c.md")).toBe("a/b/c.md");
  });

  it("selects the stem of a name", () => {
    expect(stemLength("notes.final.md")).toBe("notes.final".length);
    expect(stemLength(".env")).toBe(4);
    expect(stemLength("Makefile")).toBe(8);
  });

  it("spots a name the server would refuse", () => {
    expect(nameProblem("")).not.toBeNull();
    expect(nameProblem("   ")).not.toBeNull();
    expect(nameProblem("..")).not.toBeNull();
    expect(nameProblem("../x")).not.toBeNull();
    expect(nameProblem("a\\b")).not.toBeNull();
    expect(nameProblem("ok name.md")).toBeNull();
  });

  it("allows a drop only into another folder that is not inside the entry", () => {
    expect(canDropInto("src/a.ts", "lib")).toBe(true);
    expect(canDropInto("src/a.ts", "")).toBe(true);
    expect(canDropInto("src/a.ts", "src")).toBe(false);
    expect(canDropInto("src", "src/nested")).toBe(false);
    expect(canDropInto("src", "src")).toBe(false);
    expect(canDropInto("a.ts", "")).toBe(false);
  });
});
