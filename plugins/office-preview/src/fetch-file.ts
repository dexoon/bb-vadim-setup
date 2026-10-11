// Reads the opened file's bytes through BB's files API (`sdk.files`).
//
// That is the path BB documents for file openers: it takes the file's host
// and absolute path and works for files on any connected host. BB's internal
// file URLs, which this plugin used to fetch, changed in 0.45 and broke every
// read; the SDK is the contract that outlives them.
import type { PluginBrowserBbSdk, PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";

/** Where the file sits on disk, for the files API. */
export interface FileLocation {
  hostId: string;
  /** Absolute path on that host. */
  path: string;
}

const joinPath = (root: string, relative: string) => `${root.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;

/** Resolves where the opened file lives; null for sources BB left incomplete. */
export async function locateFile(
  sdk: PluginBrowserBbSdk,
  path: string,
  source: PluginFileOpenerSource,
  signal: AbortSignal,
): Promise<FileLocation | null> {
  if (source.kind === "thread-storage") {
    if (source.threadId === null) return null;
    const storage = await sdk.threads.storageLocation({ threadId: source.threadId, signal });
    return { hostId: storage.hostId, path: joinPath(storage.storageRootPath, path) };
  }

  let environmentId = source.environmentId;
  if (environmentId === null && source.threadId !== null) {
    environmentId = (await sdk.threads.get({ threadId: source.threadId, signal })).environmentId;
  }

  if (source.kind === "host") {
    if (environmentId === null) return null;
    const environment = await sdk.environments.get({ environmentId, signal });
    return { hostId: source.experimental_hostId ?? environment.hostId, path };
  }

  const environment =
    environmentId !== null
      ? await sdk.environments.get({ environmentId, signal })
      : source.projectId !== null
        ? // A project file opened without a thread lives in the project's own checkout.
          (await sdk.environments.list({ projectId: source.projectId, signal })).find(
            (candidate) =>
              !candidate.isWorktree &&
              candidate.path !== null &&
              (!source.experimental_hostId || candidate.hostId === source.experimental_hostId),
          )
        : undefined;
  if (!environment?.path) return null;
  return { hostId: source.experimental_hostId ?? environment.hostId, path: joinPath(environment.path, path) };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** BB serves plugins files up to 25 MiB; larger ones get HTTP 413 `file_too_large`. */
export class FileTooLargeError extends Error {
  constructor() {
    super("Файл больше 25 МиБ: BB не отдаёт плагинам файлы такого размера.");
    this.name = "FileTooLargeError";
  }
}

/** The SDK's request errors carry the HTTP status and BB's error code. */
const isTooLarge = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ((error as { status?: unknown }).status === 413 || (error as { code?: unknown }).code === "file_too_large");

export async function readFileBytes(
  sdk: PluginBrowserBbSdk,
  file: FileLocation,
  signal: AbortSignal,
): Promise<Uint8Array> {
  let result;
  try {
    result = await sdk.files.read({ hostId: file.hostId, path: file.path, signal });
  } catch (error) {
    throw isTooLarge(error) ? new FileTooLargeError() : error;
  }
  return result.contentEncoding === "base64" ? base64ToBytes(result.content) : new TextEncoder().encode(result.content);
}
