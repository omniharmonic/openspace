import { lazy } from "react";

/**
 * Tiptap and ProseMirror (about 100 KB gzipped) load on demand: the canvas renders static text
 * until a field is edited, and the editor preloads them once the canvas is idle.
 */
export const loadInlineText = () => import("./InlineText");
export const loadTextToolbar = () => import("./TextToolbar");
export const loadRichTextControl = () => import("../../inspector/fields/richtext");

export const LazyInlineText = lazy(() => loadInlineText().then((m) => ({ default: m.InlineText })));
export const LazyTextToolbar = lazy(() =>
  loadTextToolbar().then((m) => ({ default: m.TextToolbar })),
);

let preloaded = false;
/** Warm the text-editing chunks when the browser is idle (first edit then feels instant). */
export function preloadTextEditing() {
  if (preloaded) return;
  preloaded = true;
  const run = () => {
    void loadInlineText();
    void loadTextToolbar();
    void loadRichTextControl();
  };
  // After the first load has settled, so it never competes with the page itself.
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  setTimeout(() => (idle ? idle(run) : run()), 2000);
}
