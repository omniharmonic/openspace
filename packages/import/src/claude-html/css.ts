/**
 * A tolerant CSS reader for the pages people bring: rules, declarations (with !important),
 * at-rules (media, supports, container, layer, keyframes, font-face, import…), comments and
 * strings, and native nesting (`&`) flattened into plain rules. It never throws: what it can't
 * read is skipped.
 */

export interface Decl {
  prop: string;
  value: string;
  important: boolean;
}

export type CssNode =
  | { t: "rule"; selector: string; decls: Decl[] }
  | { t: "at"; name: string; prelude: string; children?: CssNode[]; decls?: Decl[] };

/** Split on `sep` at the top level (outside strings, parentheses and brackets). */
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quote) {
      cur += c;
      if (c === "\\" && i + 1 < text.length) {
        cur += text[++i];
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseDecl(raw: string): Decl | undefined {
  const t = raw.trim();
  const colon = t.indexOf(":");
  if (colon <= 0) return undefined;
  const prop = t.slice(0, colon).trim();
  if (!/^(?:--[\w-]+|-?[a-zA-Z][\w-]*)$/.test(prop)) return undefined;
  let value = t.slice(colon + 1).trim();
  let important = false;
  const imp = /\s*!\s*important\s*$/i.exec(value);
  if (imp) {
    important = true;
    value = value.slice(0, imp.index).trim();
  }
  if (!value && !prop.startsWith("--")) return undefined;
  return { prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value, important };
}

export function parseDecls(body: string): Decl[] {
  const out: Decl[] = [];
  for (const part of splitTop(body, ";")) {
    const d = parseDecl(part);
    if (d) out.push(d);
  }
  return out;
}

/** Join a nested selector onto its parent (`&:hover`, `& .x`, `.x &`, `.child`). */
function nestSelector(parent: string, child: string): string {
  const parents = splitTop(parent, ",").map((s) => s.trim());
  const children = splitTop(child, ",").map((s) => s.trim());
  const out: string[] = [];
  for (const p of parents)
    for (const c of children) out.push(c.includes("&") ? c.replace(/&/g, p) : `${p} ${c}`);
  return out.join(", ");
}

/** Parse a stylesheet. */
export function parseStylesheet(src: string): CssNode[] {
  const css = src.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ").replace(/<!--|-->/g, " ");
  let i = 0;

  /** Read until a top-level `;`, `{` or `}` (strings and parens respected). */
  const readStatement = (): { text: string; stop: string | null } => {
    let out = "";
    let depth = 0;
    while (i < css.length) {
      const c = css[i] as string;
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < css.length && css[j] !== c) j += css[j] === "\\" ? 2 : 1;
        out += css.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === ";" || c === "{" || c === "}")) {
        i++;
        return { text: out, stop: c };
      }
      out += c;
      i++;
    }
    return { text: out, stop: null };
  };

  /** A block's contents: nodes, plus loose declarations (nested rules' parent decls). */
  const parseBlock = (parentSelector: string | null): { nodes: CssNode[]; decls: Decl[] } => {
    const nodes: CssNode[] = [];
    const decls: Decl[] = [];
    for (;;) {
      while (i < css.length && /\s/.test(css[i] as string)) i++;
      if (i >= css.length) return { nodes, decls };
      if (css[i] === "}") {
        i++;
        return { nodes, decls };
      }
      const { text, stop } = readStatement();
      const head = text.trim();
      if (stop === "{") {
        if (head.startsWith("@")) {
          const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(head);
          const name = (m?.[1] ?? "").toLowerCase();
          const prelude = (m?.[2] ?? "").trim();
          if (
            name === "font-face" ||
            name === "page" ||
            name === "property" ||
            name === "counter-style"
          ) {
            const inner = parseBlock(null);
            nodes.push({ t: "at", name, prelude, decls: inner.decls });
          } else if (name === "keyframes" || name === "-webkit-keyframes") {
            const inner = parseBlock(null);
            nodes.push({ t: "at", name: "keyframes", prelude, children: inner.nodes });
          } else {
            const inner = parseBlock(parentSelector);
            const children = [...inner.nodes];
            if (parentSelector && inner.decls.length)
              children.unshift({ t: "rule", selector: parentSelector, decls: inner.decls });
            nodes.push({ t: "at", name, prelude, children });
          }
        } else {
          const selector = parentSelector ? nestSelector(parentSelector, head) : head;
          const inner = parseBlock(selector);
          if (inner.decls.length || !inner.nodes.length)
            nodes.push({ t: "rule", selector, decls: inner.decls });
          nodes.push(...inner.nodes);
        }
        continue;
      }
      if (head.startsWith("@")) {
        const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(head);
        if (m)
          nodes.push({
            t: "at",
            name: (m[1] as string).toLowerCase(),
            prelude: (m[2] ?? "").trim(),
          });
      } else if (head) {
        const d = parseDecl(head);
        if (d) decls.push(d);
      }
      if (stop === "}") return { nodes, decls };
      if (stop === null) return { nodes, decls };
    }
  };
  try {
    return parseBlock(null).nodes;
  } catch {
    return [];
  }
}

/** Every style rule with the at-rule preludes around it (`@media (…)`, `@supports (…)`). */
export function walkRules(
  nodes: readonly CssNode[],
  visit: (rule: Extract<CssNode, { t: "rule" }>, at: string[]) => void,
  at: string[] = [],
): void {
  for (const n of nodes) {
    if (n.t === "rule") visit(n, at);
    else if (n.children && n.name !== "keyframes")
      walkRules(n.children, visit, [...at, `@${n.name}${n.prelude ? ` ${n.prelude}` : ""}`]);
  }
}

export const declText = (d: Decl) => `${d.prop}:${d.value}${d.important ? " !important" : ""}`;

/** `url(...)` references in a value. */
export function urlsIn(value: string): string[] {
  return [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((m) => (m[2] ?? "").trim());
}

/** The `var(--name)` references in a value. */
export function varsIn(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] as string);
}
