import type {
  CollectionConfig,
  CollectionItem,
  ImageValue,
  ReferenceValue,
} from "@openspace/schema";
import { createContext, useContext } from "react";
import { useRenderContext } from "./context";
import { eventOn, expandOccurrences, occurrenceDates } from "./recurrence";

/**
 * Collection data for blocks that list items (summary, events, product, social feed).
 *
 * By default blocks read `doc.collections` from the {@link RenderContext}. Hosts that hold
 * collection data elsewhere provide it through `CollectionsContext`: site-kit passes the parsed
 * content collections, the build time (`now`) and build-time social feeds; Studio passes the
 * items it has loaded. Values given here take precedence over the document.
 */
export interface CollectionsValue {
  /** Items by collection name, then slug. Defaults to `doc.collections`. */
  collections?: Record<string, Record<string, CollectionItem>>;
  /** `_collection.json` per collection. Defaults to `doc.collectionConfigs`. */
  configs?: Record<string, CollectionConfig>;
  /**
   * Reference time for "upcoming" filters and scheduled items. Static builds pass the build
   * time so output is deterministic. Defaults to the current time.
   */
  now?: Date | string;
  /**
   * Include drafts and not-yet-due scheduled items. Defaults to `true` in the Studio editor and
   * previews and `false` in production.
   */
  includeDrafts?: boolean;
  /** Build-time social feed posts, keyed by {@link feedKey} (`instagram:juniperyoga`). */
  feeds?: Record<string, SocialFeedPost[]>;
}

/** One post of a build-time social feed (fetched by site-kit with the owner's authorization). */
export interface SocialFeedPost {
  /** Link to the post on the network (https). */
  url: string;
  image: ImageValue;
  caption?: string;
  /** ISO date or date-time. */
  date?: string;
}

export const CollectionsContext = createContext<CollectionsValue | undefined>(undefined);

/** Key for {@link CollectionsValue.feeds}: `network:handle`, lowercased, without a leading `@`. */
export function feedKey(network: string, handle: string): string {
  return `${network}:${handle.replace(/^@/, "")}`.toLowerCase();
}

export interface ResolvedCollections {
  collections: Record<string, Record<string, CollectionItem>>;
  configs: Record<string, CollectionConfig>;
  now: Date;
  includeDrafts: boolean;
  feeds: Record<string, SocialFeedPost[]>;
}

/** Collection data for the current render (context value merged over the site document). */
export function useCollections(): ResolvedCollections {
  const ctx = useRenderContext();
  const value = useContext(CollectionsContext);
  return {
    collections: value?.collections ?? ctx.doc?.collections ?? {},
    configs: value?.configs ?? ctx.doc?.collectionConfigs ?? {},
    now: value?.now === undefined ? new Date() : new Date(value.now),
    includeDrafts: value?.includeDrafts ?? ctx.mode !== "production",
    feeds: value?.feeds ?? {},
  };
}

/** The item's primary date: post/episode/project date or event start. */
export function itemDate(item: CollectionItem): string | undefined {
  const fm = item.frontmatter as { date?: string; start?: string };
  return item.kind === "events" ? fm.start : fm.date;
}

/** Published (or scheduled and due) at `now`. */
export function isLive(item: CollectionItem, now: Date): boolean {
  const fm = item.frontmatter;
  if (fm.status === "published") return true;
  if (fm.status === "scheduled" && fm.publishAt) return Date.parse(fm.publishAt) <= now.getTime();
  return false;
}

/** Today's date (`YYYY-MM-DD`) in a time zone; UTC when the zone is missing or unknown. */
function todayIn(now: Date, timeZone: string | undefined): string {
  for (const tz of [timeZone, "UTC"]) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz ?? "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      /* unknown zone: fall back to UTC */
    }
  }
  return now.toISOString().slice(0, 10);
}

/**
 * An event is upcoming until it ends. Date-only events (`2026-11-14`) count as upcoming for
 * that whole day in the event's own time zone (`timezone`, else UTC).
 */
export function isUpcoming(item: CollectionItem, now: Date): boolean {
  if (item.kind !== "events") return true;
  const fm = item.frontmatter;
  const last = fm.end ?? fm.start;
  if (/^\d{4}-\d{2}-\d{2}$/.test(last)) return last >= todayIn(now, fm.timezone);
  return Date.parse(last) >= now.getTime();
}

const time = (item: CollectionItem) => {
  const d = itemDate(item);
  return d ? Date.parse(d) : 0;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (d: Date, n: number) => isoDay(new Date(d.getTime() + n * 86_400_000));

/** How far ahead (and back, for past events) repeating events are listed. */
export const RECURRENCE_HORIZON_DAYS = 366;

/** A repeating event shown at its next date (or its last one, once the series is over). */
export function nextOccurrence(item: CollectionItem, now: Date): CollectionItem {
  if (item.kind !== "events" || !item.frontmatter.recurrence) return item;
  const rule = item.frontmatter.recurrence;
  const start = item.frontmatter.start;
  // From a couple of days back (an event may still be running), the next few dates.
  const soon = occurrenceDates(rule, start, {
    from: plusDays(now, -2),
    through: plusDays(now, RECURRENCE_HORIZON_DAYS),
    max: 4,
  });
  const upcoming = soon.map((d) => eventOn(item, d)).find((e) => isUpcoming(e, now));
  if (upcoming) return upcoming;
  // The series is over: show its last date (searching back from today, a year at a time).
  for (let back = 1; back <= 50; back++) {
    const past = occurrenceDates(rule, start, {
      from: plusDays(now, -RECURRENCE_HORIZON_DAYS * back),
      through: isoDay(now),
    });
    if (past.length) return eventOn(item, past[past.length - 1] as string);
    if (plusDays(now, -RECURRENCE_HORIZON_DAYS * back) < start.slice(0, 10)) break;
  }
  return item;
}

export interface QueryOptions {
  now?: Date;
  includeDrafts?: boolean;
}

/**
 * Items a `reference` field selects: explicit picks (in their order) or the filter, then sort
 * and limit. Drafts and not-yet-due scheduled items are excluded unless `includeDrafts`.
 * `filter.upcoming: true` keeps events that haven't ended; `false` keeps past events.
 */
export function queryCollection(
  ref: ReferenceValue,
  collections: Record<string, Record<string, CollectionItem>>,
  opts: QueryOptions = {},
): CollectionItem[] {
  const now = opts.now ?? new Date();
  const all = collections[ref.collection] ?? {};
  const visible = (item: CollectionItem | undefined): item is CollectionItem =>
    !!item && (opts.includeDrafts === true || isLive(item, now));

  let items: CollectionItem[];
  if (ref.items) {
    items = ref.items
      .map((slug) => all[slug])
      .filter(visible)
      .map((item) => nextOccurrence(item, now));
  } else {
    const f = ref.filter;
    const live = Object.values(all).filter(visible);
    // Repeating events list once per date: upcoming ones for the next year, past ones for the last
    // year; without a date filter each series shows at its next date.
    const expanded =
      f?.upcoming === true
        ? expandOccurrences(live, {
            from: isoDay(now),
            through: plusDays(now, RECURRENCE_HORIZON_DAYS),
          })
        : f?.upcoming === false
          ? expandOccurrences(live, {
              from: plusDays(now, -RECURRENCE_HORIZON_DAYS),
              through: isoDay(now),
            })
          : live.map((item) => nextOccurrence(item, now));
    items = expanded.filter((item) => {
      const fm = item.frontmatter;
      if (f?.categories?.length && !f.categories.some((c) => fm.categories?.includes(c)))
        return false;
      if (f?.tags?.length) {
        const tags = (fm.tags ?? []).map((t) => t.toLowerCase());
        if (!f.tags.some((t) => tags.includes(t.toLowerCase()))) return false;
      }
      if (f?.featured !== undefined && (fm.featured === true) !== f.featured) return false;
      if (f?.upcoming !== undefined && isUpcoming(item, now) !== f.upcoming) return false;
      return true;
    });
  }

  const sort = ref.sort ?? (ref.items ? "manual" : ref.filter?.upcoming ? "date-asc" : "date-desc");
  if (sort === "date-desc") items.sort((a, b) => time(b) - time(a));
  else if (sort === "date-asc") items.sort((a, b) => time(a) - time(b));
  else if (sort === "title")
    items.sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title));
  return ref.limit ? items.slice(0, ref.limit) : items;
}

/** `queryCollection` bound to the current render's collections, time and draft policy. */
export function useCollectionQuery(ref: ReferenceValue): CollectionItem[] {
  const { collections, now, includeDrafts } = useCollections();
  return queryCollection(ref, collections, { now, includeDrafts });
}
