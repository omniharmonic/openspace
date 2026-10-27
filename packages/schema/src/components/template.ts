/**
 * The custom-component template language (ADR custom-components §2): a small, logic-light,
 * Handlebars-shaped syntax over an allow-listed subset of HTML. Parsed here into an AST (pure, no
 * React) that the renderer turns into elements; there is no raw-HTML output and no JavaScript.
 *
 * ```hbs
 * <section class="hero" aria-labelledby="{{@uid}}-title">
 *   <h2 id="{{@uid}}-title">{{headline}}</h2>
 *   {{rich body class="lead"}}
 *   {{image photo sizes="50vw" aspect="4:5"}}
 *   {{#if cta}}{{button cta label=ctaLabel}}{{/if}}
 *   {{#each items}}<article style="--i: {{@index}}">{{title}}</article>{{/each}}
 * </section>
 * ```
 */

export interface TemplateIssue {
  message: string;
  /** 1-based line of the template where the problem is. */
  line: number;
}

/** A field reference: `name`, `../name` (enclosing scope) or a loop variable (`@index`). */
export type TPath =
  | { kind: "field"; up: number; name: string }
  | { kind: "special"; name: "index" | "number" | "first" | "last" | "uid" | "count" };

export type TArg = { kind: "string"; value: string } | { kind: "path"; path: TPath };

export type TCond =
  | { kind: "truthy"; path: TPath }
  | { kind: "compare"; path: TPath; op: "==" | "!="; value: string | number | boolean };

/** One piece of an attribute value. */
export type TAttrPart =
  | { kind: "text"; value: string }
  | { kind: "out"; path: TPath; fn?: "href" | "color" };

export interface TAttr {
  name: string;
  /** `true` for a bare boolean attribute (`hidden`). */
  parts: TAttrPart[] | true;
  line: number;
}

export type TNode =
  | { t: "text"; value: string }
  | { t: "out"; path: TPath; fn?: "color" | "href"; line: number }
  | { t: "el"; tag: string; attrs: TAttr[]; children: TNode[]; line: number }
  | {
      t: "helper";
      name: "rich" | "image" | "button";
      path: TPath;
      args: Record<string, TArg>;
      line: number;
    }
  | { t: "link"; path: TPath; args: Record<string, TArg>; children: TNode[]; line: number }
  | { t: "if"; cond: TCond; negate: boolean; yes: TNode[]; no: TNode[]; line: number }
  | { t: "each"; path: TPath; body: TNode[]; else: TNode[]; line: number };

// --- allow-lists ------------------------------------------------------------------------------

/** HTML elements a template may use (images and links only through helpers). */
export const TEMPLATE_TAGS = new Set([
  "div",
  "span",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "blockquote",
  "cite",
  "q",
  "em",
  "strong",
  "b",
  "i",
  "small",
  "mark",
  "br",
  "hr",
  "time",
  "abbr",
  "sup",
  "sub",
  "a",
  "button",
  "details",
  "summary",
  // Inline SVG for decoration (icons, rules, shapes).
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
]);

/** Tags refused with a specific explanation. */
const FORBIDDEN_TAGS: Record<string, string> = {
  script: "Scripts can't go in a template; put behaviour in the component's JavaScript.",
  style: "Styles can't go in a template; put them in the component's CSS.",
  img: "Use {{image field}} for pictures (it adds sizes, alt text and the focal point).",
  picture: "Use {{image field}} for pictures.",
  video: "Videos aren't supported in components yet; use a video block next to it.",
  audio: "Audio isn't supported in components; use an audio block next to it.",
  iframe: "Embedded pages can't go in a component; use an embed block.",
  form: "Forms can't go in a component; use a form block.",
  input: "Form fields can't go in a component; use a form block.",
  link: "Stylesheets and fonts come from Site Styles, not the template.",
  meta: "Meta tags can't go in a template.",
  object: "Plug-in content isn't allowed.",
  embed: "Plug-in content isn't allowed.",
  template: "Nested templates aren't supported.",
  slot: "Slots aren't supported; use fields.",
  base: "Base tags aren't allowed.",
  use: "SVG <use> isn't allowed (it can load other files).",
  foreignobject: "SVG foreignObject isn't allowed.",
  main: "The page already has a main area; use <section> or <div>.",
};

const VOID_TAGS = new Set(["br", "hr"]);

const GLOBAL_ATTRS = new Set(["class", "role", "title", "lang", "dir", "hidden", "tabindex"]);
const TAG_ATTRS: Record<string, readonly string[]> = {
  a: ["href", "rel"],
  button: ["type"],
  details: ["open"],
  time: ["datetime"],
  abbr: [],
  ol: ["start", "reversed"],
  li: ["value"],
  blockquote: ["cite"],
  q: ["cite"],
};
/** SVG presentation attributes (kebab-case as written in markup). */
export const SVG_ATTRS = new Set([
  "viewbox",
  "xmlns",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "fill-rule",
  "clip-rule",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "transform",
  "focusable",
  "preserveaspectratio",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "vector-effect",
  "pathlength",
]);
const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
]);

/** Max template size in characters (hard limit; lint budgets are lower). */
export const MAX_TEMPLATE_CHARS = 48_000;
/** Max element nesting depth. */
const MAX_DEPTH = 40;

// --- entities -----------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
  times: "×",
  rarr: "→",
  larr: "←",
  copy: "©",
  reg: "®",
  trade: "™",
  shy: "­",
  thinsp: " ",
};

/** Decode HTML entities in literal template text (React escapes it again on output). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, (m, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const n = Number.parseInt(code.slice(2), 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    if (code.startsWith("#")) {
      const n = Number.parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code] ?? m;
  });
}

// --- parser -------------------------------------------------------------------------------------

const SPECIALS = new Set(["index", "number", "first", "last", "uid", "count"]);
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

function parsePath(raw: string, line: number): TPath {
  const s = raw.trim();
  if (s.startsWith("@")) {
    const name = s.slice(1);
    if (!SPECIALS.has(name))
      throw new ParseError(
        `"${s}" isn't a loop value; use @index, @number, @first, @last, @count or @uid`,
        line,
      );
    return { kind: "special", name: name as Extract<TPath, { kind: "special" }>["name"] };
  }
  let rest = s;
  let up = 0;
  while (rest.startsWith("../")) {
    up++;
    rest = rest.slice(3);
  }
  if (rest === "this")
    throw new ParseError("Use the item's field names inside {{#each}} instead of this", line);
  if (!NAME_RE.test(rest))
    throw new ParseError(`"${s}" isn't a field name (letters and digits, like headline)`, line);
  return { kind: "field", up, name: rest };
}

/** Split mustache contents into words, keeping quoted strings together. */
function words(src: string, line: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    let j = i;
    let word = "";
    while (j < src.length && !/\s/.test(src[j] as string)) {
      const c = src[j] as string;
      if (c === '"' || c === "'") {
        const end = src.indexOf(c, j + 1);
        if (end < 0) throw new ParseError("A quoted value isn't closed", line);
        word += src.slice(j, end + 1);
        j = end + 1;
      } else {
        word += c;
        j++;
      }
    }
    out.push(word);
    i = j;
  }
  return out;
}

const unquote = (w: string): string | null =>
  (w.startsWith('"') && w.endsWith('"')) || (w.startsWith("'") && w.endsWith("'"))
    ? w.slice(1, -1)
    : null;

function parseArgs(ws: string[], line: number): Record<string, TArg> {
  const args: Record<string, TArg> = {};
  for (const w of ws) {
    const eq = w.indexOf("=");
    if (eq <= 0) throw new ParseError(`Expected name="value" but found "${w}"`, line);
    const key = w.slice(0, eq);
    const raw = w.slice(eq + 1);
    if (!/^[a-zA-Z][a-zA-Z-]*$/.test(key)) throw new ParseError(`Bad option name "${key}"`, line);
    const str = unquote(raw);
    args[key] =
      str !== null
        ? { kind: "string", value: str }
        : /^-?\d+(\.\d+)?$/.test(raw)
          ? { kind: "string", value: raw }
          : { kind: "path", path: parsePath(raw, line) };
  }
  return args;
}

function parseCond(ws: string[], line: number): TCond {
  if (ws.length === 1) return { kind: "truthy", path: parsePath(ws[0] as string, line) };
  if (ws.length === 3 && (ws[1] === "==" || ws[1] === "!=")) {
    const raw = ws[2] as string;
    const str = unquote(raw);
    const value: string | number | boolean =
      str !== null
        ? str
        : raw === "true"
          ? true
          : raw === "false"
            ? false
            : /^-?\d+(\.\d+)?$/.test(raw)
              ? Number(raw)
              : Number.NaN;
    if (typeof value === "number" && Number.isNaN(value))
      throw new ParseError(`Compare with a quoted value, a number, true or false`, line);
    return { kind: "compare", path: parsePath(ws[0] as string, line), op: ws[1], value };
  }
  throw new ParseError('Conditions are a field, or field == "value" / field != "value"', line);
}

type Frame =
  | { kind: "root"; children: TNode[] }
  | { kind: "el"; node: Extract<TNode, { t: "el" }>; children: TNode[] }
  | { kind: "if"; node: Extract<TNode, { t: "if" }>; children: TNode[]; inElse: boolean }
  | { kind: "each"; node: Extract<TNode, { t: "each" }>; children: TNode[]; inElse: boolean }
  | { kind: "link"; node: Extract<TNode, { t: "link" }>; children: TNode[] };

function parseAttrValue(value: string, line: number): TAttrPart[] {
  const parts: TAttrPart[] = [];
  let i = 0;
  while (i < value.length) {
    const open = value.indexOf("{{", i);
    if (open < 0) {
      parts.push({ kind: "text", value: decodeEntities(value.slice(i)) });
      break;
    }
    if (open > i) parts.push({ kind: "text", value: decodeEntities(value.slice(i, open)) });
    const close = value.indexOf("}}", open + 2);
    if (close < 0) throw new ParseError("A {{ in an attribute isn't closed with }}", line);
    const inner = value.slice(open + 2, close).trim();
    if (inner.startsWith("{")) throw new ParseError("Raw output {{{ }}} isn't allowed", line);
    if (/^[#/!]|^else$/.test(inner))
      throw new ParseError(
        "Blocks like {{#if}} can't go inside an attribute; use a data- attribute and CSS instead",
        line,
      );
    const ws = words(inner, line);
    const head = ws[0] ?? "";
    if (head === "href" || head === "color") {
      if (ws.length !== 2) throw new ParseError(`Use {{${head} fieldName}}`, line);
      parts.push({ kind: "out", path: parsePath(ws[1] as string, line), fn: head });
    } else if (ws.length === 1) parts.push({ kind: "out", path: parsePath(head, line) });
    else throw new ParseError(`"{{${inner}}}" can't be used inside an attribute`, line);
    i = close + 2;
  }
  return parts;
}

/**
 * Parse a component template. Returns the AST and any syntax errors (with line numbers). Field
 * references are checked separately against the definition's fields (`checkTemplate`).
 */
export function parseTemplate(src: string): { nodes: TNode[]; errors: TemplateIssue[] } {
  const errors: TemplateIssue[] = [];
  if (src.length > MAX_TEMPLATE_CHARS)
    return {
      nodes: [],
      errors: [
        { message: `The template is longer than ${MAX_TEMPLATE_CHARS} characters`, line: 1 },
      ],
    };
  const lineAt = (offset: number) => {
    let n = 1;
    for (let k = 0; k < offset && k < src.length; k++) if (src.charCodeAt(k) === 10) n++;
    return n;
  };
  const root: Frame = { kind: "root", children: [] };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1] as Frame;
  const push = (node: TNode) => {
    top().children.push(node);
  };
  const pushText = (raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw.replace(/\s*\n\s*/g, " "));
    if (text) push({ t: "text", value: text });
  };
  let i = 0;
  try {
    while (i < src.length) {
      const nextTag = src.indexOf("<", i);
      const nextMustache = src.indexOf("{{", i);
      const next = [nextTag, nextMustache].filter((n) => n >= 0).sort((a, b) => a - b)[0];
      if (next === undefined) {
        pushText(src.slice(i));
        break;
      }
      pushText(src.slice(i, next));
      i = next;
      const line = lineAt(i);
      if (src.startsWith("{{", i)) {
        if (src.startsWith("{{{", i))
          throw new ParseError("Raw output {{{ }}} isn't allowed: text is always escaped", line);
        const close = src.indexOf("}}", i + 2);
        if (close < 0) throw new ParseError("{{ isn't closed with }}", line);
        const inner = src.slice(i + 2, close).trim();
        i = close + 2;
        if (inner.startsWith("!")) continue;
        handleMustache(inner, line);
        continue;
      }
      // "<"
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        if (end < 0) throw new ParseError("An HTML comment isn't closed", line);
        i = end + 3;
        continue;
      }
      if (src.startsWith("</", i)) {
        const end = src.indexOf(">", i);
        if (end < 0) throw new ParseError("A closing tag isn't finished with >", line);
        const tag = src
          .slice(i + 2, end)
          .trim()
          .toLowerCase();
        const f = top();
        if (f.kind !== "el" || f.node.tag !== tag)
          throw new ParseError(
            f.kind === "el"
              ? `</${tag}> closes <${f.node.tag}> (opened on line ${f.node.line})`
              : f.kind === "root"
                ? `</${tag}> has no matching <${tag}>`
                : `</${tag}> appears before {{/${f.kind}}}`,
            line,
          );
        stack.pop();
        i = end + 1;
        continue;
      }
      const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(src.slice(i));
      if (!m) {
        // A literal "<" in text.
        pushText("<");
        i++;
        continue;
      }
      const tag = (m[1] as string).toLowerCase();
      if (FORBIDDEN_TAGS[tag]) throw new ParseError(`<${tag}>: ${FORBIDDEN_TAGS[tag]}`, line);
      if (!TEMPLATE_TAGS.has(tag))
        throw new ParseError(`<${tag}> isn't one of the elements a component can use`, line);
      i += m[0].length;
      const attrs: TAttr[] = [];
      let selfClose = false;
      for (;;) {
        while (i < src.length && /\s/.test(src[i] as string)) i++;
        if (i >= src.length) throw new ParseError(`<${tag}> isn't finished with >`, line);
        if (src.startsWith("/>", i)) {
          selfClose = true;
          i += 2;
          break;
        }
        if (src[i] === ">") {
          i++;
          break;
        }
        if (src.startsWith("{{", i))
          throw new ParseError(
            "Template tags can't add attributes; put {{…}} inside an attribute value",
            lineAt(i),
          );
        const an = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*/.exec(src.slice(i));
        if (!an) throw new ParseError(`Unexpected "${src[i]}" in <${tag}>`, lineAt(i));
        const name = (an[0] as string).toLowerCase();
        const attrLine = lineAt(i);
        i += an[0].length;
        while (i < src.length && /\s/.test(src[i] as string)) i++;
        if (src[i] !== "=") {
          attrs.push({ name, parts: true, line: attrLine });
          continue;
        }
        i++;
        while (i < src.length && /\s/.test(src[i] as string)) i++;
        const q = src[i];
        let value: string;
        if (q === '"' || q === "'") {
          // Skip over {{…}} so quotes inside template tags don't end the value.
          let j = i + 1;
          while (j < src.length && src[j] !== q) {
            if (src.startsWith("{{", j)) {
              const c = src.indexOf("}}", j + 2);
              j = c < 0 ? src.length : c + 2;
            } else j++;
          }
          if (j >= src.length) throw new ParseError(`The ${name} value isn't closed`, attrLine);
          value = src.slice(i + 1, j);
          i = j + 1;
        } else {
          const u = /^[^\s>"'=<`]+/.exec(src.slice(i));
          if (!u) throw new ParseError(`The ${name} attribute has no value`, attrLine);
          value = u[0];
          i += value.length;
        }
        attrs.push({ name, parts: parseAttrValue(value, attrLine), line: attrLine });
      }
      const node: Extract<TNode, { t: "el" }> = { t: "el", tag, attrs, children: [], line };
      push(node);
      if (!selfClose && !VOID_TAGS.has(tag)) {
        if (stack.length > MAX_DEPTH) throw new ParseError("Elements are nested too deeply", line);
        stack.push({ kind: "el", node, children: node.children });
      }
    }
    const open = top();
    if (open.kind === "el")
      throw new ParseError(`<${open.node.tag}> is never closed`, open.node.line);
    if (open.kind !== "root")
      throw new ParseError(
        `{{#${open.kind}}} is never closed with {{/${open.kind}}}`,
        open.node.line,
      );
  } catch (e) {
    if (e instanceof ParseError) errors.push({ message: e.message, line: e.line });
    else throw e;
  }
  return { nodes: errors.length ? [] : root.children, errors };

  function handleMustache(inner: string, line: number) {
    if (inner === "else") {
      const f = top();
      if ((f.kind !== "if" && f.kind !== "each") || f.inElse)
        throw new ParseError("{{else}} must be inside {{#if}} or {{#each}}", line);
      f.inElse = true;
      f.children = f.kind === "if" ? f.node.no : f.node.else;
      return;
    }
    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim();
      const f = top();
      const kind = name === "unless" ? "if" : name;
      if (f.kind !== kind || (f.kind === "if" && f.node.negate !== (name === "unless")))
        throw new ParseError(
          f.kind === "el"
            ? `{{/${name}}} appears before </${f.node.tag}> (opened on line ${f.node.line})`
            : `{{/${name}}} has no matching {{#${name}}}`,
          line,
        );
      stack.pop();
      return;
    }
    const ws = words(inner, line);
    const head = ws[0] ?? "";
    if (head.startsWith("#")) {
      const kind = head.slice(1);
      if (kind === "if" || kind === "unless") {
        const node: Extract<TNode, { t: "if" }> = {
          t: "if",
          cond: parseCond(ws.slice(1), line),
          negate: kind === "unless",
          yes: [],
          no: [],
          line,
        };
        push(node);
        stack.push({ kind: "if", node, children: node.yes, inElse: false });
        return;
      }
      if (kind === "each") {
        if (ws.length !== 2) throw new ParseError("Use {{#each listField}}", line);
        const node: Extract<TNode, { t: "each" }> = {
          t: "each",
          path: parsePath(ws[1] as string, line),
          body: [],
          else: [],
          line,
        };
        push(node);
        stack.push({ kind: "each", node, children: node.body, inElse: false });
        return;
      }
      if (kind === "link") {
        if (ws.length < 2) throw new ParseError("Use {{#link linkField}}…{{/link}}", line);
        const node: Extract<TNode, { t: "link" }> = {
          t: "link",
          path: parsePath(ws[1] as string, line),
          args: parseArgs(ws.slice(2), line),
          children: [],
          line,
        };
        push(node);
        stack.push({ kind: "link", node, children: node.children });
        return;
      }
      throw new ParseError(`{{${head}}} isn't a block; use #if, #unless, #each or #link`, line);
    }
    if (head === "rich" || head === "image" || head === "button") {
      if (ws.length < 2) throw new ParseError(`Use {{${head} fieldName}}`, line);
      push({
        t: "helper",
        name: head,
        path: parsePath(ws[1] as string, line),
        args: parseArgs(ws.slice(2), line),
        line,
      });
      return;
    }
    if (head === "href" || head === "color") {
      if (ws.length !== 2) throw new ParseError(`Use {{${head} fieldName}}`, line);
      push({ t: "out", path: parsePath(ws[1] as string, line), fn: head, line });
      return;
    }
    if (ws.length !== 1)
      throw new ParseError(
        `"{{${inner}}}" isn't something a template understands (helpers: rich, image, button, href, color)`,
        line,
      );
    push({ t: "out", path: parsePath(head, line), line });
  }
}

// --- checks against fields ------------------------------------------------------------------------

/** The field kinds a template needs to know about (a subset of `FieldMeta`). */
export interface TemplateField {
  kind: string;
  fields?: Record<string, TemplateField>;
}

export interface TemplateCheck {
  errors: TemplateIssue[];
  /** Top-level field names the template uses (lint warns about fields that are never shown). */
  used: Set<string>;
  /** Headings the template writes (`h1`–`h6` levels, in order). */
  headings: number[];
}

const HELPER_KIND: Record<string, string> = {
  rich: "richText",
  image: "image",
  button: "link",
};

const SAFE_HREF = /^(?:#[\w-]*|\/(?!\/)[^\s]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d\s()-]+)$/;
const URL_ATTRS = new Set(["href", "cite"]);

/** Check a parsed template against the definition's fields and the attribute rules. */
export function checkTemplate(
  nodes: readonly TNode[],
  fields: Record<string, TemplateField>,
): TemplateCheck {
  const errors: TemplateIssue[] = [];
  const used = new Set<string>();
  const headings: number[] = [];
  const err = (message: string, line: number) => errors.push({ message, line });

  const resolve = (
    path: TPath,
    scopes: Record<string, TemplateField>[],
    line: number,
    inLoop: boolean,
  ): TemplateField | "special" | undefined => {
    if (path.kind === "special") {
      if (path.name !== "uid" && !inLoop) err(`@${path.name} only works inside {{#each}}`, line);
      return "special";
    }
    const scope = scopes[scopes.length - 1 - path.up];
    if (!scope) {
      err(`"${"../".repeat(path.up)}${path.name}" goes above the component's fields`, line);
      return undefined;
    }
    const f = scope[path.name];
    if (!f) {
      err(
        `There's no field called "${path.name}"${scopes.length - path.up > 1 ? " in this list item" : ""}`,
        line,
      );
      return undefined;
    }
    if (scopes.length - 1 - path.up === 0) used.add(path.name);
    return f;
  };

  const walk = (
    list: readonly TNode[],
    scopes: Record<string, TemplateField>[],
    inLoop: boolean,
    ctx: { inLink: boolean; inInteractive: boolean },
  ) => {
    for (const n of list) {
      switch (n.t) {
        case "text":
          break;
        case "out": {
          const f = resolve(n.path, scopes, n.line, inLoop);
          if (f && f !== "special") {
            if (n.fn === "href") err("{{href}} only works inside an href attribute", n.line);
            if (n.fn === "color" && f.kind !== "color")
              err(
                `{{color ${n.path.kind === "field" ? n.path.name : ""}}} needs a color field`,
                n.line,
              );
            if (!n.fn && (f.kind === "list" || f.kind === "link"))
              err(
                f.kind === "list"
                  ? "A list can't be printed directly; loop over it with {{#each}}"
                  : "A link can't be printed directly; use {{button}} or {{#link}}",
                n.line,
              );
          }
          break;
        }
        case "helper": {
          const f = resolve(n.path, scopes, n.line, inLoop);
          const want = HELPER_KIND[n.name] as string;
          if (f === "special") err(`{{${n.name}}} needs a field, not a loop value`, n.line);
          else if (f && f.kind !== want)
            err(
              `{{${n.name}}} needs a ${want === "richText" ? "rich text" : want} field, but "${n.path.kind === "field" ? n.path.name : ""}" is ${f.kind}`,
              n.line,
            );
          for (const [k, a] of Object.entries(n.args)) {
            if (a.kind === "path") {
              const af = resolve(a.path, scopes, n.line, inLoop);
              if (
                n.name === "button" &&
                k === "label" &&
                af &&
                af !== "special" &&
                af.kind !== "text"
              )
                err("A button label must be a text field", n.line);
            }
          }
          const allowed: Record<string, string[]> = {
            rich: ["class"],
            image: ["class", "sizes", "loading", "aspect", "fit", "treatment"],
            button: ["class", "label", "variant"],
          };
          for (const k of Object.keys(n.args))
            if (!allowed[n.name]?.includes(k))
              err(
                `{{${n.name}}} has no "${k}" option (options: ${allowed[n.name]?.join(", ")})`,
                n.line,
              );
          const lit = (k: string) => {
            const a = n.args[k];
            return a?.kind === "string" ? a.value : undefined;
          };
          if (n.name === "image") {
            const loading = lit("loading");
            if (loading !== undefined && loading !== "eager" && loading !== "lazy")
              err('loading is "eager" or "lazy"', n.line);
            const aspect = lit("aspect");
            if (aspect !== undefined && !/^(?:original|[1-9]\d{0,2}:[1-9]\d{0,2})$/.test(aspect))
              err('aspect is a ratio like "4:5" or "original"', n.line);
            const fit = lit("fit");
            if (fit !== undefined && fit !== "cover" && fit !== "contain")
              err('fit is "cover" or "contain"', n.line);
          }
          if (n.name === "button") {
            const v = lit("variant");
            if (v !== undefined && !["primary", "secondary", "tertiary"].includes(v))
              err('variant is "primary", "secondary" or "tertiary"', n.line);
            if (ctx.inLink || ctx.inInteractive)
              err("A button can't be inside a link or another button", n.line);
            if (!n.args.label) err("A button needs a label, like label=ctaLabel", n.line);
          }
          if (n.name === "rich" && n.args.class?.kind === "path")
            err("class must be quoted text", n.line);
          break;
        }
        case "link": {
          const f = resolve(n.path, scopes, n.line, inLoop);
          if (f && f !== "special" && f.kind !== "link")
            err("{{#link}} needs a link field", n.line);
          for (const k of Object.keys(n.args))
            if (k !== "class") err(`{{#link}} only takes a class option`, n.line);
          if (ctx.inLink || ctx.inInteractive)
            err("A link can't be inside another link or a button", n.line);
          walk(n.children, scopes, inLoop, { inLink: true, inInteractive: ctx.inInteractive });
          break;
        }
        case "if": {
          resolve(n.cond.path, scopes, n.line, inLoop);
          walk(n.yes, scopes, inLoop, ctx);
          walk(n.no, scopes, inLoop, ctx);
          break;
        }
        case "each": {
          const f = resolve(n.path, scopes, n.line, inLoop);
          if (f && f !== "special" && f.kind !== "list") {
            err("{{#each}} needs a list field", n.line);
            break;
          }
          const inner = f && f !== "special" ? (f.fields ?? {}) : {};
          walk(n.body, [...scopes, inner], true, ctx);
          walk(n.else, scopes, inLoop, ctx);
          break;
        }
        case "el": {
          const h = /^h([1-6])$/.exec(n.tag);
          if (h) headings.push(Number(h[1]));
          const isSvg = SVG_TAGS.has(n.tag);
          for (const a of n.attrs) checkAttr(n.tag, isSvg, a, scopes, inLoop, ctx);
          const interactive = n.tag === "a" || n.tag === "button" || n.tag === "summary";
          if (interactive && (ctx.inLink || ctx.inInteractive))
            err(`<${n.tag}> can't be inside a link or a button`, n.line);
          if (n.tag === "a" && !n.attrs.some((a) => a.name === "href"))
            err("<a> needs an href (or use {{#link field}})", n.line);
          if (n.tag === "button" && !n.attrs.some((a) => a.name === "type"))
            err('<button> needs type="button"', n.line);
          walk(n.children, scopes, inLoop, {
            inLink: ctx.inLink || n.tag === "a",
            inInteractive: ctx.inInteractive || n.tag === "button" || n.tag === "summary",
          });
          break;
        }
      }
    }
  };

  const checkAttr = (
    tag: string,
    isSvg: boolean,
    a: TAttr,
    scopes: Record<string, TemplateField>[],
    inLoop: boolean,
    _ctx: { inLink: boolean; inInteractive: boolean },
  ) => {
    const name = a.name;
    const allowed =
      GLOBAL_ATTRS.has(name) ||
      name === "id" ||
      name === "style" ||
      (name.startsWith("aria-") && /^aria-[a-z]+$/.test(name)) ||
      (name.startsWith("data-") && /^data-[a-z0-9-]+$/.test(name)) ||
      (TAG_ATTRS[tag]?.includes(name) ?? false) ||
      (isSvg && SVG_ATTRS.has(name));
    if (name.startsWith("on")) {
      err(`${name}: event handlers aren't allowed; use the component's JavaScript`, a.line);
      return;
    }
    if (name.startsWith("data-os")) {
      err(`${name}: data-os- attributes are reserved for OpenSpace`, a.line);
      return;
    }
    if (!allowed) {
      err(`<${tag}> can't have a "${name}" attribute`, a.line);
      return;
    }
    if (a.parts === true) {
      if (!["hidden", "open", "reversed"].includes(name) && !name.startsWith("data-"))
        err(`${name} needs a value`, a.line);
      return;
    }
    const parts = a.parts;
    for (const p of parts) {
      if (p.kind !== "out") continue;
      const f = resolve(p.path, scopes, a.line, inLoop);
      if (!f) continue;
      if (p.fn === "href") {
        if (name !== "href") err("{{href}} only works in href", a.line);
        else if (f !== "special" && f.kind !== "link") err("{{href}} needs a link field", a.line);
      } else if (p.fn === "color") {
        if (f === "special" || f.kind !== "color") err("{{color}} needs a color field", a.line);
      } else if (f !== "special" && (f.kind === "list" || f.kind === "link" || f.kind === "image"))
        err(
          f.kind === "link"
            ? `Use {{href ${p.path.kind === "field" ? p.path.name : ""}}} for a link in an attribute`
            : `A ${f.kind} field can't go in an attribute`,
          a.line,
        );
    }
    const literal = parts.every((p) => p.kind === "text");
    const text = parts.map((p) => (p.kind === "text" ? p.value : "")).join("");
    if (URL_ATTRS.has(name)) {
      const hrefOut = parts.filter((p) => p.kind === "out");
      if (literal) {
        if (!SAFE_HREF.test(text.trim()))
          err(
            `${name} must be a link field ({{href field}}), "#section", "/page" or an https:// address`,
            a.line,
          );
      } else if (!(parts.length === 1 && hrefOut[0]?.kind === "out" && hrefOut[0].fn === "href"))
        err(`${name} must be exactly {{href field}} or a fixed address`, a.line);
    } else if (parts.some((p) => p.kind === "out" && p.fn === "href"))
      err("{{href}} only works in href", a.line);
    if (
      name === "id" &&
      !parts.some((p) => p.kind === "out" && p.path.kind === "special" && p.path.name === "uid")
    )
      err(
        'ids must include {{@uid}} (a component can appear twice on a page), e.g. id="{{@uid}}-title"',
        a.line,
      );
    if (name === "tabindex" && literal && !/^(?:0|-1)$/.test(text.trim()))
      err("tabindex is 0 or -1 (positive values break keyboard order)", a.line);
    if (name === "type" && tag === "button" && text !== "button")
      err('Buttons in a component are type="button" (forms belong in a form block)', a.line);
    if (name === "style") {
      // Only custom properties: `--x: value; --y: {{field}}`.
      const raw = parts
        .map((p) => (p.kind === "text" ? p.value : "0"))
        .join("")
        .trim();
      for (const decl of raw
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)) {
        if (!/^--[a-zA-Z0-9-]+\s*:/.test(decl))
          err(
            'style may only set custom properties like "--delay: 2" (put real styles in the CSS)',
            a.line,
          );
        if (/url\(|expression\(|@import|[{}<>\\]/i.test(decl))
          err("style values can't load files or contain { } < >", a.line);
      }
    }
    if (isSvg && literal && /url\(|javascript:/i.test(text))
      err(`${name} can't reference other files`, a.line);
  };

  walk(nodes, [fields], false, { inLink: false, inInteractive: false });
  return { errors, used, headings };
}

// --- expansion ------------------------------------------------------------------------------------

/** An attribute value after expansion: text, or a link to resolve (`{{href field}}`). */
export type XAttr = string | true | { link: unknown };

/** An expanded template node, ready for the renderer (pure data). */
export type XNode =
  | string
  | {
      k: "el";
      tag: string;
      attrs: Record<string, XAttr>;
      /** Custom properties from `style`. */
      style?: Record<string, string>;
      children: XNode[];
    }
  | { k: "rich"; doc: unknown; className?: string }
  | {
      k: "image";
      value: unknown;
      className?: string;
      sizes?: string;
      loading?: "eager" | "lazy";
      aspect?: string;
      fit?: "cover" | "contain";
      treatment?: string;
    }
  | { k: "button"; link: unknown; label: string; variant: string; className?: string }
  | { k: "link"; link: unknown; className?: string; children: XNode[] };

export interface ExpandOptions {
  /** Per-instance id prefix for `{{@uid}}` (the block id). */
  uid: string;
  /** Plain text of a rich-text value (for `{{richField}}` and conditions). */
  plainText: (doc: unknown) => string;
}

interface Scope {
  values: Record<string, unknown>;
  index?: number;
  count?: number;
}

/** Sanitize text going into a custom property value. */
function cssValue(v: string): string {
  return v
    .replace(/url\(|expression\(|@import/gi, "")
    .replace(/[;{}<>\\"]/g, "")
    .slice(0, 200);
}

/** Sanitize text going into a class attribute. */
const classValue = (v: string) => v.replace(/[^a-zA-Z0-9_ -]/g, "").slice(0, 200);

const isRich = (v: unknown): boolean =>
  !!v && typeof v === "object" && (v as { type?: unknown }).type === "doc";

/**
 * Expand a template with field values into plain element data. Values pass through by reference
 * (rich text and images keep their identity so Studio can find the field being edited).
 */
export function expandTemplate(
  nodes: readonly TNode[],
  values: Record<string, unknown>,
  opts: ExpandOptions,
): XNode[] {
  const lookup = (path: TPath, scopes: Scope[]): unknown => {
    if (path.kind === "special") {
      const s = scopes[scopes.length - 1] as Scope;
      switch (path.name) {
        case "uid":
          return opts.uid;
        case "index":
          return s.index ?? 0;
        case "number":
          return (s.index ?? 0) + 1;
        case "first":
          return s.index === 0;
        case "last":
          return s.index !== undefined && s.count !== undefined && s.index === s.count - 1;
        case "count":
          return s.count ?? 0;
      }
    }
    const scope = scopes[scopes.length - 1 - path.up];
    return scope?.values[path.name];
  };
  const truthy = (v: unknown): boolean => {
    if (v === undefined || v === null || v === false || v === "" || v === 0) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (isRich(v)) return opts.plainText(v).trim().length > 0;
    return true;
  };
  const text = (v: unknown): string => {
    if (v === undefined || v === null || v === false) return "";
    if (v === true) return "true";
    if (typeof v === "string") return v;
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    if (isRich(v)) return opts.plainText(v);
    if (typeof v === "object" && typeof (v as { alt?: unknown }).alt === "string")
      return (v as { alt: string }).alt;
    return "";
  };
  const colorVar = (v: unknown) =>
    typeof v === "string" && /^[a-z]+(?:-[a-z0-9]+)*$/.test(v) ? `var(--os-color-${v})` : "";
  const argText = (a: TArg | undefined, scopes: Scope[]): string | undefined =>
    a === undefined ? undefined : a.kind === "string" ? a.value : text(lookup(a.path, scopes));

  const walk = (list: readonly TNode[], scopes: Scope[]): XNode[] => {
    const out: XNode[] = [];
    for (const n of list) {
      switch (n.t) {
        case "text":
          out.push(n.value);
          break;
        case "out": {
          const v = lookup(n.path, scopes);
          const s = n.fn === "color" ? colorVar(v) : text(v);
          if (s) out.push(s);
          break;
        }
        case "helper": {
          const v = lookup(n.path, scopes);
          const cls = argText(n.args.class, scopes);
          if (n.name === "rich") {
            if (isRich(v))
              out.push({ k: "rich", doc: v, ...(cls ? { className: classValue(cls) } : {}) });
          } else if (n.name === "image") {
            if (v && typeof v === "object" && typeof (v as { src?: unknown }).src === "string") {
              const loading = argText(n.args.loading, scopes);
              const fit = argText(n.args.fit, scopes);
              const node: XNode = { k: "image", value: v };
              if (cls) node.className = classValue(cls);
              const sizes = argText(n.args.sizes, scopes);
              if (sizes) node.sizes = sizes.replace(/[^\w\s(),.:%-]/g, "");
              if (loading === "eager" || loading === "lazy") node.loading = loading;
              const aspect = argText(n.args.aspect, scopes);
              if (aspect) node.aspect = aspect;
              if (fit === "cover" || fit === "contain") node.fit = fit;
              const treatment = argText(n.args.treatment, scopes);
              if (treatment) node.treatment = treatment;
              out.push(node);
            }
          } else {
            const label = argText(n.args.label, scopes) ?? "";
            if (v && label.trim())
              out.push({
                k: "button",
                link: v,
                label,
                variant: argText(n.args.variant, scopes) ?? "primary",
                ...(cls ? { className: classValue(cls) } : {}),
              });
          }
          break;
        }
        case "link": {
          const v = lookup(n.path, scopes);
          const children = walk(n.children, scopes);
          const cls = argText(n.args.class, scopes);
          if (v)
            out.push({
              k: "link",
              link: v,
              ...(cls ? { className: classValue(cls) } : {}),
              children,
            });
          else out.push(...children);
          break;
        }
        case "if": {
          const v = lookup(n.cond.path, scopes);
          let ok =
            n.cond.kind === "truthy"
              ? truthy(v)
              : n.cond.op === "=="
                ? v === n.cond.value || (v === undefined && n.cond.value === false)
                : !(v === n.cond.value || (v === undefined && n.cond.value === false));
          if (n.negate) ok = !ok;
          out.push(...walk(ok ? n.yes : n.no, scopes));
          break;
        }
        case "each": {
          const v = lookup(n.path, scopes);
          const items = Array.isArray(v) ? v : [];
          if (!items.length) {
            out.push(...walk(n.else, scopes));
            break;
          }
          items.forEach((item, index) => {
            const values =
              item && typeof item === "object" && !Array.isArray(item)
                ? (item as Record<string, unknown>)
                : {};
            out.push(...walk(n.body, [...scopes, { values, index, count: items.length }]));
          });
          break;
        }
        case "el": {
          const attrs: Record<string, XAttr> = {};
          let style: Record<string, string> | undefined;
          for (const a of n.attrs) {
            if (a.parts === true) {
              attrs[a.name] = true;
              continue;
            }
            const single = a.parts.length === 1 ? a.parts[0] : undefined;
            if (single?.kind === "out" && single.fn === "href") {
              const link = lookup(single.path, scopes);
              if (link) attrs[a.name] = { link };
              continue;
            }
            const value = a.parts
              .map((p) => {
                if (p.kind === "text") return p.value;
                const v = lookup(p.path, scopes);
                if (p.fn === "color") return colorVar(v);
                const s = text(v);
                if (a.name === "style") return cssValue(s);
                if (a.name === "class") return classValue(s);
                return s;
              })
              .join("");
            if (a.name === "style") {
              style = {};
              for (const decl of value.split(";")) {
                const m = /^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.*?)\s*$/.exec(decl);
                if (m?.[2]) style[m[1] as string] = m[2];
              }
            } else attrs[a.name] = value;
          }
          const el: XNode = { k: "el", tag: n.tag, attrs, children: walk(n.children, scopes) };
          if (style && Object.keys(style).length) el.style = style;
          out.push(el);
          break;
        }
      }
    }
    return out;
  };
  return walk(nodes, [{ values }]);
}
