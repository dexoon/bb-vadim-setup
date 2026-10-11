/**
 * Documents this panel cannot show itself — PDF and office formats — and the
 * setting that decides where a click on one sends it: BB's own viewer or the
 * app the operating system opens it with.
 */
import { extensionOf } from "./file-kind.js";

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  // Word processing
  "doc",
  "docm",
  "docx",
  "dotx",
  "odt",
  "pages",
  "rtf",
  // Spreadsheets. csv and tsv stay text: they are edited here as often as read.
  "numbers",
  "ods",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  // Slides
  "key",
  "pps",
  "ppt",
  "pptx",
]);

/** A file a click hands on rather than opening in a tab of its own. */
export function isDocumentPath(path: string): boolean {
  return DOCUMENT_EXTENSIONS.has(extensionOf(path));
}

export const OPEN_DOCUMENTS_SETTING = "openDocumentsIn";
export const OPEN_IN_PANEL = "This panel";
export const OPEN_IN_BB_VIEWER = "BB viewer";
export const OPEN_IN_MAC_APP = "Mac app";
export const OPEN_DOCUMENTS_OPTIONS = [OPEN_IN_PANEL, OPEN_IN_BB_VIEWER, OPEN_IN_MAC_APP];

/** Where a file is handed when it leaves this panel. */
export type OpenWith = "viewer" | "external";

/** Where a click on a document sends it: shown here, or handed on. */
export type DocumentTarget = "panel" | OpenWith;

/**
 * The setting's value as the app receives it: undefined while settings load,
 * and whatever is stored afterwards. Anything unrecognised means this panel,
 * so a click never goes somewhere the user did not choose.
 */
export function documentOpenWith(value: unknown): DocumentTarget {
  if (value === OPEN_IN_MAC_APP) return "external";
  if (value === OPEN_IN_BB_VIEWER) return "viewer";
  return "panel";
}

/**
 * Which viewer shows a document inside the panel. `legacy` covers formats no
 * embedded viewer reads — old Office binaries go through office-preview's own
 * server, Apple's packages through the Mac — so the panel offers both ways out.
 */
export type DocumentViewer = "pdf" | "spreadsheet" | "word" | "presentation" | "legacy";

const VIEWER_BY_EXTENSION: Readonly<Record<string, DocumentViewer>> = {
  pdf: "pdf",
  numbers: "spreadsheet",
  ods: "spreadsheet",
  xls: "spreadsheet",
  xlsb: "spreadsheet",
  xlsm: "spreadsheet",
  xlsx: "spreadsheet",
  docm: "word",
  docx: "word",
  dotx: "word",
  pptx: "presentation",
  doc: "legacy",
  key: "legacy",
  odt: "legacy",
  pages: "legacy",
  pps: "legacy",
  ppt: "legacy",
  rtf: "legacy",
};

export function documentViewer(path: string): DocumentViewer | null {
  return VIEWER_BY_EXTENSION[extensionOf(path)] ?? null;
}

/**
 * Extensions a link in the chat opens in Explorer_vibecom (its `fileOpener`).
 * HTML stays with BB's browser preview and CSV/TSV with office-preview's
 * table; files without an extension cannot be claimed at all — BB matches
 * openers by extension only.
 */
export const EXPLORER_OPENER_EXTENSIONS: readonly string[] = [
  ...DOCUMENT_EXTENSIONS,
  "md", "markdown", "mdx", "txt", "log",
  "json", "jsonc", "yaml", "yml", "toml", "ini", "env", "lock",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "sh", "zsh", "bash",
  "css", "scss", "less", "xml", "sql",
  "go", "rs", "rb", "java", "kt", "swift", "c", "h", "cc", "cpp", "hpp", "cs", "php", "lua", "r", "dart",
  "vue", "svelte", "astro",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico",
];
