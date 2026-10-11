import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { normalizeRelative, rankByName, type FlatEntry, type NameMatch } from "@/lib/tree";
import { FileGlyph } from "./FileGlyph";
import { MatchedPath } from "./NameResults";

const RESULT_LIMIT = 60;

/**
 * The editor's ⌘P palette: type anywhere in a path, arrow through the ranked
 * hits, Enter opens. Ranking runs over the listing already in memory, so it
 * answers on every keystroke without another round trip.
 *
 * Folders are listed too, ranked the way the explorer's own field ranks them
 * (`rankByName`): a folder named exactly like the query comes first. Picking
 * one shows it in the tree rather than opening anything.
 */
export function QuickOpen({
  entries,
  onOpenFile,
  onRevealFolder,
  onClose,
}: {
  entries: readonly FlatEntry[];
  onOpenFile: (path: string) => void;
  onRevealFolder: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hand focus back where it came from. Without this the workspace root loses
  // focus for good and its ⌘P / ⌘S handlers stop firing.
  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const results = useMemo((): NameMatch[] => {
    if (query.trim() === "") {
      // Nothing typed: the listing's head, which is the top of the tree.
      return entries.slice(0, RESULT_LIMIT).map((entry) => ({
        ...entry,
        path: normalizeRelative(entry.path),
        tier: 3,
        score: 0,
        positions: [],
      }));
    }
    return rankByName(entries, query, RESULT_LIMIT).matches;
  }, [entries, query]);

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    const row = listRef.current?.children[highlighted];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const commit = (index: number) => {
    const match = results[index];
    if (match === undefined) return;
    if (match.kind === "directory") onRevealFolder(match.path);
    else onOpenFile(match.path);
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-20 flex justify-center bg-surface-scrim pt-[10vh]"
      // Closing on pointerdown rather than click: a click fires on the scrim
      // even when the gesture STARTED inside the dialog, so drag-selecting the
      // query and releasing past the edge would throw the query away.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick open"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          // Keep Tab inside the palette; behind the scrim is a live editor.
          event.preventDefault();
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            "input, button",
          );
          if (focusable === undefined || focusable.length === 0) return;
          const list = Array.from(focusable);
          const index = list.indexOf(document.activeElement as HTMLElement);
          const step = event.shiftKey ? -1 : 1;
          const next = list[(index + step + list.length) % list.length];
          next?.focus();
        }}
        className="flex max-h-[70%] w-[min(36rem,90%)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Icon name="Search" aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            spellCheck={false}
            placeholder="Go to file or folder…"
            aria-label="Go to file or folder"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlighted((current) =>
                  results.length === 0 ? 0 : (current + 1) % results.length,
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlighted((current) =>
                  results.length === 0
                    ? 0
                    : (current - 1 + results.length) % results.length,
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                commit(highlighted);
              }
            }}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
        </div>

        <ul ref={listRef} className="min-h-0 flex-1 overflow-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No file or folder matches “{query}”.
            </li>
          ) : (
            results.map((match, index) => (
              <li key={match.path}>
                <button
                  type="button"
                  title={match.kind === "directory" ? `Show ${match.path} in the tree` : match.path}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(index)}
                  className={cn(
                    "flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left text-[13px]",
                    index === highlighted
                      ? "bg-surface-selected text-foreground"
                      : "text-foreground/90",
                  )}
                >
                  <FileGlyph
                    path={match.path}
                    kind={match.kind}
                    className="translate-y-0.5"
                  />
                  <MatchedPath path={match.path} positions={match.positions} />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
