import type { OpBody } from "@openspace/ops";
import {
  type CollectionConfig,
  type CollectionItem,
  CollectionItemSchema,
  type CollectionKind,
  type Redirect,
  type SiteDocument,
} from "@openspace/schema";
import { slugify } from "../pages/pageOps";
import { itemDate, KIND_META } from "./kinds";

/** Item edits, collection settings and helpers. Every change is one `@openspace/ops` op list. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date "YYYY-MM-DD". */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date-time with offset, e.g. "2026-10-27T18:00:00-06:00" (what the schema accepts). */
export function localDateTime(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${localDate(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `<input type="datetime-local">` value ⇄ ISO with offset. */
export function toInputDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}T09:00`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  // Keep the wall-clock time as written (events are entered in their own time zone).
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]}T${m[2]}` : "";
}

export function fromInputDateTime(value: string, offsetFrom?: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const keep = offsetFrom ? /([+-]\d{2}:\d{2}|Z)$/.exec(offsetFrom)?.[1] : undefined;
  if (keep) return `${value}:00${keep === "Z" ? "Z" : keep}`;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : localDateTime(ms);
}

/** Fill a slug pattern like `{date}-{title}`. */
export function slugFromPattern(pattern: string | undefined, title: string, date: string): string {
  const [y = "", m = "", d = ""] = date.slice(0, 10).split("-");
  const t = slugify(title || "untitled");
  const out = (pattern || "{title}")
    .replace(/\{date\}/g, `${y}-${m}-${d}`)
    .replace(/\{year\}/g, y)
    .replace(/\{month\}/g, m)
    .replace(/\{day\}/g, d)
    .replace(/\{title\}|\{slug\}/g, t);
  return slugify(out);
}

export function uniqueItemSlug(
  doc: SiteDocument,
  collection: string,
  base: string,
  except?: string,
): string {
  const taken = (s: string) => s !== except && Boolean(doc.collections[collection]?.[s]);
  const root = slugify(base) || "item";
  if (!taken(root)) return root;
  for (let n = 2; n < 1000; n++) if (!taken(`${root}-${n}`)) return `${root}-${n}`;
  return `${root}-${Date.now().toString(36)}`;
}

/** A new draft item of `kind` (not yet saved). */
export function newItem(
  doc: SiteDocument,
  collection: string,
  kind: CollectionKind,
  options: { title?: string; now?: number; author?: string } = {},
): CollectionItem {
  const now = options.now ?? Date.now();
  const title = options.title ?? `New ${KIND_META[kind].itemLabel.toLowerCase()}`;
  const date = localDate(now);
  const cfg = doc.collectionConfigs?.[collection];
  const slug = uniqueItemSlug(doc, collection, slugFromPattern(cfg?.slugPattern, title, date));
  const base = { title, status: "draft" as const };
  switch (kind) {
    case "blog":
      return {
        kind,
        slug,
        frontmatter: { ...base, date, ...(options.author ? { author: options.author } : {}) },
        body: "",
      };
    case "events": {
      const start = new Date(now + 7 * 86_400_000);
      start.setHours(18, 0, 0, 0);
      return {
        kind,
        slug,
        frontmatter: {
          ...base,
          start: localDateTime(start.getTime()),
          end: localDateTime(start.getTime() + 90 * 60_000),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        body: "",
      };
    }
    case "portfolio":
      return { kind, slug, frontmatter: { ...base, date }, body: "" };
    case "podcast": {
      const last = Object.values(doc.collections[collection] ?? {})
        .map((i) => (i.kind === "podcast" ? (i.frontmatter.episode ?? 0) : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      return {
        kind,
        slug,
        frontmatter: {
          ...base,
          date,
          audio: { src: "", duration: 0, mime: "audio/mpeg" },
          episode: last + 1,
        },
        body: "",
      } as unknown as CollectionItem;
    }
    case "products":
      return {
        kind,
        slug,
        frontmatter: { ...base, price: { amount: 0, currency: "USD" } },
        body: "",
      };
  }
}

const FIELD_NAMES: Record<string, string> = {
  title: "Title",
  publishAt: "Publish date",
  date: "Date",
  start: "Start",
  end: "End",
  image: "Featured image",
  "audio.src": "Audio file",
  "audio.duration": "Length",
  "audio.mime": "Audio type",
  price: "Price",
  "price.amount": "Price",
  "price.currency": "Currency",
  registrationUrl: "Sign-up link",
  projectUrl: "Project link",
  "location.mapUrl": "Map link",
  "location.url": "Online link",
  timezone: "Time zone",
  slug: "Address",
  recurrence: "Repeats",
  sku: "SKU",
  episode: "Episode number",
  season: "Season",
};

/** Problems that stop an item from saving, in plain words (empty when it's fine). */
export function itemProblems(item: CollectionItem): Array<{ field: string; message: string }> {
  const r = CollectionItemSchema.safeParse(item);
  if (r.success) return [];
  const out: Array<{ field: string; message: string }> = [];
  for (const issue of r.error.issues) {
    const path = issue.path.filter((p) => p !== "frontmatter").map(String);
    const key = path.join(".");
    const field =
      FIELD_NAMES[key] ??
      FIELD_NAMES[path[0] ?? ""] ??
      (key.startsWith("variants") ? "Variants" : key || "Item");
    let message = issue.message;
    if (key === "slug") message = "Use lowercase letters, numbers and hyphens.";
    else if (key === "title") message = "Give it a title.";
    else if (key === "publishAt") message = "Pick when it should go live.";
    else if (key === "audio.src") message = "Add the episode's audio file or link.";
    else if (key === "audio.duration") message = "Enter how long the episode is.";
    else if (/url|Url|image|src/.test(key) && /https|Invalid/i.test(message))
      message = "Use a full web address starting with https://, or pick a file.";
    else if (/date|start|end|publishAt/i.test(key) && /Invalid/i.test(message))
      message = "Pick a date.";
    if (!out.some((o) => o.field === field && o.message === message)) out.push({ field, message });
  }
  return out;
}

/** Save an item (and move it when its address changed, leaving a redirect if it was live). */
export function saveItemOps(
  doc: SiteDocument,
  collection: string,
  item: CollectionItem,
  previousSlug?: string,
): OpBody[] {
  const bodies: OpBody[] = [];
  if (previousSlug && previousSlug !== item.slug && doc.collections[collection]?.[previousSlug]) {
    const before = doc.collections[collection]?.[previousSlug];
    bodies.push({
      op: "collection.delete",
      collection,
      slug: previousSlug,
      keepEmpty: true,
    } as OpBody);
    if (before?.frontmatter.status === "published") {
      const from = `/${collection}/${previousSlug}`;
      const redirects: Redirect[] = [
        ...(doc.site.redirects ?? []).filter((r) => r.from !== from),
        { from, to: `/${collection}/${item.slug}`, status: 301 },
      ];
      bodies.push({ op: "site.update", set: { redirects } } as OpBody);
    }
  }
  bodies.push({ op: "collection.upsert", collection, item } as OpBody);
  return bodies;
}

export function deleteItemOps(collection: string, slug: string): OpBody[] {
  return [{ op: "collection.delete", collection, slug, keepEmpty: true } as OpBody];
}

export function duplicateItem(
  doc: SiteDocument,
  collection: string,
  item: CollectionItem,
): CollectionItem {
  const copy = structuredClone(item);
  copy.frontmatter.title = `${item.frontmatter.title} (copy)`;
  copy.frontmatter.status = "draft";
  delete copy.frontmatter.publishAt;
  copy.slug = uniqueItemSlug(doc, collection, `${item.slug}-copy`);
  return copy;
}

export function configOps(collection: string, config: CollectionConfig | null): OpBody[] {
  return [{ op: "collectionConfig.upsert", collection, config } as OpBody];
}

/** A free collection name ("blog", "blog-2"…). */
export function uniqueCollectionName(doc: SiteDocument, base: string): string {
  const taken = (n: string) =>
    Boolean(doc.collections[n] || doc.collectionConfigs?.[n]) ||
    Object.values(doc.pages).some((p) => p.slug === n);
  const root = slugify(base) || "collection";
  if (!taken(root)) return root;
  for (let i = 2; i < 100; i++) if (!taken(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

export type StatusFilter = "all" | "published" | "scheduled" | "draft";

export interface ItemFilter {
  q?: string;
  status?: StatusFilter;
  category?: string;
  tag?: string;
  /** Events: upcoming or past. */
  when?: "all" | "upcoming" | "past";
}

/** Effective state: a scheduled item whose time has passed is live. */
export function effectiveStatus(item: CollectionItem, now = Date.now()) {
  const fm = item.frontmatter;
  if (fm.status === "scheduled" && fm.publishAt && Date.parse(fm.publishAt) <= now)
    return "published" as const;
  return fm.status;
}

export function filterItems(
  items: CollectionItem[],
  filter: ItemFilter,
  sort: CollectionConfig["list"]["sort"] | undefined,
  now = Date.now(),
): CollectionItem[] {
  const q = filter.q?.trim().toLowerCase();
  const list = items.filter((item) => {
    const fm = item.frontmatter;
    if (filter.status && filter.status !== "all" && effectiveStatus(item, now) !== filter.status)
      return false;
    if (filter.category && !(fm.categories ?? []).includes(filter.category)) return false;
    if (filter.tag && !(fm.tags ?? []).includes(filter.tag)) return false;
    if (filter.when && filter.when !== "all" && item.kind === "events") {
      const end = Date.parse(item.frontmatter.end ?? item.frontmatter.start);
      const upcoming = end >= now || Boolean(item.frontmatter.recurrence);
      if ((filter.when === "upcoming") !== upcoming) return false;
    }
    if (q) {
      const hay = [fm.title, fm.excerpt, item.slug, ...(fm.tags ?? []), item.body]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const by = sort ?? "date-desc";
  if (by === "title")
    return list.sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title));
  if (by === "manual") return list;
  const dir = by === "date-asc" ? 1 : -1;
  return list.sort((a, b) => dir * (itemDate(a) ?? "").localeCompare(itemDate(b) ?? ""));
}
