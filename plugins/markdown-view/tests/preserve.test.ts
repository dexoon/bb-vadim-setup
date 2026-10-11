// Saving an edit touches only the edited lines, however Lute reformats the
// rest. Runs against the real Lute from node_modules/vditor: `npm test`.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { splitLines, textToSave } from "../src/preserve.ts";

createRequire(import.meta.url)("vditor/dist/js/lute/lute.min.js");
const lute = (globalThis as { Lute?: { New(): Record<string, (...args: unknown[]) => string> } }).Lute!.New();
lute.SetVditorIR(true);
lute.SetVditorWYSIWYG(false);
lute.SetVditorSV(false);
lute.SetSanitize(true);
lute.SetGFMAutoLink(true);
lute.SetFootnotes(true);

/** Vditor's IR round trip: the text the editor shows for a file. */
const normalize = (markdown: string) =>
  lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(markdown)).replace(/ /g, " ");

const FILE = `# Отчёт

Первый абзац.
Второй абзац.

* пункт один
* пункт два
* пункт три

| Колонка | Значение |
|---|---|
| а | 1 |
| бэ | \`x \\| y\` |
| вэ | 3 |
`;

/** Edits the editor's text the way typing does, then saves. */
function save(original: string, edit: (editorText: string) => string) {
  const baseline = normalize(original);
  const edited = edit(baseline);
  return textToSave(original, baseline, edited, normalize);
}

/** Lines of `after` that are not in `before`, and the other way round. */
function changedLines(before: string, after: string) {
  const a = splitLines(before);
  const b = splitLines(after);
  return { removed: a.filter((line) => !b.includes(line)), added: b.filter((line) => !a.includes(line)) };
}

test("Lute reformats this file, so saving its text as is would rewrite it", () => {
  const { removed } = changedLines(FILE, normalize(FILE));
  assert.ok(removed.length >= 4, `expected Lute to rewrite several lines, got ${removed.length}`);
});

test("a paragraph edit changes only that line", () => {
  const result = save(FILE, (text) => text.replace("Первый абзац.", "Первый абзац, правка."));
  assert.equal(result.scope, "lines");
  assert.deepEqual(changedLines(FILE, result.text), {
    removed: ["Первый абзац.\n"],
    added: ["Первый абзац, правка.\n"],
  });
});

test("a list item edit keeps the other items' bullets", () => {
  const result = save(FILE, (text) => text.replace("пункт два", "пункт два, правка"));
  assert.equal(result.scope, "lines");
  assert.match(result.text, /^\* пункт один$/m);
  assert.match(result.text, /^\* пункт три$/m);
  assert.equal(changedLines(FILE, result.text).removed.length, 1);
});

test("a table cell edit changes only its row; the `\\|` in code survives", () => {
  const result = save(FILE, (text) => text.replace(/\| вэ(\s*)\| 3/, "| вэ$1| 33"));
  assert.equal(result.scope, "lines");
  const { removed } = changedLines(FILE, result.text);
  assert.deepEqual(removed, ["| вэ | 3 |\n"]);
  assert.ok(result.text.includes("| бэ | `x \\| y` |\n"));
});

test("a space typed at the end of a line is not a reason to rewrite the file", () => {
  const result = save(FILE, (text) => text.replace("Второй абзац.", "Второй абзац. "));
  assert.notEqual(result.scope, "whole");
  assert.ok(changedLines(FILE, result.text).removed.length <= 1);
});

test("what is written loads back as what the editor shows", () => {
  const result = save(FILE, (text) => text.replace("# Отчёт", "# Отчёт за сентябрь"));
  assert.equal(normalize(result.text), result.loaded);
  assert.ok(result.loaded.startsWith("# Отчёт за сентябрь"));
});
