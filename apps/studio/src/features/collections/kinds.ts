import type {
  CollectionConfig,
  CollectionItem,
  CollectionKind,
  SiteDocument,
} from "@openspace/schema";
import { humanize } from "../workspace/format";

/** Plain-language names, defaults and starter values for each collection kind. */
export interface KindMeta {
  kind: CollectionKind;
  /** "Blog". */
  label: string;
  /** "Post". */
  itemLabel: string;
  /** What it's for, in the add-collection picker. */
  description: string;
  /** Suggested collection name (folder). */
  name: string;
  config: () => CollectionConfig;
}

export const KIND_META: Record<CollectionKind, KindMeta> = {
  blog: {
    kind: "blog",
    label: "Blog",
    itemLabel: "Post",
    description: "News, stories and updates, newest first, with an RSS feed.",
    name: "blog",
    config: () => ({
      kind: "blog",
      label: "Blog",
      itemLabel: "Post",
      slugPattern: "{title}",
      list: { layout: "cards", pageSize: 12, sort: "date-desc" },
      itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
      taxonomies: { categories: [], tags: true },
      feed: { enabled: true, format: "rss" },
    }),
  },
  events: {
    kind: "events",
    label: "Events",
    itemLabel: "Event",
    description: "Classes, workshops and gatherings with dates, places and sign-up links.",
    name: "events",
    config: () => ({
      kind: "events",
      label: "Events",
      itemLabel: "Event",
      slugPattern: "{title}",
      list: { layout: "list", pageSize: 20, sort: "date-asc" },
      itemPage: { layout: "split", showDate: true },
      feed: { enabled: true, format: "ical" },
    }),
  },
  portfolio: {
    kind: "portfolio",
    label: "Portfolio",
    itemLabel: "Project",
    description: "Show your work: projects with galleries, clients and links.",
    name: "work",
    config: () => ({
      kind: "portfolio",
      label: "Portfolio",
      itemLabel: "Project",
      slugPattern: "{title}",
      list: { layout: "masonry", pageSize: 24, sort: "date-desc" },
      itemPage: { layout: "gallery" },
    }),
  },
  podcast: {
    kind: "podcast",
    label: "Podcast",
    itemLabel: "Episode",
    description: "Episodes with audio, show notes and a feed for Apple and Spotify.",
    name: "podcast",
    config: () => ({
      kind: "podcast",
      label: "Podcast",
      itemLabel: "Episode",
      slugPattern: "{title}",
      list: { layout: "list", pageSize: 20, sort: "date-desc" },
      itemPage: { layout: "article", showDate: true },
      feed: { enabled: true, format: "podcast" },
    }),
  },
  products: {
    kind: "products",
    label: "Shop",
    itemLabel: "Product",
    description: "Things to sell: prices, options like size and color, photos and stock.",
    name: "shop",
    config: () => ({
      kind: "products",
      label: "Shop",
      itemLabel: "Product",
      slugPattern: "{title}",
      list: { layout: "grid", pageSize: 24, sort: "manual" },
      itemPage: { layout: "split" },
    }),
  },
};

/** Folder names site-kit maps to a kind when there's no `_collection.json`. */
const CONVENTION: Record<string, CollectionKind> = {
  blog: "blog",
  journal: "blog",
  news: "blog",
  posts: "blog",
  events: "events",
  calendar: "events",
  portfolio: "portfolio",
  work: "portfolio",
  projects: "portfolio",
  podcast: "podcast",
  episodes: "podcast",
  shop: "products",
  store: "products",
  products: "products",
};

export interface CollectionInfo {
  name: string;
  kind: CollectionKind;
  label: string;
  itemLabel: string;
  config: CollectionConfig | undefined;
  count: number;
}

/** The kind of a collection: its settings, else an item's kind, else the folder name. */
export function kindOf(doc: SiteDocument, name: string): CollectionKind | null {
  const cfg = doc.collectionConfigs?.[name];
  if (cfg && cfg.kind !== "custom") return cfg.kind;
  const first = Object.values(doc.collections[name] ?? {})[0];
  if (first) return first.kind;
  return CONVENTION[name] ?? null;
}

/** Every typed collection in the document, in a stable order. */
export function listCollections(doc: SiteDocument): CollectionInfo[] {
  const names = new Set([
    ...Object.keys(doc.collectionConfigs ?? {}),
    ...Object.keys(doc.collections),
  ]);
  const out: CollectionInfo[] = [];
  for (const name of names) {
    const kind = kindOf(doc, name);
    if (!kind) continue;
    const config = doc.collectionConfigs?.[name];
    out.push({
      name,
      kind,
      label: config?.label ?? humanize(name),
      itemLabel: config?.itemLabel ?? KIND_META[kind].itemLabel,
      config,
      count: Object.keys(doc.collections[name] ?? {}).length,
    });
  }
  const order: CollectionKind[] = ["blog", "events", "portfolio", "podcast", "products"];
  return out.sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label),
  );
}

export function collectionInfo(doc: SiteDocument, name: string): CollectionInfo | null {
  return listCollections(doc).find((c) => c.name === name) ?? null;
}

export type ItemOf<K extends CollectionKind> = Extract<CollectionItem, { kind: K }>;

/** The date an item is listed under (posts, episodes: date; events: start). */
export function itemDate(item: CollectionItem): string | null {
  const fm = item.frontmatter as Record<string, unknown>;
  return (
    (typeof fm.start === "string" ? fm.start : null) ??
    (typeof fm.date === "string" ? fm.date : null) ??
    (typeof fm.publishAt === "string" ? fm.publishAt : null)
  );
}
