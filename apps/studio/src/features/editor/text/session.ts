/**
 * Inline text session state shared by the canvas, the floating toolbar and the editor itself.
 * Tiptap is imported only as a type so this module stays out of the lazy text-editor chunk.
 */
import {
  BLOCK_NODE_TYPES,
  type BlockNodeType,
  MARK_TYPES,
  type MarkType,
} from "@omniharmonic/openspace-schema";
import type { Editor } from "@tiptap/core";
import { create } from "zustand";

/** Typing commits after this pause (ms); the undo history groups the commits of one burst. */
export const TEXT_COMMIT_MS = 250;

/** The live Tiptap editor (for the floating toolbar in the parent document). */
interface TextEditingState {
  editor: Editor | null;
  /** Bumps on every transaction so the toolbar re-reads active marks. */
  tick: number;
  /** What the edited field allows (the toolbar offers only these). */
  allow: TextAllowance;
}
export interface TextAllowance {
  marks: readonly MarkType[];
  blocks: readonly BlockNodeType[];
}
export const ALLOW_ALL: TextAllowance = { marks: MARK_TYPES, blocks: BLOCK_NODE_TYPES };
export const useTextEditing = create<TextEditingState>(() => ({
  editor: null,
  tick: 0,
  allow: ALLOW_ALL,
}));

/** Where the click that started editing landed (iframe client coordinates). */
let pendingCaret: { x: number; y: number } | null = null;
export function setPendingCaret(point: { x: number; y: number } | null) {
  pendingCaret = point;
}
/** Read the pending caret; it is cleared after the current task (StrictMode mounts twice). */
export function takePendingCaret() {
  const caret = pendingCaret;
  queueMicrotask(() => {
    pendingCaret = null;
  });
  return caret;
}
