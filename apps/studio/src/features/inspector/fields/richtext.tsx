import type { MarkType, RichTextDoc, RichTextFieldMeta } from "@openspace/schema";
import { Editor } from "@tiptap/core";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Input, Tooltip } from "../../../ui";
import { fromTiptap, restrictDoc, richKey, toTiptap } from "../../editor/text/convert";
import { richTextExtensions } from "../../editor/text/schema";
import { normaliseHref } from "../../editor/text/TextToolbar";
import { FIELD_COMMIT_MS } from "./basic";
import type { ControlProps } from "./types";

const MARK_BUTTONS: Array<{ mark: MarkType; label: string; icon: typeof Bold }> = [
  { mark: "bold", label: "Bold", icon: Bold },
  { mark: "italic", label: "Italic", icon: Italic },
  { mark: "underline", label: "Underline", icon: Underline },
  { mark: "strike", label: "Strikethrough", icon: Strikethrough },
];

/**
 * Rich text edited in the panel (for fields the canvas can't reach, or when someone prefers
 * the panel). Same Tiptap schema and converters as inline editing; formatting the field
 * doesn't allow is removed before each commit.
 */
export function RichTextControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<RichTextFieldMeta, RichTextDoc>) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const committed = useRef(richKey(value));
  const allow = { marks: meta.marks, blocks: meta.blocks };
  const allowRef = useRef(allow);
  allowRef.current = allow;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const e = editorRef.current;
      if (!e || e.isDestroyed) return;
      const next = restrictDoc(fromTiptap(e.getJSON()), allowRef.current);
      const key = richKey(next);
      if (key === committed.current) return;
      const err = onChangeRef.current(next, { merge: true, label: "Edit text" });
      setError(err);
      if (!err) committed.current = key;
    };
    const editor = new Editor({
      element: { mount: el },
      extensions: richTextExtensions,
      content: toTiptap(valueRef.current),
      injectCSS: false,
      editable: !disabled,
      editorProps: {
        attributes: {
          id,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label,
          class: "st-ip-rich__pm",
        },
      },
      onUpdate: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, FIELD_COMMIT_MS);
      },
      onTransaction: bump,
      onBlur: flush,
    });
    editorRef.current = editor;
    return () => {
      flush();
      editor.destroy();
      editorRef.current = null;
    };
  }, [id, label, disabled]);

  // Changes from elsewhere (canvas typing, undo, collaborators) flow into the panel editor.
  useEffect(() => {
    const e = editorRef.current;
    const key = richKey(value);
    if (!e || key === committed.current) return;
    committed.current = key;
    if (key !== richKey(fromTiptap(e.getJSON())))
      e.commands.setContent(toTiptap(value), { emitUpdate: false });
  }, [value]);

  const e = editorRef.current;
  const run = (fn: (ed: Editor) => void) => {
    if (e && !disabled) fn(e);
  };
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  return (
    <div className="st-ip-rich">
      <div
        className="st-ip-rich__bar"
        role="toolbar"
        aria-label={`Format ${label.toLowerCase()} in the panel`}
      >
        {MARK_BUTTONS.filter((b) => meta.marks.includes(b.mark)).map((b) => (
          <Tooltip key={b.mark} content={b.label}>
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label={b.label}
              aria-pressed={e?.isActive(b.mark) ?? false}
              disabled={disabled}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => run((ed) => ed.chain().focus().toggleMark(b.mark).run())}
            >
              <b.icon aria-hidden="true" />
            </button>
          </Tooltip>
        ))}
        {meta.marks.includes("link") && (
          <Tooltip content="Link">
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label="Link"
              aria-pressed={e?.isActive("link") ?? false}
              disabled={disabled}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() =>
                run((ed) => {
                  if (ed.isActive("link")) ed.chain().focus().unsetMark("link").run();
                  else setLinkDraft("");
                })
              }
            >
              <Link2 aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {meta.blocks.includes("bulletList") && (
          <Tooltip content="Bulleted list">
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label="Bulleted list"
              aria-pressed={e?.isActive("bulletList") ?? false}
              disabled={disabled}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() =>
                run((ed) => ed.chain().focus().toggleList("bulletList", "listItem").run())
              }
            >
              <List aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {meta.blocks.includes("orderedList") && (
          <Tooltip content="Numbered list">
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label="Numbered list"
              aria-pressed={e?.isActive("orderedList") ?? false}
              disabled={disabled}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() =>
                run((ed) => ed.chain().focus().toggleList("orderedList", "listItem").run())
              }
            >
              <ListOrdered aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {meta.blocks.includes("blockquote") && (
          <Tooltip content="Quote">
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label="Quote"
              aria-pressed={e?.isActive("blockquote") ?? false}
              disabled={disabled}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => run((ed) => ed.chain().focus().toggleWrap("blockquote").run())}
            >
              <Quote aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {linkDraft !== null && (
        <div className="st-ip-rich__linkrow">
          <Input
            size="sm"
            aria-label="Link address"
            placeholder="Address, email or phone"
            value={linkDraft}
            autoFocus
            onChange={(ev) => setLinkDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") setLinkDraft(null);
              if (ev.key !== "Enter") return;
              ev.preventDefault();
              const href = normaliseHref(linkDraft);
              if (href) run((ed) => ed.chain().focus().setMark("link", { href }).run());
              setLinkDraft(null);
            }}
          />
        </div>
      )}
      <div ref={host} className="st-ip-rich__doc" />
      {error && (
        <p className="st-ip-row__error" role="alert" style={{ padding: "0 8px 6px" }}>
          {error}
        </p>
      )}
    </div>
  );
}
