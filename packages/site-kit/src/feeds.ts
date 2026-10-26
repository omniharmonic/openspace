/**
 * Feeds (PRD §5.3): RSS 2.0 + Atom for blogs, iCalendar for events, podcast RSS with Apple
 * (itunes:) and Podcasting 2.0 tags. Pure string builders over the route plan.
 */
import type { CollectionItem, SiteDocument } from "@openspace/schema";
import { type FeedFormat, feedsFor } from "./feeds-plan";
import { itemDescription } from "./pages";
import type { SitePlan } from "./routes";

export interface FeedContext {
  doc: SiteDocument;
  /** Absolute site URL with base path, ending in `/`. */
  siteUrl: string;
  /** Build time (ISO). */
  now: string;
  /** Absolute URL for a media source (`media/…` or https). */
  mediaUrl: (src: string) => string;
}

export interface FeedFile {
  /** Site-relative path without the base (`/journal/rss.xml`). */
  path: string;
  format: FeedFormat;
  contents: string;
}

const XML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export const xml = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESC[c] as string);

export const absoluteUrl = (siteUrl: string, path: string) =>
  /^https?:\/\//.test(path) ? path : new URL(path.replace(/^\/+/, ""), siteUrl).toString();

const toDate = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
const itemDate = (item: CollectionItem): string | undefined =>
  item.kind === "events" ? item.frontmatter.start : (item.frontmatter as { date?: string }).date;

function itemUrl(ctx: FeedContext, collection: string, item: CollectionItem) {
  return absoluteUrl(ctx.siteUrl, `/${collection}/${item.slug}/`);
}

function channelInfo(ctx: FeedContext, collection: string) {
  const cfg = ctx.doc.collectionConfigs?.[collection];
  const label = cfg?.label ?? collection;
  return {
    title: cfg?.feed?.title ?? `${ctx.doc.site.title} — ${label}`,
    description: cfg?.feed?.description ?? ctx.doc.site.tagline ?? ctx.doc.site.seo?.description ?? label,
    link: absoluteUrl(ctx.siteUrl, `/${collection}/`),
  };
}

export function rssFeed(ctx: FeedContext, collection: string, items: CollectionItem[], selfPath: string): string {
  const ch = channelInfo(ctx, collection);
  const lang = ctx.doc.site.locale;
  const body = items
    .map((item) => {
      const url = itemUrl(ctx, collection, item);
      const date = itemDate(item);
      const desc = itemDescription(item);
      const author = item.kind === "blog" ? item.frontmatter.author : undefined;
      return [
        "    <item>",
        `      <title>${xml(item.frontmatter.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        date ? `      <pubDate>${toDate(date).toUTCString()}</pubDate>` : "",
        desc ? `      <description>${xml(desc)}</description>` : "",
        author ? `      <dc:creator>${xml(author)}</dc:creator>` : "",
        ...(item.frontmatter.categories ?? []).map((c) => `      <category>${xml(c)}</category>`),
        item.frontmatter.image
          ? `      <media:content url="${xml(ctx.mediaUrl(item.frontmatter.image))}" medium="image"/>`
          : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xml(ch.title)}</title>
    <link>${xml(ch.link)}</link>
    <description>${xml(ch.description)}</description>
    <language>${xml(lang)}</language>
    <lastBuildDate>${new Date(ctx.now).toUTCString()}</lastBuildDate>
    <generator>OpenSpace</generator>
    <atom:link href="${xml(absoluteUrl(ctx.siteUrl, selfPath))}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>
`;
}

export function atomFeed(ctx: FeedContext, collection: string, items: CollectionItem[], selfPath: string): string {
  const ch = channelInfo(ctx, collection);
  const dates = items.map(itemDate).filter((d): d is string => !!d).map((d) => toDate(d).toISOString());
  const updated = dates.sort().at(-1) ?? new Date(ctx.now).toISOString();
  const entries = items
    .map((item) => {
      const url = itemUrl(ctx, collection, item);
      const date = itemDate(item);
      const iso = date ? toDate(date).toISOString() : updated;
      const desc = itemDescription(item);
      const author = (item.kind === "blog" ? item.frontmatter.author : undefined) ?? ctx.doc.site.title;
      return [
        "  <entry>",
        `    <title>${xml(item.frontmatter.title)}</title>`,
        `    <link href="${xml(url)}"/>`,
        `    <id>${xml(url)}</id>`,
        `    <published>${iso}</published>`,
        `    <updated>${iso}</updated>`,
        `    <author><name>${xml(author)}</name></author>`,
        desc ? `    <summary>${xml(desc)}</summary>` : "",
        ...(item.frontmatter.categories ?? []).map((c) => `    <category term="${xml(c)}"/>`),
        "  </entry>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xml(ctx.doc.site.locale)}">
  <title>${xml(ch.title)}</title>
  <subtitle>${xml(ch.description)}</subtitle>
  <link href="${xml(ch.link)}"/>
  <link href="${xml(absoluteUrl(ctx.siteUrl, selfPath))}" rel="self" type="application/atom+xml"/>
  <id>${xml(ch.link)}</id>
  <updated>${updated}</updated>
  <generator>OpenSpace</generator>
${entries}
</feed>
`;
}

// --- iCalendar (RFC 5545) ---------------------------------------------------------------------

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const icsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function icalFeed(ctx: FeedContext, collection: string, items: CollectionItem[]): string {
  const host = new URL(ctx.siteUrl).host;
  const ch = channelInfo(ctx, collection);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//OpenSpace//${icsText(ctx.doc.site.title)}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(ch.title)}`,
  ];
  for (const item of items) {
    if (item.kind !== "events") continue;
    const e = item.frontmatter;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(e.start) || e.allDay;
    lines.push("BEGIN:VEVENT", `UID:${item.slug}@${host}`, `DTSTAMP:${icsUtc(ctx.now)}`);
    if (dateOnly) {
      const start = e.start.slice(0, 10);
      lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(nextDay((e.end ?? e.start).slice(0, 10)))}`);
    } else {
      lines.push(`DTSTART:${icsUtc(e.start)}`);
      if (e.end) lines.push(`DTEND:${icsUtc(e.end)}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    const desc = itemDescription(item);
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    const where = [e.location?.name, e.location?.address].filter(Boolean).join(", ") || (e.location?.online ? "Online" : "");
    if (where) lines.push(`LOCATION:${icsText(where)}`);
    lines.push(`URL:${itemUrl(ctx, collection, item)}`);
    if (e.status === "published") lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

// --- Podcast RSS (Apple / Spotify) --------------------------------------------------------------

export interface PodcastOptions {
  /** Square cover art (≥ 1400px) as a media source; defaults to the site's share image or logo. */
  cover?: string | undefined;
  /** Apple Podcasts category (default "Society & Culture"). */
  category?: string;
  ownerEmail?: string | undefined;
}

const hms = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
};

export function podcastFeed(
  ctx: FeedContext,
  collection: string,
  items: CollectionItem[],
  selfPath: string,
  opts: PodcastOptions = {},
): string {
  const ch = channelInfo(ctx, collection);
  const site = ctx.doc.site;
  const cover = opts.cover ?? site.seo?.image ?? site.logo?.src;
  const explicit = items.some((i) => i.kind === "podcast" && i.frontmatter.explicit);
  const email = opts.ownerEmail ?? site.social?.find((s) => s.network === "email")?.url.replace(/^mailto:/, "");
  const episodes = items
    .filter((i) => i.kind === "podcast")
    .map((item) => {
      if (item.kind !== "podcast") return "";
      const fm = item.frontmatter;
      const url = itemUrl(ctx, collection, item);
      const bytes = fm.audio.bytes ?? ctx.doc.media[fm.audio.src]?.bytes ?? 0;
      const desc = itemDescription(item);
      return [
        "    <item>",
        `      <title>${xml(fm.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="false">${xml(`${collection}/${item.slug}`)}</guid>`,
        `      <pubDate>${toDate(fm.date).toUTCString()}</pubDate>`,
        desc ? `      <description>${xml(desc)}</description>` : "",
        desc ? `      <itunes:summary>${xml(desc)}</itunes:summary>` : "",
        `      <enclosure url="${xml(ctx.mediaUrl(fm.audio.src))}" length="${bytes}" type="${fm.audio.mime}"/>`,
        `      <itunes:duration>${hms(fm.audio.duration)}</itunes:duration>`,
        `      <itunes:explicit>${fm.explicit ? "true" : "false"}</itunes:explicit>`,
        fm.episode !== undefined ? `      <itunes:episode>${fm.episode}</itunes:episode>` : "",
        fm.season !== undefined ? `      <itunes:season>${fm.season}</itunes:season>` : "",
        `      <itunes:episodeType>${fm.episodeType ?? "full"}</itunes:episodeType>`,
        fm.image ? `      <itunes:image href="${xml(ctx.mediaUrl(fm.image))}"/>` : "",
        fm.transcript
          ? `      <podcast:transcript url="${xml(ctx.mediaUrl(fm.transcript))}" type="${fm.transcript.endsWith(".vtt") ? "text/vtt" : fm.transcript.endsWith(".srt") ? "application/srt" : "text/plain"}"/>`
          : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const category = opts.category ?? "Society & Culture";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xml(ch.title)}</title>
    <link>${xml(ch.link)}</link>
    <description>${xml(ch.description)}</description>
    <language>${xml(site.locale)}</language>
    <atom:link href="${xml(absoluteUrl(ctx.siteUrl, selfPath))}" rel="self" type="application/rss+xml"/>
    <itunes:author>${xml(site.title)}</itunes:author>
    <itunes:summary>${xml(ch.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>${explicit ? "true" : "false"}</itunes:explicit>
    <itunes:category text="${xml(category)}"/>
${cover ? `    <itunes:image href="${xml(ctx.mediaUrl(cover))}"/>\n    <image><url>${xml(ctx.mediaUrl(cover))}</url><title>${xml(ch.title)}</title><link>${xml(ch.link)}</link></image>\n` : ""}${email ? `    <itunes:owner><itunes:name>${xml(site.title)}</itunes:name><itunes:email>${xml(email)}</itunes:email></itunes:owner>\n` : ""}    <podcast:locked>no</podcast:locked>
${episodes}
  </channel>
</rss>
`;
}

/** Every feed file for the plan. */
export function buildFeeds(plan: SitePlan, ctx: Omit<FeedContext, "doc" | "now">, podcast: PodcastOptions = {}): FeedFile[] {
  const fctx: FeedContext = { ...ctx, doc: plan.doc, now: plan.now };
  const out: FeedFile[] = [];
  for (const [name, items] of Object.entries(plan.items)) {
    const cfg = plan.doc.collectionConfigs?.[name];
    for (const f of feedsFor(name, cfg, items[0]?.kind)) {
      const contents =
        f.format === "rss"
          ? rssFeed(fctx, name, items, f.path)
          : f.format === "atom"
            ? atomFeed(fctx, name, items, f.path)
            : f.format === "ical"
              ? icalFeed(fctx, name, items)
              : podcastFeed(fctx, name, items, f.path, podcast);
      out.push({ path: f.path, format: f.format, contents });
    }
  }
  return out;
}

/** `<link rel="alternate">` tags for a collection's feeds (added to its pages' heads). */
export function feedLinks(plan: SitePlan, collection: string, basePath: string): string {
  const cfg = plan.doc.collectionConfigs?.[collection];
  return feedsFor(collection, cfg, plan.items[collection]?.[0]?.kind)
    .filter((f) => f.format !== "ical")
    .map((f) => `<link rel="alternate" type="${f.mime}" title="${xml(f.label)}" href="${xml(basePath + f.path)}">`)
    .join("");
}
