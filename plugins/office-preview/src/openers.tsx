// The file openers themselves, apart from their registration in app.tsx, so the
// Explorer_vibecom panel (files-editor) can show office files the same way
// inside its own view. Behaviour is unchanged; only the module moved.
import { useState } from "react";
import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";
import { DocxView } from "./DocxView";
import { useOpenExternally } from "./external";
import { isLegacyDocExt, LEGACY_DOC_EXTENSIONS } from "./formats";
import { LegacyDocView } from "./LegacyDocView";
import { FileOpener, Notice } from "./opener-ui";
import { extensionOf, parseWorkbook, SPREADSHEET_EXTENSIONS } from "./parse";
import { PptxView } from "./PptxView";
import { WorkbookView } from "./WorkbookView";

export const WORD_EXTENSIONS = ["docx", "docm", "dotx"];
export const POWERPOINT_EXTENSIONS = ["pptx"];
export const OLD_POWERPOINT_EXTENSIONS = ["ppt", "pps"];

const passBytes = async (bytes: Uint8Array) => bytes;

export function SpreadsheetOpener(props: PluginFileOpenerProps) {
  const openExternally = useOpenExternally(props.path, props.source);
  return (
    <FileOpener {...props} loadingLabel="Открываю таблицу…" load={(bytes) => parseWorkbook(bytes, extensionOf(props.path))}>
      {(workbook, reload) => <WorkbookView workbook={workbook} onReload={reload} onOpenExternally={openExternally} />}
    </FileOpener>
  );
}

export function WordOpener(props: PluginFileOpenerProps) {
  return (
    <FileOpener {...props} loadingLabel="Открываю документ…" load={passBytes}>
      {(bytes, reload) => <DocxView bytes={bytes} path={props.path} source={props.source} onReload={reload} />}
    </FileOpener>
  );
}

export function PowerPointOpener(props: PluginFileOpenerProps) {
  return (
    <FileOpener {...props} loadingLabel="Открываю презентацию…" load={passBytes}>
      {(bytes, reload) => <PptxView bytes={bytes} path={props.path} source={props.source} onReload={reload} />}
    </FileOpener>
  );
}

export function LegacyDocOpener(props: PluginFileOpenerProps) {
  const ext = extensionOf(props.path);
  if (!isLegacyDocExt(ext)) return <props.Original />;
  return (
    <FileOpener {...props} loadingLabel="Открываю документ…" load={passBytes}>
      {(bytes, reload) => (
        <LegacyDocView bytes={bytes} ext={ext} path={props.path} source={props.source} onReload={reload} />
      )}
    </FileOpener>
  );
}

/** Old binary .ppt: nothing in the browser or on a stock Mac reads it. */
export function OldPowerPointOpener({ path, source, Original }: PluginFileOpenerProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  if (showOriginal) return <Original />;
  return (
    <Notice
      message="Старый формат PowerPoint (.ppt) в панели не показывается. Откройте файл в Keynote или PowerPoint либо сохраните его как .pptx."
      path={path}
      source={source}
      onOriginal={() => setShowOriginal(true)}
    />
  );
}

export { LEGACY_DOC_EXTENSIONS } from "./formats";
export { SPREADSHEET_EXTENSIONS } from "./parse";
