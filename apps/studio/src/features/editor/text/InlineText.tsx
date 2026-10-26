import type { Op, OpBody } from "@openspace/ops";
import type { Block, RichTextDoc } from "@openspace/schema";
import { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { useCommandStore } from "../../../ui/command-store";
import { matchesShortcut } from "../../../ui/shortcuts";
import { useDocStoreApi } from "../model/context";
import { locate } from "../model/selection";
import { fromTiptap, richKey, toTiptap } from "./convert";
import { richTextExtensions } from "./schema";

/** Blocks edited inline on the canvas, the rich-text field, and the classes its `<RichText>` gets. */
export const INLINE_TEXT: Record<
  string,
  { field: string; className: (variant: string) => string }
> = {
  text: { field: "content", className: (v) => `os-text os-text--${v}` },
};

export const canEditInline = (block: Pick<Block, "type">) => block.type in INLINE_TEXT;

/** Typing commits after this pause (ms); the undo history groups the commits of one burst. */
export const TEXT_COMMIT_MS = 250;

/** The live Tiptap editor (for the floating toolbar in the parent document). */
interface TextEditingState {
  editor: Editor | null;
  /** Bumps on every transaction so the toolbar re-reads active marks. */
  tick: number;
}
export const useTextEditing = create<TextEditingState>(() => ({ editor: null, tick: 0 }));

/** Where the click that started editing landed (iframe client coordinates). */
let pendingCaret: { x: number; y: number } | null = null;
export function setPendingCaret(point: { x: number; y: number } | null) {
  pendingCaret = point;
}

/**
 * Tiptap mounted directly on the element that becomes the block's `.os-rich` root, so the
 * editable text uses the exact markup, classes and CSS of the published page.
 */
export function InlineText({ block, variant }: { block: Block; variant: string }) {
  const store = useDocStoreApi();
  const host = useRef<HTMLDivElement>(null);
  const spec = INLINE_TEXT[block.type];
  const blockId = block.id;
  const field = spec?.field ?? "content";
  const className = spec?.className(variant) ?? "";
  const editorRef = useRef<Editor | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const state = () => store.getState();
    const currentValue = () => {
      const s = state();
      const loc = locate(s.doc, s.pageId, { kind: "block", id: blockId });
      return loc?.block?.fields[field] as RichTextDoc | undefined;
    };
    let committed = richKey(currentValue());
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const e = editorRef.current;
      if (!e || e.isDestroyed) return;
      const next = fromTiptap(e.getJSON());
      const key = richKey(next);
      if (key === committed) return;
      const s = state();
      const loc = locate(s.doc, s.pageId, { kind: "block", id: blockId });
      if (!loc) return;
      const r = s.commit(
        [
          {
            op: "block.update",
            page: loc.container,
            block: blockId,
            set: { [field]: next },
          } as OpBody<Op>,
        ],
        { mergeKey: `text:${blockId}:${field}`, label: "Edit text" },
      );
      if (r.ok) committed = key;
    };

    const editor = new Editor({
      element: { mount: el },
      extensions: richTextExtensions,
      content: toTiptap(currentValue()),
      injectCSS: false,
      autofocus: false,
      editorProps: {
        attributes: {
          class: `os-rich ${className}`,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Text",
          "data-os-inline-editor": "",
        },
        handleKeyDown: (_view, event) => {
          if (matchesShortcut(event, "mod+z")) {
            flush();
            state().undo();
            return true;
          }
          if (matchesShortcut(event, "shift+mod+z") || matchesShortcut(event, "mod+y")) {
            flush();
            state().redo();
            return true;
          }
          if (event.key === "Escape") {
            flush();
            state().setEditing(null);
            return true;
          }
          if (matchesShortcut(event, "mod+k")) {
            useCommandStore.getState().toggle();
            return true;
          }
          return false;
        },
      },
      onUpdate: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, TEXT_COMMIT_MS);
      },
      onTransaction: () => useTextEditing.setState((s) => ({ tick: s.tick + 1 })),
      onBlur: () => flush(),
    });
    editorRef.current = editor;
    useTextEditing.setState({ editor, tick: 0 });

    // Put the caret where the person clicked, else at the end.
    // (Cleared after this task rather than now: StrictMode mounts effects twice in development.)
    const caret = pendingCaret;
    queueMicrotask(() => {
      pendingCaret = null;
    });
    let pos: number | undefined;
    if (caret) {
      try {
        pos = editor.view.posAtCoords({ left: caret.x, top: caret.y })?.pos;
      } catch {
        pos = undefined;
      }
    }
    if (pos !== undefined) editor.chain().setTextSelection(pos).focus().run();
    else editor.commands.focus("end");

    // Changes from elsewhere (undo, a collaborator, the inspector) flow back into the editor.
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      const value = currentValue();
      const key = richKey(value);
      if (key === committed || !value) return;
      if (key === richKey(fromTiptap(editor.getJSON()))) {
        committed = key;
        return;
      }
      committed = key;
      const { from } = editor.state.selection;
      editor.commands.setContent(toTiptap(value), { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.min(from, Math.max(1, max - 1)));
    });

    return () => {
      unsubscribe();
      flush();
      editor.destroy();
      editorRef.current = null;
      if (useTextEditing.getState().editor === editor) useTextEditing.setState({ editor: null });
    };
    // The editor lives as long as this block is being edited (a variant change remounts it).
  }, [store, blockId, field, className]);

  return <div ref={host} />;
}
