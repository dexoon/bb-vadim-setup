// bb-plugin-folder-links — backend entry.
//
// Reads the disk of the machine BB's server runs on, and only inside the home
// folder: whether an exact path from a chat link is a folder (or, for a missing
// one, which folder up the same path exists), and one level of a folder for the
// tree. Never writes, never searches by name.
import { homedir } from "node:os";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./rpc";
import { inspectPath, listFolder } from "./src/folders";

export default function plugin(bb: BbPluginApi): void {
  const home = homedir();

  bb.rpc.register(rpcContract, {
    async inspect({ paths }) {
      const unique = [...new Set(paths)];
      return { results: await Promise.all(unique.map(async (path) => ({ path, ...(await inspectPath(path, home)) }))) };
    },

    async list({ path }) {
      const listing = await listFolder(path, home);
      if (!listing.ok) return listing;
      const { primaryHostId } = await bb.sdk.system.config();
      return { ...listing, hostId: primaryHostId };
    },
  });
}
