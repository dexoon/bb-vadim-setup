/**
 * What the panel and the server agree on for moving bytes: the two HTTP
 * routes, their URLs, the chunk sizes and the HTTP header arithmetic. Pure and
 * free of `node:` imports, so both sides build from the same constants and the
 * URLs cannot drift apart.
 *
 * Metadata goes through RPC; bytes go through `bb.http.route`, because RPC is
 * JSON and an upload or a download can be gigabytes. Range parsing,
 * Content-Disposition and the ETag follow `file-manager` (MIT,
 * github.com/xMinor-1/bb-plugins, plugins/file-manager/src/http-routes.ts).
 */
import type { ScopeRef } from "./route.js";

/** `bb.http.route` path of the chunk upload (`auth: "token"`). */
export const UPLOAD_CHUNK_ROUTE = "/upload/chunk";
/** `bb.http.route` path of the download (default `auth: "local"`). */
export const DOWNLOAD_ROUTE = "/download";

/** Bounds of one upload chunk. Node ends a request after 300 s, so a chunk stays well under that. */
export const MIN_CHUNK_BYTES = 1024 * 1024;
export const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
export const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;

/** 32 hex characters: the only shape an upload id can take, checked before any path is built from it. */
export const UPLOAD_ID_PATTERN = /^[0-9a-f]{32}$/u;

export function pluginHttpBase(pluginId: string): string {
  return `/api/v1/plugins/${encodeURIComponent(pluginId)}/http`;
}

/** BB's own route that hands the panel the plugin token (origin-gated). */
export function pluginTokenUrl(pluginId: string): string {
  return `/api/v1/plugins/${encodeURIComponent(pluginId)}/token`;
}

export function uploadChunkUrl(pluginId: string, uploadId: string, offset: number): string {
  const query = new URLSearchParams({ uploadId, offset: String(offset) });
  return `${pluginHttpBase(pluginId)}${UPLOAD_CHUNK_ROUTE}?${query.toString()}`;
}

/** The download of one file of a workspace (or Home), by its relative path. */
export function downloadUrl(pluginId: string, scope: ScopeRef, path: string): string {
  const query = new URLSearchParams({ kind: scope.kind, id: scope.id, path });
  return `${pluginHttpBase(pluginId)}${DOWNLOAD_ROUTE}?${query.toString()}`;
}

/** The staged bytes and the session record of one upload, in the staging folder. */
export function partFileName(uploadId: string): string {
  return `${uploadId}.part`;
}

export function sessionFileName(uploadId: string): string {
  return `${uploadId}.json`;
}

/** The upload a staging file belongs to, or null for anything else lying there. */
export function parseStagingName(name: string): { uploadId: string; kind: "part" | "session" } | null {
  const match = /^([0-9a-f]{32})\.(part|json)$/u.exec(name);
  if (match === null) return null;
  return { uploadId: match[1]!, kind: match[2] === "part" ? "part" : "session" };
}

export interface ByteRange {
  start: number;
  /** Inclusive, as in the header. */
  end: number;
}

/**
 * A single-range `Range` header against a known size.
 *
 * - `null` — no range, or one not worth honouring (several ranges, garbage):
 *   answer 200 with the whole file, which HTTP allows.
 * - `"unsatisfiable"` — answer 416 with `Content-Range: bytes * /<size>`.
 */
export function parseRange(header: string | undefined | null, size: number): ByteRange | null | "unsatisfiable" {
  if (header === undefined || header === null) return null;
  const match = /^bytes=(.+)$/iu.exec(header.trim());
  if (match === null) return null;
  const spec = (match[1] ?? "").trim();
  if (spec.includes(",")) return null;
  const parts = /^(\d*)-(\d*)$/u.exec(spec);
  if (parts === null) return null;
  const rawStart = parts[1] ?? "";
  const rawEnd = parts[2] ?? "";
  if (rawStart === "" && rawEnd === "") return null;

  if (rawStart === "") {
    // The last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return "unsatisfiable";
  if (rawEnd === "") return { start, end: size - 1 };
  const end = Number(rawEnd);
  if (!Number.isSafeInteger(end) || end < start) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

/** RFC 6266: an ASCII-safe `filename=` for old clients, the real name in `filename*`. */
export function contentDisposition(fileName: string, disposition: "attachment" | "inline" = "attachment"): string {
  const ascii = [...fileName]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      // Control characters would be header injection; `"` and `\` would end
      // or escape the quoted string.
      return code >= 0x20 && code <= 0x7e && character !== '"' && character !== "\\";
    })
    .join("")
    .trim();
  const fallback = ascii === "" ? "download" : ascii;
  const encoded = encodeURIComponent(fileName).replaceAll("'", "%27");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Size and whole-millisecond mtime, in hex: changes whenever the file does. */
export function etagFor(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

/** The next chunk to send: `[start, end)` from the acknowledged offset. */
export function nextChunk(offset: number, chunkBytes: number, size: number): { start: number; end: number } {
  const start = Math.min(Math.max(0, offset), size);
  return { start, end: Math.min(start + Math.max(1, chunkBytes), size) };
}

/**
 * The chunk size for the measured speed: about `targetSeconds` of sending,
 * rounded to whole MiB and kept within the bounds — so a slow phone link
 * never sends a chunk that outlives the server's request timeout.
 */
export function adaptChunkSize(
  bytesPerSecond: number,
  targetSeconds: number,
  bounds: { min: number; max: number } = { min: MIN_CHUNK_BYTES, max: MAX_CHUNK_BYTES },
): number {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return bounds.min;
  const granularity = Math.min(1024 * 1024, bounds.min);
  const target = Math.round((bytesPerSecond * targetSeconds) / granularity) * granularity;
  return Math.min(bounds.max, Math.max(bounds.min, target));
}
