// Everything ExcelJS can't read — .xls, .xlsb, .ods, .numbers, .csv, .tsv —
// goes through SheetJS Community Edition. It gives values, formulas, merges,
// column widths and hidden rows/sheets, but no cell styling.
import { read, utils } from "xlsx";
import type { CellObject, WorkBook, WorkSheet } from "xlsx";
import { formatNumber } from "./format";
import { charsToPx, DEFAULT_COL_PX, DEFAULT_ROW_PX, MAX_COLS, MAX_ROWS, ptToPx, safeLink } from "./model";
import type { CellData, Merge, SheetData, WorkbookData } from "./model";

const TEXT_FORMATS = new Set(["csv", "tsv"]);
// "1 234,50", "-12.5", "15%": right-align numbers that CSV keeps as text.
const NUMERIC_TEXT = /^[-+]?(\d{1,3}([\s ]\d{3})+|\d+)([.,]\d+)?%?$/;

/** CSV exported by a Russian Excel is often Windows-1251; everything else is UTF-8. */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

function readCell(cell: CellObject): CellData | undefined {
  let text: string;
  let numeric = false;
  switch (cell.t) {
    case "n":
      text = cell.z !== undefined ? formatNumber(cell.v as number, String(cell.z)) : (cell.w ?? formatNumber(cell.v as number, undefined));
      numeric = true;
      break;
    case "b":
      text = cell.v ? "ИСТИНА" : "ЛОЖЬ";
      break;
    case "d":
      text = cell.w ?? String(cell.v);
      numeric = true;
      break;
    case "e":
      text = cell.w ?? "#ERROR";
      break;
    case "s":
      text = String(cell.v ?? "");
      numeric = NUMERIC_TEXT.test(text.trim());
      break;
    default:
      text = "";
  }
  if (!text && !cell.f) return undefined;
  return {
    text,
    numeric: numeric || undefined,
    formula: cell.f || undefined,
    link: safeLink(cell.l?.Target),
  };
}

function readSheet(name: string, ws: WorkSheet, hidden: boolean): SheetData {
  const data = (ws["!data"] ?? []) as (CellObject | undefined)[][];
  const rows: (CellData | undefined)[][] = [];
  let lastRow = 0;
  let lastCol = 0;
  data.forEach((row, r0) => {
    row?.forEach((cell, c0) => {
      if (!cell || c0 >= MAX_COLS) return;
      const parsed = readCell(cell);
      if (!parsed) return;
      (rows[r0 + 1] ??= [])[c0 + 1] = parsed;
      lastRow = Math.max(lastRow, r0 + 1);
      lastCol = Math.max(lastCol, c0 + 1);
    });
  });

  const merges: Merge[] = [];
  for (const m of ws["!merges"] ?? []) {
    if (m.s.r >= MAX_ROWS || m.s.c >= MAX_COLS) continue;
    const merge = { r1: m.s.r + 1, c1: m.s.c + 1, r2: Math.min(m.e.r + 1, MAX_ROWS), c2: Math.min(m.e.c + 1, MAX_COLS) };
    merges.push(merge);
    lastRow = Math.max(lastRow, merge.r2);
    lastCol = Math.max(lastCol, merge.c2);
  }

  const rowCount = Math.max(lastRow, 1);
  const colCount = Math.max(lastCol, 1);
  const colWidths: number[] = [];
  for (let c = 1; c <= colCount; c += 1) {
    const info = ws["!cols"]?.[c - 1];
    colWidths[c] = info?.hidden ? 0 : info?.wpx ?? (info?.wch ? charsToPx(info.wch) : DEFAULT_COL_PX);
  }
  const rowHeights: number[] = [];
  for (let r = 1; r <= rowCount; r += 1) {
    const info = ws["!rows"]?.[r - 1];
    rowHeights[r] = info?.hidden ? 0 : info?.hpx ?? (info?.hpt ? ptToPx(info.hpt) : DEFAULT_ROW_PX);
  }

  // With sheetRows set, SheetJS keeps the untruncated range in !fullref.
  const full = utils.decode_range(ws["!fullref"] ?? ws["!ref"] ?? "A1");
  const realRows = full.e.r + 1;
  const realCols = full.e.c + 1;

  return {
    name,
    hidden,
    rows,
    rowCount,
    colCount,
    colWidths,
    rowHeights,
    merges,
    frozenRows: 0,
    frozenCols: 0,
    showGrid: true,
    clipped: realRows > MAX_ROWS || realCols > MAX_COLS ? { rows: realRows, cols: realCols } : undefined,
  };
}

export function parseWithSheetJs(bytes: Uint8Array, extension: string): WorkbookData {
  const options = { dense: true, cellStyles: true, cellNF: true, sheetRows: MAX_ROWS } as const;
  const workbook: WorkBook = TEXT_FORMATS.has(extension)
    ? // raw: keep CSV fields exactly as written instead of guessing numbers and dates.
      read(decodeText(bytes), { ...options, type: "string", raw: true })
    : read(bytes, { ...options, type: "array" });
  return {
    sheets: workbook.SheetNames.map((name, i) =>
      readSheet(name, workbook.Sheets[name]!, (workbook.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0),
    ),
  };
}
