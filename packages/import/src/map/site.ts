/**
 * Assemble the OpenSpace `SiteDocument` from a crawled Squarespace site: pages and sections,
 * collections (blog → blog items with dates, authors, tags and excerpts; events; products as
 * catalog content; portfolio projects), navigation, header and footer, SEO, redirects and Site
 * Styles. Every link is resolved to a page that exists (the shared link checks run last).
 */
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import { photoContrast } from "@omniharmonic/openspace-lint";
import {
  type Block,
  type CollectionConfig,
  type CollectionItem,
  findBrokenLinks,
  type Header,
  type ImageValue,
  type NavItem,
  type NavLeaf,
  newId,
  type Page,
  type RichTextDoc,
  resolveInternalLinks,
  type Section,
  type Site,
  type SiteConfig,
  type SiteDocument,
  SiteDocumentSchema,
  toMarkdown,
} from "@omniharmonic/openspace-schema";
import { markdocToBlocks } from "@omniharmonic/openspace-site-kit/markdoc";
import { compileStyles } from "@omniharmonic/openspace-theme";
import type { MediaImporter } from "../media";
import { platformLabel } from "../platform";
import { stripTags } from "../squarespace/blocks";
import { normalizeIso } from "../squarespace/crawl";
import { sectionsFromLayoutHtml } from "../squarespace/page";
import type {
  SqCollection,
  SqItem,
  SqNavItem,
  SqNotice,
  SqPage,
  SqSite,
} from "../types";
import { linkFor, type MapContext, makeBlock } from "./blocks";
import { mapFooter, mapSection, type SectionContext } from "./sections";
import { mapTheme } from "./theme";
import { slugify, UrlMap } from "./urls";

export interface BuildOptions {
  config: SiteConfig;
  media: MediaImporter;
  now?: Date;
  onProgress?: (message: string) => void;
}

export interface PageSummary {
  from: string;
  to: string;
  title: string;
  sections: number;
  blocks: number;
}

export interface BuildResult {
  doc: SiteDocument;
  notices: SqNotice[];
  pages: PageSummary[];
  collections: { from: string; to: string; kind: string; items: number; drafts: number }[];
  redirects: { from: string; to: string }[];
  themeNotes: string[];
  linkFixes: { where: string; from: string; to: string }[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** "Page — Site" → "Page" (only the site's own name is stripped; the title template adds it). */
export function stripSiteName(title: string, site: string): string {
  const esc = site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`\\s+[—–|·-]\\s+${esc}\\s*$`), "").trim();
}

const registry = blocksRegistry();

// --- markdoc bodies ---------------------------------------------------------------------------

/** A Markdoc attribute value (JSON literals are valid Markdoc values). */
const attrValue = (v: unknown): string => JSON.stringify(v);

/** OpenSpace blocks → a Markdoc body (text as Markdown; other blocks as their tags). */
export function blocksToMarkdoc(blocks: readonly Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") {
      const md = toMarkdown(b.fields.content as RichTextDoc).trim();
      if (md) parts.push(md);
      continue;
    }
    const attrs = Object.entries(b.fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${attrValue(v)}`);
    if (b.variant) attrs.push(`variant=${attrValue(b.variant)}`);
    parts.push(`{% ${b.type} ${attrs.join(" ")} /%}`);
  }
  return parts.join("\n\n");
}

// --- collections ------------------------------------------------------------------------------

function listLayout(c: SqCollection): CollectionConfig["list"]["layout"] {
  const t = c.typeName ?? "";
  if (c.kind === "events") return /calendar/.test(t) ? "calendar" : "list";
  if (c.kind === "products") return "grid";
  if (c.kind === "portfolio") return "grid";
  if (/masonry/.test(t)) return "masonry";
  if (/side-by-side|single-column|alternating/.test(t)) return "list";
  return "cards";
}

function collectionConfig(
  c: SqCollection,
  kind: CollectionConfig["kind"],
  items: CollectionItem[],
): CollectionConfig {
  const cats = new Map<string, string>();
  for (const i of items) for (const s of i.frontmatter.categories ?? []) cats.set(s, s);
  const labels = new Map<string, string>();
  for (const it of c.items)
    for (const cat of it.categories) labels.set(slugify(cat, "category"), cat);
  const cfg: CollectionConfig = {
    kind,
    label: clip(c.title || "Blog", 60),
    list: {
      layout: listLayout(c),
      pageSize: c.kind === "products" ? 24 : 12,
      sort: c.kind === "events" ? "date-asc" : c.kind === "blog" ? "date-desc" : "title",
    },
  };
  if (kind === "blog") {
    cfg.itemLabel = "Post";
    cfg.itemPage = { layout: "article", showDate: true, showAuthor: true, showRelated: true };
    cfg.taxonomies = {
      ...(cats.size
        ? {
            categories: [...cats.keys()]
              .slice(0, 100)
              .map((slug) => ({ slug, label: clip(labels.get(slug) ?? slug, 60) })),
          }
        : {}),
      tags: true,
    };
    cfg.feed = {
      enabled: true,
      title: clip(c.title, 120),
      ...(c.description ? { description: clip(c.description, 500) } : {}),
    };
    cfg.slugPattern = "{title}";
  }
  if (kind === "events") {
    cfg.itemLabel = "Event";
    cfg.itemPage = { layout: "split" };
    cfg.feed = { enabled: true, format: "ical" };
  }
  if (kind === "products") cfg.itemLabel = "Product";
  if (kind === "portfolio") {
    cfg.itemLabel = "Project";
    cfg.itemPage = { layout: "gallery" };
  }
  return cfg;
}

const isoDate = (s?: string) => (s ? normalizeIso(s).slice(0, 10) : undefined);

async function itemBody(
  ctx: SectionContext,
  item: SqItem,
): Promise<{ body: string; blocks: Block[] }> {
  const sections = item.sections ?? (item.bodyHtml ? sectionsFromLayoutHtml(item.bodyHtml) : []);
  const blocks: Block[] = [];
  for (const s of sections) for (const sec of await mapSection(ctx, s)) blocks.push(...sec.blocks);
  let body = blocksToMarkdoc(blocks);
  // Round-trip through the build's own parser; drop anything it refuses.
  const check = markdocToBlocks(body, { registry, idSeed: "import", media: ctx.media.media });
  if (check.issues.length) {
    const kept = blocks.filter(
      (b) =>
        !markdocToBlocks(blocksToMarkdoc([b]), { registry, idSeed: "x", media: ctx.media.media })
          .issues.length,
    );
    ctx.notices.push({
      kind: "unsupported-block",
      where: ctx.where,
      message: `${blocks.length - kept.length} block(s) in this item couldn't be written as Markdoc and were left out (${check.issues[0]?.message ?? ""}).`,
    });
    body = blocksToMarkdoc(kept);
  }
  return { body, blocks };
}

async function mapItem(
  ctx: SectionContext,
  coll: SqCollection,
  item: SqItem,
  slug: string,
  now: Date,
): Promise<CollectionItem | undefined> {
  const image = item.image ? await ctx.media.image(item.image, ctx.where) : undefined;
  const { body, blocks } = await itemBody(ctx, item);
  const excerptText = item.excerptHtml ? stripTags(item.excerptHtml) : "";
  const tags = [...new Set(item.tags.map((t) => clip(t.trim(), 40)).filter(Boolean))].slice(0, 40);
  const categories = [...new Set(item.categories.map((c) => slugify(c, "category")))].slice(0, 20);
  const seo = {
    ...(item.seo.title && stripSiteName(item.seo.title, ctx.siteTitle ?? "") !== item.title
      ? { title: clip(stripSiteName(item.seo.title, ctx.siteTitle ?? ""), 120) }
      : {}),
    ...(item.seo.description && item.seo.description !== excerptText
      ? { description: clip(item.seo.description, 320) }
      : {}),
    ...(item.seo.noindex ? { noindex: true } : {}),
  };
  const base = {
    title: clip(item.title, 200),
    status: item.draft ? ("draft" as const) : ("published" as const),
    ...(excerptText ? { excerpt: clip(excerptText, 500) } : {}),
    ...(image
      ? { image: image.src, ...(image.alt ? { imageAlt: clip(image.alt, 500) } : {}) }
      : {}),
    ...(categories.length ? { categories } : {}),
    ...(tags.length ? { tags } : {}),
    ...(Object.keys(seo).length ? { seo } : {}),
  };
  switch (coll.kind) {
    case "blog":
      return {
        kind: "blog",
        slug,
        frontmatter: {
          ...base,
          date: isoDate(item.date) ?? now.toISOString().slice(0, 10),
          ...(item.author ? { author: clip(item.author, 80) } : {}),
        },
        body,
      };
    case "events": {
      if (!item.event) {
        ctx.notices.push({
          kind: "collection",
          where: ctx.where,
          message: "Event without a date; it was left out.",
        });
        return undefined;
      }
      const start = normalizeIso(item.event.start);
      let end = item.event.end ? normalizeIso(item.event.end) : undefined;
      if (end && Date.parse(end) < Date.parse(start)) end = undefined;
      const loc = item.event.location;
      return {
        kind: "events",
        slug,
        frontmatter: {
          ...base,
          start,
          ...(end ? { end } : {}),
          ...(start.length === 10 ? { allDay: true } : {}),
          ...(ctx.timeZone && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(ctx.timeZone)
            ? { timezone: ctx.timeZone }
            : {}),
          ...(loc && (loc.name || loc.address)
            ? {
                location: {
                  ...(loc.name ? { name: clip(loc.name, 200) } : {}),
                  ...(loc.address ? { address: clip(loc.address, 300) } : {}),
                },
              }
            : {}),
        },
        body,
      };
    }
    case "products": {
      const p = item.product;
      if (!p) return undefined;
      const images: ImageValue[] = [];
      for (const im of p.images.slice(0, 50)) {
        const v = await ctx.media.image(im, ctx.where);
        if (v && !images.some((x) => x.src === v.src)) images.push(v);
      }
      const onSale = p.salePrice !== undefined && p.salePrice > 0 && p.salePrice < p.price;
      const currency = /^[A-Z]{3}$/.test(p.currency) ? p.currency : "USD";
      const options = p.options
        .slice(0, 3)
        .map((o) => ({ name: clip(o.name, 40), values: o.values.map((v) => clip(v, 60)) }));
      const optionNames = new Set(options.map((o) => o.name));
      const variants = p.variants.slice(0, 100).map((v) => ({
        ...(v.sku ? { sku: clip(v.sku, 64) } : {}),
        options: Object.fromEntries(Object.entries(v.options).filter(([k]) => optionNames.has(k))),
        ...(v.price !== undefined ? { price: { amount: v.price, currency } } : {}),
        ...(v.available === false ? { available: false } : {}),
      }));
      if (p.productType && p.productType !== "physical" && p.productType !== "digital")
        ctx.notices.push({
          kind: "commerce",
          where: ctx.where,
          message: `"${item.title}" is a ${ctx.platform ?? "Squarespace"} ${p.productType} product; imported as a regular product — check how it should sell.`,
        });
      return {
        kind: "products",
        slug,
        frontmatter: {
          ...base,
          ...(!base.image && images[0] ? { image: images[0].src } : {}),
          price: { amount: onSale ? (p.salePrice as number) : p.price, currency },
          ...(onSale ? { compareAtPrice: { amount: p.price, currency } } : {}),
          ...(p.sku ? { sku: clip(p.sku, 64) } : {}),
          ...(images.length ? { images } : {}),
          ...(options.length ? { options } : {}),
          ...(variants.length && options.length ? { variants } : {}),
          ...(p.digital ? { digital: true } : {}),
          ...(p.available === false ? { available: false } : {}),
        },
        body,
      };
    }
    case "portfolio": {
      const gallery: ImageValue[] = [];
      for (const b of blocks) {
        if (b.type === "image") gallery.push(b.fields.image as ImageValue);
        if (b.type === "gallery")
          for (const g of b.fields.images as { image: ImageValue }[]) gallery.push(g.image);
      }
      return {
        kind: "portfolio",
        slug,
        frontmatter: {
          ...base,
          ...(!base.image && gallery[0] ? { image: gallery[0].src } : {}),
          ...(isoDate(item.date) ? { date: isoDate(item.date) } : {}),
        },
        body,
      };
    }
  }
}

// --- navigation, header ------------------------------------------------------------------------

async function mapNav(
  ctx: MapContext,
  nav: SqNavItem[],
  headerAction: SqSite["headerAction"],
): Promise<NavItem[]> {
  const leaf = async (
    label: string,
    href: string,
    newTab?: boolean,
  ): Promise<NavLeaf | undefined> => {
    const r = ctx.urls.resolve(href, newTab);
    const l = clip(label, 60);
    if (r.kind === "page")
      return { type: "page", page: (r.link as { page: Page["id"] }).page, label: l };
    if (r.kind === "collection" && /^\/[a-z0-9-]+\/$/.test(r.path))
      return { type: "collection", collection: r.path.slice(1, -1), label: l };
    if (r.kind === "external" && r.link.type === "url" && /^https?:/.test(r.link.url))
      return { type: "link", label: l, href: r.link.url, ...(newTab ? { newTab: true } : {}) };
    ctx.notices.push({
      kind: "link",
      where: "navigation",
      message: `Navigation link "${label}" (${href}) leads to a page that wasn't imported; it was left out.`,
    });
    return undefined;
  };
  const out: NavItem[] = [];
  for (const n of nav) {
    if (n.type === "link") {
      const l = await leaf(n.label, n.href, n.newTab);
      if (l) out.push(l);
    } else {
      const items: NavLeaf[] = [];
      for (const i of n.items) {
        const l = await leaf(i.label, i.href, i.newTab);
        if (l) items.push(l);
      }
      if (items.length)
        out.push({ type: "folder", label: clip(n.label, 60), items: items.slice(0, 30) });
    }
  }
  if (headerAction) {
    const link = await linkFor(ctx, headerAction.href);
    if (link)
      out.push({ type: "button", label: clip(headerAction.label, 60), link, style: "primary" });
  }
  return out.slice(0, 60);
}

function headerFor(site: SqSite, siteDark: boolean): Header {
  const t = site.theme;
  const variant: Header["variant"] =
    t.headerLayout === "navCenter"
      ? "classic-center"
      : t.headerLayout === "brandingCenter"
        ? "split-nav"
        : t.headerLayout === "navLeft"
          ? "classic-left"
          : "classic-left";
  return {
    variant,
    sticky: t.headerFixed === true,
    transparentOnHero: t.headerTransparent === true,
    mobileMenu: "fullscreen",
    ...(siteDark ? { colorTheme: "dark" as const } : {}),
  };
}

/**
 * Squarespace photo sections often use a light overlay; raise it just enough that text on the
 * photo meets WCAG in the worst case (the same rule as the Design check), and say so.
 */
function legibleOverlays(
  sections: Section[],
  styles: SiteDocument["styles"],
  notices: SqNotice[],
  where: string,
) {
  let compiled: ReturnType<typeof compileStyles>;
  try {
    compiled = compileStyles(styles);
  } catch {
    return;
  }
  for (const s of sections) {
    const bg = s.style.background;
    if (!bg || (bg.type !== "image" && bg.type !== "video") || !bg.overlay) continue;
    const roles = compiled.tokens.themes[s.style.colorTheme ?? "light"] as unknown as Record<
      string,
      string
    >;
    const r = photoContrast(
      s,
      roles,
      toHexColor(bg.overlay.color),
      bg.overlay.opacity,
      styles.choices.buttons,
    );
    if (r.failures.length && r.minOpacity !== undefined) {
      notices.push({
        kind: "theme",
        where,
        message: `A photo section's overlay was darkened from ${Math.round(bg.overlay.opacity * 100)}% to ${Math.round(r.minOpacity * 100)}% so its text stays readable.`,
      });
      bg.overlay = { ...bg.overlay, opacity: r.minOpacity };
    }
  }
}

const toHexColor = (c: string) => (c.startsWith("#") ? c : "#000000");

// --- site -------------------------------------------------------------------------------------

export async function buildSite(sq: SqSite, opts: BuildOptions): Promise<BuildResult> {
  const now = opts.now ?? new Date();
  const progress = opts.onProgress ?? (() => undefined);
  const notices: SqNotice[] = [...sq.notices];
  const urls = new UrlMap(sq);
  const theme = mapTheme(sq);
  const collectionKinds = new Map<string, string>();
  for (const c of sq.collections)
    collectionKinds.set(urls.collections.get(c.path) as string, c.kind);
  const usesNewsletter = { value: false };
  const ctxFor = (where: string): SectionContext => ({
    urls,
    media: opts.media,
    notices,
    where,
    collections: collectionKinds,
    usesNewsletter,
    siteDark: theme.siteDark,
    siteTitle: sq.title,
    platform: platformLabel(sq.platform),
    ...(sq.timeZone ? { timeZone: sq.timeZone } : {}),
  });

  // Pages.
  const pages: Record<string, Page> = {};
  const pageSummaries: PageSummary[] = [];
  for (const p of sq.pages) {
    const target = urls.pages.get(p.path);
    if (!target) continue;
    progress(`Page ${p.path}`);
    const ctx = ctxFor(p.path);
    const sections: Section[] = [];
    for (const s of p.sections) sections.push(...(await mapSection(ctx, s)));
    if (p.homeOf) {
      const name = urls.collections.get(p.homeOf);
      const kind = name ? collectionKinds.get(name) : undefined;
      const block = name
        ? kind === "events"
          ? makeBlock(ctx, "events", {
              source: { collection: name, filter: { upcoming: true }, limit: 12 },
            })
          : makeBlock(
              ctx,
              "summary",
              {
                source: { collection: name, limit: 12 },
                columns: "3",
                showImage: true,
                showDate: kind === "blog",
                showExcerpt: true,
              },
              { variant: "grid" },
            )
        : undefined;
      if (block)
        sections.push({
          id: newId("sec") as Section["id"],
          layout: { mode: "stack", columns: { d: [12] } },
          style: { colorTheme: "light" },
          blocks: [block],
        });
      notices.push({
        kind: "collection",
        where: "/",
        message: `The home page was a ${sq.platform === "wordpress" ? "list of posts" : "collection"} on ${platformLabel(sq.platform)}; it is now a page listing that collection (the collection has its own address, with a redirect).`,
      });
    }
    if (!sections.length) {
      const h = makeBlock(ctx, "text", {
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: clip(p.title, 120) }],
            },
          ],
        },
      });
      if (h)
        sections.push({
          id: newId("sec") as Section["id"],
          layout: { mode: "stack", columns: { d: [12] } },
          style: { colorTheme: "light" },
          blocks: [h],
        });
      notices.push({
        kind: "other",
        where: p.path,
        message: "No content could be read from this page; it was created with just its title.",
      });
    }
    legibleOverlays(sections, theme.styles, notices, p.path);
    const seoImage = p.seo.image ? await opts.media.image(p.seo.image, p.path) : undefined;
    const seoTitle = p.seo.title ? stripSiteName(p.seo.title, sq.title) : undefined;
    const page: Page = {
      id: target.id,
      title: clip(p.title || "Page", 120),
      slug: target.slug,
      ...((seoTitle && seoTitle !== p.title) || p.seo.description || seoImage || p.seo.noindex
        ? {
            seo: {
              ...(seoTitle && seoTitle !== p.title ? { title: clip(seoTitle, 120) } : {}),
              ...(p.seo.description ? { description: clip(p.seo.description, 320) } : {}),
              ...(seoImage ? { image: seoImage.src } : {}),
              ...(p.seo.noindex ? { noindex: true } : {}),
            },
          }
        : {}),
      ...(p.hidden ? { hidden: true } : {}),
      sections,
    };
    pages[page.id] = page;
    pageSummaries.push({
      from: p.path,
      to: urls.pagePath(target),
      title: page.title,
      sections: sections.length,
      blocks: sections.reduce((n, s) => n + s.blocks.length, 0),
    });
  }

  // Collections.
  const collections: SiteDocument["collections"] = {};
  const configs: Record<string, CollectionConfig> = {};
  const collSummaries: BuildResult["collections"] = [];
  for (const c of sq.collections) {
    const name = urls.collections.get(c.path) as string;
    const items: Record<string, CollectionItem> = {};
    for (const it of c.items) {
      const t = urls.items.get(it.path);
      if (!t) continue;
      progress(`${c.kind} ${it.path}`);
      const mapped = await mapItem(ctxFor(it.path), c, it, t.slug, now);
      if (mapped) items[t.slug] = mapped;
    }
    const kind = c.kind === "products" ? "products" : c.kind;
    collections[name] = items;
    configs[name] = collectionConfig(c, kind, Object.values(items));
    collSummaries.push({
      from: c.path,
      to: `/${name}/`,
      kind: c.kind,
      items: Object.keys(items).length,
      drafts: Object.values(items).filter((i) => i.frontmatter.status === "draft").length,
    });
  }

  // Site chrome.
  const ctx = ctxFor("site");
  const nav = await mapNav(ctx, sq.nav, sq.headerAction);
  const footerCtx = ctxFor("footer");
  let footer = await mapFooter(footerCtx, sq.footer);
  if (!footer) {
    const text = makeBlock(footerCtx, "text", {
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `© ${now.getFullYear()} ${sq.title}` }],
          },
        ],
      },
    });
    footer = {
      id: newId("sec") as Section["id"],
      label: "Footer",
      layout: { mode: "stack", columns: { d: [12] } },
      style: { colorTheme: theme.siteDark ? "dark" : "light-accent" },
      blocks: text ? [text] : [],
    };
  }
  const logo = sq.logo ? await opts.media.image(sq.logo, "logo") : undefined;
  const homeSeoImage = sq.pages.find((p) => p.path === "/")?.seo.image;
  const seoImage = homeSeoImage ? await opts.media.image(homeSeoImage, "site") : undefined;
  const social = sq.social
    .filter((s) => /^https:\/\//.test(s.url) || s.url.startsWith("mailto:"))
    .map((s) => ({ network: s.network, url: s.url }))
    .slice(0, 30) as Site["social"];
  const locale = /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(sq.locale ?? "")
    ? (sq.locale as string)
    : "en-US";
  const site: Site = {
    title: clip(sq.title, 120),
    ...(sq.description ? { tagline: clip(sq.description, 200) } : {}),
    ...(logo
      ? {
          logo: {
            src: logo.src,
            alt: clip(logo.alt || sq.title, 200),
            width: logo.width,
            height: logo.height,
          },
        }
      : {}),
    nav,
    header: headerFor(sq, theme.siteDark),
    footer,
    ...(social?.length ? { social } : {}),
    seo: {
      titleTemplate: `%s — ${clip(sq.title, 100)}`,
      ...(sq.description ? { description: clip(sq.description, 320) } : {}),
      ...(seoImage ? { image: seoImage.src } : {}),
    },
    locale,
    integrations: { analytics: false, bookingUrl: null, stripeConnected: false },
  };
  // Redirects: only for addresses not taken by a page.
  const slugs = new Set(Object.values(pages).map((p) => p.slug));
  const redirects = urls.redirects
    .filter((r) => !slugs.has(r.from.replace(/^\/+|\/+$/g, "")))
    .slice(0, 1000)
    .map((r) => ({ ...r, status: 301 as const }));
  if (redirects.length) site.redirects = redirects;

  const config: SiteConfig = {
    ...opts.config,
    features: {
      ...opts.config.features,
      ...(usesNewsletter.value ? { newsletter: true } : {}),
      forms: true,
    },
  };
  let doc: SiteDocument = {
    config,
    site,
    styles: theme.styles,
    pages,
    collections,
    collectionConfigs: configs,
    media: opts.media.media as SiteDocument["media"],
  };

  // Last line of defence: no link may lead nowhere (same rules as `openspace check`).
  const linkFixes: BuildResult["linkFixes"] = [];
  if (findBrokenLinks(doc).length) {
    const fixedPages: Record<string, Page> = {};
    for (const p of Object.values(doc.pages)) {
      const r = resolveInternalLinks(p, doc);
      fixedPages[p.id] = r.value;
      for (const c of r.changes) linkFixes.push({ where: `/${p.slug}`, from: c.from, to: c.to });
    }
    const siteFix = resolveInternalLinks(doc.site, doc);
    for (const c of siteFix.changes) linkFixes.push({ where: "site", from: c.from, to: c.to });
    const fixedCollections: SiteDocument["collections"] = {};
    for (const [name, items] of Object.entries(doc.collections)) {
      fixedCollections[name] = {};
      for (const [slug, item] of Object.entries(items)) {
        const r = resolveInternalLinks(item, doc);
        (fixedCollections[name] as Record<string, CollectionItem>)[slug] = r.value;
        for (const c of r.changes)
          linkFixes.push({ where: `/${name}/${slug}`, from: c.from, to: c.to });
      }
    }
    doc = { ...doc, pages: fixedPages, site: siteFix.value, collections: fixedCollections };
  }

  const parsed = SiteDocumentSchema.safeParse(doc);
  if (!parsed.success)
    throw new Error(
      `The imported site doesn't validate (a bug in the importer): ${parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  notices.push(...opts.media.notices);
  return {
    doc,
    notices,
    pages: pageSummaries,
    collections: collSummaries,
    redirects: redirects.map(({ from, to }) => ({ from, to })),
    themeNotes: theme.notes,
    linkFixes,
  };
}

export type { SqPage };
