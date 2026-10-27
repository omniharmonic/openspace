/**
 * Component CSS (ADR custom-components §3): parsed into a small rule tree, checked, and scoped so
 * it can only style its own component. `:scope` is the component's root; every other selector is
 * prefixed with `.os-c--<name>`; `@keyframes` are renamed per component. Pure string work, no DOM.
 */

export interface CssIssue {
  message: string;
  line: number;
}

export interface CssDecl {
  prop: string;
  value: string;
  line: number;
}

export type CssNode =
  | { t: "rule"; selectors: string[]; decls: CssDecl[]; line: number }
  | {
      t: "at";
      name: string;
      prelude: string;
      children: CssNode[] | null;
      decls?: CssDecl[];
      line: number;
    };

/** Origins `url()` may load from (fonts only). Anything else is refused. */
export const CSS_URL_ALLOWLIST = ["https://fonts.gstatic.com/"];

/** Hard size limit (lint budgets are lower). */
export const MAX_CSS_CHARS = 32_000;

const BLOCK_AT_RULES = new Set(["media", "supports", "container", "layer"]);
const FORBIDDEN_AT: Record<string, string> = {
  import: "@import can't load other stylesheets; fonts come from Site Styles",
  charset: "@charset isn't needed",
  namespace: "@namespace isn't supported",
  page: "@page isn't supported",
  property: "@property isn't supported yet",
};

class CssError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/** Parse CSS into rules and at-rules (comments removed). Throws nothing; returns issues. */
export function parseCss(src: string): { nodes: CssNode[]; issues: CssIssue[] } {
  const issues: CssIssue[] = [];
  if (src.length > MAX_CSS_CHARS)
    return {
      nodes: [],
      issues: [{ message: `The CSS is longer than ${MAX_CSS_CHARS} characters`, line: 1 }],
    };
  // Blank comments out (keeping newlines so line numbers stay right).
  const css = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  if (/\/\*/.test(css)) issues.push({ message: "A /* comment isn't closed", line: 1 });
  const lineAt = (offset: number) => {
    let n = 1;
    for (let k = 0; k < offset; k++) if (css.charCodeAt(k) === 10) n++;
    return n;
  };
  let i = 0;

  /** Read until one of `stops` at depth 0 (outside strings/parens). */
  const readUntil = (stops: string): { text: string; stop: string | null } => {
    let out = "";
    let depth = 0;
    while (i < css.length) {
      const c = css[i] as string;
      if (c === '"' || c === "'") {
        const end = css.indexOf(c, i + 1);
        if (end < 0) throw new CssError("A quoted string isn't closed", lineAt(i));
        out += css.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
      else if (depth === 0 && stops.includes(c)) {
        i++;
        return { text: out, stop: c };
      }
      out += c;
      i++;
    }
    return { text: out, stop: null };
  };

  const parseDecls = (body: string, startLine: number): CssDecl[] => {
    const decls: CssDecl[] = [];
    let line = startLine;
    for (const raw of splitTop(body, ";")) {
      const trimmed = raw.trim();
      const lines = raw.split("\n").length - 1;
      if (trimmed) {
        const colon = trimmed.indexOf(":");
        if (colon <= 0)
          issues.push({ message: `"${trimmed.slice(0, 40)}" isn't a declaration`, line });
        else {
          const prop = trimmed.slice(0, colon).trim().toLowerCase();
          const value = trimmed.slice(colon + 1).trim();
          if (!/^(--)?[a-z-]+$/.test(prop))
            issues.push({ message: `"${prop}" isn't a CSS property`, line });
          else decls.push({ prop, value, line: line + (raw.match(/^\s*\n/g)?.length ?? 0) });
        }
      }
      line += lines;
    }
    return decls;
  };

  const parseBlock = (depth: number): CssNode[] => {
    const nodes: CssNode[] = [];
    for (;;) {
      while (i < css.length && /\s/.test(css[i] as string)) i++;
      if (i >= css.length) {
        if (depth > 0) throw new CssError("A { isn't closed with }", lineAt(i - 1));
        return nodes;
      }
      if (css[i] === "}") {
        if (depth === 0) throw new CssError("There's a } without a matching {", lineAt(i));
        i++;
        return nodes;
      }
      const start = i;
      const line = lineAt(start);
      if (css[i] === "@") {
        const m = /^@([a-zA-Z-]+)/.exec(css.slice(i));
        const name = (m?.[1] ?? "").toLowerCase();
        i += (m?.[0] ?? "@").length;
        const { text: prelude, stop } = readUntil("{;");
        if (FORBIDDEN_AT[name]) {
          issues.push({ message: FORBIDDEN_AT[name] as string, line });
          if (stop === "{") skipBlock();
          continue;
        }
        if (stop !== "{") {
          issues.push({ message: `@${name} needs a { … } block`, line });
          continue;
        }
        if (BLOCK_AT_RULES.has(name)) {
          nodes.push({
            t: "at",
            name,
            prelude: prelude.trim(),
            children: parseBlock(depth + 1),
            line,
          });
        } else if (name === "keyframes" || name === "-webkit-keyframes") {
          const inner = parseBlock(depth + 1);
          nodes.push({
            t: "at",
            name: "keyframes",
            prelude: prelude.trim(),
            children: inner,
            line,
          });
        } else if (name === "font-face") {
          const { text } = readUntil("}");
          nodes.push({
            t: "at",
            name,
            prelude: "",
            children: null,
            decls: parseDecls(text, line),
            line,
          });
        } else {
          issues.push({ message: `@${name} isn't supported in component CSS`, line });
          skipBlock();
        }
        continue;
      }
      const { text: selector, stop } = readUntil("{;}");
      if (stop !== "{") {
        throw new CssError(`"${selector.trim().slice(0, 40)}" is missing its { … } block`, line);
      }
      const bodyStart = i;
      const { text: body, stop: end } = readUntil("}");
      if (end !== "}") throw new CssError("A { isn't closed with }", line);
      if (body.includes("{"))
        throw new CssError("Nested rules aren't supported; write the full selector", line);
      nodes.push({
        t: "rule",
        selectors: splitTop(selector, ",")
          .map((s) => s.trim())
          .filter(Boolean),
        decls: parseDecls(body, lineAt(bodyStart)),
        line,
      });
    }
  };
  const skipBlock = () => {
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
  };
  let nodes: CssNode[] = [];
  try {
    nodes = parseBlock(0);
  } catch (e) {
    if (e instanceof CssError) issues.push({ message: e.message, line: e.line });
    else throw e;
  }
  return { nodes, issues };
}

/** Split on `sep` outside strings, parentheses and brackets. */
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let quote: string | null = null;
  for (const c of text) {
    if (quote) {
      cur += c;
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

/** Every declaration in a tree with the at-rule preludes around it (for lint). */
export function walkDecls(
  nodes: readonly CssNode[],
  visit: (decl: CssDecl, ctx: { selectors: string[]; at: string[]; keyframes: boolean }) => void,
  at: string[] = [],
  keyframes = false,
): void {
  for (const n of nodes) {
    if (n.t === "rule")
      for (const d of n.decls) visit(d, { selectors: n.selectors, at, keyframes });
    else if (n.children)
      walkDecls(
        n.children,
        visit,
        [...at, `@${n.name} ${n.prelude}`],
        keyframes || n.name === "keyframes",
      );
    else
      for (const d of n.decls ?? [])
        visit(d, { selectors: [], at: [...at, `@${n.name}`], keyframes });
  }
}

const URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

function declIssues(d: CssDecl): string[] {
  const out: string[] = [];
  const v = d.value;
  if (/expression\s*\(|javascript:|-moz-binding/i.test(v)) out.push("Scripts can't run from CSS");
  if (d.prop === "behavior" || d.prop === "-moz-binding") out.push("Scripts can't run from CSS");
  if (/<\/?style|<\/?script|<!--/i.test(v)) out.push("CSS can't contain HTML tags");
  if (/@import/i.test(v)) out.push("@import isn't allowed");
  for (const m of v.matchAll(URL_RE)) {
    const url = (m[2] ?? "").trim();
    const ok =
      CSS_URL_ALLOWLIST.some((o) => url.startsWith(o)) ||
      /^data:image\/(?:svg\+xml|png|webp|gif|jpeg)[;,]/i.test(url);
    if (!ok)
      out.push(
        `url(${url.slice(0, 60)}) can't be loaded: images come from image fields, and only ${CSS_URL_ALLOWLIST.join(", ")} or small data: images are allowed`,
      );
  }
  if (/image-set\(|src\(/i.test(v) && !/url\(/i.test(v)) out.push("Only url() may reference files");
  return out;
}

export interface ScopedCss {
  css: string;
  issues: CssIssue[];
  /** Local keyframe names → scoped names. */
  keyframes: Record<string, string>;
}

/** The class that marks a component's root element. */
export const componentClass = (name: string) => `os-c--${name}`;

const ESCAPE_SELECTOR = /(^|[\s>+~,(])(?:html|body|:root)(?=$|[\s>+~.:#[,)])/i;

/**
 * Check and scope a component's CSS to `.os-c--<name>`. Returns the scoped stylesheet and any
 * problems (which make the definition invalid).
 */
export function scopeCss(name: string, src: string): ScopedCss {
  const scope = `.${componentClass(name)}`;
  const { nodes, issues } = parseCss(src);
  const keyframes: Record<string, string> = {};
  const collect = (list: readonly CssNode[]) => {
    for (const n of list) {
      if (n.t !== "at") continue;
      if (n.name === "keyframes") {
        const local = n.prelude.trim();
        if (!/^[a-zA-Z][\w-]*$/.test(local))
          issues.push({ message: `"${local}" isn't a keyframes name`, line: n.line });
        else keyframes[local] = `os-c-${name}-${local}`;
      } else if (n.children) collect(n.children);
    }
  };
  collect(nodes);
  const kfNames = Object.keys(keyframes);
  const renameAnimations = (d: CssDecl): string => {
    if ((d.prop === "animation" || d.prop === "animation-name") && kfNames.length)
      return d.value.replace(/[a-zA-Z_][\w-]*/g, (w) => keyframes[w] ?? w);
    return d.value;
  };
  const scopeSelector = (sel: string, line: number): string | null => {
    if (ESCAPE_SELECTOR.test(sel)) {
      issues.push({
        message: `"${sel}" styles outside the component; style :scope (the component) or its parts instead`,
        line,
      });
      return null;
    }
    if (/:host|::?slotted|::?part\(/i.test(sel)) {
      issues.push({ message: `"${sel}" isn't supported; use :scope`, line });
      return null;
    }
    if (sel.includes(":scope")) return sel.replace(/:scope/g, scope);
    return `${scope} ${sel}`;
  };
  const decl = (d: CssDecl) => {
    for (const m of declIssues(d)) issues.push({ message: m, line: d.line });
    return `${d.prop}:${renameAnimations(d)}`;
  };
  const emit = (list: readonly CssNode[], inKeyframes: boolean): string =>
    list
      .map((n) => {
        if (n.t === "rule") {
          const body = n.decls.map(decl).join(";");
          if (inKeyframes) return `${n.selectors.join(",")}{${body}}`;
          const sels = n.selectors
            .map((s) => scopeSelector(s, n.line))
            .filter((s): s is string => s !== null);
          return sels.length ? `${sels.join(",")}{${body}}` : "";
        }
        if (n.name === "keyframes")
          return `@keyframes ${keyframes[n.prelude.trim()] ?? n.prelude.trim()}{${emit(n.children ?? [], true)}}`;
        if (n.name === "font-face") {
          const decls = n.decls ?? [];
          return `@font-face{${decls.map(decl).join(";")}}`;
        }
        if (/[{}<>]/.test(n.prelude)) {
          issues.push({ message: `@${n.name} has an invalid condition`, line: n.line });
          return "";
        }
        return `@${n.name} ${n.prelude}{${emit(n.children ?? [], false)}}`;
      })
      .join("");
  const css = emit(nodes, false);
  return { css, issues, keyframes };
}
