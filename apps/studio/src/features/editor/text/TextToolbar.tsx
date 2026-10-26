import { RICH_LINK_HREF_RE } from "@openspace/schema";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  Check,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
  TextQuote,
  Underline,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button, IconButton, Input, Popover, Select, Toggle } from "../../../ui";
import { applyTextStyle, currentTextStyle, TEXT_STYLES, type TextStyleId } from "./schema";
import { useTextEditing } from "./session";

/** Keep focus (and the text selection) in the canvas when pressing toolbar buttons. */
const keepFocus = { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() };

function MarkButton({
  editor,
  mark,
  label,
  icon,
  shortcut,
}: {
  editor: Editor;
  mark: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
}) {
  return (
    <IconButton
      size="sm"
      label={label}
      icon={icon}
      shortcut={shortcut}
      active={editor.isActive(mark)}
      {...keepFocus}
      onClick={() => editor.chain().focus().toggleMark(mark).run()}
    />
  );
}

/** Normalise what people type into a link field: bare domains get https, emails get mailto. */
export function normaliseHref(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  let href = v;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) href = `mailto:${v}`;
  else if (/^\+?[\d ()\-.]{6,}$/.test(v)) href = `tel:${v.replace(/[^\d+]/g, "")}`;
  else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) href = `https://${v}`;
  return RICH_LINK_HREF_RE.test(href) ? href : null;
}

function LinkEditor({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const current = editor.getAttributes("link") as { href?: string; newTab?: boolean };
  const [value, setValue] = useState("");
  const [newTab, setNewTab] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onOpen = (next: boolean) => {
    if (next) {
      setValue(current.href ?? "");
      setNewTab(Boolean(current.newTab));
      setError(null);
    }
    setOpen(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const href = normaliseHref(value);
    if (!href) {
      setError("Use a web address, an email, a phone number or a page path like /about.");
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setMark("link", { href, newTab, title: null })
      .run();
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={onOpen}
      title="Link"
      width={280}
      trigger={
        <IconButton
          size="sm"
          label="Link"
          icon={<Link2 />}
          active={editor.isActive("link")}
          {...keepFocus}
        />
      }
    >
      <form className="st-linkform" onSubmit={submit}>
        <Input
          size="sm"
          autoFocus
          aria-label="Link address"
          placeholder="example.com or /about"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p className="st-linkform__error" role="alert">
            {error}
          </p>
        )}
        <div className="st-linkform__row">
          <span aria-hidden="true">Open in a new tab</span>
          <Toggle
            size="sm"
            checked={newTab}
            onCheckedChange={setNewTab}
            aria-label="Open in a new tab"
          />
        </div>
        <div className="st-linkform__actions">
          {editor.isActive("link") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetMark("link").run();
                setOpen(false);
              }}
            >
              Remove link
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" icon={<Check />}>
            Apply
          </Button>
        </div>
      </form>
    </Popover>
  );
}

const MARKS = [
  { mark: "bold", label: "Bold", icon: <Bold />, shortcut: "mod+b" },
  { mark: "italic", label: "Italic", icon: <Italic />, shortcut: "mod+i" },
  { mark: "underline", label: "Underline", icon: <Underline />, shortcut: "mod+u" },
  { mark: "strike", label: "Strikethrough", icon: <Strikethrough />, shortcut: "shift+mod+s" },
  { mark: "highlight", label: "Highlight", icon: <Highlighter />, shortcut: "shift+mod+h" },
];

/** Floating toolbar for the text block being edited (lives in the Studio document). */
export function TextToolbar() {
  const editor = useTextEditing((s) => s.editor);
  const allow = useTextEditing((s) => s.allow);
  useTextEditing((s) => s.tick);
  if (!editor || editor.isDestroyed) return null;
  const style = currentTextStyle(editor);
  const mark = (m: string) => (allow.marks as readonly string[]).includes(m);
  const node = (b: string) => (allow.blocks as readonly string[]).includes(b);
  const styles = TEXT_STYLES.filter((t) => node("heading") || !/^(display|h[1-4])$/.test(t.id));
  const hasLists = node("bulletList") || node("orderedList") || node("blockquote");
  return (
    <div className="st-ov__bar" role="toolbar" aria-label="Text formatting">
      <Select<TextStyleId>
        size="sm"
        className="st-ov__preset"
        aria-label="Text style"
        value={style ?? undefined}
        placeholder="Mixed"
        onValueChange={(v) => applyTextStyle(editor, v)}
        options={styles.map((t) => ({ value: t.id, label: t.label }))}
      />
      <span className="st-ov__sep" aria-hidden="true" />
      {MARKS.filter((m) => mark(m.mark)).map((m) => (
        <MarkButton key={m.mark} editor={editor} {...m} />
      ))}
      {mark("link") && <LinkEditor editor={editor} />}
      {hasLists && <span className="st-ov__sep" aria-hidden="true" />}
      {node("bulletList") && (
        <IconButton
          size="sm"
          label="Bulleted list"
          icon={<List />}
          shortcut="shift+mod+8"
          active={editor.isActive("bulletList")}
          {...keepFocus}
          onClick={() => editor.chain().focus().toggleList("bulletList", "listItem").run()}
        />
      )}
      {node("orderedList") && (
        <IconButton
          size="sm"
          label="Numbered list"
          icon={<ListOrdered />}
          shortcut="shift+mod+7"
          active={editor.isActive("orderedList")}
          {...keepFocus}
          onClick={() => editor.chain().focus().toggleList("orderedList", "listItem").run()}
        />
      )}
      {node("blockquote") && (
        <IconButton
          size="sm"
          label="Quote"
          icon={<TextQuote />}
          shortcut="shift+mod+b"
          active={editor.isActive("blockquote")}
          {...keepFocus}
          onClick={() => editor.chain().focus().toggleWrap("blockquote").run()}
        />
      )}
    </div>
  );
}
