// The viewers come into this plugin as tarballs in vendor/, packed from the
// sibling plugins' src/ by `npm run pack-viewers`: BB installs a plugin from Git
// with `npm install --omit=dev` alone, which installs a file: tarball with its
// dependencies but links a file: folder without them. A forgotten repack would
// ship the old viewer unnoticed, so this compares each tarball with its source
// and the lockfile with the tarball.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);
const REPACK = "run `npm run pack-viewers` in files-editor";

const VIEWERS = [
  { name: "@vibecommerce/markdown-view", tarball: "vendor/markdown-view.tgz", src: "../markdown-view/src/" },
  { name: "@vibecommerce/office-preview", tarball: "vendor/office-preview.tgz", src: "../office-preview/src/" },
];

/** File entries of an npm tarball, without npm's `package/` prefix. */
function readTarball(bytes: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(bytes);
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const prefix = field(345, 155);
    const name = (prefix ? `${prefix}/` : "") + field(0, 100);
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    if (type === "" || type === "0") files.set(name.replace(/^package\//, ""), tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** What `npm pack` takes from src/: the `files` patterns (top-level *.ts, *.tsx) and npm's always-included files. */
function packedSources(src: URL): string[] {
  return readdirSync(src)
    .filter((name) => /\.tsx?$/.test(name) || ["package.json", "README.md", "LICENSE"].includes(name))
    .sort();
}

const manifest = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
const lock = JSON.parse(readFileSync(new URL("package-lock.json", ROOT), "utf8"));

for (const viewer of VIEWERS) {
  const src = new URL(viewer.src, ROOT);
  describe.skipIf(!existsSync(src))(`${viewer.tarball} (${viewer.name})`, () => {
    const bytes = readFileSync(new URL(viewer.tarball, ROOT));

    it("package.json installs it from the tarball", () => {
      expect(manifest.dependencies[viewer.name]).toBe(`file:${viewer.tarball}`);
    });

    it(`holds exactly the current ${viewer.src} — otherwise ${REPACK}`, () => {
      const packed = readTarball(bytes);
      expect([...packed.keys()].sort()).toEqual(packedSources(src));
      for (const [name, content] of packed) {
        expect(content.equals(readFileSync(new URL(name, src))), `${name} differs from ${viewer.src}${name}`).toBe(true);
      }
    });

    it(`matches package-lock.json — otherwise ${REPACK}`, () => {
      const entry = lock.packages[`node_modules/${viewer.name}`];
      expect(entry?.resolved).toBe(`file:${viewer.tarball}`);
      expect(entry?.integrity).toBe(`sha512-${createHash("sha512").update(bytes).digest("base64")}`);
    });
  });
}
