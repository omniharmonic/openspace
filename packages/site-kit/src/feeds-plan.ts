import type { CollectionConfig, CollectionKind } from "@omniharmonic/openspace-schema";

export type FeedFormat = "rss" | "atom" | "ical" | "podcast";

export interface FeedPlan {
  format: FeedFormat;
  /** Site-relative path without the base, e.g. `/journal/rss.xml`. */
  path: string;
  label: string;
  mime: string;
}

const DEFAULTS: Record<CollectionKind, FeedFormat[]> = {
  blog: ["rss", "atom"],
  events: ["ical"],
  podcast: ["podcast"],
  portfolio: [],
  products: [],
};

const FILE: Record<FeedFormat, { file: string; label: string; mime: string }> = {
  rss: { file: "rss.xml", label: "RSS", mime: "application/rss+xml" },
  atom: { file: "atom.xml", label: "Atom", mime: "application/atom+xml" },
  ical: { file: "calendar.ics", label: "Add to calendar (iCal)", mime: "text/calendar" },
  podcast: { file: "podcast.xml", label: "Podcast feed", mime: "application/rss+xml" },
};

/** Feeds a collection publishes: per kind (blog RSS + Atom, events iCal, podcast RSS). */
export function feedsFor(
  name: string,
  cfg: CollectionConfig | undefined,
  kind: CollectionKind | undefined,
): FeedPlan[] {
  if (cfg?.feed?.enabled === false) return [];
  const k = cfg && cfg.kind !== "custom" ? cfg.kind : kind;
  if (!k) return [];
  const formats = new Set(DEFAULTS[k]);
  if (cfg?.feed?.format) formats.add(cfg.feed.format);
  return [...formats].map((format) => ({
    format,
    path: `/${name}/${FILE[format].file}`,
    label: FILE[format].label,
    mime: FILE[format].mime,
  }));
}
