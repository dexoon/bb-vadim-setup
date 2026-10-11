// Resolves Excel colour references (ARGB, theme slot + tint, legacy palette
// index) to CSS colours.

/** Office 2013+ default theme, in Excel's theme-index order (see readThemePalette). */
const DEFAULT_THEME = [
  "FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31",
  "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72",
];

// Excel's theme index swaps the first two pairs of the file's clrScheme order:
// index 0 is lt1 (Background 1), index 1 is dk1 (Text 1).
const THEME_SLOTS = [
  "lt1", "dk1", "lt2", "dk2", "accent1", "accent2",
  "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink",
];

/** BIFF8 default palette; 64/65 are the system foreground/background. */
const INDEXED = [
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "800000", "008000", "000080", "808000", "800080", "008080", "C0C0C0", "808080",
  "9999FF", "993366", "FFFFCC", "CCFFFF", "660066", "FF8080", "0066CC", "CCCCFF",
  "000080", "FF00FF", "FFFF00", "00FFFF", "800080", "800000", "008080", "0000FF",
  "00CCFF", "CCFFFF", "CCFFCC", "FFFF99", "99CCFF", "FF99CC", "CC99FF", "FFCC99",
  "3366FF", "33CCCC", "99CC00", "FFCC00", "FF9900", "FF6600", "666699", "969696",
  "003366", "339966", "003300", "333300", "993300", "993366", "333399", "333333",
  "000000", "FFFFFF",
];

export interface ExcelColor {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

/** Theme colours from the workbook's theme1.xml, falling back to Office defaults. */
export function readThemePalette(themeXml: string | undefined): string[] {
  const scheme = themeXml ? /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(themeXml)?.[0] : undefined;
  if (!scheme) return DEFAULT_THEME;
  return THEME_SLOTS.map((slot, i) => {
    const body = new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`).exec(scheme)?.[1] ?? "";
    const hex =
      /lastClr="([0-9A-Fa-f]{6})"/.exec(body)?.[1] ?? /srgbClr val="([0-9A-Fa-f]{6})"/.exec(body)?.[1];
    return hex ?? DEFAULT_THEME[i]!;
  });
}

function applyTint(hex: string, tint: number): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  // Excel's tint moves luminance toward black (tint < 0) or white (tint > 0).
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

export function resolveColor(color: ExcelColor | undefined, theme: string[]): string | undefined {
  if (!color) return undefined;
  let hex: string | undefined;
  if (typeof color.argb === "string" && /^[0-9A-Fa-f]{6,8}$/.test(color.argb)) hex = color.argb.slice(-6);
  else if (typeof color.theme === "number") hex = theme[color.theme];
  else if (typeof color.indexed === "number") hex = INDEXED[color.indexed];
  if (!hex) return undefined;
  if (color.tint) hex = applyTint(hex, color.tint);
  return `#${hex}`;
}
