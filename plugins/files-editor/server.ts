import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Context } from "hono";
import {
  defineRpcContract,
  PLUGIN_CLI_OUTPUT_MAX_BYTES,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import type { FlatEntry } from "./lib/tree.js";
import { rankEntries } from "./lib/tree.js";
import { pathApiFor, relativeWithin, resolveWithinRoot } from "./lib/paths.js";
import {
  MutationError,
  createFile,
  createFolder,
  duplicateEntry,
  moveEntry,
  numberedName,
  renameEntry,
  resolveEntryPath,
  resolveFilePath,
  restoreFromTrash,
  toMutationError,
  trashEntry,
  validateName,
  type MutationErrorCode,
} from "./lib/mutations.js";
import {
  parseExcludedNames,
  shouldFallBackToBbListing,
  walkDirectory,
} from "./lib/walk.js";
import { clipForCli, clipLinesForCli } from "./lib/cli-output.js";
import { IGNORED_LIMIT, parseIgnoredOutput } from "./lib/gitignore.js";
import { OPEN_DOCUMENTS_OPTIONS, OPEN_IN_PANEL } from "./lib/open-with.js";
import { HOME_SKIPPED_AT_TOP, listFolder, listHome } from "./lib/home.js";
import { createUploads, uploadRefusal, type Uploads } from "./lib/uploads.js";
import {
  DOWNLOAD_ROUTE,
  UPLOAD_CHUNK_ROUTE,
  contentDisposition,
  etagFor,
  parseRange,
} from "./lib/transfer.js";
import {
  createInProcessExecutor,
  createWorkerExecutor,
} from "./lib/regex-worker.js";
import { runSearch } from "./lib/search-run.js";
import {
  LocalTextCache,
  MAX_SEARCH_FILE_BYTES,
  RemoteTextCache,
  createLocalSource,
  createRemoteSource,
} from "./lib/search-sources.js";

/** BB's own recursive listing is capped at 10k; the local walk gets more room. */
const LOCAL_ENTRY_LIMIT = 40_000;
const REMOTE_ENTRY_LIMIT = 10_000;

/** Text past this is shown read-only — a textarea stops being usable long before. */
const MAX_EDITABLE_BYTES = 4 * 1024 * 1024;

/** Inline images round-trip as base64 through RPC, so keep them modest. */
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;

// The three dependency directories big enough to truncate a listing on their
// own, across the JS, PHP and Go worlds. Editable in settings.
const DEFAULT_EXCLUDED_DIRECTORIES = ".git\nnode_modules\nvendor";

const CHANGED_CHANNEL = "files-editor/changed";

/** Asking git what it ignores must never hold the tree up for long. */
const GIT_IGNORED_TIMEOUT_MS = 3000;

const execFileAsync = promisify(execFile);

// `home` is the home folder of the Mac this server runs on (id "local"): not a
// workspace of any project, read folder by folder rather than walked whole.
const scopeSchema = z
  .object({
    kind: z.enum(["thread", "environment", "project", "home"]),
    id: z.string().min(1),
  })
  .strict();

type Scope = z.infer<typeof scopeSchema>;

const workspaceSchema = z.object({
  ref: scopeSchema,
  label: z.string(),
  sublabel: z.string(),
  projectId: z.string(),
  kind: z.enum(["project", "environment"]),
});

const entrySchema = z.object({
  path: z.string(),
  kind: z.enum(["file", "directory"]),
  /** Local walks only; BB's listing of another machine has no times. */
  mtimeMs: z.number().optional(),
});

const resolvedScopeSchema = z.object({
  root: z.string(),
  hostId: z.string(),
  hostName: z.string(),
  isLocal: z.boolean(),
  label: z.string(),
  sublabel: z.string(),
  projectId: z.string(),
  environmentId: z.string().nullable(),
  /**
   * Home only: an environment on this Mac. BB's document viewers place a host
   * file through an environment, and the Files page has no thread to lend one.
   */
  anchorEnvironmentId: z.string().nullable().optional(),
  ref: scopeSchema,
});

const lineMatchSchema = z.object({
  line: z.number(),
  column: z.number(),
  preview: z.string(),
  ranges: z.array(z.tuple([z.number(), z.number()])),
  clippedStart: z.boolean(),
  clippedEnd: z.boolean(),
});

const searchOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    files: z.array(
      z.object({
        path: z.string(),
        matchCount: z.number(),
        matches: z.array(lineMatchSchema),
      }),
    ),
    totalMatches: z.number(),
    searchedFiles: z.number(),
    truncated: z.boolean(),
    reason: z.enum(["matches", "files", "time", "listing"]).nullable(),
    durationMs: z.number(),
    listing: z.enum(["local", "remote"]),
  }),
  z.object({ status: z.literal("error"), message: z.string() }),
  z.object({ status: z.literal("cancelled") }),
]);

export type SearchResult = z.infer<typeof searchOutcomeSchema>;

const MUTATION_CODES = [
  "invalid_name",
  "exists",
  "not_found",
  "outside",
  "not_a_directory",
  "into_itself",
  "unsupported",
  "failed",
] as const satisfies readonly MutationErrorCode[];

/** An operation the server would not or could not do, with the sentence to show. */
const refusalSchema = z.object({
  ok: z.literal(false),
  code: z.enum(MUTATION_CODES),
  reason: z.string(),
});

/** An upload refused, by the upload module's own codes as well as the operations'. */
const uploadRefusalSchema = z.object({ ok: z.literal(false), code: z.string(), reason: z.string() });

/** Done: the entry's path now, relative to the root. */
const mutationResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), path: z.string() }),
  refusalSchema,
]);

export type MutationResult = z.infer<typeof mutationResultSchema>;

const entryInputSchema = z.object({ scope: scopeSchema, path: z.string().min(1) }).strict();
const newEntryInputSchema = z
  .object({
    scope: scopeSchema,
    /** The folder to create in, relative to the root; "" is the root. */
    parent: z.string(),
    name: z.string().max(1024),
  })
  .strict();

export const rpcContract = defineRpcContract({
  workspaces: {
    input: z.null(),
    output: z.object({
      workspaces: z.array(workspaceSchema),
      defaultRef: scopeSchema.nullable(),
    }),
  },
  resolve: {
    input: z.object({ scope: scopeSchema }).strict(),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), scope: resolvedScopeSchema }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ]),
  },
  tree: {
    input: z
      .object({
        scope: scopeSchema,
        includeHidden: z.boolean(),
        /**
         * Home only: the open folders, read along with the top level so a
         * reload brings the tree back as it was. A workspace is walked whole.
         */
        folders: z.array(z.string()).max(1000).optional(),
      })
      .strict(),
    output: z.object({
      scope: resolvedScopeSchema,
      entries: z.array(entrySchema),
      truncated: z.boolean(),
      /** `remote` listings cannot include dotfiles — BB's API drops them. */
      listing: z.enum(["local", "remote"]),
      excluded: z.array(z.string()),
      /**
       * What `.gitignore` covers, as git reports it: paths relative to the
       * root, a wholly ignored folder as one `name/`. Empty for a checkout on
       * another machine, outside git, or when git did not answer in time.
       */
      ignored: z.array(z.string()),
      /**
       * Home only: the folders whose children are in `entries` ("" is the
       * top); any other folder is read when it is opened (`listDir`). Null for
       * a workspace, which is listed whole.
       */
      listed: z.array(z.string()).nullable(),
      /** Home only: open folders that could not be read. */
      unreadable: z.array(z.string()),
    }),
  },
  /** One folder of Home, read when it is opened in the tree. */
  listDir: {
    input: z.object({ scope: scopeSchema, path: z.string(), includeHidden: z.boolean() }).strict(),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), entries: z.array(entrySchema), truncated: z.boolean() }),
      refusalSchema,
    ]),
  },
  read: {
    input: z.object({ scope: scopeSchema, path: z.string().min(1) }).strict(),
    output: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("text"),
        content: z.string(),
        sha256: z.string(),
        sizeBytes: z.number(),
        absolutePath: z.string(),
        editable: z.boolean(),
      }),
      z.object({
        kind: z.literal("image"),
        dataUrl: z.string(),
        sizeBytes: z.number(),
        absolutePath: z.string(),
      }),
      z.object({
        kind: z.literal("binary"),
        sizeBytes: z.number(),
        absolutePath: z.string(),
        reason: z.string(),
      }),
    ]),
  },
  /** Text search across every file in the workspace — not a file-name search. */
  searchText: {
    input: z
      .object({
        scope: scopeSchema,
        query: z.string().max(1000),
        matchCase: z.boolean(),
        wholeWord: z.boolean(),
        regex: z.boolean(),
        includeHidden: z.boolean(),
      })
      .strict(),
    output: searchOutcomeSchema,
  },
  /**
   * Opens a file of a workspace on this Mac in the app macOS opens it with —
   * Preview for a PDF — the way a double click in Finder would. BB's own
   * openFileExternally prefers the client's remembered "Open in" target
   * (Finder, an editor) over that app, so it is kept for other machines only.
   */
  openInMacApp: {
    input: z.object({ scope: scopeSchema, path: z.string().min(1) }).strict(),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true) }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ]),
  },
  /**
   * Which workspace an absolute path belongs to, and the path inside it. A link
   * in the chat names a file by absolute path; the panel needs a workspace to
   * show the tree it sits in. The hinted thread or environment is tried first,
   * then every project checkout; the deepest root that contains the path wins.
   */
  locate: {
    input: z
      .object({
        absolutePath: z.string().min(1),
        hostId: z.string().nullable(),
        threadId: z.string().nullable(),
        environmentId: z.string().nullable(),
      })
      .strict(),
    output: z
      .object({ scope: scopeSchema, path: z.string() })
      .nullable(),
  },
  // --- file operations ---------------------------------------------------
  //
  // Checked here, at the moment of the operation: an agent may have changed
  // the checkout since the panel last listed it. A checkout on this Mac goes
  // through node:fs (lib/mutations.ts); one on another machine through BB.
  createFile: { input: newEntryInputSchema, output: mutationResultSchema },
  createFolder: { input: newEntryInputSchema, output: mutationResultSchema },
  rename: {
    input: z
      .object({ scope: scopeSchema, path: z.string().min(1), name: z.string().max(1024) })
      .strict(),
    output: mutationResultSchema,
  },
  /** A copy beside the original, `name (1).ext`. Folders: this Mac only. */
  duplicate: { input: entryInputSchema, output: mutationResultSchema },
  move: {
    input: z
      .object({
        scope: scopeSchema,
        path: z.string().min(1),
        /** The folder to move into; "" is the root. */
        destination: z.string(),
        /** On a name already taken there, take `name (1)` instead of refusing. */
        keepBoth: z.boolean(),
      })
      .strict(),
    output: mutationResultSchema,
  },
  /**
   * This Mac only. `trashedPath` is where it went, for Undo; null when macOS's
   * own tool had to move it and nothing can be put back from here.
   */
  trash: {
    input: entryInputSchema,
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), path: z.string(), trashedPath: z.string().nullable() }),
      refusalSchema,
    ]),
  },
  /** Undo of `trash`: back to `path`, unless something new took its place. */
  restoreFromTrash: {
    input: z
      .object({ scope: scopeSchema, path: z.string().min(1), trashedPath: z.string().min(1) })
      .strict(),
    output: mutationResultSchema,
  },
  /** Another machine only, where there is no Trash. The panel asks first. */
  deleteForever: { input: entryInputSchema, output: mutationResultSchema },
  /** Finder, with the entry selected. This Mac only. */
  revealInFinder: { input: entryInputSchema, output: mutationResultSchema },
  // --- uploads -------------------------------------------------------------
  //
  // Metadata here; the bytes go through the token route `POST /upload/chunk`.
  // A workspace on this Mac or Home only: the staged file is placed with
  // node:fs. Ported from file-manager (lib/uploads.ts).
  /** Opens an upload — or resumes the one already staged for this same file and folder. */
  uploadCreate: {
    input: z
      .object({
        scope: scopeSchema,
        /** The folder to upload into, relative to the root; "" is the root. */
        folder: z.string(),
        fileName: z.string().max(1024),
        sizeBytes: z.number().int().nonnegative(),
        lastModifiedMs: z.number().nonnegative(),
      })
      .strict(),
    output: z.discriminatedUnion("ok", [
      z.object({
        ok: z.literal(true),
        uploadId: z.string(),
        receivedBytes: z.number(),
        chunkSizeBytes: z.number(),
        resumed: z.boolean(),
      }),
      uploadRefusalSchema,
    ]),
  },
  uploadStatus: {
    input: z.object({ uploadId: z.string() }).strict(),
    output: z.object({ found: z.boolean(), receivedBytes: z.number() }),
  },
  /** Every byte is there: place the file, as `name (1)` when the name is taken. */
  uploadFinish: {
    input: z.object({ scope: scopeSchema, uploadId: z.string() }).strict(),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), path: z.string() }),
      uploadRefusalSchema,
    ]),
  },
  uploadAbort: {
    input: z.object({ uploadId: z.string() }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  /** A lease for the plugin's own `docs/` directory, for the settings page. */
  preview: {
    input: z.null(),
    output: z.object({ baseUrl: z.string(), expiresAtMs: z.number() }),
  },
  write: {
    input: z
      .object({
        scope: scopeSchema,
        path: z.string().min(1),
        content: z.string(),
        /**
         * The hash the edit was based on, guarding against an agent having
         * written the file in the meantime. Omit it to overwrite regardless.
         * (`null` is deliberately not accepted: BB reads it as create-only,
         * which would conflict on every existing file.)
         */
        expectedSha256: z.string().optional(),
      })
      .strict(),
    output: z.discriminatedUnion("outcome", [
      z.object({
        outcome: z.literal("written"),
        sha256: z.string(),
        sizeBytes: z.number(),
      }),
      z.object({
        outcome: z.literal("conflict"),
        currentSha256: z.string().nullable(),
      }),
    ]),
  },
});

/** A browsable directory: what a scope reference turns into. */
export type ResolvedScope = z.infer<typeof resolvedScopeSchema>;
export type WorkspaceOption = z.infer<typeof workspaceSchema>;

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    excludedDirectories: {
      type: "string",
      label: "Excluded directories (one name per line)",
      experimental_multiline: true,
      default: DEFAULT_EXCLUDED_DIRECTORIES,
    },
    // Read by the app through useSettings(); the server only declares it.
    openDocumentsIn: {
      type: "select",
      label: "Open documents in",
      description:
        "Where a click on a PDF or an office file shows it: in this panel beside the tree, in BB's own viewer as a separate tab, or in the app macOS opens it with (Preview, Word, Excel, Keynote).",
      options: OPEN_DOCUMENTS_OPTIONS,
      default: OPEN_IN_PANEL,
    },
  });

  async function excludedNames(): Promise<Set<string>> {
    const { excludedDirectories } = await settings.get();
    return parseExcludedNames(excludedDirectories);
  }

  let cachedLocalHostId: string | null = null;

  /**
   * The daemon running on THIS machine, read from the id file BB's own
   * primary-host resolution trusts first.
   *
   * `system.config().primaryHostId` is deliberately not used as a locality
   * test: when the data directory has no id file BB falls back to "the only
   * connected host", which on a headless server is somebody else's laptop.
   * Walking that host's paths with node:fs would read the server's disk and
   * quietly serve the wrong machine's files.
   */
  async function localHostId(): Promise<string | null> {
    if (cachedLocalHostId !== null) return cachedLocalHostId;
    const { dataDir } = await bb.sdk.system.config();
    try {
      const value = (
        await readFile(path.join(dataDir, "host-id"), "utf8")
      ).trim();
      // Only a successful read is cached, so a daemon that initialises after
      // this plugin loaded is picked up on the next call.
      if (value !== "") cachedLocalHostId = value;
      return cachedLocalHostId;
    } catch {
      return null;
    }
  }

  async function hostName(hostId: string): Promise<string> {
    try {
      const host = await bb.sdk.hosts.get({ hostId });
      return host.name;
    } catch {
      return "this machine";
    }
  }

  /**
   * `projects.get` serves standard projects only — asking it for the singleton
   * personal project is a 404 — so fall back to the list that can include it.
   */
  async function project(projectId: string) {
    try {
      return await bb.sdk.projects.get({ projectId });
    } catch {
      const projects = await bb.sdk.projects.list({ includePersonal: true });
      return projects.find((entry) => entry.id === projectId) ?? null;
    }
  }

  async function projectRoot(
    projectId: string,
  ): Promise<{ root: string; hostId: string; name: string } | string> {
    const found = await project(projectId);
    if (found === null) return "That project no longer exists.";

    const source =
      found.sources.find((entry) => entry.isDefault) ?? found.sources[0];
    if (source === undefined) {
      return `${found.name} has no checkout on any machine yet.`;
    }
    return { root: source.path, hostId: source.hostId, name: found.name };
  }

  let cachedHomeRoot: string | null = null;
  let anchorLookup: { id: string | null } | null = null;

  /**
   * Some environment on this Mac, for BB's viewers to place a Home file by
   * (see `anchorEnvironmentId`). Any one will do: the viewers take the host
   * from the file, and use the environment only to get that far.
   */
  async function anchorEnvironmentId(hostId: string): Promise<string | null> {
    // Asked once per load (a failed request is asked again): every Home
    // operation resolves the scope, and the answer does not change in between.
    if (anchorLookup !== null) return anchorLookup.id;
    try {
      const environments = await bb.sdk.environments.list({ hostId, limit: 20 });
      const anchor = environments.find((environment) => environment.path !== null) ?? environments[0];
      anchorLookup = { id: anchor?.id ?? null };
      return anchorLookup.id;
    } catch (error) {
      bb.log.debug(`no environment on this Mac to anchor Home files (${describe(error)})`);
      return null;
    }
  }

  /** The home folder of the Mac this server runs on — never another machine's. */
  async function resolveHome(
    scope: Scope,
  ): Promise<{ ok: true; scope: ResolvedScope } | { ok: false; reason: string }> {
    const local = await localHostId();
    if (local === null) {
      return {
        ok: false,
        reason: "Home is the home folder of the Mac BB runs on, and BB has no host registered on this one.",
      };
    }
    try {
      // Realpath'ed once: every containment check compares against it.
      cachedHomeRoot ??= await realpath(homedir());
    } catch (error) {
      return { ok: false, reason: `The home folder cannot be read (${describe(error)}).` };
    }
    return {
      ok: true,
      scope: {
        root: cachedHomeRoot,
        hostId: local,
        hostName: await hostName(local),
        isLocal: true,
        label: "Home",
        sublabel: "~",
        projectId: "",
        environmentId: null,
        anchorEnvironmentId: await anchorEnvironmentId(local),
        ref: scope,
      },
    };
  }

  /** Turn whatever the caller pointed at into one browsable directory. */
  async function resolveScope(
    scope: Scope,
  ): Promise<{ ok: true; scope: ResolvedScope } | { ok: false; reason: string }> {
    if (scope.kind === "home") return resolveHome(scope);
    let environmentId: string | null = null;
    let projectId: string | null = null;

    if (scope.kind === "thread") {
      const thread = await bb.sdk.threads.get({ threadId: scope.id });
      environmentId = thread.environmentId;
      projectId = thread.projectId;
    } else if (scope.kind === "environment") {
      environmentId = scope.id;
    } else {
      projectId = scope.id;
    }

    if (environmentId !== null) {
      const environment = await bb.sdk.environments.get({ environmentId });
      if (environment.path !== null) {
        const owner = await project(environment.projectId);
        const local = await localHostId();
        return {
          ok: true,
          scope: {
            root: environment.path,
            hostId: environment.hostId,
            hostName: await hostName(environment.hostId),
            isLocal: environment.hostId === local,
            label: owner?.name ?? "Workspace",
            sublabel:
              environment.branchName ??
              environment.name ??
              (environment.workspaceProvisionType === "personal"
                ? "personal workspace"
                : "workspace"),
            projectId: environment.projectId,
            environmentId,
            ref: scope,
          },
        };
      }
      // A provisioning or torn-down environment has no directory yet. Fall
      // through to the project checkout so the panel still shows something.
      if (projectId === null) projectId = environment.projectId;
    }

    if (projectId === null) {
      return { ok: false, reason: "This thread has no workspace yet." };
    }

    const resolved = await projectRoot(projectId);
    if (typeof resolved === "string") return { ok: false, reason: resolved };

    const local = await localHostId();
    return {
      ok: true,
      scope: {
        root: resolved.root,
        hostId: resolved.hostId,
        hostName: await hostName(resolved.hostId),
        isLocal: resolved.hostId === local,
        label: resolved.name,
        sublabel: "project checkout",
        projectId,
        environmentId: null,
        ref: scope,
      },
    };
  }

  async function listEntries(
    scope: ResolvedScope,
    includeHidden: boolean,
    withModifiedTimes = false,
  ): Promise<{
    entries: FlatEntry[];
    truncated: boolean;
    listing: "local" | "remote";
  }> {
    const excluded = await excludedNames();

    if (scope.isLocal) {
      try {
        const result = await walkDirectory({
          root: scope.root,
          excludedNames: excluded,
          includeHidden,
          limit: LOCAL_ENTRY_LIMIT,
          withModifiedTimes,
        });
        return { ...result, listing: "local" };
      } catch (error) {
        if (!shouldFallBackToBbListing(error)) throw error;
        // The id file said this machine but the directory is not readable here
        // (EACCES, EPERM, EMFILE). Let BB try — it knows how to reach the host
        // even when node:fs cannot.
        bb.log.warn(
          `local walk of ${scope.root} failed (${describe(error)}); falling back to BB's listing`,
        );
      }
    }

    // Remote workspaces go through BB, which walks the host daemon. It applies
    // its own dotfile and node_modules filtering that a plugin cannot turn off.
    const result = await bb.sdk.files.listPaths({
      hostId: scope.hostId,
      path: scope.root,
      includeFiles: true,
      includeDirectories: true,
      limit: REMOTE_ENTRY_LIMIT,
    });
    const entries = result.paths
      .map((entry) => ({ path: entry.path, kind: entry.kind }))
      .filter((entry) => !isExcluded(entry.path, excluded));
    return { entries, truncated: result.truncated, listing: "remote" };
  }

  /**
   * What `.gitignore` hides in a checkout on this machine, from git itself.
   * Anything short of a clean answer — not a git checkout, git missing, a slow
   * disk past the timeout — is an empty list: every file then simply shows at
   * full strength, which is also what the toggle's default is.
   */
  async function gitIgnoredPaths(scope: ResolvedScope): Promise<string[]> {
    if (!scope.isLocal) return [];
    try {
      // execFile, not a shell: the root is one argument whatever it contains.
      const { stdout } = await execFileAsync(
        "git",
        [
          "-C",
          scope.root,
          "ls-files",
          "--others",
          "--ignored",
          "--exclude-standard",
          "--directory",
          "-z",
        ],
        {
          timeout: GIT_IGNORED_TIMEOUT_MS,
          // Room for the capped list with long paths; more than this fails
          // the call, which reads as "nothing ignored" rather than a cut list.
          maxBuffer: IGNORED_LIMIT * 1024,
          encoding: "utf8",
        },
      );
      return parseIgnoredOutput(stdout);
    } catch (error) {
      bb.log.debug(`no gitignore list for ${scope.root} (${describe(error)})`);
      return [];
    }
  }

  async function readWorkspaceFile(scope: ResolvedScope, relativePath: string) {
    const absolutePath = resolveWithinRoot(scope.root, relativePath);
    const file = await bb.sdk.files.read({
      hostId: scope.hostId,
      path: absolutePath,
      rootPath: scope.root,
    });

    if (file.contentEncoding === "utf8") {
      return {
        kind: "text" as const,
        content: file.content,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        absolutePath,
        editable: file.sizeBytes <= MAX_EDITABLE_BYTES,
      };
    }

    const mimeType = file.mimeType;
    if (mimeType !== undefined && mimeType.startsWith("image/")) {
      if (file.sizeBytes > MAX_INLINE_IMAGE_BYTES) {
        return {
          kind: "binary" as const,
          sizeBytes: file.sizeBytes,
          absolutePath,
          reason: "This image is too large to preview here.",
        };
      }
      return {
        kind: "image" as const,
        dataUrl: `data:${mimeType};base64,${file.content}`,
        sizeBytes: file.sizeBytes,
        absolutePath,
      };
    }

    return {
      kind: "binary" as const,
      sizeBytes: file.sizeBytes,
      absolutePath,
      reason: "This file is not text.",
    };
  }

  const PREVIEW_TTL_MS = 60 * 60 * 1000;
  const PREVIEW_REFRESH_MARGIN_MS = 5 * 60 * 1000;
  let previewCache: { baseUrl: string; expiresAtMs: number } | null = null;

  /**
   * `docs/` served over a confined preview URL — the transport BB documents for
   * plugin images. Sits beside the entry in a source checkout and one level up
   * from `dist/` in a built install, so both layouts are probed.
   */
  async function previewLease() {
    const now = Date.now();
    if (
      previewCache !== null &&
      previewCache.expiresAtMs - now > PREVIEW_REFRESH_MARGIN_MS
    ) {
      return previewCache;
    }
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const root = [
      path.join(moduleDir, "docs"),
      path.join(moduleDir, "..", "docs"),
    ].find((candidate) => existsSync(path.join(candidate, "preview.png")));
    if (root === undefined) throw new Error("The preview image is not installed.");

    previewCache = await bb.sdk.files.createPreview({
      rootPath: root,
      ttlMs: PREVIEW_TTL_MS,
    });
    return previewCache;
  }

  // --- project-wide text search -------------------------------------------
  //
  // Held for the life of this load, so contents read by one search are there
  // for the next. A reload builds fresh ones.
  const localTexts = new LocalTextCache();
  const remoteTexts = new RemoteTextCache();
  // The file list is re-walked at most this often while someone is typing.
  const SEARCH_LIST_FRESH_MS = 3000;
  const searchListings = new Map<
    string,
    { at: number; paths: string[]; truncated: boolean }
  >();
  // One search in flight per workspace: a keystroke supersedes the last one.
  const runningSearches = new Map<string, AbortController>();

  const SEARCH_LIMITS = { maxMatches: 2000, maxFiles: 500, timeBudgetMs: 10_000 };

  async function listSearchPaths(
    scope: ResolvedScope,
    includeHidden: boolean,
  ): Promise<{ paths: string[]; truncated: boolean }> {
    const excluded = [...(await excludedNames())].sort().join("\u0000");
    const key = `${scope.hostId}\u0000${scope.root}\u0000${includeHidden}\u0000${excluded}`;
    const cached = searchListings.get(key);
    if (cached !== undefined && Date.now() - cached.at < SEARCH_LIST_FRESH_MS) {
      return cached;
    }
    const listed = await listEntries(scope, includeHidden);
    const paths = listed.entries
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.path)
      // Path order, so results read top to bottom the way the tree does and
      // the same query always shows the same first page.
      .sort((left, right) => left.localeCompare(right));
    const fresh = { at: Date.now(), paths, truncated: listed.truncated };
    searchListings.set(key, fresh);
    return fresh;
  }

  function forgetSearchedFile(scope: ResolvedScope, absolutePath: string): void {
    if (scope.isLocal) localTexts.delete(absolutePath);
    else remoteTexts.delete(`${scope.hostId}\u0000${absolutePath}`);
  }

  // --- file operations ------------------------------------------------------

  type Refusal = { ok: false; code: MutationErrorCode; reason: string };

  /**
   * Resolve the workspace, run one operation, and turn whatever went wrong into
   * a refusal the panel can show — an agent renaming the file a moment earlier
   * is an expected outcome here, not a crash.
   */
  async function operate<T extends object>(
    scope: Scope,
    what: string,
    run: (target: ResolvedScope) => Promise<T>,
  ): Promise<({ ok: true } & T) | Refusal> {
    const resolved = await resolveScope(scope);
    if (!resolved.ok) return { ok: false, code: "failed", reason: resolved.reason };
    try {
      return { ok: true, ...(await run(resolved.scope)) };
    } catch (error) {
      const refusal = resolved.scope.isLocal
        ? toMutationError(error, what)
        : remoteMutationError(error, what);
      bb.log.info(`${what}: refused (${refusal.code}) ${refusal.message}`);
      return { ok: false, code: refusal.code, reason: refusal.message };
    }
  }

  // --- uploads ---------------------------------------------------------------

  /** `.part` files and their sessions: `<dataDir>/plugins/<id>/uploads`. */
  let uploadsReady: Promise<Uploads> | null = null;
  function uploads(): Promise<Uploads> {
    uploadsReady ??= (async () => {
      const { dataDir } = await bb.sdk.system.config();
      return createUploads({ stagingDir: path.join(dataDir, "plugins", bb.pluginId, "uploads") });
    })();
    // A failed start is not cached: the next request tries again.
    uploadsReady.catch(() => {
      uploadsReady = null;
    });
    return uploadsReady;
  }

  /** Like `operate`, with the upload module's refusals (`upload_not_found`…) kept as they are. */
  async function operateUpload<T extends object>(
    scope: Scope,
    fileName: string,
    run: (target: ResolvedScope) => Promise<T>,
  ): Promise<({ ok: true } & T) | { ok: false; code: string; reason: string }> {
    const resolved = await resolveScope(scope);
    if (!resolved.ok) return { ok: false, code: "failed", reason: resolved.reason };
    if (!resolved.scope.isLocal) {
      return {
        ok: false,
        code: "unsupported",
        reason: `Uploads go to a workspace on this Mac or to Home; this one is on ${resolved.scope.hostName}.`,
      };
    }
    try {
      return { ok: true, ...(await run(resolved.scope)) };
    } catch (error) {
      const refusal = uploadRefusal(error, fileName);
      bb.log.info(`upload of ${fileName}: refused (${refusal.code}) ${refusal.reason}`);
      return { ok: false, ...refusal };
    }
  }

  function onThisMac(target: ResolvedScope, action: string): void {
    if (!target.isLocal || process.platform !== "darwin") {
      throw new MutationError(
        "unsupported",
        `${action} works for a workspace on this Mac only; this one is on ${target.hostName}.`,
      );
    }
  }

  /** `a/b` from an absolute path on the workspace's host. */
  function relativeTo(target: ResolvedScope, absolutePath: string): string {
    return relativeWithin(target.root, absolutePath) ?? "";
  }

  /** Lexical only: on another machine BB's `rootPath` holds the boundary, symlinks included. */
  function remoteEntry(target: ResolvedScope, relativePath: string): string {
    let absolutePath: string;
    try {
      absolutePath = resolveWithinRoot(target.root, relativePath);
    } catch {
      throw new MutationError("outside", "That path leads outside the workspace.");
    }
    if (relativeWithin(target.root, absolutePath) === null) {
      throw new MutationError("outside", "The workspace folder itself cannot be changed here.");
    }
    return absolutePath;
  }

  function remoteFolder(target: ResolvedScope, relativePath: string): string {
    try {
      return resolveWithinRoot(target.root, relativePath);
    } catch {
      throw new MutationError("outside", "That path leads outside the workspace.");
    }
  }

  /**
   * Move on another machine. BB's daemon refuses a destination that exists
   * (`path_exists`), so "keep both" walks `name (1)`, `name (2)`… until one is
   * free.
   */
  async function remoteMove(
    target: ResolvedScope,
    source: string,
    folder: string,
    name: string,
    keepBoth: boolean,
  ): Promise<string> {
    const api = pathApiFor(target.root);
    for (let counter = 0; counter < 50; counter += 1) {
      const candidate = counter === 0 ? name : numberedName(name, counter);
      const destination = api.join(folder, candidate);
      try {
        await bb.sdk.files.move({
          hostId: target.hostId,
          sourcePath: source,
          destinationPath: destination,
          rootPath: target.root,
        });
        forgetSearchedFile(target, source);
        return relativeTo(target, destination);
      } catch (error) {
        const refusal = remoteMutationError(error, name);
        if (refusal.code !== "exists" || !keepBoth) throw refusal;
      }
    }
    throw new MutationError("exists", `Could not find a free name for ${name} there.`);
  }

  bb.rpc.register(rpcContract, {
    async workspaces() {
      // One request gives every project, its checkouts, and the environments
      // its threads run in — which is where a worktree's branch name lives.
      const projects = await bb.sdk.projects.list({
        include: "threads",
        includePersonal: true,
      });

      const workspaces: z.infer<typeof workspaceSchema>[] = [];
      for (const project of projects) {
        if (project.sources.length > 0) {
          workspaces.push({
            ref: { kind: "project", id: project.id },
            label: project.name,
            sublabel:
              project.kind === "personal"
                ? "personal files"
                : "project checkout",
            projectId: project.id,
            kind: "project",
          });
        }

        const threads = "threads" in project ? project.threads : [];
        const seen = new Set<string>();
        for (const thread of threads) {
          const environmentId = thread.environmentId;
          if (environmentId === null || seen.has(environmentId)) continue;
          if (thread.archivedAt !== null || thread.deletedAt !== null) continue;
          if (thread.environmentWorkspaceDisplayKind === "other") continue;
          seen.add(environmentId);
          workspaces.push({
            ref: { kind: "environment", id: environmentId },
            label: project.name,
            sublabel:
              thread.environmentBranchName ??
              thread.environmentName ??
              "worktree",
            projectId: project.id,
            kind: "environment",
          });
        }
      }

      return {
        workspaces,
        defaultRef: workspaces[0]?.ref ?? null,
      };
    },

    async searchText({ scope, query, matchCase, wholeWord, regex, includeHidden }) {
      if (scope.kind === "home") {
        // It would walk the whole home folder; the panel does not offer it there.
        return { status: "error" as const, message: "Search in files covers a project, not the whole home folder." };
      }
      const resolved = await resolveScope(scope);
      if (!resolved.ok) return { status: "error" as const, message: resolved.reason };
      const target = resolved.scope;

      const key = `${scope.kind}:${scope.id}`;
      runningSearches.get(key)?.abort();
      const controller = new AbortController();
      runningSearches.set(key, controller);

      const list = () => listSearchPaths(target, includeHidden);
      const source = target.isLocal
        ? createLocalSource({ root: target.root, list, cache: localTexts })
        : createRemoteSource({
            root: target.root,
            hostId: target.hostId,
            list,
            cache: remoteTexts,
            async readRemote(absolutePath) {
              const file = await bb.sdk.files.read({
                hostId: target.hostId,
                path: absolutePath,
                rootPath: target.root,
              });
              const usable =
                file.contentEncoding === "utf8" && file.sizeBytes <= MAX_SEARCH_FILE_BYTES;
              return { text: usable ? file.content : null };
            },
          });

      try {
        const outcome = await runSearch({
          source,
          query: { query, matchCase, wholeWord, regex },
          limits: SEARCH_LIMITS,
          signal: controller.signal,
          now: () => performance.now(),
          createExecutor: (pattern, flags, isUserRegex) =>
            isUserRegex
              ? createWorkerExecutor(pattern, flags)
              : createInProcessExecutor(pattern, flags),
        });
        if (outcome.status !== "ok") return outcome;
        return { ...outcome, listing: target.isLocal ? ("local" as const) : ("remote" as const) };
      } finally {
        if (runningSearches.get(key) === controller) runningSearches.delete(key);
      }
    },

    preview: () => previewLease(),

    async openInMacApp({ scope, path: relativePath }) {
      const resolved = await resolveScope(scope);
      if (!resolved.ok) return { ok: false as const, reason: resolved.reason };
      if (!resolved.scope.isLocal || process.platform !== "darwin") {
        return {
          ok: false as const,
          reason: "This workspace is not on this Mac, so a Mac app cannot open its files.",
        };
      }
      const absolutePath = resolveWithinRoot(resolved.scope.root, relativePath);
      try {
        // execFile, not a shell: the path is one argument whatever it contains.
        await execFileAsync("/usr/bin/open", [absolutePath]);
      } catch (error) {
        const stderr = (error as { stderr?: unknown }).stderr;
        return {
          ok: false as const,
          reason:
            typeof stderr === "string" && stderr.trim() !== ""
              ? stderr.trim()
              : "macOS could not open this file.",
        };
      }
      bb.log.info(`opened ${absolutePath} in its default app`);
      return { ok: true as const };
    },

    async resolve({ scope }) {
      return resolveScope(scope);
    },

    createFile({ scope, parent, name }) {
      return operate(scope, name || "The file", async (target) => {
        if (target.isLocal) return { path: await createFile(target.root, parent, name) };
        const absolutePath = remoteEntry(
          target,
          `${remoteFolderPrefix(parent)}${validateName(name)}`,
        );
        // `expectedSha256: null` is BB's create-only write: a file that is
        // already there comes back as a conflict, untouched.
        const result = await bb.sdk.files.write({
          hostId: target.hostId,
          path: absolutePath,
          rootPath: target.root,
          content: "",
          contentEncoding: "utf8",
          expectedSha256: null,
        });
        if (result.outcome === "conflict") {
          throw new MutationError("exists", `${name} already exists there. Nothing was changed.`);
        }
        bb.log.info(`created ${absolutePath}`);
        return { path: relativeTo(target, absolutePath) };
      });
    },

    createFolder({ scope, parent, name }) {
      return operate(scope, name || "The folder", async (target) => {
        if (target.isLocal) return { path: await createFolder(target.root, parent, name) };
        const absolutePath = remoteEntry(
          target,
          `${remoteFolderPrefix(parent)}${validateName(name)}`,
        );
        // Not recursive: an existing folder is an error, not a silent success.
        await bb.sdk.files.mkdir({
          hostId: target.hostId,
          path: absolutePath,
          rootPath: target.root,
          recursive: false,
        });
        bb.log.info(`created ${absolutePath}/`);
        return { path: relativeTo(target, absolutePath) };
      });
    },

    rename({ scope, path: relativePath, name }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        if (target.isLocal) return { path: await renameEntry(target.root, relativePath, name) };
        const source = remoteEntry(target, relativePath);
        const api = pathApiFor(target.root);
        if (validateName(name) === api.basename(source)) return { path: relativePath };
        return { path: await remoteMove(target, source, api.dirname(source), name, false) };
      });
    },

    duplicate({ scope, path: relativePath }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        if (target.isLocal) return { path: await duplicateEntry(target.root, relativePath) };
        // BB can read and create-only write a file on another machine, but has
        // no call that copies a folder — the menu does not offer that there.
        const source = remoteEntry(target, relativePath);
        const api = pathApiFor(target.root);
        const file = await bb.sdk.files.read({
          hostId: target.hostId,
          path: source,
          rootPath: target.root,
        });
        for (let counter = 1; counter < 50; counter += 1) {
          const destination = api.join(
            api.dirname(source),
            numberedName(api.basename(source), counter),
          );
          const result = await bb.sdk.files.write({
            hostId: target.hostId,
            path: destination,
            rootPath: target.root,
            content: file.content,
            contentEncoding: file.contentEncoding,
            expectedSha256: null,
          });
          if (result.outcome === "written") return { path: relativeTo(target, destination) };
        }
        throw new MutationError("exists", "Could not find a free name for the copy.");
      });
    },

    move({ scope, path: relativePath, destination, keepBoth }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        if (target.isLocal) {
          return { path: await moveEntry(target.root, relativePath, destination, keepBoth) };
        }
        const source = remoteEntry(target, relativePath);
        const folder = remoteFolder(target, destination);
        const api = pathApiFor(target.root);
        if (folder === source || folder.startsWith(`${source}${api.sep}`)) {
          throw new MutationError(
            "into_itself",
            `${api.basename(source)} cannot be moved into itself.`,
          );
        }
        if (folder === api.dirname(source)) return { path: relativePath };
        return {
          path: await remoteMove(target, source, folder, api.basename(source), keepBoth),
        };
      });
    },

    trash({ scope, path: relativePath }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        onThisMac(target, "Moving to the Trash");
        const result = await trashEntry(target.root, relativePath);
        bb.log.info(
          `moved ${relativePath} to the Trash${result.trashedPath === null ? " (system tool, no undo)" : ""}`,
        );
        return result;
      });
    },

    restoreFromTrash({ scope, path: relativePath, trashedPath }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        onThisMac(target, "Putting back from the Trash");
        return { path: await restoreFromTrash(target.root, trashedPath, relativePath) };
      });
    },

    deleteForever({ scope, path: relativePath }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        if (target.isLocal) {
          // On this Mac everything goes to the Trash, so it can be undone.
          throw new MutationError("unsupported", "On this Mac, items go to the Trash instead.");
        }
        const absolutePath = remoteEntry(target, relativePath);
        await bb.sdk.files.remove({
          hostId: target.hostId,
          path: absolutePath,
          rootPath: target.root,
          recursive: true,
        });
        forgetSearchedFile(target, absolutePath);
        bb.log.info(`deleted ${absolutePath} on ${target.hostName}`);
        return { path: relativePath };
      });
    },

    revealInFinder({ scope, path: relativePath }) {
      return operate(scope, nameFromPath(relativePath), async (target) => {
        onThisMac(target, "Reveal in Finder");
        const absolutePath = await resolveEntryPath(target.root, relativePath);
        try {
          // execFile, not a shell: the path is one argument whatever it contains.
          await execFileAsync("/usr/bin/open", ["-R", absolutePath]);
        } catch (error) {
          const stderr = (error as { stderr?: unknown }).stderr;
          throw new MutationError(
            "failed",
            typeof stderr === "string" && stderr.trim() !== ""
              ? stderr.trim()
              : "Finder could not show this item.",
          );
        }
        return { path: relativePath };
      });
    },

    async locate({ absolutePath, hostId, threadId, environmentId }) {
      const candidates: Scope[] = [];
      if (environmentId !== null) candidates.push({ kind: "environment", id: environmentId });
      if (threadId !== null) candidates.push({ kind: "thread", id: threadId });
      for (const owner of await bb.sdk.projects.list({ includePersonal: true })) {
        if (owner.sources.length > 0) candidates.push({ kind: "project", id: owner.id });
      }
      let best: { scope: Scope; path: string; depth: number } | null = null;
      for (const candidate of candidates) {
        const resolved = await resolveScope(candidate).catch(() => null);
        if (resolved === null || !resolved.ok) continue;
        if (hostId !== null && resolved.scope.hostId !== hostId) continue;
        const relative = relativeWithin(resolved.scope.root, absolutePath);
        if (relative === null) continue;
        const depth = resolved.scope.root.length;
        if (best === null || depth > best.depth) best = { scope: candidate, path: relative, depth };
      }
      return best === null ? null : { scope: best.scope, path: best.path };
    },

    async tree({ scope, includeHidden, folders }) {
      const resolved = await resolveScope(scope);
      if (!resolved.ok) throw new Error(resolved.reason);
      if (scope.kind === "home") {
        const excluded = await excludedNames();
        const listed = await listHome({
          root: resolved.scope.root,
          folders: folders ?? [],
          excludedNames: excluded,
          includeHidden,
          limit: LOCAL_ENTRY_LIMIT,
        });
        return {
          scope: resolved.scope,
          entries: listed.entries,
          truncated: listed.truncated,
          listing: "local" as const,
          excluded: [...HOME_SKIPPED_AT_TOP.map((name) => `~/${name}`), ...[...excluded].sort()],
          ignored: [],
          listed: listed.listed,
          unreadable: listed.unreadable,
        };
      }
      // Side by side: git and the walk read the same disk independently.
      const [listed, ignored] = await Promise.all([
        listEntries(resolved.scope, includeHidden, true),
        gitIgnoredPaths(resolved.scope),
      ]);
      return {
        scope: resolved.scope,
        entries: listed.entries,
        truncated: listed.truncated,
        listing: listed.listing,
        excluded: [...(await excludedNames())].sort(),
        ignored,
        listed: null,
        unreadable: [],
      };
    },

    listDir({ scope, path: folder, includeHidden }) {
      return operate(scope, folder === "" ? "The home folder" : nameFromPath(folder), async (target) => {
        if (target.ref.kind !== "home") {
          throw new MutationError("unsupported", "Only Home is read folder by folder; a workspace is listed whole.");
        }
        return listFolder({
          root: target.root,
          folder,
          excludedNames: await excludedNames(),
          includeHidden,
        });
      });
    },

    uploadCreate({ scope, folder, fileName, sizeBytes, lastModifiedMs }) {
      return operateUpload(scope, fileName, async (target) =>
        (await uploads()).create({
          scopeKey: `${scope.kind}:${scope.id}`,
          root: target.root,
          folder,
          fileName,
          sizeBytes,
          lastModifiedMs,
        }),
      );
    },

    async uploadStatus({ uploadId }) {
      const status = await (await uploads()).status(uploadId);
      return status === null
        ? { found: false, receivedBytes: 0 }
        : { found: true, receivedBytes: status.receivedBytes };
    },

    uploadFinish({ scope, uploadId }) {
      return operateUpload(scope, "The upload", async (target) => {
        const placed = await (await uploads()).finish({
          uploadId,
          scopeKey: `${scope.kind}:${scope.id}`,
          root: target.root,
        });
        bb.log.info(`uploaded ${placed} into ${target.root}`);
        return { path: placed };
      });
    },

    async uploadAbort({ uploadId }) {
      await (await uploads()).abort(uploadId);
      return { ok: true as const };
    },

    async read({ scope, path: relativePath }) {
      const resolved = await resolveScope(scope);
      if (!resolved.ok) throw new Error(resolved.reason);
      return readWorkspaceFile(resolved.scope, relativePath);
    },

    async write({ scope, path: relativePath, content, expectedSha256 }) {
      const resolved = await resolveScope(scope);
      if (!resolved.ok) throw new Error(resolved.reason);

      const absolutePath = resolveWithinRoot(resolved.scope.root, relativePath);
      const result = await bb.sdk.files.write({
        hostId: resolved.scope.hostId,
        path: absolutePath,
        rootPath: resolved.scope.root,
        content,
        contentEncoding: "utf8",
        // Present = compare-and-swap; absent = unconditional.
        ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
      });

      if (result.outcome === "conflict") {
        return {
          outcome: "conflict" as const,
          currentSha256: result.currentSha256,
        };
      }

      // The next search must see what was just written, not the cached copy.
      forgetSearchedFile(resolved.scope, absolutePath);
      bb.realtime.publish(CHANGED_CHANNEL, {
        scope,
        path: relativePath,
        sha256: result.sha256,
      });
      bb.log.info(`wrote ${absolutePath}`);
      return {
        outcome: "written" as const,
        sha256: result.sha256,
        sizeBytes: result.sizeBytes,
      };
    },
  });

  // --- pdf.js for phones ----------------------------------------------------
  //
  // Safari on iOS shows a PDF in an iframe as one page that does not scroll,
  // so on a touch screen the panel draws pages itself with pdf.js. BB serves a
  // plugin only app.js and app.css, and pdf.js is ~1.7 MB a desktop never
  // needs: these two files are fetched from here, and only when a phone opens
  // a PDF. Exactly these two names, nothing else from node_modules.
  const PDFJS_FILES = new Set(["pdf.min.mjs", "pdf.worker.min.mjs"]);
  const pdfjsBuild = ["./node_modules/pdfjs-dist/build/", "../node_modules/pdfjs-dist/build/"]
    .map((relative) => fileURLToPath(new URL(relative, import.meta.url)))
    .find((candidate) => existsSync(candidate));
  bb.http.route("GET", "/pdfjs", async (context: Context) => {
    const name = context.req.query("f") ?? "";
    if (pdfjsBuild === undefined || !PDFJS_FILES.has(name)) {
      return new Response("Not found", { status: 404 });
    }
    try {
      return new Response(await readFile(path.join(pdfjsBuild, name)), {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "max-age=86400",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  // --- bytes: upload chunks in, downloads out ------------------------------
  //
  // After file-manager (src/http-routes.ts). The chunk route is `auth: "token"`:
  // "local" turns away any non-GET body that is not JSON. The download is a
  // GET, so it keeps the default local auth and works from a plain
  // `<a download>` click, which streams to disk without the panel holding it.
  bb.http.route(
    "POST",
    UPLOAD_CHUNK_ROUTE,
    async (context: Context) => {
      const outcome = await (await uploads()).writeChunk({
        uploadId: context.req.query("uploadId"),
        offset: context.req.query("offset"),
        body: context.req.raw.body,
        signal: context.req.raw.signal,
      });
      // Built by hand: 499 is outside hono's status type.
      return jsonResponse(outcome.status, outcome.body);
    },
    { auth: "token" },
  );

  bb.http.route("GET", DOWNLOAD_ROUTE, async (context: Context) => {
    const parsed = scopeSchema.safeParse({ kind: context.req.query("kind"), id: context.req.query("id") });
    const relativePath = context.req.query("path");
    if (!parsed.success || typeof relativePath !== "string" || relativePath === "") {
      return jsonResponse(400, { ok: false, error: "invalid_params" });
    }
    const resolved = await resolveScope(parsed.data);
    if (!resolved.ok) return jsonResponse(404, { ok: false, error: resolved.reason });
    const target = resolved.scope;
    const disposition = context.req.query("disposition") === "inline" ? "inline" : "attachment";
    try {
      return target.isLocal
        ? await localDownload(context, target, relativePath, disposition)
        : await remoteDownload(context, target, relativePath, disposition);
    } catch (error) {
      const refusal = error instanceof MutationError ? error : toMutationError(error, nameFromPath(relativePath));
      const status = refusal.code === "outside" ? 403 : refusal.code === "not_found" ? 404 : 500;
      return jsonResponse(status, { ok: false, error: refusal.message });
    }
  });

  /** Streams from disk: only a raw descriptor is held while the bytes go out. */
  async function localDownload(
    context: Context,
    target: ResolvedScope,
    relativePath: string,
    disposition: "attachment" | "inline",
  ): Promise<Response> {
    // realpath + prefix: a link inside the root that points out is refused.
    const absolutePath = await resolveFilePath(target.root, relativePath);
    const info = await stat(absolutePath);
    const headers = downloadHeaders(path.basename(absolutePath), disposition, info.size, info.mtimeMs, info.mtime);
    const range = parseRange(context.req.header("range"), info.size);
    if (range === "unsatisfiable") return unsatisfiable(headers, info.size);
    const start = range === null ? 0 : range.start;
    const end = range === null ? Math.max(0, info.size - 1) : range.end;
    const length = info.size === 0 ? 0 : end - start + 1;
    headers.set("Content-Length", String(length));
    if (range !== null) headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    const status = range === null ? 200 : 206;
    if (length === 0) return new Response(null, { status, headers });

    const stream = createReadStream(absolutePath, { start, end });
    const abort = () => stream.destroy();
    context.req.raw.signal.addEventListener("abort", abort, { once: true });
    stream.once("close", () => context.req.raw.signal.removeEventListener("abort", abort));
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, { status, headers });
  }

  /**
   * Another machine: through BB, which reads the whole file at once and serves
   * plugins files up to its own size limit (25 MiB) — past it the read fails
   * and the download with it.
   */
  async function remoteDownload(
    context: Context,
    target: ResolvedScope,
    relativePath: string,
    disposition: "attachment" | "inline",
  ): Promise<Response> {
    const absolutePath = remoteEntry(target, relativePath);
    const file = await bb.sdk.files.read({ hostId: target.hostId, path: absolutePath, rootPath: target.root });
    const bytes = Buffer.from(file.content, file.contentEncoding === "base64" ? "base64" : "utf8");
    const name = pathApiFor(target.root).basename(absolutePath);
    const headers = downloadHeaders(name, disposition, bytes.length, null, null);
    const range = parseRange(context.req.header("range"), bytes.length);
    if (range === "unsatisfiable") return unsatisfiable(headers, bytes.length);
    const body = range === null ? bytes : bytes.subarray(range.start, range.end + 1);
    headers.set("Content-Length", String(body.length));
    if (range !== null) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`);
    return new Response(new Uint8Array(body), { status: range === null ? 200 : 206, headers });
  }

  // §5.2 of file-manager: an hourly sweep of uploads left unfinished for a
  // day, and one at load so a crash mid-upload does not wait for the hour.
  bb.background.schedule("upload-gc", "17 * * * *", async () => {
    const dropped = await (await uploads()).sweep();
    if (dropped > 0) bb.log.info(`upload-gc dropped ${dropped} stale upload(s)`);
  });
  void uploads()
    .then((ready) => ready.sweep())
    .catch((error: unknown) => bb.log.warn(`upload sweep at load failed: ${describe(error)}`));

  bb.cli.register({
    name: "files",
    summary: "Browse and read the files of a thread's workspace",
    commands: [
      {
        name: "tree",
        summary: "List the workspace's files",
        usage: "bb files tree [--depth <n>] [--all] [--limit <n>]",
      },
      {
        name: "find",
        summary: "Fuzzy-find files by path",
        usage: "bb files find <query> [--limit <n>]",
      },
      {
        name: "read",
        summary: "Print a file relative to the workspace root",
        usage: "bb files read <path>",
      },
      {
        name: "root",
        summary: "Print the resolved workspace root and machine",
        usage: "bb files root",
      },
    ],
    async run(argv, ctx) {
      const [command, ...rest] = argv;
      const flags = readFlags(rest);

      const scope: Scope | null =
        ctx.threadId !== undefined
          ? { kind: "thread", id: ctx.threadId }
          : ctx.projectId !== undefined
            ? { kind: "project", id: ctx.projectId }
            : null;
      if (scope === null) {
        return {
          exitCode: 1,
          stderr: "No thread or project in context; run this inside a thread.\n",
        };
      }

      const resolved = await resolveScope(scope);
      if (!resolved.ok) {
        return { exitCode: 1, stderr: `${resolved.reason}\n` };
      }

      switch (command) {
        case "root":
          return {
            exitCode: 0,
            stdout: `${resolved.scope.root}\nmachine: ${resolved.scope.hostName}\n`,
          };

        case "tree": {
          const listed = await listEntries(
            resolved.scope,
            flags.boolean.has("all"),
          );
          const depth = flags.number("depth") ?? Number.POSITIVE_INFINITY;
          const limit = flags.number("limit") ?? 500;
          const shown = listed.entries
            .filter((entry) => entry.path.split("/").length <= depth)
            .slice(0, limit);
          const lines = shown.map((entry) =>
            entry.kind === "directory" ? `${entry.path}/` : entry.path,
          );
          const notes: string[] = [];
          if (shown.length < listed.entries.length) {
            notes.push(
              `(showing ${shown.length} of ${listed.entries.length} entries)`,
            );
          }
          if (listed.truncated) notes.push("(listing was truncated)");
          const clipped = clipLinesForCli(lines, CLI_LISTING_BUDGET);
          if (clipped.omitted > 0) {
            notes.push(
              `(output capped: printed ${lines.length - clipped.omitted} of ${lines.length} entries — BB caps a command's output)`,
            );
          }
          return {
            exitCode: 0,
            stdout: `${clipped.text}${notes.map((note) => `${note}\n`).join("")}`,
          };
        }

        case "find": {
          const query = flags.positional.join(" ");
          if (query === "") {
            return { exitCode: 1, stderr: "Usage: bb files find <query>\n" };
          }
          const listed = await listEntries(resolved.scope, true);
          const files = listed.entries.filter((entry) => entry.kind === "file");
          const ranked = rankEntries(files, query, flags.number("limit") ?? 40);
          if (ranked.matches.length === 0) {
            return { exitCode: 0, stdout: `No file matches ${query}\n` };
          }
          const clipped = clipLinesForCli(
            ranked.matches.map((match) => match.path),
            CLI_LISTING_BUDGET,
          );
          return {
            exitCode: 0,
            stdout: clipped.text,
            ...(clipped.omitted === 0
              ? {}
              : {
                  stderr: `(output capped: ${clipped.omitted} more matches omitted — BB caps a command's output)\n`,
                }),
          };
        }

        case "read": {
          const target = flags.positional[0];
          if (target === undefined) {
            return { exitCode: 1, stderr: "Usage: bb files read <path>\n" };
          }
          const file = await readWorkspaceFile(resolved.scope, target);
          if (file.kind !== "text") {
            return {
              exitCode: 1,
              stderr: `${target} is not text (${file.kind}).\n`,
            };
          }
          const clipped = clipForCli(file.content, CLI_OUTPUT_BUDGET);
          return {
            exitCode: 0,
            stdout: clipped.text,
            ...(clipped.clippedFrom === null
              ? {}
              : {
                  stderr: `(truncated: printed ${CLI_OUTPUT_BUDGET} of ${clipped.clippedFrom} bytes — BB caps a command's output)\n`,
                }),
          };
        }

        default:
          return {
            exitCode: 1,
            stderr:
              "Usage: bb files <root|tree|find|read> [...]\nRun `bb files root` to see the resolved workspace.\n",
          };
      }
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" },
  });
}

/**
 * `application/octet-stream` keeps BB's compression middleware off the body,
 * which is what keeps `Content-Length` (and so a progress bar) on a large file.
 */
function downloadHeaders(
  name: string,
  disposition: "attachment" | "inline",
  size: number,
  mtimeMs: number | null,
  mtime: Date | null,
): Headers {
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store, no-transform",
    "Content-Disposition": contentDisposition(name, disposition),
    "X-Content-Type-Options": "nosniff",
  });
  if (mtimeMs !== null) headers.set("ETag", etagFor(size, mtimeMs));
  if (mtime !== null) headers.set("Last-Modified", mtime.toUTCString());
  return headers;
}

function unsatisfiable(headers: Headers, size: number): Response {
  headers.set("Content-Range", `bytes */${size}`);
  headers.set("Content-Length", "0");
  return new Response(null, { status: 416, headers });
}

function isExcluded(entryPath: string, excluded: ReadonlySet<string>): boolean {
  return entryPath.split("/").some((segment) => excluded.has(segment));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * BB reports another machine's failures as text (the daemon's own codes, or
 * Node's), so this reads the sentence for the few cases the panel acts on.
 */
function remoteMutationError(error: unknown, name: string): MutationError {
  if (error instanceof MutationError) return error;
  const message = describe(error);
  if (/path_exists|EEXIST|already exists/iu.test(message)) {
    return new MutationError("exists", `${name} already exists there. Nothing was changed.`);
  }
  if (/ENOENT|not found|no such file/iu.test(message)) {
    return new MutationError(
      "not_found",
      `${name} is no longer there — it may have been renamed, moved or deleted.`,
    );
  }
  if (/invalid_path|escapes root/iu.test(message)) {
    return new MutationError("outside", "That path leads outside the workspace.");
  }
  return new MutationError("failed", message);
}

/** `src` → `src/`, "" → "": the folder part of a new entry's relative path. */
function remoteFolderPrefix(parent: string): string {
  const trimmed = parent.replace(/^\/+|\/+$/gu, "");
  return trimmed === "" ? "" : `${trimmed}/`;
}

function nameFromPath(relativePath: string): string {
  return relativePath.split("/").filter(Boolean).at(-1) ?? relativePath;
}

/**
 * The host rejects an oversized CLI result outright rather than clipping it.
 * The budget leaves room for the note appended on stderr.
 */
const CLI_OUTPUT_BUDGET = PLUGIN_CLI_OUTPUT_MAX_BYTES - 4096;
// A listing also prints trailing notes, so leave them room inside the budget.
const CLI_LISTING_BUDGET = CLI_OUTPUT_BUDGET - 1024;

interface Flags {
  positional: string[];
  boolean: Set<string>;
  number(name: string): number | undefined;
}

function readFlags(argv: readonly string[]): Flags {
  const positional: string[] = [];
  const booleans = new Set<string>();
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(name, next);
      index += 1;
    } else {
      booleans.add(name);
    }
  }

  return {
    positional,
    boolean: booleans,
    number(name) {
      const raw = values.get(name);
      if (raw === undefined) return undefined;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
  };
}
