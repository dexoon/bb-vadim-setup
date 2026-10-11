// Picks the parser for a file: ExcelJS for real .xlsx/.xlsm (it keeps the
// styling), SheetJS for every other format and as a fallback.
import type { WorkbookData } from "./model";
import { parseWithSheetJs } from "./parse-sheetjs";
import { parseXlsx } from "./parse-xlsx";

// A password-protected .xlsx (or an .xls under an .xlsx name) is an OLE
// compound file, not a ZIP; SheetJS recognises both.
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const isZip = (bytes: Uint8Array) => ZIP_SIGNATURE.every((b, i) => bytes[i] === b);

export const SPREADSHEET_EXTENSIONS = ["xlsx", "xlsm", "xls", "xlsb", "ods", "numbers", "csv", "tsv"] as const;

export function extensionOf(path: string): string {
  return /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
}

function readableError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/password|encrypt/i.test(message)) return new Error("Файл защищён паролем — откройте его в Excel.");
  return new Error(`Не удалось прочитать таблицу: ${message}`);
}

export async function parseWorkbook(bytes: Uint8Array, extension: string): Promise<WorkbookData> {
  if (bytes.length === 0) return { sheets: [] };
  if ((extension === "xlsx" || extension === "xlsm") && isZip(bytes)) {
    try {
      return await parseXlsx(bytes);
    } catch {
      // ExcelJS is strict about some producers' XML; SheetJS is more forgiving.
    }
  }
  try {
    return parseWithSheetJs(bytes, extension);
  } catch (cause) {
    throw readableError(cause);
  }
}
