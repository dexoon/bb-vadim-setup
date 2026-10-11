// .xlsx/.xlsm → WorkbookData via ExcelJS, which (unlike SheetJS Community)
// reads cell styles: fonts, fills, borders, alignment, theme colours.
//
// Formulas are not recalculated: Excel saves each formula's last result in the
// file, and that cached value is what gets displayed.
import { Workbook } from "exceljs";
import type { Alignment, Border, Borders, Cell, Fill, Font, Worksheet } from "exceljs";
import type { CSSProperties } from "react";
import { resolveColor, readThemePalette } from "./colors";
import type { ExcelColor } from "./colors";
import { formatNumber, isDateFormat, toExcelSerial } from "./format";
import {
  charsToPx,
  DEFAULT_COL_PX,
  DEFAULT_ROW_PX,
  MAX_COLS,
  MAX_ROWS,
  ptToPx,
  safeLink,
} from "./model";
import type { CellBorders, CellData, CellStyle, Merge, SheetData, WorkbookData } from "./model";

// ExcelJS ValueType enum values (lib/doc/enums.js).
const TYPE_NULL = 0;
const TYPE_MERGE = 1;

const BORDER_CSS: Record<string, string> = {
  thin: "1px solid",
  hair: "1px solid",
  dotted: "1px dotted",
  dashed: "1px dashed",
  dashDot: "1px dashed",
  dashDotDot: "1px dotted",
  slantDashDot: "2px dashed",
  medium: "2px solid",
  mediumDashed: "2px dashed",
  mediumDashDot: "2px dashed",
  mediumDashDotDot: "2px dotted",
  thick: "3px solid",
  double: "3px double",
};

function borderSide(border: Partial<Border> | undefined, theme: string[]): string | undefined {
  const css = border?.style ? BORDER_CSS[border.style] : undefined;
  if (!css) return undefined;
  return `${css} ${resolveColor(border?.color as ExcelColor | undefined, theme) ?? "#000"}`;
}

function toBorders(border: Partial<Borders> | undefined, theme: string[]): CellBorders | undefined {
  if (!border) return undefined;
  const sides: CellBorders = {
    top: borderSide(border.top, theme),
    right: borderSide(border.right, theme),
    bottom: borderSide(border.bottom, theme),
    left: borderSide(border.left, theme),
  };
  return sides.top || sides.right || sides.bottom || sides.left ? sides : undefined;
}

function toFill(fill: Fill | undefined, theme: string[]): string | undefined {
  if (!fill) return undefined;
  if (fill.type === "pattern") {
    if (fill.pattern === "none") return undefined;
    // Solid fills keep their colour in fgColor; other patterns are approximated by it too.
    return resolveColor(fill.fgColor as ExcelColor | undefined, theme) ??
      resolveColor(fill.bgColor as ExcelColor | undefined, theme);
  }
  const stops = fill.stops?.map((stop) => resolveColor(stop.color as ExcelColor, theme)).filter(Boolean);
  return stops?.length ? `linear-gradient(${stops.join(", ")})` : undefined;
}

function toFont(font: Partial<Font> | undefined, theme: string[]): CSSProperties | undefined {
  if (!font) return undefined;
  const css: CSSProperties = {};
  if (font.name) css.fontFamily = `"${font.name}", Calibri, Carlito, Arial, sans-serif`;
  if (font.size) css.fontSize = `${font.size}pt`;
  if (font.bold) css.fontWeight = 700;
  if (font.italic) css.fontStyle = "italic";
  const decoration = [font.underline ? "underline" : "", font.strike ? "line-through" : ""].filter(Boolean);
  if (decoration.length) css.textDecoration = decoration.join(" ");
  const color = resolveColor(font.color as ExcelColor | undefined, theme);
  if (color) css.color = color;
  if (font.vertAlign === "superscript") css.verticalAlign = "super";
  if (font.vertAlign === "subscript") css.verticalAlign = "sub";
  return Object.keys(css).length ? css : undefined;
}

const H_ALIGN: Record<string, CellStyle["align"]> = {
  left: "left",
  center: "center",
  centerContinuous: "center",
  right: "right",
  justify: "left",
  distributed: "center",
  fill: "left",
};
const V_ALIGN: Record<string, CellStyle["valign"]> = {
  top: "top",
  middle: "middle",
  bottom: "bottom",
  justify: "top",
  distributed: "middle",
};

function toStyle(style: Partial<Cell["style"]>, theme: string[]): CellStyle | undefined {
  const alignment: Partial<Alignment> = style.alignment ?? {};
  const result: CellStyle = {
    font: toFont(style.font, theme),
    fill: toFill(style.fill, theme),
    align: alignment.horizontal ? H_ALIGN[alignment.horizontal] : undefined,
    valign: alignment.vertical ? V_ALIGN[alignment.vertical] : undefined,
    wrap: alignment.wrapText || undefined,
    indent: alignment.indent || undefined,
    borders: toBorders(style.border, theme),
  };
  return Object.values(result).some((v) => v !== undefined) ? result : undefined;
}

/** Text of a string/rich-text/hyperlink-text value. */
function plainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "richText" in value) {
    const runs = (value as { richText: { text: string }[] }).richText;
    return runs.map((run) => run.text).join("");
  }
  return value == null ? "" : String(value);
}

interface Displayed {
  text: string;
  numeric?: boolean;
}

/** A stored value (or a formula's cached result) as Excel shows it. */
function display(value: unknown, numFmt: string | undefined): Displayed {
  if (value == null) return { text: "" };
  if (typeof value === "number") return { text: formatNumber(value, numFmt), numeric: true };
  if (value instanceof Date) {
    const format = isDateFormat(numFmt) ? numFmt : "dd.mm.yyyy";
    return { text: formatNumber(toExcelSerial(value), format), numeric: true };
  }
  if (typeof value === "boolean") return { text: value ? "ИСТИНА" : "ЛОЖЬ" };
  if (typeof value === "object" && "error" in value) return { text: String((value as { error: unknown }).error) };
  return { text: plainText(value) };
}

function readCell(cell: Cell, styleCache: WeakMap<object, CellStyle | null>, theme: string[]): CellData | undefined {
  const source = cell.style as object | undefined;
  let style: CellStyle | undefined;
  if (source) {
    let cached = styleCache.get(source);
    if (cached === undefined) {
      cached = toStyle(cell.style, theme) ?? null;
      styleCache.set(source, cached);
    }
    style = cached ?? undefined;
  }

  const value: unknown = cell.value;
  if (cell.type === TYPE_NULL || value == null) {
    // Empty but painted cells still matter: fills and borders outline tables.
    return style?.fill || style?.borders ? { text: "", style } : undefined;
  }

  const numFmt = cell.numFmt;
  let shown: Displayed;
  let formula: string | undefined;
  let link: string | undefined;
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
    formula = cell.formula || undefined; // shared formulas come back translated to this cell
    shown = display(cell.result, numFmt);
  } else if (typeof value === "object" && "hyperlink" in value) {
    const { text, hyperlink } = value as { text: unknown; hyperlink: unknown };
    shown = { text: plainText(text) };
    link = safeLink(hyperlink);
  } else {
    shown = display(value, numFmt);
  }
  return { text: shown.text, numeric: shown.numeric, formula, link, style };
}

function readSheet(ws: Worksheet, theme: string[], styleCache: WeakMap<object, CellStyle | null>): SheetData {
  const rows: (CellData | undefined)[][] = [];
  let lastRow = 0;
  let lastCol = 0;
  let realRows = 0;
  let realCols = 0;

  for (let r = 1; r <= ws.rowCount; r += 1) {
    const row = ws.findRow(r);
    if (!row) continue;
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      if (cell.type === TYPE_MERGE) return; // covered by its merge's top-left cell
      const data = readCell(cell, styleCache, theme);
      if (!data) return;
      realRows = Math.max(realRows, r);
      realCols = Math.max(realCols, c);
      if (r > MAX_ROWS || c > MAX_COLS) return;
      (rows[r] ??= [])[c] = data;
      lastRow = Math.max(lastRow, r);
      lastCol = Math.max(lastCol, c);
    });
  }

  const merges: Merge[] = [];
  const rawMerges = (ws as unknown as { _merges: Record<string, { top: number; left: number; bottom: number; right: number }> })._merges;
  for (const m of Object.values(rawMerges ?? {})) {
    if (m.top > MAX_ROWS || m.left > MAX_COLS) continue;
    const merge = { r1: m.top, c1: m.left, r2: Math.min(m.bottom, MAX_ROWS), c2: Math.min(m.right, MAX_COLS) };
    merges.push(merge);
    lastRow = Math.max(lastRow, merge.r2);
    lastCol = Math.max(lastCol, merge.c2);
  }

  const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number; showGridLines?: boolean } | undefined;
  const frozen = view?.state === "frozen";
  const frozenRows = frozen ? Math.min(view?.ySplit ?? 0, lastRow) : 0;
  const frozenCols = frozen ? Math.min(view?.xSplit ?? 0, lastCol) : 0;

  const rowCount = Math.max(lastRow, 1);
  const colCount = Math.max(lastCol, 1);
  const defaultRowPx = ws.properties.defaultRowHeight ? ptToPx(ws.properties.defaultRowHeight) : DEFAULT_ROW_PX;
  const defaultColPx = ws.properties.defaultColWidth ? charsToPx(ws.properties.defaultColWidth) : DEFAULT_COL_PX;

  const rowHeights: number[] = [];
  for (let r = 1; r <= rowCount; r += 1) {
    const row = ws.findRow(r);
    rowHeights[r] = row?.hidden ? 0 : row?.height ? ptToPx(row.height) : defaultRowPx;
  }
  const colWidths: number[] = [];
  for (let c = 1; c <= colCount; c += 1) {
    const column = ws.getColumn(c);
    colWidths[c] = column.hidden ? 0 : column.width ? charsToPx(column.width) : defaultColPx;
  }

  return {
    name: ws.name,
    hidden: ws.state !== "visible",
    tabColor: resolveColor(ws.properties.tabColor as ExcelColor | undefined, theme),
    rows,
    rowCount,
    colCount,
    colWidths,
    rowHeights,
    merges,
    frozenRows,
    frozenCols,
    showGrid: view?.showGridLines !== false,
    clipped: realRows > MAX_ROWS || realCols > MAX_COLS ? { rows: realRows, cols: realCols } : undefined,
  };
}

export async function parseXlsx(bytes: Uint8Array): Promise<WorkbookData> {
  const workbook = new Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const themes = (workbook as unknown as { _themes?: Record<string, string> })._themes;
  const theme = readThemePalette(themes?.theme1);
  const styleCache = new WeakMap<object, CellStyle | null>();
  return { sheets: workbook.worksheets.map((ws) => readSheet(ws, theme, styleCache)) };
}
