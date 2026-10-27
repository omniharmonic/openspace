/**
 * One section of a page someone brought → a custom component (ADR custom-components): its
 * markup becomes a logic-light template in which every word, picture and link is a typed field
 * (repeated cards become a list), its CSS is the page's own rules that style it — cut down to the
 * section, rewritten onto the site's theme tokens where the colours and fonts match — and
 * pictures (including CSS backgrounds) are carried across at full quality as image fields.
 */
import type {
  ComponentDefinition,
  ComponentFieldSpec,
  ImageValue,
  Link,
} from "@omniharmonic/openspace-schema";
import { checkComponent, describeComponentIssues } from "@omniharmonic/openspace-schema";
import { attr, classes, type Element, isElement, type Node } from "../dom";
import { htmlToRichText } from "../map/richtext";
import type { SqNotice } from "../types";
import { type Decl, declText, splitTop, urlsIn, varsIn } from "./css";
import {
  cmpSpec,
  elementsIn,
  makeScope,
  matchesIn,
  type ParsedSelector,
  parseSelectorList,
  type Scope,
  type Selector,
  scopedTail,
  selectorText,
  specificity,
} from "./select";

// --- inputs --------------------------------------------------------------------------------------

/** A style rule of the page, parsed once. */
export interface SourceRule {
  selectors: ParsedSelector[];
  decls: Decl[];
  /** At-rule preludes around it (`@media (max-width: 760px)`). */
  at: string[];
  order: number;
}

export interface TokenMaps {
  /** `#rrggbb` → `var(--os-color-…)` (colours the theme reproduces exactly). */
  colors: Map<string, string>;
  /** Lower-cased family → `var(--os-font-…)`. */
  fonts: Map<string, string>;
}

export interface ConvertContext {
  rules: SourceRule[];
  /** `:root`/`html`/`body` rules: custom properties and inherited typography, with at-context. */
  rootRules: Array<{ decls: Decl[]; at: string[] }>;
  /** `@keyframes` by name (raw CSS text). */
  keyframes: Map<string, string>;
  /** Classes the page's scripts add (reveal-on-scroll and similar): applied statically. */
  scriptClasses: Set<string>;
  tokens: TokenMaps;
  /** Import an image (bundle file or remote URL); undefined when it couldn't be read. */
  importImage: (ref: string, alt: string, where: string) => Promise<ImageValue | undefined>;
  /** A link value for an href in the page, or undefined (left as a plain "#"). */
  linkFor: (href: string) => Link | undefined;
  /** Names already taken by other components. */
  taken: Set<string>;
  notices: SqNotice[];
  where: string;
  /** Rewrite colours/fonts onto theme tokens (off when a contrast check fails). */
  useTokens?: boolean;
}

export interface ComponentResult {
  def: ComponentDefinition;
  fields: Record<string, unknown>;
  /** The section's own id, as a slug (for in-page links and navigation). */
  anchor?: string;
  /** Forms found in the section (they become form blocks next to it). */
  forms: Element[];
  /** Videos/embeds found (they become blocks next to it). */
  embeds: string[];
  /** The section's own background colour (`#rrggbb`), when it has one. */
  background?: string;
}

// --- helpers -------------------------------------------------------------------------------------

const TEXT = "#text";
const childNodes = (n: Node): Node[] => (n as { childNodes?: Node[] }).childNodes ?? [];
const tagOf = (el: Element) => el.tagName.toLowerCase();

/** Template-allowed tags (schema TEMPLATE_TAGS). */
const KEEP_TAGS = new Set([
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
  "details",
  "summary",
]);
const SVG_KEEP = new Set([
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
const SVG_ATTR_KEEP = new Set([
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
/** Elements that become a div/span with a `t-<tag>` class (template can't use them). */
const BLOCKISH = new Set([
  "main",
  "address",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "center",
  "menu",
  "hgroup",
  "search",
  "fieldset",
  "legend",
  "colgroup",
  "col",
]);
const DROP = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "link",
  "meta",
  "object",
  "embed",
  "canvas",
  "input",
  "select",
  "textarea",
  "option",
  "optgroup",
  "datalist",
  "dialog",
  "source",
  "track",
  "wbr",
  "slot",
  "base",
  "head",
  "map",
  "area",
]);
/** User-agent styles the renamed elements lose, given back. */
const UA_RULES: Record<string, string> = {
  main: "display:block",
  address: "display:block;font-style:italic",
  pre: "display:block;white-space:pre;font-family:monospace",
  table: "display:table;border-collapse:collapse",
  thead: "display:table-header-group",
  tbody: "display:table-row-group",
  tfoot: "display:table-footer-group",
  tr: "display:table-row",
  td: "display:table-cell;padding:1px",
  th: "display:table-cell;padding:1px;font-weight:bold;text-align:center",
  caption: "display:table-caption;text-align:center",
  center: "display:block;text-align:center",
  menu: "display:block",
  hgroup: "display:block",
  search: "display:block",
  fieldset: "display:block",
  legend: "display:block",
  colgroup: "display:table-column-group",
  col: "display:table-column",
  code: "font-family:monospace",
  kbd: "font-family:monospace",
  samp: "font-family:monospace",
  u: "text-decoration:underline",
  ins: "text-decoration:underline",
  s: "text-decoration:line-through",
  del: "text-decoration:line-through",
  strike: "text-decoration:line-through",
  label: "",
  big: "font-size:larger",
  tt: "font-family:monospace",
};
/** Attributes a framework adds for its own scoped CSS (noise once the CSS is scoped here). */
const FRAMEWORK_ATTR =
  /^data-(?:astro-cid-[\w-]+|astro-source-[\w-]+|v-[0-9a-f]{6,}|svelte-[\w-]+|reactroot|framer-[\w-]+|w-id|wf-[\w-]+)$/;

const escapeText = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{\{/g, "&#123;&#123;");
const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/\{\{/g, "&#123;&#123;");

const UTILITY =
  /^(?:display|italic|muted|measure|body|lead|text|small|large|wrap|wrapper|inner|container|row|col|cols|grid|flex|block|inline|content|section|item|items|list|link|links|mt|mb|my|mx|px|py|pt|pb|pl|pr|ml|mr|m|p|d|g|is|has|js|u|sr|visually|astro|w|h|max|min|font|bg|color|center|left|right|hidden|show|active|reveal|fade|animate|anim|in|out|copy|art|wf|w|elementor|wp|x|y|z|lg|md|sm|xl|xs|xxl|space|gap|align|justify|order|relative|absolute|fixed|sticky|overflow|shadow|rounded|border|ring|opacity|transition|duration|ease|delay|transform|scale|rotate|translate|uppercase|lowercase|capitalize|tracking|leading|truncate|break|whitespace|select|cursor|pointer|z)$/;

function camel(s: string): string {
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  const out = words
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("")
    .replace(/^[^a-z]+/, "");
  return out.slice(0, 32);
}

/** A meaningful name from an element's classes, if it has one (`kicker`, `heroBody`). */
function semanticName(el: Element): string | undefined {
  for (const c of classes(el)) {
    if (!/^[a-zA-Z][\w-]{2,30}$/.test(c)) continue;
    const head = c.split(/[-_]/)[0]?.toLowerCase() ?? "";
    if (UTILITY.test(head) || UTILITY.test(c.toLowerCase())) continue;
    if (/^(?:btn|button|cta)/i.test(c)) return "button";
    const n = camel(c.replace(/--.*$/, ""));
    if (n.length >= 3) return n;
  }
  return undefined;
}

const TAG_NAME: Record<string, string> = {
  h1: "title",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  p: "text",
  li: "item",
  a: "link",
  button: "button",
  span: "label",
  blockquote: "quote",
  q: "quote",
  figcaption: "caption",
  cite: "cite",
  dt: "term",
  dd: "description",
  td: "cell",
  th: "cell",
  label: "label",
  time: "date",
  summary: "summary",
  small: "note",
};

function nameFor(el: Element | undefined, fallback = "text"): string {
  if (!el) return fallback;
  return semanticName(el) ?? TAG_NAME[tagOf(el)] ?? fallback;
}

function humanize(key: string): string {
  const words = key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").toLowerCase();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 60);
}

interface Shape {
  tpl: string;
  sig: string;
  scope: FieldScope;
  hasFields: boolean;
}

/** Words the template language uses itself: never field names. */
const RESERVED = new Set([
  "rich",
  "image",
  "button",
  "href",
  "color",
  "else",
  "this",
  "each",
  "if",
  "unless",
  "link",
]);

const RESERVED_ALIAS: Record<string, string> = {
  button: "cta",
  image: "photo",
  link: "url",
  rich: "richText",
  href: "address",
  color: "colour",
};

class FieldScope {
  readonly fields: Record<string, ComponentFieldSpec> = {};
  readonly values: Record<string, unknown> = {};
  /** Inline drawings, as slots (`\u0001n\u0001`): items of a list may each have their own. */
  readonly svgs: string[] = [];
  slot(markup: string): string {
    this.svgs.push(markup);
    return `\u0001${this.svgs.length - 1}\u0001`;
  }
  key(base: string): string {
    let b = camel(base) || "text";
    if (RESERVED.has(b)) b = RESERVED_ALIAS[b] ?? `${b}Text`;
    let k = b;
    let n = 2;
    while (Object.hasOwn(this.fields, k)) k = `${b}${n++}`;
    return k;
  }
  add(base: string, spec: ComponentFieldSpec, value: unknown): string {
    const key = this.key(base);
    const label = humanize(key);
    this.fields[key] = { ...spec, label } as ComponentFieldSpec;
    this.values[key] = value;
    return key;
  }
}

interface Walk {
  inLink: boolean;
  inButton: boolean;
  hidden: boolean;
  listDepth: number;
  /** Nearest element (for naming text fields). */
  owner?: Element;
  /** The link field a text sits in (its label is named after it). */
  linkName?: string;
}

// --- the converter ---------------------------------------------------------------------------------

export class SectionConverter {
  private readonly scope: Scope;
  private readonly els: Element[];
  /** Rules that style this section, with what they match. */
  private applied: Array<{ rule: SourceRule; sel: ParsedSelector; matched: Element[] }> = [];
  private readonly bg = new Map<
    Element,
    { url: string; size?: string; position?: string; overlay?: string }
  >();
  private readonly renamed = new Set<string>();
  private readonly styleRules: string[] = [];
  /** Element → class names added (ids as classes, generated style classes, script states). */
  private readonly extraClasses = new Map<Element, string[]>();
  private readonly uidIds = new Set<string>();
  private readonly forms = new Set<Element>();
  private readonly embeds = new Set<string>();
  private readonly bgDone = new Map<Element, number>();
  private bgCount = 0;
  private readonly styleClass = new Map<Element, string>();
  private styleCount = 0;

  constructor(
    private readonly section: Element,
    private readonly ctx: ConvertContext,
  ) {
    this.scope = makeScope(section);
    this.els = elementsIn(section);
  }

  private addClass(el: Element, c: string) {
    const list = this.extraClasses.get(el) ?? [];
    if (!list.includes(c)) list.push(c);
    this.extraClasses.set(el, list);
  }

  /** Classes the page's scripts add: put them on statically (content shown, not hidden). */
  private applyScriptStates() {
    if (!this.ctx.scriptClasses.size) return;
    for (const rule of this.ctx.rules)
      for (const sel of rule.selectors) {
        for (const comp of sel.compounds) {
          const toks = sel.tokens.slice(comp.start, comp.end);
          const states = toks.filter(
            (t) =>
              t.type === "attribute" &&
              t.name === "class" &&
              t.action === "element" &&
              this.ctx.scriptClasses.has(t.value),
          ) as Array<Extract<Selector, { type: "attribute" }>>;
          if (!states.length) continue;
          const rest = toks.filter((t) => !states.includes(t as never));
          if (!rest.length) continue;
          const compound = parseSelectorList(selectorText(rest))?.[0];
          if (!compound) continue;
          for (const el of matchesIn(compound, this.els))
            for (const s of states) if (!classes(el).includes(s.value)) this.addClass(el, s.value);
        }
      }
  }

  private collectApplied() {
    this.applied = [];
    // Script states must be visible to matching: write them into the class attributes.
    for (const [el, extra] of this.extraClasses) {
      const states = extra.filter((c) => this.ctx.scriptClasses.has(c));
      if (!states.length) continue;
      const a = el.attrs.find((x) => x.name === "class");
      if (a) a.value = `${a.value} ${states.join(" ")}`;
      else el.attrs.push({ name: "class", value: states.join(" ") });
    }
    for (const rule of this.ctx.rules)
      for (const sel of rule.selectors) {
        const matched = matchesIn(sel, this.els);
        if (matched.length) this.applied.push({ rule, sel, matched });
      }
  }

  /** Background pictures from the CSS and inline styles: they become image fields. */
  private collectBackgrounds() {
    const take = (el: Element, decls: Decl[]) => {
      for (const d of decls) {
        if (d.prop !== "background" && d.prop !== "background-image") continue;
        const urls = urlsIn(d.value).filter((u) => !/^data:image\/svg/i.test(u) || u.length > 4000);
        if (!urls.length) continue;
        const layers = splitTop(d.value, ",");
        const overlay = layers
          .filter((l) => /gradient\(/i.test(l) && !/url\(/i.test(l))
          .map((l) =>
            l.trim().replace(/\s+(?:no-repeat|repeat|center|cover|contain|fixed|scroll)\b.*$/i, ""),
          )
          .join(",");
        const prev = this.bg.get(el);
        this.bg.set(el, {
          url: urls[0] as string,
          ...(prev?.size ? { size: prev.size } : {}),
          ...(prev?.position ? { position: prev.position } : {}),
          ...(overlay ? { overlay } : {}),
        });
      }
      for (const d of decls) {
        const cur = this.bg.get(el);
        if (!cur) continue;
        if (d.prop === "background-size") cur.size = d.value;
        if (d.prop === "background-position") cur.position = d.value;
        if (d.prop === "background" && /\bcontain\b/.test(d.value)) cur.size = "contain";
      }
    };
    const ordered = [...this.applied].sort(
      (x, y) =>
        cmpSpec(specificity(x.sel.tokens), specificity(y.sel.tokens)) ||
        x.rule.order - y.rule.order,
    );
    for (const a of ordered) {
      if (a.rule.at.some((x) => /^@media/.test(x) && !/min-width|screen|all/.test(x))) continue;
      if (a.sel.tokens.some((t) => t.type === "pseudo-element")) continue;
      for (const el of a.matched) take(el, a.rule.decls);
    }
    for (const el of this.els) {
      const style = attr(el, "style");
      if (style) take(el, parseInlineStyle(style));
    }
  }

  async convert(name: string, label: string): Promise<ComponentResult | { error: string }> {
    this.applyScriptStates();
    this.collectApplied();
    this.collectBackgrounds();
    const fs = new FieldScope();
    const template = fillSlots(
      await this.gen(this.section, fs, {
        inLink: false,
        inButton: false,
        hidden: false,
        listDepth: 0,
      }),
      fs.svgs,
    ).trim();
    if (!template) return { error: "The section has nothing to show." };
    let fields = fs.fields;
    let values = fs.values;
    let tpl = template;
    // Over the field limit: everything goes into a one-item list (still edited field by field).
    if (Object.keys(fields).length > 40) {
      fields = {
        content: {
          kind: "list",
          label: "Content",
          min: 1,
          max: 1,
          fields: fs.fields,
        } as ComponentFieldSpec,
      };
      values = { content: [fs.values] };
      tpl = `{{#each content}}${template}{{/each}}`;
    }
    const css = this.css(name);
    const anchor = slugId(attr(this.section, "id"));
    const def: ComponentDefinition = {
      name,
      label,
      description:
        "Brought across from a page made elsewhere; every word, picture and link is a field.",
      version: 1,
      fields,
      defaults: values,
      template: tpl,
      ...(css ? { css } : {}),
      section: { width: "full", padding: { d: "none" } },
    } as ComponentDefinition;
    const r = checkComponent(def);
    if (!r.ok) return { error: describeComponentIssues(r.issues).slice(0, 3).join("; ") };
    const background = this.rootBackground();
    return {
      def,
      ...(background ? { background } : {}),
      fields: values,
      ...(anchor ? { anchor } : {}),
      forms: [...this.forms],
      embeds: [...this.embeds],
    };
  }

  /** The section's own background colour, from the rules that style it (vars resolved). */
  private rootBackground(): string | undefined {
    const vars = new Map<string, string>();
    for (const r of this.ctx.rootRules)
      if (!r.at.length)
        for (const d of r.decls) if (d.prop.startsWith("--")) vars.set(d.prop, d.value);
    let found: string | undefined;
    const ordered = [...this.applied]
      .filter((a) => a.matched.includes(this.section) && !a.rule.at.length)
      .sort(
        (x, y) =>
          cmpSpec(specificity(x.sel.tokens), specificity(y.sel.tokens)) ||
          x.rule.order - y.rule.order,
      );
    const resolve = (v: string, depth = 0): string =>
      depth > 6
        ? v
        : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, n: string, fb?: string) => {
            const local = [...ordered]
              .reverse()
              .flatMap((a) => a.rule.decls)
              .find((d) => d.prop === n)?.value;
            const x = local ?? vars.get(n);
            return x !== undefined ? resolve(x, depth + 1) : (fb ?? "");
          });
    for (const a of ordered) {
      if (
        a.sel.tokens.some(
          (t) => t.type === "pseudo-element" || (t.type === "pseudo" && t.name === "hover"),
        )
      )
        continue;
      for (const d of a.rule.decls) {
        if (d.prop !== "background" && d.prop !== "background-color") continue;
        const hex = toHex6(resolve(d.value).trim().split(/\s+/)[0] ?? "");
        if (hex) found = hex;
      }
    }
    return found;
  }

  // --- template --------------------------------------------------------------------------------

  private async genChildren(el: Element, fs: FieldScope, w: Walk): Promise<string> {
    const kids = childNodes(el);
    const out: string[] = [];
    // Runs of siblings with the same shape become a list (cards, features, nav items).
    const elementKids = kids.filter(isElement).filter((k) => !DROP.has(tagOf(k)));
    const probe =
      w.listDepth < 2 && elementKids.length >= 2 ? await this.shapes(elementKids, w) : undefined;
    let i = 0;
    while (i < kids.length) {
      const k = kids[i] as Node;
      if (probe && isElement(k)) {
        const shape = probe.get(k);
        if (shape) {
          // The run of consecutive element siblings (whitespace between) with this shape.
          const run: Element[] = [k];
          let j = i + 1;
          let last = i;
          while (j < kids.length) {
            const n = kids[j] as Node;
            if (!isElement(n)) {
              if (((n as { value?: string }).value ?? "").trim()) break;
              j++;
              continue;
            }
            if (probe.get(n)?.sig !== shape.sig) break;
            run.push(n);
            last = j;
            j++;
          }
          if (run.length >= 2 && shape.hasFields) {
            const items = run.map((r) => (probe.get(r) as { scope: FieldScope }).scope);
            const first = items[0] as FieldScope;
            // Drawings that differ between items become a choice of icon per item.
            let itemTpl = shape.tpl;
            first.svgs.forEach((_m, k) => {
              const marks = items.map((it) => it.svgs[k] ?? "");
              const distinct = [...new Set(marks)];
              const ph = `\u0001${k}\u0001`;
              if (distinct.length === 1 || distinct.length > 30) {
                itemTpl = itemTpl.split(ph).join(distinct[0] ?? "");
                return;
              }
              const key = first.key("icon");
              const options = distinct.map((_d, i) => `icon-${i + 1}`);
              for (const it of items) {
                it.fields[key] = {
                  kind: "select",
                  label: humanize(key),
                  options,
                } as ComponentFieldSpec;
                it.values[key] = options[distinct.indexOf(it.svgs[k] ?? "")];
              }
              itemTpl = itemTpl
                .split(ph)
                .join(
                  distinct.map((d, i) => `{{#if ${key} == "icon-${i + 1}"}}${d}{{/if}}`).join(""),
                );
            });
            const base = listName(run[0] as Element, el);
            const key = fs.key(base);
            const itemLabel = Object.entries(first.fields).find(([, s]) => s.kind === "text")?.[0];
            fs.fields[key] = {
              kind: "list",
              label: humanize(key),
              fields: first.fields,
              max: 100,
              ...(itemLabel ? { itemLabel } : {}),
            } as ComponentFieldSpec;
            fs.values[key] = items.map((s) => s.values);
            out.push(`{{#each ${key}}}${itemTpl}{{/each}}`);
            i = last + 1;
            continue;
          }
        }
      }
      out.push(await this.gen(k, fs, w));
      i++;
    }
    return out.join("");
  }

  /** Each element's template in a fresh field scope (equal signatures = same shape). */
  private async shapes(els: Element[], w: Walk): Promise<Map<Node, Shape>> {
    const map = new Map<Node, Shape>();
    const sig = (e: Element) => `${tagOf(e)}.${classes(e).sort().join(".")}`;
    const counts = new Map<string, number>();
    for (const e of els) counts.set(sig(e), (counts.get(sig(e)) ?? 0) + 1);
    for (const e of els) {
      if ((counts.get(sig(e)) ?? 0) < 2) continue;
      const scope = new FieldScope();
      const tpl = await this.gen(e, scope, { ...w, listDepth: w.listDepth + 1 });
      // Field kinds must line up too (the template already encodes the keys).
      const kinds = Object.entries(scope.fields)
        .map(([k, f]) => `${k}:${f.kind}`)
        .join(",");
      map.set(e, {
        tpl,
        sig: `${tpl}\u0000${kinds}`,
        scope,
        hasFields: Object.keys(scope.fields).length > 0,
      });
    }
    return map;
  }

  private async gen(node: Node, fs: FieldScope, w: Walk): Promise<string> {
    if ((node as { nodeName?: string }).nodeName === TEXT) return this.text(node, fs, w);
    if (!isElement(node)) return "";
    const el = node;
    const tag = tagOf(el);
    if (tag === "form") {
      this.forms.add(el);
      return "";
    }
    if (DROP.has(tag)) return "";
    if (tag === "iframe" || tag === "video" || tag === "audio") {
      const src =
        attr(el, "src") ?? attr(el.childNodes.find(isElement) as Element | undefined, "src");
      if (src) this.embeds.add(src);
      else
        this.ctx.notices.push({
          kind: "unsupported-block",
          where: this.ctx.where,
          message: `A ${tag} without an address was left out.`,
        });
      return "";
    }
    if (tag === "img") return this.image(el, fs, w);
    if (tag === "picture") {
      const img = el.childNodes.find((c) => isElement(c) && tagOf(c) === "img") as
        | Element
        | undefined;
      return img ? this.image(img, fs, w, classes(el)) : "";
    }
    if (tag === "svg") return fs.slot(this.svg(el, w));
    if (tag === "a") return this.link(el, fs, w);
    if (tag === "button") {
      if (w.inLink || w.inButton) return this.wrapAs("span", el, fs, w);
      const inner = await this.genChildren(el, fs, { ...w, inButton: true, owner: el });
      return `<button type="button"${this.attrs(el, w)}>${inner}</button>`;
    }
    if (tag === "summary" && (w.inLink || w.inButton)) return this.wrapAs("span", el, fs, w);
    // Long runs of plain prose become one rich-text field.
    if (KEEP_TAGS.has(tag)) {
      const prose = await this.proseRun(el, fs, w);
      if (prose !== undefined) return prose;
      if (tag === "br" || tag === "hr") return `<${tag}${this.attrs(el, w)}>`;
      return this.wrapAs(tag, el, fs, w);
    }
    // Everything else: a div or span named after it.
    const inline = !BLOCKISH.has(tag);
    this.renamed.add(tag);
    this.addClass(el, `t-${tag}`);
    return this.wrapAs(inline ? "span" : "div", el, fs, w);
  }

  private async wrapAs(tag: string, el: Element, fs: FieldScope, w: Walk): Promise<string> {
    const hidden = w.hidden || attr(el, "aria-hidden") === "true";
    const bg = this.bg.get(el);
    let bgTpl = "";
    if (bg) bgTpl = await this.background(el, bg, fs);
    // Words in <em>, <strong>, a plain <span>… are named after the heading or paragraph they're in.
    const owner = INLINE_FMT.has(tagOf(el)) && !semanticName(el) && w.owner ? w.owner : el;
    const inner = await this.genChildren(el, fs, { ...w, hidden, owner });
    if (tag === "br" || tag === "hr") return `<${tag}${this.attrs(el, w, tag)}>`;
    return `<${tag}${this.attrs(el, { ...w, hidden }, tag)}>${bgTpl}${inner}</${tag}>`;
  }

  /**
   * A container whose element children are all plain prose (p, h2–h4, lists, quotes without
   * classes) with at least three of them: one rich-text field, edited like a document.
   */
  private async proseRun(el: Element, fs: FieldScope, _w: Walk): Promise<string | undefined> {
    const kids = el.childNodes.filter(isElement);
    if (kids.length < 3) return undefined;
    const plain = (e: Element): boolean => {
      const t = tagOf(e);
      if (
        ![
          "p",
          "h2",
          "h3",
          "h4",
          "ul",
          "ol",
          "li",
          "blockquote",
          "em",
          "strong",
          "b",
          "i",
          "a",
          "br",
          "code",
        ].includes(t)
      )
        return false;
      if (e.attrs.some((a) => a.name === "class" || a.name === "style" || a.name === "id"))
        return false;
      return e.childNodes.filter(isElement).every(plain);
    };
    if (!kids.every(plain)) return undefined;
    if (!kids.some((k) => tagOf(k) === "p")) return undefined;
    const html = kids.map((k) => serialize(k)).join("");
    const rich = htmlToRichText(html, (h) => h);
    if (!rich) return undefined;
    // Links inside become link marks with resolved hrefs where they point into the site.
    const key = fs.add(
      nameFor(el, "body"),
      {
        kind: "richText",
        marks: ["bold", "italic", "link"],
        blocks: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"],
      } as ComponentFieldSpec,
      rich.doc,
    );
    // A plain <div> container *is* the rich text (keeps `.parent > p` rules working).
    if (tagOf(el) === "div" && !attr(el, "id") && !attr(el, "style")) {
      const cls = [...classes(el), ...(this.extraClasses.get(el) ?? [])].filter(safeClass);
      return `{{rich ${key}${cls.length ? ` class="${cls.join(" ")}"` : ""}}}`;
    }
    return `<${tagOf(el)}${this.attrs(el, { inLink: false, inButton: false, hidden: false, listDepth: 0 })}>{{rich ${key}}}</${tagOf(el)}>`;
  }

  private text(node: Node, fs: FieldScope, w: Walk): string {
    const raw = (node as { value: string }).value;
    if (!raw.trim()) return /\n/.test(raw) && raw.trim() === "" ? " " : raw.replace(/\s+/g, " ");
    const value = raw.replace(/[\t\n\r ]+/g, " ").trim();
    const owner = w.owner;
    let base = nameFor(owner);
    if (w.inLink) base = `${w.linkName ?? "link"}Label`;
    else if (w.inButton) base = `${nameFor(owner, "button")}Label`;
    const key = fs.add(
      base,
      { kind: "text", ...(value.length > 90 ? { multiline: true } : {}) } as ComponentFieldSpec,
      value,
    );
    const lead = /^\s/.test(raw) ? " " : "";
    const trail = /\s$/.test(raw) ? " " : "";
    return `${lead}{{${key}}}${trail}`;
  }

  private async image(
    el: Element,
    fs: FieldScope,
    w: Walk,
    extraClasses: string[] = [],
  ): Promise<string> {
    const src = bestSrc(el);
    if (!src) return "";
    const alt = attr(el, "alt") ?? "";
    const value = await this.ctx.importImage(src, alt, this.ctx.where);
    if (!value) return "";
    const width = Number(attr(el, "width"));
    const height = Number(attr(el, "height"));
    const v: ImageValue = {
      ...value,
      alt,
      ...(Number.isFinite(width) && width > 0 && !value.width ? { width } : {}),
      ...(Number.isFinite(height) && height > 0 && !value.height ? { height } : {}),
    };
    const key = fs.add(imageName(el), { kind: "image" } as ComponentFieldSpec, v);
    const cls = [
      ...extraClasses,
      ...classes(el),
      ...(this.extraClasses.get(el) ?? []),
      "os-ci",
    ].filter(safeClass);
    const eager = attr(el, "loading") === "eager" || attr(el, "fetchpriority") === "high";
    const style = this.inlineStyleClass(el);
    if (style) cls.push(style);
    void w;
    return `{{image ${key} class="${cls.join(" ")}"${eager ? ' loading="eager"' : ""}}}`;
  }

  private async background(
    el: Element,
    bg: { url: string; size?: string; position?: string; overlay?: string },
    fs: FieldScope,
  ): Promise<string> {
    const value = await this.ctx.importImage(bg.url, "", this.ctx.where);
    if (!value) return "";
    const key = fs.add(
      `${nameFor(el, "section")}Background`,
      { kind: "image", help: "The picture behind this part." } as ComponentFieldSpec,
      { ...value, alt: "" },
    );
    let n = this.bgDone.get(el);
    if (n === undefined) {
      n = ++this.bgCount;
      this.bgDone.set(el, n);
      this.addClass(el, "os-bgbox");
      const fit = /contain/.test(bg.size ?? "") ? "contain" : "cover";
      const pos = bg.position && !/var\(/.test(bg.position) ? bg.position : "50% 50%";
      this.styleRules.push(
        `.os-bg-${n} .os-img__img{object-fit:${fit};object-position:${pos}}`,
        ...(bg.overlay
          ? [
              `.os-bg-${n}::after{content:"";position:absolute;inset:0;background-image:${bg.overlay}}`,
            ]
          : []),
      );
    }
    return `{{image ${key} class="os-bg os-bg-${n}"}}`;
  }

  private svg(el: Element, w: Walk): string {
    const labelled =
      attr(el, "aria-label") ||
      attr(el, "role") === "img" ||
      el.childNodes.some((c) => isElement(c) && tagOf(c) === "title");
    const out = (e: Element, top: boolean): string => {
      const tag = tagOf(e);
      if (!SVG_KEEP.has(tag)) return "";
      const attrs: string[] = [];
      for (const a of e.attrs) {
        const n = a.name.toLowerCase();
        if (/^on/.test(n) || /url\(|javascript:/i.test(a.value)) continue;
        if (
          n === "class" ||
          n === "role" ||
          /^aria-[a-z]+$/.test(n) ||
          (/^data-[a-z0-9-]+$/.test(n) && !n.startsWith("data-os") && !FRAMEWORK_ATTR.test(n)) ||
          SVG_ATTR_KEEP.has(n)
        )
          attrs.push(
            `${n}="${escapeAttr(n === "d" && a.value.length > 300 ? simplifyPath(a.value) : a.value)}"`,
          );
      }
      if (top && !labelled && !attrs.some((a) => a.startsWith("aria-hidden")))
        attrs.push('aria-hidden="true"');
      if (top) {
        const extra = this.extraClasses.get(e);
        if (extra?.length) {
          const i = attrs.findIndex((a) => a.startsWith("class="));
          const cls = [...classes(e), ...extra].filter(safeClass).join(" ");
          if (i >= 0) attrs[i] = `class="${cls}"`;
          else attrs.push(`class="${cls}"`);
        }
      }
      const kids = e.childNodes
        .map((c) =>
          isElement(c)
            ? out(c, false)
            : tag === "title" && (c as { nodeName?: string }).nodeName === TEXT
              ? escapeText((c as { value: string }).value)
              : "",
        )
        .join("");
      return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${kids}</${tag}>`;
    };
    void w;
    return out(el, true);
  }

  private async link(el: Element, fs: FieldScope, w: Walk): Promise<string> {
    if (w.inLink || w.inButton) return this.wrapAs("span", el, fs, w);
    const href = attr(el, "href") ?? "";
    const link =
      href && !/^#$|^javascript:/i.test(href.trim()) ? this.ctx.linkFor(href) : undefined;
    const base =
      semanticName(el) ?? (classes(el).some((c) => /btn|button|cta/i.test(c)) ? "button" : "link");
    const hidden = w.hidden || attr(el, "aria-hidden") === "true";
    if (!link) {
      // A placeholder link ("#") stays a link to nowhere, with its words still editable.
      const inner = await this.genChildren(el, fs, {
        ...w,
        inLink: true,
        hidden,
        owner: el,
        linkName: base,
      } as Walk);
      return `<a href="#"${this.attrs(el, { ...w, hidden })}>${inner}</a>`;
    }
    const key = fs.add(base, { kind: "link" } as ComponentFieldSpec, link);
    const inner = await this.genChildren(el, fs, {
      ...w,
      inLink: true,
      hidden,
      owner: el,
      linkName: key,
    } as Walk);
    return `<a href="{{href ${key}}}"${this.attrs(el, { ...w, hidden })}>${inner}</a>`;
  }

  /** Allowed attributes, classes for ids/renames/styles, and uid ids where they're referenced. */
  private attrs(el: Element, w: Walk, outTag?: string): string {
    const tag = outTag ?? tagOf(el);
    const out: string[] = [];
    const cls = [...classes(el)];
    const id = attr(el, "id");
    if (id) cls.push(`i-${cssIdent(id)}`);
    const style = this.inlineStyleClass(el);
    if (style) cls.push(style);
    for (const c of this.extraClasses.get(el) ?? []) if (!cls.includes(c)) cls.push(c);
    const finalCls = cls.filter(safeClass);
    if (finalCls.length) out.push(`class="${escapeAttr(finalCls.join(" "))}"`);
    let tabindexSet = false;
    for (const a of el.attrs) {
      const n = a.name.toLowerCase();
      if (n === "class" || n === "id" || n === "style" || n === "href" || n.startsWith("on"))
        continue;
      if (FRAMEWORK_ATTR.test(n)) continue;
      if (n === "role" || n === "title" || n === "lang" || n === "dir")
        out.push(`${n}="${escapeAttr(a.value)}"`);
      else if (n === "hidden") out.push("hidden");
      else if (n === "tabindex") {
        if (a.value.trim() === "0" || a.value.trim() === "-1") {
          out.push(`tabindex="${a.value.trim()}"`);
          tabindexSet = true;
        }
      } else if (/^aria-[a-z]+$/.test(n)) {
        if (
          n === "aria-labelledby" ||
          n === "aria-describedby" ||
          n === "aria-controls" ||
          n === "aria-owns"
        ) {
          const ids = a.value.split(/\s+/).filter(Boolean);
          const inside = ids.filter((x) => this.els.some((e) => attr(e, "id") === x));
          if (inside.length) {
            for (const x of inside) this.uidIds.add(x);
            out.push(`${n}="${inside.map((x) => `{{@uid}}-${cssIdent(x)}`).join(" ")}"`);
          }
        } else out.push(`${n}="${escapeAttr(a.value)}"`);
      } else if (/^data-[a-z0-9-]+$/.test(n) && !n.startsWith("data-os"))
        out.push(`${n}="${escapeAttr(a.value)}"`);
      else if (tag === "ol" && (n === "start" || n === "reversed"))
        out.push(n === "reversed" ? "reversed" : `start="${escapeAttr(a.value)}"`);
      else if (tag === "li" && n === "value") out.push(`value="${escapeAttr(a.value)}"`);
      else if (tag === "time" && n === "datetime") out.push(`datetime="${escapeAttr(a.value)}"`);
      else if (tag === "details" && n === "open") out.push("open");
      else if (tag === "a" && n === "rel") out.push(`rel="${escapeAttr(a.value)}"`);
    }
    if (id && el !== this.section && this.uidIds.has(id)) out.push(`id="{{@uid}}-${cssIdent(id)}"`);
    // Focusable things inside something hidden from screen readers stay out of the tab order.
    if (w.hidden && (tag === "a" || tag === "button") && !tabindexSet) out.push('tabindex="-1"');
    // Custom properties stay inline (`style="--min:300px"`).
    const inline = attr(el, "style");
    if (inline) {
      const custom = parseInlineStyle(inline).filter(
        (d) => d.prop.startsWith("--") && !/url\(|[{}<>\\]/.test(d.value),
      );
      if (custom.length)
        out.push(`style="${escapeAttr(custom.map((d) => `${d.prop}: ${d.value}`).join("; "))}"`);
    }
    return out.length ? ` ${out.join(" ")}` : "";
  }

  /** Non-custom inline styles become a generated class (strong enough to win, like inline). */
  private inlineStyleClass(el: Element): string | undefined {
    const inline = attr(el, "style");
    if (!inline) return undefined;
    const decls = parseInlineStyle(inline).filter(
      (d) =>
        !d.prop.startsWith("--") && !(d.prop.startsWith("background") && /url\(/i.test(d.value)),
    );
    if (!decls.length) return undefined;
    const existing = this.styleClass.get(el);
    if (existing) return existing;
    const cls = `s-${++this.styleCount}`;
    this.styleClass.set(el, cls);
    this.styleRules.push(
      `:scope:scope:scope .${cls}{${decls.map((d) => declText({ ...d, value: this.tokenize(d.prop, d.value) })).join(";")}}`,
    );
    return cls;
  }

  // --- CSS -----------------------------------------------------------------------------------------

  private tokenize(prop: string, value: string): string {
    if (this.ctx.useTokens === false) return value;
    let v = value;
    if (prop === "font-family") {
      const first = v
        .split(",")[0]
        ?.trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();
      const token = first ? this.ctx.tokens.fonts.get(first) : undefined;
      if (token) return `${token}`;
    }
    v = v.replace(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^()]*\)|\b(?:white|black)\b/g, (m) => {
      const hex = toHex6(m);
      const token = hex ? this.ctx.tokens.colors.get(hex) : undefined;
      return token ?? m;
    });
    return v;
  }

  private rewriteSelector(
    tokens: Selector[],
  ): { text: string; spec: [number, number, number] } | undefined {
    const out: Selector[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i] as Selector;
      if (t.type === "attribute" && FRAMEWORK_ATTR.test(t.name)) continue;
      if (t.type === "attribute" && t.name === "id" && t.action === "equals") {
        out.push({
          type: "attribute",
          name: "class",
          action: "element",
          value: `i-${cssIdent(t.value)}`,
          namespace: null,
          ignoreCase: null,
        } as Selector);
        continue;
      }
      if (t.type === "tag") {
        const tag = t.name.toLowerCase();
        if (tag === "html" || tag === "body") return undefined;
        if (tag === "img") {
          // Pictures render inside a wrapper: a child combinator before img becomes descendant.
          const prev = out[out.length - 1];
          if (prev?.type === "child") out[out.length - 1] = { type: "descendant" } as Selector;
          out.push(t);
          continue;
        }
        if (this.renamed.has(tag)) {
          out.push({
            type: "attribute",
            name: "class",
            action: "element",
            value: `t-${tag}`,
            namespace: null,
            ignoreCase: null,
          } as Selector);
          continue;
        }
        if (tag === "picture") {
          out.push({
            type: "attribute",
            name: "class",
            action: "element",
            value: "os-img",
            namespace: null,
            ignoreCase: null,
          } as Selector);
          continue;
        }
      }
      if (t.type === "pseudo" && (t.name === "root" || t.name === "host")) return undefined;
      out.push(t);
    }
    if (!out.length) return undefined;
    // Leading combinator (from a dropped token) is meaningless.
    while (
      out.length &&
      ["descendant", "child", "sibling", "adjacent"].includes(out[0]?.type as string)
    )
      out.shift();
    if (!out.length) return undefined;
    let text: string;
    try {
      text = selectorText(out);
    } catch {
      return undefined;
    }
    return { text, spec: specificity(out) };
  }

  private css(name: string): string {
    void name;
    const used = new Set<string>();
    const animNames = new Set<string>();
    const blocks: Array<{ at: string[]; text: string }> = [];
    const noteVars = (v: string) => {
      for (const x of varsIn(v)) used.add(x);
    };
    // Rules, grouped back into their selector lists. A rule for `img` styles both the picture's
    // wrapper (its box: size, display, margins) and the picture inside (everything else).
    const byRule = new Map<SourceRule, Array<{ sel: string; part: "all" | "wrap" | "inner" }>>();
    for (const a of this.applied) {
      const tail = scopedTail(a.sel, this.scope, this.els, a.matched);
      const rw = this.rewriteSelector(tail);
      if (!rw) continue;
      const orig = specificity(a.sel.tokens);
      const origN = orig[0] * 10000 + orig[1] * 100 + orig[2];
      const newN = rw.spec[0] * 10000 + rw.spec[1] * 100 + rw.spec[2];
      const pad = Math.min(5, Math.max(0, Math.ceil((origN - newN) / 100)));
      const sel = pad ? `${":scope".repeat(pad)} ${rw.text}` : rw.text;
      const list = byRule.get(a.rule) ?? [];
      const subject = tail.slice(lastCompoundStart(tail));
      const isImg = subject.some((t) => t.type === "tag" && t.name.toLowerCase() === "img");
      const push = (x: string, part: "all" | "wrap" | "inner") => {
        if (!list.some((y) => y.sel === x && y.part === part)) list.push({ sel: x, part });
      };
      if (isImg) {
        push(sel, "inner");
        const wrapTail = this.rewriteSelector(
          tail.map((t) =>
            t.type === "tag" && t.name.toLowerCase() === "img"
              ? ({
                  type: "attribute",
                  name: "class",
                  action: "element",
                  value: "os-ci",
                  namespace: null,
                  ignoreCase: null,
                } as Selector)
              : t,
          ),
        );
        if (wrapTail)
          push(pad ? `${":scope".repeat(pad)} ${wrapTail.text}` : wrapTail.text, "wrap");
      } else push(sel, "all");
      byRule.set(a.rule, list);
    }
    for (const rule of this.ctx.rules) {
      const all = byRule.get(rule);
      if (!all?.length) continue;
      for (const part of ["all", "wrap", "inner"] as const) {
        const sels = all.filter((x) => x.part === part).map((x) => x.sel);
        if (!sels.length) continue;
        const decls: string[] = [];
        for (const d of rule.decls) {
          if (part === "wrap" && !WRAP_PROPS.test(d.prop)) continue;
          if (part === "inner" && INNER_SKIP.test(d.prop)) continue;
          if (
            /^(?:behavior|-moz-binding)$/.test(d.prop) ||
            /expression\(|javascript:/i.test(d.value)
          )
            continue;
          let value = d.value;
          if (/url\(/i.test(value)) {
            if (d.prop === "background" || d.prop === "background-image") {
              // The picture itself became an image field; gradients stay.
              value = splitTop(value, ",")
                .filter((l) => !/url\(/i.test(l) || /url\(\s*['"]?data:image\/svg/i.test(l))
                .join(",")
                .trim();
              if (!value) continue;
            } else if (!/url\(\s*['"]?(?:data:image|https:\/\/fonts\.gstatic\.com\/)/i.test(value))
              continue;
          }
          if (d.prop === "animation" || d.prop === "animation-name")
            for (const w of value.split(/[\s,]+/)) if (this.ctx.keyframes.has(w)) animNames.add(w);
          value = this.tokenize(d.prop, value);
          noteVars(value);
          decls.push(declText({ ...d, value }));
        }
        if (decls.length)
          blocks.push({ at: rule.at, text: `${sels.join(",")}{${decls.join(";")}}` });
      }
    }
    // The page's custom properties and inherited typography, on the component root.
    const rootBlocks: Array<{ at: string[]; text: string }> = [];
    const INHERITED =
      /^(?:color|font|font-family|font-size|font-weight|font-style|font-feature-settings|font-variation-settings|font-optical-sizing|line-height|letter-spacing|word-spacing|text-rendering|-webkit-font-smoothing|-moz-osx-font-smoothing|text-transform|hyphens|font-kerning)$/;
    const defined = new Map<string, string>();
    for (const r of this.ctx.rootRules)
      for (const d of r.decls)
        if (d.prop.startsWith("--") && !r.at.length) defined.set(d.prop, d.value);
    // Inherited typography from the page's root rules uses variables too.
    for (const r of this.ctx.rootRules)
      for (const d of r.decls)
        if (!d.prop.startsWith("--") && INHERITED.test(d.prop)) noteVars(d.value);
    // Variables used transitively.
    const queue = [...used];
    while (queue.length) {
      const v = queue.pop() as string;
      const val = defined.get(v);
      if (val)
        for (const x of varsIn(val))
          if (!used.has(x)) {
            used.add(x);
            queue.push(x);
          }
    }
    for (const r of this.ctx.rootRules) {
      const decls = r.decls
        .filter((d) => (d.prop.startsWith("--") ? used.has(d.prop) : INHERITED.test(d.prop)))
        .map((d) => declText({ ...d, value: this.tokenize(d.prop, d.value) }));
      if (decls.length) rootBlocks.push({ at: r.at, text: `:scope{${decls.join(";")}}` });
    }
    const ua = [...this.renamed].filter((t) => UA_RULES[t]).map((t) => `.t-${t}{${UA_RULES[t]}}`);
    const helpers: string[] = [];
    if (this.bgCount)
      helpers.push(
        ":where(.os-bgbox){position:relative;isolation:isolate}",
        ".os-bg{position:absolute!important;inset:0;z-index:-1;display:block;border-radius:inherit;overflow:hidden}",
        ".os-bg img{width:100%;height:100%}",
      );
    // The browser's own heading styles (the site's heading presets don't apply inside).
    helpers.push(
      ":where(h1,h2,h3,h4,h5,h6){color:inherit;font-family:inherit;font-weight:bold;font-style:inherit;letter-spacing:normal;text-transform:none;line-height:inherit;text-wrap:wrap}",
      ":where(h1){font-size:2em}:where(h2){font-size:1.5em}:where(h3){font-size:1.17em}:where(h4){font-size:1em}:where(h5){font-size:.83em}:where(h6){font-size:.67em}",
    );
    helpers.push(
      ":where(.os-ci){display:inline-block;max-width:100%;vertical-align:middle;aspect-ratio:auto}",
      ".os-ci>picture{display:contents}",
      ".os-ci img{display:block;width:100%;height:100%;object-fit:inherit;object-position:inherit;border-radius:inherit}",
    );
    const kf = [...animNames].map((n) => this.ctx.keyframes.get(n) as string).filter(Boolean);
    const all = [
      ...rootBlocks,
      ...ua.map((text) => ({ at: [] as string[], text })),
      ...helpers.map((text) => ({ at: [] as string[], text })),
      ...blocks,
      ...this.styleRules.map((text) => ({ at: [] as string[], text })),
    ];
    let css = all.map((b) => b.at.reduceRight((inner, at) => `${at}{${inner}}`, b.text)).join("\n");
    css += kf.length ? `\n${kf.join("\n")}` : "";
    if (/\banimation|@keyframes|transition/i.test(css))
      css +=
        "\n@media (prefers-reduced-motion: reduce){:scope,:scope *{animation:none!important;transition:none!important}}";
    return css;
  }
}

// --- small helpers ---------------------------------------------------------------------------------

/** Box properties a picture's wrapper takes from an `img` rule. */
const WRAP_PROPS =
  /^(?:display|width|max-width|min-width|height|max-height|min-height|aspect-ratio|float|clear|flex(?:-[a-z]+)?|grid-(?:area|column|row)(?:-[a-z]+)?|align-self|justify-self|place-self|order|position|inset|top|right|bottom|left|z-index|margin(?:-[a-z]+)?|vertical-align|object-fit|object-position|border-radius|box-shadow|transform)$/;
/** …and which the picture itself leaves to its wrapper. */
const INNER_SKIP =
  /^(?:margin(?:-[a-z]+)?|position|inset|top|right|bottom|left|z-index|float|clear|flex(?:-[a-z]+)?|grid-(?:area|column|row)(?:-[a-z]+)?|align-self|justify-self|place-self|order|max-width|box-shadow|transform|vertical-align)$/;

function lastCompoundStart(tokens: Selector[]): number {
  for (let i = tokens.length - 1; i >= 0; i--)
    if (["descendant", "child", "sibling", "adjacent"].includes((tokens[i] as Selector).type))
      return i + 1;
  return 0;
}

const safeClass = (c: string) => /^-?[_a-zA-Z][\w-]*$/.test(c) && c.length <= 80;

export function cssIdent(s: string): string {
  return s
    .replace(/[^\w-]/g, "-")
    .replace(/^(\d)/, "_$1")
    .slice(0, 60);
}

export function slugId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const s = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || undefined;
}

export function parseInlineStyle(style: string): Decl[] {
  const out: Decl[] = [];
  for (const part of splitTop(style, ";")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    let value = part.slice(i + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important\s*$/i, "");
    if (/^(?:--[\w-]+|-?[a-z][\w-]*)$/.test(prop) && value) out.push({ prop, value, important });
  }
  return out;
}

function serialize(el: Element): string {
  const tag = tagOf(el);
  const attrs = el.attrs
    .filter((a) => a.name === "href")
    .map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
    .join("");
  const inner = el.childNodes
    .map((c) =>
      isElement(c)
        ? serialize(c)
        : (c as { nodeName?: string }).nodeName === TEXT
          ? escapeText((c as { value: string }).value)
          : "",
    )
    .join("");
  return tag === "br" ? "<br>" : `<${tag}${attrs}>${inner}</${tag}>`;
}

/** The largest source of an image (srcset, data-src for lazy loaders, then src). */
function bestSrc(el: Element): string | undefined {
  const srcset = attr(el, "srcset") ?? attr(el, "data-srcset");
  let best: string | undefined;
  if (srcset) {
    let bestW = -1;
    for (const part of srcset.split(/,\s+(?=\S)/)) {
      const [u, d] = part.trim().split(/\s+/);
      const w = d ? Number.parseFloat(d) * (/x$/.test(d) ? 1000 : 1) : 1;
      if (u && w > bestW) {
        bestW = w;
        best = u;
      }
    }
  }
  return best ?? attr(el, "data-src") ?? attr(el, "src") ?? undefined;
}

function imageName(el: Element): string {
  const n = semanticName(el);
  return n
    ? /image|photo|img|pic|cover|logo|avatar|portrait|icon/i.test(n)
      ? n
      : `${n}Image`
    : "image";
}

function listName(item: Element, parent: Element): string {
  const n = semanticName(item);
  if (n) return n.endsWith("s") ? `${n}List` : `${n}s`;
  const p = semanticName(parent);
  if (p) return p.endsWith("s") ? p : `${p}Items`;
  const byTag: Record<string, string> = {
    li: "items",
    p: "paragraphs",
    span: "parts",
    a: "links",
    img: "images",
    figure: "pictures",
    blockquote: "quotes",
    h2: "headings",
    h3: "headings",
    tr: "rows",
    dt: "terms",
  };
  return byTag[tagOf(item)] ?? "cards";
}

/** Inline formatting elements (their words are part of the surrounding text). */
const INLINE_FMT = new Set([
  "em",
  "strong",
  "b",
  "i",
  "mark",
  "small",
  "sup",
  "sub",
  "abbr",
  "q",
  "span",
  "u",
  "s",
  "del",
  "ins",
  "code",
  "kbd",
  "br",
]);

/** Put inline drawings back into a template (`\u0001n\u0001` slots). */
function fillSlots(tpl: string, svgs: readonly string[]): string {
  const mark = String.fromCharCode(1);
  return tpl.replace(
    new RegExp(`${mark}(\\d+)${mark}`, "g"),
    (_m, n: string) => svgs[Number(n)] ?? "",
  );
}

/** `#abc`, `#aabbcc`, `rgb(…)` (opaque), `white`/`black` → `#rrggbb`; undefined otherwise. */
export function toHex6(c: string): string | undefined {
  const s = c.trim().toLowerCase();
  if (s === "white") return "#ffffff";
  if (s === "black") return "#000000";
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = (m[1] as string).split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  m = /^#([0-9a-f]{6})(?:ff)?$/.exec(s);
  if (m) return `#${m[1]}`;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (rgb) {
    const alpha = rgb[4];
    if (alpha !== undefined && Number.parseFloat(alpha) < (alpha.endsWith("%") ? 100 : 1))
      return undefined;
    return `#${[rgb[1], rgb[2], rgb[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
  }
  return undefined;
}

export { declText };

/**
 * Long drawn paths (generated line art: hundreds of `L` points) made compact: runs of straight
 * segments are simplified (Ramer–Douglas–Peucker, a fraction of a unit) and numbers rounded.
 */
export function simplifyPath(d: string): string {
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!tokens) return d;
  // Only absolute M/L/Z paths are simplified; anything else just gets rounded numbers.
  if (tokens.some((t) => /^[HVCSQTAhvcsqtalm]$/.test(t)))
    return d.replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));
  const out: string[] = [];
  let run: Array<[number, number]> = [];
  const flush = () => {
    if (!run.length) return;
    const pts = rdp(run, 0.15);
    out.push(`M${fmt(pts[0] as [number, number])}`);
    for (const p of pts.slice(1)) out.push(`L${fmt(p)}`);
    run = [];
  };
  let i = 0;
  let cmd = "M";
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/^[MLZz]$/.test(t)) {
      cmd = t;
      i++;
      if (t === "Z" || t === "z") {
        flush();
        out.push("Z");
      } else if (t === "M") flush();
      continue;
    }
    const x = Number(t);
    const y = Number(tokens[i + 1]);
    i += 2;
    if (cmd === "M" && run.length) flush();
    run.push([x, y]);
    if (cmd === "M") cmd = "L";
  }
  flush();
  return out.join("");
}

const fmt = ([x, y]: [number, number]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;

function rdp(pts: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0] as [number, number];
  const [bx, by] = pts[pts.length - 1] as [number, number];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let max = 0;
  let idx = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const [px, py] = pts[k] as [number, number];
    const dist = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
    if (dist > max) {
      max = dist;
      idx = k;
    }
  }
  if (max <= eps) return [pts[0] as [number, number], pts[pts.length - 1] as [number, number]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
