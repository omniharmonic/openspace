import type { Op, OpBody } from "@openspace/ops";
import { toast } from "../../../ui/toast-store";
import { locate } from "../model/selection";
import type { EditorStore } from "../model/store";
import { fieldSet, getAt, textFieldsOf } from "./fields";
import { takePendingCaret } from "./InlineText";

/**
 * Inline editing for plain text fields (headings in cards, button labels, names…). The element
 * showing the field becomes `contenteditable` for the session; the change is committed as one
 * `block.update` op when you press Enter, click away or blur, and Esc cancels.
 *
 * The element is React-managed, so the session keeps React's own text nodes and puts them back
 * before committing: React then updates them like any other render.
 */
export interface PlainTextSession {
  blockId: string;
  path: string;
  /** Finish: commit the edit (true) or throw it away (false). */
  end: (commit: boolean) => void;
}

function caretAt(el: HTMLElement, point: { x: number; y: number } | null) {
  const d = el.ownerDocument;
  const sel = d.getSelection();
  if (!sel) return;
  const range = d.createRange();
  const fromPoint = point
    ? (
        d as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
      ).caretRangeFromPoint?.(point.x, point.y)
    : null;
  if (fromPoint && el.contains(fromPoint.startContainer)) {
    range.setStart(fromPoint.startContainer, fromPoint.startOffset);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function startPlainTextEdit(
  store: EditorStore,
  el: HTMLElement,
  blockId: string,
  path: string,
): PlainTextSession {
  const s0 = store.getState();
  const block = locate(s0.doc, s0.pageId, { kind: "block", id: blockId })?.block;
  const ref = block ? textFieldsOf(block).find((r) => r.path === path) : undefined;
  const original = [...el.childNodes];
  const originalValue = String(block ? (getAt(block.fields, path) ?? "") : "");
  const multiline = Boolean(ref?.multiline);
  let done = false;

  el.setAttribute("contenteditable", "plaintext-only");
  if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
  el.setAttribute("data-os-plain-editing", "");
  el.setAttribute("data-os-editing-field", path);
  el.setAttribute("spellcheck", "true");
  el.focus({ preventScroll: true });
  caretAt(el, takePendingCaret());

  const read = () => {
    const raw = el.textContent ?? "";
    return multiline
      ? raw
          .replace(/\r/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : raw.replace(/\s+/g, " ").trim();
  };

  const end = (commit: boolean) => {
    if (done) return;
    done = true;
    unregister();
    const text = read();
    el.removeEventListener("keydown", onKey);
    el.removeEventListener("blur", onBlur);
    el.removeEventListener("paste", onPaste);
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-os-plain-editing");
    el.removeAttribute("data-os-editing-field");
    el.removeAttribute("spellcheck");
    // Hand React back exactly the nodes it rendered; the commit below updates them.
    el.replaceChildren(...original);
    el.ownerDocument.getSelection()?.removeAllRanges();
    const s = store.getState();
    if (s.editing === blockId && s.editingField?.path === path) s.setEditing(null);
    if (!commit || text === originalValue.trim()) return;
    if (!text && ref && !ref.optional) {
      toast({ tone: "danger", title: "This text can’t be empty" });
      return;
    }
    const loc = locate(s.doc, s.pageId, { kind: "block", id: blockId });
    if (!loc?.block) return;
    // An emptied optional top-level field is removed rather than stored as "".
    const change =
      !text && !path.includes(".") ? { unset: [path] } : { set: fieldSet(loc.block, path, text) };
    const r = s.commit(
      [{ op: "block.update", page: loc.container, block: blockId, ...change } as OpBody<Op>],
      { label: "Edit text" },
    );
    if (!r.ok)
      toast({
        tone: "danger",
        title: "That text doesn’t fit here",
        description: ref?.maxLength
          ? `Keep it under ${ref.maxLength} characters.`
          : r.errors[0]?.message,
      });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      end(false);
    } else if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      end(true);
    }
  };
  const onBlur = () => end(true);
  // Paste as plain text only.
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    el.ownerDocument.execCommand("insertText", false, multiline ? text : text.replace(/\s+/g, " "));
  };
  el.addEventListener("keydown", onKey);
  el.addEventListener("blur", onBlur);
  el.addEventListener("paste", onPaste);
  // A change from elsewhere touching this block ends the session first (sync layer), so React's
  // own text nodes are back in place before React re-renders them.
  const unregister = store.getState().registerTextSession({
    kind: "plain",
    blockId,
    path,
    flush: () => {},
    end,
  });

  return { blockId, path, end };
}
