import {
  HEADING_PRESETS,
  type HeadingPreset,
  PARAGRAPH_PRESETS,
  type ParagraphPreset,
  RICH_LINK_HREF_RE,
} from "@omniharmonic/openspace-schema";
import { colorVar } from "@omniharmonic/openspace-theme";
import {
  type Editor,
  Mark,
  markInputRule,
  Node,
  textblockTypeInputRule,
  wrappingInputRule,
} from "@tiptap/core";

/**
 * Tiptap (ProseMirror) schema matched exactly to OpenSpace rich text (arch §3.5), and rendered
 * with the same tags and classes as the renderer's `<RichText>` so text doesn't move when you
 * start or stop editing. No history extension: undo goes through the editor's op history.
 */

const typeClass = (preset: string) => `os-type-${preset}`;

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });

const Paragraph = Node.create({
  name: "paragraph",
  priority: 1000,
  group: "block",
  content: "inline*",
  addAttributes() {
    return {
      preset: {
        default: null,
        parseHTML: (el) => {
          const m = /\bos-type-([a-z0-9]+)\b/.exec(el.className);
          return m && (PARAGRAPH_PRESETS as readonly string[]).includes(m[1] as string)
            ? m[1]
            : null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ node }) => {
    const preset = node.attrs.preset as ParagraphPreset | null;
    return ["p", preset && preset !== "body" ? { class: typeClass(preset) } : {}, 0];
  },
});

const LEVELS = [1, 2, 3, 4] as const;

const Heading = Node.create({
  name: "heading",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      level: { default: 2, rendered: false },
      preset: {
        default: null,
        rendered: false,
        parseHTML: (el) => {
          const m = /\bos-type-([a-z0-9]+)\b/.exec(el.className);
          return m && (HEADING_PRESETS as readonly string[]).includes(m[1] as string) ? m[1] : null;
        },
      },
    };
  },
  parseHTML: () => [
    ...LEVELS.map((level) => ({ tag: `h${level}`, attrs: { level } })),
    // Pasted h5/h6 become h4.
    { tag: "h5", attrs: { level: 4 } },
    { tag: "h6", attrs: { level: 4 } },
  ],
  renderHTML: ({ node }) => {
    const level = node.attrs.level as number;
    const preset = (node.attrs.preset as HeadingPreset | null) ?? `h${level}`;
    return [`h${level}`, { class: typeClass(preset) }, 0];
  },
  addInputRules() {
    return LEVELS.map((level) =>
      textblockTypeInputRule({
        find: new RegExp(`^(#{${level}})\\s$`),
        type: this.type,
        getAttributes: { level },
      }),
    );
  },
});

const ListItem = Node.create({
  name: "listItem",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "li" }],
  renderHTML: () => ["li", 0],
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
    };
  },
});

const BulletList = Node.create({
  name: "bulletList",
  group: "block list",
  content: "listItem+",
  parseHTML: () => [{ tag: "ul" }],
  renderHTML: () => ["ul", 0],
  addKeyboardShortcuts() {
    return { "Mod-Shift-8": () => this.editor.commands.toggleList(this.name, "listItem") };
  },
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*([-+*])\s$/, type: this.type })];
  },
});

const OrderedList = Node.create({
  name: "orderedList",
  group: "block list",
  content: "listItem+",
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (el) => (el.hasAttribute("start") ? Number(el.getAttribute("start")) || 1 : 1),
        renderHTML: (attrs) => (attrs.start && attrs.start !== 1 ? { start: attrs.start } : {}),
      },
    };
  },
  parseHTML: () => [{ tag: "ol" }],
  renderHTML: ({ HTMLAttributes }) => ["ol", HTMLAttributes, 0],
  addKeyboardShortcuts() {
    return { "Mod-Shift-7": () => this.editor.commands.toggleList(this.name, "listItem") };
  },
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^(\d+)\.\s$/,
        type: this.type,
        getAttributes: (m) => ({ start: Number(m[1]) }),
        joinPredicate: (m, node) => node.childCount + node.attrs.start === Number(m[1]),
      }),
    ];
  },
});

const Blockquote = Node.create({
  name: "blockquote",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: () => ["blockquote", 0],
  addKeyboardShortcuts() {
    return { "Mod-Shift-b": () => this.editor.commands.toggleWrap(this.name) };
  },
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*>\s$/, type: this.type })];
  },
});

const HardBreak = Node.create({
  name: "hardBreak",
  group: "inline",
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: "br" }],
  renderHTML: () => ["br"],
  addKeyboardShortcuts() {
    const insert = () =>
      this.editor.commands.first(({ commands }) => [
        () => commands.exitCode(),
        () => commands.insertContent({ type: this.name }),
      ]);
    return { "Shift-Enter": insert, "Mod-Enter": insert };
  },
});

// Mark order = nesting order: earlier marks wrap later ones, matching `<RichText>` (link outermost).
const Link = Mark.create({
  name: "link",
  priority: 1000,
  inclusive: false,
  addAttributes() {
    return {
      href: { default: null },
      title: { default: null },
      newTab: {
        default: false,
        parseHTML: (el) => el.getAttribute("target") === "_blank",
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML: () => [
    {
      tag: "a[href]",
      // Only links the site can store (no javascript:, data: …) survive a paste.
      getAttrs: (el) =>
        RICH_LINK_HREF_RE.test((el as HTMLElement).getAttribute("href") ?? "") ? null : false,
    },
  ],
  renderHTML: ({ mark }) => [
    "a",
    {
      href: mark.attrs.href,
      ...(mark.attrs.title ? { title: mark.attrs.title } : {}),
      ...(mark.attrs.newTab ? { target: "_blank", rel: "noopener" } : {}),
    },
    0,
  ],
});

const Highlight = Mark.create({
  name: "highlight",
  priority: 990,
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => {
          const m = /var\(--os-color-([a-z0-9-]+)\)/.exec(el.getAttribute("style") ?? "");
          return m ? m[1] : null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ mark }) => [
    "mark",
    {
      class: "os-highlight",
      ...(mark.attrs.color ? { style: `--hl: var(${colorVar(mark.attrs.color)})` } : {}),
    },
    0,
  ],
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleMark(this.name) };
  },
});

function simpleMark(
  name: "bold" | "italic" | "underline" | "strike" | "code",
  tag: string,
  priority: number,
  options: { alsoParse?: string[]; key?: string; rule?: RegExp } = {},
) {
  return Mark.create({
    name,
    priority,
    ...(name === "code" ? { excludes: "_" } : {}),
    parseHTML: () => [tag, ...(options.alsoParse ?? [])].map((t) => ({ tag: t })),
    renderHTML: () => [tag, 0],
    addKeyboardShortcuts() {
      return options.key ? { [options.key]: () => this.editor.commands.toggleMark(this.name) } : {};
    },
    addInputRules() {
      return options.rule ? [markInputRule({ find: options.rule, type: this.type })] : [];
    },
  });
}

const Bold = simpleMark("bold", "strong", 980, {
  alsoParse: ["b"],
  key: "Mod-b",
  rule: /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/,
});
const Italic = simpleMark("italic", "em", 970, {
  alsoParse: ["i"],
  key: "Mod-i",
  rule: /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/,
});
const Underline = simpleMark("underline", "u", 960, { key: "Mod-u" });
const Strike = simpleMark("strike", "s", 950, { alsoParse: ["del", "strike"], key: "Mod-Shift-s" });
const Code = simpleMark("code", "code", 940, {
  key: "Mod-e",
  rule: /(?:^|\s)(`(?!\s+`)([^`]+)`(?!\s+`))$/,
});

export const richTextExtensions = [
  Doc,
  Text,
  Paragraph,
  Heading,
  BulletList,
  OrderedList,
  ListItem,
  Blockquote,
  HardBreak,
  Link,
  Highlight,
  Bold,
  Italic,
  Underline,
  Strike,
  Code,
];

// --- typography presets (toolbar) ------------------------------------------------------------

export type TextStyleId =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "lead"
  | "body"
  | "small"
  | "eyebrow";

export const TEXT_STYLES: Array<{ id: TextStyleId; label: string }> = [
  { id: "display", label: "Display" },
  { id: "h1", label: "Heading 1" },
  { id: "h2", label: "Heading 2" },
  { id: "h3", label: "Heading 3" },
  { id: "h4", label: "Heading 4" },
  { id: "lead", label: "Lead" },
  { id: "body", label: "Body" },
  { id: "small", label: "Small" },
  { id: "eyebrow", label: "Eyebrow" },
];

/** The text style at the selection, or null when it spans several. */
export function currentTextStyle(editor: Editor): TextStyleId | null {
  const { $from, $to } = editor.state.selection;
  const at = (pos: typeof $from) => {
    const node = pos.parent;
    if (node.type.name === "heading") {
      const preset = node.attrs.preset as string | null;
      return (preset ?? `h${node.attrs.level}`) as TextStyleId;
    }
    return ((node.attrs.preset as string | null) ?? "body") as TextStyleId;
  };
  const a = at($from);
  return a === at($to) ? a : null;
}

export function applyTextStyle(editor: Editor, style: TextStyleId) {
  const chain = editor.chain().focus();
  if (style === "display") return chain.setNode("heading", { level: 1, preset: "display" }).run();
  if (/^h[1-4]$/.test(style))
    return chain.setNode("heading", { level: Number(style.slice(1)), preset: null }).run();
  return chain.setNode("paragraph", { preset: style === "body" ? null : style }).run();
}
