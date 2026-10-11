import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type * as PdfJs from "pdfjs-dist";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * A PDF drawn page by page with pdf.js — for touch screens. Safari on iOS
 * shows a PDF in an iframe as a single page that neither scrolls nor turns,
 * so a phone gets this instead of the browser's own viewer: every page in one
 * scrolling column, a page counter with ‹ › and a zoom.
 *
 * pdf.js itself comes from this plugin's server (`/http/pdfjs`), loaded the
 * first time a phone opens a PDF; a desktop never downloads it.
 */
const PDFJS_BASE = "/api/v1/plugins/files-editor/http/pdfjs?f=";

let pdfjsLoading: Promise<typeof PdfJs> | null = null;

function loadPdfJs(): Promise<typeof PdfJs> {
  if (pdfjsLoading === null) {
    // A plain string, so the bundler leaves the import to the browser.
    const url = `${PDFJS_BASE}pdf.min.mjs`;
    pdfjsLoading = (import(/* webpackIgnore: true */ url) as Promise<typeof PdfJs>).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
      return lib;
    });
    // A failed load (offline, an old bb) may be retried on the next open.
    pdfjsLoading.catch(() => {
      pdfjsLoading = null;
    });
  }
  return pdfjsLoading;
}

/** Whether this device is driven by a finger rather than a mouse. */
export function prefersDrawnPdf(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

const ZOOMS = [1, 1.5, 2, 3] as const;

export function PdfPages({ bytes, title }: { bytes: Uint8Array; title: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PdfJs.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [current, setCurrent] = useState(1);
  // The page to keep in view across a zoom: every page changes height, and
  // without an anchor the column kept its pixel offset and landed pages away.
  const zoomAnchor = useRef<number | null>(null);
  // The first page's shape, for every placeholder until its own page is
  // measured — a landscape PDF otherwise jumped as portrait guesses resolved.
  const [firstAspect, setFirstAspect] = useState(1.414);

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfJs.PDFDocumentProxy | null = null;
    setDoc(null);
    setError(null);
    loadPdfJs()
      .then((lib) => lib.getDocument({ data: new Uint8Array(bytes) }).promise)
      .then((next) => {
        loaded = next;
        if (cancelled) {
          void next.destroy();
          return;
        }
        setDoc(next);
        void next.getPage(1).then((page) => {
          const viewport = page.getViewport({ scale: 1 });
          if (!cancelled) setFirstAspect(viewport.height / viewport.width);
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // "Current" is the last page whose top has passed the upper third of the
  // view — and the last page once the column is scrolled to its end, which a
  // short document reaches before its last page gets that high.
  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const pages = scroller.querySelectorAll<HTMLElement>("[data-pdf-page]");
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
      setCurrent(pages.length);
      return;
    }
    const top = scroller.getBoundingClientRect().top;
    let next = 1;
    for (const page of pages) {
      if (page.getBoundingClientRect().top - top <= scroller.clientHeight / 3) next = Number(page.dataset.pdfPage);
      else break;
    }
    setCurrent(next);
  }, []);

  const goTo = (page: number) => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
    target?.scrollIntoView({ block: "start" });
    setCurrent(page);
  };

  const pageCount = doc?.numPages ?? 0;
  const factor = ZOOMS[zoom] ?? 1;

  useLayoutEffect(() => {
    const page = zoomAnchor.current;
    if (page === null) return;
    zoomAnchor.current = null;
    scrollRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`)?.scrollIntoView({ block: "start" });
  }, [factor]);

  const zoomTo = (next: number) => {
    zoomAnchor.current = current;
    setZoom(next);
  };
  // Page width: the column, minus the gutter, times the zoom.
  const pageWidth = Math.max(0, Math.floor((width - 16) * factor));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/40">
      <div className="flex h-9 shrink-0 items-center justify-center gap-1 border-b border-border bg-background px-2 text-xs">
        <NavButton icon="ChevronLeft" label="Previous page" isDisabled={current <= 1} onClick={() => goTo(current - 1)} />
        <span className="min-w-16 text-center tabular-nums text-muted-foreground" aria-live="polite">
          {pageCount === 0 ? "…" : `${current} / ${pageCount}`}
        </span>
        <NavButton
          icon="ChevronRight"
          label="Next page"
          isDisabled={pageCount === 0 || current >= pageCount}
          onClick={() => goTo(current + 1)}
        />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <NavButton icon="ZoomOut" label="Zoom out" isDisabled={zoom === 0} onClick={() => zoomTo(Math.max(0, zoom - 1))} />
        <span className="min-w-10 text-center tabular-nums text-muted-foreground">{Math.round(factor * 100)}%</span>
        <NavButton
          icon="ZoomIn"
          label="Zoom in"
          isDisabled={zoom === ZOOMS.length - 1}
          onClick={() => zoomTo(Math.min(ZOOMS.length - 1, zoom + 1))}
        />
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="document"
        aria-label={title}
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        {error !== null ? (
          <p className="p-6 text-center text-sm text-destructive-text">Could not show this PDF: {error}</p>
        ) : doc === null || pageWidth === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Opening PDF…</p>
        ) : (
          <div className="flex flex-col items-center gap-3 p-2" style={{ width: pageWidth + 16, minWidth: "100%" }}>
            {Array.from({ length: pageCount }, (_, index) => (
              <PdfPage key={index + 1} doc={doc} pageNumber={index + 1} width={pageWidth} defaultAspect={firstAspect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One page: a placeholder of the right shape until it nears the screen, then a
 * canvas; cleared again once it is far away, so a long PDF does not hold every
 * page's pixels in a phone's memory at once.
 */
function PdfPage({
  doc,
  pageNumber,
  width,
  defaultAspect,
}: {
  doc: PdfJs.PDFDocumentProxy;
  pageNumber: number;
  width: number;
  defaultAspect: number;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  const aspect = measured ?? defaultAspect;
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (holder === null || typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry?.isIntersecting ?? false), {
      rootMargin: "1200px 0px",
    });
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (!isNear || width === 0) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: PdfJs.RenderTask | null = null;
    void doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      setMeasured(natural.height / natural.width);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / natural.width) * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (context === null) return;
      task = page.render({ canvasContext: context, viewport });
      task.promise.catch(() => {
        // Cancelled by a scroll away or a zoom; the next pass draws it again.
      });
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, isNear, pageNumber, width]);

  return (
    <div
      ref={holderRef}
      data-pdf-page={pageNumber}
      className="shrink-0 bg-white shadow-sm"
      style={{ width, height: Math.round(width * aspect) }}
    >
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} className="block h-full w-full" />
    </div>
  );
}

function NavButton({
  icon,
  label,
  onClick,
  isDisabled,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-muted-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        isDisabled === true ? "opacity-40" : "cursor-pointer hover:bg-state-hover hover:text-foreground",
      )}
    >
      <Icon name={icon} aria-hidden className="size-4" />
    </button>
  );
}
