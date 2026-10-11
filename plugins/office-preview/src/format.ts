// Turns a stored cell value plus its Excel number format into the text Excel
// shows, the way a Russian-locale Excel shows it ("1 234,5", "09.12.2025").
//
// SheetJS's SSF engine does the format parsing. Two gaps are patched here:
// SSF rejects unescaped dots in date formats ("dd.mm.yyyy" throws) and a few
// odd grouping formats ("#,#0"); both fall back instead of breaking the cell.
import { SSF } from "xlsx";

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/** ExcelJS hands dates over as UTC Date objects; SSF wants the serial number. */
export function toExcelSerial(date: Date): number {
  return (date.getTime() - EXCEL_EPOCH_MS) / DAY_MS;
}

// Built-in US short-date formats that a Russian Excel renders as dd.mm.yyyy.
const LOCALE_DATE_FORMATS: Record<string, string> = {
  "mm-dd-yy": "dd.mm.yyyy",
  "m/d/yy": "dd.mm.yyyy",
  "m/d/yyyy": "dd.mm.yyyy",
  "m/d/yy h:mm": "dd.mm.yyyy h:mm",
  "m/d/yy hh:mm": "dd.mm.yyyy hh:mm",
};

const LOCALE_TAG = /\[\$-[0-9A-Fa-f]+\]/g; // "[$-419]": a locale tag, not a currency

/** Escape bare dots in a date format; keep "ss.0" (fractional seconds) intact. */
function escapeDateDots(format: string): string {
  let out = "";
  let quoted = false;
  for (let i = 0; i < format.length; i += 1) {
    const ch = format[i];
    if (ch === '"') quoted = !quoted;
    if (ch === "\\") {
      out += ch + (format[i + 1] ?? "");
      i += 1;
      continue;
    }
    out += !quoted && ch === "." && format[i + 1] !== "0" ? "\\." : ch;
  }
  return out;
}

/** Russian digit grouping: "1,234.5" → "1 234,5" (no-break space, decimal comma). */
function localizeDigits(text: string): string {
  return text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1 ").replace(/(\d)\.(?=\d)/g, "$1,");
}

function fallbackNumber(value: number, format: string): string {
  const section = format.split(";")[0] ?? "";
  const decimals = /\.(0+)/.exec(section)?.[1]?.length ?? 0;
  const percent = section.includes("%");
  return new Intl.NumberFormat("ru-RU", {
    style: percent ? "percent" : "decimal",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: section.includes(","),
  }).format(value);
}

export function isDateFormat(format: string | undefined): boolean {
  if (!format) return false;
  try {
    return SSF.is_date(format.replace(LOCALE_TAG, ""));
  } catch {
    return false;
  }
}

/** Display text of a numeric cell (dates are numbers too, as Excel serials). */
export function formatNumber(value: number, format: string | undefined): string {
  const raw = (format ?? "General").replace(LOCALE_TAG, "") || "General";
  if (isDateFormat(raw)) {
    const dateFormat = escapeDateDots(LOCALE_DATE_FORMATS[raw] ?? raw);
    try {
      return SSF.format(dateFormat, value);
    } catch {
      return SSF.format("dd\\.mm\\.yyyy", value);
    }
  }
  try {
    return localizeDigits(SSF.format(raw, value));
  } catch {
    return fallbackNumber(value, raw);
  }
}
