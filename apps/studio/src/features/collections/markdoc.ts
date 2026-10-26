import { blocksRegistry } from "@openspace/blocks";
import {
  type Block,
  type BlockRegistry,
  type FieldMeta,
  fromMarkdown,
  type MediaMeta,
  newId,
  type RichTextDoc,
  toMarkdown,
} from "@openspace/schema";
import { type MarkdocIssue, markdocToBlocks, requiredDefaults } from "@openspace/site-kit/markdoc";

/**
 * Item bodies are Markdoc (arch §3.6): prose as Markdown, every other block as a tag whose name
 * is the block type and whose attributes are its fields. Studio edits a list of blocks and
 * writes them back with {@link blocksToMarkdoc}; site-kit's `markdocToBlocks` reads them, so the
 * two directions round-trip through the same rules the published site uses.
 */

const registry = (): BlockRegistry => blocksRegistry();

/** Markdoc literal for an attribute value (strings, numbers, booleans, arrays, objects). */
function literal(value: unknown): string {
  return JSON.stringify(value);
}

function isDefaultish(meta: FieldMeta, value: unknown): boolean {
  if (value === undefined) return true;
  if (meta.default === undefined) return false;
  return JSON.stringify(meta.default) === JSON.stringify(value);
}

/** Markdown for a rich-text value, with tag openers neutralised so prose can't become a tag. */
function prose(doc: RichTextDoc): string {
  return toMarkdown(doc).replace(/\{%/g, "{ %");
}

function isPlainImage(block: Block): boolean {
  if (block.type !== "image" || (block.variant && block.variant !== "default")) return false;
  const def = registry().get("image");
  if (!def) return false;
  const img = block.fields.image as { src?: string; alt?: string; width?: number } | undefined;
  if (!img?.src || /[()\s]/.test(img.src)) return false;
  return Object.entries(def.meta.fields).every(
    ([k, m]) => k === "image" || isDefaultish(m, block.fields[k]),
  );
}

/** One block → Markdoc. */
export function blockToMarkdoc(block: Block): string {
  if (block.type === "text" && (!block.variant || block.variant === "default")) {
    const content = block.fields.content as RichTextDoc | undefined;
    return content ? prose(content).trim() : "";
  }
  if (block.type === "line" && (!block.variant || block.variant === "solid")) {
    const def = registry().get("line");
    const plain =
      def && Object.entries(def.meta.fields).every(([k, m]) => isDefaultish(m, block.fields[k]));
    if (plain) return "---";
  }
  if (isPlainImage(block)) {
    const img = block.fields.image as {
      src: string;
      alt?: string;
      width?: number;
      height?: number;
    };
    const alt = (img.alt ?? "").replace(/[[\]]/g, "");
    const size =
      /^https:/.test(img.src) && img.width && img.height ? ` "=${img.width}x${img.height}"` : "";
    return `![${alt}](${img.src}${size})`;
  }
  const def = registry().get(block.type);
  const fields = def?.meta.fields ?? {};
  const richKeys = Object.entries(fields)
    .filter(([, m]) => m.kind === "richText")
    .map(([k]) => k);
  // The first rich-text field goes between the tags as Markdown (easier to read and edit).
  const contentKey =
    richKeys.length === 1 && block.fields[richKeys[0] as string] !== undefined
      ? (richKeys[0] as string)
      : null;
  const attrs: string[] = [];
  if (block.variant) attrs.push(`variant=${literal(block.variant)}`);
  for (const [k, v] of Object.entries(block.fields)) {
    if (k === contentKey || v === undefined) continue;
    const meta = fields[k];
    if (meta?.optional && isDefaultish(meta, v)) continue;
    attrs.push(`${k}=${literal(v)}`);
  }
  const open = `{% ${block.type}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  if (!contentKey) return `${open} /%}`;
  const inner = prose(block.fields[contentKey] as RichTextDoc).trim();
  return `${open} %}\n${inner}\n{% /${block.type} %}`;
}

/** Blocks → a Markdoc body (blank line between blocks). */
export function blocksToMarkdoc(blocks: readonly Block[]): string {
  const parts = blocks.map(blockToMarkdoc).filter((s) => s.trim() !== "");
  return parts.length ? `${parts.join("\n\n")}\n` : "";
}

export interface ParsedBody {
  blocks: Block[];
  issues: MarkdocIssue[];
}

/** A Markdoc body → blocks (site-kit's own reader), with adjacent prose merged. */
export function markdocToEditorBlocks(
  body: string,
  options: { idSeed: string; media?: Record<string, MediaMeta> },
): ParsedBody {
  const r = markdocToBlocks(body, { registry: registry(), ...options });
  return { blocks: r.blocks, issues: r.issues };
}

/** An empty prose block (with a fresh id). */
export function textBlockFrom(markdown: string): Block {
  return freshBlock("text", { content: fromMarkdown(markdown) });
}

/**
 * A new block for a post body: required defaults only (like site-kit's reader), so library demo
 * copy never leaks into someone's post.
 */
export function freshBlock(type: string, fields: Record<string, unknown> = {}): Block {
  const def = registry().get(type);
  if (!def) throw new Error(`Unknown block ${type}`);
  return {
    id: newId("blk") as Block["id"],
    type: def.type,
    v: def.version,
    fields: { ...(requiredDefaults(def.meta.fields) as Record<string, unknown>), ...fields },
  } as Block;
}
