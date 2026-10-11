export type EntryKind = "file" | "directory";

export interface FlatEntry {
  path: string;
  kind: EntryKind;
  /**
   * Last modification, from the local walk's stat. BB's listing of another
   * machine carries no times, so it is absent there and date sorting falls
   * back to the name.
   */
  mtimeMs?: number;
}

export interface TreeNode {
  path: string;
  name: string;
  kind: EntryKind;
  children: TreeNode[];
  mtimeMs?: number;
}

/** One rendered line of the explorer: a node plus its indentation depth. */
export interface TreeRow {
  node: TreeNode;
  depth: number;
  isExpanded: boolean;
}

/**
 * Both listings hand us forward slashes already — the local walk joins prefixes
 * with "/" on every platform, and BB's daemon runs its own separator
 * normalizer over `host.list_paths`. So a backslash that survives to here is
 * part of a POSIX file's NAME, and collapsing it would build a phantom
 * directory whose rows open a path that does not exist. `resolveWithinRoot`
 * makes the same distinction server-side.
 */
export function normalizeRelative(path: string): string {
  return path.replace(/^\.?\//, "").replace(/\/+$/, "");
}

export function basename(path: string): string {
  const normalized = normalizeRelative(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function dirname(path: string): string {
  const normalized = normalizeRelative(path);
  const separator = normalized.lastIndexOf("/");
  return separator === -1 ? "" : normalized.slice(0, separator);
}

/** Every directory between the root and `path`, outermost first. */
export function ancestorsOf(path: string): string[] {
  const segments = normalizeRelative(path).split("/");
  segments.pop();
  const ancestors: string[] = [];
  let current = "";
  for (const segment of segments) {
    current = current === "" ? segment : `${current}/${segment}`;
    ancestors.push(current);
  }
  return ancestors;
}

/**
 * Fold a flat listing into a tree. Directories implied by a file path are
 * created even when the listing omitted them, so a files-only listing still
 * produces the full shape.
 */
export function buildTree(
  entries: readonly FlatEntry[],
  sort: TreeSort = DEFAULT_SORT,
): TreeNode[] {
  const root: TreeNode = { path: "", name: "", kind: "directory", children: [] };
  const byPath = new Map<string, TreeNode>([["", root]]);

  const directoryAt = (path: string): TreeNode => {
    const existing = byPath.get(path);
    if (existing !== undefined) return existing;
    const node: TreeNode = {
      path,
      name: basename(path),
      kind: "directory",
      children: [],
    };
    byPath.set(path, node);
    directoryAt(dirname(path)).children.push(node);
    return node;
  };

  for (const entry of entries) {
    const path = normalizeRelative(entry.path);
    if (path === "") continue;
    if (entry.kind === "directory") {
      // A directory can be created early, implied by a file listed before it;
      // its own entry still brings the time.
      const node = directoryAt(path);
      if (entry.mtimeMs !== undefined) node.mtimeMs = entry.mtimeMs;
      continue;
    }
    if (byPath.has(path)) continue;
    const node: TreeNode = {
      path,
      name: basename(path),
      kind: "file",
      children: [],
      ...(entry.mtimeMs === undefined ? {} : { mtimeMs: entry.mtimeMs }),
    };
    byPath.set(path, node);
    directoryAt(dirname(path)).children.push(node);
  }

  const compare = (left: TreeNode, right: TreeNode) => compareForSort(left, right, sort);
  const sortRecursively = (node: TreeNode): void => {
    node.children.sort(compare);
    for (const child of node.children) sortRecursively(child);
  };
  sortRecursively(root);
  return root.children;
}

export type SortKey = "name" | "modified" | "type";

export interface TreeSort {
  key: SortKey;
  /** Flips the order inside each group; folders stay above files either way. */
  reverse: boolean;
}

export const DEFAULT_SORT: TreeSort = { key: "name", reverse: false };

/** What a sibling is compared on — a tree node and a listing entry both fit. */
export interface SortableEntry {
  name: string;
  kind: EntryKind;
  mtimeMs?: number;
}

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/**
 * The explorer's sibling order. Folders always lead, whatever the key and the
 * direction: flipping a list should not bury the folders under a page of files.
 *
 * - name — natural order, so `file2` comes before `file10`;
 * - type — by extension, then by name; folders have none and go by name;
 * - modified — newest first. An entry without a time (another machine's
 *   listing, a directory only implied by its files) counts as the oldest
 *   rather than being compared by name against timed ones: mixing the two
 *   rules would make the order depend on which pair the sort happened to try.
 *
 * Ties fall to the name, so the order is total and stable across refreshes.
 */
export function compareForSort(
  left: SortableEntry,
  right: SortableEntry,
  sort: TreeSort,
): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  const byName = NAME_COLLATOR.compare(left.name, right.name);
  let order = byName;
  if (sort.key === "type" && left.kind === "file") {
    order = NAME_COLLATOR.compare(extensionOf(left.name), extensionOf(right.name)) || byName;
  } else if (sort.key === "modified") {
    const leftTime = left.mtimeMs ?? Number.NEGATIVE_INFINITY;
    const rightTime = right.mtimeMs ?? Number.NEGATIVE_INFINITY;
    order = leftTime === rightTime ? byName : rightTime > leftTime ? 1 : -1;
  }
  return sort.reverse ? -order : order;
}

/**
 * The part after the last dot, lower-cased. A leading dot does not start one:
 * `.gitignore` has no extension, the way Finder and VS Code read it.
 */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

const SORT_KEYS: readonly SortKey[] = ["name", "modified", "type"];

/** A stored choice back to a sort; anything unreadable is the default. */
export function parseTreeSort(raw: string | null): TreeSort {
  if (raw === null) return DEFAULT_SORT;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_SORT;
    const record = value as Record<string, unknown>;
    const key = SORT_KEYS.find((candidate) => candidate === record.key);
    if (key === undefined) return DEFAULT_SORT;
    return { key, reverse: record.reverse === true };
  } catch {
    return DEFAULT_SORT;
  }
}

/**
 * Flatten the tree into the rows the explorer draws, descending only into
 * expanded directories. Collapsed subtrees cost nothing to render, which is
 * what keeps a 40k-entry workspace responsive without windowing.
 */
export function visibleRows(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (node: TreeNode, depth: number): void => {
    const isExpanded = node.kind === "directory" && expanded.has(node.path);
    rows.push({ node, depth, isExpanded });
    if (!isExpanded) return;
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const node of nodes) visit(node, 0);
  return rows;
}

export interface FuzzyMatch {
  score: number;
  positions: number[];
}

/**
 * Subsequence match with the weighting an editor's quick-open uses: matches
 * that start a path segment or a camel/snake word beat matches in the middle of
 * one, and consecutive characters beat scattered ones. Returns null when the
 * query is not a subsequence of the text at all.
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatch | null {
  if (query === "") return { score: 0, positions: [] };

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let cursor = 0;
  let previousIndex = -1;

  for (const character of needle) {
    if (character === " ") continue;
    const index = haystack.indexOf(character, cursor);
    if (index === -1) return null;

    let characterScore = 1;
    if (index === previousIndex + 1) characterScore += 8;
    if (isBoundary(text, index)) characterScore += 12;
    if (index === 0) characterScore += 4;
    score += characterScore;

    positions.push(index);
    previousIndex = index;
    cursor = index + 1;
  }

  // Prefer matches inside the file name over matches in the directory prefix,
  // and shorter paths over longer ones when everything else ties.
  const nameStart = text.lastIndexOf("/") + 1;
  if (positions.length > 0 && positions[0]! >= nameStart) score += 15;
  score -= Math.min(text.length, 120) / 12;

  return { score, positions };
}

function isBoundary(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1]!;
  if (previous === "/" || previous === "_" || previous === "-" || previous === ".") {
    return true;
  }
  const current = text[index]!;
  return previous === previous.toLowerCase() && current !== current.toLowerCase();
}

export interface RankedEntry extends FlatEntry {
  score: number;
  positions: number[];
}

/** Rank a flat listing against a quick-open query, best first. */
export function rankEntries(
  entries: readonly FlatEntry[],
  query: string,
  limit: number,
): { matches: RankedEntry[]; truncated: boolean } {
  const trimmed = query.trim();
  if (trimmed === "") return { matches: [], truncated: false };

  const matches: RankedEntry[] = [];
  for (const entry of entries) {
    const match = fuzzyMatch(entry.path, trimmed);
    if (match === null) continue;
    matches.push({ ...entry, score: match.score, positions: match.positions });
  }

  matches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.path.localeCompare(right.path, undefined, { numeric: true });
  });

  return {
    matches: matches.slice(0, limit),
    truncated: matches.length > limit,
  };
}

/**
 * How a name search matched, best first: the whole name, the start of it, a
 * run inside it, or — failing all three — a scattered subsequence of the path.
 */
export type NameMatchTier = 0 | 1 | 2 | 3;

export interface NameMatch extends FlatEntry {
  tier: NameMatchTier;
  /** The fuzzy score; only the last tier is ordered by it. */
  score: number;
  /** Indices into `path` of the characters to highlight. */
  positions: number[];
}

/**
 * Rank files AND folders against a name query. Typing a folder's name has to
 * put that folder first — before the files inside it, whose paths contain the
 * name too and would win a plain fuzzy match on length alone.
 *
 * Inside the first three tiers a folder beats a file, then the shorter path
 * wins, then natural order. The fuzzy tier is ordered by its score first: its
 * matches range from near-misses to noise, and a folder that is noise should
 * not outrank a file that is a near-miss.
 */
export function rankByName(
  entries: readonly FlatEntry[],
  query: string,
  limit: number,
): { matches: NameMatch[]; truncated: boolean } {
  const trimmed = query.trim();
  if (trimmed === "") return { matches: [], truncated: false };
  const needle = trimmed.toLowerCase();

  const matches: NameMatch[] = [];
  for (const entry of entries) {
    const path = normalizeRelative(entry.path);
    if (path === "") continue;
    const nameStart = path.lastIndexOf("/") + 1;
    const name = path.slice(nameStart).toLowerCase();

    const index = name.indexOf(needle);
    if (index !== -1) {
      const tier: NameMatchTier = name === needle ? 0 : index === 0 ? 1 : 2;
      const positions = Array.from(
        { length: needle.length },
        (_, offset) => nameStart + index + offset,
      );
      matches.push({ ...entry, path, tier, score: 0, positions });
      continue;
    }

    const fuzzy = fuzzyMatch(path, trimmed);
    if (fuzzy === null) continue;
    matches.push({ ...entry, path, tier: 3, score: fuzzy.score, positions: fuzzy.positions });
  }

  matches.sort((left, right) => {
    if (left.tier !== right.tier) return left.tier - right.tier;
    if (left.tier === 3 && right.score !== left.score) return right.score - left.score;
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    if (left.path.length !== right.path.length) return left.path.length - right.path.length;
    return left.path.localeCompare(right.path, undefined, { numeric: true });
  });

  return {
    matches: matches.slice(0, limit),
    truncated: matches.length > limit,
  };
}

export interface TextRun {
  text: string;
  isMatch: boolean;
}

/**
 * Cut `text` — which starts at `offset` within the string `positions` index —
 * into alternating plain and highlighted runs. Runs rather than one element per
 * character, which keeps a long result list cheap to mount.
 */
export function highlightRuns(
  text: string,
  positions: readonly number[],
  offset = 0,
): TextRun[] {
  const marked = new Set(positions);
  const runs: TextRun[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const isMatch = marked.has(offset + index);
    const last = runs.at(-1);
    if (last !== undefined && last.isMatch === isMatch) last.text += text[index]!;
    else runs.push({ text: text[index]!, isMatch });
  }
  return runs;
}

export interface FilteredTree {
  nodes: TreeNode[];
  /** Directories to force open so every surviving match is on screen. */
  expand: Set<string>;
  matchCount: number;
}

/** Prune the tree to the files whose path matches `query`. */
export function filterTree(
  nodes: readonly TreeNode[],
  query: string,
): FilteredTree {
  const trimmed = query.trim();
  if (trimmed === "") {
    return { nodes: [...nodes], expand: new Set(), matchCount: 0 };
  }

  const expand = new Set<string>();
  let matchCount = 0;

  const visit = (node: TreeNode): TreeNode | null => {
    if (node.kind === "file") {
      if (fuzzyMatch(node.path, trimmed) === null) return null;
      matchCount += 1;
      return node;
    }
    const children = node.children
      .map(visit)
      .filter((child): child is TreeNode => child !== null);
    if (children.length === 0) return null;
    expand.add(node.path);
    return { ...node, children };
  };

  return {
    nodes: nodes.map(visit).filter((node): node is TreeNode => node !== null),
    expand,
    matchCount,
  };
}
