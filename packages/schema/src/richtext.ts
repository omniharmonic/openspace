/**
 * Markdown ⇄ RichTextDoc converters and plain-text extraction.
 *
 * The MCP tools accept and return Markdown (arch §3.5); conversion is lossless within the
 * rich text schema, using a few conventions beyond CommonMark for the parts Markdown can't
 * express:
 *
 * | Rich text                      | Markdown                                   |
 * | ------------------------------ | ------------------------------------------ |
 * | heading level 1–4              | `#` … `####` (`#####`+ clamp to 4)          |
 * | paragraph/heading preset       | trailing ` {.lead}` / ` {.display}`        |
 * | bold / italic / strike / code  | `**` / `*` (or `_`) / `~~` / backticks     |
 * | underline                      | `<u>…</u>`                                  |
 * | highlight                      | `==…==`, or `<mark data-color="accent">`   |
 * | link (+ newTab)                | `[text](href "title")` + `{target="_blank"}` |
 * | hard break                     | `\` at line end (`<br>` inside headings)   |
 * | adjacent lists of same kind    | alternate bullet `-`/`*`, ordered `.`/`)`  |
 *
 * Canonical form (what `fromMarkdown(toMarkdown(doc))` returns) is `normalizeDoc(doc)`:
 * adjacent text with equal marks merged, marks in canonical order, whitespace at the edges
 * of a line trimmed, empty top-level paragraphs and leading/trailing hard breaks dropped,
 * default presets (`body`, `h<level>`) omitted.
 */
import {
  type BlockNode,
  HEADING_PRESETS,
  type HeadingNode,
  type HeadingPreset,
  type InlineNode,
  type ListItemNode,
  type Mark,
  type MarkType,
  PARAGRAPH_PRESETS,
  type ParagraphNode,
  type ParagraphPreset,
  type RichTextDoc,
  type TextNode,
} from "./richtext-schema";

// ---------------------------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------------------------

/** Canonical mark order, outermost first. */
export const MARK_ORDER: readonly MarkType[] = [
  "link",
  "bold",
  "italic",
  "strike",
  "underline",
  "highlight",
  "code",
];

function markRank(m: Mark): number {
  return MARK_ORDER.indexOf(m.type);
}

function markEquals(a: Mark | undefined, b: Mark | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === "link" && b.type === "link") {
    return (
      a.attrs.href === b.attrs.href &&
      (a.attrs.title ?? undefined) === (b.attrs.title ?? undefined) &&
      Boolean(a.attrs.newTab) === Boolean(b.attrs.newTab)
    );
  }
  if (a.type === "highlight" && b.type === "highlight") {
    return (a.attrs?.color ?? undefined) === (b.attrs?.color ?? undefined);
  }
  return true;
}

function marksEqual(a: readonly Mark[], b: readonly Mark[]): boolean {
  return a.length === b.length && a.every((m, i) => markEquals(m, b[i]));
}

function canonicalMark(m: Mark): Mark {
  if (m.type === "link") {
    const attrs: { href: string; title?: string; newTab?: boolean } = { href: m.attrs.href };
    if (m.attrs.title) attrs.title = m.attrs.title;
    if (m.attrs.newTab) attrs.newTab = true;
    return { type: "link", attrs };
  }
  if (m.type === "highlight") {
    return m.attrs?.color
      ? { type: "highlight", attrs: { color: m.attrs.color } }
      : { type: "highlight" };
  }
  return { type: m.type };
}

function canonicalMarks(marks: readonly Mark[] | undefined): Mark[] {
  const byType = new Map<MarkType, Mark>();
  for (const m of marks ?? []) byType.set(m.type, canonicalMark(m));
  return [...byType.values()].sort((a, b) => markRank(a) - markRank(b));
}

function textNode(text: string, marks: readonly Mark[]): TextNode {
  return marks.length ? { type: "text", text, marks: [...marks] } : { type: "text", text };
}

/** Merge adjacent equal-mark text, canonicalize marks, trim line edges, drop edge breaks. */
export function normalizeInline(nodes: readonly InlineNode[] | undefined): InlineNode[] {
  // 1. canonicalize + merge
  const merged: InlineNode[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      merged.push({ type: "hardBreak" });
      continue;
    }
    const text = n.text.replace(/\r?\n/g, " ");
    if (!text) continue;
    const marks = canonicalMarks(n.marks);
    const prev = merged[merged.length - 1];
    if (prev?.type === "text" && marksEqual(prev.marks ?? [], marks)) {
      merged[merged.length - 1] = textNode(prev.text + text, marks);
    } else {
      merged.push(textNode(text, marks));
    }
  }
  // 2. split into lines, trim each line's edges (code spans included: Markdown can't keep them)
  const lines: TextNode[][] = [[]];
  for (const n of merged) {
    if (n.type === "hardBreak") lines.push([]);
    else lines[lines.length - 1]?.push(n);
  }
  const trimmedLines = lines.map((line) => {
    const out = [...line];
    while (out.length) {
      const first = out[0] as TextNode;
      const t = first.text.replace(/^[ \t]+/, "");
      if (t) {
        out[0] = textNode(t, first.marks ?? []);
        break;
      }
      out.shift();
    }
    while (out.length) {
      const last = out[out.length - 1] as TextNode;
      const t = last.text.replace(/[ \t]+$/, "");
      if (t) {
        out[out.length - 1] = textNode(t, last.marks ?? []);
        break;
      }
      out.pop();
    }
    return out;
  });
  // 3. drop leading/trailing empty lines (= edge hard breaks), rejoin with hard breaks
  while (trimmedLines.length && trimmedLines[0]?.length === 0) trimmedLines.shift();
  while (trimmedLines.length && trimmedLines[trimmedLines.length - 1]?.length === 0)
    trimmedLines.pop();
  const out: InlineNode[] = [];
  trimmedLines.forEach((line, i) => {
    if (i > 0) out.push({ type: "hardBreak" });
    out.push(...line);
  });
  return out;
}

function normalizeBlocks(nodes: readonly BlockNode[], context: "top" | "container"): BlockNode[] {
  const out: BlockNode[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case "paragraph": {
        const content = normalizeInline(n.content);
        const preset = n.attrs?.preset;
        const p: ParagraphNode = { type: "paragraph" };
        if (preset && preset !== "body") p.attrs = { preset };
        if (content.length) p.content = content;
        if (!content.length && context === "top") break;
        out.push(p);
        break;
      }
      case "heading": {
        const content = normalizeInline(n.content);
        const level = n.attrs.level;
        const h: HeadingNode = { type: "heading", attrs: { level } };
        if (n.attrs.preset && n.attrs.preset !== `h${level}`) h.attrs.preset = n.attrs.preset;
        if (content.length) h.content = content;
        out.push(h);
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = n.content.map(normalizeListItem);
        if (n.type === "orderedList") {
          const start = n.attrs?.start;
          out.push(
            start !== undefined && start !== 1
              ? { type: "orderedList", attrs: { start }, content: items }
              : { type: "orderedList", content: items },
          );
        } else out.push({ type: "bulletList", content: items });
        break;
      }
      case "blockquote":
        out.push({
          type: "blockquote",
          content: nonEmpty(normalizeBlocks(n.content, "container")),
        });
        break;
    }
  }
  return context === "container" ? dropEmptyParagraphs(out) : out;
}

function dropEmptyParagraphs(nodes: BlockNode[]): BlockNode[] {
  return nodes.filter((n) => !(n.type === "paragraph" && !n.content?.length));
}

function nonEmpty(nodes: BlockNode[]): BlockNode[] {
  return nodes.length ? nodes : [{ type: "paragraph" }];
}

function normalizeListItem(li: ListItemNode): ListItemNode {
  return { type: "listItem", content: nonEmpty(normalizeBlocks(li.content, "container")) };
}

/** Canonical form of a document (see module docs). */
export function normalizeDoc(doc: RichTextDoc): RichTextDoc {
  return { type: "doc", content: normalizeBlocks(doc.content, "top") };
}

// ---------------------------------------------------------------------------------------------
// Serializer: RichTextDoc → Markdown
// ---------------------------------------------------------------------------------------------

const MARK_DELIMS: Partial<Record<MarkType, [string, string]>> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  strike: ["~~", "~~"],
  underline: ["<u>", "</u>"],
};

function openMark(m: Mark): string {
  if (m.type === "highlight") {
    return m.attrs?.color ? `<mark data-color="${m.attrs.color}">` : "==";
  }
  return MARK_DELIMS[m.type]?.[0] ?? "";
}

function closeMark(m: Mark): string {
  if (m.type === "highlight") return m.attrs?.color ? "</mark>" : "==";
  return MARK_DELIMS[m.type]?.[1] ?? "";
}

const ALNUM = /[\p{L}\p{N}]/u;

function escapeText(text: string, atLineStart: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    const prev = text[i - 1];
    const next = text[i + 1];
    switch (c) {
      case "\\":
      case "*":
      case "`":
      case "[":
      case "]":
      case "<":
        out += `\\${c}`;
        break;
      case "_":
        out += prev && next && ALNUM.test(prev) && ALNUM.test(next) ? c : `\\${c}`;
        break;
      case "~":
      case "=":
        out += prev === c || next === c || i === 0 || i === text.length - 1 ? `\\${c}` : c;
        break;
      case "{":
        out += next === "." || i === 0 ? `\\${c}` : c;
        break;
      default:
        out += c;
    }
  }
  if (atLineStart) {
    out = out
      .replace(/^([#>])/, "\\$1")
      .replace(/^([-+])(?=[ \t]|$|--)/, "\\$1")
      .replace(/^(\d{1,9})([.)])/, "$1\\$2");
  }
  return out;
}

/** CommonMark strips one space from each side of a code span that starts and ends with one. */
function needsCodePadding(code: string): boolean {
  return code.length >= 2 && code.startsWith(" ") && code.endsWith(" ") && /[^ ]/.test(code);
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((n, r) => Math.max(n, r.length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") || needsCodePadding(text) ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function linkMark(n: InlineNode): Extract<Mark, { type: "link" }> | undefined {
  if (n.type !== "text") return undefined;
  return n.marks?.find((m): m is Extract<Mark, { type: "link" }> => m.type === "link");
}

function linkSuffix(m: Extract<Mark, { type: "link" }>): string {
  const href = /[()<>\s]/.test(m.attrs.href) ? `<${m.attrs.href}>` : m.attrs.href;
  const title = m.attrs.title ? ` "${m.attrs.title.replace(/["\\]/g, "\\$&")}"` : "";
  return `](${href}${title})${m.attrs.newTab ? '{target="_blank"}' : ""}`;
}

interface InlineCtx {
  hardBreak: string;
  /** Output on the current line so far is empty (for line-start escaping). */
  atLineStart: boolean;
}

function serializeRun(nodes: readonly InlineNode[], ctx: InlineCtx): string {
  let out = "";
  let active: Mark[] = [];
  const closeAll = () => {
    for (let k = active.length - 1; k >= 0; k--) out += closeMark(active[k] as Mark);
    active = [];
  };
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      closeAll();
      out += ctx.hardBreak;
      ctx.atLineStart = ctx.hardBreak.endsWith("\n");
      continue;
    }
    const marks = (n.marks ?? []).filter((m) => m.type !== "link" && m.type !== "code");
    const isCode = n.marks?.some((m) => m.type === "code") ?? false;
    // close marks no longer active (innermost first), keep the rest, open new ones
    const keep = active.filter((a) => marks.some((m) => markEquals(a, m)));
    for (let k = active.length - 1; k >= 0; k--) {
      const a = active[k] as Mark;
      if (!keep.includes(a)) out += closeMark(a);
    }
    const added = marks.filter((m) => !keep.some((a) => markEquals(a, m)));
    for (const m of added) out += openMark(m);
    active = [...keep, ...added];
    const lineStart = ctx.atLineStart && active.length === 0;
    out += isCode ? codeSpan(n.text) : escapeText(n.text, lineStart);
    ctx.atLineStart = false;
  }
  closeAll();
  return out;
}

function serializeInline(nodes: readonly InlineNode[], ctx: InlineCtx): string {
  let out = "";
  let i = 0;
  while (i < nodes.length) {
    const link = linkMark(nodes[i] as InlineNode);
    let j = i;
    if (link) {
      while (j < nodes.length && markEquals(linkMark(nodes[j] as InlineNode), link)) j++;
      out += "[";
      ctx.atLineStart = false;
      out += serializeRun(nodes.slice(i, j), ctx);
      out += linkSuffix(link);
    } else {
      while (j < nodes.length && !linkMark(nodes[j] as InlineNode)) j++;
      out += serializeRun(nodes.slice(i, j), ctx);
    }
    i = j;
  }
  return out;
}

function presetSuffix(preset: string | undefined): string {
  return preset ? ` {.${preset}}` : "";
}

function indentLines(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? first + line : line ? rest + line : ""))
    .join("\n");
}

function serializeBlocks(nodes: readonly BlockNode[]): string {
  const parts: string[] = [];
  let prev: BlockNode | undefined;
  let bulletAlt = false;
  let orderedAlt = false;
  for (const n of nodes) {
    switch (n.type) {
      case "paragraph": {
        const text = serializeInline(n.content ?? [], { hardBreak: "\\\n", atLineStart: true });
        parts.push(text + presetSuffix(n.attrs?.preset));
        break;
      }
      case "heading": {
        const text = serializeInline(n.content ?? [], { hardBreak: "<br>", atLineStart: false });
        const preset =
          n.attrs.preset && n.attrs.preset !== `h${n.attrs.level}` ? n.attrs.preset : undefined;
        parts.push(`${"#".repeat(n.attrs.level)}${text ? ` ${text}` : ""}${presetSuffix(preset)}`);
        break;
      }
      case "bulletList": {
        bulletAlt = prev?.type === "bulletList" ? !bulletAlt : false;
        const marker = bulletAlt ? "*" : "-";
        parts.push(
          n.content.map((li) => indentLines(serializeListItem(li), `${marker} `, "  ")).join("\n"),
        );
        break;
      }
      case "orderedList": {
        orderedAlt = prev?.type === "orderedList" ? !orderedAlt : false;
        const delim = orderedAlt ? ")" : ".";
        const start = n.attrs?.start ?? 1;
        parts.push(
          n.content
            .map((li, k) => {
              const marker = `${start + k}${delim} `;
              return indentLines(serializeListItem(li), marker, " ".repeat(marker.length));
            })
            .join("\n"),
        );
        break;
      }
      case "blockquote": {
        const inner = serializeBlocks(n.content);
        parts.push(
          inner
            .split("\n")
            .map((l) => (l ? `> ${l}` : ">"))
            .join("\n"),
        );
        break;
      }
    }
    prev = n;
  }
  return parts.join("\n\n");
}

function serializeListItem(li: ListItemNode): string {
  // Tight list: first paragraph and directly following lists are separated by a single newline.
  const out: string[] = [];
  li.content.forEach((child, k) => {
    const text = serializeBlocks([child]);
    if (k === 0) out.push(text);
    else {
      const tight = child.type === "bulletList" || child.type === "orderedList";
      out.push(`${tight ? "\n" : "\n\n"}${text}`);
    }
  });
  return out.join("");
}

/** Serialize a rich text document to Markdown. */
export function toMarkdown(doc: RichTextDoc): string {
  return serializeBlocks(normalizeDoc(doc).content);
}

// ---------------------------------------------------------------------------------------------
// Parser: Markdown → RichTextDoc
// ---------------------------------------------------------------------------------------------

const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const QUOTE_RE = /^ {0,3}>/;
const LIST_RE = /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])\1{2,}[ \t]*$/;
const PRESET_SUFFIX_RE = /(^|[ \t])\{\.([a-z0-9-]+)\}[ \t]*$/;

function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

function indentOf(line: string): number {
  return (line.match(/^ */)?.[0] ?? "").length;
}

interface ListMarker {
  indent: number;
  marker: string;
  kind: "bullet" | "ordered";
  /** Bullet char, or ordered delimiter. */
  style: string;
  contentIndent: number;
  rest: string;
}

function matchListMarker(line: string): ListMarker | undefined {
  const m = LIST_RE.exec(line);
  if (!m) return undefined;
  const lead = m[1] ?? "";
  const marker = m[2] ?? "";
  const spaces = m[3] ?? "";
  const width = spaces.length >= 1 && spaces.length <= 4 ? spaces.length : 1;
  const ordered = /\d/.test(marker);
  return {
    indent: lead.length,
    marker,
    kind: ordered ? "ordered" : "bullet",
    style: ordered ? marker.slice(-1) : marker,
    contentIndent: lead.length + marker.length + width,
    rest:
      m[4] !== undefined ? (spaces.length > 4 ? " ".repeat(spaces.length - 1) + m[4] : m[4]) : "",
  };
}

function startsBlock(line: string): boolean {
  return HEADING_RE.test(line) || QUOTE_RE.test(line) || matchListMarker(line) !== undefined;
}

function extractPreset<P extends string>(
  text: string,
  allowed: readonly P[],
): { text: string; preset?: P } {
  const m = PRESET_SUFFIX_RE.exec(text);
  if (m && (allowed as readonly string[]).includes(m[2] as string)) {
    return {
      text: text.slice(0, m.index + (m[1]?.length ?? 0)).replace(/[ \t]+$/, ""),
      preset: m[2] as P,
    };
  }
  return { text };
}

function parseBlocks(lines: readonly string[]): BlockNode[] {
  const out: BlockNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (isBlank(line) || THEMATIC_BREAK_RE.test(line)) {
      // Thematic breaks (`---`, `***`) are not part of the rich text schema; skip them.
      i++;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min((heading[1] ?? "#").length, 4) as 1 | 2 | 3 | 4;
      const { text, preset } = extractPreset<HeadingPreset>(heading[2] ?? "", HEADING_PRESETS);
      const node: HeadingNode = { type: "heading", attrs: { level } };
      if (preset) node.attrs.preset = preset;
      const content = parseInline(text);
      if (content.length) node.content = content;
      out.push(node);
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i] as string)) {
        inner.push((lines[i] as string).replace(/^ {0,3}> ?/, ""));
        i++;
      }
      out.push({ type: "blockquote", content: nonEmpty(parseBlocks(inner)) });
      continue;
    }
    const marker = matchListMarker(line);
    if (marker) {
      const [list, next] = parseList(lines, i, marker);
      out.push(list);
      i = next;
      continue;
    }
    // paragraph
    const para: string[] = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i] as string) && !startsBlock(lines[i] as string)) {
      para.push(lines[i] as string);
      i++;
    }
    out.push(parseParagraph(para));
  }
  return out;
}

function parseParagraph(lines: readonly string[]): ParagraphNode {
  let joined = "";
  lines.forEach((raw, k) => {
    let line = raw.replace(/^[ \t]+/, "");
    const last = k === lines.length - 1;
    if (!last) {
      const backslashes = (line.match(/\\+$/)?.[0] ?? "").length;
      if (backslashes % 2 === 1) {
        joined += `${line.slice(0, -1)}\n`;
        return;
      }
      if (/ {2,}$/.test(line)) {
        joined += `${line.replace(/[ \t]+$/, "")}\n`;
        return;
      }
      line = line.replace(/[ \t]+$/, "");
      joined += `${line} `;
      return;
    }
    joined += line;
  });
  const { text, preset } = extractPreset<ParagraphPreset>(joined, PARAGRAPH_PRESETS);
  const node: ParagraphNode = { type: "paragraph" };
  if (preset) node.attrs = { preset };
  const content = parseInline(text);
  if (content.length) node.content = content;
  return node;
}

function parseList(
  lines: readonly string[],
  start: number,
  first: ListMarker,
): [BlockNode, number] {
  const items: ListItemNode[] = [];
  let i = start;
  while (i < lines.length) {
    const marker = matchListMarker(lines[i] as string);
    if (
      !marker ||
      marker.kind !== first.kind ||
      marker.style !== first.style ||
      marker.indent > first.indent + 3
    )
      break;
    const itemLines: string[] = [marker.rest];
    const contentIndent = marker.contentIndent;
    i++;
    while (i < lines.length) {
      const l = lines[i] as string;
      if (isBlank(l)) {
        let k = i;
        while (k < lines.length && isBlank(lines[k] as string)) k++;
        if (k < lines.length && indentOf(lines[k] as string) >= contentIndent) {
          for (let b = i; b < k; b++) itemLines.push("");
          i = k;
          continue;
        }
        break;
      }
      if (indentOf(l) >= contentIndent) {
        itemLines.push(l.slice(contentIndent));
        i++;
        continue;
      }
      break;
    }
    items.push({ type: "listItem", content: nonEmpty(parseBlocks(itemLines)) });
    // blank lines between items of the same list
    let k = i;
    while (k < lines.length && isBlank(lines[k] as string)) k++;
    const nextMarker = k < lines.length ? matchListMarker(lines[k] as string) : undefined;
    if (k !== i && nextMarker && nextMarker.kind === first.kind && nextMarker.style === first.style)
      i = k;
  }
  if (first.kind === "bullet") return [{ type: "bulletList", content: items }, i];
  const startNum = Number.parseInt(first.marker, 10);
  return [
    startNum !== 1
      ? { type: "orderedList", attrs: { start: startNum }, content: items }
      : { type: "orderedList", content: items },
    i,
  ];
}

// --- inline -----------------------------------------------------------------------------------

type DelimMark = "bold" | "italic" | "strike" | "highlight";

type Token =
  | { kind: "text"; value: string }
  | { kind: "delim"; mark: DelimMark; raw: string }
  | { kind: "tag"; mark: "underline" | "highlight"; open: boolean; color?: string }
  | { kind: "code"; value: string }
  | { kind: "break" }
  | { kind: "link"; children: Token[]; href: string; title?: string; newTab: boolean };

const PUNCT = /[!-/:-@[-`{-~]/;

function findCodeClose(s: string, from: number, len: number): number {
  let i = from;
  while (i < s.length) {
    if (s[i] === "`") {
      let j = i;
      while (s[j] === "`") j++;
      if (j - i === len) return i;
      i = j;
    } else i++;
  }
  return -1;
}

/** Index of the `]` matching the `[` at `open`, or -1. */
function findBracketClose(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "`") {
      let j = i;
      while (s[j] === "`") j++;
      const close = findCodeClose(s, j, j - i);
      if (close >= 0) {
        i = close + (j - i) - 1;
        continue;
      }
      i = j - 1;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parse `(dest "title")` starting at `(`; returns end index (after `)`) or -1. */
function parseLinkTail(
  s: string,
  at: number,
): { href: string; title?: string; end: number } | undefined {
  if (s[at] !== "(") return undefined;
  let i = at + 1;
  while (s[i] === " ") i++;
  let href = "";
  if (s[i] === "<") {
    const close = s.indexOf(">", i);
    if (close < 0) return undefined;
    href = s.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    while (i < s.length) {
      const c = s[i] as string;
      if (c === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1] as string)) {
        href += s[i + 1];
        i += 2;
        continue;
      }
      if (/\s/.test(c)) break;
      if (c === "(") depth++;
      if (c === ")") {
        if (depth === 0) break;
        depth--;
      }
      href += c;
      i++;
    }
  }
  while (s[i] === " ") i++;
  let title: string | undefined;
  const q = s[i];
  if (q === '"' || q === "'") {
    let t = "";
    i++;
    while (i < s.length && s[i] !== q) {
      if (s[i] === "\\" && i + 1 < s.length) {
        t += s[i + 1];
        i += 2;
        continue;
      }
      t += s[i];
      i++;
    }
    if (s[i] !== q) return undefined;
    title = t;
    i++;
    while (s[i] === " ") i++;
  }
  if (s[i] !== ")") return undefined;
  return title !== undefined ? { href, title, end: i + 1 } : { href, end: i + 1 };
}

const TAG_RE = /^<(\/?)(u|mark|br)(?:\s+data-color="([a-z0-9-]+)")?\s*\/?>/i;

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let buf = "";
  const flush = () => {
    if (buf) tokens.push({ kind: "text", value: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    const next = s[i + 1];
    if (c === "\\" && next !== undefined && PUNCT.test(next)) {
      buf += next;
      i += 2;
      continue;
    }
    if (c === "\n") {
      flush();
      tokens.push({ kind: "break" });
      i++;
      continue;
    }
    if (c === "`") {
      let j = i;
      while (s[j] === "`") j++;
      const len = j - i;
      const close = findCodeClose(s, j, len);
      if (close < 0) {
        buf += s.slice(i, j);
        i = j;
        continue;
      }
      let code = s.slice(j, close).replace(/\n/g, " ");
      if (needsCodePadding(code)) code = code.slice(1, -1);
      flush();
      tokens.push({ kind: "code", value: code });
      i = close + len;
      continue;
    }
    if (c === "*" || c === "_") {
      if (c === "_") {
        const prev = s[i - 1];
        const after = s[i + (next === "_" ? 2 : 1)];
        if (prev && after && ALNUM.test(prev) && ALNUM.test(after)) {
          buf += next === "_" ? "__" : "_";
          i += next === "_" ? 2 : 1;
          continue;
        }
      }
      flush();
      if (next === c) {
        tokens.push({ kind: "delim", mark: "bold", raw: c + c });
        i += 2;
      } else {
        tokens.push({ kind: "delim", mark: "italic", raw: c });
        i++;
      }
      continue;
    }
    if ((c === "~" || c === "=") && next === c) {
      flush();
      tokens.push({ kind: "delim", mark: c === "~" ? "strike" : "highlight", raw: c + c });
      i += 2;
      continue;
    }
    if (c === "<") {
      const m = TAG_RE.exec(s.slice(i));
      if (m) {
        const closing = m[1] === "/";
        const name = (m[2] ?? "").toLowerCase();
        flush();
        if (name === "br") tokens.push({ kind: "break" });
        else if (name === "u") tokens.push({ kind: "tag", mark: "underline", open: !closing });
        else {
          const t: Token = { kind: "tag", mark: "highlight", open: !closing };
          if (!closing && m[3]) t.color = m[3];
          tokens.push(t);
        }
        i += m[0].length;
        continue;
      }
    }
    if (c === "[") {
      const close = findBracketClose(s, i);
      const tail = close >= 0 ? parseLinkTail(s, close + 1) : undefined;
      if (tail) {
        let end = tail.end;
        let newTab = false;
        const attr = /^\{target="?_blank"?\}/.exec(s.slice(end));
        if (attr) {
          newTab = true;
          end += attr[0].length;
        }
        flush();
        const t: Token = {
          kind: "link",
          children: tokenize(s.slice(i + 1, close)),
          href: tail.href,
          newTab,
        };
        if (tail.title !== undefined) t.title = tail.title;
        tokens.push(t);
        i = end;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return tokens;
}

/** Turn unmatched delimiters (odd count per kind) into literal text: the last one of each. */
function resolveDelims(tokens: Token[]): Token[] {
  const counts = new Map<DelimMark, number>();
  for (const t of tokens) if (t.kind === "delim") counts.set(t.mark, (counts.get(t.mark) ?? 0) + 1);
  const literal = new Set<Token>();
  for (const [mark, count] of counts) {
    if (count % 2 === 1) {
      for (let k = tokens.length - 1; k >= 0; k--) {
        const t = tokens[k] as Token;
        if (t.kind === "delim" && t.mark === mark) {
          literal.add(t);
          break;
        }
      }
    }
  }
  return tokens.map((t) =>
    literal.has(t) && t.kind === "delim" ? { kind: "text", value: t.raw } : t,
  );
}

function buildInline(
  tokens: Token[],
  initial: ReadonlyMap<MarkType, Mark>,
  out: InlineNode[],
): void {
  const active = new Map(initial);
  const marks = () => canonicalMarks([...active.values()]);
  for (const t of resolveDelims(tokens)) {
    switch (t.kind) {
      case "text":
        out.push(textNode(t.value, marks()));
        break;
      case "code":
        if (t.value)
          out.push(textNode(t.value, canonicalMarks([...active.values(), { type: "code" }])));
        break;
      case "break":
        out.push({ type: "hardBreak" });
        break;
      case "delim":
        if (active.has(t.mark)) active.delete(t.mark);
        else active.set(t.mark, { type: t.mark } as Mark);
        break;
      case "tag":
        if (t.open) {
          active.set(
            t.mark,
            t.mark === "highlight" && t.color
              ? { type: "highlight", attrs: { color: t.color } }
              : ({ type: t.mark } as Mark),
          );
        } else active.delete(t.mark);
        break;
      case "link": {
        const inner = new Map(active);
        const attrs: { href: string; title?: string; newTab?: boolean } = { href: t.href };
        if (t.title) attrs.title = t.title;
        if (t.newTab) attrs.newTab = true;
        inner.set("link", { type: "link", attrs });
        buildInline(t.children, inner, out);
        break;
      }
    }
  }
}

/** Parse a single line/paragraph of inline Markdown (`\n` = hard break). */
export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  buildInline(tokenize(text), new Map(), out);
  return normalizeInline(out);
}

/** Parse Markdown into a rich text document (canonical form). */
export function fromMarkdown(markdown: string): RichTextDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  return normalizeDoc({ type: "doc", content: parseBlocks(lines) });
}

// ---------------------------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------------------------

function inlinePlain(nodes: readonly InlineNode[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === "text" ? n.text : "\n")).join("");
}

function blocksPlain(nodes: readonly BlockNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "paragraph" || n.type === "heading") out.push(inlinePlain(n.content));
    else if (n.type === "blockquote") out.push(blocksPlain(n.content).join("\n\n"));
    else out.push(n.content.map((li) => blocksPlain(li.content).join("\n")).join("\n"));
  }
  return out;
}

/** Plain text of a document: blocks separated by blank lines, hard breaks as newlines. */
export function plainText(doc: RichTextDoc): string {
  return blocksPlain(doc.content)
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Build a one-paragraph document from plain text (newlines become hard breaks). */
export function docFromText(text: string): RichTextDoc {
  const content: InlineNode[] = [];
  text.split("\n").forEach((line, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  });
  return normalizeDoc({ type: "doc", content: [{ type: "paragraph", content }] });
}
