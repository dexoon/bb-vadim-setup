// Saves an edit made in Vditor without Vditor's reformatting of the rest of
// the file. Vditor hands back the whole document re-serialized by its Lute
// engine (tables padded, bullets and blank lines normalized), so saving that
// text as is rewrites about a fifth of an untouched file. Instead the save
// keeps the original bytes everywhere the user didn't edit and takes Vditor's
// text only for the edited lines.
//
// Measured on 50 files of this repository (edits of paragraphs, list items,
// headings and table cells, and a half-typed word): every edit passes the
// check in `textToSave`, an edited paragraph shows as one changed line in git.
import { diffArrays } from "diff";

/** Lines with their terminators, so joining them gives the text back byte for byte. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * Each diff gets this long before the tier gives up. A file that Lute rewrites
 * almost entirely (a reference made of tables) can take a minute to diff.
 */
const DIFF_TIMEOUT_MS = 400;

type LineKey = (line: string) => string;

/**
 * A line with Lute's cosmetic rewrites undone: padding (`| a   |  b |` reads as
 * `| a | b |`), the bullet character (`*` and `+` read as `-`), the number of
 * an ordered item and the case of a checkbox. `keepIndent` keeps leading
 * whitespace significant: Lute re-indents nested lists, and ignoring that
 * saves more lines when it is cosmetic but fails the check when it is not.
 */
const cosmetic =
  (keepIndent: boolean): LineKey =>
  (line) => {
    const indent = /^[ \t]*/.exec(line)![0];
    const body = line
      .slice(indent.length)
      .replace(/^[*+-](?=\s)/, "-")
      .replace(/^\d+([.)])(?=\s)/, "1$1")
      .replace(/^- \[[xX]\]/, "- [x]");
    return (keepIndent ? indent : "") + body.replace(/\s+/g, " ").replace(/ ?\| ?/g, "|").trim();
  };

const exact: LineKey = (line) => line;

interface Run {
  equal: boolean;
  oStart: number;
  oEnd: number;
  bStart: number;
  bEnd: number;
}

/**
 * Where each baseline line boundary sits in the original: lines that read the
 * same under `key` correspond one to one. Inside a block Lute changed beyond
 * that there is no such place, so an edit there widens to the whole block.
 * Null when the diff runs out of time.
 */
function originalBoundaries(oLines: string[], bLines: string[], key: LineKey): Map<number, number> | null {
  const parts = diffArrays(oLines.map(key), bLines.map(key), { timeout: DIFF_TIMEOUT_MS });
  if (!parts) return null;

  const runs: Run[] = [];
  let o = 0;
  let b = 0;
  for (const part of parts) {
    const n = part.count ?? part.value.length;
    const equal = !part.added && !part.removed;
    const last = runs.at(-1);
    if (!equal && last && !last.equal) {
      // A deletion and an insertion side by side are one rewritten block.
      if (part.removed) last.oEnd += n;
      else last.bEnd += n;
    } else {
      runs.push({
        equal,
        oStart: o,
        oEnd: o + (part.added ? 0 : n),
        bStart: b,
        bEnd: b + (part.removed ? 0 : n),
      });
    }
    if (!part.added) o += n;
    if (!part.removed) b += n;
  }

  // The diff may pair a blank line after the original block with the blank
  // line before its rewritten copy, splitting one block into a deletion and
  // an insertion. Blank-only runs between changes join them into one.
  const merged: Run[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    const next = runs[i + 1];
    const last = merged.at(-1);
    const blankOnly = run.equal && oLines.slice(run.oStart, run.oEnd).every((line) => line.trim() === "");
    if (blankOnly && last && !last.equal && next && !next.equal) {
      last.oEnd = next.oEnd;
      last.bEnd = next.bEnd;
      i += 1;
    } else if (!run.equal && last && !last.equal) {
      last.oEnd = run.oEnd;
      last.bEnd = run.bEnd;
    } else {
      merged.push({ ...run });
    }
  }

  const map = new Map<number, number>([[0, 0]]);
  for (const run of merged) {
    if (run.equal) {
      for (let i = 0; i <= run.bEnd - run.bStart; i += 1) map.set(run.bStart + i, run.oStart + i);
    } else {
      map.set(run.bStart, run.oStart);
      map.set(run.bEnd, run.oEnd);
    }
  }
  return map;
}

interface Hunk {
  /** Replaced lines of the baseline, [bStart, bEnd). */
  bStart: number;
  bEnd: number;
  /** Their replacement in the edited text, [eStart, eEnd). */
  eStart: number;
  eEnd: number;
}

/** Changed regions of `from` → `to`, in order; null when the diff runs out of time. */
function hunks(from: string[], to: string[]): Hunk[] | null {
  const parts = diffArrays(from, to, { timeout: DIFF_TIMEOUT_MS });
  if (!parts) return null;
  const out: Hunk[] = [];
  let b = 0;
  let e = 0;
  let open: Hunk | null = null;
  for (const part of parts) {
    const n = part.count ?? part.value.length;
    if (!part.added && !part.removed) {
      if (open) out.push(open);
      open = null;
      b += n;
      e += n;
      continue;
    }
    open ??= { bStart: b, bEnd: b, eStart: e, eEnd: e };
    if (part.removed) b += n;
    else e += n;
    open.bEnd = b;
    open.eEnd = e;
  }
  if (open) out.push(open);
  return out;
}

/**
 * The original with the edits between `baseline` and `edited` carried over,
 * or null when a diff ran out of time.
 *
 * @param original  the file as read from disk
 * @param baseline  the editor's text for `original` before any edit
 * @param edited    the editor's text now
 * @param key       which original lines count as the same as the baseline's
 */
export function mergePreserving(original: string, baseline: string, edited: string, key: LineKey): string | null {
  const oLines = splitLines(original);
  const bLines = splitLines(baseline);
  const eLines = splitLines(edited);

  const toOriginal = originalBoundaries(oLines, bLines, key);
  const changes = toOriginal && hunks(bLines, eLines);
  if (!toOriginal || !changes) return null;

  const widened: Hunk[] = [];
  for (const h of changes) {
    let { bStart, bEnd, eStart, eEnd } = h;
    while (!toOriginal.has(bStart)) {
      bStart -= 1;
      eStart -= 1;
    }
    while (!toOriginal.has(bEnd)) {
      bEnd += 1;
      eEnd += 1;
    }
    const last = widened.at(-1);
    if (last && bStart <= last.bEnd) {
      last.bEnd = Math.max(last.bEnd, bEnd);
      last.eEnd = eEnd + (last.bEnd - bEnd);
    } else {
      widened.push({ bStart, bEnd, eStart, eEnd });
    }
  }

  const out: string[] = [];
  let copied = 0;
  for (const h of widened) {
    out.push(...oLines.slice(copied, toOriginal.get(h.bStart)), ...eLines.slice(h.eStart, h.eEnd));
    copied = toOriginal.get(h.bEnd)!;
  }
  out.push(...oLines.slice(copied));
  return out.join("");
}

/**
 * The same document up to Lute's cosmetics: line by line under the
 * indent-keeping key, so padding, bullets, item numbers, checkbox case and a
 * space still being typed at the end of a line don't count, while a lost, an
 * extra or a re-indented line does.
 */
function sameDocument(a: string, b: string): boolean {
  if (a === b) return true;
  const key = cosmetic(true);
  const left = splitLines(a);
  const right = splitLines(b);
  return left.length === right.length && left.every((line, i) => key(line) === key(right[i]));
}

/** How much of the file a save rewrote. */
export type SaveScope = "lines" | "blocks" | "whole";

/**
 * What to write for `edited`, the editor's current text of a file whose disk
 * content is `original` and whose editor text before any edit was `baseline`,
 * i.e. `normalize(original)` — passed in because the caller already has it.
 *
 * `normalize` is the editor's own round trip — the text it would show for a
 * given file — so every candidate is checked by loading it the way the editor
 * would: it must come back as the same document as `edited` (`sameDocument`).
 * The narrowest candidate that passes wins; if none does, the editor's text is
 * written as is, which is what Vditor itself would save. `loaded` is the
 * written text as the editor would show it: the next save's baseline.
 */
export function textToSave(
  original: string,
  baseline: string,
  edited: string,
  normalize: (markdown: string) => string,
): { text: string; scope: SaveScope; loaded: string } {
  let editedNormalized: string | null = null;
  for (const key of [cosmetic(false), cosmetic(true), exact]) {
    const merged = mergePreserving(original, baseline, edited, key);
    if (merged === null) continue;
    const loaded = normalize(merged);
    // Against the editor's text, or against what that text would load as: on
    // the few files Lute can't reproduce itself (a `|` inside code in a table
    // cell) only one of the two holds.
    if (sameDocument(loaded, edited) || sameDocument(loaded, (editedNormalized ??= normalize(edited)))) {
      return { text: merged, scope: key === exact ? "blocks" : "lines", loaded };
    }
  }
  return { text: edited, scope: "whole", loaded: editedNormalized ?? normalize(edited) };
}
