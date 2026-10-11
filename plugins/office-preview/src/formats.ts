// Extensions shared by the panel and the server, kept free of zod and React so
// either side can import them.

/** Formats the plugin's server converts to HTML with macOS `textutil`. */
export const LEGACY_DOC_EXTENSIONS = ["doc", "rtf", "odt"] as const;
export type LegacyDocExt = (typeof LEGACY_DOC_EXTENSIONS)[number];

export const isLegacyDocExt = (ext: string): ext is LegacyDocExt =>
  (LEGACY_DOC_EXTENSIONS as readonly string[]).includes(ext);
