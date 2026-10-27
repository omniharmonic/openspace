/**
 * A small, read-only DOM over parse5 (spec-compliant HTML parsing, no browser): just enough
 * querying to read a Squarespace page — class/attribute matching, text, descendants.
 */
import { type DefaultTreeAdapterTypes, parse, parseFragment, serializeOuter } from "parse5";

export type Node = DefaultTreeAdapterTypes.Node;
export type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

export const isElement = (n: Node | undefined): n is Element =>
  !!n && typeof (n as Element).tagName === "string";

const hasChildren = (n: Node): n is ParentNode & Node =>
  Array.isArray((n as ParentNode).childNodes);

/** Parse a whole document. */
export function parseDocument(html: string): Element {
  const doc = parse(html);
  const root = doc.childNodes.find(isElement);
  if (!root) throw new Error("Empty HTML document");
  return root;
}

/** Parse an HTML fragment into a synthetic `<div>` wrapper. */
export function parseHtmlFragment(html: string): Element {
  const frag = parseFragment(html);
  const wrapper = {
    nodeName: "div",
    tagName: "div",
    attrs: [],
    namespaceURI: "http://www.w3.org/1999/xhtml",
    childNodes: frag.childNodes,
    parentNode: null,
    sourceCodeLocation: undefined,
  } as unknown as Element;
  for (const c of frag.childNodes) (c as { parentNode: unknown }).parentNode = wrapper;
  return wrapper;
}

export function attr(el: Element | undefined, name: string): string | undefined {
  return el?.attrs.find((a) => a.name === name)?.value;
}

export function classes(el: Element): string[] {
  return (attr(el, "class") ?? "").split(/\s+/).filter(Boolean);
}

export function hasClass(el: Element, name: string): boolean {
  return classes(el).includes(name);
}

/** Any class starting with `prefix` (e.g. `section-height--`), returning the rest. */
export function classValue(el: Element, prefix: string): string | undefined {
  const c = classes(el).find((x) => x.startsWith(prefix));
  return c ? c.slice(prefix.length) : undefined;
}

export function children(el: Node): Element[] {
  return hasChildren(el) ? el.childNodes.filter(isElement) : [];
}

/** Depth-first descendants matching `pred` (not including `el`). */
export function findAll(el: Node, pred: (e: Element) => boolean, opts: { deep?: boolean } = {}) {
  const out: Element[] = [];
  const visit = (n: Node) => {
    if (!hasChildren(n)) return;
    for (const c of n.childNodes) {
      if (!isElement(c)) continue;
      // <template> content lives in a separate fragment; parse5 keeps it in `content`.
      const tpl = (c as unknown as { content?: Node }).content;
      if (pred(c)) {
        out.push(c);
        if (opts.deep === false) continue;
      }
      visit(c);
      if (tpl) visit(tpl);
    }
  };
  visit(el);
  return out;
}

export function find(el: Node, pred: (e: Element) => boolean): Element | undefined {
  let hit: Element | undefined;
  const visit = (n: Node): boolean => {
    if (!hasChildren(n)) return false;
    for (const c of n.childNodes) {
      if (!isElement(c)) continue;
      if (pred(c)) {
        hit = c;
        return true;
      }
      if (visit(c)) return true;
    }
    return false;
  };
  visit(el);
  return hit;
}

export const byClass = (name: string) => (e: Element) => hasClass(e, name);
export const byTag =
  (...tags: string[]) =>
  (e: Element) =>
    tags.includes(e.tagName);
export const byAttr = (name: string, value?: string) => (e: Element) => {
  const v = attr(e, name);
  return value === undefined ? v !== undefined : v === value;
};

/** Closest ancestor (including `el`) matching `pred`. */
export function closest(el: Element, pred: (e: Element) => boolean): Element | undefined {
  let n: Node | null = el;
  while (n && isElement(n)) {
    if (pred(n)) return n;
    n = (n as Element).parentNode as Node | null;
  }
  return undefined;
}

const BLOCK_TAGS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr"]);

/** Text content with whitespace collapsed (block elements become spaces). */
export function text(el: Node | undefined): string {
  if (!el) return "";
  const parts: string[] = [];
  const visit = (n: Node) => {
    if ((n as DefaultTreeAdapterTypes.TextNode).nodeName === "#text") {
      parts.push((n as DefaultTreeAdapterTypes.TextNode).value);
      return;
    }
    if (isElement(n)) {
      if (n.tagName === "script" || n.tagName === "style" || n.tagName === "noscript") return;
      if (BLOCK_TAGS.has(n.tagName)) parts.push(" ");
    }
    if (hasChildren(n)) for (const c of n.childNodes) visit(c);
  };
  visit(el);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function outerHtml(el: Element): string {
  return serializeOuter(el);
}

export function innerHtml(el: Element): string {
  return el.childNodes.map((c) => serializeOuter(c as Element)).join("");
}

/** JSON in an attribute (Squarespace's `data-current-styles`, `data-block-json`), or undefined. */
export function jsonAttr<T = Record<string, unknown>>(el: Element, name: string): T | undefined {
  const raw = attr(el, name);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Text of a `<script>` element. */
export function scriptText(el: Element): string {
  return el.childNodes
    .map((c) => (c as DefaultTreeAdapterTypes.TextNode).value ?? "")
    .join("")
    .trim();
}
