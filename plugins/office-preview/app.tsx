// Office preview — opens office files in BB's file panel, read-only:
// spreadsheets (.xlsx .xlsm .xls .xlsb .ods .numbers .csv .tsv), Word (.docx),
// PowerPoint (.pptx), and .doc/.rtf/.odt through the plugin's server.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app come from the BB app at load time (never bundled).
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import {
  LEGACY_DOC_EXTENSIONS,
  LegacyDocOpener,
  OLD_POWERPOINT_EXTENSIONS,
  OldPowerPointOpener,
  POWERPOINT_EXTENSIONS,
  PowerPointOpener,
  SPREADSHEET_EXTENSIONS,
  SpreadsheetOpener,
  WORD_EXTENSIONS,
  WordOpener,
} from "./src/openers";

export default definePluginApp((bb) => {
  bb.slots.fileOpener({
    id: "spreadsheet",
    title: "Таблица (Excel)",
    extensions: SPREADSHEET_EXTENSIONS,
    component: SpreadsheetOpener,
  });
  bb.slots.fileOpener({
    id: "word",
    title: "Документ (Word)",
    extensions: WORD_EXTENSIONS,
    component: WordOpener,
  });
  bb.slots.fileOpener({
    id: "powerpoint",
    title: "Презентация (PowerPoint)",
    extensions: POWERPOINT_EXTENSIONS,
    component: PowerPointOpener,
  });
  bb.slots.fileOpener({
    id: "legacy-document",
    title: "Документ (.doc, .rtf, .odt)",
    extensions: LEGACY_DOC_EXTENSIONS,
    component: LegacyDocOpener,
  });
  bb.slots.fileOpener({
    id: "old-powerpoint",
    title: "Презентация .ppt (внешнее приложение)",
    extensions: OLD_POWERPOINT_EXTENSIONS,
    component: OldPowerPointOpener,
  });
});
