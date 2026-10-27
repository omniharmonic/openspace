/**
 * A Squarespace page's HTML → sections, blocks, header, navigation, footer and SEO metadata.
 * Handles 7.1 page sections (classic-editor rows and Fluid Engine grids, gallery and list
 * sections) and 7.0 layouts (one `.sqs-layout` per page, or index-page sections).
 */
import {
  attr,
  byClass,
  byTag,
  children,
  classes,
  classValue,
  closest,
  type Element,
  find,
  findAll,
  hasClass,
  innerHtml,
  isElement,
  jsonAttr,
  type Node,
  outerHtml,
  parseDocument,
  parseHtmlFragment,
  scriptText,
  text,
} from "../dom";
import { bestIcon } from "../html/icons";
import { cleanImageUrl, imageFrom, parseBlock, stripTags, videoUrl } from "./blocks";
import type {
  SqBlock,
  SqCard,
  SqFluidItem,
  SqImage,
  SqNavItem,
  SqPlacement,
  SqRow,
  SqSection,
  SqSeo,
} from "./types";

export interface ParsedPage {
  title: string;
  /** `og:title` / headline without the site-name suffix, when it can be told. */
  pageTitle?: string;
  seo: SqSeo;
  canonical?: string;
  lang?: string;
  bodyClasses: string[];
  sections: SqSection[];
  /**
   * A collection page (shop, blog): how many of `sections` come before the collection's own
   * list, so sections placed below it stay below it.
   */
  collectionAt?: number;
  footer: SqSection[];
  header: {
    siteTitle?: string;
    logo?: SqImage;
    nav: SqNavItem[];
    layout?: string;
    action?: { label: string; href: string };
    theme?: string;
    showSocial?: boolean;
  };
  social: string[];
  stylesheets: string[];
  inlineCss: string;
  customHeadCode?: string;
  /** Item pages: `<article>` metadata. */
  item?: {
    title?: string;
    date?: string;
    author?: string;
    bodyLayout?: Element;
    image?: SqImage;
    jsonLd: Record<string, unknown>[];
  };
  favicon?: string;
  /** Password screen or member sign-in instead of content. */
  locked?: "password" | "members";
  /** The squarespace version, when it can be told. */
  version?: "7.0" | "7.1";
}

// --- sections -----------------------------------------------------------------------------------

/** Rows of a classic `.sqs-layout`; nested rows are flattened into their column. */
export function parseLayout(layout: Element): SqRow[] {
  const rows: SqRow[] = [];
  for (const row of children(layout).filter((e) => hasClass(e, "sqs-row")))
    rows.push(parseRow(row));
  // Some layouts (blog bodies from the JSON API) put blocks straight in the layout.
  const loose = children(layout).filter((e) => hasClass(e, "sqs-block"));
  if (loose.length) {
    const blocks = loose.map(parseBlock).filter((b): b is SqBlock => !!b);
    if (blocks.length) rows.push({ columns: [{ span: 12, blocks }] });
  }
  return expandImageCards(rows.filter((r) => r.columns.some((c) => c.blocks.length)));
}

function columnBlocks(col: Element): SqBlock[] {
  const out: SqBlock[] = [];
  for (const c of children(col)) {
    if (hasClass(c, "sqs-block")) {
      const b = parseBlock(c);
      if (b) out.push(b);
    } else if (hasClass(c, "sqs-row")) {
      for (const nested of parseRow(c).columns) out.push(...nested.blocks);
    } else out.push(...columnBlocks(c));
  }
  return out;
}

/** Image blocks with text beside them become their own two-column row (image | text). */
export function expandImageCards(rows: SqRow[]): SqRow[] {
  const out: SqRow[] = [];
  for (const row of rows) {
    const wide = row.columns.length === 1;
    let rest: SqBlock[] = [];
    const flush = () => {
      if (rest.length) out.push({ columns: [{ span: row.columns[0]?.span ?? 12, blocks: rest }] });
      rest = [];
    };
    if (!wide) {
      // In narrow columns the text goes under the image.
      out.push({
        columns: row.columns.map((c) => ({
          ...c,
          blocks: c.blocks.flatMap((b) =>
            b.kind === "image" && b.card ? [{ ...b, card: undefined }, ...cardBlocks(b.card)] : [b],
          ),
        })),
      });
      continue;
    }
    for (const b of row.columns[0]?.blocks ?? []) {
      if (b.kind !== "image" || !b.card) {
        rest.push(b);
        continue;
      }
      const image: SqBlock = { kind: "image", image: b.image, ...(b.href ? { href: b.href } : {}) };
      const words = cardBlocks(b.card);
      if (b.card.position === "below" || b.card.position === "over" || !words.length) {
        rest.push(image, ...words);
        continue;
      }
      flush();
      const img = { span: 6, blocks: [image] };
      const txt = { span: 6, blocks: words };
      out.push({ columns: b.card.position === "left" ? [txt, img] : [img, txt] });
    }
    flush();
  }
  return out;
}

function cardBlocks(card: NonNullable<Extract<SqBlock, { kind: "image" }>["card"]>): SqBlock[] {
  const out: SqBlock[] = [];
  const sub = card.html ? stripTags(card.html) : "";
  // A short title above a sentence (Squarespace's usual card): the title is an eyebrow; a
  // subtitle written as a sentence reads at text size (as the card shows it), a short phrase
  // is a heading.
  const sentence = /[.!?…]["”’)]?$/.test(sub) || sub.split(/\s+/).length > 12;
  if (card.title && card.title.length <= 40 && sub && sub.length <= 160 && sentence)
    out.push({
      kind: "text",
      html: `<p class="os-eyebrow">${escapeText(card.title)}</p>${card.html ?? ""}`,
    });
  else if (card.title && card.title.length <= 40 && sub && sub.length <= 160)
    out.push({ kind: "heading", text: sub, level: 2, eyebrow: card.title });
  else if (card.title || card.html)
    out.push({
      kind: "text",
      html: `${card.title ? `<h2>${escapeText(card.title)}</h2>` : ""}${card.html ?? ""}`,
    });
  if (card.button)
    out.push({
      kind: "button",
      label: card.button.label,
      href: card.button.href,
      style: "primary",
    });
  return out;
}

function parseRow(row: Element): SqRow {
  const columns = children(row)
    .filter((e) => classes(e).some((c) => /^sqs-col-\d+$/.test(c)))
    .map((col) => {
      const span = Number(classValue(col, "span-") ?? classValue(col, "sqs-col-") ?? 12);
      return {
        span: Number.isFinite(span) && span > 0 ? Math.min(12, span) : 12,
        blocks: columnBlocks(col),
      };
    });
  if (!columns.length) return { columns: [{ span: 12, blocks: columnBlocks(row) }] };
  return { columns };
}

/** `.fe-block-<id> { grid-area: r1/c1/r2/c2; z-index: n }`, mobile first then desktop. */
export function parseFluidCss(css: string): {
  placements: Map<string, { d?: SqPlacement; m?: SqPlacement }>;
  rows: { d?: number; m?: number };
} {
  const placements = new Map<string, { d?: SqPlacement; m?: SqPlacement }>();
  const rows: { d?: number; m?: number } = {};
  const desktopAt = css.search(/@media\s*\(\s*min-width:\s*768px\s*\)/);
  const ruleRe = /\.fe-block-([A-Za-z0-9_-]+)\s*\{([^{}]*?grid-area\s*:\s*([^;]+);[^{}]*)/g;
  for (const m of css.matchAll(ruleRe)) {
    const id = m[1] as string;
    const area = (m[3] as string).split("/").map((s) => Number(s.trim()));
    if (area.length !== 4 || area.some((n) => !Number.isFinite(n))) continue;
    const [r1, c1, r2, c2] = area as [number, number, number, number];
    const z = Number(/z-index\s*:\s*(\d+)/.exec(m[2] as string)?.[1]);
    // Columns include a gutter track on each side: line 2 is the first content column.
    const p: SqPlacement = {
      x: Math.max(1, c1 - 1),
      y: Math.max(1, r1),
      w: Math.max(1, c2 - c1),
      h: Math.max(1, r2 - r1),
      ...(Number.isFinite(z) && z > 0 ? { z } : {}),
    };
    const bp = desktopAt >= 0 && (m.index ?? 0) > desktopAt ? "d" : "m";
    const entry = placements.get(id) ?? {};
    entry[bp] = p;
    placements.set(id, entry);
  }
  for (const m of css.matchAll(/grid-template-rows\s*:\s*repeat\(\s*(\d+)\s*,/g)) {
    const bp = desktopAt >= 0 && (m.index ?? 0) > desktopAt ? "d" : "m";
    rows[bp] = Number(m[1]);
  }
  return { placements, rows };
}

function styleText(el: Element): string {
  return findAll(el, byTag("style"))
    .map((s) => scriptText(s))
    .join("\n");
}

function fluidSection(fluid: Element, css: string): SqSection["layout"] {
  const { placements, rows } = parseFluidCss(css);
  const items: SqFluidItem[] = [];
  for (const fe of children(fluid).filter((e) => hasClass(e, "fe-block"))) {
    const id = classes(fe)
      .find((c) => c.startsWith("fe-block-"))
      ?.slice("fe-block-".length);
    const blockEl = find(fe, (e) => hasClass(e, "sqs-block"));
    const block = blockEl ? parseBlock(blockEl) : undefined;
    if (!block) continue;
    const p = id ? placements.get(id) : undefined;
    items.push({ block, ...(p?.d ? { d: p.d } : {}), ...(p?.m ? { m: p.m } : {}) });
  }
  return {
    mode: "fluid",
    items,
    ...(rows.d ? { rows: rows.d } : {}),
    ...(rows.m ? { mobileRows: rows.m } : {}),
  };
}

function gallerySectionBlock(section: Element): SqBlock | undefined {
  const cls = findAll(section, (e) =>
    classes(e).some((c) => /^gallery-(?:grid|masonry|slideshow|reel|strips|fullscreen)/.test(c)),
  )
    .flatMap(classes)
    .join(" ");
  const seen = new Set<string>();
  const images: (SqImage & { caption?: string })[] = [];
  for (const img of findAll(section, byTag("img"))) {
    if (closest(img, byClass("section-background"))) continue;
    const im = imageFrom(img);
    if (!im || seen.has(im.url)) continue;
    seen.add(im.url);
    const fig = closest(img, (e) => e.tagName === "figure");
    const caption = fig ? text(find(fig, byTag("figcaption"))) : "";
    images.push({ ...im, ...(caption ? { caption } : {}) });
  }
  if (!images.length) return undefined;
  const layout = /slideshow|fullscreen/.test(cls)
    ? "slideshow"
    : /reel/.test(cls)
      ? "carousel"
      : /strips/.test(cls)
        ? "strips"
        : /masonry/.test(cls)
          ? "masonry"
          : "grid";
  return { kind: "gallery", images, layout };
}

function listSectionBlocks(section: Element): SqBlock[] {
  const out: SqBlock[] = [];
  const title = find(section, (e) => classes(e).some((c) => c === "list-section-title"));
  if (title && text(title)) out.push({ kind: "text", html: innerHtml(title) });
  const items: SqCard[] = [];
  for (const li of findAll(section, (e) => classes(e).includes("list-item"), { deep: false })) {
    const t = text(find(li, (e) => classes(e).some((c) => c === "list-item-content__title")));
    const desc = find(li, (e) => classes(e).some((c) => c === "list-item-content__description"));
    const img = find(li, byTag("img"));
    const btn = find(
      li,
      (e) => e.tagName === "a" && classes(e).some((c) => c.startsWith("list-item-content__button")),
    );
    const image = img ? imageFrom(img) : undefined;
    if (!t && !image) continue;
    items.push({
      title: t || "Untitled",
      ...(desc && text(desc) ? { html: innerHtml(desc) } : {}),
      ...(image ? { image } : {}),
      ...(btn && attr(btn, "href")
        ? { href: attr(btn, "href"), linkLabel: text(btn) || undefined }
        : {}),
    });
  }
  if (items.length) out.push({ kind: "cards", items });
  return out;
}

/** A 7.1 `<section class="page-section">` (or 7.0 index section) → `SqSection`. */
export function parseSection(section: Element): SqSection | undefined {
  const styles = jsonAttr<Record<string, unknown>>(section, "data-current-styles") ?? {};
  const theme = attr(section, "data-section-theme") ?? String(styles.sectionTheme ?? "");
  const out: SqSection = { theme, layout: { mode: "classic", rows: [] } };
  const id = attr(section, "data-section-id") ?? attr(section, "id");
  if (id) out.id = id;
  const height = (classValue(section, "section-height--") ??
    String(styles.sectionHeight ?? "").replace("section-height--", "")) as SqSection["height"] | "";
  if (height === "small" || height === "medium" || height === "large" || height === "custom")
    out.height = height;
  const custom = Number(styles.customSectionHeight);
  if (out.height === "custom" && Number.isFinite(custom) && custom > 0)
    out.customHeight = Math.min(100, Math.round(custom));
  const width =
    classValue(section, "content-width--") ??
    String(styles.contentWidth ?? "").replace("content-width--", "");
  if (width === "narrow" || width === "medium" || width === "wide" || width === "full")
    out.contentWidth = width;
  const align = classValue(section, "horizontal-alignment--");
  if (align === "left" || align === "center" || align === "right") out.align = align;

  // Background: image from the styles JSON or the section-background <img>; overlay opacity.
  const bgEl = find(
    section,
    (e) => hasClass(e, "section-background") || hasClass(e, "index-section-image"),
  );
  const bgImg = bgEl ? find(bgEl, byTag("img")) : undefined;
  const bgJson = styles.backgroundImage as Record<string, unknown> | undefined;
  let bg: SqImage | undefined = bgImg ? imageFrom(bgImg) : undefined;
  if (!bg && bgJson && typeof bgJson.assetUrl === "string") {
    const size = /^(\d+)x(\d+)$/.exec(String(bgJson.originalSize ?? ""));
    bg = {
      url: cleanImageUrl(bgJson.assetUrl),
      alt: "",
      ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
    };
  }
  if (!bg && attr(section, "data-image"))
    bg = { url: cleanImageUrl(attr(section, "data-image") as string), alt: "" };
  const overlay = Number(styles.imageOverlayOpacity);
  const video = find(
    section,
    (e) => hasClass(e, "section-background-video") || !!attr(e, "data-config-video"),
  );
  if (bg || video) {
    out.background = {
      ...(bg ? { image: { ...bg, alt: "" } } : {}),
      ...(Number.isFinite(overlay) && overlay > 0 ? { overlay } : {}),
      ...(video ? { video: attr(video, "data-config-url") ?? "video" } : {}),
    };
  }

  const content =
    find(section, (e) => hasClass(e, "content-wrapper") || hasClass(e, "index-section-wrapper")) ??
    section;
  const fluid = find(content, (e) => hasClass(e, "fluid-engine"));
  if (fluid) {
    const layout = fluidSection(fluid, styleText(section));
    out.layout = layout;
    return layout.mode === "fluid" && (layout.items.length || out.background) ? out : undefined;
  }
  const sectionCls = classes(section).join(" ");
  if (
    /gallery-section/.test(sectionCls) ||
    find(section, (e) =>
      classes(e).some((c) =>
        /^gallery-(?:grid|masonry|slideshow|reel|strips)-wrapper$|^gallery-(?:grid|masonry|slideshow|reel|strips)$/.test(
          c,
        ),
      ),
    )
  ) {
    const block = gallerySectionBlock(section);
    if (block)
      out.layout = { mode: "classic", rows: [{ columns: [{ span: 12, blocks: [block] }] }] };
    return block ? out : undefined;
  }
  if (
    find(section, (e) =>
      classes(e).some((c) => c === "user-items-list" || c === "user-items-list-section"),
    )
  ) {
    const blocks = listSectionBlocks(section);
    out.layout = {
      mode: "classic",
      rows: blocks.length ? [{ columns: [{ span: 12, blocks }] }] : [],
    };
    return blocks.length ? out : undefined;
  }
  const layouts = findAll(content, (e) => hasClass(e, "sqs-layout"), { deep: false });
  const rows = layouts.flatMap(parseLayout);
  out.layout = { mode: "classic", rows };
  return rows.length || out.background ? out : undefined;
}

// --- header, nav, footer --------------------------------------------------------------------------

function navFrom(root: Element): SqNavItem[] {
  // 7.1: the first (desktop) header-nav-list.
  const list = find(root, (e) => hasClass(e, "header-nav-list"));
  if (list) {
    const out: SqNavItem[] = [];
    for (const item of children(list).filter((e) => hasClass(e, "header-nav-item"))) {
      if (hasClass(item, "header-nav-item--folder")) {
        const label = text(find(item, (e) => hasClass(e, "header-nav-folder-title"))) || "Menu";
        const items = findAll(item, (e) => hasClass(e, "header-nav-folder-item"))
          .map((fi) => find(fi, byTag("a")))
          .filter((a): a is Element => !!a && !!attr(a, "href"))
          .map((a) => ({
            label: text(a),
            href: attr(a, "href") as string,
            ...(attr(a, "target") === "_blank" ? { newTab: true } : {}),
          }))
          .filter((x) => x.label);
        out.push({ type: "folder", label, items });
        continue;
      }
      const a = find(item, byTag("a"));
      if (!a || !attr(a, "href") || !text(a)) continue;
      out.push({
        type: "link",
        label: text(a),
        href: attr(a, "href") as string,
        ...(attr(a, "target") === "_blank" ? { newTab: true } : {}),
      });
    }
    return out;
  }
  // 7.0: #mainNavigation / .main-nav / the first <nav>.
  const nav =
    find(
      root,
      (e) =>
        attr(e, "id") === "mainNavigation" || hasClass(e, "main-nav") || attr(e, "id") === "topNav",
    ) ?? find(root, byTag("nav"));
  if (!nav) return [];
  const out: SqNavItem[] = [];
  const top = findAll(nav, (e) => e.tagName === "a" || hasClass(e, "folder"), { deep: false });
  for (const el of top) {
    if (hasClass(el, "folder")) {
      const label =
        text(find(el, (e) => hasClass(e, "folder-toggle-label") || hasClass(e, "folder-toggle"))) ||
        "Menu";
      const items = findAll(el, byTag("a"))
        .filter((a) => attr(a, "href") && text(a) && text(a) !== label)
        .map((a) => ({ label: text(a), href: attr(a, "href") as string }));
      out.push({ type: "folder", label, items });
    } else if (attr(el, "href") && text(el))
      out.push({ type: "link", label: text(el), href: attr(el, "href") as string });
  }
  return out;
}

const SOCIAL_HOSTS =
  /(instagram|facebook|twitter|x\.com|threads|bsky|bluesky|mastodon|linkedin|youtube|tiktok|pinterest|github|spotify|soundcloud|bandcamp|vimeo|behance|dribbble|substack|patreon|yelp|tripadvisor)/i;

function socialLinks(root: Element): string[] {
  const out = new Set<string>();
  for (const a of findAll(root, (e) => e.tagName === "a" && !!attr(e, "href"))) {
    const href = attr(a, "href") as string;
    const inSocial = closest(a, (e) => classes(e).some((c) => /social/.test(c)));
    if (
      inSocial &&
      (/^https?:\/\//.test(href) || href.startsWith("mailto:")) &&
      (SOCIAL_HOSTS.test(href) || href.startsWith("mailto:"))
    )
      out.add(href);
  }
  return [...out];
}

function meta(head: Element, key: string): string | undefined {
  const m = find(
    head,
    (e) =>
      e.tagName === "meta" &&
      (attr(e, "property") === key || attr(e, "name") === key || attr(e, "itemprop") === key),
  );
  const v = m ? attr(m, "content")?.trim() : undefined;
  return v || undefined;
}

/** Parse a full Squarespace page. */
export function parsePage(html: string): ParsedPage {
  const root = parseDocument(html);
  const head = find(root, byTag("head")) ?? root;
  const body = find(root, byTag("body")) ?? root;
  const bodyClasses = classes(body);
  const title = text(find(head, byTag("title")));
  const ogImage = meta(head, "og:image");
  const description = meta(head, "description") ?? meta(head, "og:description");
  const robots = meta(head, "robots");
  const canonicalEl = find(head, (e) => e.tagName === "link" && attr(e, "rel") === "canonical");
  const seo: SqSeo = {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { image: { url: cleanImageUrl(ogImage), alt: "" } } : {}),
    ...(robots && /noindex/i.test(robots) ? { noindex: true } : {}),
  };

  // Header.
  const headerEl =
    find(
      body,
      (e) => e.tagName === "header" && (attr(e, "id") === "header" || hasClass(e, "header")),
    ) ??
    find(body, (e) => e.tagName === "header") ??
    find(body, (e) => attr(e, "id") === "header");
  const headerStyles = headerEl
    ? (jsonAttr<Record<string, unknown>>(headerEl, "data-current-styles") ?? {})
    : {};
  const logoImg = headerEl
    ? find(
        headerEl,
        (e) =>
          e.tagName === "img" &&
          !!closest(e, (p) =>
            classes(p).some(
              (c) =>
                c === "header-title-logo" ||
                c === "logo-image" ||
                c === "site-logo" ||
                c === "logo",
            ),
          ),
      )
    : undefined;
  const action = headerStyles.action as { href?: string; buttonText?: string } | undefined;
  const headerActionLink = headerEl
    ? find(
        headerEl,
        (e) =>
          e.tagName === "a" &&
          classes(e).some((c) => c.startsWith("header-actions-action--cta") || c === "btn"),
      )
    : undefined;
  const actionHref =
    action?.href ?? (headerActionLink ? attr(headerActionLink, "href") : undefined);
  const actionLabel = action?.buttonText ?? (headerActionLink ? text(headerActionLink) : undefined);
  const siteTitle = headerEl
    ? text(
        find(
          headerEl,
          (e) =>
            attr(e, "id") === "site-title" ||
            hasClass(e, "header-title-text") ||
            hasClass(e, "site-title"),
        ),
      ) || undefined
    : undefined;

  // Sections (7.1) or layouts (7.0).
  const footerEl = find(
    body,
    (e) =>
      e.tagName === "footer" || attr(e, "id") === "footer-sections" || attr(e, "id") === "footer",
  );
  const inFooter = (e: Element) => !!footerEl && !!closest(e, (p) => p === footerEl);
  const inHeader = (e: Element) => !!headerEl && !!closest(e, (p) => p === headerEl);
  const pageSections = findAll(
    body,
    (e) => e.tagName === "section" && hasClass(e, "page-section"),
    { deep: false },
  ).filter((e) => !inFooter(e));
  const indexSections = findAll(body, (e) => hasClass(e, "index-section"), { deep: false }).filter(
    (e) => !inFooter(e),
  );
  let sections: SqSection[] = [];
  let version: ParsedPage["version"];
  let collectionAt: number | undefined;
  if (pageSections.length) {
    version = "7.1";
    for (const el of pageSections) {
      // The collection's own list (a store grid, a blog list) sits in a section of its own.
      if (
        collectionAt === undefined &&
        find(el, (e) =>
          /(?:^|\s)(?:product-list|ProductList|blog-list|blog-basic-grid|blog-side-by-side|blog-alternating|blog-single-column|blog-masonry|events-list|eventlist|collection-content-wrapper)(?:\s|$|-)/.test(
            attr(e, "class") ?? "",
          ),
        )
      )
        collectionAt = sections.length;
      const sec = parseSection(el);
      if (sec) sections.push(sec);
    }
  } else if (indexSections.length) {
    version = "7.0";
    sections = indexSections.map(parseSection).filter((s): s is SqSection => !!s);
  }
  // Item pages and 7.0 pages: the main layout.
  const article = find(
    body,
    (e) =>
      e.tagName === "article" || hasClass(e, "blog-item-wrapper") || hasClass(e, "ProductItem"),
  );
  const isItem = bodyClasses.includes("view-item");
  if (!sections.length || isItem) {
    const main =
      find(body, (e) => attr(e, "data-content-field") === "main-content" && !inHeader(e)) ??
      find(body, (e) => attr(e, "id") === "content" || hasClass(e, "main-content")) ??
      body;
    const layouts = findAll(
      main,
      (e) => hasClass(e, "sqs-layout") && !inFooter(e) && !inHeader(e),
      { deep: false },
    );
    if (!isItem && layouts.length) {
      version ??= "7.0";
      const rows = layouts.flatMap(parseLayout);
      if (rows.length) sections = [{ theme: "", layout: { mode: "classic", rows } }];
    }
  }
  // 7.0 page banners (the page's main image with its description) open the page as a hero.
  if (!isItem && !pageSections.length) {
    const banner = bannerSection(body, (e) => inHeader(e) || inFooter(e));
    if (banner) sections = [banner, ...sections];
  }

  // Footer sections.
  let footer: SqSection[] = [];
  if (footerEl) {
    const fs = findAll(footerEl, (e) => e.tagName === "section" && hasClass(e, "page-section"), {
      deep: false,
    });
    if (fs.length) footer = fs.map(parseSection).filter((s): s is SqSection => !!s);
    else {
      // 7.0: the pre-footer blocks (often the newsletter), the site info line, footer blocks.
      const pre = find(
        body,
        (e) => (attr(e, "id") === "preFooter" || hasClass(e, "pre-footer")) && !inFooter(e),
      );
      const rows = [
        ...(pre
          ? findAll(pre, (e) => hasClass(e, "sqs-layout"), { deep: false }).flatMap(parseLayout)
          : []),
        ...siteInfoRows(footerEl),
        ...findAll(footerEl, (e) => hasClass(e, "sqs-layout"), { deep: false }).flatMap(
          parseLayout,
        ),
      ];
      if (rows.length) footer = [{ theme: "", layout: { mode: "classic", rows } }];
    }
    footer = footer.map(withoutSquarespaceCredit).filter((s) => sectionHasBlocks(s));
  }

  // Item metadata.
  let item: ParsedPage["item"];
  const jsonLd = findAll(
    root,
    (e) => e.tagName === "script" && attr(e, "type") === "application/ld+json",
  )
    .map((s) => {
      try {
        return JSON.parse(scriptText(s)) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    })
    .filter((x): x is Record<string, unknown> => !!x);
  if (isItem) {
    const scope = article ?? body;
    const time = find(scope, (e) => e.tagName === "time" && !!attr(e, "datetime"));
    const bodyLayout =
      find(
        scope,
        (e) =>
          hasClass(e, "e-content") ||
          attr(e, "itemprop") === "articleBody" ||
          hasClass(e, "blog-item-content"),
      ) ?? find(scope, (e) => hasClass(e, "sqs-layout"));
    const headline = text(
      find(
        scope,
        (e) =>
          attr(e, "itemprop") === "headline" ||
          hasClass(e, "entry-title") ||
          hasClass(e, "ProductItem-details-title") ||
          hasClass(e, "eventitem-title") ||
          e.tagName === "h1",
      ),
    );
    const author =
      meta(head, "author") ??
      meta(head, "article:author") ??
      (text(find(scope, (e) => hasClass(e, "blog-author-name") || hasClass(e, "author-name"))) ||
        undefined);
    const datePublished =
      meta(head, "datePublished") ?? (time ? attr(time, "datetime") : undefined);
    item = {
      ...(headline ? { title: headline } : {}),
      ...(datePublished ? { date: datePublished } : {}),
      ...(author ? { author } : {}),
      ...(bodyLayout ? { bodyLayout } : {}),
      ...(ogImage ? { image: { url: cleanImageUrl(ogImage), alt: "" } } : {}),
      jsonLd,
    };
  }

  const stylesheets = findAll(head, (e) => e.tagName === "link" && attr(e, "rel") === "stylesheet")
    .map((l) => attr(l, "href") ?? "")
    .filter((h) => /site\.css|static\.css/.test(h));
  const inlineCss = findAll(head, byTag("style"))
    .map(scriptText)
    .filter((s) => /--[a-zA-Z]+-hsl|font-font-family|siteBackgroundColor/.test(s))
    .join("\n");

  // Code injection: anything after Squarespace's own headers.
  let customHeadCode: string | undefined;
  const marker = html.indexOf("<!-- End of Squarespace Headers -->");
  const headEnd = html.indexOf("</head>");
  if (marker >= 0 && headEnd > marker) {
    const code = html.slice(marker + "<!-- End of Squarespace Headers -->".length, headEnd).trim();
    if (/<(?:script|style|link|meta|noscript|iframe)/i.test(code)) customHeadCode = code;
  }
  const passwordForm = find(
    body,
    (e) =>
      hasClass(e, "sqs-password-page") ||
      attr(e, "id") === "password-page" ||
      hasClass(e, "lock-screen"),
  );
  const membersGate = find(body, (e) =>
    classes(e).some((c) => /member-area|members-only|sqs-member/.test(c)),
  );
  const favicon = bestIcon(
    head,
    attr(canonicalEl, "href") ?? meta(head, "og:url") ?? "https://images.squarespace-cdn.com/",
  );
  const lang = attr(root, "lang");
  const ogTitle = meta(head, "og:title");

  return {
    title,
    ...(ogTitle ? { pageTitle: ogTitle.replace(/\s+[—–|-]\s+[^—–|]+$/, "").trim() } : {}),
    seo,
    ...(canonicalEl && attr(canonicalEl, "href") ? { canonical: attr(canonicalEl, "href") } : {}),
    ...(lang ? { lang } : {}),
    bodyClasses,
    sections,
    ...(collectionAt !== undefined ? { collectionAt } : {}),
    footer,
    header: {
      ...(siteTitle ? { siteTitle } : {}),
      ...(logoImg && imageFrom(logoImg) ? { logo: imageFrom(logoImg) } : {}),
      nav: headerEl ? navFrom(headerEl) : navFrom(body),
      ...(typeof headerStyles.layout === "string" ? { layout: headerStyles.layout } : {}),
      ...(actionHref && actionLabel
        ? { action: { label: actionLabel.trim(), href: actionHref } }
        : {}),
      ...(headerEl && attr(headerEl, "data-section-theme")
        ? { theme: attr(headerEl, "data-section-theme") }
        : {}),
      ...(typeof headerStyles.showSocial === "boolean"
        ? { showSocial: headerStyles.showSocial }
        : {}),
    },
    social: socialLinks(body),
    stylesheets,
    inlineCss,
    ...(customHeadCode ? { customHeadCode } : {}),
    ...(item ? { item } : {}),
    ...(favicon ? { favicon } : {}),
    ...(passwordForm
      ? { locked: "password" as const }
      : membersGate
        ? { locked: "members" as const }
        : {}),
    ...(version ? { version } : {}),
  };
}

/** The 7.0 banner: the page's main image with its description, as a hero section. */
function bannerSection(body: Element, skip: (e: Element) => boolean): SqSection | undefined {
  const el = find(
    body,
    (e) =>
      !skip(e) &&
      (hasClass(e, "banner-thumbnail-wrapper") ||
        attr(e, "id") === "bannerImage" ||
        hasClass(e, "banner-image") ||
        (attr(e, "data-content-field") === "main-image" && e.tagName !== "img")),
  );
  if (!el) return undefined;
  const img = find(el, byTag("img"));
  const image = img ? imageFrom(img) : undefined;
  const desc =
    find(el, (e) => hasClass(e, "desc-wrapper") || hasClass(e, "page-desc")) ??
    find(body, (e) => attr(e, "data-content-field") === "description" && !skip(e));
  const blocks: SqBlock[] = [];
  if (desc) {
    const paras = children(desc).filter((p) => text(p));
    const links = paras.filter(
      (p) => (find(p, byTag("a")) && text(find(p, byTag("a"))) === text(p)) || p.tagName === "a",
    );
    const words = paras.filter((p) => !links.includes(p));
    const strong =
      words.find((p) => /^h[1-4]$/.test(p.tagName)) ??
      words.find((p) => !!find(p, (x) => x.tagName === "strong" || x.tagName === "b")) ??
      words[words.length - 1];
    const before = strong ? words.slice(0, words.indexOf(strong)) : [];
    const after = strong ? words.slice(words.indexOf(strong) + 1) : [];
    if (strong)
      blocks.push({
        kind: "heading",
        text: text(strong),
        level: 2,
        ...(before.length === 1 && text(before[0] as Element).length <= 60
          ? { eyebrow: text(before[0] as Element) }
          : {}),
        ...(after.length && after.map((p) => text(p)).join(" ").length <= 280
          ? { subheading: after.map((p) => text(p)).join(" ") }
          : {}),
        align: "center",
      });
    links.forEach((p, i) => {
      const a = p.tagName === "a" ? p : (find(p, byTag("a")) as Element);
      const href = attr(a, "href");
      if (href)
        blocks.push({
          kind: "button",
          label: text(a),
          href,
          style: i === 0 ? "primary" : "secondary",
        });
    });
  }
  if (!image && !blocks.length) return undefined;
  return {
    theme: "",
    ...(image ? { background: { image: { ...image, alt: "" }, overlay: 0.3 } } : {}),
    height: "large",
    align: "center",
    role: "hero",
    layout: { mode: "classic", rows: blocks.length ? [{ columns: [{ span: 12, blocks }] }] : [] },
  };
}

/** 7.0 footers show the business address, phone and email from site settings. */
function siteInfoRows(footer: Element): SqRow[] {
  const parts = ["site-address", "site-phone", "site-email"]
    .map((c) => find(footer, (e) => hasClass(e, c)))
    .filter((e): e is Element => !!e && !!text(e));
  if (!parts.length) return [];
  const html = parts
    .map((e) => {
      const t = escapeText(text(e));
      if (hasClass(e, "site-email")) return `<a href="mailto:${t}">${t}</a>`;
      if (hasClass(e, "site-phone")) return `<a href="tel:${t.replace(/[^\d+]/g, "")}">${t}</a>`;
      return t;
    })
    .join(" · ");
  return [{ columns: [{ span: 12, blocks: [{ kind: "text", html: `<p>${html}</p>` }] }] }];
}

const CREDIT = /^\s*(?:Powered by|Built with|Made with)\s+Squarespace\.?\s*$/i;

function withoutSquarespaceCredit(s: SqSection): SqSection {
  const strip = (b: SqBlock): SqBlock =>
    b.kind === "text"
      ? {
          ...b,
          html: b.html
            .replace(
              /(?:<br\s*\/?>\s*)*(?:Made|Powered|Built) with\s*(?:<a\b[^>]*>\s*)?Squarespace\.?(?:\s*<\/a>)?/gi,
              "",
            )
            .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (p, inner: string) =>
              CREDIT.test(stripTags(inner)) || !stripTags(inner) ? "" : p,
            ),
        }
      : b;
  const keep = (b: SqBlock) =>
    !(b.kind === "text" && (CREDIT.test(stripTags(b.html)) || !stripTags(b.html)));
  if (s.layout.mode === "fluid")
    return {
      ...s,
      layout: {
        ...s.layout,
        items: s.layout.items
          .map((i) => ({ ...i, block: strip(i.block) }))
          .filter((i) => keep(i.block)),
      },
    };
  return {
    ...s,
    layout: {
      mode: "classic",
      rows: s.layout.rows.map((r) => ({
        columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map(strip).filter(keep) })),
      })),
    },
  };
}

function sectionHasBlocks(s: SqSection): boolean {
  return s.layout.mode === "fluid"
    ? s.layout.items.length > 0
    : s.layout.rows.some((r) => r.columns.some((c) => c.blocks.length));
}

/** Sections of an HTML fragment that is a Squarespace layout (item bodies from JSON or WXR). */
export function sectionsFromLayoutHtml(html: string): SqSection[] {
  const root = parseHtmlFragment(html);
  const layouts = findAll(root, (e) => hasClass(e, "sqs-layout"), { deep: false });
  const rows = layouts.length ? layouts.flatMap(parseLayout) : [];
  if (rows.length) return [{ theme: "", layout: { mode: "classic", rows } }];
  // Plain HTML (WordPress export, simple bodies): one text block, images pulled out.
  return plainHtmlSections(root);
}

/** Plain HTML → text blocks split around images, iframes (video) and blockquotes. */
export function plainHtmlSections(root: Element): SqSection[] {
  const blocks: SqBlock[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const html = buffer.join("").trim();
    buffer = [];
    if (html && text(parseHtmlFragment(html))) blocks.push({ kind: "text", html });
  };
  const visit = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (!isElement(node)) {
        const v = (node as { value?: string }).value;
        if (node.nodeName === "#text" && v?.trim()) buffer.push(escapeText(v));
        continue;
      }
      const el = node;
      const img = el.tagName === "img" ? el : undefined;
      const onlyImg =
        !img && ["p", "figure", "div", "a"].includes(el.tagName) && !text(el)
          ? find(el, byTag("img"))
          : undefined;
      const iframe =
        el.tagName === "iframe" ? el : !text(el) ? find(el, byTag("iframe")) : undefined;
      if (img || onlyImg) {
        flush();
        const im = imageFrom((img ?? onlyImg) as Element);
        const caption = text(find(el, byTag("figcaption")));
        const link = el.tagName === "a" ? attr(el, "href") : undefined;
        if (im)
          blocks.push({
            kind: "image",
            image: im,
            ...(caption ? { caption } : {}),
            ...(link && !/\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(link) ? { href: link } : {}),
          });
      } else if (iframe) {
        flush();
        const src = attr(iframe, "src") ?? attr(iframe, "data-src") ?? "";
        const v = videoUrl(src);
        if (v) blocks.push({ kind: "video", url: v });
        else if (src) blocks.push({ kind: "embed", url: src });
      } else if (el.tagName === "div" && !hasClass(el, "sqs-html-content")) {
        visit(el.childNodes);
      } else buffer.push(outerHtml(el));
    }
  };
  visit(root.childNodes);
  flush();
  return blocks.length
    ? [{ theme: "", layout: { mode: "classic", rows: [{ columns: [{ span: 12, blocks }] }] } }]
    : [];
}

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
