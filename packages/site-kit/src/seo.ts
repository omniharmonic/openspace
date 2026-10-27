/**
 * Search-engine outputs: structured data (JSON-LD), sitemap.xml, robots.txt and redirects.
 * FAQ structured data is emitted by the accordion block itself (next to its questions).
 */
import type {
  Block,
  CollectionItem,
  Page,
  Redirect,
  SiteDocument,
} from "@omniharmonic/openspace-schema";
import { absoluteUrl, xml } from "./feeds";
import { itemDescription } from "./pages";
import type { SitePlan, SiteRoute } from "./routes";

export interface SeoContext {
  /** Absolute site URL with base path, ending in `/`. */
  siteUrl: string;
  /** Absolute URL for a media source. */
  mediaUrl: (src: string) => string;
}

function allBlocks(doc: SiteDocument): Block[] {
  return [
    ...Object.values(doc.pages).flatMap((p) => p.sections.flatMap((s) => s.blocks)),
    ...doc.site.footer.blocks,
  ];
}

/** Organization, or LocalBusiness when the site shows a map with an address. */
export function organizationLd(doc: SiteDocument, ctx: SeoContext): Record<string, unknown> {
  const site = doc.site;
  const map = allBlocks(doc).find((b) => b.type === "map" && typeof b.fields.address === "string");
  const sameAs = (site.social ?? []).filter((s) => s.url.startsWith("https://")).map((s) => s.url);
  const email = site.social?.find((s) => s.network === "email")?.url.replace(/^mailto:/, "");
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": map ? "LocalBusiness" : "Organization",
    "@id": `${ctx.siteUrl}#organization`,
    name: site.title,
    url: ctx.siteUrl,
  };
  if (site.tagline) out.description = site.tagline;
  if (site.logo) out.logo = ctx.mediaUrl(site.logo.src);
  if (map) {
    const f = map.fields as {
      address?: string;
      latitude?: number;
      longitude?: number;
      name?: string;
    };
    out.address = { "@type": "PostalAddress", streetAddress: f.address };
    if (typeof f.latitude === "number" && typeof f.longitude === "number")
      out.geo = { "@type": "GeoCoordinates", latitude: f.latitude, longitude: f.longitude };
    const image = site.seo?.image ?? site.logo?.src;
    if (image) out.image = ctx.mediaUrl(image);
  }
  if (email) out.email = email;
  if (sameAs.length) out.sameAs = sameAs;
  return out;
}

export function websiteLd(doc: SiteDocument, ctx: SeoContext): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: doc.site.title,
    url: ctx.siteUrl,
    inLanguage: doc.site.locale,
    publisher: { "@id": `${ctx.siteUrl}#organization` },
  };
}

const toIso = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date(d).toISOString());

export function itemLd(
  doc: SiteDocument,
  collection: string,
  item: CollectionItem,
  ctx: SeoContext,
): Record<string, unknown> {
  const url = absoluteUrl(ctx.siteUrl, `/${collection}/${item.slug}/`);
  const fm = item.frontmatter;
  const description = itemDescription(item);
  const base: Record<string, unknown> = { "@context": "https://schema.org", name: fm.title, url };
  if (description) base.description = description;
  if (fm.image) base.image = ctx.mediaUrl(fm.image);
  const publisher = { "@id": `${ctx.siteUrl}#organization` };
  switch (item.kind) {
    case "blog": {
      const f = item.frontmatter;
      return {
        ...base,
        "@type": "BlogPosting",
        headline: f.title,
        datePublished: toIso(f.date),
        mainEntityOfPage: url,
        author: f.author
          ? { "@type": "Person", name: f.author }
          : { "@type": "Organization", name: doc.site.title },
        publisher,
        ...(f.tags?.length ? { keywords: f.tags.join(", ") } : {}),
      };
    }
    case "events": {
      const e = item.frontmatter;
      const online = e.location?.online && !e.location.address;
      const out: Record<string, unknown> = {
        ...base,
        "@type": "Event",
        startDate: toIso(e.start),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: online
          ? "https://schema.org/OnlineEventAttendanceMode"
          : e.location?.online
            ? "https://schema.org/MixedEventAttendanceMode"
            : "https://schema.org/OfflineEventAttendanceMode",
        organizer: { "@type": "Organization", name: doc.site.title, url: ctx.siteUrl },
      };
      if (e.end) out.endDate = toIso(e.end);
      if (online) out.location = { "@type": "VirtualLocation", url: e.location?.url ?? url };
      else if (e.location?.name || e.location?.address)
        out.location = {
          "@type": "Place",
          name: e.location.name ?? e.location.address,
          ...(e.location.address ? { address: e.location.address } : {}),
        };
      if (e.registrationUrl)
        out.offers = {
          "@type": "Offer",
          url: e.registrationUrl,
          ...(e.price ? { description: e.price } : {}),
        };
      return out;
    }
    case "products": {
      const p = item.frontmatter;
      const digits =
        new Intl.NumberFormat("en", {
          style: "currency",
          currency: p.price.currency,
        }).resolvedOptions().maximumFractionDigits ?? 2;
      return {
        ...base,
        "@type": "Product",
        ...(p.sku ? { sku: p.sku } : {}),
        ...(p.images?.length ? { image: p.images.map((i) => ctx.mediaUrl(i.src)) } : {}),
        offers: {
          "@type": "Offer",
          url,
          price: (p.price.amount / 10 ** digits).toFixed(digits),
          priceCurrency: p.price.currency,
          availability:
            p.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          seller: publisher,
        },
      };
    }
    case "podcast": {
      const f = item.frontmatter;
      return {
        ...base,
        "@type": "PodcastEpisode",
        datePublished: toIso(f.date),
        ...(f.episode !== undefined ? { episodeNumber: f.episode } : {}),
        timeRequired: `PT${Math.round(f.audio.duration / 60)}M`,
        associatedMedia: {
          "@type": "MediaObject",
          contentUrl: ctx.mediaUrl(f.audio.src),
          encodingFormat: f.audio.mime,
        },
        partOfSeries: {
          "@type": "PodcastSeries",
          name: doc.collectionConfigs?.[collection]?.label ?? doc.site.title,
          url: absoluteUrl(ctx.siteUrl, `/${collection}/`),
        },
      };
    }
    case "portfolio": {
      const f = item.frontmatter;
      return {
        ...base,
        "@type": "CreativeWork",
        ...(f.date ? { dateCreated: f.date } : f.year ? { dateCreated: String(f.year) } : {}),
        creator: publisher,
      };
    }
  }
}

/** Structured data for a route. */
export function jsonLdFor(
  plan: SitePlan,
  route: SiteRoute,
  ctx: SeoContext,
): Record<string, unknown>[] {
  const doc = plan.doc;
  if (route.kind === "notFound") return [];
  if (route.kind === "page") {
    const page = doc.pages[route.pageId as Page["id"]];
    if (page?.slug === "") return [websiteLd(doc, ctx), organizationLd(doc, ctx)];
    return [];
  }
  if (route.kind === "item" && route.collection && route.itemSlug) {
    const item = doc.collections[route.collection]?.[route.itemSlug];
    return item ? [itemLd(doc, route.collection, item, ctx)] : [];
  }
  return [];
}

// --- sitemap / robots ---------------------------------------------------------------------------

export function sitemapXml(plan: SitePlan, siteUrl: string): string {
  const urls = plan.routes
    .filter((r) => r.sitemap)
    .map((r) => {
      const loc = absoluteUrl(siteUrl, r.path);
      const lastmod = r.lastmod ? `<lastmod>${xml(r.lastmod.slice(0, 10))}</lastmod>` : "";
      return `  <url><loc>${xml(loc)}</loc>${lastmod}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function robotsTxt(doc: SiteDocument, siteUrl: string): string {
  if (doc.site.seo?.noindex) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteUrl, "/sitemap.xml")}\n`;
}

// --- redirects ----------------------------------------------------------------------------------

const htmlEsc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

function target(r: Redirect, basePath: string): string {
  return /^https?:\/\//.test(r.to) ? r.to : `${basePath}${r.to}`;
}

/** A static HTML redirect page (GitHub Pages has no server-side redirects). */
export function redirectHtml(r: Redirect, basePath: string, siteUrl: string): string {
  const to = target(r, basePath);
  const abs = /^https?:\/\//.test(to) ? to : new URL(to, siteUrl).toString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${htmlEsc(abs)}">
<meta http-equiv="refresh" content="0; url=${htmlEsc(to)}">
</head>
<body>
<p>This page has moved to <a href="${htmlEsc(to)}">${htmlEsc(abs)}</a>.</p>
</body>
</html>
`;
}

/** Output file for a redirect's `from` path: `/old-page` → `old-page/index.html`. */
export function redirectFile(from: string): string {
  const clean = from.replace(/^\/+/, "").replace(/\/+$/, "");
  const segments = clean.split("/");
  if (segments.some((s) => s === "." || s === ".." || s.includes("\\") || s.includes("\0")))
    throw new Error(`Redirect path ${from} contains . or .. segments`);
  if (!clean) return "index.html";
  return /\.html?$/.test(clean) ? clean : `${clean}/index.html`;
}

/** Cloudflare `_redirects` (real 301s on the Cloudflare target). */
export function cloudflareRedirects(redirects: readonly Redirect[], basePath: string): string {
  return `${redirects
    .map((r) => {
      const from = `${basePath}${r.from}`;
      return `${from} ${target(r, basePath)} ${r.status}`;
    })
    .join("\n")}\n`;
}
