/**
 * Read any web page into the source model, without a browser: the head (title, description,
 * Open Graph, JSON-LD, robots, generator), the site chrome (header navigation with folders, logo,
 * call-to-action button, footer, social links) and the main content, readability-style — the
 * boilerplate (cookie banners, menus, sidebars, hidden elements) is dropped, the rest is split into
 * sections, rows and columns, and every element becomes the closest source block: text (headings,
 * paragraphs, lists), images, galleries, cards, buttons, forms, quotes and testimonials, tables,
 * videos, maps and embeds. Sections get a role (hero, features, gallery, testimonials, CTA,
 * contact) so the mapper can recreate them with the nearest OpenSpace section preset.
 *
 * Platform hints (Wix's `#SITE_HEADER`, Webflow's `w-` classes, WordPress's `wp-block-*`) only
 * help find things; nothing here depends on them.
 */
import {
  attr,
  children,
  classes,
  type Element,
  find,
  findAll,
  innerHtml,
  isElement,
  type Node,
  outerHtml,
  parseDocument,
  parseHtmlFragment,
  scriptText,
  text,
} from "../dom";
import { stripTags, videoUrl } from "../squarespace/blocks";
import { cssColorToHex } from "../squarespace/theme";
import type {
  SectionRole,
  SqBlock,
  SqCard,
  SqForm,
  SqFormField,
  SqFormFieldType,
  SqImage,
  SqNavItem,
  SqRow,
  SqSection,
  SqSeo,
} from "../types";
import { bestIcon } from "./icons";
import { backgroundImageOf, imageFromImg, isDecorative } from "./image";

export interface HtmlArticle {
  date?: string;
  modified?: string;
  author?: string;
  image?: SqImage;
  tags: string[];
  categories: string[];
  excerpt?: string;
}

export interface HtmlPage {
  url: string;
  /** Site path (`/about`, `/`). */
  path: string;
  /** The page's own title (its Heading 1, else the document title without the site name). */
  title: string;
  /** `<title>`. */
  docTitle: string;
  seo: SqSeo;
  lang?: string;
  generator?: string;
  favicon?: string;
  /** `og:site_name` or the JSON-LD WebSite/Organization name. */
  siteName?: string;
  header: {
    nav: SqNavItem[];
    logo?: SqImage;
    siteTitle?: string;
    action?: { label: string; href: string };
    /** The header sits on top of the first section (transparent over a hero). */
    overlay?: boolean;
    sticky?: boolean;
  };
  footer: SqSection[];
  social: string[];
  sections: SqSection[];
  inlineCss: string;
  stylesheets: string[];
  /** Third-party scripts (analytics, chat widgets…): reported, never copied. */
  scripts: string[];
  /** Same-site links on the page (for crawling). */
  links: string[];
  article?: HtmlArticle;
  bodyClasses: string[];
  /** JSON-LD objects on the page. */
  jsonLd: Record<string, unknown>[];
  /** Approximate amount of readable text in the main content (detects script-built pages). */
  textLength: number;
}

export interface ExtractOptions {
  /** Classes the site's CSS hides on desktop (see `hiddenClassesFromCss`). */
  hiddenClasses?: ReadonlySet<string>;
  /** A known content root (WordPress `entry-content`, a REST body) instead of detection. */
  contentRoot?: Element;
  /** Skip the page's first Heading 1 (it becomes the item title). */
  dropTitle?: boolean;
}

// --- small helpers ---------------------------------------------------------------------------------

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const idClass = (el: Element) => `${attr(el, "id") ?? ""} ${classes(el).join(" ")}`;
const has = (el: Element, re: RegExp) => re.test(idClass(el));

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const TEXT_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "pre",
  "dl",
  "address",
]);
const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "link",
  "meta",
  "head",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "dialog",
  "canvas",
  "object",
]);
const INLINE_TAGS = new Set([
  "a",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "small",
  "sup",
  "sub",
  "br",
  "mark",
  "code",
  "abbr",
  "time",
  "s",
  "del",
  "ins",
  "cite",
  "q",
  "font",
  "wbr",
]);
const BOILERPLATE =
  /(?:^|[\s_-])(?:cookie|consent|gdpr|cc-window|popup|modal|skip-link|skip-to|screen-reader|sr-only|visually-hidden|visuallyhidden|w-nav-overlay|mobile-menu|menu-overlay|offcanvas|breadcrumbs?|pagination|nav-links|post-navigation|comments?-area|comment-respond|share-buttons|sharedaddy|jp-relatedposts|wp-block-navigation|search-form|searchform|announcement-bar|back-to-top|wixui-anchor-menu|elementor-hidden|w-form-done|w-form-fail|w-webflow-badge|contact-form-submission|contact-form-success)(?:$|[\s_-])/i;

/** Classes the site's CSS hides on desktop (responsive duplicates such as `hide-desktop`). */
let hiddenClasses: ReadonlySet<string> = new Set();

/**
 * Classes hidden at desktop widths: `display:none` in rules outside media queries or inside
 * `min-width` ones (mobile-only copies of headings and menus).
 */
export function hiddenClassesFromCss(css: string): Set<string> {
  const out = new Set<string>();
  const shown = new Set<string>();
  const scan = (chunk: string, desktop: boolean) => {
    for (const m of chunk.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const body = (m[2] as string).replace(/\s+/g, "");
      const display = /display:([a-z-]+)/i.exec(body)?.[1];
      if (!display) continue;
      for (const sel of (m[1] as string).split(",")) {
        const cls = /^\s*\.([A-Za-z_][\w-]*)\s*$/.exec(sel)?.[1];
        if (!cls) continue;
        if (display === "none" && desktop) out.add(cls);
        else if (display !== "none" && desktop) shown.add(cls);
      }
    }
  };
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // Top level (outside at-rules) and @media blocks, brace-aware.
  let depth = 0;
  let top = "";
  let i = 0;
  while (i < stripped.length) {
    if (stripped.startsWith("@media", i) && depth === 0) {
      const open = stripped.indexOf("{", i);
      if (open < 0) break;
      const cond = stripped.slice(i, open);
      let d = 1;
      let j = open + 1;
      while (j < stripped.length && d > 0) {
        if (stripped[j] === "{") d++;
        else if (stripped[j] === "}") d--;
        j++;
      }
      const desktop =
        /min-width\s*:\s*(\d+)/.test(cond) &&
        Number(/min-width\s*:\s*(\d+)/.exec(cond)?.[1]) <= 1280 &&
        !/max-width/.test(cond);
      if (desktop) scan(stripped.slice(open + 1, j - 1), true);
      i = j;
      continue;
    }
    const ch = stripped[i] as string;
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
    top += ch;
    i++;
  }
  scan(top, true);
  for (const c of shown) if (!out.has(c)) shown.delete(c);
  // Toggled states (menus, dropdowns) are not "hidden copies".
  for (const c of out)
    if (
      /open|active|current|show|visible|w--|dropdown|nav|menu|modal|tab-pane|faq|accordion|answer|collapse/i.test(
        c,
      )
    )
      out.delete(c);
  return out;
}

/** Not shown (hidden attribute, `display:none`, aria-hidden decoration). */
function invisible(el: Element): boolean {
  if (attr(el, "hidden") !== undefined) return true;
  if (attr(el, "aria-hidden") === "true" && !find(el, (e) => e.tagName === "img")) return true;
  const style = (attr(el, "style") ?? "").replace(/\s+/g, "");
  if (/display:none|visibility:hidden/i.test(style)) return true;
  if (hiddenClasses.size && classes(el).some((c) => hiddenClasses.has(c))) return true;
  return false;
}

/** Not content: invisible, or boilerplate (cookie banners, menus, sharing, comments…). */
function hidden(el: Element): boolean {
  return invisible(el) || BOILERPLATE.test(idClass(el));
}

const LATEST_POSTS = /(?:^|\s)wp-block-latest-posts(?:\s|$)/;

/** Children that carry content (text, media or a form). */
function contentChildren(el: Element): Element[] {
  return children(el).filter((c) => !SKIP_TAGS.has(c.tagName) && !hidden(c) && hasContent(c));
}

function hasContent(el: Element): boolean {
  if (LATEST_POSTS.test(classes(el).join(" "))) return true;
  if (
    el.tagName === "img" ||
    el.tagName === "iframe" ||
    el.tagName === "video" ||
    el.tagName === "hr"
  )
    return true;
  if (el.tagName === "form") return true;
  if (text(el)) return true;
  return (
    !!find(
      el,
      (e) =>
        (e.tagName === "img" && !isDecorative(e)) ||
        e.tagName === "iframe" ||
        e.tagName === "video" ||
        e.tagName === "form" ||
        !!backgroundImageOf(e, "https://x.invalid/"),
    ) || !!backgroundImageOf(el, "https://x.invalid/")
  );
}

/** Direct text (not inside child elements). */
function ownText(el: Element): string {
  return clean(
    el.childNodes
      .filter((n) => n.nodeName === "#text")
      .map((n) => (n as { value?: string }).value ?? "")
      .join(" "),
  );
}

function hasBlockChild(el: Element): boolean {
  return children(el).some(
    (c) => !INLINE_TAGS.has(c.tagName) && !SKIP_TAGS.has(c.tagName) && !hidden(c),
  );
}

/** Media or interactive content inside (not plain text). */
const hasMedia = (el: Element) =>
  !!find(el, (e) =>
    ["img", "picture", "iframe", "video", "form", "table", "audio"].includes(e.tagName),
  );

/** Same-site test. */
export function sameSite(u: URL, base: string): boolean {
  const b = new URL(base);
  return u.host.replace(/^www\./, "") === b.host.replace(/^www\./, "");
}

/** Normalize an href to a site path, or undefined when it leaves the site. */
export function sitePath(href: string, base: string): string | undefined {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol) || !sameSite(u, base)) return undefined;
    let p = u.pathname;
    try {
      p = decodeURI(p);
    } catch {
      // keep encoded
    }
    return p.replace(/\/index\.html?$/i, "/").replace(/\/+$/, "") || "/";
  } catch {
    return undefined;
  }
}

// --- buttons, forms, embeds -------------------------------------------------------------------------

const BUTTON_CLASS =
  /(?:^|[\s_-])(?:btn|button|cta|w-button|wp-block-button__link|wp-element-button|elementor-button|wixui-button|framer-button|sqs-block-button-element)(?:$|[\s_-])/i;

export function isButtonLink(a: Element): boolean {
  if (a.tagName !== "a" || !attr(a, "href")) return false;
  const label = text(a);
  if (!label || label.length > 40) return false;
  return (
    BUTTON_CLASS.test(classes(a).join(" ")) ||
    attr(a, "role") === "button" ||
    (a.parentNode && isElement(a.parentNode as Node)
      ? BUTTON_CLASS.test(classes(a.parentNode as Element).join(" ")) &&
        text(a.parentNode as Element) === label
      : false)
  );
}

const SEARCHY = /search|\bs\b|\bq\b/i;

function fieldLabel(form: Element, input: Element): string {
  const id = attr(input, "id");
  if (id) {
    const lab = find(form, (e) => e.tagName === "label" && attr(e, "for") === id);
    if (lab && text(lab)) return text(lab).replace(/\s*\*$/, "");
  }
  let p = input.parentNode as Node | null;
  for (let i = 0; p && isElement(p) && i < 3; i++, p = p.parentNode as Node | null)
    if ((p as Element).tagName === "label") {
      const t = text(p as Element);
      if (t) return t.replace(/\s*\*$/, "");
    }
  return (
    attr(input, "aria-label") ??
    attr(input, "placeholder") ??
    attr(input, "title") ??
    (attr(input, "name") ?? "").replace(/[_\-[\]]+/g, " ").trim()
  );
}

const INPUT_TYPES: Record<string, SqFormFieldType> = {
  text: "text",
  email: "email",
  tel: "phone",
  url: "website",
  number: "number",
  date: "date",
  "datetime-local": "date",
  time: "time",
  file: "file",
  checkbox: "checkbox",
  radio: "radio",
};

/** A form's fields, or undefined for search/login forms. */
export function formFromHtml(form: Element): SqForm | "newsletter" | undefined {
  if (attr(form, "role") === "search" || /search/i.test(attr(form, "action") ?? ""))
    return undefined;
  const inputs = findAll(form, (e) => ["input", "select", "textarea"].includes(e.tagName)).filter(
    (e) => {
      const t = (attr(e, "type") ?? "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(t)) return false;
      if (attr(e, "tabindex") === "-1" || /honeypot|hp_|_hp|ak_hp/i.test(idClass(e))) return false;
      let p = e.parentNode as Node | null;
      for (let i = 0; p && isElement(p) && i < 4; i++, p = p.parentNode as Node | null)
        if (hidden(p as Element)) return false;
      return true;
    },
  );
  if (!inputs.length) return undefined;
  if (inputs.some((e) => (attr(e, "type") ?? "").toLowerCase() === "password")) return undefined;
  const only = inputs.length === 1 ? (inputs[0] as Element) : undefined;
  if (
    only &&
    (attr(only, "type") === "search" ||
      (SEARCHY.test(attr(only, "name") ?? "") && !/mail/i.test(attr(only, "name") ?? "")))
  )
    return undefined;
  if (
    inputs.length <= 2 &&
    inputs.some((e) => attr(e, "type") === "email" || /mail/i.test(attr(e, "name") ?? "")) &&
    inputs.every((e) => attr(e, "type") === "email" || /mail|name/i.test(attr(e, "name") ?? ""))
  )
    return "newsletter";
  const fields: SqFormField[] = [];
  const groups = new Map<string, SqFormField>();
  for (const e of inputs) {
    const t = e.tagName === "input" ? (attr(e, "type") ?? "text").toLowerCase() : e.tagName;
    const required = attr(e, "required") !== undefined || attr(e, "aria-required") === "true";
    if (t === "radio" || t === "checkbox") {
      const name = attr(e, "name") ?? fieldLabel(form, e);
      const option = fieldLabel(form, e) || attr(e, "value") || "Yes";
      const g = groups.get(name);
      if (g) {
        g.options = [...(g.options ?? []), option];
        if (t === "radio") g.type = "radio";
        continue;
      }
      // Group label: the fieldset legend, else the option itself (a single checkbox).
      let legend: string | undefined;
      let p = e.parentNode as Node | null;
      for (let i = 0; p && isElement(p) && i < 5; i++, p = p.parentNode as Node | null)
        if ((p as Element).tagName === "fieldset") {
          legend = text(find(p as Element, (x) => x.tagName === "legend"));
          break;
        }
      const f: SqFormField = {
        type: t === "radio" ? "radio" : "checkbox",
        label: legend || option,
        required,
        ...(legend ? { options: [option] } : {}),
      };
      groups.set(name, f);
      fields.push(f);
      continue;
    }
    const label = fieldLabel(form, e) || "Field";
    let type: SqFormFieldType =
      e.tagName === "textarea"
        ? "textarea"
        : e.tagName === "select"
          ? "select"
          : (INPUT_TYPES[t] ?? "text");
    if (type === "text" && /\bname\b/i.test(label) && !/company|business/i.test(label))
      type = "name";
    if (type === "text" && /e-?mail/i.test(label)) type = "email";
    if (type === "text" && /phone|tel/i.test(label)) type = "phone";
    const options =
      e.tagName === "select"
        ? findAll(e, (o) => o.tagName === "option")
            .filter((o) => attr(o, "value") !== "" && !attr(o, "disabled"))
            .map((o) => text(o))
            .filter(Boolean)
        : undefined;
    fields.push({
      type,
      label,
      required,
      ...(attr(e, "placeholder") && attr(e, "placeholder") !== label
        ? { placeholder: attr(e, "placeholder") }
        : {}),
      ...(options?.length ? { options } : {}),
      ...(type === "text" && t !== "text" && !INPUT_TYPES[t] ? { rawType: t } : {}),
    });
  }
  const submit =
    find(form, (e) => e.tagName === "button" && (attr(e, "type") ?? "submit") === "submit") ??
    find(form, (e) => e.tagName === "input" && attr(e, "type") === "submit");
  const submitLabel = submit ? text(submit) || attr(submit, "value") : undefined;
  const name =
    attr(form, "aria-label") ??
    attr(form, "name") ??
    (attr(form, "id") && !/^\w+-\d+$/.test(attr(form, "id") ?? "")
      ? attr(form, "id")
      : undefined) ??
    "Contact form";
  return {
    name: clean(name.replace(/[-_]+/g, " ")) || "Contact form",
    fields,
    ...(submitLabel ? { submitLabel: clean(submitLabel) } : {}),
  };
}

/** Google Maps embed → coordinates. */
function mapFromIframe(src: string): SqBlock | undefined {
  if (!/google\.[a-z.]+\/maps|maps\.google\./.test(src)) return undefined;
  const pb = /!2d(-?[\d.]+)!3d(-?[\d.]+)/.exec(src);
  const q = /[?&](?:q|ll|center)=(-?[\d.]+),\s*(-?[\d.]+)/.exec(decodeURIComponent(src));
  const lat = pb ? Number(pb[2]) : q ? Number(q[1]) : Number.NaN;
  const lng = pb ? Number(pb[1]) : q ? Number(q[2]) : Number.NaN;
  const place = /[?&]q=([^&]+)/.exec(src)?.[1];
  let name: string | undefined;
  try {
    name = place ? decodeURIComponent(place.replace(/\+/g, " ")) : undefined;
  } catch {
    name = undefined;
  }
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    return {
      kind: "map",
      lat,
      lng,
      ...(name && !/^-?[\d.]+,/.test(name) ? { address: name } : {}),
    };
  return undefined;
}

function iframeBlock(iframe: Element, base: string): SqBlock | undefined {
  const src =
    attr(iframe, "src") ?? attr(iframe, "data-src") ?? attr(iframe, "data-lazy-src") ?? "";
  if (!src || src === "about:blank") return undefined;
  const v = videoUrl(src);
  if (v)
    return {
      kind: "video",
      url: v,
      ...(attr(iframe, "title") ? { title: attr(iframe, "title") } : {}),
    };
  const map = mapFromIframe(src);
  if (map) return map;
  try {
    const u = new URL(src, base);
    if (u.protocol !== "https:") return undefined;
    return { kind: "embed", url: u.toString() };
  } catch {
    return undefined;
  }
}

// --- testimonials, cards, galleries ---------------------------------------------------------------

const TESTIMONIAL = /testimonial|review|kundenstimme|t[ée]moignage|quote-card|client-quote/i;

function testimonialFrom(el: Element, base: string): SqBlock | undefined {
  const t = text(el);
  if (!t || t.length > 900) return undefined;
  const bq = el.tagName === "blockquote" ? el : find(el, (e) => e.tagName === "blockquote");
  const cite =
    find(el, (e) => e.tagName === "cite" || e.tagName === "figcaption") ??
    find(
      el,
      (e) =>
        /author|name|cite|attribution|client/i.test(idClass(e)) && !!text(e) && text(e).length < 80,
    );
  const paras = findAll(bq ?? el, (e) => e.tagName === "p" && !!text(e)).filter(
    (p) =>
      !cite || (p !== cite && !findAll(cite, () => true).includes(p) && text(p) !== text(cite)),
  );
  const quoteHtml = paras.length
    ? paras.map((p) => outerHtml(p)).join("")
    : `<p>${escapeHtml(
        text(bq ?? el)
          .replace(cite ? text(cite) : "", "")
          .trim(),
      )}</p>`;
  if (!stripTags(quoteHtml)) return undefined;
  let name = cite ? text(cite).replace(/^[—–-]\s*/, "") : undefined;
  let role: string | undefined;
  if (name?.includes(",")) {
    const [n, ...r] = name.split(",");
    name = n?.trim();
    role = r.join(",").trim() || undefined;
  }
  const photoEl = find(el, (e) => e.tagName === "img" && !isDecorative(e));
  const photo = photoEl ? imageFromImg(photoEl, base) : undefined;
  return {
    kind: "testimonial",
    html: quoteHtml,
    ...(name ? { name: name.slice(0, 80) } : {}),
    ...(role ? { role } : {}),
    ...(photo ? { photo } : {}),
  };
}

const signature = (el: Element) => `${el.tagName}.${classes(el)[0] ?? ""}`;

function similarChildren(el: Element, min: number): Element[] | undefined {
  const kids = contentChildren(el);
  if (kids.length < min) return undefined;
  const counts = new Map<string, number>();
  for (const k of kids) counts.set(signature(k), (counts.get(signature(k)) ?? 0) + 1);
  const top = Math.max(...counts.values());
  return top / kids.length >= 0.7 ? kids : undefined;
}

function cardFrom(el: Element, base: string): SqCard | undefined {
  const h =
    find(el, (e) => HEADINGS.has(e.tagName) && !!text(e)) ??
    find(el, (e) => (e.tagName === "strong" || e.tagName === "b") && !!text(e));
  if (!h) return undefined;
  const title = text(h);
  if (title.length > 120) return undefined;
  const imgEl = find(el, (e) => e.tagName === "img" && !isDecorative(e));
  const image = imgEl ? imageFromImg(imgEl, base) : backgroundImageOf(el, base);
  const paras = findAll(
    el,
    (e) =>
      (e.tagName === "p" || e.tagName === "ul" || e.tagName === "ol") &&
      !!text(e) &&
      !find(e, (x) => x === h),
  ).filter((p) => !findAll(p, () => true).includes(h));
  const linkEl =
    el.tagName === "a"
      ? el
      : (find(el, (e) => e.tagName === "a" && !!attr(e, "href") && isButtonLink(e)) ??
        find(h, (e) => e.tagName === "a"));
  const href = linkEl ? attr(linkEl, "href") : undefined;
  const label = linkEl && linkEl !== el && isButtonLink(linkEl) ? text(linkEl) : undefined;
  const html = paras
    .filter((p) => !(label && text(p) === label))
    .map((p) => outerHtml(p))
    .join("");
  return {
    title,
    ...(html ? { html } : {}),
    ...(image ? { image } : {}),
    ...(href && !href.startsWith("#") ? { href } : {}),
    ...(label ? { linkLabel: label } : {}),
  };
}

/** A grid of 3+ similar cards (heading + short text, often an image or link each). */
function cardGrid(el: Element, base: string): SqBlock | undefined {
  const kids = similarChildren(el, 3);
  if (!kids || kids.length > 48) return undefined;
  if (
    kids.some(
      (k) => HEADINGS.has(k.tagName) || k.tagName === "p" || find(k, (e) => e.tagName === "form"),
    )
  )
    return undefined;
  const cards: SqCard[] = [];
  for (const k of kids) {
    if (text(k).length > 700) return undefined;
    const c = cardFrom(k, base);
    if (!c) return undefined;
    cards.push(c);
  }
  return { kind: "cards", items: cards };
}

/** 3+ children that are each essentially a picture. */
function galleryGrid(el: Element, base: string): SqBlock | undefined {
  const kids = contentChildren(el);
  const isWpGallery = classes(el).includes("wp-block-gallery") || has(el, /\bgallery\b/);
  if (kids.length < (isWpGallery ? 2 : 3)) return undefined;
  const images: (SqImage & { caption?: string; href?: string })[] = [];
  for (const k of kids) {
    const imgs = findAll(k, (e) => e.tagName === "img" && !isDecorative(e));
    const selfImg = k.tagName === "img" ? [k] : imgs;
    if (selfImg.length !== 1) return undefined;
    const cap = text(find(k, (e) => e.tagName === "figcaption"));
    if (text(k).length - cap.length > 60) return undefined;
    const im = imageFromImg(selfImg[0] as Element, base);
    if (!im) return undefined;
    const a = k.tagName === "a" ? k : find(k, (e) => e.tagName === "a");
    const href = a ? attr(a, "href") : undefined;
    images.push({
      ...im,
      ...(cap ? { caption: cap } : {}),
      ...(href && !/\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(href) ? { href } : {}),
    });
  }
  return {
    kind: "gallery",
    images,
    layout: has(el, /masonry/)
      ? "masonry"
      : has(el, /slider|slideshow|carousel|swiper|slick/)
        ? "slideshow"
        : "grid",
  };
}

/** FAQ-style lists: `<details>`, or similar items with a short question and an answer. */
function accordionFrom(el: Element): SqBlock | undefined {
  const meaningful = children(el).filter((c) => !SKIP_TAGS.has(c.tagName) && text(c));
  const details = meaningful.filter((c) => c.tagName === "details");
  const kids =
    details.length >= 2 && details.length === meaningful.length
      ? details
      : /faq|accordion|question|toggle|collapsible/i.test(idClass(el))
        ? children(el).filter((c) => !SKIP_TAGS.has(c.tagName) && text(c))
        : [];
  if (kids.length < 2) return undefined;
  const items: { title: string; html: string }[] = [];
  for (const k of kids) {
    const q =
      find(k, (e) => e.tagName === "summary") ??
      find(
        k,
        (e) => HEADINGS.has(e.tagName) || /question|title|heading|toggle|trigger/i.test(idClass(e)),
      );
    if (!q || !text(q) || text(q).length > 200) return undefined;
    const answerText = text(k).replace(text(q), "").trim();
    if (!answerText) return undefined;
    const paras = findAll(
      k,
      (e) =>
        (e.tagName === "p" || e.tagName === "ul" || e.tagName === "ol") &&
        !findAll(q, () => true).includes(e) &&
        e !== q,
    );
    items.push({
      title: text(q),
      html: paras.length
        ? paras.map((p) => outerHtml(p)).join("")
        : `<p>${escapeHtml(answerText)}</p>`,
    });
  }
  return items.length >= 2 ? { kind: "accordion", items } : undefined;
}

// --- columns ------------------------------------------------------------------------------------------

const ROW_HINT =
  /(?:^|[\s_-])(?:row|columns?|cols?|grid|split|two-up|halves|w-row|w-layout-grid|w-layout-hflex|wp-block-columns|wp-block-media-text|is-layout-flex|is-layout-grid|flex|container-split|stripColumnsContainer|wixui-column-strip|elementor-row|elementor-container|et_pb_row|vc_row)(?:$|[\s_-])/i;

function spanHint(el: Element, n: number): number {
  const c = classes(el).join(" ");
  const m =
    /(?:w-col|col)-(?:(?:xs|sm|md|lg|xl|medium|small|large)-)?(\d{1,2})\b/.exec(c) ??
    /(?:large|medium)-(\d{1,2})\b/.exec(c);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return Number(m[1]);
  const basis = /flex-basis\s*:\s*([\d.]+)%|width\s*:\s*([\d.]+)%/.exec(attr(el, "style") ?? "");
  const pct = basis ? Number(basis[1] ?? basis[2]) : Number.NaN;
  if (pct > 5 && pct <= 100) return Math.max(1, Math.round((pct / 100) * 12));
  return Math.round(12 / n);
}

/** 2–4 side-by-side children with real content each. */
function isColumnRow(el: Element): boolean {
  const kids = contentChildren(el);
  if (kids.length < 2 || kids.length > 4) return false;
  if (
    kids.some((k) => TEXT_TAGS.has(k.tagName) || INLINE_TAGS.has(k.tagName) || k.tagName === "img")
  )
    return false;
  if (kids.every((k) => TESTIMONIAL.test(idClass(k)))) return false;
  const substantial = kids.filter((k) => text(k).length >= 30 || hasMedia(k));
  if (substantial.length !== kids.length) return false;
  const style = (attr(el, "style") ?? "").replace(/\s+/g, "");
  return (
    ROW_HINT.test(idClass(el)) ||
    /display:(?:flex|grid)/.test(style) ||
    attr(el, "data-testid") === "columns" ||
    kids.every((k) => /(?:^|[\s_-])(?:col|column|w-col|wp-block-column|cell)/i.test(idClass(k)))
  );
}

// --- the walker ----------------------------------------------------------------------------------------

interface WalkCtx {
  base: string;
  /** Old path of the posts collection (WordPress "latest posts" blocks list it). */
  postsPath?: string;
  /** Drop this element (the item's Heading 1). */
  drop?: Element;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Blocks for a leaf-ish element. `out` collects; consecutive text merges. */
function leafBlocks(el: Element, ctx: WalkCtx, out: SqBlock[]) {
  const pushText = (html: string) => {
    const last = out[out.length - 1];
    if (last?.kind === "text") last.html += html;
    else out.push({ kind: "text", html });
  };
  const tag = el.tagName;
  if (el === ctx.drop) return;
  if (
    /^icon[-_][\w-]+$/i.test(text(el)) ||
    /material-icons|material-symbols/.test(classes(el).join(" "))
  )
    return;
  const acc = accordionFrom(el);
  if (acc) {
    out.push(acc);
    return;
  }
  if (LATEST_POSTS.test(classes(el).join(" "))) {
    out.push({ kind: "summary", ...(ctx.postsPath ? { collectionPath: ctx.postsPath } : {}) });
    return;
  }
  if (tag === "hr") {
    out.push({ kind: "line" });
    return;
  }
  if (tag === "form") {
    const f = formFromHtml(el);
    if (f === "newsletter") {
      const btn = find(
        el,
        (e) => e.tagName === "button" || (e.tagName === "input" && attr(e, "type") === "submit"),
      );
      const input = find(
        el,
        (e) =>
          e.tagName === "input" &&
          (attr(e, "type") === "email" || /mail/i.test(attr(e, "name") ?? "")),
      );
      out.push({
        kind: "newsletter",
        ...(btn && (text(btn) || attr(btn, "value"))
          ? { buttonLabel: text(btn) || attr(btn, "value") }
          : {}),
        ...(input && attr(input, "placeholder") ? { placeholder: attr(input, "placeholder") } : {}),
      });
    } else if (f) out.push({ kind: "form", form: f });
    return;
  }
  if (tag === "iframe") {
    const b = iframeBlock(el, ctx.base);
    if (b) out.push(b);
    return;
  }
  if (tag === "video") {
    const src =
      attr(el, "src") ??
      attr(
        find(el, (e) => e.tagName === "source"),
        "src",
      );
    const v = src ? videoUrl(src) : undefined;
    if (v) out.push({ kind: "video", url: v });
    else if (src) out.push({ kind: "unknown", type: "video file", text: "" });
    return;
  }
  if (tag === "audio") {
    const src =
      attr(el, "src") ??
      attr(
        find(el, (e) => e.tagName === "source"),
        "src",
      );
    if (src) {
      try {
        out.push({ kind: "audio", url: new URL(src, ctx.base).toString() });
      } catch {
        // ignore
      }
    }
    return;
  }
  if (tag === "table") {
    const rows = findAll(el, (e) => e.tagName === "tr").map((tr) =>
      findAll(tr, (e) => e.tagName === "td" || e.tagName === "th", { deep: false }).map((c) =>
        text(c),
      ),
    );
    const thead = find(el, (e) => e.tagName === "thead");
    const firstIsHead =
      !!thead ||
      (rows.length > 1 &&
        !!find(findAll(el, (e) => e.tagName === "tr")[0] as Element, (e) => e.tagName === "th"));
    const caption = text(find(el, (e) => e.tagName === "caption"));
    const body = rows.filter((r) => r.some(Boolean));
    if (!body.length) return;
    out.push({
      kind: "table",
      ...(firstIsHead ? { head: body[0] } : {}),
      rows: firstIsHead ? body.slice(1) : body,
      ...(caption ? { caption } : {}),
    });
    return;
  }
  if (tag === "img" || tag === "picture") {
    if (tag === "img" && isDecorative(el)) return;
    const im = imageFromImg(el, ctx.base);
    if (im) out.push({ kind: "image", image: im });
    return;
  }
  if (tag === "blockquote" || (tag === "figure" && find(el, (e) => e.tagName === "blockquote"))) {
    const t = testimonialFrom(el, ctx.base);
    if (t && t.kind === "testimonial" && !t.name) {
      out.push({ kind: "quote", text: stripTags(t.html) });
      return;
    }
    if (t) {
      out.push(t);
      return;
    }
  }
  if (tag === "figure" || (tag === "a" && find(el, (e) => e.tagName === "img") && !text(el))) {
    const imgEl = find(el, (e) => e.tagName === "img" && !isDecorative(e));
    const iframe = find(el, (e) => e.tagName === "iframe");
    if (iframe) {
      const b = iframeBlock(iframe, ctx.base);
      if (b) out.push(b);
      return;
    }
    if (classes(el).some((c) => c.startsWith("wp-block-embed"))) {
      const url = text(el)
        .split(/\s+/)
        .find((w) => /^https?:\/\//.test(w));
      const v = url ? videoUrl(url) : undefined;
      if (v) out.push({ kind: "video", url: v });
      else if (url) out.push({ kind: "embed", url });
      return;
    }
    const table = find(el, (e) => e.tagName === "table");
    if (table) {
      leafBlocks(table, ctx, out);
      const last = out[out.length - 1];
      const cap = text(find(el, (e) => e.tagName === "figcaption"));
      if (last?.kind === "table" && !last.caption && cap) last.caption = cap;
      return;
    }
    if (imgEl) {
      const im = imageFromImg(imgEl, ctx.base);
      const capEl = find(el, (e) => e.tagName === "figcaption");
      // A media object (a book with its cover, title and blurb): the caption is content of its
      // own — a heading and paragraphs — read as blocks under the picture; a small picture (its
      // declared width ≤ 400px) stays at its own size instead of filling the column.
      const structured =
        capEl && !!find(capEl, (e) => HEADINGS.has(e.tagName) || e.tagName === "p");
      if (structured && im) {
        const declared = Number(attr(imgEl, "width") ?? 0);
        const a = find(el, (e) => e.tagName === "a" && !!find(e, (x) => x === imgEl));
        const href = a ? attr(a, "href") : undefined;
        out.push({
          kind: "image",
          image: im,
          ...(declared > 0 && declared <= 400 ? { natural: true } : {}),
          ...(href && !/\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(href) && !href.startsWith("#")
            ? { href }
            : {}),
        });
        walk(capEl, ctx, out, 1);
        return;
      }
      const cap = text(capEl);
      const a =
        tag === "a" ? el : find(el, (e) => e.tagName === "a" && !!find(e, (x) => x === imgEl));
      const href = a ? attr(a, "href") : undefined;
      const declared = Number(attr(imgEl, "width") ?? 0);
      if (im)
        out.push({
          kind: "image",
          image: im,
          ...(declared > 0 && declared <= 400 ? { natural: true } : {}),
          ...(cap ? { caption: cap } : {}),
          ...(href && !/\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(href) && !href.startsWith("#")
            ? { href }
            : {}),
        });
      return;
    }
  }
  if (tag === "a" && isButtonLink(el)) {
    const prevButtons = out.filter((b) => b.kind === "button").length;
    out.push({
      kind: "button",
      label: text(el),
      href: attr(el, "href") as string,
      style:
        /outline|secondary|ghost|alt\b/i.test(classes(el).join(" ")) || prevButtons > 0
          ? "secondary"
          : "primary",
    });
    return;
  }
  if (TEXT_TAGS.has(tag)) {
    // A paragraph that is only a button (or buttons) is a button.
    const links = findAll(el, (e) => e.tagName === "a");
    if (
      links.length &&
      links.every(isButtonLink) &&
      links.map(text).join("").replace(/\s+/g, "") === text(el).replace(/\s+/g, "")
    ) {
      for (const a of links) leafBlocks(a, ctx, out);
      return;
    }
    const imgs = findAll(el, (e) => e.tagName === "img" && !isDecorative(e));
    if (imgs.length && !text(el)) {
      for (const i of imgs) leafBlocks(i, ctx, out);
      return;
    }
    if (!text(el)) return;
    if (HEADINGS.has(tag)) pushText(`<${tag}>${innerHtml(el)}</${tag}>`);
    else pushText(outerHtml(el));
    return;
  }
  // Containers holding only button-styled links are buttons.
  {
    const links = findAll(el, (e) => e.tagName === "a");
    if (
      links.length &&
      links.every(isButtonLink) &&
      links
        .map((a) => text(a))
        .join("")
        .replace(/\s+/g, "") === text(el).replace(/\s+/g, "") &&
      !hasMedia(el)
    ) {
      for (const a of links) leafBlocks(a, ctx, out);
      return;
    }
  }
  // Inline-only containers (a div holding text) read as a paragraph.
  if (!hasBlockChild(el) && text(el)) {
    if (tag === "a" && attr(el, "href")) {
      pushText(`<p>${outerHtml(el)}</p>`);
      return;
    }
    const big = /(?:^|[\s_-])(?:heading|title|headline|display|h[1-3])(?:$|[\s_-])/i.test(
      idClass(el),
    );
    pushText(
      big && text(el).length < 120 ? `<h2>${innerHtml(el)}</h2>` : `<p>${innerHtml(el)}</p>`,
    );
    return;
  }
  walk(el, ctx, out, 0);
}

/** Walk a container: rows of columns flatten into `out` (inside a column) via leafBlocks. */
function walk(el: Element, ctx: WalkCtx, out: SqBlock[], depth: number) {
  if (ownText(el)) {
    // Mixed text and elements: read the whole thing as rich text.
    const imgs = findAll(el, (e) => e.tagName === "img" && !isDecorative(e));
    const last = out[out.length - 1];
    const html = `<p>${innerHtml(el)}</p>`;
    if (last?.kind === "text") last.html += html;
    else out.push({ kind: "text", html });
    for (const i of imgs) leafBlocks(i, ctx, out);
    return;
  }
  for (const c of contentChildren(el)) {
    if (c === ctx.drop) continue;
    if (
      TESTIMONIAL.test(idClass(c)) &&
      !TEXT_TAGS.has(c.tagName) &&
      !INLINE_TAGS.has(c.tagName) &&
      !similarChildren(c, 2)
    ) {
      const t = testimonialFrom(c, ctx.base);
      if (t) {
        out.push(t);
        continue;
      }
    }
    const acc = accordionFrom(c);
    if (acc) {
      out.push(acc);
      continue;
    }
    const grid = depth < 8 ? (galleryGrid(c, ctx.base) ?? cardGrid(c, ctx.base)) : undefined;
    if (grid) {
      out.push(grid);
      continue;
    }
    const bg = backgroundImageOf(c, ctx.base);
    if (bg && !text(c) && !find(c, (e) => e.tagName === "img")) {
      out.push({ kind: "image", image: bg });
      continue;
    }
    if (
      LATEST_POSTS.test(classes(c).join(" ")) ||
      accordionFrom(c) ||
      TEXT_TAGS.has(c.tagName) ||
      [
        "img",
        "picture",
        "figure",
        "blockquote",
        "table",
        "iframe",
        "video",
        "audio",
        "form",
        "hr",
      ].includes(c.tagName) ||
      (c.tagName === "a" && (isButtonLink(c) || !hasBlockChild(c))) ||
      !hasBlockChild(c) ||
      depth > 12
    )
      leafBlocks(c, ctx, out);
    else walk(c, ctx, out, depth + 1);
  }
}

/** A container's content as rows (side-by-side columns kept, everything else full width). */
function rowsOf(el: Element, ctx: WalkCtx): SqRow[] {
  const rows: SqRow[] = [];
  let flat: SqBlock[] = [];
  const pushFlat = () => {
    if (flat.length) rows.push({ columns: [{ span: 12, blocks: flat }] });
    flat = [];
  };
  const visit = (node: Element, depth: number) => {
    if (ownText(node)) {
      walk(node, ctx, flat, depth);
      return;
    }
    for (const c of contentChildren(node)) {
      if (c === ctx.drop) continue;
      if (depth < 6 && isColumnRow(c) && !galleryGrid(c, ctx.base) && !cardGrid(c, ctx.base)) {
        pushFlat();
        const kids = contentChildren(c);
        rows.push({
          columns: kids.map((k) => {
            const blocks: SqBlock[] = [];
            if (hasBlockChild(k) || ownText(k)) walk(k, ctx, blocks, 0);
            else leafBlocks(k, ctx, blocks);
            return { span: spanHint(k, kids.length), blocks };
          }),
        });
        continue;
      }
      const isLeaf =
        LATEST_POSTS.test(classes(c).join(" ")) ||
        !!accordionFrom(c) ||
        TEXT_TAGS.has(c.tagName) ||
        [
          "img",
          "picture",
          "figure",
          "blockquote",
          "table",
          "iframe",
          "video",
          "audio",
          "form",
          "hr",
          "a",
        ].includes(c.tagName) ||
        !hasBlockChild(c) ||
        !!galleryGrid(c, ctx.base) ||
        !!cardGrid(c, ctx.base) ||
        (TESTIMONIAL.test(idClass(c)) && !TEXT_TAGS.has(c.tagName) && !similarChildren(c, 2));
      if (isLeaf || depth >= 6) {
        const before = flat.length;
        walk({ ...c, childNodes: [c] } as unknown as Element, ctx, flat, depth);
        if (flat.length === before && !isLeaf) walk(c, ctx, flat, depth + 1);
      } else visit(c, depth + 1);
    }
  };
  visit(el, 0);
  pushFlat();
  return rows;
}

// --- sections --------------------------------------------------------------------------------------

/** Elements that start their own section inside flat content (WordPress covers, full-width groups). */
const SECTION_LIKE =
  /(?:^|\s)(?:wp-block-cover|alignfull|has-background|wp-block-group|elementor-section|et_pb_section|vc_row|section)(?:$|\s)/i;

function sectionTheme(el: Element): string {
  const style = attr(el, "style") ?? "";
  const bg = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|rgba?\([^)]*\)|hsla?\([^)]*\))/i.exec(
    style,
  )?.[1];
  const hex = bg ? cssColorToHex(bg) : undefined;
  if (hex) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    if (l < 0.2) return "black";
    if (l < 0.45) return chroma > 0.2 ? "bright" : "dark";
    if (chroma > 0.3) return "bright";
    if (l < 0.97) return "light";
    return "white";
  }
  const c = idClass(el);
  if (
    /(?:^|[\s_-])(?:dark|inverse|inverted|bg-black|bg-dark|is-style-dark|has-black-background-color|has-contrast-background-color)(?:$|[\s_-])/i.test(
      c,
    )
  )
    return "dark";
  if (/has-primary-background-color|has-accent-background-color|bg-primary|bg-brand/i.test(c))
    return "bright";
  if (/has-(?:[a-z-]+)-background-color|bg-light|bg-gray|bg-grey|alt-bg|tinted/i.test(c))
    return "light";
  return "";
}

function sectionBackground(el: Element, base: string): SqImage | undefined {
  const own = backgroundImageOf(el, base);
  if (own) return own;
  // Cover-style: an absolutely positioned / background-classed <img> as the first child.
  for (const c of children(el).slice(0, 3)) {
    const bg = backgroundImageOf(c, base);
    if (bg && !text(c)) return bg;
    const img =
      c.tagName === "img"
        ? c
        : c.tagName === "picture" ||
            c.tagName === "div" ||
            c.tagName === "span" ||
            c.tagName === "figure"
          ? find(c, (e) => e.tagName === "img")
          : undefined;
    if (
      img &&
      !text(c) &&
      (/(?:^|[\s_-])(?:bg|background|cover|hero-image|backdrop|wp-block-cover__image-background|bgImage|bgMedia)(?:$|[\s_-])/i.test(
        `${idClass(c)} ${idClass(img)}`,
      ) ||
        /object-fit\s*:\s*cover|position\s*:\s*absolute/i.test(
          `${attr(c, "style") ?? ""}${attr(img, "style") ?? ""}`,
        ) ||
        attr(c, "data-testid") === "bgMedia")
    ) {
      const im = imageFromImg(img, base);
      if (im) return { ...im, alt: "" };
    }
  }
  return undefined;
}

/** Remove a background element from what the walker sees. */
function withoutBackground(el: Element, bgImg: SqImage | undefined, base: string): Element {
  if (!bgImg) return el;
  const kids = el.childNodes.filter((c) => {
    if (!isElement(c)) return true;
    if (text(c)) return true;
    const img = c.tagName === "img" ? c : find(c, (e) => e.tagName === "img");
    const bg = backgroundImageOf(c, base);
    if (bg?.url === bgImg.url) return false;
    if (img && imageFromImg(img, base)?.url === bgImg.url) return false;
    return true;
  });
  return { ...el, attrs: el.attrs.filter((a) => a.name !== "style"), childNodes: kids } as Element;
}

const ROLE_HINTS: [RegExp, SectionRole][] = [
  [
    /(?:^|[\s_-])(?:hero|banner|masthead|jumbotron|intro-header|page-header|splash|wp-block-cover)(?:$|[\s_-])/i,
    "hero",
  ],
  [/testimonial|reviews?\b/i, "testimonials"],
  [/(?:^|[\s_-])(?:cta|call-to-action|signup-band)(?:$|[\s_-])/i, "cta"],
  [/(?:^|[\s_-])contact(?:$|[\s_-])/i, "contact"],
  [/(?:^|[\s_-])(?:features?|services?|benefits|offerings|what-we-do)(?:$|[\s_-])/i, "features"],
  [/(?:^|[\s_-])(?:gallery|portfolio|work-grid)(?:$|[\s_-])/i, "gallery"],
];

function textLen(blocks: SqBlock[]): number {
  let n = 0;
  for (const b of blocks)
    if (b.kind === "text") n += stripTags(b.html).length;
    else if (b.kind === "heading") n += b.text.length + (b.subheading?.length ?? 0);
  return n;
}

function classify(sec: SqSection, index: number, el: Element | undefined): SectionRole | undefined {
  const blocks =
    sec.layout.mode === "classic"
      ? sec.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
      : [];
  if (!blocks.length) return undefined;
  const kinds = blocks.map((b) => b.kind);
  const len = textLen(blocks);
  const firstHeading = (() => {
    for (const b of blocks) if (b.kind === "text") return /<h([1-6])/i.exec(b.html)?.[1];
    return undefined;
  })();
  if (kinds.includes("form")) return "contact";
  const hint = el ? ROLE_HINTS.find(([re]) => re.test(idClass(el)))?.[1] : undefined;
  if (
    index === 0 &&
    (firstHeading === "1" || hint === "hero") &&
    len < 900 &&
    (sec.background?.image || kinds.includes("image") || kinds.includes("button"))
  )
    return "hero";
  const quotes = kinds.filter((k) => k === "testimonial" || k === "quote").length;
  if (quotes && quotes >= (blocks.length - 1) / 2) return "testimonials";
  if (kinds.includes("gallery") && kinds.every((k) => k === "gallery" || k === "text") && len < 400)
    return "gallery";
  if (kinds.includes("cards")) return "features";
  if (
    index > 0 &&
    kinds.includes("button") &&
    len < 400 &&
    !kinds.some((k) => k === "image" || k === "gallery" || k === "cards") &&
    blocks.length <= 5
  )
    return "cta";
  if (hint && hint !== "hero" && hint !== "contact") return hint;
  return undefined;
}

/**
 * In a role section, the opening heading (with a short eyebrow before it and a short line after
 * it) becomes a heading block — the shape OpenSpace's section presets use.
 */
function liftHeading(sec: SqSection) {
  if (sec.layout.mode !== "classic") return;
  for (const row of sec.layout.rows)
    for (const col of row.columns) {
      const i = col.blocks.findIndex((b) => b.kind === "text");
      if (i < 0) continue;
      const tb = col.blocks[i] as Extract<SqBlock, { kind: "text" }>;
      const frag = parseHtmlFragment(tb.html);
      const kids = children(frag);
      let hi = kids.findIndex((k) => HEADINGS.has(k.tagName));
      // A small heading right above a bigger one is an eyebrow.
      const k0 = kids[0];
      const k1 = kids[1];
      if (
        hi === 0 &&
        k0 &&
        k1 &&
        /^h[4-6]$/.test(k0.tagName) &&
        /^h[1-3]$/.test(k1.tagName) &&
        text(k0).length <= 60
      )
        hi = 1;
      if (hi < 0 || hi > 1) return;
      const h = kids[hi] as Element;
      const eyebrowEl = hi === 1 ? kids[0] : undefined;
      if (
        eyebrowEl &&
        ((eyebrowEl.tagName !== "p" && !HEADINGS.has(eyebrowEl.tagName)) ||
          text(eyebrowEl).length > 60)
      )
        return;
      const after = kids[hi + 1];
      const sub =
        after &&
        after.tagName === "p" &&
        text(after).length <= 280 &&
        !find(after, (e) => e.tagName === "a")
          ? after
          : undefined;
      const rest = kids.slice(hi + 1 + (sub ? 1 : 0));
      const level = Math.min(4, Math.max(1, Number(h.tagName.slice(1)))) as 1 | 2 | 3 | 4;
      const heading: SqBlock = {
        kind: "heading",
        text: text(h),
        level,
        ...(eyebrowEl ? { eyebrow: text(eyebrowEl) } : {}),
        ...(sub ? { subheading: text(sub) } : {}),
      };
      const replacement: SqBlock[] = [heading];
      if (rest.length)
        replacement.push({ kind: "text", html: rest.map((r) => outerHtml(r)).join("") });
      col.blocks.splice(i, 1, ...replacement);
      return;
    }
}

/**
 * A row of small pictures side by side (thumbnails, each linking to the full photo): one gallery
 * grid, as visitors saw it, instead of each picture stretched across the column.
 */
function thumbnailRuns(blocks: SqBlock[]): SqBlock[] {
  const out: SqBlock[] = [];
  let run: Extract<SqBlock, { kind: "image" }>[] = [];
  const flush = () => {
    if (run.length >= 3)
      out.push({
        kind: "gallery",
        layout: "grid",
        images: run.map((b) => b.image),
      });
    else out.push(...run);
    run = [];
  };
  for (const b of blocks) {
    if (b.kind === "image" && !b.caption && (b.image.width ?? 999) <= 240) run.push(b);
    else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
}

function toSection(el: Element, ctx: WalkCtx): SqSection | undefined {
  const bg = sectionBackground(el, ctx.base);
  const inner = withoutBackground(el, bg, ctx.base);
  const rows = rowsOf(inner, ctx).filter((r) => r.columns.some((c) => c.blocks.length));
  for (const r of rows) for (const c of r.columns) c.blocks = thumbnailRuns(c.blocks);
  if (!rows.length && !bg) return undefined;
  const style = attr(el, "style") ?? "";
  const tall = /min-height\s*:\s*(\d+)(vh|px)/i.exec(style);
  return {
    theme: bg ? "" : sectionTheme(el),
    ...(bg ? { background: { image: bg, overlay: 0 } } : {}),
    ...(tall && (tall[2] === "vh" ? Number(tall[1]) >= 60 : Number(tall[1]) >= 600)
      ? { height: "large" as const }
      : {}),
    layout: { mode: "classic", rows },
    ...(attr(el, "id") && /^[a-z][\w-]{1,40}$/i.test(attr(el, "id") ?? "")
      ? { id: attr(el, "id") }
      : {}),
  };
}

const isLeafy = (el: Element) =>
  TEXT_TAGS.has(el.tagName) ||
  ["img", "picture", "figure", "blockquote", "table", "iframe", "hr", "a", "video"].includes(
    el.tagName,
  ) ||
  !hasBlockChild(el);

/** Split the main content into section elements (`flat`: a post body, blocks in a row). */
function sectionElements(main: Element, flat = false): Element[] {
  let el = main;
  for (let i = 0; i < 12; i++) {
    const kids = contentChildren(el);
    if (
      kids.length === 1 &&
      !isLeafy(kids[0] as Element) &&
      !isColumnRow(kids[0] as Element) &&
      !backgroundImageOf(kids[0] as Element, "https://x.invalid/") &&
      !SECTION_LIKE.test(` ${classes(kids[0] as Element).join(" ")} `)
    )
      el = kids[0] as Element;
    else break;
  }
  const kids = contentChildren(el);
  if (!kids.length) return [el];
  const leafy = kids.filter(isLeafy).length;
  if (flat || leafy / kids.length >= 0.5) {
    // Flat content (an article, a WordPress page): runs of plain blocks, with full-width
    // covers and groups as their own sections.
    const out: Element[] = [];
    let run: Node[] = [];
    const flush = () => {
      if (run.length) out.push({ ...el, attrs: [], childNodes: run } as unknown as Element);
      run = [];
    };
    for (const k of kids) {
      if (
        !isLeafy(k) &&
        SECTION_LIKE.test(` ${classes(k).join(" ")} ${k.tagName === "section" ? "section" : ""} `)
      ) {
        flush();
        out.push(k);
      } else run.push(k);
    }
    flush();
    return out;
  }
  // Each child is a section; a child that only wraps several <section>s is expanded.
  const out: Element[] = [];
  for (const k of kids) {
    const inner = contentChildren(k);
    if (inner.length >= 2 && inner.every((x) => x.tagName === "section")) out.push(...inner);
    else out.push(k);
  }
  return out;
}

/** Sections of a content element (used for page bodies, WordPress content, item bodies). */
export function sectionsFrom(
  main: Element,
  base: string,
  opts: { drop?: Element; roles?: boolean; postsPath?: string; flat?: boolean } = {},
): SqSection[] {
  const ctx: WalkCtx = {
    base,
    ...(opts.drop ? { drop: opts.drop } : {}),
    ...(opts.postsPath ? { postsPath: opts.postsPath } : {}),
  };
  const out: SqSection[] = [];
  const els = sectionElements(opts.flat ? prune(main, new Set()) : main, opts.flat);
  for (const el of els) {
    const s = toSection(el, ctx);
    if (!s) continue;
    if (opts.roles !== false && els.length > 1) {
      const role = classify(s, out.length, el);
      if (role) {
        s.role = role;
        liftHeading(s);
      }
    }
    out.push(s);
  }
  return mergeTitleSections(out);
}

/**
 * A page title kept in a wrapper of its own (WordPress's `.entry-header` above `.entry-content`)
 * opens the content that follows: one section, not a heading alone in a band of space.
 */
function mergeTitleSections(sections: SqSection[]): SqSection[] {
  const out: SqSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i] as SqSection;
    const next = sections[i + 1];
    const blocks =
      s.layout.mode === "classic"
        ? s.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
        : [];
    const onlyTitle =
      blocks.length === 1 &&
      !s.background &&
      !s.role &&
      ((blocks[0]?.kind === "heading" && blocks[0].level <= 2) ||
        (blocks[0]?.kind === "text" &&
          /^\s*<h[12][^>]*>[^<]*(?:<[^h/][^>]*>[^<]*<\/[^>]+>[^<]*)*<\/h[12]>\s*$/i.test(
            blocks[0].html,
          )));
    if (
      onlyTitle &&
      next &&
      !next.background &&
      !next.role &&
      next.layout.mode === "classic" &&
      next.layout.rows[0]?.columns.length === 1
    ) {
      next.layout.rows[0].columns[0]?.blocks.unshift(blocks[0] as SqBlock);
      continue;
    }
    out.push(s);
  }
  return out;
}

// --- chrome ------------------------------------------------------------------------------------------

const SOCIAL_HOSTS =
  /(?:^|\.)(?:instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|threads\.net|bsky\.app|linkedin\.com|youtube\.com|youtu\.be|tiktok\.com|pinterest\.[a-z.]+|github\.com|spotify\.com|soundcloud\.com|bandcamp\.com|vimeo\.com|behance\.net|dribbble\.com|substack\.com|patreon\.com|yelp\.[a-z.]+|tripadvisor\.[a-z.]+|mastodon\.social|tumblr\.com|medium\.com|whatsapp\.com|wa\.me|t\.me|discord\.gg)$/i;

export function isSocialUrl(href: string): boolean {
  try {
    return SOCIAL_HOSTS.test(new URL(href).host.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

function headerEl(body: Element): Element | undefined {
  const inMain = (e: Element) => {
    let p = e.parentNode as Node | null;
    while (p && isElement(p)) {
      if (["main", "article"].includes((p as Element).tagName)) return true;
      p = p.parentNode as Node | null;
    }
    return false;
  };
  return (
    find(body, (e) => attr(e, "id") === "SITE_HEADER") ??
    find(
      body,
      (e) =>
        (e.tagName === "header" || attr(e, "role") === "banner") && !inMain(e) && !invisible(e),
    ) ??
    find(
      body,
      (e) =>
        /(?:^|\s)(?:w-nav|navbar|site-header|masthead|header)(?:$|\s)/i.test(
          classes(e).join(" "),
        ) && !inMain(e),
    ) ??
    find(body, (e) => e.tagName === "nav" && !inMain(e))
  );
}

function footerEl(body: Element): Element | undefined {
  const wix = find(body, (e) => attr(e, "id") === "SITE_FOOTER");
  if (wix) return wix;
  const all = findAll(body, (e) => e.tagName === "footer" || attr(e, "role") === "contentinfo", {
    deep: false,
  });
  const outer = all.filter((e) => {
    let p = e.parentNode as Node | null;
    while (p && isElement(p)) {
      if (["main", "article", "blockquote", "figure"].includes((p as Element).tagName))
        return false;
      p = p.parentNode as Node | null;
    }
    return true;
  });
  return (
    outer[outer.length - 1] ??
    find(body, (e) => /(?:^|\s)(?:site-footer|footer)(?:$|\s)/i.test(classes(e).join(" ")))
  );
}

/** "H O M E" (letter-spaced with real spaces) → "HOME". */
export function unspace(s: string): string {
  return /^(?:\S ){2,}\S$/.test(s)
    ? s.replace(/ (?=\S)/g, (m, i: number) => (s[i - 1] === " " ? m : "")).replace(/\s{2,}/g, " ")
    : s;
}

function linkItem(a: Element): { label: string; href: string; newTab?: boolean } | undefined {
  const href = attr(a, "href");
  const label = unspace(clean(text(a) || attr(a, "aria-label") || attr(a, "title") || ""));
  if (!href || !label || href.startsWith("javascript:") || label.length > 60) return undefined;
  if (href === "#" || (href.startsWith("#") && href.length < 2)) return undefined;
  return { label, href, ...(attr(a, "target") === "_blank" ? { newTab: true } : {}) };
}

function navFromHeader(header: Element, base: string): HtmlPage["header"] {
  const anchors = findAll(header, (e) => e.tagName === "a" && !!attr(e, "href"));
  // Logo: an image in a link home, or anything called logo.
  const homeLink = anchors.find((a) => sitePath(attr(a, "href") as string, base) === "/");
  const logoImg =
    (homeLink ? find(homeLink, (e) => e.tagName === "img") : undefined) ??
    find(
      header,
      (e) =>
        e.tagName === "img" &&
        /logo|brand/i.test(`${idClass(e)} ${attr(e, "alt") ?? ""} ${attr(e, "src") ?? ""}`),
    );
  const logo = logoImg ? imageFromImg(logoImg, base) : undefined;
  const siteTitle =
    homeLink && text(homeLink) && text(homeLink).length <= 60 ? text(homeLink) : undefined;
  // Navigation: the list with most links (desktop menu), with sub-lists as folders.
  const lists = findAll(header, (e) => (e.tagName === "ul" || e.tagName === "ol") && !invisible(e));
  const topLists = lists.filter((l) => {
    let p = l.parentNode as Node | null;
    while (p && isElement(p) && p !== header) {
      if ((p as Element).tagName === "li") return false;
      p = p.parentNode as Node | null;
    }
    return true;
  });
  const best = topLists
    .map((l) => ({ l, n: findAll(l, (e) => e.tagName === "a").length }))
    .sort((a, b) => b.n - a.n)[0];
  const nav: SqNavItem[] = [];
  const seen = new Set<string>();
  const key = (l: { label: string; href: string }) =>
    `${l.label.toLowerCase()}|${sitePath(l.href, base) ?? l.href}`;
  let action: HtmlPage["header"]["action"];
  const consider = (a: Element) => {
    if (a === homeLink && !text(a)) return undefined;
    const item = linkItem(a);
    if (!item || isSocialUrl(new URL(item.href, base).toString())) return undefined;
    if (a === homeLink && siteTitle && item.label === siteTitle) return undefined;
    if (
      /^(?:cart|bag|basket|log ?in|sign ?in|account|search|menu|close|open menu|skip to content)$/i.test(
        item.label,
      )
    )
      return undefined;
    return item;
  };
  if (best && best.n >= 2) {
    for (const li of children(best.l).filter((c) => c.tagName === "li")) {
      const sub = find(li, (e) => e.tagName === "ul" || e.tagName === "ol");
      const own = find(
        li,
        (e) => e.tagName === "a" && (!sub || !findAll(sub, () => true).includes(e)),
      );
      if (sub) {
        const items = findAll(sub, (e) => e.tagName === "a")
          .map(consider)
          .filter((x): x is NonNullable<typeof x> => !!x);
        const label = clean(own ? text(own) : text(li).replace(text(sub), "") || "");
        if (items.length && label) {
          if (own && attr(own, "href") && !attr(own, "href")?.startsWith("#")) {
            const self = consider(own);
            const samePath = (x: { href: string }) => sitePath(x.href, base) ?? x.href;
            if (self && !items.some((i) => samePath(i) === samePath(self))) items.unshift(self);
          }
          nav.push({ type: "folder", label: unspace(label).slice(0, 60), items });
          continue;
        }
      }
      if (!own) continue;
      const item = consider(own);
      if (!item || seen.has(key(item))) continue;
      seen.add(key(item));
      if (isButtonLink(own)) action = { label: item.label, href: item.href };
      else nav.push({ type: "link", ...item });
    }
  } else {
    // Webflow dropdowns and plain link rows.
    const dropdowns = findAll(header, (e) =>
      /(?:^|\s)w-dropdown(?:\s|$)/.test(classes(e).join(" ")),
    );
    const inDropdown = new Set(dropdowns.flatMap((d) => findAll(d, (e) => e.tagName === "a")));
    for (const d of dropdowns) {
      const label = text(find(d, (e) => /w-dropdown-toggle/.test(classes(e).join(" "))));
      const items = findAll(d, (e) => e.tagName === "a")
        .map(consider)
        .filter((x): x is NonNullable<typeof x> => !!x);
      if (label && items.length) nav.push({ type: "folder", label, items });
    }
    for (const a of anchors) {
      if (inDropdown.has(a) || invisible(a)) continue;
      const item = consider(a);
      if (!item || seen.has(key(item))) continue;
      seen.add(key(item));
      if (isButtonLink(a)) action = { label: item.label, href: item.href };
      else nav.push({ type: "link", ...item });
    }
  }
  // A trailing button-styled link in the header is its call to action.
  if (!action) {
    const btn = [...anchors]
      .reverse()
      .find((a) => isButtonLink(a) && !isSocialUrl(attr(a, "href") ?? ""));
    const item = btn ? consider(btn) : undefined;
    if (item) {
      action = { label: item.label, href: item.href };
      const i = nav.findIndex((n) => n.type === "link" && key(n) === key(item));
      if (i >= 0) nav.splice(i, 1);
    }
  }
  const style = `${attr(header, "style") ?? ""} ${idClass(header)}`;
  return {
    nav: nav.slice(0, 40),
    ...(logo ? { logo } : {}),
    ...(siteTitle ? { siteTitle } : {}),
    ...(action ? { action } : {}),
    ...(/position\s*:\s*(?:fixed|sticky)|sticky|fixed/i.test(style) ? { sticky: true } : {}),
    ...(/transparent|absolute|overlay/i.test(style) ? { overlay: true } : {}),
  };
}

// --- head ----------------------------------------------------------------------------------------

function metaContent(head: Element, key: string): string | undefined {
  const m = find(
    head,
    (e) =>
      e.tagName === "meta" &&
      (attr(e, "name") === key || attr(e, "property") === key || attr(e, "itemprop") === key),
  );
  const v = m ? attr(m, "content") : undefined;
  return v ? clean(v) : undefined;
}

function metaAll(head: Element, key: string): string[] {
  return findAll(
    head,
    (e) => e.tagName === "meta" && (attr(e, "property") === key || attr(e, "name") === key),
  )
    .map((e) => clean(attr(e, "content") ?? ""))
    .filter(Boolean);
}

function jsonLdOf(root: Element): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of findAll(
    root,
    (e) => e.tagName === "script" && attr(e, "type") === "application/ld+json",
  )) {
    try {
      const v = JSON.parse(scriptText(s)) as unknown;
      const push = (x: unknown) => {
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          if (Array.isArray(o["@graph"])) for (const g of o["@graph"]) push(g);
          else out.push(o);
        }
      };
      if (Array.isArray(v)) for (const x of v) push(x);
      else push(v);
    } catch {
      // ignore broken JSON-LD
    }
  }
  return out;
}

const typeIs = (o: Record<string, unknown>, re: RegExp) =>
  [o["@type"]].flat().some((t) => typeof t === "string" && re.test(t));

const PLATFORM_SCRIPT_HOSTS =
  /squarespace|wix|parastorage|webflow|website-files|framer|jquery|cloudflare|jsdelivr|unpkg|googleapis\.com\/ajax|wp-includes|wp-content|shopify|gstatic\.com\/recaptcha|google\.com\/recaptcha|polyfill|carrd/i;

/** Header chrome; when the header has no menu, the site's main navigation wherever it is. */
function chromeHeader(
  body: Element,
  header: Element | undefined,
  base: string,
): HtmlPage["header"] {
  const h = header ? navFromHeader(header, base) : { nav: [] };
  // A header whose only link is the site's own name (sidebar themes keep the menu elsewhere).
  const home = (href: string) => {
    try {
      const u = new URL(href, base);
      return u.origin === new URL(base).origin && /^\/?$/.test(u.pathname);
    } catch {
      return false;
    }
  };
  if (h.nav.length && h.nav.every((i) => i.type === "link" && home(i.href))) h.nav = [];
  if (!h.nav.length) {
    const nav = find(
      body,
      (e) =>
        (e.tagName === "nav" || attr(e, "role") === "navigation") &&
        /main-navigation|site-navigation|primary-menu|main-menu|primary-nav|main-nav|menu-primary|nav-primary/i.test(
          idClass(e),
        ),
    );
    const anyNav =
      nav ??
      findAll(body, (e) => e.tagName === "nav" || attr(e, "role") === "navigation").find((e) => {
        let p = e.parentNode as Node | null;
        while (p && isElement(p)) {
          const t = (p as Element).tagName;
          if (
            t === "main" ||
            t === "footer" ||
            t === "article" ||
            attr(p as Element, "id") === "SITE_FOOTER"
          )
            return false;
          p = p.parentNode as Node | null;
        }
        return findAll(e, (a) => a.tagName === "a" && !!attr(a, "href")).length >= 2;
      });
    if (anyNav) {
      const n = navFromHeader(anyNav, base);
      h.nav = n.nav;
      if (!h.action && n.action) h.action = n.action;
    }
  }
  const titleEl = header
    ? find(header, (e) =>
        /(?:^|\s)(?:site-title|wp-block-site-title|logo-text|brand-name)(?:\s|$)/.test(
          classes(e).join(" "),
        ),
      )
    : undefined;
  if (titleEl && text(titleEl)) h.siteTitle = text(titleEl);
  return h;
}

/** Parse a whole page. */
export function parseHtmlPage(html: string, url: string, opts: ExtractOptions = {}): HtmlPage {
  hiddenClasses = opts.hiddenClasses ?? new Set();
  try {
    return parseHtmlPageInner(html, url, opts);
  } finally {
    hiddenClasses = new Set();
  }
}

function parseHtmlPageInner(html: string, url: string, opts: ExtractOptions): HtmlPage {
  const root = parseDocument(html);
  const base = new URL(url).origin;
  const head = find(root, (e) => e.tagName === "head") ?? root;
  const body = find(root, (e) => e.tagName === "body") ?? root;
  const docTitle = clean(text(find(head, (e) => e.tagName === "title")));
  const jsonLd = jsonLdOf(root);
  const site = jsonLd.find((o) => typeIs(o, /^(?:WebSite|Organization|LocalBusiness)$/));
  const siteName =
    metaContent(head, "og:site_name") ??
    (typeof site?.name === "string" ? clean(site.name) : undefined);
  const header = headerEl(body);
  const footer = footerEl(body);
  // Main content.
  const main =
    opts.contentRoot ??
    find(body, (e) => attr(e, "id") === "PAGES_CONTAINER") ??
    find(body, (e) => e.tagName === "main" || attr(e, "role") === "main") ??
    find(body, (e) =>
      /(?:^|\s)(?:entry-content|post-content|page-content|site-content|content-area)(?:\s|$)/.test(
        classes(e).join(" "),
      ),
    ) ??
    body;
  const exclude = new Set([header, footer].filter((x): x is Element => !!x));
  const content: Element =
    main === body
      ? ({
          ...body,
          childNodes: body.childNodes.filter((c) => !exclude.has(c as Element)),
        } as Element)
      : main;
  // Strip header/footer nested in main (some builders put everything in one wrapper).
  const pruned = prune(content, exclude);
  const h1 = find(pruned, (e) => e.tagName === "h1" && !!text(e));
  const ld = jsonLd.find((o) => typeIs(o, /Article|BlogPosting|NewsArticle|Report/));
  const ogImage = metaContent(head, "og:image") ?? metaContent(head, "twitter:image");
  const description = metaContent(head, "description") ?? metaContent(head, "og:description");
  const robots = metaContent(head, "robots") ?? "";
  const sitePathOfUrl = sitePath(url, base) ?? "/";
  const title =
    (h1 ? text(h1) : undefined) ??
    metaContent(head, "og:title") ??
    stripSuffix(docTitle, siteName) ??
    sitePathOfUrl;
  const sections = sectionsFrom(pruned, base, {
    ...(opts.dropTitle && h1 ? { drop: h1 } : {}),
  });
  // Article metadata.
  const published =
    metaContent(head, "article:published_time") ??
    (typeof ld?.datePublished === "string" ? ld.datePublished : undefined) ??
    attr(
      find(pruned, (e) => e.tagName === "time" && !!attr(e, "datetime")),
      "datetime",
    );
  const author =
    metaContent(head, "author") ??
    metaContent(head, "article:author") ??
    (() => {
      const a = ld?.author;
      const first = Array.isArray(a) ? a[0] : a;
      return first &&
        typeof first === "object" &&
        typeof (first as { name?: unknown }).name === "string"
        ? ((first as { name: string }).name as string)
        : typeof first === "string"
          ? first
          : undefined;
    })();
  const article: HtmlArticle | undefined =
    ld || metaContent(head, "og:type") === "article" || metaContent(head, "article:published_time")
      ? {
          ...(published ? { date: published } : {}),
          ...(metaContent(head, "article:modified_time")
            ? { modified: metaContent(head, "article:modified_time") }
            : {}),
          ...(author && !/^https?:/.test(author) ? { author } : {}),
          ...(ogImage ? { image: { url: new URL(ogImage, base).toString(), alt: "" } } : {}),
          tags: metaAll(head, "article:tag"),
          categories: metaAll(head, "article:section"),
          ...(description ? { excerpt: description } : {}),
        }
      : undefined;
  // Links.
  const links: string[] = [];
  for (const a of findAll(root, (e) => e.tagName === "a" && !!attr(e, "href"))) {
    const p = sitePath(attr(a, "href") as string, base);
    if (p) links.push(p);
  }
  // Social links anywhere outside the main content.
  const social = new Set<string>();
  for (const zone of [header, footer, body].filter((x): x is Element => !!x))
    for (const a of findAll(zone, (e) => e.tagName === "a" && !!attr(e, "href"))) {
      const h = attr(a, "href") as string;
      if (/^https?:/.test(h) && isSocialUrl(h)) social.add(h);
    }
  // Styles and scripts.
  let inlineCss = "";
  for (const s of findAll(root, (e) => e.tagName === "style")) inlineCss += `\n${scriptText(s)}`;
  const styleAttrs = findAll(body, (e) => !!attr(e, "style")).slice(0, 400);
  inlineCss += `\n${styleAttrs.map((e) => `[inline]{${attr(e, "style")}}`).join("\n")}`;
  const stylesheets = findAll(
    root,
    (e) => e.tagName === "link" && /stylesheet/i.test(attr(e, "rel") ?? "") && !!attr(e, "href"),
  )
    .map((e) => attr(e, "href") as string)
    .filter((h) => !/fonts\.googleapis\.com/.test(h));
  const fontLinks = findAll(
    root,
    (e) => e.tagName === "link" && /fonts\.googleapis\.com\/css/.test(attr(e, "href") ?? ""),
  ).map((e) => attr(e, "href") as string);
  for (const f of fontLinks) inlineCss += `\n/* google-fonts: ${f} */`;
  const scripts = new Set<string>();
  for (const s of findAll(root, (e) => e.tagName === "script")) {
    const src = attr(s, "src");
    if (src) {
      try {
        const u = new URL(src, base);
        if (!sameSite(u, base) && !PLATFORM_SCRIPT_HOSTS.test(u.host + u.pathname))
          scripts.add(u.host.replace(/^www\./, ""));
      } catch {
        // ignore
      }
    } else {
      const t = scriptText(s);
      if (
        /gtag\(|googletagmanager|fbq\(|_paq|plausible|hotjar|clarity|intercom|crisp|tawk|hubspot|klaviyo|mailchimp/i.test(
          t,
        )
      )
        scripts.add(
          /gtag|googletagmanager/.test(t)
            ? "Google Analytics / Tag Manager"
            : /fbq/.test(t)
              ? "Meta Pixel"
              : "inline tracking or chat script",
        );
    }
  }
  const favicon = bestIcon(head, base);
  const htmlEl = root;
  const textLength = text(pruned).length;
  const seo: SqSeo = {
    ...(docTitle ? { title: docTitle } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { image: { url: safeAbs(ogImage, base), alt: "" } } : {}),
    ...(/noindex/i.test(robots) ? { noindex: true } : {}),
  };
  if (seo.image && !seo.image.url) delete seo.image;
  return {
    url,
    path: sitePathOfUrl,
    title: clean(title).slice(0, 200) || "Page",
    docTitle,
    seo,
    ...(attr(htmlEl, "lang") ? { lang: attr(htmlEl, "lang") } : {}),
    ...(metaContent(head, "generator") ? { generator: metaContent(head, "generator") } : {}),
    ...(favicon ? { favicon } : {}),
    ...(siteName ? { siteName } : {}),
    header: chromeHeader(body, header, base),
    footer: footer ? footerSections(footer, base) : [],
    social: [...social],
    sections,
    inlineCss,
    stylesheets,
    scripts: [...scripts],
    links: [...new Set(links)],
    ...(article ? { article } : {}),
    bodyClasses: classes(body),
    jsonLd,
    textLength,
  };
}

const safeAbs = (u: string, base: string) => {
  try {
    return new URL(u, base).toString();
  } catch {
    return "";
  }
};

/** "About — Maya Yoga" → "About" (when the site name is known or the separator is clear). */
export function stripSuffix(title: string, siteName?: string): string | undefined {
  if (!title) return undefined;
  if (siteName) {
    const esc = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const t = title
      .replace(new RegExp(`\\s*[—–|·:-]\\s*${esc}\\s*$`, "i"), "")
      .replace(new RegExp(`^${esc}\\s*[—–|·:-]\\s*`, "i"), "");
    if (t && t !== title) return t.trim();
  }
  const m = /^(.+?)\s+[—–|·]\s+[^—–|·]+$/.exec(title);
  return (m?.[1] ?? title).trim();
}

/** A copy of `el` without the excluded subtrees and boilerplate. */
function prune(el: Element, exclude: Set<Element>): Element {
  const visit = (n: Element): Element =>
    ({
      ...n,
      childNodes: n.childNodes
        .filter(
          (c) =>
            !isElement(c) ||
            (!exclude.has(c) &&
              !hidden(c) &&
              !["nav", "aside", "script", "style", "noscript", "template", "svg"].includes(
                c.tagName,
              )),
        )
        .map((c) => (isElement(c) ? visit(c) : c)),
    }) as Element;
  // Keep parent links so `closest`-style lookups keep working inside the copy.
  const copy = groupDetails(visit(el));
  const relink = (n: Element) => {
    for (const c of n.childNodes) {
      (c as { parentNode: unknown }).parentNode = n;
      if (isElement(c)) relink(c);
    }
  };
  relink(copy);
  return copy;
}

/** Consecutive `<details>` elements become one accordion group. */
function groupDetails(el: Element): Element {
  const out: Node[] = [];
  let run: Element[] = [];
  const flush = () => {
    if (run.length >= 2)
      out.push({
        ...el,
        tagName: "div",
        nodeName: "div",
        attrs: [{ name: "class", value: "os-details-group" }],
        childNodes: run,
      } as unknown as Element);
    else out.push(...run);
    run = [];
  };
  for (const c of el.childNodes) {
    if (isElement(c) && c.tagName === "details") {
      run.push(c);
      continue;
    }
    if (isElement(c) || (c as { value?: string }).value?.trim()) flush();
    if (isElement(c)) out.push(groupDetails(c));
    else out.push(c);
  }
  flush();
  return { ...el, childNodes: out } as Element;
}

/** The footer as sections (columns kept; menus and social icons become text and social links). */
function footerSections(footer: Element, base: string): SqSection[] {
  const ctx: WalkCtx = { base };
  const pruned = prune(footer, new Set());
  const rows = rowsOf(pruned, ctx)
    .map((r) => ({
      columns: r.columns
        .map((c) => ({
          ...c,
          blocks: c.blocks.filter((b) => b.kind !== "image" || !isSocialImage(b)),
        }))
        .filter((c) => c.blocks.length),
    }))
    .filter((r) => r.columns.length);
  const hasSocial =
    findAll(footer, (e) => e.tagName === "a" && isSocialUrl(attr(e, "href") ?? "")).length > 0;
  if (hasSocial) {
    const last = rows[rows.length - 1];
    if (last) last.columns[last.columns.length - 1]?.blocks.push({ kind: "social" });
    else rows.push({ columns: [{ span: 12, blocks: [{ kind: "social" }] }] });
  }
  if (!rows.length) return [];
  return [{ theme: sectionTheme(footer), layout: { mode: "classic", rows } }];
}

const isSocialImage = (b: SqBlock) =>
  b.kind === "image" && (b.image.width ?? 100) <= 64 && (b.image.height ?? 100) <= 64;
