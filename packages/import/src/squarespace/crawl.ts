/**
 * Read a Squarespace site into `SqSite`: the home page (header, navigation, footer, theme),
 * the sitemap, every page's HTML, and collections (blog, events, products, portfolio) — from
 * item pages, or from Squarespace's `?format=json` data when the owner allows it (`owner`),
 * plus a WordPress export for blog posts.
 */
import { outerHtml } from "../dom";
import { RobotsDisallowed, type SiteFetcher } from "../fetch";
import { cleanImageUrl, stripTags } from "./blocks";
import { type ParsedPage, parsePage, sectionsFromLayoutHtml } from "./page";
import { parseTheme } from "./theme";
import type {
  SqCollection,
  SqCollectionKind,
  SqImage,
  SqItem,
  SqNavItem,
  SqNotice,
  SqPage,
  SqProduct,
  SqSection,
  SqSeo,
  SqSite,
} from "./types";
import { parseWxr, type WxrItem } from "./wxr";

export interface CrawlOptions {
  url: string;
  fetcher: SiteFetcher;
  /**
   * The site's owner confirmed they own it: also read Squarespace's `?format=json` data (richer
   * collections, SEO fields, product variants). robots.txt asks crawlers not to read it.
   */
  owner?: boolean;
  /** Contents of a WordPress (WXR) export, for blog posts. */
  wxr?: string;
  /** Most pages + items to read (default 400). */
  maxPages?: number;
  onProgress?: (message: string) => void;
}

export class NotSquarespaceError extends Error {}

/** `https://example.com/about/` → `https://example.com` origin + normalized `/about`. */
export function normalizePath(href: string, base: string): string | undefined {
  try {
    const u = new URL(href, base);
    const b = new URL(base);
    const sameSite =
      u.host === b.host || u.host.replace(/^www\./, "") === b.host.replace(/^www\./, "");
    if (!sameSite || !/^https?:$/.test(u.protocol)) return undefined;
    const p = decodeURI(u.pathname).replace(/\/+$/, "") || "/";
    return p;
  } catch {
    return undefined;
  }
}

function collectionKind(
  bodyClasses: readonly string[],
  typeName?: string,
): SqCollectionKind | "page" | "gallery" | "index" | "other" {
  const t =
    typeName ??
    bodyClasses.find((c) => c.startsWith("collection-type-"))?.slice("collection-type-".length) ??
    "page";
  if (t.startsWith("blog")) return "blog";
  if (t.startsWith("events") || t.startsWith("calendar")) return "events";
  if (t.startsWith("products") || t === "store" || t.startsWith("commerce")) return "products";
  if (t.startsWith("portfolio") || t === "project") return "portfolio";
  if (t.startsWith("gallery")) return "gallery";
  if (t === "index") return "index";
  if (t === "page" || t === "layout") return "page";
  return "other";
}

const SITE_SUFFIX = /\s+[—–|·-]\s+[^—–|·]+$/;

function msToIso(ms: unknown): string | undefined {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : undefined;
}

function seoFromJson(collection: Record<string, unknown>, fallback: SqSeo): SqSeo {
  const seo = (collection.seoData ?? {}) as Record<string, unknown>;
  const title =
    typeof seo.seoTitle === "string" && seo.seoTitle.trim() ? seo.seoTitle.trim() : fallback.title;
  const description =
    typeof seo.seoDescription === "string" && seo.seoDescription.trim()
      ? stripTags(seo.seoDescription)
      : fallback.description;
  return {
    ...fallback,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(seo.seoHidden === true ? { noindex: true } : {}),
  };
}

function imageFromAsset(o: Record<string, unknown> | undefined, alt = ""): SqImage | undefined {
  if (!o || typeof o.assetUrl !== "string" || !/^https?:|^\/\//.test(o.assetUrl)) return undefined;
  if (typeof o.contentType === "string" && !o.contentType.startsWith("image/")) return undefined;
  const size = /^(\d+)x(\d+)$/.exec(String(o.originalSize ?? ""));
  const fp = o.mediaFocalPoint as { x?: number; y?: number } | undefined;
  return {
    url: cleanImageUrl(o.assetUrl),
    alt: (typeof o.title === "string" && o.title.trim()) || alt,
    ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
    ...(fp && typeof fp.x === "number" && typeof fp.y === "number" && (fp.x !== 0.5 || fp.y !== 0.5)
      ? { focal: [fp.x, fp.y] as [number, number] }
      : {}),
  };
}

function productFromJson(item: Record<string, unknown>): SqProduct {
  const sc = (item.structuredContent ?? item) as Record<string, unknown>;
  const variants = (Array.isArray(sc.variants) ? sc.variants : []) as Record<string, unknown>[];
  const money = (m: unknown, cents: unknown): { amount?: number; currency?: string } => {
    const mm = m as { value?: string; currency?: string } | undefined;
    if (mm?.value !== undefined)
      return { amount: Math.round(Number(mm.value) * 100), currency: mm.currency };
    const c = Number(cents);
    return Number.isFinite(c) ? { amount: c } : {};
  };
  const first = variants[0] ?? {};
  const base = money(first.priceMoney ?? sc.priceMoney, first.price ?? sc.priceCents);
  const sale = money(first.salePriceMoney, first.salePrice);
  const optionNames: string[] = Array.isArray(sc.variantOptionOrdering)
    ? (sc.variantOptionOrdering as string[])
    : [...new Set(variants.flatMap((v) => Object.keys((v.attributes ?? {}) as object)))];
  const options = optionNames
    .map((name) => ({
      name,
      values: [
        ...new Set(
          variants
            .map((v) => ((v.attributes ?? {}) as Record<string, string>)[name])
            .filter(Boolean),
        ),
      ] as string[],
    }))
    .filter((o) => o.values.length);
  const images = ((Array.isArray(item.items) ? item.items : []) as Record<string, unknown>[])
    .map((i) => imageFromAsset(i, String(item.title ?? "")))
    .filter((x): x is SqImage => !!x);
  const productType =
    { 1: "physical", 2: "digital", 3: "service", 4: "gift-card" }[Number(sc.productType)] ??
    undefined;
  return {
    price: base.amount ?? 0,
    currency: base.currency ?? "USD",
    ...(first.onSale === true && sale.amount ? { salePrice: sale.amount } : {}),
    ...(typeof first.sku === "string" ? { sku: first.sku } : {}),
    images,
    options,
    variants:
      variants.length > 1 || options.length
        ? variants.map((v) => {
            const m = money(v.priceMoney, v.price);
            return {
              ...(typeof v.sku === "string" ? { sku: v.sku } : {}),
              options: (v.attributes ?? {}) as Record<string, string>,
              ...(m.amount !== undefined && m.amount !== base.amount ? { price: m.amount } : {}),
              available: v.unlimited === true || Number(v.qtyInStock) > 0,
            };
          })
        : [],
    available: variants.length
      ? variants.some((v) => v.unlimited === true || Number(v.qtyInStock) > 0)
      : true,
    ...(productType === "digital" ? { digital: true } : {}),
    ...(productType ? { productType } : {}),
  };
}

function itemFromJson(raw: Record<string, unknown>, kind: SqCollectionKind): SqItem {
  const author = raw.author as { displayName?: string } | undefined;
  const loc = raw.location as Record<string, unknown> | undefined;
  const item: SqItem = {
    path: String(raw.fullUrl ?? ""),
    title: String(raw.title ?? "Untitled").trim() || "Untitled",
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    categories: Array.isArray(raw.categories) ? (raw.categories as string[]) : [],
    seo: seoFromJson(raw, {}),
    source: "json",
  };
  const date = msToIso(raw.publishOn ?? raw.addedOn);
  if (date) item.date = date;
  if (author?.displayName) item.author = author.displayName;
  if (typeof raw.excerpt === "string" && stripTags(raw.excerpt)) item.excerptHtml = raw.excerpt;
  if (typeof raw.body === "string" && raw.body.trim()) item.bodyHtml = raw.body;
  const img = imageFromAsset(raw, String(raw.title ?? ""));
  if (img) item.image = { ...img, alt: "" };
  if (raw.workflowState === 2 || raw.draft === true) item.draft = true;
  if (kind === "events") {
    const start = msToIso(raw.startDate);
    if (start) {
      const address = loc
        ? [loc.addressLine1, loc.addressLine2, loc.addressCountry]
            .filter((s) => typeof s === "string" && s.trim())
            .join(", ")
        : "";
      item.event = {
        start,
        ...(msToIso(raw.endDate) ? { end: msToIso(raw.endDate) } : {}),
        ...(loc && (loc.addressTitle || address)
          ? {
              location: {
                ...(typeof loc.addressTitle === "string" && loc.addressTitle.trim()
                  ? { name: loc.addressTitle.trim() }
                  : {}),
                ...(address ? { address } : {}),
                ...(Number(loc.markerLat)
                  ? { lat: Number(loc.markerLat), lng: Number(loc.markerLng) }
                  : {}),
              },
            }
          : {}),
      };
    }
  }
  if (kind === "products") item.product = productFromJson(raw);
  return item;
}

function ldOf(page: ParsedPage, type: string): Record<string, unknown> | undefined {
  return page.item?.jsonLd.find(
    (j) =>
      j["@type"] === type || (Array.isArray(j["@type"]) && (j["@type"] as string[]).includes(type)),
  );
}

function itemFromHtml(path: string, page: ParsedPage, kind: SqCollectionKind): SqItem {
  const titleRaw = page.item?.title ?? page.pageTitle ?? page.title.replace(SITE_SUFFIX, "");
  const item: SqItem = {
    path,
    title: titleRaw.trim() || "Untitled",
    tags: [],
    categories: [],
    seo: { ...page.seo, ...(page.seo.title ? { title: page.seo.title } : {}) },
    source: "html",
  };
  if (page.item?.date) item.date = page.item.date;
  if (page.item?.author) item.author = page.item.author.replace(/^Written by\s+/i, "");
  if (page.item?.image) item.image = page.item.image;
  if (page.seo.description) item.excerptHtml = `<p>${page.seo.description}</p>`;
  if (kind === "portfolio") item.sections = page.sections;
  else if (page.item?.bodyLayout) {
    // Re-serialize is not needed: the layout element is parsed directly.
    item.sections = sectionsFromLayoutElement(page);
  }
  if (kind === "events") {
    const ev = ldOf(page, "Event");
    const start = typeof ev?.startDate === "string" ? ev.startDate : page.item?.date;
    if (start) {
      const loc = ev?.location as Record<string, unknown> | undefined;
      const address = loc?.address;
      item.event = {
        start: normalizeIso(start),
        ...(typeof ev?.endDate === "string" ? { end: normalizeIso(ev.endDate) } : {}),
        ...(loc
          ? {
              location: {
                ...(typeof loc.name === "string" && loc.name.trim()
                  ? { name: loc.name.trim() }
                  : {}),
                ...(typeof address === "string" && address.trim()
                  ? { address: address.trim() }
                  : address && typeof address === "object"
                    ? {
                        address: Object.values(address as Record<string, unknown>)
                          .filter(
                            (v) =>
                              typeof v === "string" &&
                              v &&
                              !String(v).startsWith("http") &&
                              v !== "PostalAddress",
                          )
                          .join(", "),
                      }
                    : {}),
              },
            }
          : {}),
      };
    }
  }
  if (kind === "products") {
    const p = ldOf(page, "Product");
    const rawOffers = p?.offers;
    const offers = (Array.isArray(rawOffers) ? rawOffers[0] : rawOffers) as
      | Record<string, unknown>
      | undefined;
    // An Offer's price, or an AggregateOffer's lowest (products with variants).
    const price = Number(offers?.price ?? offers?.lowPrice);
    item.product = {
      price: Number.isFinite(price) ? Math.round(price * 100) : 0,
      currency: typeof offers?.priceCurrency === "string" ? offers.priceCurrency : "USD",
      ...(typeof offers?.sku === "string" ? { sku: offers.sku } : {}),
      images: item.image ? [item.image] : [],
      options: [],
      variants: [],
      available: !/OutOfStock|SoldOut/i.test(String(offers?.availability ?? "")),
    };
    if (typeof p?.description === "string") item.excerptHtml = `<p>${p.description}</p>`;
  }
  return item;
}

/** Squarespace writes offsets without a colon (`-0400`); OpenSpace wants `-04:00`. */
export function normalizeIso(s: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
    s.trim(),
  );
  if (!m) {
    const d = Date.parse(s);
    return Number.isNaN(d) ? s : new Date(d).toISOString();
  }
  if (!m[2]) return m[1] as string;
  const off = m[4] ? (m[4] === "Z" ? "Z" : m[4].replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2")) : "Z";
  return `${m[1]}T${m[2]}${m[3] ?? ":00"}${off}`;
}

function sectionsFromLayoutElement(page: ParsedPage): SqSection[] {
  const el = page.item?.bodyLayout;
  if (!el) return [];
  // parse5 elements → serialize → reuse the fragment parser (one code path for item bodies).
  return sectionsFromLayoutHtml(outerHtml(el));
}

const NETWORKS: [RegExp, string][] = [
  [/instagram\.com/, "instagram"],
  [/facebook\.com|fb\.com/, "facebook"],
  [/twitter\.com|(^|\.)x\.com/, "x"],
  [/threads\.net/, "threads"],
  [/bsky\.app/, "bluesky"],
  [/linkedin\.com/, "linkedin"],
  [/youtube\.com|youtu\.be/, "youtube"],
  [/tiktok\.com/, "tiktok"],
  [/pinterest\./, "pinterest"],
  [/github\.com/, "github"],
  [/spotify\.com/, "spotify"],
  [/soundcloud\.com/, "soundcloud"],
  [/bandcamp\.com/, "bandcamp"],
  [/vimeo\.com/, "vimeo"],
  [/behance\.net/, "behance"],
  [/dribbble\.com/, "dribbble"],
  [/substack\.com/, "substack"],
  [/patreon\.com/, "patreon"],
  [/yelp\./, "yelp"],
  [/tripadvisor\./, "tripadvisor"],
];

export function socialNetwork(url: string): string | undefined {
  if (url.startsWith("mailto:")) return "email";
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return NETWORKS.find(([re]) => re.test(host))?.[1];
  } catch {
    return undefined;
  }
}

function sitemapPaths(xml: string, base: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => normalizePath((m[1] as string).replace(/&amp;/g, "&"), base))
    .filter((p): p is string => !!p);
}

/** Crawl a Squarespace site. */
export async function crawlSquarespace(opts: CrawlOptions): Promise<SqSite> {
  const progress = opts.onProgress ?? (() => undefined);
  const notices: SqNotice[] = [];
  const f = opts.fetcher;
  let base: string;
  try {
    base = new URL(opts.url.includes("://") ? opts.url : `https://${opts.url}`).origin;
  } catch {
    throw new Error(`"${opts.url}" is not a web address.`);
  }
  const abs = (p: string) => new URL(p, base).toString();
  const getHtml = async (path: string): Promise<{ page: ParsedPage; html: string } | undefined> => {
    try {
      const r = await f.text(abs(path));
      if (!r || r.status >= 400) {
        if (r) notices.push({ kind: "fetch", where: path, message: `HTTP ${r.status}` });
        return undefined;
      }
      return { page: parsePage(r.text), html: r.text };
    } catch (e) {
      if (e instanceof RobotsDisallowed) {
        notices.push({
          kind: "robots",
          where: path,
          message: "robots.txt asks tools not to read this page; skipped.",
        });
        return undefined;
      }
      notices.push({ kind: "fetch", where: path, message: (e as Error).message });
      return undefined;
    }
  };
  const getJson = async (
    path: string,
    extra = "",
  ): Promise<Record<string, unknown> | undefined> => {
    if (!opts.owner) return undefined;
    const sep = path.includes("?") ? "&" : "?";
    try {
      return await f.json<Record<string, unknown>>(abs(`${path}${sep}format=json${extra}`));
    } catch {
      return undefined;
    }
  };

  progress(`Reading ${base}`);
  const home = await getHtml("/");
  if (!home)
    throw new Error(
      `Couldn't read ${base}. Check the address and that the site is public (not password-protected).`,
    );
  if (!/squarespace/i.test(home.html))
    throw new NotSquarespaceError(
      `${base} doesn't look like a Squarespace site (no Squarespace markup on the home page).`,
    );
  const homeJson = await getJson("/");
  const website = (homeJson?.website ?? {}) as Record<string, unknown>;

  // Theme: site.css (+ inline variables).
  let css = home.page.inlineCss;
  for (const href of home.page.stylesheets.slice(0, 2)) {
    try {
      const r = await f.text(new URL(href, base).toString());
      if (r && r.status < 400) css += `\n${r.text}`;
    } catch {
      notices.push({
        kind: "theme",
        where: href,
        message: "Couldn't read the site stylesheet; colors and fonts are approximate.",
      });
    }
  }
  const theme = parseTheme(css, home.page.bodyClasses);
  if (home.page.header.layout) theme.headerLayout = home.page.header.layout;
  if (home.page.header.theme) theme.headerTheme = home.page.header.theme;

  // Discover paths: sitemap + navigation.
  let paths: string[] = [];
  try {
    const sm = await f.text(abs("/sitemap.xml"));
    if (sm && sm.status < 400) paths = sitemapPaths(sm.text, base);
  } catch {
    notices.push({
      kind: "fetch",
      where: "/sitemap.xml",
      message: "No sitemap; only pages linked from the navigation were imported.",
    });
  }
  const navHrefs: string[] = [];
  const nav: SqNavItem[] = home.page.header.nav;
  for (const n of nav) {
    if (n.type === "link") navHrefs.push(n.href);
    else for (const i of n.items) navHrefs.push(i.href);
  }
  const navPaths = navHrefs.map((h) => normalizePath(h, base)).filter((p): p is string => !!p);
  const all = [...new Set(["/", ...navPaths, ...paths])].filter(
    (p) =>
      !/^\/(?:config|search|account|cart|checkout|commerce|api|static|s|universal)(?:\/|$)/.test(p),
  );

  // Top-level pages first; deeper paths are items of collections (or nested pages).
  const prefixes = new Set(all.filter((p) => all.some((q) => q !== p && q.startsWith(`${p}/`))));
  const pages: SqPage[] = [];
  const collections: SqCollection[] = [];
  const handled = new Set<string>();
  const budget = { left: opts.maxPages ?? 400 };
  const customCode = new Set<string>();
  const aliases: { from: string; to: string }[] = [];
  /** Other addresses of the home page (`/shop` when the shop is the home page). */
  const homeAliases = new Set<string>();
  if (home.page.customHeadCode) customCode.add(home.page.customHeadCode);

  const visitTop = async (path: string, pre?: { page: ParsedPage; html: string }) => {
    if (handled.has(path) || budget.left <= 0) return;
    handled.add(path);
    budget.left--;
    const got = pre ?? (await getHtml(path));
    if (!got) return;
    // The home page is also served at its own slug (`/home`): one page, plus a redirect.
    if (path !== "/" && got.page.bodyClasses.includes("homepage")) {
      aliases.push({ from: path, to: "/" });
      homeAliases.add(path);
      return;
    }
    const json = await getJson(path);
    const coll = (json?.collection ?? {}) as Record<string, unknown>;
    const kind = collectionKind(
      got.page.bodyClasses,
      typeof coll.typeName === "string" ? coll.typeName : undefined,
    );
    const title =
      (typeof coll.title === "string" && coll.title.trim()) ||
      got.page.pageTitle ||
      got.page.title.replace(SITE_SUFFIX, "").trim() ||
      (path === "/" ? "Home" : (path.split("/").pop() ?? "Page"));
    const seo = json ? seoFromJson(coll, got.page.seo) : got.page.seo;
    progress(`${path} (${kind})`);
    if (kind === "blog" || kind === "events" || kind === "products" || kind === "portfolio") {
      const c: SqCollection = {
        path,
        title,
        kind,
        seo,
        items: [],
        ...(typeof coll.typeName === "string" ? { typeName: coll.typeName } : {}),
        ...(typeof coll.description === "string" && stripTags(coll.description)
          ? { description: stripTags(coll.description) }
          : {}),
      };
      if (json && Array.isArray(json.items) && kind !== "portfolio") {
        let page = json;
        for (let guard = 0; guard < 50; guard++) {
          for (const it of (page.items ?? []) as Record<string, unknown>[]) {
            const item = itemFromJson(it, kind);
            if (item.path) {
              c.items.push(item);
              handled.add(item.path);
            }
          }
          const pg = page.pagination as { nextPage?: boolean; nextPageOffset?: number } | undefined;
          if (!pg?.nextPage || pg.nextPageOffset === undefined) break;
          const next = await getJson(path, `&offset=${pg.nextPageOffset}`);
          if (!next) break;
          page = next;
        }
        // Events: past events come from a separate view.
        if (kind === "events" && Array.isArray(json.past))
          for (const it of json.past as Record<string, unknown>[]) {
            const item = itemFromJson(it, kind);
            if (item.path && !handled.has(item.path)) {
              c.items.push(item);
              handled.add(item.path);
            }
          }
      }
      // Items from the sitemap (all kinds when there's no JSON, portfolio always).
      const itemPaths = all.filter(
        (p) =>
          (path === "/"
            ? // A shop as the home page lists items under its own address too (`/shop/p/x`).
              (kind === "products"
                ? // Variant products keep a slash in their slug (`/shop/p/linen-top-/-blue`).
                  /^\/(?:[^/]+\/)?p\/[^/].*$/
                : /^\/(?:p\/[^/]+|\d{4}\/\d{1,2}\/\d{1,2}\/[^/]+)$/
              ).test(p)
            : p.startsWith(`${path}/`)) &&
          !handled.has(p) &&
          !/\/(?:category|tag|tags|categories)\//.test(p.slice(path.length)),
      );
      for (const ip of itemPaths) {
        if (budget.left <= 0) break;
        handled.add(ip);
        budget.left--;
        const ig = await getHtml(ip);
        if (!ig) continue;
        if (ig.page.customHeadCode) customCode.add(ig.page.customHeadCode);
        c.items.push(itemFromHtml(ip, ig.page, kind));
      }
      collections.push(c);
      // A collection as the home page: keep a home page (its sections, if any) that lists it.
      if (path === "/")
        pages.push({
          path: "/",
          title: "Home",
          seo,
          sections: got.page.sections,
          homeOf: c.path,
          ...(got.page.collectionAt !== undefined ? { homeAt: got.page.collectionAt } : {}),
        });
      if (kind === "products")
        notices.push({
          kind: "commerce",
          where: path,
          message: `${c.items.length} product(s) imported as catalog content. Selling needs the Cloudflare target and Stripe connected in the Hub; orders, customers, inventory, discounts, shipping and tax settings stay in Squarespace.`,
        });
      return;
    }
    if (kind === "other")
      notices.push({
        kind: "collection",
        where: path,
        message: `Squarespace page type "${got.page.bodyClasses.find((c) => c.startsWith("collection-type-")) ?? "unknown"}" imported as a plain page.`,
      });
    const navLabel = (() => {
      for (const n of nav) {
        if (n.type === "link" && normalizePath(n.href, base) === path) return n.label;
        if (n.type === "folder")
          for (const i of n.items) if (normalizePath(i.href, base) === path) return i.label;
      }
      return undefined;
    })();
    const locked = got.page.locked ?? (coll.passwordProtected === true ? "password" : undefined);
    if (locked)
      notices.push({
        kind: locked === "members" ? "members" : "locked-page",
        where: path,
        message:
          locked === "members"
            ? "Member area: its content isn't public, so it was not imported. Recreate it as a members-only page (Cloudflare target)."
            : "Password-protected: its content isn't readable, so it was not imported. Recreate it as a password page (Cloudflare target).",
      });
    if (got.page.customHeadCode) customCode.add(got.page.customHeadCode);
    pages.push({
      path,
      title: navLabel && path !== "/" ? navLabel : title,
      ...(navLabel ? { navTitle: navLabel } : {}),
      seo,
      sections: locked ? [] : got.page.sections,
      ...(locked ? { locked } : {}),
      ...(!navLabel && path !== "/" ? { hidden: !paths.includes(path) } : {}),
    });
  };

  await visitTop("/", home);
  const ordered = [...navPaths, ...all];
  for (const p of ordered) {
    // A deeper path whose parent is a collection is an item, handled with the collection.
    const parent = p.split("/").slice(0, -1).join("/");
    if (parent && prefixes.has(parent) && !handled.has(parent)) await visitTop(parent);
    if (handled.has(p)) continue;
    if (parent && collections.some((c) => c.path === parent)) continue;
    // A category view of a collection that is the home page (`/shop/tops`): the home page.
    if (parent && homeAliases.has(parent) && collections.some((c) => c.path === "/")) {
      handled.add(p);
      aliases.push({ from: p, to: "/" });
      continue;
    }
    await visitTop(p);
  }
  if (budget.left <= 0)
    notices.push({
      kind: "other",
      where: "site",
      message: `Stopped after ${opts.maxPages ?? 400} pages; raise --max-pages to import the rest.`,
    });

  // WordPress export: blog posts (authoritative bodies, drafts included).
  if (opts.wxr) mergeWxr(parseWxr(opts.wxr), collections, notices);

  // Site identity.
  const social: SqSite["social"] = [];
  const accounts = (Array.isArray(website.socialAccounts) ? website.socialAccounts : []) as Record<
    string,
    unknown
  >[];
  const socialUrls = [
    ...accounts.map((a) => String(a.profileUrl ?? "")).filter(Boolean),
    ...home.page.social,
  ];
  for (const url of [...new Set(socialUrls)]) {
    const network = socialNetwork(url);
    if (network && !social.some((s) => s.network === network)) social.push({ network, url });
  }
  const logo =
    home.page.header.logo ??
    (typeof website.logoImageUrl === "string"
      ? { url: cleanImageUrl(website.logoImageUrl), alt: String(website.siteTitle ?? "") }
      : undefined);
  const title =
    (typeof website.siteTitle === "string" && website.siteTitle.trim()) ||
    home.page.header.siteTitle ||
    home.page.title.replace(SITE_SUFFIX, "").trim() ||
    new URL(base).host;
  const version = home.page.version ?? (home.html.includes("sqs-row") ? "7.0" : undefined);
  return {
    baseUrl: base,
    title,
    ...(typeof website.siteDescription === "string" && stripTags(website.siteDescription)
      ? { description: stripTags(website.siteDescription) }
      : home.page.seo.description
        ? { description: home.page.seo.description }
        : {}),
    ...(logo ? { logo: { ...logo, alt: logo.alt || title } } : {}),
    ...(home.page.favicon ? { favicon: home.page.favicon } : {}),
    ...(typeof website.language === "string"
      ? { locale: website.language }
      : home.page.lang
        ? { locale: home.page.lang }
        : {}),
    ...(typeof website.timeZone === "string" ? { timeZone: website.timeZone } : {}),
    social,
    nav,
    ...(home.page.header.action ? { headerAction: home.page.header.action } : {}),
    footer: home.page.footer,
    theme,
    pages,
    collections,
    customCode: [...customCode],
    aliases,
    ...(version ? { version } : {}),
    notices,
  };
}

/** Fold WXR posts into the blog collection(s) the crawl found (or a new one). */
export function mergeWxr(
  wxr: ReturnType<typeof parseWxr>,
  collections: SqCollection[],
  notices: SqNotice[],
) {
  const posts = wxr.items.filter((i) => i.postType === "post");
  let added = 0;
  for (const post of posts) {
    const path = post.path ?? (post.slug ? `/blog/${post.slug}` : undefined);
    if (!path) continue;
    const parent = path.split("/").slice(0, -1).join("/") || "/blog";
    let coll = collections.find((c) => c.kind === "blog" && path.startsWith(`${c.path}/`));
    if (!coll) {
      coll = collections.find((c) => c.path === parent);
      if (!coll) {
        coll = {
          path: parent,
          title: wxr.title && collections.length === 0 ? "Blog" : titleCase(parent.slice(1)),
          kind: "blog",
          seo: {},
          items: [],
        };
        collections.push(coll);
      }
    }
    const existing = coll.items.find((i) => i.path === path);
    const fromWxr = wxrItem(post, path);
    if (existing) {
      // WXR bodies are complete; keep anything the crawl knew that the export lacks.
      existing.bodyHtml = fromWxr.bodyHtml;
      delete existing.sections;
      existing.tags = fromWxr.tags.length ? fromWxr.tags : existing.tags;
      existing.categories = fromWxr.categories.length ? fromWxr.categories : existing.categories;
      existing.date ??= fromWxr.date;
      existing.author ??= fromWxr.author;
      existing.excerptHtml ??= fromWxr.excerptHtml;
      existing.image ??= fromWxr.image;
      existing.source = "wxr";
    } else {
      coll.items.push(fromWxr);
      added++;
    }
  }
  const others = wxr.items.filter(
    (i) => i.postType !== "post" && i.postType !== "attachment",
  ).length;
  notices.push({
    kind: "collection",
    where: "WordPress export",
    message: `${posts.length} post(s) read from the export (${added} not found on the live site, e.g. drafts).${others ? ` ${others} non-post entries (pages) were ignored: pages come from the live site.` : ""}`,
  });
}

const titleCase = (s: string) =>
  s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Blog";

function wxrItem(post: WxrItem, path: string): SqItem {
  return {
    path,
    title: post.title.trim() || "Untitled",
    ...(post.date ? { date: post.date } : {}),
    ...(post.author ? { author: post.author } : {}),
    tags: post.tags,
    categories: post.categories,
    ...(post.excerptHtml && stripTags(post.excerptHtml) ? { excerptHtml: post.excerptHtml } : {}),
    bodyHtml: post.contentHtml,
    ...(post.image ? { image: { url: cleanImageUrl(post.image), alt: "" } } : {}),
    seo: {},
    ...(post.status !== "publish" ? { draft: true } : {}),
    source: "wxr",
  };
}
