// Markdown view — opens .md files in BB's file panel read-only, in Vditor's
// "like Typora" look, with an outline and live refresh; "Редактировать" edits
// them in place, saving only the lines that were changed.
//
// Compiled by `bb plugin build` into dist/app.js + dist/app.css. React and
// @get-bb/plugin-sdk/app come from the BB app at load time (never bundled);
// Vditor is loaded on the first open from the plugin server (see server.ts).
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { MarkdownOpener } from "./src/MarkdownOpener";

export default definePluginApp((bb) => {
  bb.slots.fileOpener({
    id: "markdown",
    title: "Markdown (как в Typora, правка)",
    extensions: ["md", "mdx", "markdown"],
    component: MarkdownOpener,
  });
});
