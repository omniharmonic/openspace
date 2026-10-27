import type { RichTextDoc } from "@omniharmonic/openspace-schema";
import { Editor } from "@tiptap/core";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, IconButton, Input, Popover } from "../../ui";
import { fromTiptap, restrictDoc, richKey, toTiptap } from "../editor/text/convert";
import { richTextExtensions } from "../editor/text/schema";
import { normaliseHref } from "../editor/text/TextToolbar";
import "./collections.css";

/** What survives the Markdown in a post body (and so what the toolbar offers). */
export const PROSE_ALLOW = {
  marks: ["bold", "italic", "strike", "code", "link"],
  blocks: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "hardBreak"],
} as const;

/**
 * Rich text for a post body or a long field, using the canvas's Tiptap schema (the same nodes
 * and marks the renderer prints), limited to what Markdown keeps.
 */
export function ProseEditor({
  value,
  onChange,
  label,
  placeholder,
  autoFocus,
  minimal,
}: {
  value: RichTextDoc | undefined;
  onChange: (doc: RichTextDoc) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Bold / italic / link only (captions, quotes). */
  minimal?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [, setTick] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const last = useRef(richKey(value));

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is created once per mount; later value changes sync in the effect below
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const editor = new Editor({
      element: { mount: el },
      extensions: richTextExtensions,
      content: toTiptap(value),
      injectCSS: false,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class: "st-prose__editable os-rich",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": label,
          ...(placeholder ? { "data-placeholder": placeholder } : {}),
        },
      },
      onUpdate: ({ editor: e }) => {
        const next = restrictDoc(fromTiptap(e.getJSON()), PROSE_ALLOW);
        const key = richKey(next);
        if (key === last.current) return;
        last.current = key;
        onChangeRef.current(next);
      },
      onTransaction: () => setTick((t) => t + 1),
    });
    editorRef.current = editor;
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // The editor is created once; later value changes sync below.
  }, []);

  // Outside changes (undo of the whole item, loading another version) replace the content.
  useEffect(() => {
    const e = editorRef.current;
    const key = richKey(value);
    if (!e || key === last.current) return;
    last.current = key;
    e.commands.setContent(toTiptap(value), { emitUpdate: false });
  }, [value]);

  const e = editorRef.current;
  const active = (name: string, attrs?: Record<string, unknown>) =>
    Boolean(e?.isActive(name, attrs));
  const run = (fn: (ed: Editor) => void) => () => {
    if (e) fn(e);
  };
  const empty = !e || e.isEmpty;

  return (
    <div className="st-prose">
      <div className="st-prose__toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {!minimal && (
          <>
            <IconButton
              size="sm"
              label="Paragraph"
              icon={<Pilcrow />}
              active={active("paragraph") || undefined}
              onClick={run((ed) => ed.chain().focus().setNode("paragraph", { preset: null }).run())}
            />
            <IconButton
              size="sm"
              label="Heading"
              icon={<Heading2 />}
              active={active("heading", { level: 2 }) || undefined}
              onClick={run((ed) =>
                ed.chain().focus().toggleNode("heading", "paragraph", { level: 2 }).run(),
              )}
            />
            <IconButton
              size="sm"
              label="Subheading"
              icon={<Heading3 />}
              active={active("heading", { level: 3 }) || undefined}
              onClick={run((ed) =>
                ed.chain().focus().toggleNode("heading", "paragraph", { level: 3 }).run(),
              )}
            />
            <span className="st-prose__sep" aria-hidden="true" />
          </>
        )}
        <IconButton
          size="sm"
          label="Bold"
          shortcut="mod+b"
          icon={<Bold />}
          active={active("bold") || undefined}
          onClick={run((ed) => ed.chain().focus().toggleMark("bold").run())}
        />
        <IconButton
          size="sm"
          label="Italic"
          shortcut="mod+i"
          icon={<Italic />}
          active={active("italic") || undefined}
          onClick={run((ed) => ed.chain().focus().toggleMark("italic").run())}
        />
        {!minimal && (
          <IconButton
            size="sm"
            label="Strikethrough"
            icon={<Strikethrough />}
            active={active("strike") || undefined}
            onClick={run((ed) => ed.chain().focus().toggleMark("strike").run())}
          />
        )}
        <LinkButton editor={e} active={active("link")} />
        {!minimal && (
          <>
            <span className="st-prose__sep" aria-hidden="true" />
            <IconButton
              size="sm"
              label="Bulleted list"
              icon={<List />}
              active={active("bulletList") || undefined}
              onClick={run((ed) => ed.chain().focus().toggleList("bulletList", "listItem").run())}
            />
            <IconButton
              size="sm"
              label="Numbered list"
              icon={<ListOrdered />}
              active={active("orderedList") || undefined}
              onClick={run((ed) => ed.chain().focus().toggleList("orderedList", "listItem").run())}
            />
            <IconButton
              size="sm"
              label="Quote"
              icon={<Quote />}
              active={active("blockquote") || undefined}
              onClick={run((ed) => ed.chain().focus().toggleWrap("blockquote").run())}
            />
          </>
        )}
      </div>
      <div ref={host} className="st-prose__host" data-empty={empty || undefined} />
    </div>
  );
}

function LinkButton({ editor, active }: { editor: Editor | null; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    if (!editor) return;
    if (!href.trim()) {
      editor.chain().focus().unsetMark("link").run();
      setOpen(false);
      return;
    }
    const url = normaliseHref(href);
    if (!url) {
      setError("Use a web address, an email address or a page path like /about.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setMark("link", { href: url }).run();
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
        if (o && editor) setHref(String(editor.getAttributes("link").href ?? ""));
      }}
      title="Link"
      width={300}
      trigger={<IconButton size="sm" label="Link" icon={<Link2 />} active={active || undefined} />}
    >
      <form
        className="st-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          apply();
        }}
      >
        <Input
          aria-label="Link address"
          placeholder="https://… or /page"
          value={href}
          onChange={(ev) => setHref(ev.target.value)}
          autoFocus
        />
        {error && (
          <p className="st-ws-hint" role="alert">
            {error}
          </p>
        )}
        <div className="st-ws-actions st-ws-actions--end">
          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                editor?.chain().focus().extendMarkRange("link").unsetMark("link").run();
                setOpen(false);
              }}
            >
              Remove link
            </Button>
          )}
          <Button variant="primary" size="sm" type="submit">
            Apply
          </Button>
        </div>
      </form>
    </Popover>
  );
}
