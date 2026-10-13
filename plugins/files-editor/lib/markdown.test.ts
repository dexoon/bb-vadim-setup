import { describe, expect, it } from "vitest";
import { languageLabel } from "./file-kind.js";
import {
  HTML_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  MARKDOWN_PREVIEW_MAX_CHARS,
  allowedMode,
  canPreviewMarkdown,
  hasPreview,
  isHtmlPath,
  isMarkdownPath,
} from "./markdown.js";

describe("isMarkdownPath", () => {
  it("takes the two extensions people actually write", () => {
    expect(isMarkdownPath("README.md")).toBe(true);
    expect(isMarkdownPath("docs/guide.markdown")).toBe(true);
  });

  it("ignores case, because a shouted README.MD is still markdown", () => {
    expect(isMarkdownPath("README.MD")).toBe(true);
    expect(isMarkdownPath("NOTES.Markdown")).toBe(true);
  });

  it("refuses .mdx, which would render its components as literal text", () => {
    expect(isMarkdownPath("docs/page.mdx")).toBe(false);
  });

  it("reads the extension, not the directories above it", () => {
    expect(isMarkdownPath("docs.md/notes.txt")).toBe(false);
    expect(isMarkdownPath("v1.2.3/CHANGELOG.md")).toBe(true);
  });

  it("reads a file named `.md` as a dotfile, which has no extension", () => {
    expect(isMarkdownPath(".md")).toBe(false);
  });

  it("says no for anything else", () => {
    expect(isMarkdownPath("lib/find.ts")).toBe(false);
    expect(isMarkdownPath("Makefile")).toBe(false);
    expect(isMarkdownPath("")).toBe(false);
  });
});

describe("canPreviewMarkdown", () => {
  it("renders a document at the cap, and falls back one character over it", () => {
    const cap = MARKDOWN_PREVIEW_MAX_CHARS;
    expect(canPreviewMarkdown("README.md", "a".repeat(cap))).toBe(true);
    expect(canPreviewMarkdown("README.md", "a".repeat(cap + 1))).toBe(false);
  });

  it("counts characters, so text that is large in UTF-8 is not refused for it", () => {
    // Three UTF-8 bytes a character: about 2.4 MB on disk, well under the cap.
    const chinese = "文".repeat(800_000);
    expect(canPreviewMarkdown("README.md", chinese)).toBe(true);
  });

  it("stays false for a small file that is not markdown", () => {
    expect(canPreviewMarkdown("lib/find.ts", "export {};")).toBe(false);
  });
});

describe("allowedMode", () => {
  const small = "# Title\n\nBody.";
  const huge = "a".repeat(MARKDOWN_PREVIEW_MAX_CHARS + 1);

  it("keeps Preview for markdown small enough to render", () => {
    expect(allowedMode("preview", "README.md", small)).toBe("preview");
  });

  it("falls back to Read for markdown over the cap", () => {
    expect(allowedMode("preview", "README.md", huge)).toBe("read");
  });

  it("never lets a file that is not markdown into Preview", () => {
    expect(allowedMode("preview", "server.ts", small)).toBe("read");
  });

  it("falls back to Read when there is no text to render", () => {
    expect(allowedMode("preview", "README.md", null)).toBe("read");
  });

  it("passes Read and Edit through, whatever the file", () => {
    expect(allowedMode("read", "README.md", huge)).toBe("read");
    expect(allowedMode("edit", "server.ts", null)).toBe("edit");
  });
});

describe("isHtmlPath and hasPreview", () => {
  it("takes .html and .htm in any case", () => {
    expect(isHtmlPath("backlog/plans/flow.html")).toBe(true);
    expect(isHtmlPath("old/INDEX.HTM")).toBe(true);
  });

  it("leaves templates and fragments that are not pages to the source", () => {
    expect(isHtmlPath("views/page.html.erb")).toBe(false);
    expect(isHtmlPath("index.xhtml")).toBe(false);
    expect(isHtmlPath(".html")).toBe(false);
  });

  it("gives Preview to markdown and HTML only", () => {
    expect(hasPreview("README.md")).toBe(true);
    expect(hasPreview("report.html")).toBe(true);
    expect(hasPreview("server.ts")).toBe(false);
  });
});

describe("allowedMode for a page", () => {
  it("keeps Preview for HTML", () => {
    expect(allowedMode("preview", "report.html", "<!DOCTYPE html>")).toBe("preview");
  });

  it("keeps Preview past the markdown cap: the frame loads the page itself", () => {
    const huge = "a".repeat(MARKDOWN_PREVIEW_MAX_CHARS + 1);
    expect(allowedMode("preview", "report.htm", huge)).toBe("preview");
  });

  it("falls back to Read before the text is in", () => {
    expect(allowedMode("preview", "report.html", null)).toBe("read");
  });
});

describe("the markdown list and the language table", () => {
  it("agree: every previewable extension is labelled Markdown", () => {
    for (const extension of MARKDOWN_EXTENSIONS) {
      const path = `docs/notes.${extension}`;
      expect(isMarkdownPath(path)).toBe(true);
      expect(languageLabel(path)).toBe("Markdown");
    }
  });
});

describe("the HTML list and the language table", () => {
  it("agree: every page extension is labelled HTML", () => {
    for (const extension of HTML_EXTENSIONS) {
      expect(languageLabel(`site/index.${extension}`)).toBe("HTML");
    }
  });
});
