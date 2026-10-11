import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { rankByName, type FlatEntry } from "@/lib/tree";
import { canDropInto } from "@/lib/entry-paths";
import { FileGlyph } from "./FileGlyph";
import { MatchedPath } from "./NameResults";

/**
 * The two questions file operations ask, drawn over the panel the way ⌘P is:
 * inside the surface rather than over the whole BB window, so they sit next to
 * the tree they are about. Buttons say what they do ("Move", "Delete forever"),
 * not Yes and No.
 */

function Overlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Hand focus back where it came from, as ⌘P does, so the surface's own
  // shortcuts keep working once the question is answered.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-surface-scrim pt-[12vh]"
      // pointerdown, not click: a drag that started inside must not close it.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          // Keep Tab inside; behind the scrim is a live editor.
          event.preventDefault();
          const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>("input, button") ?? [],
          );
          if (focusable.length === 0) return;
          const index = focusable.indexOf(document.activeElement as HTMLElement);
          const step = event.shiftKey ? -1 : 1;
          focusable[(index + step + focusable.length) % focusable.length]?.focus();
        }}
        className="flex max-h-[70%] w-[min(28rem,90%)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  request,
  onAnswer,
}: {
  request: ConfirmRequest;
  onAnswer: (confirmed: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // A destructive question starts on Cancel, so a reflexive Enter keeps the files.
  useEffect(() => {
    (request.isDestructive === true ? cancelRef : confirmRef).current?.focus();
  }, [request.isDestructive]);

  return (
    <Overlay label={request.title} onClose={() => onAnswer(false)}>
      <div className="flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-foreground">{request.title}</h2>
        <p className="text-[13px] break-words text-muted-foreground">{request.description}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <DialogButton buttonRef={cancelRef} onClick={() => onAnswer(false)}>
          Cancel
        </DialogButton>
        <DialogButton
          buttonRef={confirmRef}
          tone={request.isDestructive === true ? "destructive" : "primary"}
          onClick={() => onAnswer(true)}
        >
          {request.confirmLabel}
        </DialogButton>
      </div>
    </Overlay>
  );
}

const FOLDER_LIMIT = 60;

/**
 * "Move to…": where a finger moves a file, since it cannot drag one. A folder
 * list filtered by name, ranked like the field over the tree; the root first.
 * Folders the entry cannot go to — itself, inside itself, where it already
 * is — are not offered.
 */
export function MoveToDialog({
  entryPath,
  entries,
  onPick,
}: {
  entryPath: string;
  entries: readonly FlatEntry[];
  onPick: (folder: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const folders = useMemo(
    () => entries.filter((entry) => entry.kind === "directory" && canDropInto(entryPath, entry.path)),
    [entries, entryPath],
  );
  const results = useMemo((): { path: string; positions: number[] }[] => {
    const rootFirst = canDropInto(entryPath, "") ? [{ path: "", positions: [] }] : [];
    if (query.trim() === "") {
      return [...rootFirst, ...folders.slice(0, FOLDER_LIMIT).map((entry) => ({ path: entry.path, positions: [] }))];
    }
    return rankByName(folders, query, FOLDER_LIMIT).matches;
  }, [entryPath, folders, query]);

  useEffect(() => setHighlighted(0), [query]);

  const name = entryPath.slice(entryPath.lastIndexOf("/") + 1);
  const pick = (index: number) => {
    const result = results[index];
    if (result !== undefined) onPick(result.path);
  };

  return (
    <Overlay label={`Move ${name} to`} onClose={() => onPick(null)}>
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Icon name="Folder" aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={`Move ${name} to…`}
          aria-label={`Move ${name} to folder`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (results.length === 0) return;
              const step = event.key === "ArrowDown" ? 1 : -1;
              setHighlighted((current) => (current + step + results.length) % results.length);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              pick(highlighted);
            }
          }}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-auto py-1">
        {results.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">No folder matches “{query}”.</li>
        ) : (
          results.map((result, index) => (
            <li key={result.path === "" ? "/" : result.path}>
              <button
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => pick(index)}
                className={cn(
                  "flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left text-[13px] pointer-coarse:py-2.5",
                  index === highlighted ? "bg-surface-selected text-foreground" : "text-foreground/90",
                )}
              >
                <FileGlyph path={result.path} kind="directory" className="translate-y-0.5" />
                {result.path === "" ? (
                  <span className="text-muted-foreground">Workspace root</span>
                ) : (
                  <MatchedPath path={result.path} positions={result.positions} />
                )}
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex justify-end border-t border-border px-4 py-2">
        <DialogButton onClick={() => onPick(null)}>Cancel</DialogButton>
      </div>
    </Overlay>
  );
}

function DialogButton({
  children,
  onClick,
  tone = "plain",
  buttonRef,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "plain" | "primary" | "destructive";
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 cursor-pointer items-center rounded-md px-3 text-[13px] font-medium transition-colors pointer-coarse:h-10",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // The variants of components/ui/button.tsx: outline, default, destructive.
        tone === "plain" && "border border-input text-foreground hover:bg-state-hover",
        tone === "primary" && "bg-foreground text-background hover:bg-foreground/90",
        tone === "destructive" &&
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      )}
    >
      {children}
    </button>
  );
}
