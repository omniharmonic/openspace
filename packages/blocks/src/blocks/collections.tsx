import {
  Button,
  type ButtonRole,
  cx,
  Img,
  itemDate,
  itemKey,
  itemPath,
  jsonForScript,
  siteUrlFor,
  useCollectionQuery,
  useRenderContext,
} from "@openspace/renderer";
import {
  type CollectionItem,
  defineBlock,
  type EventFrontmatter,
  f,
  type ImageValue,
  type Link as LinkValue,
} from "@openspace/schema";
import type { ReactNode } from "react";
import { Icon } from "../icons";
import {
  CarouselControls,
  childLevel,
  dateParts,
  EditorNotice,
  formatDate,
  formatMoney,
  headingLevelField,
  isDateOnly,
  sub,
  typo,
  useLocale,
} from "../shared";

/** Button role (a variable keeps the a11y role lint off the Button prop). */
const SECONDARY: ButtonRole = "secondary";

/** Summary (posts / events / projects / products / episodes) and events list / calendar. */

/** The image to show for an item: its featured image, else its first product/project image. */
export function itemImage(item: CollectionItem): ImageValue | undefined {
  const fm = item.frontmatter as {
    image?: string;
    imageAlt?: string;
    images?: ImageValue[];
    gallery?: ImageValue[];
  };
  if (fm.image) return { src: fm.image, alt: fm.imageAlt ?? "" };
  return fm.images?.[0] ?? fm.gallery?.[0];
}

/** Display price for a product item: "$68", "From $60", with a compare-at price if set. */
export function productPrice(
  item: CollectionItem,
  locale: string,
): { text: string; was?: string } | undefined {
  if (item.kind !== "products") return undefined;
  const fm = item.frontmatter;
  const prices = [
    fm.price.amount,
    ...(fm.variants ?? []).map((v) => v.price?.amount ?? fm.price.amount),
  ];
  const min = Math.min(...prices);
  const from = new Set(prices).size > 1;
  const text = `${from ? "From " : ""}${formatMoney(min, fm.price.currency, locale)}`;
  return fm.compareAtPrice && fm.compareAtPrice.amount > min
    ? { text, was: formatMoney(fm.compareAtPrice.amount, fm.compareAtPrice.currency, locale) }
    : { text };
}

/**
 * A price with an optional compare-at price: visually "~~$80~~ · From $68", read as
 * "Was $80, now From $68" (the dot is hidden from screen readers).
 */
export function PriceText({ price }: { price: { text: string; was?: string } }) {
  return (
    <>
      {price.was ? (
        <>
          <s>
            <span className="os-visually-hidden">Was </span>
            {price.was}
          </s>
          <span className="os-price__sep" aria-hidden="true">
            {" · "}
          </span>
          {/* "now From $40" reads badly: prices that start with a word get a label instead. */}
          <span className="os-visually-hidden">
            {/^\p{L}/u.test(price.text) ? ", sale price: " : "now "}
          </span>
        </>
      ) : null}
      <span>{price.text}</span>
    </>
  );
}

/** "Sat, Nov 14 · 9:00 AM – 12:00 PM" in the event's own time zone. */
export function eventWhen(fm: EventFrontmatter, locale: string): string {
  const tz = fm.timezone;
  const day = (iso: string) =>
    formatDate(iso, locale, { weekday: "short", month: "short", day: "numeric" }, tz);
  const time = (iso: string) => formatDate(iso, locale, { hour: "numeric", minute: "2-digit" }, tz);
  const startDay = day(fm.start);
  if (fm.allDay || isDateOnly(fm.start)) {
    if (fm.end && day(fm.end) !== startDay) return `${startDay} – ${day(fm.end)}`;
    return startDay;
  }
  if (!fm.end) return `${startDay} · ${time(fm.start)}`;
  if (day(fm.end) === startDay) return `${startDay} · ${time(fm.start)} – ${time(fm.end)}`;
  return `${startDay}, ${time(fm.start)} – ${day(fm.end)}, ${time(fm.end)}`;
}

function ItemMeta({
  item,
  show,
}: {
  item: CollectionItem;
  show: { date: boolean; meta: boolean };
}) {
  const locale = useLocale();
  const bits: ReactNode[] = [];
  const date = itemDate(item);
  if (show.date && item.kind === "events") {
    bits.push(<time dateTime={item.frontmatter.start}>{eventWhen(item.frontmatter, locale)}</time>);
  } else if (show.date && date) {
    bits.push(<time dateTime={date}>{formatDate(date, locale, { dateStyle: "medium" })}</time>);
  }
  if (show.meta) {
    if (item.kind === "blog" && item.frontmatter.author) bits.push(item.frontmatter.author);
    if (item.kind === "portfolio" && item.frontmatter.client) bits.push(item.frontmatter.client);
    if (item.kind === "podcast" && item.frontmatter.episode !== undefined)
      bits.push(`Episode ${item.frontmatter.episode}`);
    if (item.kind === "events" && item.frontmatter.location?.name)
      bits.push(item.frontmatter.location.name);
  }
  if (!bits.length) return null;
  return (
    <p className="os-summary__meta">
      {bits.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional
        <span key={i}>{b}</span>
      ))}
    </p>
  );
}

const sizesFor = (variant: string, columns: number) =>
  variant === "list"
    ? "(min-width: 768px) 280px, 100vw"
    : variant === "carousel"
      ? "(min-width: 1200px) 30vw, (min-width: 768px) 50vw, 85vw"
      : `(min-width: 1200px) ${Math.round(100 / columns)}vw, (min-width: 768px) 50vw, 100vw`;

export const summaryBlock = defineBlock({
  type: "summary",
  version: 1,
  category: "collections",
  label: "Summary",
  icon: "layout-list",
  description: "The latest posts, events, projects, episodes or products from a collection.",
  fields: {
    heading: f.text({ optional: true, maxLength: 80, default: "From the journal" }),
    headingLevel: headingLevelField(),
    source: f.reference({
      default: { collection: "journal", sort: "date-desc", limit: 3 },
      label: "Items",
      help: "A collection, optionally filtered by category, tag or featured; or hand-picked items",
    }),
    columns: f.select({ options: ["2", "3", "4"], default: "3", display: "segmented" }),
    showImage: f.boolean({ default: true }),
    showDate: f.boolean({ default: true }),
    showExcerpt: f.boolean({ default: true }),
    showMeta: f.boolean({ default: false, help: "Author, client, location or episode" }),
    linkLabel: f.text({ optional: true, maxLength: 30, default: "Read the journal" }),
    link: f.link({ optional: true, default: { type: "url", url: "/journal/" } }),
    emptyMessage: f.text({
      maxLength: 160,
      default: "Nothing here yet — check back soon.",
      help: "Shown when no items match",
    }),
  },
  variants: ["grid", "list", "carousel", "wall"],
  styleSlots: ["colorTheme", "padding", "radius", "shadow", "animation", "typography.title"],
  ai: {
    purpose:
      "Lists items from a collection (blog posts, events, projects, episodes, products) as cards.",
    whenToUse:
      "On the home page and landing pages to surface fresh content: the latest 3 posts, featured projects, upcoming events. `wall` is a masonry of images for portfolios; `carousel` saves space.",
    avoid:
      "Using it as the main collection page (the collection's own list page does that); mixing unrelated filters; more than ~12 items.",
  },
  render: ({ id, fields, variant, style }) => {
    const HTag = fields.headingLevel;
    // Item titles sit one level under the list's own heading; without one they take its level
    // (so a section heading h2 is followed by h3 items, never a skipped level).
    const ITag = fields.heading ? childLevel(fields.headingLevel) : fields.headingLevel;
    const { basePath } = useRenderContext();
    const locale = useLocale();
    const items = useCollectionQuery(fields.source);
    const columns = Number(fields.columns);
    const heading = fields.heading ? (
      <HTag className="os-summary__heading os-type-h3" id={sub(id, "h")}>
        {fields.heading}
      </HTag>
    ) : null;
    const footer =
      fields.linkLabel && fields.link ? (
        <div className="os-summary__foot">
          <Button to={fields.link as LinkValue} role={SECONDARY}>
            {fields.linkLabel}
          </Button>
        </div>
      ) : null;
    if (!items.length)
      return (
        <div className={cx("os-summary", `os-summary--${variant}`)}>
          {heading}
          <p className="os-summary__empty">{fields.emptyMessage}</p>
          <EditorNotice>
            No published items in “{fields.source.collection}” match this summary.
          </EditorNotice>
        </div>
      );

    const cards = items.map((item) => {
      const href = itemPath(fields.source.collection, item.slug, basePath);
      const image = fields.showImage ? itemImage(item) : undefined;
      const price = productPrice(item, locale);
      const fm = item.frontmatter;
      return (
        <li key={itemKey(item)} className="os-summary__item">
          <article className="os-summary__card">
            {image ? (
              <Img
                src={image}
                alt=""
                aspect={variant === "wall" ? "original" : variant === "list" ? "4:3" : "3:2"}
                sizes={sizesFor(variant, columns)}
                className="os-summary__image"
              />
            ) : null}
            <div className="os-summary__body">
              <ItemMeta item={item} show={{ date: fields.showDate, meta: fields.showMeta }} />
              <ITag className={cx("os-summary__title", typo(style, "title", "h4"))}>
                <a className="os-summary__link" href={href}>
                  {fm.title}
                </a>
              </ITag>
              {price ? (
                <p className="os-summary__price">
                  <PriceText price={price} />
                </p>
              ) : null}
              {fields.showExcerpt && fm.excerpt && variant !== "wall" ? (
                <p className="os-summary__excerpt">{fm.excerpt}</p>
              ) : null}
            </div>
          </article>
        </li>
      );
    });

    if (variant === "carousel") {
      const track = sub(id, "track");
      return (
        <div className={cx("os-summary", "os-summary--carousel")}>
          {heading}
          {/* biome-ignore lint/a11y/useSemanticElements: ARIA carousel pattern (group + roledescription) */}
          <div
            className="os-carousel"
            role="group"
            aria-roledescription="carousel"
            aria-label={fields.heading || "Latest items"}
            data-os-behavior={items.length > 1 ? "carousel" : undefined}
          >
            <ul className="os-carousel__track os-summary__items" id={track}>
              {cards}
            </ul>
            {items.length > 1 ? <CarouselControls trackId={track} noun="items" /> : null}
          </div>
          {footer}
        </div>
      );
    }
    return (
      <div className={cx("os-summary", `os-summary--${variant}`)} style={{ "--s-cols": columns }}>
        {heading}
        <ul className="os-summary__items" aria-labelledby={heading ? sub(id, "h") : undefined}>
          {cards}
        </ul>
        {footer}
      </div>
    );
  },
});

// --- events ---------------------------------------------------------------------------------------

type EventItem = Extract<CollectionItem, { kind: "events" }>;

function firstWeekday(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const day = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay ?? 1;
    return day % 7; // 0 = Sunday … 6 = Saturday
  } catch {
    return 1;
  }
}

/** Month grids (weeks × 7) for the months that have events, at most `limit` months. */
export function calendarMonths(events: EventItem[], locale: string, limit = 2) {
  const byMonth = new Map<
    string,
    { year: number; month: number; days: Map<number, EventItem[]> }
  >();
  for (const e of events) {
    const { year, month, day } = dateParts(e.frontmatter.start, e.frontmatter.timezone);
    const key = `${year}-${month}`;
    if (!byMonth.has(key) && byMonth.size >= limit) continue;
    const m = byMonth.get(key) ?? { year, month, days: new Map() };
    m.days.set(day, [...(m.days.get(day) ?? []), e]);
    byMonth.set(key, m);
  }
  const first = firstWeekday(locale);
  return [...byMonth.values()].map((m) => {
    const startDow = new Date(Date.UTC(m.year, m.month - 1, 1)).getUTCDay();
    const daysIn = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
    const lead = (startDow - first + 7) % 7;
    const cells: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysIn }, (_, i) => i + 1),
    ];
    while (cells.length % 7) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const weekdays = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(2024, 0, 7 + ((first + i) % 7))); // 2024-01-07 was a Sunday
      return {
        short: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date),
        long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date),
      };
    });
    const title = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(m.year, m.month - 1, 1)));
    return { ...m, title, weeks, weekdays };
  });
}

function eventJsonLd(events: EventItem[], siteUrl: string | undefined, collection: string) {
  return events.map((e) => {
    const fm = e.frontmatter;
    const loc = fm.location;
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: fm.title,
      startDate: fm.start,
      ...(fm.end ? { endDate: fm.end } : {}),
      ...(fm.excerpt ? { description: fm.excerpt } : {}),
      eventAttendanceMode: loc?.online
        ? "https://schema.org/OnlineEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
      ...(loc && (loc.name || loc.address || loc.url)
        ? {
            location: loc.online
              ? { "@type": "VirtualLocation", url: loc.url ?? fm.registrationUrl }
              : {
                  "@type": "Place",
                  name: loc.name ?? loc.address,
                  address: loc.address ?? loc.name,
                },
          }
        : {}),
      ...(siteUrl ? { url: new URL(`${collection}/${e.slug}/`, siteUrl).toString() } : {}),
    };
  });
}

export const eventsBlock = defineBlock({
  type: "events",
  version: 1,
  category: "collections",
  label: "Events",
  icon: "calendar-days",
  description: "Upcoming (or past) events as a list, cards or a month calendar.",
  fields: {
    heading: f.text({ optional: true, maxLength: 80, default: "Coming up" }),
    headingLevel: headingLevelField(),
    source: f.reference({
      collectionKinds: ["events"],
      default: { collection: "events", filter: { upcoming: true }, limit: 6 },
      label: "Events",
      help: "Upcoming events by default; switch the filter to show past events",
    }),
    showImage: f.boolean({ default: false }),
    showLocation: f.boolean({ default: true }),
    showExcerpt: f.boolean({ default: true }),
    registerLabel: f.text({ maxLength: 30, default: "Reserve a spot" }),
    emptyMessage: f.text({
      maxLength: 160,
      default: "No events on the calendar right now — new dates are posted every month.",
    }),
    structuredData: f.boolean({
      default: true,
      label: "Event structured data",
      help: "Helps search engines list your events",
    }),
  },
  variants: ["list", "cards", "calendar"],
  styleSlots: ["colorTheme", "padding", "radius", "shadow", "animation", "typography.title"],
  ai: {
    purpose: "Shows events from the events collection: dates, times, places and a way to register.",
    whenToUse:
      "Home, schedule and community pages. `calendar` shows month grids with an agenda below; `list` is the most scannable.",
    avoid:
      "Typing events into text blocks (add them to the events collection so they stay in sync).",
  },
  render: ({ id, fields, variant, style }) => {
    const HTag = fields.headingLevel;
    // Item titles sit one level under the list's own heading; without one they take its level
    // (so a section heading h2 is followed by h3 items, never a skipped level).
    const ITag = fields.heading ? childLevel(fields.headingLevel) : fields.headingLevel;
    const { basePath, doc } = useRenderContext();
    const locale = useLocale();
    const events = useCollectionQuery(fields.source).filter(
      (i): i is EventItem => i.kind === "events",
    );
    const headingId = sub(id, "h");
    const heading = fields.heading ? (
      <HTag className="os-events__heading os-type-h3" id={headingId}>
        {fields.heading}
      </HTag>
    ) : null;
    if (!events.length)
      return (
        <div className={cx("os-events", `os-events--${variant}`)}>
          {heading}
          <p className="os-events__empty">{fields.emptyMessage}</p>
          <EditorNotice>No published events in “{fields.source.collection}” match.</EditorNotice>
        </div>
      );

    const href = (e: EventItem) => itemPath(fields.source.collection, e.slug, basePath);
    const agenda = (
      <ul className="os-events__list" aria-labelledby={heading ? headingId : undefined}>
        {events.map((e) => {
          const fm = e.frontmatter;
          const { day } = dateParts(fm.start, fm.timezone);
          const month = formatDate(fm.start, locale, { month: "short" }, fm.timezone);
          const image = fields.showImage ? itemImage(e) : undefined;
          return (
            <li key={itemKey(e)} className="os-events__item">
              <p className="os-events__badge" aria-hidden="true">
                <span className="os-events__month">{month}</span>
                <span className="os-events__day">{day}</span>
              </p>
              {image ? (
                <Img
                  src={image}
                  alt=""
                  aspect="3:2"
                  sizes="(min-width: 768px) 320px, 100vw"
                  className="os-events__image"
                />
              ) : null}
              <div className="os-events__body">
                <ITag className={cx("os-events__title", typo(style, "title", "h4"))}>
                  <a className="os-events__link" href={href(e)}>
                    {fm.title}
                  </a>
                </ITag>
                <p className="os-events__when">
                  <Icon name="clock" size={16} />
                  <time dateTime={fm.start}>{eventWhen(fm, locale)}</time>
                </p>
                {fields.showLocation && (fm.location?.name || fm.location?.online) ? (
                  <p className="os-events__where">
                    <Icon name="map-pin" size={16} />
                    <span>
                      {fm.location?.online ? (fm.location.name ?? "Online") : fm.location?.name}
                    </span>
                  </p>
                ) : null}
                {fields.showExcerpt && fm.excerpt && variant !== "calendar" ? (
                  <p className="os-events__excerpt">{fm.excerpt}</p>
                ) : null}
                {fm.registrationUrl || fm.price ? (
                  <p className="os-events__actions">
                    {fm.price ? <span className="os-events__price">{fm.price}</span> : null}
                    {fm.registrationUrl ? (
                      <a
                        className="os-events__register"
                        href={fm.registrationUrl}
                        rel="noopener"
                        target="_blank"
                      >
                        {fields.registerLabel}
                        <span className="os-visually-hidden">
                          : {fm.title} (opens in a new tab)
                        </span>
                      </a>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );

    const jsonLd = fields.structuredData
      ? eventJsonLd(events, doc ? siteUrlFor(doc) : undefined, fields.source.collection)
      : undefined;
    const ld = jsonLd ? (
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped JSON-LD (jsonForScript)
        dangerouslySetInnerHTML={{ __html: jsonForScript(jsonLd) }}
      />
    ) : null;

    if (variant !== "calendar")
      return (
        <div className={cx("os-events", `os-events--${variant}`)}>
          {heading}
          {agenda}
          {ld}
        </div>
      );

    const months = calendarMonths(events, locale);
    return (
      <div className="os-events os-events--calendar">
        {heading}
        <div className="os-events__months">
          {months.map((m) => (
            <table key={`${m.year}-${m.month}`} className="os-events__month-grid">
              <caption className="os-events__caption">{m.title}</caption>
              <thead>
                <tr>
                  {m.weekdays.map((w) => (
                    <th key={w.long} scope="col">
                      <abbr title={w.long}>{w.short}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.weeks.map((week, wi) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
                  <tr key={wi}>
                    {week.map((d, di) => {
                      const list = d ? m.days.get(d) : undefined;
                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: days are positional
                        <td key={di} className={cx(!d && "is-blank", list && "has-events")}>
                          {d ? <span className="os-events__date">{d}</span> : null}
                          {list?.map((e) => (
                            <a key={itemKey(e)} className="os-events__chip" href={href(e)}>
                              {e.frontmatter.title}
                            </a>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
        {agenda}
        {ld}
      </div>
    );
  },
});

export const collectionsCss = `
.os-summary,.os-events{display:grid;gap:var(--os-space-sm)}
.os-summary__heading,.os-events__heading{margin:0;color:var(--os-color-heading)}
.os-summary__items{display:grid;gap:var(--os-space-md) var(--os-space-sm);margin:0;padding:0;list-style:none}
@container block (min-width:36rem){.os-summary--grid .os-summary__items{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container block (min-width:60rem){.os-summary--grid .os-summary__items{grid-template-columns:repeat(var(--s-cols,3),minmax(0,1fr))}}
.os-summary__item{min-width:0;display:flex}
.os-summary__card{position:relative;display:grid;align-content:start;gap:var(--os-space-xs);width:100%}
.os-summary__body{display:grid;gap:var(--os-space-3xs)}
.os-summary__meta{display:flex;flex-wrap:wrap;gap:0.2em 0.9em;margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-summary__title{margin:0;color:var(--os-color-heading);text-wrap:balance}
.os-summary__link{color:inherit;text-decoration:none}
.os-summary__link::after{content:"";position:absolute;inset:0;z-index:1}
.os-summary__card:hover .os-summary__link{text-decoration:underline;text-underline-offset:0.2em}
.os-summary__link:focus-visible{outline:none}
.os-summary__card:has(.os-summary__link:focus-visible){outline:2px solid var(--os-color-focus);outline-offset:4px;border-radius:var(--os-radius-sm)}
.os-summary__excerpt{margin:0.2em 0 0;color:var(--os-color-text)}
.os-price__sep{color:var(--os-color-text-muted);font-weight:400}
.os-summary__price{margin:0;font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-summary__price s{font-weight:400;color:var(--os-color-text-muted)}
.os-summary__image{transition:transform var(--os-motion-duration-slow) var(--os-motion-ease)}
.os-summary__empty,.os-events__empty{margin:0;color:var(--os-color-text-muted)}
.os-summary__foot{margin-top:var(--os-space-2xs)}
.os-summary--list .os-summary__items{gap:0}
.os-summary--list .os-summary__item{padding-block:var(--os-space-sm);border-top:1px solid var(--os-color-border)}
@container block (min-width:40rem){.os-summary--list .os-summary__card{grid-template-columns:minmax(0,16rem) minmax(0,1fr);gap:var(--os-space-md);align-items:start}}
.os-summary--list .os-summary__card:not(:has(.os-summary__image)){grid-template-columns:minmax(0,1fr)}
.os-summary--wall .os-summary__items{display:block;columns:1;column-gap:var(--os-space-sm)}
@container block (min-width:36rem){.os-summary--wall .os-summary__items{columns:2}}
@container block (min-width:60rem){.os-summary--wall .os-summary__items{columns:var(--s-cols,3)}}
.os-summary--wall .os-summary__item{break-inside:avoid;margin-bottom:var(--os-space-md)}
.os-summary--carousel .os-summary__items{display:grid;gap:var(--os-space-sm)}
.os-align-center .os-summary__foot,.os-malign-center .os-summary__foot{text-align:center}

.os-events__list{display:grid;gap:0;margin:0;padding:0;list-style:none}
.os-events__item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--os-space-sm);padding-block:var(--os-space-sm);border-top:1px solid var(--os-color-border);align-items:start}
.os-events__badge{display:grid;justify-items:center;min-width:3.75rem;margin:0;padding:0.5rem 0.4rem;border-radius:var(--os-radius-card);background:var(--os-color-surface);line-height:1}
.os-events__month{font-size:var(--os-type-small-font-size);text-transform:uppercase;letter-spacing:0.08em;color:var(--os-color-link);font-weight:var(--os-font-weight-strong)}
.os-events__day{font-family:var(--os-font-heading);font-size:var(--os-type-h3-font-size);color:var(--os-color-heading);margin-top:0.2em}
.os-events__image{grid-column:2}
.os-events__body{grid-column:2;display:grid;gap:0.3em;min-width:0}
.os-events__title{margin:0;color:var(--os-color-heading)}
.os-events__link{color:inherit;text-decoration:none}
.os-events__link:hover{text-decoration:underline;text-underline-offset:0.2em}
.os-events__when,.os-events__where{display:flex;align-items:center;gap:0.45em;margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text)}
.os-events__when .os-icon,.os-events__where .os-icon{flex:none;color:var(--os-color-accent)}
.os-events__excerpt{margin:0.2em 0 0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
.os-events__actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--os-space-xs);margin:0.3em 0 0}
.os-events__price{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-events__register{font-weight:var(--os-font-weight-strong);color:var(--os-color-link)}
.os-events--cards .os-events__list{gap:var(--os-space-sm)}
@container block (min-width:44rem){.os-events--cards .os-events__list{grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))}}
.os-events--cards .os-events__item{border:0;padding:var(--os-space-sm);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-events--cards .os-events__item{border-radius:var(--radius)}
.os-events--cards .os-events__badge{background:var(--os-color-background)}
.os-events--cards .os-events__item{grid-template-columns:minmax(0,1fr);gap:var(--os-space-xs)}
.os-events--cards .os-events__badge{justify-self:start;grid-auto-flow:column;gap:0.4em;align-items:baseline;padding:0.4rem 0.7rem}
.os-events--cards .os-events__day{margin:0;font-size:var(--os-type-h4-font-size)}
.os-events--cards .os-events__image,.os-events--cards .os-events__body{grid-column:1}
.os-events--calendar{gap:var(--os-space-md)}
.os-events__months{display:grid;gap:var(--os-space-md)}
@container block (min-width:64rem){.os-events__months{grid-template-columns:repeat(auto-fit,minmax(24rem,1fr))}}
.os-events__month-grid{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--os-type-small-font-size)}
.os-events__caption{text-align:start;padding-bottom:var(--os-space-2xs);font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:var(--os-type-h4-font-size);color:var(--os-color-heading)}
.os-events__month-grid th{padding:0.4em 0;font-weight:var(--os-font-weight-strong);color:var(--os-color-text-muted)}
.os-events__month-grid abbr{text-decoration:none}
.os-events__month-grid td{height:4.5rem;padding:0.3rem;vertical-align:top;border:1px solid var(--os-color-border)}
.os-events__month-grid td.is-blank{background:var(--os-color-surface)}
.os-events__month-grid td.has-events .os-events__date{display:inline-grid;place-items:center;min-width:1.6em;height:1.6em;border-radius:var(--os-radius-full);background:var(--os-color-accent);color:var(--os-color-accent-text)}
.os-events__date{color:var(--os-color-text)}
.os-events__chip{display:block;margin-top:0.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--os-color-link);text-decoration:none;font-size:0.85em}
.os-events__chip:hover{text-decoration:underline}
@container block (max-width:40rem){.os-events__month-grid td{height:2.75rem;padding:0.15rem;text-align:center}.os-events__chip{font-size:0;height:0.4rem;width:0.4rem;margin:0.2rem auto 0;border-radius:var(--os-radius-full);background:var(--os-color-accent)}}
`;
