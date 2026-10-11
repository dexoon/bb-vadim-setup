// The sheet grid: row/column headers, frozen panes, merged cells, cell
// styles, text spilling into empty neighbours — drawn like Excel on a white
// "paper" regardless of BB's theme, so the file's own colours stay legible.
//
// Only the rows and columns in view are rendered (absolute positioning over a
// full-size scroll area), so sheets with tens of thousands of rows scroll freely.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { DEFAULT_COL_PX, DEFAULT_ROW_PX } from "./model";
import type { CellData, Merge, SheetData } from "./model";

const HEADER_H = 20;
const OVERSCAN_PX = 300;
const MAX_SPILL_COLS = 20;
const GRID = "#e1e1e1";
const HEADER_BG = "#f5f5f5";
const HEADER_LINE = "#d0d0d0";
const HEADER_TEXT = "#666";
const ACCENT = "#217346"; // Excel's selection green
const BASE_FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';

export interface CellPos {
  r: number;
  c: number;
}

export function columnName(c: number): string {
  let name = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** offsets[i] = start of row/column i; offsets[count + 1] = total size. */
function buildOffsets(sizes: number[], count: number): Float64Array {
  const out = new Float64Array(count + 2);
  for (let i = 1; i <= count; i += 1) out[i + 1] = out[i] + (sizes[i] ?? 0);
  return out;
}

/** Largest index in [lo, hi] whose start is at or before pos. */
function indexAt(offsets: Float64Array, pos: number, lo: number, hi: number): number {
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function mergeAt(merges: Merge[], r: number, c: number): Merge | undefined {
  return merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
}

let measureContext: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: CSSProperties | undefined): number {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = `${font?.fontStyle ?? "normal"} ${font?.fontWeight ?? 400} ${font?.fontSize ?? "11pt"} ${font?.fontFamily ?? BASE_FONT}`;
  return measureContext.measureText(text).width;
}

interface Geometry {
  sheet: SheetData;
  colLeft: Float64Array;
  rowTop: Float64Array;
  frozenW: number;
  frozenH: number;
}

interface Range {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}

// Text runs over empty neighbours even when they are filled, as in Excel.
const isBlank = (cell: CellData | undefined) => !cell || cell.text === "";

/** Cells, gridlines, borders and selection for one pane; coordinates relative to (ox, oy). */
function paintPane(geo: Geometry, range: Range, ox: number, oy: number, selected: CellPos): ReactNode[] {
  const { sheet, colLeft, rowTop } = geo;
  if (range.r1 > range.r2 || range.c1 > range.c2) return [];
  const lines: ReactNode[] = [];
  const cells: ReactNode[] = [];
  const borders: ReactNode[] = [];
  const top = rowTop[range.r1] - oy;
  const left = colLeft[range.c1] - ox;
  const height = rowTop[range.r2 + 1] - rowTop[range.r1];
  const width = colLeft[range.c2 + 1] - colLeft[range.c1];

  if (sheet.showGrid) {
    for (let c = range.c1; c <= range.c2; c += 1) {
      if (!sheet.colWidths[c]) continue;
      lines.push(<div key={`v${c}`} style={{ position: "absolute", left: colLeft[c + 1] - 1 - ox, top, width: 1, height, background: GRID }} />);
    }
    for (let r = range.r1; r <= range.r2; r += 1) {
      if (!sheet.rowHeights[r]) continue;
      lines.push(<div key={`h${r}`} style={{ position: "absolute", left, top: rowTop[r + 1] - 1 - oy, width, height: 1, background: GRID }} />);
    }
  }

  // Merges touching this pane are drawn whole from their top-left cell; the
  // cells they cover are skipped below.
  const covered = new Set<number>();
  const visibleMerges = sheet.merges.filter(
    (m) => m.r1 <= range.r2 && m.r2 >= range.r1 && m.c1 <= range.c2 && m.c2 >= range.c1,
  );
  for (const m of visibleMerges) {
    for (let r = Math.max(m.r1, range.r1); r <= Math.min(m.r2, range.r2); r += 1) {
      for (let c = Math.max(m.c1, range.c1); c <= Math.min(m.c2, range.c2); c += 1) covered.add(r * 16384 + c);
    }
  }

  const paint = (r: number, c: number, merge: Merge | undefined) => {
    const cell = sheet.rows[r]?.[c];
    const x = colLeft[c];
    const y = rowTop[r];
    const w = colLeft[(merge?.c2 ?? c) + 1] - x;
    const h = rowTop[(merge?.r2 ?? r) + 1] - y;
    if (!w || !h) return;
    const key = `${r}:${c}`;
    const style = cell?.style;

    if (style?.borders) {
      const b = style.borders;
      borders.push(
        <div
          key={`b${key}`}
          style={{
            position: "absolute", left: x - 1 - ox, top: y - 1 - oy, width: w + 1, height: h + 1,
            boxSizing: "border-box", pointerEvents: "none",
            borderTop: b.top ?? "none", borderRight: b.right ?? "none", borderBottom: b.bottom ?? "none", borderLeft: b.left ?? "none",
          }}
        />,
      );
    }
    if (!cell || (cell.text === "" && !style?.fill)) return;

    const align = style?.align ?? (cell.numeric ? "right" : "left");
    const pad = 3 + (style?.indent ?? 0) * 9;
    // Left-aligned text that doesn't fit runs over empty cells to the right, like in Excel.
    let spill = w;
    if (!merge && align === "left" && !style?.wrap && cell.text) {
      const needed = textWidth(cell.text, style?.font) + pad + 2;
      for (let next = c + 1; spill < needed && next <= Math.min(sheet.colCount, c + MAX_SPILL_COLS); next += 1) {
        if (!isBlank(sheet.rows[r]?.[next]) || mergeAt(visibleMerges, r, next)) break;
        spill += sheet.colWidths[next] ?? 0;
      }
    }
    if (spill > w && sheet.showGrid) {
      // Hides the gridlines under the spilled text; filled neighbours paint over it.
      cells.push(<div key={`s${key}`} style={{ position: "absolute", left: x + w - 1 - ox, top: y - oy, width: spill - w, height: h - 1, background: "#fff" }} />);
    }

    const valign = style?.valign ?? "bottom";
    const text = cell.link ? (
      <a href={cell.link} target="_blank" rel="noreferrer noopener" style={{ color: "inherit" }}>{cell.text}</a>
    ) : (
      cell.text
    );
    cells.push(
      <div
        key={key}
        title={cell.text.length > 40 ? cell.text : undefined}
        style={{
          position: "absolute", left: x - ox, top: y - oy, width: w, height: h, boxSizing: "border-box",
          display: "flex",
          alignItems: valign === "top" ? "flex-start" : valign === "middle" ? "center" : "flex-end",
          justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
          textAlign: align,
          paddingLeft: align === "left" ? pad : 3,
          paddingRight: align === "right" ? pad : 3,
          paddingBottom: 1,
          background: style?.fill,
          overflow: spill > w ? "visible" : "hidden",
          zIndex: spill > w ? 1 : undefined, // above the neighbours' fills
          whiteSpace: style?.wrap ? "pre-wrap" : "pre",
          overflowWrap: style?.wrap ? "anywhere" : undefined,
          lineHeight: 1.15,
          ...style?.font,
        }}
      >
        {spill > w ? <span style={{ flex: "none", maxWidth: spill - pad, overflow: "hidden" }}>{text}</span> : text}
      </div>,
    );
  };

  for (const m of visibleMerges) paint(m.r1, m.c1, m);
  for (let r = range.r1; r <= range.r2; r += 1) {
    const row = sheet.rows[r];
    if (!row || !sheet.rowHeights[r]) continue;
    for (let c = range.c1; c <= range.c2; c += 1) {
      if (row[c] && !covered.has(r * 16384 + c)) paint(r, c, undefined);
    }
  }

  const selectedMerge = mergeAt(sheet.merges, selected.r, selected.c);
  const sel = selectedMerge ?? { r1: selected.r, c1: selected.c, r2: selected.r, c2: selected.c };
  const selection =
    sel.r1 <= range.r2 && sel.r2 >= range.r1 && sel.c1 <= range.c2 && sel.c2 >= range.c1 ? (
      <div
        key="selection"
        style={{
          position: "absolute", left: colLeft[sel.c1] - 1 - ox, top: rowTop[sel.r1] - 1 - oy,
          width: colLeft[sel.c2 + 1] - colLeft[sel.c1] + 1, height: rowTop[sel.r2 + 1] - rowTop[sel.r1] + 1,
          border: `2px solid ${ACCENT}`, boxSizing: "border-box", pointerEvents: "none",
        }}
      />
    ) : null;

  return [...lines, ...cells, ...borders, selection];
}

const headerCell = (active: boolean): CSSProperties => ({
  position: "absolute",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  color: active ? ACCENT : HEADER_TEXT,
  fontWeight: active ? 600 : 400,
  background: active ? "#e2efe7" : HEADER_BG,
  borderRight: `1px solid ${HEADER_LINE}`,
  borderBottom: `1px solid ${HEADER_LINE}`,
});

function columnHeaders(geo: Geometry, c1: number, c2: number, ox: number, selected: CellPos): ReactNode[] {
  const out: ReactNode[] = [];
  for (let c = c1; c <= c2; c += 1) {
    const w = geo.sheet.colWidths[c];
    if (!w) continue;
    out.push(
      <div key={c} style={{ ...headerCell(c === selected.c), left: geo.colLeft[c] - ox, top: 0, width: w, height: HEADER_H }}>
        {columnName(c)}
      </div>,
    );
  }
  return out;
}

function rowHeaders(geo: Geometry, r1: number, r2: number, oy: number, width: number, selected: CellPos): ReactNode[] {
  const out: ReactNode[] = [];
  for (let r = r1; r <= r2; r += 1) {
    const h = geo.sheet.rowHeights[r];
    if (!h) continue;
    out.push(
      <div key={r} style={{ ...headerCell(r === selected.r), left: 0, top: geo.rowTop[r] - oy, width, height: h }}>
        {r}
      </div>,
    );
  }
  return out;
}

/** Sums of the sheet's own column widths and row heights. */
function sheetSize(sheet: SheetData): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (let c = 1; c <= sheet.colCount; c += 1) w += sheet.colWidths[c] ?? 0;
  for (let r = 1; r <= sheet.rowCount; r += 1) h += sheet.rowHeights[r] ?? 0;
  return { w, h };
}

/** The sheet plus empty default-size columns/rows, so the grid reaches the panel's edge like Excel. */
function padSheet(sheet: SheetData, addCols: number, addRows: number): SheetData {
  if (!addCols && !addRows) return sheet;
  const colWidths = sheet.colWidths.slice();
  const rowHeights = sheet.rowHeights.slice();
  for (let c = 1; c <= addCols; c += 1) colWidths[sheet.colCount + c] = DEFAULT_COL_PX;
  for (let r = 1; r <= addRows; r += 1) rowHeights[sheet.rowCount + r] = DEFAULT_ROW_PX;
  return { ...sheet, colCount: sheet.colCount + addCols, rowCount: sheet.rowCount + addRows, colWidths, rowHeights };
}

export function SheetGrid({
  sheet: fileSheet,
  selected,
  onSelect,
}: {
  sheet: SheetData;
  selected: CellPos;
  onSelect: (pos: CellPos) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, left: 0, width: 800, height: 600 });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () =>
      setView({ top: node.scrollTop, left: node.scrollLeft, width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Empty columns and rows up to the panel's edge: text in the last used
  // column spills over them instead of being cut off.
  const base = useMemo(() => sheetSize(fileSheet), [fileSheet]);
  const addRows = Math.max(0, Math.ceil((view.height - HEADER_H - base.h) / DEFAULT_ROW_PX));
  const padHeadW = Math.max(32, String(fileSheet.rowCount + addRows).length * 8 + 14); // row-number column
  const addCols = Math.max(0, Math.ceil((view.width - padHeadW - base.w) / DEFAULT_COL_PX));
  const sheet = useMemo(() => padSheet(fileSheet, addCols, addRows), [fileSheet, addCols, addRows]);

  const geo = useMemo<Geometry>(() => {
    const colLeft = buildOffsets(sheet.colWidths, sheet.colCount);
    const rowTop = buildOffsets(sheet.rowHeights, sheet.rowCount);
    return { sheet, colLeft, rowTop, frozenW: colLeft[sheet.frozenCols + 1], frozenH: rowTop[sheet.frozenRows + 1] };
  }, [sheet]);

  const { colLeft, rowTop, frozenW, frozenH } = geo;
  const totalW = colLeft[sheet.colCount + 1];
  const totalH = rowTop[sheet.rowCount + 1];
  const headW = padHeadW;

  const yTop = view.top + frozenH - OVERSCAN_PX;
  const yBottom = view.top + view.height - HEADER_H + OVERSCAN_PX;
  const xLeft = view.left + frozenW - OVERSCAN_PX;
  const xRight = view.left + view.width - headW + OVERSCAN_PX;
  const frozenRows = { r1: 1, r2: sheet.frozenRows };
  const frozenCols = { c1: 1, c2: sheet.frozenCols };
  const rows = {
    r1: Math.max(sheet.frozenRows + 1, indexAt(rowTop, yTop, 1, sheet.rowCount)),
    r2: indexAt(rowTop, yBottom, 1, sheet.rowCount),
  };
  const cols = {
    c1: Math.max(sheet.frozenCols + 1, indexAt(colLeft, xLeft, 1, sheet.colCount)),
    c2: indexAt(colLeft, xRight, 1, sheet.colCount),
  };

  /** Mouse-down inside a pane whose origin in sheet coordinates is (ox, oy). */
  const pick = (ox: number, oy: number) => (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a")) return;
    const box = event.currentTarget.getBoundingClientRect();
    const r = indexAt(rowTop, event.clientY - box.top + oy, 1, sheet.rowCount);
    const c = indexAt(colLeft, event.clientX - box.left + ox, 1, sheet.colCount);
    const merge = mergeAt(sheet.merges, r, c);
    onSelect(merge ? { r: merge.r1, c: merge.c1 } : { r, c });
  };

  const pane = (width: number, height: number, ox: number, oy: number, range: Range) => (
    <div
      style={{ position: "relative", flex: "none", width, height, overflow: "hidden", isolation: "isolate" }}
      onMouseDown={pick(ox, oy)}
    >
      {paintPane(geo, range, ox, oy, selected)}
    </div>
  );
  const freezeLine = "1px 0 0 #9e9e9e";

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const node = event.currentTarget;
        setView((v) => ({ ...v, top: node.scrollTop, left: node.scrollLeft }));
      }}
      style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#fff", color: "#000", fontFamily: BASE_FONT, fontSize: "11pt", userSelect: "none" }}
    >
      <div style={{ width: headW + totalW, height: HEADER_H + totalH }}>
        {/* Column letters + frozen rows: stick to the top. */}
        <div style={{ position: "sticky", top: 0, zIndex: 3, display: "flex", width: headW + totalW, boxShadow: frozenH ? "0 1px 0 #9e9e9e" : undefined }}>
          <div style={{ position: "sticky", left: 0, zIndex: 4, flex: "none", width: headW + frozenW, background: "#fff", boxShadow: frozenW ? freezeLine : undefined }}>
            <div style={{ position: "relative", height: HEADER_H }}>
              <div style={{ ...headerCell(false), left: 0, top: 0, width: headW, height: HEADER_H }} />
              <div style={{ position: "absolute", left: headW, top: 0 }}>{columnHeaders(geo, 1, sheet.frozenCols, 0, selected)}</div>
            </div>
            {frozenH > 0 && (
              <div style={{ display: "flex" }}>
                <div style={{ position: "relative", flex: "none", width: headW, height: frozenH }}>
                  {rowHeaders(geo, frozenRows.r1, frozenRows.r2, 0, headW, selected)}
                </div>
                {pane(frozenW, frozenH, 0, 0, { ...frozenRows, ...frozenCols })}
              </div>
            )}
          </div>
          <div style={{ flex: "none", width: totalW - frozenW, background: "#fff" }}>
            <div style={{ position: "relative", height: HEADER_H }}>{columnHeaders(geo, cols.c1, cols.c2, frozenW, selected)}</div>
            {frozenH > 0 && pane(totalW - frozenW, frozenH, frozenW, 0, { ...frozenRows, ...cols })}
          </div>
        </div>
        {/* Row numbers + frozen columns: stick to the left. */}
        <div style={{ display: "flex" }}>
          <div style={{ position: "sticky", left: 0, zIndex: 2, flex: "none", display: "flex", background: "#fff", boxShadow: frozenW ? freezeLine : undefined }}>
            <div style={{ position: "relative", flex: "none", width: headW, height: totalH - frozenH }}>
              {rowHeaders(geo, rows.r1, rows.r2, frozenH, headW, selected)}
            </div>
            {frozenW > 0 && pane(frozenW, totalH - frozenH, 0, frozenH, { ...rows, ...frozenCols })}
          </div>
          {pane(totalW - frozenW, totalH - frozenH, frozenW, frozenH, { ...rows, ...cols })}
        </div>
      </div>
    </div>
  );
}
