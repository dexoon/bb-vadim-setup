// A .pptx as a scrolling list of slides (@aiden0z/pptx-renderer), each followed
// by its speaker notes. Slides fit the panel's width; off-screen ones are
// unmounted so long decks stay light.
import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "@aiden0z/pptx-renderer";
import { useEffect, useRef, useState } from "react";
import type { PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";
import { useFollowLink } from "./external";
import { Notice, Toolbar } from "./opener-ui";
import { readSpeakerNotes } from "./pptx-notes";

const NOTES_CLASS = "opv-notes";

/**
 * Appends the notes under slide `index`. The renderer lays each slide out as
 * `[data-slide-index]` > slide box and resizes only that first child, so the
 * notes go second; `width:0; min-width:100%` keeps them from widening the
 * fit-content wrapper.
 */
function attachNotes(list: HTMLElement, index: number, text: string): void {
  if (!text) return;
  const wrapper = list.querySelector<HTMLElement>(`[data-slide-index="${index}"]`);
  if (!wrapper || wrapper.querySelector(`:scope > .${NOTES_CLASS}`)) return;
  const notes = document.createElement("div");
  notes.className = `${NOTES_CLASS} mt-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground`;
  notes.style.cssText = "width:0;min-width:100%;box-sizing:border-box;white-space:pre-wrap";
  const label = document.createElement("div");
  label.className = "mb-1 font-semibold text-foreground";
  label.textContent = "Заметки докладчика";
  notes.append(label, text);
  wrapper.append(notes);
}

export function PptxView({
  bytes,
  path,
  source,
  onReload,
}: {
  bytes: Uint8Array;
  path: string;
  source: PluginFileOpenerSource;
  onReload: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const followLink = useFollowLink();
  const followRef = useRef(followLink);
  followRef.current = followLink;
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!scroller || !list) return;
    const controller = new AbortController();
    let viewer: PptxViewer | null = null;
    let notes: string[] = [];
    setOpening(true);
    setError(null);

    // Text links are plain <a target=_blank>; send them through BB instead.
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      followRef.current(anchor.getAttribute("href") ?? "");
    };
    scroller.addEventListener("click", onClick, true);

    readSpeakerNotes(bytes).then(
      (found) => {
        notes = found;
        found.forEach((text, i) => attachNotes(list, i, text));
      },
      () => {}, // notes are an extra; the slides still show without them
    );

    PptxViewer.open(bytes, list, {
      renderMode: "list",
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      listOptions: { windowed: true, batchSize: 4, initialSlides: 4, overscanViewport: 1, showSlideLabels: false },
      signal: controller.signal,
      fitMode: "contain",
      scrollContainer: scroller,
      lazyMedia: true,
      lazySlides: true,
      pdfjs: false,
      onSlideRendered: (index) => attachNotes(list, index, notes[index] ?? ""),
      onSlideChange: setCurrent,
    }).then(
      (opened) => {
        if (controller.signal.aborted) {
          opened.destroy();
          return;
        }
        viewer = opened;
        setCount(opened.slideCount);
        setOpening(false);
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(`Не удалось открыть презентацию: ${cause instanceof Error ? cause.message : String(cause)}`);
      },
    );

    return () => {
      controller.abort();
      scroller.removeEventListener("click", onClick, true);
      viewer?.destroy();
      list.replaceChildren();
    };
  }, [bytes]);

  if (error) return <Notice alert message={error} path={path} source={source} onRetry={onReload} />;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <Toolbar path={path} source={source} onReload={onReload}>
        <span>Презентация</span>
        {count > 0 && (
          <span>
            · слайд {current + 1} из {count}
          </span>
        )}
      </Toolbar>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-muted p-4">
        <div ref={listRef} />
      </div>
      {opening && (
        <div role="status" className="absolute inset-x-0 top-10 flex justify-center p-4 text-sm text-muted-foreground">
          Открываю презентацию…
        </div>
      )}
    </div>
  );
}
