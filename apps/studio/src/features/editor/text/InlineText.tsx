import type { Op, OpBody } from "@openspace/ops";
import {
  BLOCK_NODE_TYPES,
  type BlockNodeType,
  MARK_TYPES,
  type MarkType,
  type RichTextDoc,
} from "@openspace/schema";
import { Editor } from "@tiptap/core";
import { useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { useCommandStore } from "../../../ui/command-store";
import { matchesShortcut } from "../../../ui/shortcuts";
import { useDocStoreApi } from "../model/context";
import { locate } from "../model/selection";
import { fromTiptap, restrictDoc, richKey, toTiptap } from "./convert";
import { fieldMetaAt, fieldSet, getAt } from "./fields";
import { richTextExtensions } from "./schema";

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

export interface InlineTextProps {
  blockId: string;
  /** Field path inside the block (`content`, `items.2.body`). */
  path: string;
  /** Classes `<RichText>` gives its root next to `os-rich`. */
  className?: string;
  as?: "div" | "section" | "article";
}

/**
 * Tiptap mounted directly on the element that becomes the field's `.os-rich` root, so the
 * editable text uses the exact markup, classes and CSS of the published page.
 */
export function InlineText({ blockId, path, className, as: Tag = "div" }: InlineTextProps) {
  const store = useDocStoreApi();
  const host = useRef<HTMLElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const classes = className ? `os-rich ${className}` : "os-rich";

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const state = () => store.getState();
    const locateBlock = () => {
      const s = state();
      return locate(s.doc, s.pageId, { kind: "block", id: blockId });
    };
    const currentValue = () => getAt(locateBlock()?.block?.fields, path) as RichTextDoc | undefined;
    const startBlock = locateBlock()?.block;
    const meta = startBlock ? fieldMetaAt(startBlock, path) : undefined;
    const allow: TextAllowance =
      meta?.kind === "richText" ? { marks: meta.marks, blocks: meta.blocks } : ALLOW_ALL;
    let committed = richKey(currentValue());
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const e = editorRef.current;
      if (!e || e.isDestroyed) return;
      const raw = fromTiptap(e.getJSON());
      const next = restrictDoc(raw, allow);
      const key = richKey(next);
      // Formatting this field doesn't allow (pasted or typed shortcuts) is removed on screen too.
      if (key !== richKey(raw)) e.commands.setContent(toTiptap(next), { emitUpdate: false });
      if (key === committed) return;
      const loc = locateBlock();
      if (!loc?.block) return;
      const r = state().commit(
        [
          {
            op: "block.update",
            page: loc.container,
            block: blockId,
            set: fieldSet(loc.block, path, next),
          } as OpBody<Op>,
        ],
        { mergeKey: `text:${blockId}:${path}`, label: "Edit text" },
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
          class: classes,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Text",
          "data-os-inline-editor": "",
          "data-os-editing-field": path,
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
    useTextEditing.setState({ editor, tick: 0, allow });
    // The sync layer flushes what was typed before someone else's change lands.
    const unregister = state().registerTextSession({
      kind: "rich",
      blockId,
      path,
      flush,
      end: (commit) => {
        if (commit) flush();
        else if (timer) clearTimeout(timer);
        timer = undefined;
        state().setEditing(null);
      },
    });

    // Put the caret where the person clicked, else at the end.
    const caret = takePendingCaret();
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
    // Keystrokes not yet committed go first, so they're never silently overwritten.
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      if (timer) {
        flush();
        return;
      }
      const value = currentValue();
      const key = richKey(value);
      if (key === committed || !value) return;
      committed = key;
      if (key === richKey(fromTiptap(editor.getJSON()))) return;
      const { from } = editor.state.selection;
      editor.commands.setContent(toTiptap(value), { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.min(from, Math.max(1, max - 1)));
    });

    return () => {
      unregister();
      unsubscribe();
      flush();
      editor.destroy();
      el.ownerDocument.getSelection()?.removeAllRanges();
      editorRef.current = null;
      if (useTextEditing.getState().editor === editor) useTextEditing.setState({ editor: null });
    };
    // The editor lives as long as this field is being edited (a class change remounts it).
  }, [store, blockId, path, classes]);

  return <Tag ref={host as never} />;
}
