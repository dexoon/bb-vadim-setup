// Vditor, the Markdown engine of the VS Code Office Viewer extension. It is
// not bundled into app.js (BB loads every plugin's app.js at startup): its
// script and stylesheet come from the plugin server's route on the first
// open, and Vditor pulls the rest (Lute, icons, dictionary, highlighting,
// math) from the same route as its "CDN".
import type Vditor from "vditor";

export type VditorEditor = Vditor;
export type EditMode = "ir" | "wysiwyg" | "sv";

/** Vditor appends `/dist/<file>` to this; server.ts serves node_modules/vditor/dist. */
export const VDITOR_CDN = "/api/v1/plugins/markdown-view/http/vditor?f=";

const INDEX_CSS = `${VDITOR_CDN}/dist/index.css`;
const INDEX_JS = `${VDITOR_CDN}/dist/index.min.js`;

/** BB's theme as the page has it now; Vditor's own themes follow it. */
export const isDark = () => document.documentElement.classList.contains("dark");

/** Vditor's theme names for BB's theme: panel, content stylesheet, code highlighting. */
export const vditorTheme = (dark: boolean) =>
  dark
    ? { theme: "dark" as const, content: "dark", code: "github-dark" }
    : { theme: "classic" as const, content: "light", code: "github" };

/**
 * Exactly one Vditor stylesheet on the page, ahead of the content theme
 * Vditor adds (`#vditorContentTheme`): both style `.vditor-reset` with the
 * same selectors, and whichever comes later wins. A rebuilt plugin is a new
 * module in the same page and used to append another copy after the dark
 * theme — dark text on a dark page.
 */
function settleStylesheet(): void {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter(
    (link) => link.getAttribute("href") === INDEX_CSS,
  );
  for (const extra of links.slice(1)) extra.remove();
  let style = links[0];
  if (!style) {
    style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = INDEX_CSS;
    document.head.append(style);
  }
  const theme = document.getElementById("vditorContentTheme");
  if (theme?.parentNode && style.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_PRECEDING) {
    theme.parentNode.insertBefore(style, theme);
  }
}

let loading: Promise<typeof Vditor> | null = null;

export function loadVditor(): Promise<typeof Vditor> {
  loading ??= new Promise<typeof Vditor>((resolve, reject) => {
    settleStylesheet();
    const loaded = () => (window as { Vditor?: typeof Vditor }).Vditor;
    const ready = loaded();
    if (ready) {
      resolve(ready);
      return;
    }
    // The previous copy of this module may have the script on its way already.
    let script = document.querySelector<HTMLScriptElement>(`script[src="${INDEX_JS}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = INDEX_JS;
      document.head.append(script);
    }
    const tag = script;
    tag.addEventListener("load", () => {
      const constructor = loaded();
      if (constructor) resolve(constructor);
      else reject(new Error("Vditor загрузился, но не зарегистрировался."));
    });
    tag.addEventListener("error", () => {
      tag.remove();
      reject(new Error("Не удалось загрузить редактор с сервера плагина."));
    });
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

const nbspToSpace = (text: string) => text.replace(/ /g, " ");

/**
 * The text `editor` would hand back for a file containing `markdown`: the
 * same round trip as its getValue() in the current mode (Vditor 4.0.0,
 * `getMarkdown`). The source mode keeps the text as is; the other two
 * re-serialize it through Lute. All three turn non-breaking spaces into spaces.
 */
export function roundTrip(editor: Vditor): (markdown: string) => string {
  const { lute, currentMode } = editor.vditor;
  if (currentMode === "sv") return (markdown) => nbspToSpace(`${markdown}\n`).replace(/\n\n$/, "\n");
  if (currentMode === "wysiwyg") return (markdown) => nbspToSpace(lute.VditorDOM2Md(lute.Md2VditorDOM(markdown)));
  return (markdown) => nbspToSpace(lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(markdown)));
}
