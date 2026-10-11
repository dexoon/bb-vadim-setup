// RPC between the app and this plugin's server: is a chat link a folder, and
// what is inside it. Imported as a type only by the app.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const absolutePath = z.string().min(1).max(4096);

export const MAX_PATHS_PER_CALL = 200;

const entry = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(["directory", "file"]),
  muted: z.boolean(),
  outside: z.boolean(),
});

export const rpcContract = defineRpcContract({
  inspect: {
    experimental_description:
      "For exact absolute paths, tell which are folders inside the home folder; for a missing dotless path, the nearest existing folder up the same path.",
    input: z.object({ paths: z.array(absolutePath).max(MAX_PATHS_PER_CALL) }),
    output: z.object({
      results: z.array(
        z.object({
          path: z.string(),
          kind: z.enum(["directory", "file", "missing", "outside", "denied", "missing-folder"]),
          /** Only with `missing-folder`: the folder shown instead. */
          nearest: z.string().optional(),
        }),
      ),
    }),
  },
  list: {
    experimental_description: "List one level of a folder inside the home folder, folders first.",
    input: z.object({ path: absolutePath }),
    output: z.discriminatedUnion("ok", [
      z.object({
        ok: z.literal(true),
        path: z.string(),
        parent: z.string().nullable(),
        entries: z.array(entry),
        truncated: z.boolean(),
        /** The machine whose disk was listed: files open from it by absolute path. */
        hostId: z.string().nullable(),
      }),
      z.object({
        ok: z.literal(false),
        reason: z.enum(["missing", "not-directory", "outside", "denied"]),
        message: z.string(),
      }),
    ]),
  },
});

export type RpcContract = typeof rpcContract;
