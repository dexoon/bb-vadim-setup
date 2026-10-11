// The opener: the document in Vditor (read-only until "Редактировать"), BB's
// own preview on request. Where the file sits on disk is resolved once: the
// document reads and writes it there, and relative links resolve from it.
import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import { Editor } from "./Editor";
import { locateFile } from "./file-access";
import type { FileLocation } from "./file-access";
import { BUTTON, Loading, Notice, ScrollFrame, sourceKey, useLatest } from "./ui";

type Located =
  | { status: "locating" }
  | { status: "found"; file: FileLocation }
  | { status: "no-source" }
  | { status: "error"; message: string };

export function MarkdownOpener({ path, source, Original }: PluginFileOpenerProps) {
  const sdk = useLatest(useSdk());
  const latestSource = useLatest(source);
  const key = sourceKey(source);
  const [original, setOriginal] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [located, setLocated] = useState<Located>({ status: "locating" });

  useEffect(() => {
    const controller = new AbortController();
    // BB may hand this same opener another file: "Стандартный просмотр" was a choice for the previous one.
    setOriginal(false);
    setLocated({ status: "locating" });
    locateFile(sdk.current, path, latestSource.current, controller.signal).then(
      (file) => {
        if (!controller.signal.aborted) setLocated(file === null ? { status: "no-source" } : { status: "found", file });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLocated({
          status: "error",
          message: `Не удалось найти файл: ${error instanceof Error ? error.message : String(error)}`,
        });
      },
    );
    return () => controller.abort();
  }, [sdk, latestSource, path, key, attempt]);

  const showOriginal = () => setOriginal(true);
  if (original) {
    return (
      <ScrollFrame>
        <Original />
      </ScrollFrame>
    );
  }
  if (located.status === "locating") return <Loading label="Открываю Markdown…" />;
  if (located.status === "no-source") {
    return (
      <Notice message="BB не сообщил, откуда открыт этот файл.">
        <button type="button" className={BUTTON} onClick={showOriginal}>
          Стандартный просмотр
        </button>
      </Notice>
    );
  }
  if (located.status === "error") {
    return (
      <Notice message={located.message}>
        <button type="button" className={BUTTON} onClick={() => setAttempt((n) => n + 1)}>
          Повторить
        </button>
        <button type="button" className={BUTTON} onClick={showOriginal}>
          Стандартный просмотр
        </button>
      </Notice>
    );
  }
  return <Editor file={located.file} onOriginal={showOriginal} />;
}
