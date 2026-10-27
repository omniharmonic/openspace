/**
 * Read a WordPress site into the source model from its public REST API (`/wp-json/wp/v2/pages`,
 * `posts`, `categories`, `tags`, with embedded authors, terms and featured media) and/or a WXR
 * export (Tools → Export: drafts, menus, attachments and SEO meta included), plus the home page's
 * HTML for what the API doesn't describe: the header navigation, logo, footer and the look.
 *
 * Block-editor content maps block by block (paragraphs, headings, lists, images, galleries,
 * buttons, columns, covers, quotes, embeds, tables…) through the shared extractor; classic content
 * becomes rich text. Posts become a journal collection; permalinks and category/tag archives get
 * redirects; Yoast and Rank Math titles, descriptions and share images become page SEO.
 */
import { parseHtmlFragment } from "../dom";
import { RobotsDisallowed, type SiteFetcher } from "../fetch";
import { type HtmlPage, parseHtmlPage, sectionsFrom, sitePath } from "../html/extract";
import { themeFromCss } from "../html/theme";
import { socialNetwork } from "../squarespace/crawl";
import { parseWxr, type WxrFile, type WxrItem } from "../squarespace/wxr";
import type {
  SqCollection,
  SqImage,
  SqItem,
  SqNavItem,
  SqNotice,
  SqPage,
  SqSection,
  SqSeo,
  SqSite,
} from "../types";
import { type Attachment, decodeEntities, wpRawToHtml } from "./content";

export interface WpCrawlOptions {
  url: string;
  fetcher: SiteFetcher;
  /** Contents of a WordPress export (WXR). */
  wxr?: string;
  /** The REST API root, when detection found it (`<link rel="https://api.w.org/">`). */
  apiRoot?: string;
  generator?: string;
  maxPages?: number;
  onProgress?: (message: string) => void;
}

export class NotWordPressError extends Error {}

type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const rendered = (v: unknown): string => str((v as { rendered?: unknown } | undefined)?.rendered) ?? "";

const BLOG_SLUGS = /^(?:blog|news|journal|articles|posts|stories|updates|insights|writing)$/i;
const COMMERCE_SLUGS = /^(?:cart|checkout|my-account|basket|shop|wishlist)$/i;
const BUILDER =
  /elementor|et_pb_|vc_row|fl-builder|brxe-|fusion-builder|siteorigin-panels|kb-row-layout|wp-block-uagb|stk-block/i;

/** The best rendition of a media item at or under 2400 px (others as fallbacks). */
export function wpMediaImage(m: Json | undefined, altFallback = ""): SqImage | undefined {
  if (!m) return undefined;
  const url = str(m.source_url);
  if (!url) return undefined;
  const d = (m.media_details ?? {}) as {
    width?: number;
    height?: number;
    sizes?: Record<string, { source_url?: string; width?: number; height?: number }>;
  };
  const sizes = Object.values(d.sizes ?? {})
    .filter((s) => s.source_url && s.width && s.height)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const fits = (w?: number, h?: number) => Math.max(w ?? 0, h ?? 0) <= 2400;
  const full = { source_url: url, width: d.width, height: d.height };
  const ordered = [
    ...(d.width && fits(d.width, d.height) ? [full] : []),
    ...sizes.filter((s) => fits(s.width, s.height)),
    ...(d.width && fits(d.width, d.height) ? [] : [full]),
  ];
  const first = ordered[0] ?? full;
  return {
    url: first.source_url as string,
    alt: decodeEntities(str(m.alt_text) ?? altFallback),
    ...(first.width && first.height ? { width: first.width, height: first.height } : {}),
    ...(ordered.length > 1
      ? { alternates: ordered.slice(1, 4).map((s) => s.source_url as string) }
      : {}),
  };
}

/** Yoast's `yoast_head_json`, or a head HTML string (Rank Math `getHead`). */
function seoFrom(yoast: unknown, headHtml?: string): SqSeo {
  const seo: SqSeo = {};
  if (yoast && typeof yoast === "object") {
    const y = yoast as Json;
    if (str(y.title)) seo.title = decodeEntities(y.title as string);
    const desc = str(y.description) ?? str(y.og_description);
    if (desc) seo.description = decodeEntities(desc);
    const og = Array.isArray(y.og_image) ? (y.og_image[0] as Json | undefined) : undefined;
    if (og && str(og.url)) seo.image = { url: og.url as string, alt: "" };
    const robots = y.robots as Json | undefined;
    if (robots && robots.index === "noindex") seo.noindex = true;
  }
  if (headHtml) {
    const meta = (k: string) =>
      new RegExp(`<meta[^>]+(?:name|property)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i").exec(
        headHtml,
      )?.[1];
    const title = /<title>([^<]*)<\/title>/i.exec(headHtml)?.[1];
    if (title && !seo.title) seo.title = decodeEntities(title);
    const d = meta("description") ?? meta("og:description");
    if (d && !seo.description) seo.description = decodeEntities(d);
    const img = meta("og:image");
    if (img && !seo.image) seo.image = { url: img, alt: "" };
    if (/noindex/i.test(meta("robots") ?? "")) seo.noindex = true;
  }
  return seo;
}

function wxrSeo(meta: Record<string, string>): SqSeo {
  const clean = (v?: string) => (v && !/%%|%[a-z_]+%/.test(v) ? decodeEntities(v) : undefined);
  const title = clean(meta._yoast_wpseo_title) ?? clean(meta.rank_math_title);
  const description = clean(meta._yoast_wpseo_metadesc) ?? clean(meta.rank_math_description);
  const noindex =
    meta["_yoast_wpseo_meta-robots-noindex"] === "1" || /noindex/.test(meta.rank_math_robots ?? "");
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(noindex ? { noindex: true } : {}),
  };
}

function excerptHtml(html: string): string | undefined {
  const t = html
    .replace(/<a[^>]*class="[^"]*more-link[^"]*"[\s\S]*?<\/a>/gi, "")
    .replace(/\s*(?:\[(?:&hellip;|…|\.\.\.)\]|&hellip;|…)\s*(?=<\/p>|$)/g, "…")
    .trim();
  return decodeEntities(t) ? t : undefined;
}

const isoGmt = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s || s.startsWith("0000")) return undefined;
  return /Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
};

/** Crawl a WordPress site. */
export async function crawlWordPress(opts: WpCrawlOptions): Promise<SqSite> {
  const progress = opts.onProgress ?? (() => undefined);
  const notices: SqNotice[] = [];
  const f = opts.fetcher;
  const sources: string[] = [];
  let base: string;
  try {
    base = new URL(opts.url.includes("://") ? opts.url : `https://${opts.url}`).origin;
  } catch {
    throw new Error(`"${opts.url}" is not a web address.`);
  }
  const wxr: WxrFile | undefined = opts.wxr ? parseWxr(opts.wxr) : undefined;
  if (wxr) sources.push("the WordPress export (WXR)");

  // Home page HTML: header, footer, look (and the REST API's address).
  progress(`Reading ${base}`);
  let home: HtmlPage | undefined;
  let homeHtml = "";
  try {
    const r = await f.text(`${base}/`);
    if (r && r.status < 400) {
      homeHtml = r.text;
      home = parseHtmlPage(r.text, r.url || `${base}/`);
      base = new URL(home.url).origin;
      sources.push("the home page's HTML (navigation, footer, look)");
    }
  } catch (e) {
    if (!(e instanceof RobotsDisallowed)) throw e;
  }
  if (!home && !wxr)
    throw new Error(
      `Couldn't read ${base}. Check the address and that the site is public, or pass the WordPress export with --export.`,
    );
  const apiRoot =
    opts.apiRoot ??
    /<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]*href=["']([^"']+)["']/i.exec(homeHtml)?.[1] ??
    `${base}/wp-json/`;
  const endpoint = (route: string, params = "") => {
    const root = apiRoot.endsWith("/") || apiRoot.includes("rest_route=") ? apiRoot : `${apiRoot}/`;
    if (root.includes("rest_route=")) return `${root}${route}${params ? `&${params}` : ""}`;
    return `${root}${route}${params ? `?${params}` : ""}`;
  };
  const getJson = async <T>(url: string): Promise<T | undefined> => {
    try {
      return await f.json<T>(url);
    } catch (e) {
      if (e instanceof RobotsDisallowed)
        notices.push({
          kind: "robots",
          where: new URL(url).pathname,
          message: "robots.txt asks tools not to read the REST API; it was skipped.",
        });
      return undefined;
    }
  };
  const index = await getJson<Json>(endpoint(""));
  const rest = !!index && Array.isArray(index.namespaces) && (index.namespaces as string[]).includes("wp/v2");
  if (!rest && !wxr && home && !/wp-content|wp-includes|wp-json/.test(homeHtml))
    throw new NotWordPressError(`${base} doesn't look like a WordPress site.`);
  const namespaces = new Set<string>(rest ? (index?.namespaces as string[]) : []);
  if (rest) sources.unshift("the WordPress REST API");
  else if (!wxr)
    notices.push({
      kind: "fetch",
      where: "/wp-json/",
      message:
        "The WordPress REST API isn't public on this site, so pages and posts were read from their HTML. Pass the WordPress export (Tools → Export) with --export for complete content.",
    });

  const budget = { left: opts.maxPages ?? 400 };
  const listAll = async (route: string, params: string): Promise<Json[]> => {
    const out: Json[] = [];
    for (let page = 1; page <= 50 && budget.left > 0; page++) {
      progress(`${route} (page ${page})`);
      const list = await getJson<Json[]>(endpoint(route, `${params}&per_page=100&page=${page}`));
      if (!Array.isArray(list) || !list.length) break;
      out.push(...list);
      budget.left -= list.length;
      if (list.length < 100) break;
    }
    return out;
  };

  // Attachments (WXR) for featured images and [gallery] shortcodes.
  const attachments = new Map<string, Attachment>();
  for (const it of wxr?.items ?? [])
    if (it.postType === "attachment" && it.id && it.attachmentUrl)
      attachments.set(it.id, {
        url: it.attachmentUrl,
        ...(it.meta._wp_attachment_image_alt ? { alt: it.meta._wp_attachment_image_alt } : {}),
        ...(it.excerptHtml ? { caption: it.excerptHtml } : {}),
      });

  // --- Raw entries: REST and/or WXR --------------------------------------------------------------
  interface Entry {
    type: "page" | "post";
    path: string;
    slug: string;
    title: string;
    html: string;
    status: "publish" | "draft";
    date?: string;
    author?: string;
    categories: string[];
    tags: string[];
    excerpt?: string;
    image?: SqImage;
    seo: SqSeo;
    menuOrder?: number;
    source: "rest" | "wxr";
  }
  const entries: Entry[] = [];
  const pathOf = (link: string | undefined, fallback: string) =>
    (link ? sitePath(link, base) : undefined) ?? fallback;

  if (rest) {
    const [pages, posts] = [
      await listAll("wp/v2/pages", "_embed=1&orderby=menu_order&order=asc"),
      await listAll("wp/v2/posts", "_embed=1"),
    ];
    const rankMath = namespaces.has("rankmath/v1");
    for (const [type, list] of [
      ["page", pages],
      ["post", posts],
    ] as const)
      for (const p of list) {
        const link = str(p.link);
        const slug = str(p.slug) ?? "";
        const embedded = (p._embedded ?? {}) as Json;
        const terms = ((embedded["wp:term"] ?? []) as Json[][]).flat();
        const featured = ((embedded["wp:featuredmedia"] ?? []) as Json[])[0];
        const authorName = str(((embedded.author ?? []) as Json[])[0]?.name);
        let seo = seoFrom(p.yoast_head_json);
        if (rankMath && !Object.keys(seo).length && link && budget.left > 0) {
          const head = await getJson<{ head?: string }>(
            endpoint("rankmath/v1/getHead", `url=${encodeURIComponent(link)}`),
          );
          if (head?.head) seo = seoFrom(undefined, head.head);
        }
        entries.push({
          type,
          path: pathOf(link, `/${slug}`),
          slug,
          title: decodeEntities(rendered(p.title)) || slug || "Untitled",
          html: rendered(p.content),
          status: "publish",
          ...(isoGmt(p.date_gmt) ? { date: isoGmt(p.date_gmt) } : {}),
          ...(authorName ? { author: decodeEntities(authorName) } : {}),
          categories: terms
            .filter((t) => t.taxonomy === "category" && t.slug !== "uncategorized")
            .map((t) => decodeEntities(String(t.name))),
          tags: terms.filter((t) => t.taxonomy === "post_tag").map((t) => decodeEntities(String(t.name))),
          ...(excerptHtml(rendered(p.excerpt)) ? { excerpt: excerptHtml(rendered(p.excerpt)) } : {}),
          ...(wpMediaImage(featured) ? { image: wpMediaImage(featured) } : {}),
          seo,
          ...(typeof p.menu_order === "number" ? { menuOrder: p.menu_order } : {}),
          source: "rest",
        });
      }
  }
  if (wxr) {
    const known = new Set(entries.map((e) => `${e.type}:${e.slug}`));
    let added = 0;
    for (const it of wxr.items) {
      if (it.postType !== "page" && it.postType !== "post") continue;
      if (it.status === "trash" || it.status === "auto-draft" || it.status === "inherit") continue;
      const slug = it.slug ?? "";
      const where = it.path ?? `/${slug}`;
      const html = wpRawToHtml(it.contentHtml, { attachments, notices, where });
      const existing = entries.find((e) => e.type === it.postType && e.slug === slug && slug);
      if (existing) {
        // The live site renders dynamic blocks better; the export knows the SEO meta.
        existing.seo = { ...wxrSeo(it.meta), ...existing.seo };
        continue;
      }
      if (known.has(`${it.postType}:${slug}`)) continue;
      if (it.postType === "page" && it.status !== "publish") {
        notices.push({
          kind: "other",
          where,
          message: `Page "${it.title}" is ${it.status} in WordPress; it was not imported.`,
        });
        continue;
      }
      const thumb = it.meta._thumbnail_id ? attachments.get(it.meta._thumbnail_id) : undefined;
      entries.push({
        type: it.postType,
        path: it.status === "publish" && it.path ? it.path : it.postType === "post" ? `/${slug || it.id}` : where,
        slug: slug || `post-${it.id ?? entries.length}`,
        title: decodeEntities(it.title) || "Untitled",
        html,
        status: it.status === "publish" ? "publish" : "draft",
        ...(it.date ? { date: it.date } : {}),
        ...(it.author ? { author: it.author } : {}),
        categories: it.categories.filter((c) => c.toLowerCase() !== "uncategorized"),
        tags: it.tags,
        ...(it.excerptHtml ? { excerpt: it.excerptHtml } : {}),
        ...(thumb ? { image: { url: thumb.url, alt: thumb.alt ?? "" } } : {}),
        seo: wxrSeo(it.meta),
        ...(it.menuOrder !== undefined ? { menuOrder: it.menuOrder } : {}),
        source: "wxr",
      });
      added++;
    }
    notices.push({
      kind: "collection",
      where: "WordPress export",
      message: `${wxr.items.filter((i) => i.postType === "post" || i.postType === "page").length} page(s) and post(s) in the export${rest ? ` (${added} not on the live site, e.g. drafts)` : ""}.`,
    });
  }

  // Without the REST API or an export: read pages and posts from their HTML.
  if (!rest && !wxr && home) {
    const { crawlGeneric } = await import("../generic/crawl");
    const site = await crawlGeneric({
      url: base,
      fetcher: f,
      platform: "wordpress",
      ...(opts.generator ? { generator: opts.generator } : {}),
      ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
      ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
    });
    site.notices.unshift(...notices);
    return site;
  }

  // --- Collections and pages ------------------------------------------------------------------------
  const pageEntries = entries.filter((e) => e.type === "page");
  const postEntries = entries.filter((e) => e.type === "post");
  const bodyClasses = home?.bodyClasses ?? [];
  const postsOnFront = bodyClasses.includes("blog") && bodyClasses.includes("home");
  const postsPage = pageEntries.find(
    (p) => BLOG_SLUGS.test(p.slug) && !decodeEntities(p.html.replace(/<[^>]+>/g, " ")).trim(),
  );
  const postsPath = postsPage?.path ?? "/journal";
  const collections: SqCollection[] = [];
  if (postEntries.length) {
    const items: SqItem[] = postEntries.map((e) => ({
      path: e.path,
      title: e.title,
      ...(e.date ? { date: e.date } : {}),
      ...(e.author ? { author: e.author } : {}),
      tags: e.tags,
      categories: e.categories,
      ...(e.excerpt ? { excerptHtml: e.excerpt } : {}),
      sections: bodySections(e.html, base, postsPath, notices, e.path).map((s) => ({ ...s, role: undefined })),
      ...(e.image ? { image: e.image } : {}),
      seo: e.seo,
      ...(e.status === "draft" ? { draft: true } : {}),
      source: e.source === "rest" ? "rest" : "wxr",
    }));
    collections.push({
      path: postsPath,
      title: postsPage?.title ?? "Journal",
      kind: "blog",
      seo: postsPage?.seo ?? {},
      items,
    });
  }

  const nav: SqNavItem[] = home?.header.nav.length ? home.header.nav : wxrNav(wxr, base, entries);
  const navPaths = new Set<string>();
  for (const n of nav)
    for (const h of n.type === "link" ? [n.href] : n.items.map((i) => i.href)) {
      const p = sitePath(h, base);
      if (p) navPaths.add(p);
    }
  const pages: SqPage[] = [];
  const builders = new Set<string>();
  for (const e of pageEntries.sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0))) {
    if (e === postsPage) continue;
    if (COMMERCE_SLUGS.test(e.slug) && e.path.split("/").filter(Boolean).length === 1) {
      notices.push({
        kind: "commerce",
        where: e.path,
        message: `The "${e.title}" page belongs to a shop plugin (WooCommerce or similar); it was not imported. Products and checkout need the Cloudflare target and Stripe.`,
      });
      continue;
    }
    const builder = BUILDER.exec(e.html)?.[0];
    if (builder) builders.add(builder.replace(/[_-]+$/, ""));
    progress(`Page ${e.path}`);
    pages.push({
      path: e.path,
      title: e.title,
      seo: { ...(e.image && !e.seo.image ? { image: e.image } : {}), ...e.seo },
      sections: bodySections(e.html, base, postsPath, notices, e.path),
      ...(nav.length && !navPaths.has(e.path) && e.path !== "/" ? { hidden: true } : {}),
    });
  }
  if (!pages.some((p) => p.path === "/")) {
    // Posts on the front page (or no static front page): a home page listing the journal.
    pages.unshift({
      path: "/",
      title: "Home",
      seo: home?.seo ?? {},
      sections: postsOnFront || !home ? [] : home.sections,
      ...(collections.length ? { homeOf: postsPath } : {}),
    });
  }
  if (builders.size)
    notices.push({
      kind: "unsupported-block",
      where: "site",
      message: `Some pages were built with a page builder (${[...builders].join(", ")}). Their content was imported, but the layout is an approximation — compare them with the original in the parity pass.`,
    });
  if ([...namespaces].some((n) => n.startsWith("wc/")))
    notices.push({
      kind: "commerce",
      where: "site",
      message:
        "WooCommerce is installed. Products, orders and customers are not imported; OpenSpace products (Cloudflare target with Stripe) can replace a small catalog.",
    });

  // Archive redirects: categories and tags → the collection's category and tag pages.
  const redirects: { from: string; to: string }[] = [];
  if (rest && postEntries.length) {
    for (const [route, kind] of [
      ["wp/v2/categories", "category"],
      ["wp/v2/tags", "tag"],
    ] as const) {
      const terms = await getJson<Json[]>(endpoint(route, "per_page=100&hide_empty=true"));
      for (const t of Array.isArray(terms) ? terms : []) {
        const from = str(t.link) ? sitePath(t.link as string, base) : undefined;
        const slug = str(t.slug);
        if (!from || !slug || slug === "uncategorized") continue;
        redirects.push({ from, to: `${postsPath}/${kind}/${slug}` });
      }
    }
  }

  // Site identity.
  const title =
    (str(index?.name) && decodeEntities(index?.name as string)) ||
    (wxr?.title && decodeEntities(wxr.title)) ||
    home?.siteName ||
    home?.header.siteTitle ||
    new URL(base).host.replace(/^www\./, "");
  const description =
    (str(index?.description) && decodeEntities(index?.description as string)) ||
    (wxr?.description && decodeEntities(wxr.description)) ||
    home?.seo.description;
  let css = home?.inlineCss ?? "";
  for (const href of (home?.stylesheets ?? []).filter((h) => /\/themes\/|style\.css|global|theme/i.test(h)).slice(0, 4)) {
    try {
      const r = await f.text(new URL(href, base).toString());
      if (r && r.status < 400) css += `\n${r.text.slice(0, 800_000)}`;
    } catch {
      // approximate look
    }
  }
  const theme = themeFromCss(css);
  if (home?.header.sticky) theme.headerFixed = true;
  const social: SqSite["social"] = [];
  for (const url of home?.social ?? []) {
    const network = socialNetwork(url);
    if (network && !social.some((s) => s.network === network)) social.push({ network, url });
  }
  const scripts = home?.scripts ?? [];
  const lang = (home?.lang ?? wxr?.language)?.replace("_", "-");
  notices.push({
    kind: "other",
    where: "site",
    message: "Comments are not imported (OpenSpace sites have no comments); export them from WordPress if you want to keep them.",
  });
  return {
    baseUrl: base,
    title,
    ...(description ? { description } : {}),
    ...(home?.header.logo ? { logo: { ...home.header.logo, alt: home.header.logo.alt || title } } : {}),
    ...(str(index?.site_icon_url) ? { favicon: index?.site_icon_url as string } : home?.favicon ? { favicon: home.favicon } : {}),
    ...(lang ? { locale: lang } : {}),
    social,
    nav,
    ...(home?.header.action ? { headerAction: home.header.action } : {}),
    footer: home?.footer ?? [],
    theme,
    pages,
    collections,
    customCode: scripts,
    aliases: [],
    notices,
    platform: "wordpress",
    ...(opts.generator ? { generator: opts.generator } : {}),
    redirects,
    sources,
  };
}

/** Post/page HTML → sections (block-editor markup, page builders and classic HTML alike). */
function bodySections(
  html: string,
  base: string,
  postsPath: string,
  _notices: SqNotice[],
  _where: string,
): SqSection[] {
  if (!html.trim()) return [];
  const root = parseHtmlFragment(html);
  return sectionsFrom(root, base, { postsPath });
}

/** Navigation from the export's menus (the first menu, or one called primary/main/header). */
function wxrNav(wxr: WxrFile | undefined, base: string, entries: { path: string; slug: string }[]): SqNavItem[] {
  if (!wxr) return [];
  const items = wxr.items.filter((i) => i.postType === "nav_menu_item");
  if (!items.length) return [];
  const menus = [...new Set(items.flatMap((i) => i.menus))];
  const menu = menus.find((m) => /primary|main|header|top/i.test(m)) ?? menus[0];
  const mine = items
    .filter((i) => !menu || i.menus.includes(menu))
    .sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0));
  const byId = new Map(wxr.items.filter((i) => i.id).map((i) => [i.id as string, i]));
  const hrefOf = (i: WxrItem): { label: string; href: string } | undefined => {
    const m = i.meta;
    const target = m._menu_item_object_id ? byId.get(m._menu_item_object_id) : undefined;
    const href =
      m._menu_item_type === "custom"
        ? m._menu_item_url
        : target?.link ??
          (target?.slug ? entries.find((e) => e.slug === target.slug)?.path : undefined);
    const label = decodeEntities(i.title || target?.title || "");
    if (!href || !label) return undefined;
    try {
      return { label, href: new URL(href, base).toString() };
    } catch {
      return undefined;
    }
  };
  const out: SqNavItem[] = [];
  const folders = new Map<string, Extract<SqNavItem, { type: "folder" }>>();
  for (const i of mine) {
    const parent = i.meta._menu_item_menu_item_parent;
    const link = hrefOf(i);
    if (!link) continue;
    if (parent && parent !== "0") {
      const f = folders.get(parent);
      if (f) f.items.push(link);
      else {
        const p = mine.find((x) => x.id === parent);
        const pl = p ? hrefOf(p) : undefined;
        const folder: Extract<SqNavItem, { type: "folder" }> = {
          type: "folder",
          label: pl?.label ?? "More",
          items: [...(pl ? [pl] : []), link],
        };
        folders.set(parent, folder);
        const idx = out.findIndex((o) => o.type === "link" && pl && o.href === pl.href);
        if (idx >= 0) out.splice(idx, 1, folder);
        else out.push(folder);
      }
      continue;
    }
    out.push({ type: "link", ...link });
  }
  return out;
}
