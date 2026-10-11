import { describe, expect, it } from "vitest";
import {
  OPEN_IN_BB_VIEWER,
  OPEN_IN_MAC_APP,
  EXPLORER_OPENER_EXTENSIONS,
  OPEN_IN_PANEL,
  documentOpenWith,
  documentViewer,
  isDocumentPath,
} from "./open-with.js";

describe("isDocumentPath", () => {
  it.each([
    "pdf",
    "docx",
    "docm",
    "dotx",
    "doc",
    "rtf",
    "odt",
    "xlsx",
    "xlsm",
    "xls",
    "xlsb",
    "ods",
    "numbers",
    "pptx",
    "ppt",
    "pps",
    "key",
    "pages",
  ])("hands on a .%s file", (extension) => {
    expect(isDocumentPath(`_reports/plan.${extension}`)).toBe(true);
  });

  it("ignores case, because Word on Windows writes REPORT.DOCX", () => {
    expect(isDocumentPath("REPORT.DOCX")).toBe(true);
    expect(isDocumentPath("Floor.Pdf")).toBe(true);
  });

  it("keeps csv and tsv as text, to edit here", () => {
    expect(isDocumentPath("data/prices.csv")).toBe(false);
    expect(isDocumentPath("data/prices.tsv")).toBe(false);
  });

  it("keeps what the panel already shows: markdown, code, images", () => {
    expect(isDocumentPath("README.md")).toBe(false);
    expect(isDocumentPath("server.ts")).toBe(false);
    expect(isDocumentPath("docs/preview.png")).toBe(false);
  });

  it("leaves other binaries to the panel's own stub", () => {
    expect(isDocumentPath("backup.zip")).toBe(false);
    expect(isDocumentPath("db.sqlite")).toBe(false);
  });

  it("reads the extension, not the directories above it", () => {
    expect(isDocumentPath("scans.pdf/notes.txt")).toBe(false);
    expect(isDocumentPath("v1.2/report.pdf")).toBe(true);
  });

  it("reads a dotfile or a bare name as having no extension", () => {
    expect(isDocumentPath(".pdf")).toBe(false);
    expect(isDocumentPath("Makefile")).toBe(false);
    expect(isDocumentPath("")).toBe(false);
  });
});

describe("documentOpenWith", () => {
  it("shows documents in this panel by default", () => {
    expect(documentOpenWith(OPEN_IN_PANEL)).toBe("panel");
  });

  it("hands them to BB's viewer or the Mac app only when that is chosen", () => {
    expect(documentOpenWith(OPEN_IN_BB_VIEWER)).toBe("viewer");
    expect(documentOpenWith(OPEN_IN_MAC_APP)).toBe("external");
  });

  it("falls back to this panel while settings load or hold anything else", () => {
    expect(documentOpenWith(undefined)).toBe("panel");
    expect(documentOpenWith("mac app")).toBe("panel");
    expect(documentOpenWith(true)).toBe("panel");
  });
});

describe("documentViewer", () => {
  it("routes each document to the viewer that reads it", () => {
    expect(documentViewer("plan.pdf")).toBe("pdf");
    expect(documentViewer("budget.xlsx")).toBe("spreadsheet");
    expect(documentViewer("Budget.NUMBERS")).toBe("spreadsheet");
    expect(documentViewer("report.docx")).toBe("word");
    expect(documentViewer("deck.pptx")).toBe("presentation");
  });

  it("marks formats no embedded viewer reads as legacy", () => {
    for (const extension of ["doc", "rtf", "odt", "ppt", "pps", "key", "pages"]) {
      expect(documentViewer(`old.${extension}`)).toBe("legacy");
    }
  });

  it("has no viewer for what is not a document", () => {
    expect(documentViewer("README.md")).toBeNull();
    expect(documentViewer("prices.csv")).toBeNull();
    expect(documentViewer("archive.zip")).toBeNull();
  });

  it("gives every document extension a viewer", () => {
    for (const extension of ["pdf", "doc", "docx", "docm", "dotx", "odt", "pages", "rtf", "numbers", "ods", "xls", "xlsb", "xlsm", "xlsx", "key", "pps", "ppt", "pptx"]) {
      expect(isDocumentPath(`f.${extension}`)).toBe(true);
      expect(documentViewer(`f.${extension}`)).not.toBeNull();
    }
  });
});

describe("EXPLORER_OPENER_EXTENSIONS", () => {
  it("claims documents, markdown, code and images", () => {
    for (const extension of ["pdf", "docx", "xlsx", "pptx", "md", "ts", "py", "json", "png", "jpg"]) {
      expect(EXPLORER_OPENER_EXTENSIONS).toContain(extension);
    }
  });

  it("leaves HTML to BB's browser and CSV to office-preview", () => {
    for (const extension of ["html", "htm", "csv", "tsv"]) {
      expect(EXPLORER_OPENER_EXTENSIONS).not.toContain(extension);
    }
  });

  it("lists each extension once, lowercase and without a dot, as BB requires", () => {
    expect(new Set(EXPLORER_OPENER_EXTENSIONS).size).toBe(EXPLORER_OPENER_EXTENSIONS.length);
    for (const extension of EXPLORER_OPENER_EXTENSIONS) expect(extension).toMatch(/^[a-z0-9]+$/);
  });
});
