import type { Styles } from "@omniharmonic/openspace-schema";
import { create } from "zustand";
import type { StylesSet } from "./model";

/**
 * Figma-style live preview: while someone hovers or arrows through the font picker, the canvas
 * draws the site with that font. Nothing is committed (no undo step, no save) until they pick.
 */
interface FontPreviewState {
  /** The styles the canvas should draw instead of the document's, or null. */
  styles: Styles | null;
  show: (styles: Styles, set: StylesSet) => void;
  clear: () => void;
}

/** `set` applied to a copy of `styles` (dotted paths; `undefined` removes the key). */
export function withPatch(styles: Styles, set: StylesSet): Styles {
  const out = structuredClone(styles) as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(set)) {
    const keys = path.split(".");
    const last = keys.pop() as string;
    let node = out;
    for (const k of keys) {
      if (typeof node[k] !== "object" || node[k] === null) {
        if (value === undefined) {
          node = {};
          break;
        }
        node[k] = {};
      }
      node = node[k] as Record<string, unknown>;
    }
    if (value === undefined) delete node[last];
    else node[last] = structuredClone(value);
  }
  return out as unknown as Styles;
}

export const useFontPreview = create<FontPreviewState>((set) => ({
  styles: null,
  show: (styles, patch) => set({ styles: withPatch(styles, patch) }),
  clear: () => set((s) => (s.styles ? { styles: null } : s)),
}));
