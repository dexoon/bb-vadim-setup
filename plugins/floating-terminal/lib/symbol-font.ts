// One warm-up of the bundled symbol font for every terminal in the page.
//
// The renderer rasterises each glyph once into a texture atlas and caches it
// forever, so a webfont still loading when a terminal opens gets baked in as
// tofu until the atlas is dropped. The catch is that the WebGL addon shares one
// atlas between every terminal with the same config, while
// `clearTextureAtlas()` repaints only the terminal it was called on: the others
// keep pointing at atlas cells that now hold someone else's glyphs, and come out
// as scrambled text until something forces a full redraw. Clearing per terminal
// on open therefore broke every other open tab, the window and the other
// threads' panels.
//
// So the font warms once per page, and its arrival clears every live terminal
// in the same tick. A terminal opened after that rasterises with the font
// already there and never touches the shared atlas.

export interface AtlasOwner {
  clearTextureAtlas(): void;
}

const live = new Set<AtlasOwner>();
let warming: Promise<void> | null = null;

/**
 * Register a terminal for the font's arrival; `warm` runs only for the first
 * one. Returns the unregister call, which must run before the terminal is
 * disposed.
 */
export function trackSymbolFont(
  owner: AtlasOwner,
  warm: () => Promise<unknown>,
): () => void {
  live.add(owner);
  if (warming === null) {
    warming = warm().then(
      () => {
        for (const terminal of live) terminal.clearTextureAtlas();
      },
      () => {
        // No symbol font is a cosmetic loss, not a broken terminal.
      },
    );
  }
  return () => {
    live.delete(owner);
  };
}
