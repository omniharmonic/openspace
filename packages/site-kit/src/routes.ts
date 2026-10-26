/**
 * Route planning: every URL the static build emits, with the page document that renders it.
 * Pure (no Astro, no filesystem) — the Astro route, the integration's post-build outputs
 * (sitemap, feeds, manifests, share images) and tests all use the same plan.
 */
import { blocksRegistry } from "@openspace/blocks";
import type {
  BlockRegistry,
  CollectionConfig,
  CollectionItem,
  Page,
  SiteDocument,
} from "@openspace/schema";
import { feedsFor } from "./feeds-plan";
import {
  type ComposeContext,
  humanize,
  isLive,
  itemPage,
  listPage,
  notFoundPage,
  sortItems,
  tagSlug,
} from "./pages";

export type RouteKind = "page" | "item" | "collection" | "category" | "tag" | "notFound";

export interface SiteRoute {
  kind: RouteKind;
  /** Site-relative URL path without the base: `/`, `/about/`, `/journal/opening-day/`, `/404.html`. */
  path: string;
  /** Astro rest param: `undefined` (home), `about`, `journal/opening-day`, `404`. */
  param: string | undefined;
  pageId: string;
  collection?: string;
  itemSlug?: string;
  /** Listed in sitemap.xml. */
  sitemap: boolean;
  /** Last modification (item date) for the sitemap, when known. */
  lastmod?: string;
}

export interface PlanOptions {
  /** Build time: decides which scheduled items are live (default: now). */
  now?: Date;
  /** Block registry used for Markdoc bodies and composed pages (default: the full library). */
  registry?: BlockRegistry;
}

export interface SitePlan {
  /**
   * The document pages render against: the owner's content with drafts / not-yet-due items
   * removed and the composed pages (items, lists, 404) added to `pages`, so links, forms and
   * canonical URLs resolve for them exactly like for owner pages.
   */
  doc: SiteDocument;
  routes: SiteRoute[];
  /** Live items per collection, sorted per the collection's list settings. */
  items: Record<string, CollectionItem[]>;
  now: string;
}

export function collectionConfig(doc: SiteDocument, name: string): CollectionConfig | undefined {
  return doc.collectionConfigs?.[name];
}

/** The renderable document: drafts and future scheduled items removed (never published). */
export function publishableDoc(doc: SiteDocument, now: Date): SiteDocument {
  const collections: SiteDocument["collections"] = {};
  for (const [name, items] of Object.entries(doc.collections)) {
    collections[name] = Object.fromEntries(
      Object.entries(items).filter(([, item]) => isLive(item, now)),
    );
  }
  const pages = Object.fromEntries(
    Object.entries(doc.pages).filter(([, p]) => !p.access?.password && !p.access?.members),
  ) as SiteDocument["pages"];
  return { ...doc, pages, collections };
}

/** Pages behind a password or membership: never prerendered (Cloudflare Worker serves them). */
export function gatedPages(doc: SiteDocument): Page[] {
  return Object.values(doc.pages).filter((p) => p.access?.password || p.access?.members);
}

const pathFor = (slug: string) => (slug ? `/${slug}/` : "/");

export function planSite(source: SiteDocument, opts: PlanOptions = {}): SitePlan {
  const now = opts.now ?? new Date();
  const registry = opts.registry ?? blocksRegistry();
  const doc = publishableDoc(source, now);
  const pages: Record<string, Page> = { ...doc.pages };
  const ctx: ComposeContext = { doc, registry };
  const routes: SiteRoute[] = [];
  const taken = new Set(Object.values(doc.pages).map((p) => p.slug));
  const add = (page: Page, route: Omit<SiteRoute, "pageId" | "path" | "param">) => {
    pages[page.id] = page;
    routes.push({
      ...route,
      pageId: page.id,
      path: route.kind === "notFound" ? "/404.html" : pathFor(page.slug),
      param: page.slug || undefined,
    });
  };

  let notFound: Page | undefined;
  for (const page of Object.values(doc.pages).sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (page.slug === "404") {
      notFound = page;
      continue;
    }
    routes.push({
      kind: "page",
      path: pathFor(page.slug),
      param: page.slug || undefined,
      pageId: page.id,
      sitemap: !page.hidden && !page.seo?.noindex && !doc.site.seo?.noindex,
    });
  }

  const items: Record<string, CollectionItem[]> = {};
  for (const name of Object.keys(doc.collections).sort()) {
    const cfg = collectionConfig(doc, name);
    const live = sortItems(
      Object.values(doc.collections[name] ?? {}),
      cfg?.list.sort ?? "date-desc",
    );
    items[name] = live;
    const label = cfg?.label ?? humanize(name);
    const feeds = feedsFor(name, cfg, live[0]?.kind).map((f) => ({ label: f.label, href: f.path }));

    // Item pages, with up to three related items (shared category, else most recent).
    for (const item of live) {
      if (taken.has(`${name}/${item.slug}`)) continue;
      const related = live
        .filter((o) => o !== item)
        .sort((a, b) => sharedCategories(b, item) - sharedCategories(a, item))
        .slice(0, 3);
      const page = itemPage(ctx, name, item, related);
      add(page, {
        kind: "item",
        collection: name,
        itemSlug: item.slug,
        sitemap: !item.frontmatter.seo?.noindex && !doc.site.seo?.noindex,
        ...(itemDateOf(item) ? { lastmod: itemDateOf(item) } : {}),
      });
    }

    // Index (unless the owner made a page at the collection's URL) with pagination.
    const pageSize = cfg?.list.pageSize ?? 12;
    const paginate = (
      baseSlug: string,
      title: string,
      intro: string | undefined,
      list: CollectionItem[],
      kind: RouteKind,
    ) => {
      const count = Math.max(1, Math.ceil(list.length / pageSize));
      for (let n = 1; n <= count; n++) {
        const slug = n === 1 ? baseSlug : `${baseSlug}/page/${n}`;
        if (taken.has(slug)) continue;
        const page = listPage(ctx, {
          collection: name,
          slug,
          title: n === 1 ? title : `${title} — page ${n}`,
          intro,
          items: list.slice((n - 1) * pageSize, n * pageSize),
          prev: n > 1 ? pathFor(n === 2 ? baseSlug : `${baseSlug}/page/${n - 1}`) : undefined,
          next: n < count ? pathFor(`${baseSlug}/page/${n + 1}`) : undefined,
          ...(kind === "collection" && n === 1 ? { feeds } : {}),
        });
        add(page, { kind, collection: name, sitemap: !doc.site.seo?.noindex && n === 1 });
      }
    };
    if (!taken.has(name)) paginate(name, label, cfg?.feed?.description, live, "collection");

    const cats = new Set(live.flatMap((i) => i.frontmatter.categories ?? []));
    for (const cat of [...cats].sort()) {
      const catLabel =
        cfg?.taxonomies?.categories?.find((c) => c.slug === cat)?.label ?? humanize(cat);
      paginate(
        `${name}/category/${cat}`,
        catLabel,
        `${label} filed under ${catLabel}.`,
        live.filter((i) => i.frontmatter.categories?.includes(cat)),
        "category",
      );
    }
    if (cfg?.taxonomies?.tags !== false) {
      const tags = new Map<string, string>();
      for (const i of live)
        for (const t of i.frontmatter.tags ?? [])
          if (!tags.has(tagSlug(t))) tags.set(tagSlug(t), t);
      for (const [slug, tag] of [...tags].sort()) {
        paginate(
          `${name}/tag/${slug}`,
          `#${tag}`,
          `${label} tagged “${tag}”.`,
          live.filter((i) => (i.frontmatter.tags ?? []).some((t) => tagSlug(t) === slug)),
          "tag",
        );
      }
    }
  }

  const nf = notFound ?? notFoundPage(ctx);
  add(nf, { kind: "notFound", sitemap: false });

  return {
    doc: { ...doc, pages: pages as SiteDocument["pages"] },
    routes,
    items,
    now: now.toISOString(),
  };
}

function itemDateOf(item: CollectionItem): string | undefined {
  const fm = item.frontmatter as { date?: string; start?: string };
  return item.kind === "events" ? fm.start : fm.date;
}

function sharedCategories(a: CollectionItem, b: CollectionItem): number {
  const cats = new Set(b.frontmatter.categories ?? []);
  return (a.frontmatter.categories ?? []).filter((c) => cats.has(c)).length;
}
