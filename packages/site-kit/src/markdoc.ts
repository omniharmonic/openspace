/**
 * Markdoc bodies → blocks (arch §3.6). Markdoc tags map 1:1 to blocks: the tag name is the
 * block type and its attributes are the block's fields (with a few conveniences, below). Prose
 * between tags becomes `text` blocks (rich text via the schema's Markdown converter), a lone
 * Markdown image becomes an `image` block and `---` becomes a `line` block. Posts therefore
 * render through exactly the same renderer and blocks as pages, and can never carry scripts.
 *
 * Attribute conveniences:
 * - `variant` / `layout`: the block variant; if it isn't one, it fills a select field that has
 *   that option (`{% button variant="primary" %}` sets the button's `role`).
 * - `href`: the block's first link field. Strings become links (`/path`, `https://…`,
 *   `mailto:`, `tel:`, `media/…` files).
 * - Image fields accept a `media/…` path or https URL; alt text and size come from
 *   `content/media.json`, or from an `alt` attribute.
 * - Lists accept plain values (`images=["media/a.jpg"]`), filling each item's first image (or
 *   text) field.
 * - Tag content fills the first rich-text field (Markdown), else the first text field.
 * - `id="blk_…"` pins the block id; otherwise ids are derived from `idSeed` + position.
 */
import Markdoc, { type Node } from "@markdoc/markdoc";
import {
  type Block,
  type BlockRegistry,
  type FieldMeta,
  fromMarkdown,
  isId,
  type MediaMeta,
  type RichTextDoc,
} from "@openspace/schema";
import { stableId } from "./ids";

export interface MarkdocIssue {
  /** 1-based line in the body. */
  line: number;
  message: string;
}

export interface MarkdocToBlocksOptions {
  registry: BlockRegistry;
  /** Media metadata (alt text, dimensions) by repo path. */
  media?: Record<string, MediaMeta>;
  /** Seed for deterministic block ids, e.g. `blog/opening-day`. */
  idSeed: string;
}

export interface MarkdocResult {
  blocks: Block[];
  issues: MarkdocIssue[];
}

type Json = unknown;

const lineOf = (n: Node) => (n.lines[0] ?? 0) + 1;

/** Plain text of an inline subtree. */
function inlineText(n: Node): string {
  if (n.type === "text") return String(n.attributes.content ?? "");
  if (n.type === "softbreak" || n.type === "hardbreak") return " ";
  return n.children.map(inlineText).join("");
}

/** A paragraph whose only meaningful inline child is a tag: treat the tag as a block. */
function soleInlineTag(n: Node): Node | undefined {
  if (n.type !== "paragraph") return undefined;
  const inline = n.children[0];
  if (!inline || n.children.length !== 1 || inline.type !== "inline") return undefined;
  const meaningful = inline.children.filter(
    (c) =>
      !(c.type === "text" && !String(c.attributes.content ?? "").trim()) && c.type !== "softbreak",
  );
  return meaningful.length === 1 && meaningful[0]?.type === "tag" ? meaningful[0] : undefined;
}

function soleImage(n: Node): Node | undefined {
  if (n.type !== "paragraph") return undefined;
  const inline = n.children[0];
  if (inline?.type !== "inline") return undefined;
  const meaningful = inline.children.filter(
    (c) => !(c.type === "text" && !String(c.attributes.content ?? "").trim()),
  );
  return meaningful.length === 1 && meaningful[0]?.type === "image" ? meaningful[0] : undefined;
}

export function linkFromString(value: string): Json {
  if (value.startsWith("mailto:")) return { type: "email", email: value.slice(7).split("?")[0] };
  if (value.startsWith("tel:")) return { type: "phone", phone: value.slice(4) };
  if (value.startsWith("media/")) return { type: "file", src: value };
  return { type: "url", url: value };
}

function imageFromString(
  src: string,
  media: Record<string, MediaMeta> | undefined,
  alt?: string,
): Json {
  const meta = media?.[src];
  const out: Record<string, Json> = { src, alt: alt ?? meta?.alt ?? "" };
  if (meta?.width && meta.height) {
    out.width = meta.width;
    out.height = meta.height;
  }
  if (meta?.focal) out.focal = meta.focal;
  return out;
}

function coerce(meta: FieldMeta, value: Json, media: Record<string, MediaMeta> | undefined): Json {
  switch (meta.kind) {
    case "text":
      return typeof value === "number" ? String(value) : value;
    case "richText":
      return typeof value === "string" ? fromMarkdown(value) : value;
    case "image":
      return typeof value === "string" ? imageFromString(value, media) : value;
    case "link":
      return typeof value === "string" ? linkFromString(value) : value;
    case "media":
      return typeof value === "string" ? { kind: meta.kinds[0] ?? "video", src: value } : value;
    case "select":
      return typeof value === "number" ? String(value) : value;
    case "boolean":
      return value === "true" ? true : value === "false" ? false : value;
    case "number":
      return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))
        ? Number(value)
        : value;
    case "list": {
      if (!Array.isArray(value)) return value;
      const entries = Object.entries(meta.fields);
      const primary =
        entries.find(([, m]) => m.kind === "image") ?? entries.find(([, m]) => m.kind === "text");
      return value.map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const out: Record<string, Json> = {};
          for (const [k, v] of Object.entries(item)) {
            const m = meta.fields[k];
            out[k] = m ? coerce(m, v, media) : v;
          }
          return out;
        }
        if (primary) return { [primary[0]]: coerce(primary[1], item, media) };
        return item;
      });
    }
    default:
      return value;
  }
}

/** Image values (`{ src, alt, … }`) with an https src and no width/height. */
function unsizedRemoteImages(value: Json, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) unsizedRemoteImages(v, out);
  else if (value && typeof value === "object") {
    const o = value as Record<string, Json>;
    if (typeof o.src === "string" && "alt" in o && /^https:\/\//.test(o.src)) {
      if (!(typeof o.width === "number" && typeof o.height === "number")) out.push(o.src);
    } else for (const v of Object.values(o)) unsizedRemoteImages(v, out);
  }
  return out;
}

/** Required-field defaults only (optional demo defaults never leak into posts). */
export function requiredDefaults(fields: Record<string, FieldMeta>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, m] of Object.entries(fields)) {
    if (!m.optional && m.default !== undefined) out[k] = structuredClone(m.default);
  }
  return out;
}

/** Build one block from a tag's attributes (shared with tests and the CLI). */
export function blockFromTag(
  tag: string,
  attributes: Record<string, Json>,
  content: { markdown?: string; text?: string } | undefined,
  opts: MarkdocToBlocksOptions & { id: string },
): { block?: Block; errors: string[] } {
  const def = opts.registry.get(tag);
  if (!def)
    return { errors: [`Unknown block "${tag}" (known: ${opts.registry.types().join(", ")})`] };
  const meta = def.meta;
  const fields = requiredDefaults(meta.fields);
  const errors: string[] = [];
  let variant: string | undefined;
  let id = opts.id;
  let alt: string | undefined;
  const size: { width?: number; height?: number } = {};
  const entries = Object.entries(meta.fields);
  for (const [key, raw] of Object.entries(attributes)) {
    if (key === "id") {
      if (typeof raw === "string" && isId(raw, "blk")) id = raw;
      else errors.push(`id must be a block id like blk_0123456789`);
      continue;
    }
    if (key === "alt" && !meta.fields.alt) {
      alt = String(raw);
      continue;
    }
    if ((key === "width" || key === "height") && !meta.fields[key]) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) errors.push(`${key} must be a positive whole number`);
      else size[key] = n;
      continue;
    }
    if ((key === "variant" || key === "layout") && !meta.fields[key]) {
      const v = String(raw);
      if (meta.variants.includes(v)) {
        variant = v;
        continue;
      }
      const select = entries.find(
        ([, m]) => m.kind === "select" && m.options.some((o) => o.value === v),
      );
      if (select) {
        fields[select[0]] = v;
        continue;
      }
      errors.push(`"${v}" is not a ${tag} variant (${meta.variants.join(", ")})`);
      continue;
    }
    if (key === "href" && !meta.fields.href) {
      const link = entries.find(([, m]) => m.kind === "link");
      if (link) {
        fields[link[0]] = coerce(link[1], raw, opts.media);
        continue;
      }
    }
    const fieldMeta = meta.fields[key];
    if (!fieldMeta) {
      errors.push(`${tag} has no field "${key}" (fields: ${Object.keys(meta.fields).join(", ")})`);
      continue;
    }
    fields[key] = coerce(fieldMeta, raw, opts.media);
  }
  if (alt !== undefined || size.width || size.height) {
    const img = entries.find(([, m]) => m.kind === "image");
    const value = img ? fields[img[0]] : undefined;
    if (value && typeof value === "object") {
      const v = value as Record<string, Json>;
      if (alt !== undefined) v.alt = alt;
      if (size.width) v.width = size.width;
      if (size.height) v.height = size.height;
    }
  }
  if (content && (content.markdown?.trim() || content.text?.trim())) {
    const rich = entries.find(([k, m]) => m.kind === "richText" && !(k in attributes));
    const text = entries.find(([k, m]) => m.kind === "text" && !(k in attributes));
    if (rich) fields[rich[0]] = fromMarkdown(content.markdown ?? content.text ?? "");
    else if (text) fields[text[0]] = (content.text ?? content.markdown ?? "").trim();
    else errors.push(`${tag} doesn't take content between its tags`);
  }
  const block: Block = { id: id as Block["id"], type: def.type, v: def.version, fields };
  if (variant) block.variant = variant;
  // No layout shift (GC11): remote images must state their size (local ones get it from media.json).
  for (const src of unsizedRemoteImages(fields))
    errors.push(
      `${tag}: remote image ${src} needs a size — add width= and height= (or ![alt](url "=WxH"))`,
    );
  const result = def.validate(block);
  if (!result.success) {
    for (const i of result.issues)
      errors.push(`${tag}: ${i.path.join(".") || "(block)"}: ${i.message}`);
    return { errors };
  }
  return errors.length ? { errors } : { block, errors };
}

/** Convert a Markdoc body into blocks. Problems are reported with 1-based line numbers. */
export function markdocToBlocks(body: string, opts: MarkdocToBlocksOptions): MarkdocResult {
  const ast = Markdoc.parse(body);
  const lines = body.split("\n");
  const blocks: Block[] = [];
  const issues: MarkdocIssue[] = [];
  for (const node of [ast, ...ast.walk()]) {
    for (const e of node.errors) {
      if (e.level === "error" || e.level === "critical")
        issues.push({ line: lineOf(node), message: e.message });
    }
  }
  let prose: Node[] = [];
  const nextId = () => stableId("blk", `${opts.idSeed}#${blocks.length}`);

  const flush = () => {
    if (!prose.length) return;
    const start = prose[0]?.lines[0] ?? 0;
    const last = prose[prose.length - 1];
    const end = last?.lines[last.lines.length - 1] ?? start + 1;
    const markdown = lines.slice(start, end).join("\n").trim();
    prose = [];
    if (!markdown) return;
    const content: RichTextDoc = fromMarkdown(markdown);
    if (!content.content.length) return;
    const r = blockFromTag("text", {}, undefined, { ...opts, id: nextId() });
    if (!r.block) return;
    r.block.fields.content = content;
    blocks.push(r.block);
  };

  const pushTag = (tag: Node, contentNode: Node, inline: boolean) => {
    flush();
    let content: { markdown?: string; text?: string } | undefined;
    if (inline) {
      content = { text: inlineText(tag) };
    } else if (tag.children.length) {
      const inner = tag.lines.length >= 4 ? lines.slice(tag.lines[1], tag.lines[2]).join("\n") : "";
      content = { markdown: inner, text: tag.children.map(inlineText).join("\n") };
    }
    const r = blockFromTag(String(tag.tag), tag.attributes as Record<string, Json>, content, {
      ...opts,
      id: nextId(),
    });
    for (const message of r.errors) issues.push({ line: lineOf(contentNode), message });
    if (r.block) blocks.push(r.block);
  };

  for (const node of ast.children) {
    if (node.type === "tag") {
      pushTag(node, node, false);
      continue;
    }
    const inlineTag = soleInlineTag(node);
    if (inlineTag) {
      pushTag(inlineTag, node, true);
      continue;
    }
    const img = soleImage(node);
    if (img) {
      flush();
      const src = String(img.attributes.src ?? "");
      // `![alt](url "=1600x1067")` gives a remote image its size.
      const dims = /^=(\d+)x(\d+)$/.exec(String(img.attributes.title ?? ""));
      const r = blockFromTag(
        "image",
        {
          image: src,
          ...(img.attributes.alt ? { alt: String(img.attributes.alt) } : {}),
          ...(dims ? { width: Number(dims[1]), height: Number(dims[2]) } : {}),
        },
        undefined,
        { ...opts, id: nextId() },
      );
      for (const message of r.errors) issues.push({ line: lineOf(node), message });
      if (r.block) blocks.push(r.block);
      continue;
    }
    if (node.type === "hr") {
      flush();
      const r = blockFromTag("line", {}, undefined, { ...opts, id: nextId() });
      if (r.block) blocks.push(r.block);
      continue;
    }
    prose.push(node);
  }
  flush();
  return { blocks, issues };
}

/** Plain-text summary of a Markdoc body (feeds, descriptions): prose only, tags dropped. */
export function markdocPlainText(body: string, maxLength = 300): string {
  const ast = Markdoc.parse(body);
  const parts: string[] = [];
  for (const node of ast.children) {
    if (node.type === "paragraph" && !soleInlineTag(node) && !soleImage(node)) {
      const t = inlineText(node).replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    }
    if (parts.join(" ").length >= maxLength) break;
  }
  const text = parts.join(" ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…` : text;
}
