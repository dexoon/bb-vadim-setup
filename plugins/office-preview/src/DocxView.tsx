// A .docx drawn page by page with docx-preview inside a sandboxed frame, scaled
// down to the panel's width when the page is wider than the panel.
import { renderAsync } from "docx-preview";
import { useCallback, useState } from "react";
import type { PluginFileOpenerSource } from "@get-bb/plugin-sdk/app";
import { Notice, Toolbar } from "./opener-ui";
import { SandboxFrame } from "./SandboxFrame";

const FRAME_STYLE = `
body { margin: 0; background: #f3f3f3; }
.docx-wrapper { background: transparent !important; padding: 16px 16px 0 !important; }
.docx-wrapper > section.docx { margin-bottom: 16px !important; }
`;

// Word keeps Symbol/Wingdings bullets in the Private Use Area; without those
// fonts (macOS has neither mapping) they show as empty boxes. Swap in the
// look-alike Unicode character and drop the font.
const PUA = /[\uF000-\uF0FF]/g;
const HAS_PUA = /[\uF000-\uF0FF]/;
const PUA_LOOKALIKE: Record<string, string> = {
  "\uF0B7": "•",
  "\uF0A7": "▪",
  "\uF0D8": "➢",
  "\uF0FC": "✓",
  "\uF076": "❖",
  "\uF06E": "■",
};
const SYMBOL_FONT = /symbol|wingdings|webdings/i;
const lookalike = (char: string) => PUA_LOOKALIKE[char] ?? "•";

function fixSymbolBullets(doc: Document): void {
  for (const style of doc.querySelectorAll("style")) {
    const css = style.textContent ?? "";
    if (!HAS_PUA.test(css)) continue;
    style.textContent = css.replace(/[^{}]*\{[^{}]*\}/g, (rule) =>
      HAS_PUA.test(rule) ? rule.replace(PUA, lookalike).replace(/font-family:[^;}]*;?/gi, "") : rule,
    );
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? "";
    if (!HAS_PUA.test(text)) continue;
    node.nodeValue = text.replace(PUA, lookalike);
    const parent = node.parentElement;
    if (parent && SYMBOL_FONT.test(parent.style.fontFamily)) parent.style.fontFamily = "";
  }
}

export function DocxView({
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
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const fill = useCallback(
    (doc: Document) => {
      let cancelled = false;
      let unfit = () => {};
      const view = doc.defaultView;
      const style = doc.createElement("style");
      style.textContent = FRAME_STYLE;
      doc.head.append(style);
      // renderAsync empties both containers it's given, so it gets its own
      // rather than <head> (which holds the frame's CSP and our style).
      const docxStyles = doc.createElement("div");
      const docxBody = doc.createElement("div");
      doc.body.append(docxStyles, docxBody);
      setRendering(true);
      setError(null);

      renderAsync(bytes, docxBody, docxStyles, {
        className: "docx",
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
        renderComments: false,
        renderAltChunks: false,
        useBase64URL: true,
      }).then(
        () => {
          if (cancelled) return;
          fixSymbolBullets(doc);
          // Each page fits on its own: a landscape section shouldn't shrink the
          // portrait ones. Widths are measured once, before any zoom.
          const pages = [...doc.querySelectorAll<HTMLElement>("section.docx")];
          const widths = pages.map((page) => page.offsetWidth);
          const fit = () => {
            const room = doc.documentElement.clientWidth - 32;
            const zoomFor = (width: number) => (width > 0 ? Math.min(1, room / width) : 1);
            pages.forEach((page, i) => (page.style.zoom = String(zoomFor(widths[i]))));
            setZoom(zoomFor(widths[0] ?? 0));
          };
          fit();
          view?.addEventListener("resize", fit);
          unfit = () => view?.removeEventListener("resize", fit);
          setRendering(false);
        },
        (cause: unknown) => {
          if (cancelled) return;
          setError(`Не удалось отрисовать документ: ${cause instanceof Error ? cause.message : String(cause)}`);
        },
      );
      return () => {
        cancelled = true;
        unfit();
      };
    },
    [bytes],
  );

  if (error) return <Notice alert message={error} path={path} source={source} onRetry={onReload} />;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <Toolbar path={path} source={source} onReload={onReload}>
        <span>Документ Word</span>
        {zoom < 1 && <span>· масштаб {Math.round(zoom * 100)}%</span>}
      </Toolbar>
      <SandboxFrame title="Документ Word" fill={fill} />
      {rendering && (
        <div role="status" className="absolute inset-x-0 top-10 flex justify-center p-4 text-sm text-muted-foreground">
          Рисую документ…
        </div>
      )}
    </div>
  );
}
