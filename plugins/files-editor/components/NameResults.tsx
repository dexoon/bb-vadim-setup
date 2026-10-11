import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { highlightRuns, type NameMatch, type TextRun } from "@/lib/tree";
import { FileGlyph } from "./FileGlyph";

/**
 * The explorer field's answer while it finds by name: files and folders in one
 * ranked list, the arrow keys in the field moving the highlight. The field
 * owns the keyboard; this only draws and reports clicks.
 */
export function NameResults({
  query,
  matches,
  truncated,
  limit,
  highlighted,
  activePath,
  isIgnored,
  onHighlight,
  onPick,
}: {
  query: string;
  matches: readonly NameMatch[];
  truncated: boolean;
  limit: number;
  highlighted: number;
  activePath: string | null;
  isIgnored: (path: string) => boolean;
  onHighlight: (index: number) => void;
  onPick: (match: NameMatch) => void;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const row = listRef.current?.children[highlighted];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  if (matches.length === 0) {
    return (
      <p className="min-h-0 flex-1 px-3 py-2 text-xs text-muted-foreground">
        No file or folder name matches “{query.trim()}”.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto pb-2">
      <ul ref={listRef} role="listbox" aria-label="Files and folders by name">
        {matches.map((match, index) => {
          const dimmed = isIgnored(match.path);
          return (
            <li key={match.path} role="none">
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                title={match.path}
                onMouseEnter={() => onHighlight(index)}
                onClick={() => onPick(match)}
                className={cn(
                  "flex h-6 w-full cursor-pointer items-baseline gap-1.5 px-3 text-left text-[13px]",
                  "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:-outline-offset-1",
                  index === highlighted ? "bg-state-hover" : undefined,
                  match.path === activePath && "bg-surface-selected",
                  dimmed ? "text-muted-foreground/60" : "text-foreground/90",
                )}
              >
                <FileGlyph
                  path={match.path}
                  kind={match.kind}
                  className={cn("translate-y-0.5", dimmed && "opacity-60")}
                />
                <MatchedPath path={match.path} positions={match.positions} />
              </button>
            </li>
          );
        })}
      </ul>
      {truncated ? (
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          {`Showing the best ${limit.toLocaleString()} — type more to narrow it down.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A path as a result row shows it: the name, then the folder it is in, dimmer
 * and smaller. `positions` index the whole path, so a fuzzy hit in the folder
 * part lights up there too.
 */
export function MatchedPath({
  path,
  positions,
}: {
  path: string;
  positions: readonly number[];
}) {
  const nameStart = path.lastIndexOf("/") + 1;
  const nameRuns = useMemo(
    () => highlightRuns(path.slice(nameStart), positions, nameStart),
    [nameStart, path, positions],
  );
  const parentRuns = useMemo(
    () => (nameStart === 0 ? [] : highlightRuns(path.slice(0, nameStart - 1), positions, 0)),
    [nameStart, path, positions],
  );

  return (
    <>
      {/* The name keeps its width; the folder beside it gives way first. */}
      <span className="max-w-full shrink-0 truncate">
        <Runs runs={nameRuns} />
      </span>
      {parentRuns.length === 0 ? null : (
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          <Runs runs={parentRuns} />
        </span>
      )}
    </>
  );
}

function Runs({ runs }: { runs: readonly TextRun[] }) {
  return (
    <>
      {runs.map((run, index) =>
        run.isMatch ? (
          <mark
            // eslint-disable-next-line react/no-array-index-key -- position IS the run's identity
            key={index}
            className="bg-transparent font-semibold text-primary"
          >
            {run.text}
          </mark>
        ) : (
          // eslint-disable-next-line react/no-array-index-key -- same
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
