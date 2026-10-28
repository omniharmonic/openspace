/**
 * HTML → OpenSpace: a page Claude (or anyone) made — a single HTML file, an artifact export, a
 * zip of HTML/CSS/images, or a page's address — becomes an editable OpenSpace site that looks
 * the same. The site's header becomes the OpenSpace header (navigation, button, logo); every
 * section of the page becomes a custom component (its own markup and scoped CSS, rewritten onto
 * the theme's tokens) whose words, pictures and links are fields owners edit in Studio; forms and
 * videos become the platform's own blocks; plain prose sections use presets. The page's colours
 * and fonts become Site Styles and the design-system record Claude keeps to.
 *
 * Pure (no filesystem): the CLI reads files into a bundle, the Hub gets them uploaded.
 */

import type { ImageResizer } from "@omniharmonic/openspace-mcp-tools";
import {
  type ComponentDefinition,
  componentSection,
  type DesignSystem,
  type DesignTokens,
  type Link,
  type Page,
  type Section,
  type SiteConfig,
  type SiteDocument,
  SiteDocumentSchema,
} from "@omniharmonic/openspace-schema";
import { compileStyles, designSystemStyles, readDesignTokens } from "@omniharmonic/openspace-theme";
import { setupChecklist } from "../checklist";
import {
  attr,
  classes,
  type Element,
  find,
  findAll,
  isElement,
  type Node,
  parseDocument,
  text,
} from "../dom";
import type { FetchFn } from "../fetch";
import { confirmGoogleFonts } from "../fidelity/fonts";
import { formFromHtml, parseHtmlPage, sectionsFrom } from "../html/extract";
import { themeFromCss } from "../html/theme";
import { type BuildResult, buildSite } from "../map/site";
import { MediaImporter } from "../media";
import { phoneReady } from "../phone";
import { renderReport } from "../report";
import { signupAsksName } from "../squarespace/blocks";
import type { SqBlock, SqNavItem, SqNotice, SqPage, SqSection, SqSite } from "../types";
import {
  BUNDLE_ORIGIN,
  bundleFetch,
  bundlePathOf,
  bundleUrl,
  type HtmlBundle,
  resolveRef,
  textOf,
} from "./bundle";
import {
  type ConvertContext,
  SectionConverter,
  type SourceRule,
  slugId,
  toHex6,
} from "./component";
import { type CssNode, type Decl, declText, parseStylesheet } from "./css";
import { parseSelectorList } from "./select";

export { confirmGoogleFonts } from "../fidelity/fonts";
export * from "./bundle";
export { parseStylesheet } from "./css";

/** The address imported sites use internally for their own pages (never fetched). */
const SITE_ORIGIN = "https://site.openspace.invalid";

export interface HtmlImportOptions {
  config: SiteConfig;
  /** The network (fonts check, remote images, a page address). Without it: bundle only. */
  fetch?: FetchFn;
  resize?: ImageResizer;
  rasterizeSvg?: (svg: Uint8Array, opts?: { icon?: boolean }) => Promise<Uint8Array>;
  now?: Date;
  /** Site title (default: the page's). */
  title?: string;
  /**
   * Render a page in a browser first (pages styled by a script such as the Tailwind CDN): the
   * rendered HTML and every stylesheet rule the browser has. The CLI passes Playwright.
   */
  render?: (html: string, url: string) => Promise<{ html: string; css: string } | undefined>;
  onProgress?: (message: string) => void;
  /** Source label in the design-system record and report (default: the bundle's). */
  sourceLabel?: string;
}

export interface HtmlComponentSummary {
  name: string;
  label: string;
  page: string;
  fields: number;
  cssBytes: number;
  templateBytes: number;
}

export interface HtmlImportResult {
  site: SqSite;
  doc: SiteDocument;
  build: BuildResult;
  files: Map<string, Uint8Array>;
  report: string;
  checklist: ReturnType<typeof setupChecklist>;
  requests: number;
  liveUrl: string;
  /** Sections made into designer components (the rest used presets). */
  components: HtmlComponentSummary[];
  /** Sections that used presets, and why. */
  presets: Array<{ page: string; reason: string }>;
}

// --- page reading ------------------------------------------------------------------------------

interface PageSource {
  /** Bundle path of the HTML. */
  path: string;
  /** Site path (`/`, `/about`). */
  sitePath: string;
  url: string;
  html: string;
  root: Element;
  body: Element;
  header?: Element;
  footer?: Element;
  /** Section elements in order. */
  sections: Element[];
  css: string;
  scripts: string;
  fontLinks: string[];
}

const HTML_RE = /\.html?$/i;

function sitePathFor(bundlePath: string, entry: string): string {
  if (bundlePath === entry) return "/";
  const p = bundlePath.replace(/(?:^|\/)index\.html?$/i, "").replace(HTML_RE, "");
  return `/${p.replace(/^\/+|\/+$/g, "")}` || "/";
}

function bodyOf(root: Element): Element {
  return find(root, (e) => e.tagName === "body") ?? root;
}

const isScriptish = (e: Element) =>
  ["script", "style", "noscript", "template", "link", "meta", "svg"].includes(e.tagName);

function invisible(e: Element): boolean {
  const style = attr(e, "style") ?? "";
  return attr(e, "hidden") !== undefined || /display\s*:\s*none/i.test(style);
}

/** The page's header and footer (outside the main content). */
function chromeOf(body: Element): { header?: Element; footer?: Element; main: Element } {
  const main = find(body, (e) => e.tagName === "main" || attr(e, "role") === "main") ?? body;
  const top = (pred: (e: Element) => boolean) =>
    findAll(body, pred, { deep: false }).filter((e) => {
      let p = e.parentNode as Node | null;
      while (p && isElement(p)) {
        if (p === main && main !== body) return false;
        if (["article", "section", "figure", "blockquote"].includes((p as Element).tagName))
          return false;
        p = (p as Element).parentNode as Node | null;
      }
      return true;
    });
  const headers = top((e) => e.tagName === "header" || attr(e, "role") === "banner");
  const navs = headers.length ? [] : top((e) => e.tagName === "nav");
  const footers = top((e) => e.tagName === "footer" || attr(e, "role") === "contentinfo");
  return {
    ...((headers[0] ?? navs[0]) ? { header: (headers[0] ?? navs[0]) as Element } : {}),
    ...(footers.length ? { footer: footers[footers.length - 1] as Element } : {}),
    main,
  };
}

/** The page's sections: the main area's children (descending through lone wrappers). */
function sectionElements(main: Element, skip: Set<Element>): Element[] {
  let container = main;
  for (let depth = 0; depth < 4; depth++) {
    const kids = container.childNodes.filter(
      (c): c is Element => isElement(c) && !isScriptish(c) && !skip.has(c) && !invisible(c),
    );
    if (
      kids.length === 1 &&
      !["section", "header", "footer", "article"].includes((kids[0] as Element).tagName)
    ) {
      const only = kids[0] as Element;
      const grand = only.childNodes.filter((c) => isElement(c) && !isScriptish(c));
      if (grand.length >= 2) {
        container = only;
        continue;
      }
    }
    return kids.filter(
      (k) =>
        !/(?:^|\s)(?:skip-link|skip-to|sr-only|visually-hidden)(?:\s|$)/.test(
          classes(k).join(" "),
        ) && text(k).length + findAll(k, (e) => e.tagName === "img").length > 0,
    );
  }
  return [];
}

// --- CSS of the page -------------------------------------------------------------------------------

const ROOT_SEL = /^(?::root|html|body|:root\s*,\s*html|html\s*,\s*body|:host)$/i;

interface PageCss {
  rules: SourceRule[];
  rootRules: ConvertContext["rootRules"];
  keyframes: Map<string, string>;
  fontFaces: string[];
}

function serializeNodes(nodes: readonly CssNode[]): string {
  return nodes
    .map((n) =>
      n.t === "rule"
        ? `${n.selector}{${n.decls.map(declText).join(";")}}`
        : n.children
          ? `@${n.name} ${n.prelude}{${serializeNodes(n.children)}}`
          : "",
    )
    .join("");
}

function readCss(css: string): PageCss {
  const nodes = parseStylesheet(css);
  const rules: SourceRule[] = [];
  const rootRules: PageCss["rootRules"] = [];
  const keyframes = new Map<string, string>();
  const fontFaces: string[] = [];
  const visit = (list: readonly CssNode[], at: string[]) => {
    for (const n of list) {
      if (n.t === "at") {
        if (n.name === "keyframes") {
          if (n.children)
            keyframes.set(
              n.prelude.trim(),
              `@keyframes ${n.prelude.trim()}{${serializeNodes(n.children)}}`,
            );
          continue;
        }
        if (n.name === "font-face") {
          const fam = n.decls?.find((d) => d.prop === "font-family")?.value;
          if (fam) fontFaces.push(fam.replace(/^["']|["']$/g, "").trim());
          continue;
        }
        if (!n.children) continue;
        if (n.name === "media" && /\bprint\b/.test(n.prelude) && !/screen/.test(n.prelude))
          continue;
        if (n.name === "layer") {
          visit(n.children, at);
          continue;
        }
        if (["media", "supports", "container"].includes(n.name))
          visit(n.children, [...at, `@${n.name} ${n.prelude}`]);
        continue;
      }
      const sel = n.selector.trim();
      if (!sel || !n.decls.length) continue;
      if (ROOT_SEL.test(sel) || sel.split(",").every((s) => ROOT_SEL.test(s.trim()))) {
        rootRules.push({ decls: n.decls, at });
        continue;
      }
      const parsed = parseSelectorList(sel);
      if (!parsed?.length) continue;
      rules.push({ selectors: parsed, decls: n.decls, at, order: rules.length });
    }
  };
  visit(nodes, []);
  return { rules, rootRules, keyframes, fontFaces };
}

/** Classes the page's scripts add (`el.classList.add("is-visible")`, `.toggle('open', …)`). */
function scriptClassesOf(scripts: string): Set<string> {
  const out = new Set<string>();
  for (const m of scripts.matchAll(
    /classList\.(?:add|toggle|replace)\(\s*(['"])([\w-]+)\1(?:\s*,\s*(['"])([\w-]+)\3)?/g,
  )) {
    out.add(m[2] as string);
    if (m[4]) out.add(m[4]);
  }
  // Menus and dialogs opened by a script stay closed: only reveal-style states are applied.
  for (const c of [...out])
    if (
      /^(?:open|is-open|menu-open|nav-open|active|is-active|show|showing|expanded|is-expanded|toggled|hidden|is-hidden|closed|scrolled|is-scrolled|sticky|is-sticky|dark|light|selected|is-selected|current)$/i.test(
        c,
      )
    )
      out.delete(c);
  return out;
}

// --- design tokens from the page ---------------------------------------------------------------------

function firstFamilyOf(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  for (const raw of stack.split(",")) {
    const f = raw.trim().replace(/^["']|["']$/g, "");
    if (
      f &&
      !/^(?:serif|sans-serif|monospace|cursive|system-ui|ui-\w+|-apple-system|blinkmacsystemfont|inherit|initial|var\(.*)$/i.test(
        f,
      )
    )
      return f;
  }
  return undefined;
}

function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 6) return value;
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
    (_m, name: string, fb: string | undefined) => {
      const v = vars.get(name);
      return v !== undefined ? resolveVars(v, vars, depth + 1) : (fb ?? "");
    },
  );
}

/** Colours, fonts and rhythm the page declares (custom properties, body, headings, labels). */
function tokensFromPage(
  css: PageCss,
  fontLinks: string[],
): { tokens: DesignTokens; notes: string[]; families: string[] } {
  const vars = new Map<string, string>();
  for (const r of css.rootRules)
    if (!r.at.length)
      for (const d of r.decls) if (d.prop.startsWith("--")) vars.set(d.prop, d.value);
  const rootDecl = (prop: string) => {
    let v: string | undefined;
    for (const r of css.rootRules)
      if (!r.at.length) for (const d of r.decls) if (d.prop === prop) v = d.value;
    return v ? resolveVars(v, vars) : undefined;
  };
  const ruleDecl = (selRe: RegExp, prop: string): string | undefined => {
    let v: string | undefined;
    for (const r of css.rules) {
      if (r.at.length) continue;
      const sel = r.selectors
        .map((s) =>
          s.tokens
            .map((t) =>
              "name" in t ? `${t.type}:${t.name}:${"value" in t ? t.value : ""}` : t.type,
            )
            .join(" "),
        )
        .join(",");
      if (!selRe.test(sel)) continue;
      for (const d of r.decls)
        if (d.prop === prop || (prop === "font-family" && d.prop === "font"))
          v =
            d.prop === "font" ? d.value.split(/\d(?:px|rem|em)(?:\/[\d.]+\w*)?\s+/).pop() : d.value;
    }
    return v ? resolveVars(v, vars) : undefined;
  };
  // Colours: every custom property holding a colour, then the body's own.
  const colors: Record<string, string> = {};
  for (const [k, v] of vars) {
    const hex = toHex6(resolveVars(v, vars).trim());
    if (hex) colors[k.replace(/^--/, "").replace(/^(?:color|colour|c|clr)-/, "") || k] = hex;
  }
  const bodyBg = toHex6(
    (rootDecl("background-color") ?? rootDecl("background") ?? "").trim().split(/\s+/)[0] ?? "",
  );
  const bodyText = toHex6((rootDecl("color") ?? "").trim());
  const read = (() => {
    try {
      return readDesignTokens({ color: colors });
    } catch {
      return undefined;
    }
  })();
  const tokens: DesignTokens = read ? { ...read.tokens } : {};
  const named = { ...(tokens.colors ?? {}) };
  const setRole = (hex: string | undefined, role: "background" | "text", label: string) => {
    if (!hex) return;
    for (const c of Object.values(named)) if (c.role === role && c.value !== hex) delete c.role;
    const hit = Object.entries(named).find(([, c]) => c.value === hex);
    if (hit) hit[1].role = role;
    else named[label] = { value: hex, role };
  };
  setRole(bodyBg, "background", "page");
  setRole(bodyText, "text", "ink");
  if (Object.keys(named).length) tokens.colors = named;
  // Fonts by role.
  const body = firstFamilyOf(rootDecl("font-family"));
  const heading =
    firstFamilyOf(
      ruleDecl(/tag:h1:|tag:h2:|class:\w*(?:display|heading|headline|title)/i, "font-family"),
    ) ?? body;
  const label = firstFamilyOf(
    ruleDecl(/class:\w*(?:label|eyebrow|kicker|overline|caps|nav|btn|button)/i, "font-family"),
  );
  const linked = fontLinks;
  const families = [
    ...new Set([body, heading, label, ...linked, ...css.fontFaces].filter((f): f is string => !!f)),
  ];
  const fonts: NonNullable<DesignTokens["fonts"]> = {};
  if (heading) fonts.heading = { family: heading };
  if (body) fonts.body = { family: body };
  if (label && label !== body && label !== heading) fonts.label = { family: label };
  if (Object.keys(fonts).length) tokens.fonts = fonts;
  // Navigation, wordmark and button lettering (the header is OpenSpace's own: it takes these).
  const px = (v: string | undefined) => {
    const m = v ? /(-?\d*\.?\d+)(px|rem|em)\b/.exec(v) : null;
    return m ? Number(m[1]) * (m[2] === "px" ? 1 : 16) : undefined;
  };
  const step = (re: RegExp) => {
    const size = px(ruleDecl(re, "font-size"));
    if (!size) return undefined;
    const ls = ruleDecl(re, "letter-spacing");
    const lsN = ls
      ? /em$/.test(ls.trim())
        ? Number.parseFloat(ls)
        : (px(ls) ?? 0) / size
      : undefined;
    const tt = ruleDecl(re, "text-transform")?.trim();
    const fam = firstFamilyOf(ruleDecl(re, "font-family"));
    const wRaw = ruleDecl(re, "font-weight")?.trim();
    const weight =
      wRaw && /^\d{3}$/.test(wRaw)
        ? Number(wRaw)
        : wRaw === "bold"
          ? 700
          : wRaw === "normal"
            ? 400
            : undefined;
    const font =
      fam && fam === label
        ? "label"
        : fam && fam === heading && heading !== body
          ? "heading"
          : undefined;
    return {
      size,
      ...(lsN !== undefined && Number.isFinite(lsN)
        ? { letterSpacing: Math.round(lsN * 1000) / 1000 }
        : {}),
      ...(tt && /^(?:uppercase|lowercase|capitalize|none)$/.test(tt)
        ? { case: tt as "uppercase" }
        : {}),
      ...(font ? { font: font as "label" } : {}),
      ...(weight ? { weight } : {}),
    };
  };
  const type: NonNullable<DesignTokens["type"]> = { ...(tokens.type ?? {}) };
  const nav =
    step(/class:(?:nav-link|nav__link|menu-link|nav-item)\b/i) ??
    step(/tag:nav:.*tag:a:|class:(?:nav|menu|navigation)\b.*tag:a:/i);
  if (nav) type.nav = nav;
  const mark = step(/class:(?:wordmark|logo|brand|site-title)\b/i);
  if (mark) type.wordmark = mark;
  const btn = step(/class:(?:btn|button)\b/i);
  if (btn) type.button = btn;
  if (Object.keys(type).length) tokens.type = type;
  // What was read, from the page itself (wave 4: it said "0 font roles … (a design-token file)"
  // for a page whose two fonts were read and used).
  const nColors = Object.keys(tokens.colors ?? {}).length;
  const nType = Object.keys(tokens.type ?? {}).length;
  const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const note = `Read your page’s styles: ${pl(nColors, "colour")}${families.length ? `, its fonts (${families.slice(0, 4).join(", ")})` : ""}${nType ? ` and ${pl(nType, "text style")}` : ""}.`;
  return { tokens, notes: [note], families };
}

/** Google Fonts `<link>` hrefs → family names. */
function linkFamilies(hrefs: string[]): string[] {
  const out: string[] = [];
  for (const h of hrefs) {
    let u: URL;
    try {
      u = new URL(h.replace(/&amp;/g, "&"));
    } catch {
      continue;
    }
    if (!/fonts\.googleapis\.com$/.test(u.host)) continue;
    for (const fam of u.searchParams.getAll("family"))
      for (const f of fam.split("|")) {
        const name = f.split(":")[0]?.replace(/\+/g, " ").trim();
        if (name && !out.includes(name)) out.push(name);
      }
  }
  return out;
}

// --- links ------------------------------------------------------------------------------------------

/** An href in a page → a site path (`/about#team`) or an absolute address, or undefined. */
function siteHref(
  bundle: HtmlBundle,
  fromPath: string,
  href: string,
  pagePaths: Map<string, string>,
): string | undefined {
  const h = href.trim();
  if (!h || /^javascript:/i.test(h)) return undefined;
  if (/^(?:mailto|tel):/i.test(h)) return h;
  if (h.startsWith("#")) return `${pagePaths.get(fromPath) ?? "/"}${h === "#" ? "" : h}`;
  const hash = /#[\w-]+$/.exec(h)?.[0] ?? "";
  if (bundle.siteUrl) {
    let u: URL;
    try {
      u = new URL(h, bundle.siteUrl);
    } catch {
      return undefined;
    }
    const base = new URL(bundle.siteUrl);
    const samePage =
      u.origin === base.origin &&
      u.pathname.replace(/\/index\.html?$/, "/") === base.pathname.replace(/\/index\.html?$/, "/");
    if (samePage) return `/${u.hash}`;
    return /^https?:$/.test(u.protocol) ? u.toString() : undefined;
  }
  const resolved = resolveRef(bundle, h, fromPath);
  if (!resolved) return /^https?:\/\//i.test(h) ? h : undefined;
  const path = bundlePathOf(resolved);
  if (path && pagePaths.has(path)) return `${pagePaths.get(path)}${hash}`;
  if (path) return undefined;
  return resolved;
}

// --- the import -------------------------------------------------------------------------------------

export async function importHtmlBundle(
  bundle: HtmlBundle,
  opts: HtmlImportOptions,
): Promise<HtmlImportResult> {
  return phoneReady(await importBundle(bundle, opts));
}

async function importBundle(
  bundle: HtmlBundle,
  opts: HtmlImportOptions,
): Promise<HtmlImportResult> {
  const progress = opts.onProgress ?? (() => undefined);
  const now = opts.now ?? new Date();
  const notices: SqNotice[] = [];
  const fetchAll = bundleFetch(bundle, opts.fetch);
  let requests = 0;
  const counted: FetchFn = (url, init) => {
    if (!bundlePathOf(String(url))) requests++;
    return fetchAll(url, init);
  };

  // 1. The pages: the entry and the bundle's pages it links to.
  progress(`Reading ${bundle.label}`);
  const order: string[] = [bundle.entry];
  const pagePaths = new Map<string, string>([[bundle.entry, "/"]]);
  if (!bundle.siteUrl)
    for (let i = 0; i < order.length && order.length < 20; i++) {
      const p = order[i] as string;
      const root = parseDocument(textOf(bundle.files.get(p)));
      for (const a of findAll(root, (e) => e.tagName === "a")) {
        const r = resolveRef(bundle, attr(a, "href") ?? "", p);
        const path = r ? bundlePathOf(r) : undefined;
        if (path && HTML_RE.test(path) && !pagePaths.has(path) && order.length < 20) {
          order.push(path);
          pagePaths.set(path, sitePathFor(path, bundle.entry));
        }
      }
    }

  const pages: PageSource[] = [];
  for (const path of order) {
    let html = textOf(bundle.files.get(path));
    const url = bundle.siteUrl ?? bundleUrl(path);
    let renderedCss = "";
    const scripted =
      /cdn\.tailwindcss\.com|unpkg\.com\/(?:tailwindcss|@tailwindcss)|<script[^>]+type=["']text\/babel/i.test(
        html,
      ) ||
      (/<div id=["'](?:root|app)["']>\s*<\/div>/i.test(html) && /<script/i.test(html));
    if (scripted) {
      if (opts.render) {
        progress(`Rendering ${path} in a browser (its look is made by a script)…`);
        const r = await opts.render(html, url).catch(() => undefined);
        if (r) {
          html = r.html;
          renderedCss = r.css;
        }
      } else
        notices.push({
          kind: "theme",
          where: sitePathFor(path, bundle.entry),
          message:
            "This page builds its look with a script (like the Tailwind CDN); without a browser to render it, some styling may be missing. Run `openspace import html` with Playwright installed for the full look.",
        });
    }
    const root = parseDocument(html);
    const body = bodyOf(root);
    const head = find(root, (e) => e.tagName === "head") ?? root;
    // Stylesheets in document order: linked files and <style> blocks.
    let css = "";
    const fontLinks: string[] = [];
    if (renderedCss) css = renderedCss;
    else
      for (const el of findAll(
        root,
        (e) =>
          (e.tagName === "link" && /stylesheet/i.test(attr(e, "rel") ?? "")) ||
          e.tagName === "style",
      )) {
        if (el.tagName === "style") {
          css += `\n${el.childNodes.map((c) => (c as { value?: string }).value ?? "").join("")}`;
          continue;
        }
        const href = attr(el, "href") ?? "";
        if (/fonts\.googleapis\.com/.test(href)) {
          fontLinks.push(href);
          continue;
        }
        const ref = resolveRef(bundle, href, path);
        if (!ref) continue;
        try {
          const r = await counted(ref);
          if (r.ok) css += `\n${await r.text()}`;
        } catch {
          notices.push({
            kind: "theme",
            where: href,
            message: "A stylesheet couldn't be read; some styling may be missing.",
          });
        }
      }
    // @import of Google Fonts inside CSS.
    for (const m of css.matchAll(
      /@import\s+(?:url\()?["']?(https:\/\/fonts\.googleapis\.com[^"')\s;]+)/g,
    ))
      fontLinks.push(m[1] as string);
    const scripts = findAll(root, (e) => e.tagName === "script")
      .map((s) => s.childNodes.map((c) => (c as { value?: string }).value ?? "").join(""))
      .join("\n");
    const { header, footer, main } = chromeOf(body);
    const skip = new Set([header, footer].filter((x): x is Element => !!x));
    const sections = sectionElements(main === body ? body : main, skip).filter((s) => !skip.has(s));
    pages.push({
      path,
      sitePath: pagePaths.get(path) ?? "/",
      url,
      html,
      root,
      body,
      ...(header ? { header } : {}),
      ...(footer ? { footer } : {}),
      sections,
      css,
      scripts,
      fontLinks,
    });
    void head;
  }
  const home = pages[0] as PageSource;

  // 2. The look: the page's CSS → Site Styles and design tokens.
  progress("Reading the design (colours, fonts, spacing)…");
  const pageCss = new Map<string, PageCss>();
  for (const p of pages) pageCss.set(p.path, readCss(p.css));
  const homeCss = pageCss.get(home.path) as PageCss;
  const fromPage = tokensFromPage(homeCss, linkFamilies(home.fontLinks));
  const theme = themeFromCss(home.css);
  const google = new Set(
    opts.fetch ? await confirmGoogleFonts(fromPage.families, counted as typeof fetch) : [],
  );
  for (const f of Object.values(fromPage.tokens.fonts ?? {}))
    if (f && google.has(f.family.toLowerCase())) f.google = true;

  // 3. The site skeleton (pages, navigation, header, SEO) through the shared mapper.
  const htmlPages = pages.map((p) => ({ p, page: parseHtmlPage(p.html, p.url) }));
  const homePage = (htmlPages[0] as { page: ReturnType<typeof parseHtmlPage> }).page;
  const toSite = (href: string): string | undefined => {
    const s = siteHref(
      bundle,
      home.path,
      href.startsWith(BUNDLE_ORIGIN) ? `/${bundlePathOf(href) ?? ""}` : href,
      pagePaths,
    );
    if (!s) return undefined;
    return s.startsWith("/") ? `${SITE_ORIGIN}${s}` : s;
  };
  const nav: SqNavItem[] = [];
  const navSource = home.header ? findAll(home.header, (e) => e.tagName === "a") : [];
  const brand = home.header
    ? find(
        home.header,
        (e) =>
          e.tagName === "a" &&
          (/brand|logo|wordmark|site-title|home/i.test(classes(e).join(" ")) ||
            (attr(e, "href") ?? "") === "/" ||
            (attr(e, "href") ?? "") === "./" ||
            /index\.html?$/.test(attr(e, "href") ?? "")),
      )
    : undefined;
  let action: SqSite["headerAction"];
  const buttonish = (a: Element) => /btn|button|cta/i.test(classes(a).join(" "));
  for (const a of navSource) {
    if (a === brand) continue;
    const label = text(a).replace(/\s+/g, " ").trim();
    const href = attr(a, "href") ?? "";
    if (!label || label.length > 60) continue;
    const to = toSite(href);
    if (!to) continue;
    if (buttonish(a) && !action) {
      action = { label, href: to };
      continue;
    }
    if (nav.some((n) => n.type === "link" && n.href === to)) continue;
    nav.push({
      type: "link",
      label,
      href: to,
      ...(attr(a, "target") === "_blank" ? { newTab: true } : {}),
    });
  }
  const docTitle = text(find(home.root, (e) => e.tagName === "title"));
  const wordmark = brand ? text(brand).replace(/\s+/g, " ").trim() : "";
  // The page's own wordmark first (wave 4: the header showed the new site's slug-like name
  // instead of "Fern Hollow"); then the name they gave the site.
  const siteTitle = (
    (wordmark && wordmark.length <= 60 ? titleCase(wordmark) : undefined) ??
    opts.title ??
    homePage.siteName ??
    (docTitle.split(/\s+[|·—–-]\s+/)[0] || "My site")
  ).slice(0, 120);
  const logoImg = brand ? find(brand, (e) => e.tagName === "img") : undefined;
  const logoRef = logoImg ? resolveRef(bundle, attr(logoImg, "src") ?? "", home.path) : undefined;

  // Sections: components by default; forms and videos as blocks; failures as presets.
  type Seg =
    | { kind: "component"; el: Element; marker: string; name: string; label: string }
    | { kind: "preset"; marker: string; reason: string };
  const segsByPage = new Map<string, Seg[]>();
  const sqPages: SqPage[] = [];
  const takenNames = new Set<string>();
  const presets: HtmlImportResult["presets"] = [];
  let markerN = 0;
  const marker = () => `os-x-${++markerN}`;
  const dryCtx = (p: PageSource): ConvertContext => {
    const c = pageCss.get(p.path) as PageCss;
    return {
      rules: c.rules,
      rootRules: c.rootRules,
      keyframes: c.keyframes,
      scriptClasses: scriptClassesOf(p.scripts),
      tokens: { colors: new Map(), fonts: new Map() },
      importImage: async (_ref, alt) => ({
        src: "media/placeholder.png" as never,
        alt,
        width: 100,
        height: 100,
      }),
      linkFor: () => ({ type: "url", url: "/" }),
      taken: new Set(),
      notices: [],
      where: p.sitePath,
    };
  };
  progress("Working out each section…");
  for (const { p, page } of htmlPages) {
    const segs: Seg[] = [];
    const sqSections: SqSection[] = [];
    for (const el of p.sections) {
      const name = uniqueName(componentNameFor(el, p.sitePath), takenNames);
      const label = componentLabelFor(el);
      const dry = await new SectionConverter(el, dryCtx(p)).convert(name, label);
      if ("error" in dry) {
        // Presets for what can't be a component (the reason goes in the report).
        const m = marker();
        const mapped = sectionsFrom(wrap(el), p.url, { roles: true });
        mapped.forEach((s, i) => {
          if (i === 0) s.id = m;
          sqSections.push(s);
        });
        segs.push({ kind: "preset", marker: m, reason: dry.error });
        presets.push({ page: p.sitePath, reason: dry.error });
        continue;
      }
      takenNames.add(name);
      const m = marker();
      segs.push({ kind: "component", el, marker: m, name, label });
      // Forms and videos inside the section follow it as blocks.
      const blocks: SqBlock[] = [];
      for (const f of dry.forms) {
        const form = formFromHtml(f);
        if (form === "newsletter") {
          const submit = find(
            f,
            (e) =>
              (e.tagName === "button" && attr(e, "type") !== "button") ||
              (e.tagName === "input" && attr(e, "type") === "submit"),
          );
          const label = submit ? (text(submit) || attr(submit, "value") || "").trim() : "";
          const email = find(f, (e) => e.tagName === "input" && attr(e, "type") === "email");
          const placeholder = email ? attr(email, "placeholder") : undefined;
          blocks.push({
            kind: "newsletter",
            ...(signupAsksName(f) ? { askName: true } : {}),
            ...(label ? { buttonLabel: label.slice(0, 40) } : {}),
            ...(placeholder ? { placeholder } : {}),
          });
        } else if (form) blocks.push({ kind: "form", form });
      }
      for (const src of dry.embeds) {
        const u = resolveRef(bundle, src, p.path) ?? src;
        if (/^https:\/\//.test(u)) blocks.push({ kind: "video", url: u });
      }
      sqSections.push({
        theme: "",
        id: m,
        // The blocks that follow the section sit on its colour.
        ...(dry.background ? { background: { color: dry.background } } : {}),
        layout: {
          mode: "classic",
          rows: blocks.length ? [{ columns: [{ span: 12, blocks }] }] : [],
        },
      });
    }
    segsByPage.set(p.path, segs);
    sqPages.push({
      path: p.sitePath,
      title: (page.title || siteTitle).slice(0, 120),
      ...(p.path === home.path && homePage.title ? {} : {}),
      seo: page.seo,
      sections: sqSections,
    });
  }

  const sq: SqSite = {
    baseUrl: SITE_ORIGIN,
    title: siteTitle,
    ...(homePage.seo.description ? { description: homePage.seo.description } : {}),
    ...(logoRef ? { logo: { url: logoRef, alt: attr(logoImg, "alt") || siteTitle } } : {}),
    ...(homePage.lang ? { locale: homePage.lang } : {}),
    social: homePage.social
      .map((url) => ({ network: socialNetworkOf(url), url }))
      .filter((s) => s.network !== "website"),
    nav,
    ...(action ? { headerAction: action } : {}),
    footer: [],
    theme,
    pages: sqPages,
    collections: [],
    aliases: [],
    customCode: [],
    notices,
    platform: "generic",
    sources: ["the page's HTML and CSS"],
  };
  if (
    home.header &&
    homeCss.rules.some(
      (r) =>
        r.decls.some((d) => d.prop === "position" && /sticky|fixed/.test(d.value)) &&
        r.selectors.some((s) =>
          s.tokens.some(
            (t) =>
              (t.type === "tag" && t.name === "header") ||
              (t.type === "attribute" &&
                t.name === "class" &&
                /header|nav|topbar/i.test(String(t.value))),
          ),
        ),
    )
  )
    sq.theme.headerFixed = true;

  const media = new MediaImporter({
    fetch: counted as typeof fetch,
    ...(opts.resize ? { resize: opts.resize } : {}),
    ...(opts.rasterizeSvg ? { rasterizeSvg: opts.rasterizeSvg } : {}),
    now,
    source: "your page",
  });
  progress("Building the site…");
  const build = await buildSite(sq, { config: opts.config, media, now });
  let doc = build.doc;

  // 4. Site Styles from the page's own colours and fonts (contrast-checked).
  // A wordmark written in capitals stays in capitals (the site title keeps its own spelling).
  if (wordmark && /[A-Z]/.test(wordmark) && wordmark === wordmark.toUpperCase()) {
    const t = fromPage.tokens.type ?? {};
    t.wordmark = { ...(t.wordmark ?? {}), case: "uppercase" };
    fromPage.tokens.type = t;
  }
  const mapped = designSystemStyles(fromPage.tokens, doc.styles, {
    isGoogleFont: (f) => google.has(f.toLowerCase()),
  });
  doc = { ...doc, styles: mapped.styles };
  const compiled = compileStyles(doc.styles);
  const light = compiled.tokens.themes.light as unknown as Record<string, string>;
  const colorVars = new Map<string, string>();
  const sourceHexes = new Set(
    Object.values(fromPage.tokens.colors ?? {}).map((c) => c.value.toLowerCase()),
  );
  for (const role of [
    "background",
    "text",
    "heading",
    "surface",
    "accent",
    "link",
    "border",
    "text-muted",
  ]) {
    const hex = light[role]?.toLowerCase();
    if (hex && sourceHexes.has(hex) && !colorVars.has(hex))
      colorVars.set(hex, `var(--os-color-${role})`);
  }
  const brandHex = compiled.tokens.palette.brand.toLowerCase();
  if (sourceHexes.has(brandHex) && !colorVars.has(brandHex))
    colorVars.set(brandHex, "var(--os-color-brand)");
  const fontVars = new Map<string, string>();
  const ty = doc.styles.choices.typography;
  for (const role of ["heading", "body", "label"] as const) {
    const fam = ty?.[role]?.family;
    if (fam && !fontVars.has(fam.toLowerCase()))
      fontVars.set(fam.toLowerCase(), `var(--os-font-${role})`);
  }

  // 5. Components, with links to the new pages and pictures carried across.
  progress("Making each section editable…");
  const pageIdByPath = new Map<string, Page["id"]>();
  for (const pg of Object.values(doc.pages)) pageIdByPath.set(pg.slug ? `/${pg.slug}` : "/", pg.id);
  const components: Record<string, ComponentDefinition> = {};
  const summaries: HtmlComponentSummary[] = [];
  const anchorsByPage = new Map<string, Set<string>>();
  const linkFor =
    (fromPath: string) =>
    (href: string): Link | undefined => {
      const s = siteHref(bundle, fromPath, href, pagePaths);
      if (!s) return undefined;
      if (/^mailto:/i.test(s)) {
        const email = decodeURIComponent(s.slice(7).split("?")[0] ?? "");
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { type: "email", email } : undefined;
      }
      if (/^tel:/i.test(s)) {
        const phone = decodeURIComponent(s.slice(4)).trim();
        return /^\+?[0-9 ()\-.]{3,30}$/.test(phone) ? { type: "phone", phone } : undefined;
      }
      if (s.startsWith("/")) {
        const [path, hash] = s.split("#") as [string, string | undefined];
        const id = pageIdByPath.get(path.replace(/\/+$/, "") || "/");
        if (!id) return undefined;
        const anchor = hash ? slugId(hash) : undefined;
        return { type: "page", page: id, ...(anchor ? { anchor } : {}) } as Link;
      }
      return /^https?:\/\//.test(s) ? { type: "url", url: s } : undefined;
    };
  const importImage = (fromPath: string) => async (ref: string, alt: string, where: string) => {
    const url = resolveRef(bundle, ref, fromPath);
    if (!url) return undefined;
    return media.image({ url, alt }, where);
  };
  const ctxFor = (p: PageSource, useTokens: boolean): ConvertContext => {
    const c = pageCss.get(p.path) as PageCss;
    return {
      rules: c.rules,
      rootRules: c.rootRules,
      keyframes: c.keyframes,
      scriptClasses: scriptClassesOf(p.scripts),
      tokens: { colors: colorVars, fonts: fontVars },
      importImage: importImage(p.path),
      linkFor: linkFor(p.path),
      taken: takenNames,
      notices,
      where: p.sitePath,
      useTokens,
    };
  };
  const convert = async (p: PageSource, el: Element, name: string, label: string) => {
    let r = await new SectionConverter(el, ctxFor(p, true)).convert(name, label);
    if ("error" in r) r = await new SectionConverter(el, ctxFor(p, false)).convert(name, label);
    return r;
  };
  const pagesOut: Record<string, Page> = {};
  for (const p of pages) {
    const pageId = pageIdByPath.get(p.sitePath);
    const page = pageId ? doc.pages[pageId] : undefined;
    if (!page || !pageId) continue;
    const segs = segsByPage.get(p.path) ?? [];
    const built = page.sections;
    // Built sections grouped by the marker that starts them.
    const groups = new Map<string, Section[]>();
    let current: string | undefined;
    for (const s of built) {
      if (s.anchor && /^os-x-\d+$/.test(s.anchor)) current = s.anchor;
      if (!current) continue;
      const list = groups.get(current) ?? [];
      list.push(s);
      groups.set(current, list);
    }
    const out: Section[] = [];
    const anchors = new Set<string>();
    for (const seg of segs) {
      const group = (groups.get(seg.marker) ?? []).map((s) => {
        const { anchor: _a, ...rest } = s;
        return rest as Section;
      });
      if (seg.kind === "preset") {
        out.push(...group);
        continue;
      }
      const r = await convert(p, seg.el, seg.name, seg.label);
      if ("error" in r) {
        notices.push({
          kind: "unsupported-block",
          where: p.sitePath,
          message: `A section couldn't be made editable as designed (${r.error}); it was left out.`,
        });
        continue;
      }
      components[r.def.name] = r.def;
      const section = componentSection(r.def, { fields: r.fields, colorTheme: "light" });
      section.label = seg.label;
      if (r.anchor && !anchors.has(r.anchor)) {
        section.anchor = r.anchor;
        anchors.add(r.anchor);
      }
      section.style = { ...section.style, colorTheme: "light", padding: { d: "none" } };
      out.push(section);
      // The section's form/video blocks (if any) follow it.
      out.push(...group.filter((s) => s.blocks.length));
      summaries.push({
        name: r.def.name,
        label: r.def.label,
        page: p.sitePath,
        fields: countFields(r.def.fields),
        cssBytes: r.def.css?.length ?? 0,
        templateBytes: r.def.template.length,
      });
    }
    anchorsByPage.set(p.sitePath, anchors);
    pagesOut[pageId] = { ...page, sections: out.length ? out : page.sections };
  }
  doc = { ...doc, pages: { ...doc.pages, ...pagesOut } };

  // The footer: a component too (or the mapper's default line when the page has none).
  if (home.footer) {
    const name = uniqueName("site-footer", takenNames);
    const r = await convert(home, home.footer, name, "Footer");
    if (!("error" in r)) {
      takenNames.add(name);
      components[r.def.name] = r.def;
      const section = componentSection(r.def, { fields: r.fields, colorTheme: "light" });
      section.label = "Footer";
      section.style = { ...section.style, colorTheme: "light", padding: { d: "none" } };
      doc = { ...doc, site: { ...doc.site, footer: section } };
      summaries.push({
        name,
        label: "Footer",
        page: "footer",
        fields: countFields(r.def.fields),
        cssBytes: r.def.css?.length ?? 0,
        templateBytes: r.def.template.length,
      });
    }
  }
  if (Object.keys(components).length) doc = { ...doc, components };
  // Navigation anchors that point at sections that exist.
  doc = {
    ...doc,
    site: {
      ...doc.site,
      nav: doc.site.nav.map((n) =>
        n.type === "page" &&
        n.anchor &&
        !anchorsByPage
          .get([...pageIdByPath.entries()].find(([, id]) => id === n.page)?.[0] ?? "/")
          ?.has(n.anchor)
          ? (({ anchor: _x, ...rest }) => rest)(n)
          : n,
      ) as SiteDocument["site"]["nav"],
    },
  };
  if (home.header && headerIsDark(home.header, homeCss, fromPage.tokens))
    doc = { ...doc, site: { ...doc.site, header: { ...doc.site.header, colorTheme: "dark" } } };

  // 6. The design-system record (what Claude keeps to from now on).
  const at = now.toISOString();
  const record: DesignSystem = {
    version: 1,
    brand: { name: siteTitle.slice(0, 120) },
    tokens: fromPage.tokens,
    mapping: {
      notes: [...fromPage.notes, ...mapped.notes].slice(0, 40),
      contrast: mapped.contrast.slice(0, 80),
    },
    rules: [
      "The page's own sections were brought across as designer components: keep their look, edit their fields.",
      "New sections: use the colours and fonts above through Site Styles (var(--os-color-…), var(--os-font-…)).",
    ],
    components: Object.fromEntries(
      summaries.map((s) => [
        s.name,
        {
          purpose: `${s.label} (from ${s.page === "footer" ? "the footer" : `the ${s.page} page`})`,
          source: opts.sourceLabel ?? bundle.label,
        },
      ]),
    ),
    sources: [
      { kind: "html", name: (opts.sourceLabel ?? bundle.label).slice(0, 200), format: "html", at },
    ],
    updatedAt: at,
  };
  doc = { ...doc, designSystem: record };

  const parsed = SiteDocumentSchema.safeParse(doc);
  if (!parsed.success)
    throw new Error(
      `The imported page doesn't make a valid site (a bug in the importer): ${parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  doc = parsed.data;
  build.doc = doc;
  build.notices.push(
    ...notices.filter((n) => !build.notices.includes(n)),
    ...media.notices.filter((n) => !build.notices.includes(n)),
  );
  // The mapper's "no content" placeholders are gone; their notices too.
  build.notices = build.notices.filter(
    (n) => !/No content could be read from this page|had no Heading 1/.test(n.message),
  );

  let bytes = 0;
  for (const b of media.files.values()) bytes += b.length;
  const label = opts.sourceLabel ?? bundle.label;
  let report = renderReport({
    sq,
    build,
    mediaFiles: media.files.size,
    mediaBytes: bytes,
    requests,
    owner: false,
    wxr: false,
    now,
  })
    .replace(SITE_ORIGIN, label)
    .replace("`openspace import url`", "`openspace import html`");
  report += componentsReport(summaries, presets);
  return {
    site: sq,
    doc,
    build,
    files: media.files,
    report,
    checklist: setupChecklist(sq, build),
    requests,
    liveUrl: bundle.siteUrl ?? "",
    components: summaries,
    presets,
  };
}

function componentsReport(
  summaries: HtmlComponentSummary[],
  presets: HtmlImportResult["presets"],
): string {
  const L: string[] = ["", "## Designed sections", ""];
  if (!summaries.length) L.push("No sections were made into designer components.");
  else {
    L.push(
      `${summaries.length} section${summaries.length === 1 ? " keeps its" : "s keep their"} own design as a designer component. Every word, picture and link in ${summaries.length === 1 ? "it is a field" : "them is a field"} you edit in Studio; the design itself changes only through Component code (designers) or Claude.`,
      "",
      "| Section | Page | Fields | CSS |",
      "|---|---|---|---|",
    );
    for (const s of summaries)
      L.push(
        `| ${s.label} (\`${s.name}\`) | ${s.page} | ${s.fields} | ${(s.cssBytes / 1000).toFixed(1)} KB |`,
      );
  }
  if (presets.length) {
    L.push("", "Sections that use OpenSpace's own section designs instead:", "");
    for (const p of presets) L.push(`- ${p.page}: ${p.reason}`);
  }
  L.push("");
  return L.join("\n");
}

function countFields(
  fields: Record<string, { kind: string; fields?: Record<string, unknown> }>,
): number {
  let n = 0;
  for (const f of Object.values(fields))
    n += f.kind === "list" && f.fields ? countFields(f.fields as never) : 1;
  return n;
}

function wrap(el: Element): Element {
  return {
    nodeName: "div",
    tagName: "div",
    attrs: [],
    namespaceURI: "http://www.w3.org/1999/xhtml",
    childNodes: [el],
    parentNode: null,
  } as unknown as Element;
}

function componentNameFor(el: Element, pagePath: string): string {
  const id = attr(el, "id");
  const cls = classes(el).find(
    (c) =>
      /^[a-zA-Z][\w-]{2,30}$/.test(c) &&
      !/^(?:section|wrap|container|block|g-|bg-|is-|has-|js-|reveal|fade|py-|px-|pt-|pb-|mt-|mb-|flex|grid)/i.test(
        c,
      ),
  );
  const heading = find(el, (e) => /^h[1-3]$/.test(e.tagName));
  const words = text(heading).split(/\s+/).slice(0, 3).join(" ");
  const raw =
    (id && id.length > 2 && !/^(?:top|main|content|section\d*)$/i.test(id) ? id : undefined) ??
    cls ??
    (words || el.tagName);
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "s-$1")
    .slice(0, 30)
    .replace(/-+$/, "");
  const prefix = pagePath === "/" ? "" : `${pagePath.split("/").filter(Boolean).pop()}-`;
  return `${prefix}${slug || "section"}`
    .replace(/^[^a-z]+/, "s-")
    .slice(0, 36)
    .replace(/-+$/, "");
}

function componentLabelFor(el: Element): string {
  const heading = find(el, (e) => /^h[1-3]$/.test(e.tagName));
  const t = text(heading).replace(/\s+/g, " ").trim();
  const id = attr(el, "id");
  const base = t
    ? t.length > 40
      ? `${t.slice(0, 38).trimEnd()}…`
      : t
    : id
      ? id.replace(/[-_]+/g, " ")
      : "Section";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base.replace(/-+$/, "") || "section";
  if (!/^[a-z]/.test(name)) name = `s-${name}`;
  let n = 2;
  let out = name;
  while (taken.has(out)) out = `${name.slice(0, 36)}-${n++}`;
  return out;
}

function headerIsDark(header: Element, css: PageCss, tokens: DesignTokens): boolean {
  const cls = classes(header);
  for (const r of css.rules) {
    if (r.at.length) continue;
    const hit = r.selectors.some((s) =>
      s.tokens.some(
        (t) =>
          (t.type === "tag" && t.name === "header") ||
          (t.type === "attribute" && t.name === "class" && cls.includes(String(t.value))),
      ),
    );
    if (!hit) continue;
    for (const d of r.decls)
      if (d.prop === "background" || d.prop === "background-color") {
        const v = d.value.replace(
          /var\(\s*(--[\w-]+)[^)]*\)/g,
          (_m, n: string) =>
            tokens.colors?.[n.replace(/^--/, "").replace(/^(?:color|colour|c|clr)-/, "")]?.value ??
            "",
        );
        const hex = toHex6(v.trim().split(/\s+/)[0] ?? "");
        if (hex) {
          const [r1, g, b] = [1, 3, 5].map(
            (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
          ) as [number, number, number];
          return 0.2126 * r1 + 0.7152 * g + 0.0722 * b < 0.25;
        }
      }
  }
  return false;
}

function socialNetworkOf(url: string): string {
  const host = (() => {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const map: Array<[RegExp, string]> = [
    [/instagram/, "instagram"],
    [/facebook|fb\.com/, "facebook"],
    [/twitter|x\.com/, "x"],
    [/threads/, "threads"],
    [/bsky/, "bluesky"],
    [/linkedin/, "linkedin"],
    [/youtu/, "youtube"],
    [/tiktok/, "tiktok"],
    [/pinterest/, "pinterest"],
    [/github/, "github"],
    [/spotify/, "spotify"],
    [/soundcloud/, "soundcloud"],
    [/bandcamp/, "bandcamp"],
    [/vimeo/, "vimeo"],
    [/behance/, "behance"],
    [/dribbble/, "dribbble"],
    [/substack/, "substack"],
    [/patreon/, "patreon"],
    [/mastodon/, "mastodon"],
  ];
  return map.find(([re]) => re.test(host))?.[1] ?? "website";
}

export type { Decl };

/** "POWER WITH" (a wordmark set in capitals) → "Power With"; other spellings stay. */
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|\s|[-&])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}
