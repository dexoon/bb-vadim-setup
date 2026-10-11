// A sandboxed iframe for markup that comes from a document: its <style> can't
// restyle BB, its scripts never run (no allow-scripts), and its links are
// followed by the plugin instead of navigating the frame.
import { useEffect, useRef } from "react";
import { useFollowLink } from "./external";

/** Nothing but inline styles and embedded images/fonts; no network, no scripts. */
export const FRAME_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`;
const SKELETON = `<!DOCTYPE html><html><head><meta charset="utf-8">${CSP_META}</head><body></body></html>`;

/** Puts the CSP meta first in a converted HTML document's <head>. */
export function withFrameCsp(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => `${head}<meta charset="utf-8">${CSP_META}`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${CSP_META}</head><body>${html}</body></html>`;
}

/**
 * Renders into a same-origin sandboxed iframe. `html` replaces the frame's
 * document (defaults to an empty skeleton), then `fill` may draw into it; the
 * returned cleanup runs when the inputs change or the frame unmounts.
 */
export function SandboxFrame({
  html,
  fill,
  title,
}: {
  html?: string;
  fill?: (doc: Document) => void | (() => void);
  title: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const followLink = useFollowLink();
  const followRef = useRef(followLink);
  followRef.current = followLink;
  const fillRef = useRef(fill);
  fillRef.current = fill;

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html ?? SKELETON);
    doc.close();

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        const id = decodeURIComponent(href.slice(1));
        (doc.getElementById(id) ?? doc.getElementsByName(id)[0])?.scrollIntoView({ block: "start" });
        return;
      }
      followRef.current(href);
    };
    doc.addEventListener("click", onClick);
    const cleanup = fillRef.current?.(doc);
    return () => {
      doc.removeEventListener("click", onClick);
      if (typeof cleanup === "function") cleanup();
    };
  }, [html, fill]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-same-origin"
      className="block min-h-0 w-full flex-1 border-0 bg-white"
    />
  );
}
