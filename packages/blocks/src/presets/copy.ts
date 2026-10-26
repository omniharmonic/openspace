import { type Block, plainText, type RichTextDoc, type Section } from "@openspace/schema";
import type { CopyRule, CopyTarget } from "./types";

/** Counting and locating copy inside sections (shared by preset tests and the Design check). */

/** Words in a string: runs of letters/digits (so "—" and "&" don't count). */
export function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu)?.length ?? 0;
}

type Node = RichTextDoc["content"][number];

function inlineText(node: { content?: unknown }): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const o = n as { type?: string; text?: string; content?: unknown[] };
    if (o.type === "text" && typeof o.text === "string") parts.push(o.text);
    if (o.type === "hardBreak") parts.push(" ");
    if (Array.isArray(o.content)) for (const c of o.content) walk(c);
  };
  walk(node);
  return parts.join("");
}

function isRichText(value: unknown): value is RichTextDoc {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/** Headings (level + text) in a block, in document order — rich text and heading blocks. */
export function blockHeadings(block: Block): { level: number; text: string }[] {
  if (block.type === "heading") {
    const level = Number(String(block.fields.level ?? "h2").slice(1));
    return [{ level, text: String(block.fields.text ?? "") }];
  }
  const out: { level: number; text: string }[] = [];
  if (block.type === "text" && isRichText(block.fields.content)) {
    for (const node of block.fields.content.content as Node[]) {
      if (node.type === "heading") out.push({ level: node.attrs.level, text: inlineText(node) });
    }
  }
  return out;
}

/** Running body text of a text block: paragraphs, lists and quotes, minus eyebrow/small labels. */
export function blockBody(block: Block): string {
  if (block.type !== "text" || !isRichText(block.fields.content)) return "";
  const parts: string[] = [];
  for (const node of block.fields.content.content as Node[]) {
    if (node.type === "heading") continue;
    if (node.type === "paragraph") {
      const preset = node.attrs?.preset;
      if (preset === "eyebrow" || preset === "small") continue;
    }
    parts.push(inlineText(node));
  }
  return parts.join(" ").trim();
}

function fieldText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (isRichText(value)) return plainText(value);
  return undefined;
}

export interface CopyMeasurement {
  blockId: string;
  /** List item index for `items` targets. */
  item?: number;
  text: string;
  words: number;
}

/** Every piece of copy in `section` that `target` points at, with its word count. */
export function measureCopy(section: Section, target: CopyTarget): CopyMeasurement[] {
  const out: CopyMeasurement[] = [];
  const push = (blockId: string, text: string, item?: number) =>
    out.push({ blockId, text, words: wordCount(text), ...(item !== undefined ? { item } : {}) });
  for (const block of section.blocks) {
    switch (target.kind) {
      case "heading":
        for (const h of blockHeadings(block))
          if (target.level === undefined || h.level === target.level) push(block.id, h.text);
        break;
      case "body": {
        const body = blockBody(block);
        if (body) push(block.id, body);
        break;
      }
      case "field": {
        if (block.type !== target.block) break;
        const text = fieldText(block.fields[target.field]);
        if (text) push(block.id, text);
        break;
      }
      case "items": {
        if (block.type !== target.block) break;
        const list = block.fields[target.list];
        if (!Array.isArray(list)) break;
        list.forEach((item, i) => {
          const text = fieldText((item as Record<string, unknown> | null)?.[target.field]);
          if (text) push(block.id, text, i);
        });
        break;
      }
    }
  }
  return out;
}

export interface CopyViolation extends CopyMeasurement {
  rule: CopyRule;
  direction: "long" | "short";
}

/** Copy in `section` that falls outside the given rules' ranges. */
export function copyViolations(section: Section, rules: readonly CopyRule[]): CopyViolation[] {
  const out: CopyViolation[] = [];
  for (const rule of rules) {
    for (const m of measureCopy(section, rule.target)) {
      if (m.words > rule.words[1]) out.push({ ...m, rule, direction: "long" });
      else if (m.words < rule.words[0]) out.push({ ...m, rule, direction: "short" });
    }
  }
  return out;
}
