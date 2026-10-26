import { create } from "zustand";

/** The canvas iframe's document, published by the editor frame (for measuring blocks). */
export const useCanvasDocument = create<{ doc: Document | null }>(() => ({ doc: null }));

/** Rendered height of a block on the canvas, in page pixels (unscaled). */
export function measureBlock(blockId: string): number | undefined {
  const el = useCanvasDocument.getState().doc?.querySelector(`[data-os-id="${blockId}"]`);
  return el ? el.getBoundingClientRect().height : undefined;
}
