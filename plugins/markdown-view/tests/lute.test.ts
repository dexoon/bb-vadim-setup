// What the view does to the page must never reach the file. Runs against the
// real Lute from node_modules/vditor: `npm test`.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

createRequire(import.meta.url)("vditor/dist/js/lute/lute.min.js");
type Lute = Record<string, (...args: unknown[]) => string>;
const newLute = (): Lute => {
  const lute = (globalThis as { Lute?: { New(): Lute } }).Lute!.New();
  lute.SetVditorIR(true);
  lute.SetVditorWYSIWYG(false);
  lute.SetVditorSV(false);
  lute.SetSanitize(true);
  lute.SetGFMAutoLink(true);
  lute.SetFootnotes(true);
  return lute;
};

const FILE = `# Отчёт

![схема](diagram.svg) и [соседний файл](02-links-media.md), [абсолютный](/Users/me/a.md), [сайт](https://example.com)

<img src="charts/rev.png">

* пункт со [ссылкой](../README.md)
`;

test("relative images get the preview address on screen, while the text keeps the paths as written", () => {
  const lute = newLute();
  const plain = lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(FILE));
  lute.SetLinkBase("/api/v1/file-previews/abc/samples/");
  const dom = lute.Md2VditorIRDOM(FILE);
  assert.match(dom, /<img src="\/api\/v1\/file-previews\/abc\/samples\/diagram\.svg"/);
  assert.match(dom, /marker--link">02-links-media\.md</);
  assert.equal(lute.VditorIRDOM2Md(dom), plain);
});

test("the current-paragraph mark on a block does not change the text", () => {
  const lute = newLute();
  const dom = lute.Md2VditorIRDOM(FILE);
  const marked = dom.replace("<p data-block=\"0\">", "<p data-block=\"0\" data-mdv-current=\"\">");
  assert.notEqual(marked, dom);
  assert.equal(lute.VditorIRDOM2Md(marked), lute.VditorIRDOM2Md(dom));
});
