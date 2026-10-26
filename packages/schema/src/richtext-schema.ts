import { z } from "zod";
import { named } from "./registry";
import { ColorTokenSchema, type TypePreset } from "./tokens";

/**
 * Rich text (arch §3.5): ProseMirror JSON with a constrained schema. Paragraphs and headings
 * map to typography presets; inline marks are bold, italic, underline, strike, code, link and
 * highlight (token color); plus bullet/numbered lists, blockquote and hard breaks.
 * No arbitrary inline styles.
 */

export const MARK_TYPES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "highlight",
] as const;
export type MarkType = (typeof MARK_TYPES)[number];

export const BLOCK_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
] as const;
export type BlockNodeType = (typeof BLOCK_NODE_TYPES)[number];

/** Presets a paragraph may use (headings use display/h1–h4/eyebrow). */
export const PARAGRAPH_PRESETS = ["body", "lead", "small", "eyebrow"] as const;
export const HEADING_PRESETS = ["display", "h1", "h2", "h3", "h4", "eyebrow"] as const;
export type ParagraphPreset = (typeof PARAGRAPH_PRESETS)[number];
export type HeadingPreset = (typeof HEADING_PRESETS)[number] & TypePreset;

export type SimpleMark = { type: "bold" | "italic" | "underline" | "strike" | "code" };
export type LinkMark = { type: "link"; attrs: { href: string; title?: string; newTab?: boolean } };
export type HighlightMark = { type: "highlight"; attrs?: { color?: string } };
export type Mark = SimpleMark | LinkMark | HighlightMark;

export type TextNode = { type: "text"; text: string; marks?: Mark[] };
export type HardBreakNode = { type: "hardBreak" };
export type InlineNode = TextNode | HardBreakNode;

export type ParagraphNode = {
  type: "paragraph";
  attrs?: { preset?: ParagraphPreset };
  content?: InlineNode[];
};
export type HeadingNode = {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4; preset?: HeadingPreset };
  content?: InlineNode[];
};
export type ListItemNode = { type: "listItem"; content: BlockNode[] };
export type BulletListNode = { type: "bulletList"; content: ListItemNode[] };
export type OrderedListNode = {
  type: "orderedList";
  attrs?: { start?: number };
  content: ListItemNode[];
};
export type BlockquoteNode = { type: "blockquote"; content: BlockNode[] };
export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode;

export type RichTextDoc = { type: "doc"; content: BlockNode[] };

/** Link hrefs: http(s), mailto:, tel:, site-relative paths and in-page anchors. No javascript:. */
export const RICH_LINK_HREF_RE =
  /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9 ()\-.]+|\/[^\s]*|#[A-Za-z][\w-]*)$/;

export const MAX_LINK_TITLE = 200;

export const MarkSchema: z.ZodType<Mark> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["bold", "italic", "underline", "strike", "code"]) }),
  z.strictObject({
    type: z.literal("link"),
    attrs: z.strictObject({
      href: z.string().regex(RICH_LINK_HREF_RE, { message: "Unsupported link href" }),
      title: z.string().max(MAX_LINK_TITLE).optional(),
      newTab: z.boolean().optional(),
    }),
  }),
  z.strictObject({
    type: z.literal("highlight"),
    attrs: z.strictObject({ color: ColorTokenSchema.optional() }).optional(),
  }),
]) as z.ZodType<Mark>;

export const TextNodeSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string().min(1),
  marks: z.array(MarkSchema).optional(),
});
export const HardBreakSchema = z.strictObject({ type: z.literal("hardBreak") });
export const InlineNodeSchema = z.discriminatedUnion("type", [TextNodeSchema, HardBreakSchema]);

export const ParagraphSchema = z.strictObject({
  type: z.literal("paragraph"),
  attrs: z.strictObject({ preset: z.enum(PARAGRAPH_PRESETS).optional() }).optional(),
  content: z.array(InlineNodeSchema).optional(),
});
export const HeadingSchema = z.strictObject({
  type: z.literal("heading"),
  attrs: z.strictObject({
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    preset: z.enum(HEADING_PRESETS).optional(),
  }),
  content: z.array(InlineNodeSchema).optional(),
});

export const BlockNodeSchema: z.ZodType<BlockNode> = named(
  "RichTextBlockNode",
  "A rich text block node: paragraph, heading, bullet/ordered list or blockquote.",
  z.lazy(() =>
    z.discriminatedUnion("type", [
      ParagraphSchema,
      HeadingSchema,
      z.strictObject({ type: z.literal("bulletList"), content: z.array(ListItemSchema).min(1) }),
      z.strictObject({
        type: z.literal("orderedList"),
        attrs: z.strictObject({ start: z.int().min(0).optional() }).optional(),
        content: z.array(ListItemSchema).min(1),
      }),
      z.strictObject({ type: z.literal("blockquote"), content: z.array(BlockNodeSchema).min(1) }),
    ]),
  ) as unknown as z.ZodType<BlockNode>,
);

export const ListItemSchema: z.ZodType<ListItemNode> = z.strictObject({
  type: z.literal("listItem"),
  get content() {
    return z.array(BlockNodeSchema).min(1);
  },
}) as unknown as z.ZodType<ListItemNode>;

export const RichTextDocSchema = named(
  "RichText",
  "ProseMirror JSON rich text restricted to the OpenSpace subset (arch §3.5).",
  z.strictObject({ type: z.literal("doc"), content: z.array(BlockNodeSchema) }),
) as unknown as z.ZodType<RichTextDoc>;

/** An empty document. */
export function emptyDoc(): RichTextDoc {
  return { type: "doc", content: [] };
}

/** Every mark type used anywhere in `doc`. */
export function marksUsed(doc: RichTextDoc): Set<MarkType> {
  const out = new Set<MarkType>();
  walkInline(doc, (n) => {
    if (n.type === "text") for (const m of n.marks ?? []) out.add(m.type);
  });
  return out;
}

/** Every block node type used anywhere in `doc` (including nested ones). */
export function blockTypesUsed(doc: RichTextDoc): Set<BlockNodeType> {
  const out = new Set<BlockNodeType>();
  const visit = (nodes: BlockNode[]) => {
    for (const n of nodes) {
      out.add(n.type);
      if (n.type === "bulletList" || n.type === "orderedList")
        for (const li of n.content) visit(li.content);
      else if (n.type === "blockquote") visit(n.content);
    }
  };
  visit(doc.content);
  return out;
}

/** Visit every inline node in document order. */
export function walkInline(doc: RichTextDoc, fn: (node: InlineNode) => void): void {
  const visit = (nodes: BlockNode[]) => {
    for (const n of nodes) {
      if (n.type === "paragraph" || n.type === "heading") for (const i of n.content ?? []) fn(i);
      else if (n.type === "blockquote") visit(n.content);
      else for (const li of n.content) visit(li.content);
    }
  };
  visit(doc.content);
}
