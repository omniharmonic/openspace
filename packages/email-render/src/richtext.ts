import type { BlockNode, InlineNode, ListItemNode, Mark, RichTextDoc } from "@openspace/schema";
import { esc, safeUrl } from "./escape";
import type { EmailTheme } from "./theme";

export interface RtCtx {
  theme: EmailTheme;
  baseUrl?: string;
  /** Plain-text footnote of links is not used; links are rendered inline as `text (url)`. */
}

const HEADING_SIZE: Record<number, { size: number; line: number }> = {
  1: { size: 30, line: 36 },
  2: { size: 24, line: 30 },
  3: { size: 20, line: 26 },
  4: { size: 17, line: 24 },
};

const hasMark = <T extends Mark["type"]>(marks: Mark[] | undefined, t: T) =>
  marks?.find((m) => m.type === t) as Extract<Mark, { type: T }> | undefined;

function inlineHtml(nodes: InlineNode[] | undefined, ctx: RtCtx): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      out += "<br>";
      continue;
    }
    if (n.type !== "text") continue;
    let h = esc(n.text);
    const marks = n.marks ?? [];
    if (hasMark(marks, "code")) {
      h = `<code style="font-family:'Courier New',Courier,monospace;font-size:0.92em;">${h}</code>`;
    }
    if (hasMark(marks, "bold")) h = `<strong>${h}</strong>`;
    if (hasMark(marks, "italic")) h = `<em>${h}</em>`;
    if (hasMark(marks, "underline")) h = `<u>${h}</u>`;
    if (hasMark(marks, "strike")) h = `<s>${h}</s>`;
    if (hasMark(marks, "highlight")) {
      h = `<span style="background-color:#fff3a3;color:#262626;">${h}</span>`;
    }
    const link = hasMark(marks, "link");
    if (link) {
      const href = safeUrl(link.attrs.href, ctx.baseUrl);
      if (href) {
        const title = link.attrs.title ? ` title="${esc(link.attrs.title)}"` : "";
        h = `<a class="os-link" href="${esc(href)}"${title} style="color:${ctx.theme.light.link};text-decoration:underline;">${h}</a>`;
      }
    }
    out += h;
  }
  return out;
}

function inlineText(nodes: InlineNode[] | undefined, ctx: RtCtx): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") out += "\n";
    else if (n.type === "text") {
      out += n.text;
      const link = hasMark(n.marks, "link");
      const href = link ? safeUrl(link.attrs.href, ctx.baseUrl) : null;
      if (href && href !== n.text && href.replace(/^mailto:/, "") !== n.text) out += ` (${href})`;
    }
  }
  return out;
}

export interface RtOptions {
  /** Text color class: body copy by default; `muted` for captions. */
  tone?: "text" | "muted";
  size?: number;
  line?: number;
  align?: "left" | "center" | "right";
}

function pStyle(ctx: RtCtx, o: RtOptions, extra = ""): string {
  const color = o.tone === "muted" ? ctx.theme.light.muted : ctx.theme.light.text;
  return `margin:0 0 16px 0;font-family:${ctx.theme.bodyFont};font-size:${o.size ?? 16}px;line-height:${o.line ?? 26}px;color:${color};text-align:${o.align ?? "left"};${extra}`;
}

function blockHtml(node: BlockNode, ctx: RtCtx, o: RtOptions): string {
  const cls = o.tone === "muted" ? "os-muted" : "os-text";
  switch (node.type) {
    case "paragraph": {
      const preset = node.attrs?.preset;
      const size = preset === "lead" ? 19 : preset === "small" ? 14 : (o.size ?? 16);
      const line = preset === "lead" ? 30 : preset === "small" ? 22 : (o.line ?? 26);
      const extra =
        preset === "eyebrow"
          ? "text-transform:uppercase;letter-spacing:0.12em;font-size:13px;line-height:20px;"
          : "";
      const body = inlineHtml(node.content, ctx) || "&nbsp;";
      return `<p class="${cls}" style="${pStyle(ctx, { ...o, size, line }, extra)}">${body}</p>`;
    }
    case "heading": {
      const lvl = [1, 2, 3, 4].includes(Number(node.attrs.level)) ? Number(node.attrs.level) : 2;
      const s = HEADING_SIZE[lvl] ?? { size: 24, line: 30 };
      const eyebrow = node.attrs.preset === "eyebrow";
      return `<h${lvl} class="os-heading" style="margin:0 0 14px 0;font-family:${ctx.theme.headingFont};font-weight:700;font-size:${eyebrow ? 13 : s.size}px;line-height:${eyebrow ? 20 : s.line}px;color:${ctx.theme.light.heading};text-align:${o.align ?? "left"};${eyebrow ? "text-transform:uppercase;letter-spacing:0.12em;" : ""}">${inlineHtml(node.content, ctx)}</h${lvl}>`;
    }
    case "bulletList":
    case "orderedList": {
      const tag = node.type === "bulletList" ? "ul" : "ol";
      const items = (node.content as ListItemNode[])
        .map((li) => `<li style="margin:0 0 6px 0;">${listItemHtml(li, ctx, o)}</li>`)
        .join("");
      return `<${tag} class="${cls}" style="margin:0 0 16px 0;padding:0 0 0 24px;font-family:${ctx.theme.bodyFont};font-size:${o.size ?? 16}px;line-height:${o.line ?? 26}px;color:${o.tone === "muted" ? ctx.theme.light.muted : ctx.theme.light.text};">${items}</${tag}>`;
    }
    case "blockquote": {
      const inner = node.content.map((c) => blockHtml(c, ctx, { ...o, tone: "muted" })).join("");
      return `<blockquote class="os-rule" style="margin:0 0 16px 0;padding:0 0 0 16px;border-left:3px solid ${ctx.theme.light.border};">${inner}</blockquote>`;
    }
    default:
      return "";
  }
}

function listItemHtml(li: ListItemNode, ctx: RtCtx, o: RtOptions): string {
  // Unwrap a lone paragraph so list items do not carry paragraph margins.
  return li.content
    .map((c) => (c.type === "paragraph" ? inlineHtml(c.content, ctx) : blockHtml(c, ctx, o)))
    .join("");
}

function blockText(node: BlockNode, ctx: RtCtx, depth = 0): string {
  switch (node.type) {
    case "paragraph":
      return inlineText(node.content, ctx);
    case "heading": {
      const t = inlineText(node.content, ctx);
      return node.attrs.level <= 2 ? `${t.toUpperCase()}` : t;
    }
    case "bulletList":
    case "orderedList":
      return (node.content as ListItemNode[])
        .map((li, i) => {
          const bullet = node.type === "bulletList" ? "-" : `${i + 1}.`;
          const body = li.content.map((c) => blockText(c, ctx, depth + 1)).join("\n");
          return `${"  ".repeat(depth)}${bullet} ${body}`;
        })
        .join("\n");
    case "blockquote":
      return node.content
        .map((c) => blockText(c, ctx, depth))
        .join("\n\n")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    default:
      return "";
  }
}

/** Accepts a rich text doc or (leniently) a plain string; returns email HTML. */
export function richTextHtml(doc: unknown, ctx: RtCtx, o: RtOptions = {}): string {
  if (typeof doc === "string") {
    return doc
      .split(/\n{2,}/)
      .map(
        (p) => `<p class="os-text" style="${pStyle(ctx, o)}">${esc(p).replace(/\n/g, "<br>")}</p>`,
      )
      .join("");
  }
  if (!isDoc(doc)) return "";
  return doc.content.map((n) => blockHtml(n, ctx, o)).join("");
}

export function richTextPlain(doc: unknown, ctx: RtCtx): string {
  if (typeof doc === "string") return doc;
  if (!isDoc(doc)) return "";
  return doc.content
    .map((n) => blockText(n, ctx))
    .filter(Boolean)
    .join("\n\n");
}

function isDoc(v: unknown): v is RichTextDoc {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: unknown }).type === "doc" &&
    Array.isArray((v as { content?: unknown }).content)
  );
}
