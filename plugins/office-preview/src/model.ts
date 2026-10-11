// The parsed-workbook shape both parsers (ExcelJS for .xlsx, SheetJS for the
// rest) produce and the grid renders. Row and column indices are 1-based,
// like Excel's.
import type { CSSProperties } from "react";

/** CSS `border` shorthands for one cell side each. */
export interface CellBorders {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

/** Presentation of a cell. One object is shared by every cell with the same source style. */
export interface CellStyle {
  /** Font weight/style/size/colour/decoration. */
  font?: CSSProperties;
  fill?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  /** Excel indent level (≈ 9 px each). */
  indent?: number;
  borders?: CellBorders;
}

export interface CellData {
  /** Text as Excel displays it (number format applied). */
  text: string;
  /** Formula without the leading "=". */
  formula?: string;
  /** Numbers and dates: right-aligned unless the style says otherwise. */
  numeric?: boolean;
  style?: CellStyle;
  /** http(s)/mailto target; other link schemes are dropped. */
  link?: string;
}

export interface Merge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface SheetData {
  name: string;
  hidden: boolean;
  tabColor?: string;
  /** rows[r][c], sparse. */
  rows: (CellData | undefined)[][];
  rowCount: number;
  colCount: number;
  /** Pixel width per column (index 1..colCount); 0 = hidden. */
  colWidths: number[];
  /** Pixel height per row (index 1..rowCount); 0 = hidden. */
  rowHeights: number[];
  merges: Merge[];
  frozenRows: number;
  frozenCols: number;
  showGrid: boolean;
  /** The sheet's real size when it was larger than what we render. */
  clipped?: { rows: number; cols: number };
}

export interface WorkbookData {
  sheets: SheetData[];
}

export const MAX_ROWS = 200_000;
export const MAX_COLS = 300;
export const DEFAULT_COL_PX = 64;
export const DEFAULT_ROW_PX = 20;

export const ptToPx = (pt: number) => Math.round((pt * 4) / 3);
/** Excel stores column width in "characters" of the default font (7 px for Calibri 11). */
export const charsToPx = (chars: number) => Math.round(chars * 7);

export function safeLink(target: unknown): string | undefined {
  if (typeof target !== "string") return undefined;
  return /^(https?:|mailto:)/i.test(target.trim()) ? target.trim() : undefined;
}
