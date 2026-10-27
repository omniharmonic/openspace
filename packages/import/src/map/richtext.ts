/**
 * Squarespace text HTML → OpenSpace rich text (the constrained ProseMirror schema): paragraphs
 * (with Squarespace's large/small paragraph styles as presets), headings, lists, quotes and the
 * inline marks. Inline styles, fonts and colors are dropped — the look comes from Site Styles.
 */
import {
  type BlockNode,
  type InlineNode,
  type Mark,
  normalizeDoc,
  RICH_LINK_HREF_RE,
  type RichTextDoc,
  RichTextDocSchema,
} from "@omniharmonic/openspace-schema";
import { attr, classes, type Element, isElement, type Node, parseHtmlFragment } from "../dom";

/** Rewrites an href found in text (old site path → new path); undefined drops the link. */
export type HrefRewriter = (href: string) => string | undefined;

const INLINE_MARKS: Record<string, Mark["type"]> = {
  strong: "bold",
  b: "bold",
  em: "italic",
  i: "italic",
  u: "underline",
  s: "strike",
  strike: "strike",
  del: "strike",
  code: "code",
};

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "div",
  "section",
  "article",
  "figure",
  "table",
  "hr",
]);

const nodeText = (n: Node) => (n as { value?: string }).value ?? "";

interface Ctx {
  rewrite: HrefRewriter;
  /** Text alignments seen on paragraphs/headings (for the block's align style). */
  aligns: string[];
  /** Nesting depth (only top-level paragraphs and headings vote on alignment). */
  depth: number;
}

function inline(nodes: readonly Node[], marks: Mark[], ctx: Ctx): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (n.nodeName === "#text") {
      const t = nodeText(n).replace(/[\s ]+/g, " ");
      if (t) out.push({ type: "text", text: t, ...(marks.length ? { marks: [...marks] } : {}) });
      continue;
    }
    if (!isElement(n)) continue;
    const tag = n.tagName;
    if (tag === "br") {
      out.push({ type: "hardBreak" });
      continue;
    }
    if (tag === "script" || tag === "style" || tag === "img" || tag === "svg" || tag === "iframe")
      continue;
    let next = marks;
    const mark = INLINE_MARKS[tag];
    if (mark && !marks.some((m) => m.type === mark)) next = [...marks, { type: mark } as Mark];
    if (tag === "a") {
      const href = attr(n, "href");
      const rewritten = href ? ctx.rewrite(href) : undefined;
      if (rewritten && RICH_LINK_HREF_RE.test(rewritten) && !marks.some((m) => m.type === "link")) {
        const link: Mark = {
          type: "link",
          attrs: { href: rewritten, ...(attr(n, "target") === "_blank" ? { newTab: true } : {}) },
        };
        next = [...next, link];
      }
    }
    const style = attr(n, "style") ?? "";
    if (
      tag === "span" &&
      /font-weight\s*:\s*(?:bold|[6-9]00)/.test(style) &&
      !next.some((m) => m.type === "bold")
    )
      next = [...next, { type: "bold" }];
    if (
      tag === "span" &&
      /font-style\s*:\s*italic/.test(style) &&
      !next.some((m) => m.type === "italic")
    )
      next = [...next, { type: "italic" }];
    out.push(...inline(n.childNodes, next, ctx));
  }
  return out;
}

/** Trim leading/trailing whitespace of a run and drop empty text. */
function tidy(nodes: InlineNode[]): InlineNode[] {
  const out = [...nodes];
  while (out.length && out[0]?.type === "hardBreak") out.shift();
  while (out.length && out[out.length - 1]?.type === "hardBreak") out.pop();
  const first = out[0];
  if (first?.type === "text") first.text = first.text.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.type === "text") last.text = last.text.replace(/\s+$/, "");
  return out.filter((n) => n.type !== "text" || n.text.length > 0);
}

function alignOf(el: Element): string | undefined {
  return /text-align\s*:\s*(center|right|left|justify)/.exec(attr(el, "style") ?? "")?.[1];
}

function blocks(nodes: readonly Node[], ctx: Ctx): BlockNode[] {
  const out: BlockNode[] = [];
  let pending: Node[] = [];
  const flushInline = () => {
    const content = tidy(inline(pending, [], ctx));
    pending = [];
    if (content.some((c) => c.type === "text" && c.text.trim()))
      out.push({ type: "paragraph", content });
  };
  for (const n of nodes) {
    // Inline wrappers around block content (Squarespace's scaled-text spans around headings).
    if (isElement(n) && !BLOCK_TAGS.has(n.tagName) && n.tagName !== "a" && hasBlockChild(n)) {
      flushInline();
      out.push(...blocks(n.childNodes, ctx));
      continue;
    }
    if (!isElement(n) || !BLOCK_TAGS.has(n.tagName) || n.tagName === "hr") {
      if (isElement(n) && n.tagName === "hr") {
        flushInline();
        continue;
      }
      pending.push(n);
      continue;
    }
    flushInline();
    const tag = n.tagName;
    const align = alignOf(n);
    if (ctx.depth === 0 && /^(?:p|h[1-6])$/.test(tag)) ctx.aligns.push(align ?? "left");
    if (tag === "p" || tag === "pre") {
      const marks: Mark[] = tag === "pre" ? [{ type: "code" }] : [];
      const content = tidy(inline(n.childNodes, marks, ctx));
      if (!content.some((c) => c.type === "text" && c.text.trim())) continue;
      const cls = classes(n);
      const preset = cls.includes("sqsrte-large")
        ? "lead"
        : cls.includes("sqsrte-small")
          ? "small"
          : undefined;
      out.push({ type: "paragraph", ...(preset ? { attrs: { preset } } : {}), content });
    } else if (/^h[1-6]$/.test(tag)) {
      const content = tidy(inline(n.childNodes, [], ctx));
      if (!content.some((c) => c.type === "text" && c.text.trim())) continue;
      const level = Math.min(4, Number(tag.slice(1))) as 1 | 2 | 3 | 4;
      out.push({ type: "heading", attrs: { level }, content });
    } else if (tag === "ul" || tag === "ol") {
      const items = n.childNodes
        .filter((c): c is Element => isElement(c) && c.tagName === "li")
        .map((li) => {
          ctx.depth++;
          const inner = blocks(li.childNodes, ctx);
          ctx.depth--;
          return {
            type: "listItem" as const,
            content: inner.length ? inner : [{ type: "paragraph" as const }],
          };
        })
        .filter((li) =>
          li.content.some((b) => b.type !== "paragraph" || (b.content?.length ?? 0) > 0),
        );
      if (!items.length) continue;
      const start = Number(attr(n, "start"));
      out.push(
        tag === "ul"
          ? { type: "bulletList", content: items }
          : { type: "orderedList", ...(start > 1 ? { attrs: { start } } : {}), content: items },
      );
    } else if (tag === "blockquote") {
      ctx.depth++;
      const inner = blocks(n.childNodes, ctx);
      ctx.depth--;
      if (inner.length) out.push({ type: "blockquote", content: inner });
    } else if (tag === "table") {
      // Tables become one paragraph per row (cells separated by " · ").
      for (const tr of collect(n, "tr")) {
        const cells = collect(tr, "td").concat(collect(tr, "th"));
        const content = tidy(
          cells.flatMap((c, i) => [
            ...(i ? [{ type: "text" as const, text: " · " }] : []),
            ...inline(c.childNodes, [], ctx),
          ]),
        );
        if (content.length) out.push({ type: "paragraph", content });
      }
    } else out.push(...blocks(n.childNodes, ctx));
  }
  flushInline();
  return out;
}

function hasBlockChild(el: Element): boolean {
  return el.childNodes.some((c) => isElement(c) && (BLOCK_TAGS.has(c.tagName) || hasBlockChild(c)));
}

function collect(el: Element, tag: string): Element[] {
  const out: Element[] = [];
  const visit = (n: Element) => {
    for (const c of n.childNodes) if (isElement(c)) c.tagName === tag ? out.push(c) : visit(c);
  };
  visit(el);
  return out;
}

export interface RichTextResult {
  doc: RichTextDoc;
  /** Dominant text alignment, when not left. */
  align?: "center" | "end";
}

/** Convert HTML to a valid rich text doc (undefined when there is no text). */
export function htmlToRichText(
  html: string,
  rewrite: HrefRewriter = (h) => h,
): RichTextResult | undefined {
  const ctx: Ctx = { rewrite, aligns: [], depth: 0 };
  const root = parseHtmlFragment(html);
  const content = blocks(root.childNodes, ctx);
  if (!content.length) return undefined;
  let doc = normalizeDoc({ type: "doc", content });
  // Squarespace's headings in text blocks often carry their own preset (h1 → display) — keep
  // levels; strip anything the schema refuses rather than failing the block.
  const parsed = RichTextDocSchema.safeParse(doc);
  if (!parsed.success) {
    doc = normalizeDoc({
      type: "doc",
      content: content.map((b) =>
        b.type === "paragraph" || b.type === "heading"
          ? b
          : { type: "paragraph", content: [{ type: "text", text: plainOf(b) || " " }] },
      ),
    });
  }
  const counts = new Map<string, number>();
  for (const a of ctx.aligns) counts.set(a, (counts.get(a) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    doc,
    ...(top === "center" ? { align: "center" } : top === "right" ? { align: "end" } : {}),
  };
}

function plainOf(b: BlockNode): string {
  if (b.type === "paragraph" || b.type === "heading")
    return (b.content ?? []).map((i) => (i.type === "text" ? i.text : " ")).join("");
  if (b.type === "blockquote") return b.content.map(plainOf).join(" ");
  return b.content.map((li) => li.content.map(plainOf).join(" ")).join(" ");
}

/** Plain text → rich text paragraphs. */
export function textToRichText(s: string): RichTextDoc {
  const paras = s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    type: "doc",
    content: paras.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
}
