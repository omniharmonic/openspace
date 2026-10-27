import {
  type BlockNode,
  HEADING_PRESETS,
  type InlineNode,
  type ListItemNode,
  type Mark,
  PARAGRAPH_PRESETS,
  RICH_LINK_HREF_RE,
  type RichTextDoc,
} from "@omniharmonic/openspace-schema";
import type { JSONContent } from "@tiptap/core";

/** OpenSpace rich text → Tiptap JSON. An empty document becomes one empty paragraph. */
export function toTiptap(doc: RichTextDoc | null | undefined): JSONContent {
  const content = doc?.content?.length ? doc.content : [{ type: "paragraph" as const }];
  return { type: "doc", content: content.map(blockTo) };
}

function blockTo(node: BlockNode): JSONContent {
  switch (node.type) {
    case "paragraph":
      return {
        type: "paragraph",
        attrs: { preset: node.attrs?.preset ?? null },
        ...(node.content?.length ? { content: node.content.map(inlineTo) } : {}),
      };
    case "heading":
      return {
        type: "heading",
        attrs: { level: node.attrs.level, preset: node.attrs.preset ?? null },
        ...(node.content?.length ? { content: node.content.map(inlineTo) } : {}),
      };
    case "bulletList":
      return { type: "bulletList", content: node.content.map(itemTo) };
    case "orderedList":
      return {
        type: "orderedList",
        attrs: { start: node.attrs?.start ?? 1 },
        content: node.content.map(itemTo),
      };
    case "blockquote":
      return { type: "blockquote", content: node.content.map(blockTo) };
  }
}

const itemTo = (li: ListItemNode): JSONContent => ({
  type: "listItem",
  content: li.content.map(blockTo),
});

function inlineTo(node: InlineNode): JSONContent {
  if (node.type === "hardBreak") return { type: "hardBreak" };
  return {
    type: "text",
    text: node.text,
    ...(node.marks?.length ? { marks: node.marks.map(markTo) } : {}),
  };
}

function markTo(mark: Mark): { type: string; attrs?: Record<string, unknown> } {
  if (mark.type === "link")
    return {
      type: "link",
      attrs: {
        href: mark.attrs.href,
        title: mark.attrs.title ?? null,
        newTab: Boolean(mark.attrs.newTab),
      },
    };
  if (mark.type === "highlight")
    return { type: "highlight", attrs: { color: mark.attrs?.color ?? null } };
  return { type: mark.type };
}

// --- Tiptap JSON → OpenSpace rich text ------------------------------------------------------

/**
 * Tiptap JSON → OpenSpace rich text, normalised: default attributes dropped, unknown nodes
 * flattened to their text, unsafe links removed. The result always validates against
 * `RichTextDocSchema`.
 */
export function fromTiptap(json: JSONContent): RichTextDoc {
  return { type: "doc", content: blocksFrom(json.content ?? []) };
}

function blocksFrom(nodes: JSONContent[]): BlockNode[] {
  const out: BlockNode[] = [];
  for (const n of nodes) {
    const b = blockFrom(n);
    if (b) out.push(b);
  }
  return out;
}

function blockFrom(n: JSONContent): BlockNode | null {
  switch (n.type) {
    case "paragraph": {
      const preset = n.attrs?.preset as string | null | undefined;
      const content = inlineFrom(n.content ?? []);
      return {
        type: "paragraph",
        ...(preset && preset !== "body" && (PARAGRAPH_PRESETS as readonly string[]).includes(preset)
          ? { attrs: { preset: preset as never } }
          : {}),
        ...(content.length ? { content } : {}),
      };
    }
    case "heading": {
      const raw = Number(n.attrs?.level ?? 2);
      const level = (Math.min(4, Math.max(1, raw)) || 2) as 1 | 2 | 3 | 4;
      const preset = n.attrs?.preset as string | null | undefined;
      const content = inlineFrom(n.content ?? []);
      return {
        type: "heading",
        attrs:
          preset &&
          preset !== `h${level}` &&
          (HEADING_PRESETS as readonly string[]).includes(preset)
            ? { level, preset: preset as never }
            : { level },
        ...(content.length ? { content } : {}),
      };
    }
    case "bulletList":
    case "orderedList": {
      const items = (n.content ?? [])
        .map((li) => ({ type: "listItem" as const, content: blocksFrom(li.content ?? []) }))
        .map((li) =>
          li.content.length ? li : { ...li, content: [{ type: "paragraph" as const }] },
        );
      if (!items.length) return null;
      if (n.type === "bulletList") return { type: "bulletList", content: items };
      const start = Number(n.attrs?.start ?? 1);
      return {
        type: "orderedList",
        ...(Number.isInteger(start) && start !== 1 && start >= 0 ? { attrs: { start } } : {}),
        content: items,
      };
    }
    case "blockquote": {
      const content = blocksFrom(n.content ?? []);
      return { type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] };
    }
    default:
      return null;
  }
}

/** Canonical mark order in stored JSON (rendering order is the renderer's concern). */
const MARK_ORDER: Mark["type"][] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "link",
];
const MARK_NAMES = new Set<string>(MARK_ORDER);

function inlineFrom(nodes: JSONContent[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      out.push({ type: "hardBreak" });
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const marks: Mark[] = [];
    for (const m of n.marks ?? []) {
      if (!MARK_NAMES.has(m.type)) continue;
      if (m.type === "link") {
        const href = String(m.attrs?.href ?? "");
        if (!RICH_LINK_HREF_RE.test(href)) continue;
        const attrs: { href: string; title?: string; newTab?: boolean } = { href };
        if (m.attrs?.title) attrs.title = String(m.attrs.title).slice(0, 200);
        if (m.attrs?.newTab) attrs.newTab = true;
        marks.push({ type: "link", attrs });
      } else if (m.type === "highlight") {
        const color = m.attrs?.color as string | null | undefined;
        marks.push(color ? { type: "highlight", attrs: { color } } : { type: "highlight" });
      } else marks.push({ type: m.type as "bold" });
    }
    marks.sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    const prev = out[out.length - 1];
    if (prev?.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(marks)) {
      prev.text += n.text;
      continue;
    }
    out.push(marks.length ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
  }
  return out;
}

/** Stable string for change detection. */
export const richKey = (doc: RichTextDoc | null | undefined) => JSON.stringify(doc ?? null);

/**
 * Narrow a document to what a field allows (its `marks` and block `blocks`): disallowed marks
 * are dropped, disallowed headings become paragraphs, disallowed lists and quotes unwrap into
 * their paragraphs.
 */
export function restrictDoc(
  doc: RichTextDoc,
  allow: { marks: readonly string[]; blocks: readonly string[] },
): RichTextDoc {
  const marks = new Set(allow.marks);
  const blocks = new Set(allow.blocks);
  const inline = (nodes: InlineNode[] | undefined) =>
    nodes?.map((n) =>
      n.type === "text" && n.marks
        ? (() => {
            const kept = n.marks.filter((m) => marks.has(m.type));
            return kept.length ? { ...n, marks: kept } : { type: "text" as const, text: n.text };
          })()
        : n,
    );
  const visit = (nodes: BlockNode[]): BlockNode[] =>
    nodes.flatMap((n): BlockNode[] => {
      if (n.type === "paragraph") {
        const content = inline(n.content);
        return [{ ...n, ...(content ? { content } : {}) }];
      }
      if (n.type === "heading") {
        const content = inline(n.content);
        if (blocks.has("heading")) return [{ ...n, ...(content ? { content } : {}) }];
        return [{ type: "paragraph", ...(content?.length ? { content } : {}) }];
      }
      if (n.type === "blockquote")
        return blocks.has("blockquote") ? [{ ...n, content: visit(n.content) }] : visit(n.content);
      const items = n.content.map((li) => ({ ...li, content: visit(li.content) }));
      if (blocks.has(n.type)) return [{ ...n, content: items }];
      return items.flatMap((li) => li.content);
    });
  return { type: "doc", content: visit(doc.content) };
}
