// bb-plugin-markdown-view — backend entry.
//
// The panel does all the work; the server only hands Vditor its own files.
// Vditor loads Lute, icons, its dictionary, code highlighting and math as
// separate scripts from a "CDN" base URL, and BB serves a plugin nothing but
// app.js and app.css — so these routes serve node_modules/vditor/dist instead.
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * The plugin's own node_modules/vditor/dist. BB runs server.ts from the plugin
 * root for a plugin installed from a path, and dist/server.js otherwise.
 */
const VDITOR_DIST = ["./node_modules/vditor/dist/", "../node_modules/vditor/dist/"]
  .map((relative) => fileURLToPath(new URL(relative, import.meta.url)))
  .find((candidate) => existsSync(candidate));

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

export default function plugin(bb: BbPluginApi): void {
  if (!VDITOR_DIST) bb.log.warn("node_modules/vditor not found: run npm install in the plugin folder");

  // The panel sets Vditor's cdn to `…/http/vditor?f=`, so Vditor's own
  // `${cdn}/dist/<file>` arrives here as f=/dist/<file>. Highlighting, math
  // and diagrams come with a version, `…/katex.min.js?v=0.16.9`, which lands
  // in f too: cut it, or the extension reads ".9" and the file is refused.
  bb.http.route("GET", "/vditor", async (context) => {
    const requested = (context.req.query("f") ?? "").split("?", 1)[0] ?? "";
    if (!VDITOR_DIST) return new Response("Vditor is not installed", { status: 404 });
    const file = normalize(join(VDITOR_DIST, requested.replace(/^\/dist\//, "")));
    const type = CONTENT_TYPES[extname(file)];
    if (!requested.startsWith("/dist/") || !file.startsWith(VDITOR_DIST) || !type) {
      return new Response("Not found", { status: 404 });
    }
    return serve(file, type);
  });

  // KaTeX's stylesheet asks for its fonts relative to itself; with the file in
  // the query, that is `…/http/fonts/<name>`. Routes match exact paths only,
  // so each font gets its own.
  const fonts = VDITOR_DIST ? join(VDITOR_DIST, "js/katex/fonts") : null;
  for (const name of fonts && existsSync(fonts) ? readdirSync(fonts) : []) {
    const type = CONTENT_TYPES[extname(name)];
    if (type) bb.http.route("GET", `/fonts/${name}`, () => serve(join(fonts!, name), type));
  }
}

async function serve(file: string, type: string): Promise<Response> {
  try {
    return new Response(await readFile(file), {
      headers: { "content-type": type, "cache-control": "max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
