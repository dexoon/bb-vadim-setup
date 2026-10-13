import { describe, expect, it } from "vitest";
import { pageServing, pageUrl } from "./html-page.js";

describe("pageServing", () => {
  it("serves the whole workspace, so a page reaches ../ within it", () => {
    expect(pageServing("/Users/me/repo", "backlog/plans/flow.html", true)).toEqual({
      rootPath: "/Users/me/repo",
      pagePath: "backlog/plans/flow.html",
    });
  });

  it("drops a trailing slash on the root", () => {
    expect(pageServing("/Users/me/repo/", "index.html", true).rootPath).toBe("/Users/me/repo");
  });

  it("serves only the page's folder in Home", () => {
    expect(pageServing("/Users/me", "Downloads/report/index.html", false)).toEqual({
      rootPath: "/Users/me/Downloads/report",
      pagePath: "index.html",
    });
  });

  it("serves the root itself for a page at the top of Home", () => {
    expect(pageServing("/Users/me", "page.htm", false)).toEqual({
      rootPath: "/Users/me",
      pagePath: "page.htm",
    });
  });
});

describe("pageUrl", () => {
  const base = "/api/v1/file-previews/0b7e-uuid";

  it("appends the page to BB's base", () => {
    expect(pageUrl(base, "backlog/plans/flow.html")).toBe(`${base}/backlog/plans/flow.html`);
  });

  it("escapes each segment, keeping the slashes between them", () => {
    expect(pageUrl(`${base}/`, "отчёты/Q3 #2/итог?.html")).toBe(
      `${base}/${encodeURIComponent("отчёты")}/Q3%20%232/${encodeURIComponent("итог")}%3F.html`,
    );
  });

  it("ignores empty segments", () => {
    expect(pageUrl(base, "/a//b.html")).toBe(`${base}/a/b.html`);
  });
});
