// RPC between the panel and this plugin's server: formats the browser can't
// read (.doc, .rtf, .odt) are converted to HTML by macOS `textutil` on the
// machine running BB's server. Imported as a type only by the panel.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { LEGACY_DOC_EXTENSIONS } from "./formats";

export const rpcContract = defineRpcContract({
  convertToHtml: {
    experimental_description: "Convert a .doc/.rtf/.odt file (base64) to HTML with macOS textutil.",
    input: z.object({
      ext: z.enum(LEGACY_DOC_EXTENSIONS),
      base64: z.string().min(1),
    }),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), html: z.string() }),
      z.object({ ok: z.literal(false), reason: z.enum(["no-textutil", "failed"]), message: z.string() }),
    ]),
  },
});

export type RpcContract = typeof rpcContract;
