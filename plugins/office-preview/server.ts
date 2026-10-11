// bb-plugin-office-preview — backend entry.
//
// Most of the plugin runs in the panel: openers fetch the file through BB's
// own file API and parse it there. The server only converts the formats a
// browser can't read (.doc, .rtf, .odt) to HTML with macOS `textutil`.
import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./src/rpc";

const run = promisify(execFile);
const TEXTUTIL = "/usr/bin/textutil";

export default function plugin(bb: BbPluginApi): void {
  bb.rpc.register(rpcContract, {
    async convertToHtml({ ext, base64 }) {
      try {
        await access(TEXTUTIL);
      } catch {
        return {
          ok: false,
          reason: "no-textutil",
          message: "Сервер BB запущен не на Mac: утилиты textutil для конвертации нет.",
        } as const;
      }
      const dir = await mkdtemp(join(tmpdir(), "bb-office-preview-"));
      try {
        const file = join(dir, `document.${ext}`);
        await writeFile(file, Buffer.from(base64, "base64"));
        const { stdout } = await run(TEXTUTIL, ["-convert", "html", "-stdout", file], {
          maxBuffer: 64 * 1024 * 1024,
          timeout: 30_000,
        });
        // A file textutil can't parse sometimes comes back as empty output with exit code 0.
        if (stdout.trim()) return { ok: true, html: stdout } as const;
        bb.log.warn(`textutil returned nothing for .${ext}`);
      } catch (cause) {
        bb.log.warn(`textutil failed on .${ext}: ${cause instanceof Error ? cause.message : String(cause)}`);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      return { ok: false, reason: "failed", message: "textutil не смог прочитать файл." } as const;
    },
  });
}
