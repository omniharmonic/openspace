import { cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { Icon } from "../icons";
import { typo, useLocale } from "../shared";

/** Opening hours and the contact / address card. */

const DAYS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
] as const;
type Day = (typeof DAYS)[number]["value"];
const DAY_INDEX: Record<Day, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

const TIME_RE = /^([01]?\d|2[0-4]):([0-5]\d)$/;

/** `07:30` → "7:30 AM" / "07:30" in the site's locale; anything else is printed as written. */
export function formatTime(value: string, locale: string): string {
  const m = TIME_RE.exec(value.trim());
  if (!m) return value;
  const date = new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2])));
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      ...(m[2] === "00" ? {} : { minute: "2-digit" as const }),
      timeZone: "UTC",
    }).format(date);
  } catch {
    return value;
  }
}

/** Weekday name in the site's locale (2024-01-01 was a Monday). */
function dayName(day: Day, locale: string, width: "long" | "short"): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 1 + DAY_INDEX[day])),
    );
  } catch {
    return DAYS[DAY_INDEX[day]]?.label ?? day;
  }
}

interface HoursRow {
  day: Day;
  opens?: string | undefined;
  closes?: string | undefined;
  closed: boolean;
}

/** Group consecutive days with identical hours: Mon–Fri 6:30 AM – 8:30 PM. */
export function groupHours(rows: readonly HoursRow[]) {
  const sorted = [...rows].sort((a, b) => DAY_INDEX[a.day] - DAY_INDEX[b.day]);
  const key = (r: HoursRow) => (r.closed ? "closed" : `${r.opens ?? ""}-${r.closes ?? ""}`);
  const groups: { from: Day; to: Day; row: HoursRow }[] = [];
  for (const r of sorted) {
    const last = groups[groups.length - 1];
    if (last && key(last.row) === key(r) && DAY_INDEX[r.day] === DAY_INDEX[last.to] + 1)
      last.to = r.day;
    else groups.push({ from: r.day, to: r.day, row: r });
  }
  return groups;
}

const row = (day: Day, opens?: string, closes?: string) =>
  opens && closes ? { day, opens, closes, closed: false } : { day, closed: true };

export const hoursBlock = defineBlock({
  type: "hours",
  version: 1,
  category: "contact",
  label: "Opening hours",
  icon: "clock",
  description: "Opening times by day, with consecutive days grouped.",
  fields: {
    heading: f.text({ optional: true, maxLength: 60, default: "Studio hours" }),
    rows: f.list({
      min: 1,
      max: 7,
      itemLabel: "day",
      fields: {
        day: f.select({ options: DAYS }),
        opens: f.text({ optional: true, maxLength: 5, help: "24-hour time, e.g. 07:30" }),
        closes: f.text({ optional: true, maxLength: 5, help: "24-hour time, e.g. 20:00" }),
        closed: f.boolean({ default: false }),
      },
      default: [
        row("mon", "06:30", "20:30"),
        row("tue", "06:30", "20:30"),
        row("wed", "06:30", "20:30"),
        row("thu", "06:30", "20:30"),
        row("fri", "06:30", "20:30"),
        row("sat", "08:00", "14:00"),
        row("sun", "16:00", "20:00"),
      ],
    }),
    note: f.text({
      optional: true,
      maxLength: 200,
      default: "Closed on public holidays. The front desk opens 20 minutes before the first class.",
    }),
  },
  variants: ["table", "compact", "card"],
  styleSlots: ["colorTheme", "padding", "radius", "align", "animation", "typography.heading"],
  ai: {
    purpose: "When a place is open, day by day.",
    whenToUse:
      "Contact, visit and footer areas of shops, studios, cafés and offices. Pair with the contact card or map.",
    avoid: "Hours the owner hasn't confirmed; using it for event times (use events).",
  },
  render: ({ id, fields, variant, style }) => {
    const locale = useLocale();
    const width = variant === "compact" ? "short" : "long";
    const groups = groupHours(fields.rows as HoursRow[]);
    const days = (g: (typeof groups)[number]) =>
      g.from === g.to
        ? dayName(g.from, locale, width)
        : `${dayName(g.from, locale, width)} – ${dayName(g.to, locale, width)}`;
    const hours = (r: HoursRow) =>
      r.closed || !r.opens || !r.closes
        ? "Closed"
        : `${formatTime(r.opens, locale)} – ${formatTime(r.closes, locale)}`;
    const headingId = `${id}-hours`;
    return (
      <div className={cx("os-hours", `os-hours--${variant}`)}>
        {fields.heading ? (
          <h3 id={headingId} className={cx("os-hours__heading", typo(style, "heading", "h4"))}>
            {fields.heading}
          </h3>
        ) : null}
        <table
          className="os-hours__table"
          aria-labelledby={fields.heading ? headingId : undefined}
          aria-label={fields.heading ? undefined : "Opening hours"}
        >
          <tbody>
            {groups.map((g) => (
              <tr key={g.from} className={cx(g.row.closed && "is-closed")}>
                <th scope="row">{days(g)}</th>
                <td>{hours(g.row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {fields.note ? <p className="os-hours__note">{fields.note}</p> : null}
      </div>
    );
  },
});

// --- contact card -------------------------------------------------------------------------------

export const contactInfoBlock = defineBlock({
  type: "contact-info",
  version: 1,
  category: "contact",
  label: "Contact details",
  icon: "contact",
  description: "Address, phone and email as a tidy card, with a link to directions.",
  fields: {
    heading: f.text({ optional: true, maxLength: 60, default: "Visit the studio" }),
    name: f.text({ optional: true, maxLength: 80, default: "Juniper Yoga" }),
    address: f.text({
      optional: true,
      multiline: true,
      maxLength: 240,
      default: "1840 Pearl Street, Suite 2\nBoulder, CO 80302",
    }),
    phone: f.text({ optional: true, maxLength: 30, default: "+1 (303) 555-0142" }),
    email: f.text({ optional: true, maxLength: 120, default: "hello@juniperyoga.com" }),
    directions: f.boolean({ default: true, help: "Link the address to OpenStreetMap directions" }),
    note: f.text({
      optional: true,
      maxLength: 200,
      default: "Free parking behind the building, entrance on 19th Street.",
    }),
  },
  variants: ["card", "list", "columns"],
  styleSlots: ["colorTheme", "padding", "radius", "align", "animation", "typography.heading"],
  ai: {
    purpose: "How to reach or visit the business: address, phone, email.",
    whenToUse:
      "Contact pages, footers and beside a map or form. `columns` lays the details side by side on wide screens.",
    avoid: "Personal phone numbers or addresses the owner hasn't chosen to publish.",
  },
  render: ({ fields, variant, style }) => {
    const tel = fields.phone?.replace(/[^\d+]/g, "");
    const mapsHref = fields.address
      ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(
          fields.address.replace(/\s*\n\s*/g, ", "),
        )}`
      : undefined;
    const email =
      fields.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ? fields.email : undefined;
    return (
      <div className={cx("os-contact", `os-contact--${variant}`)}>
        {fields.heading ? (
          <h3 className={cx("os-contact__heading", typo(style, "heading", "h4"))}>
            {fields.heading}
          </h3>
        ) : null}
        <address className="os-contact__items">
          {fields.address ? (
            <div className="os-contact__item">
              <Icon name="map-pin" size={20} />
              <div>
                {fields.name ? <span className="os-contact__name">{fields.name}</span> : null}
                <span className="os-contact__address">
                  {fields.address.split("\n").map((line, i, all) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: address lines are positional
                    <span key={i}>
                      {line}
                      {i < all.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </span>
                {fields.directions && mapsHref ? (
                  <a
                    className="os-contact__directions"
                    href={mapsHref}
                    rel="noopener"
                    target="_blank"
                  >
                    Get directions<span className="os-visually-hidden"> (opens OpenStreetMap)</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
          {fields.phone && tel ? (
            <div className="os-contact__item">
              <Icon name="phone" size={20} />
              <a href={`tel:${tel}`}>
                {fields.phone.replace(/ /g, "\u00a0").replace(/-/g, "\u2011")}
              </a>
            </div>
          ) : null}
          {email ? (
            <div className="os-contact__item">
              <Icon name="mail" size={20} />
              <a href={`mailto:${email}`}>{email}</a>
            </div>
          ) : null}
        </address>
        {fields.note ? <p className="os-contact__note">{fields.note}</p> : null}
      </div>
    );
  },
});

export const businessCss = `
.os-hours{display:grid;gap:var(--os-space-xs)}
.os-hours__heading,.os-contact__heading{margin:0;color:var(--os-color-heading)}
.os-hours__table{width:100%;border-collapse:collapse;font-variant-numeric:lining-nums tabular-nums}
.os-hours__table th,.os-hours__table td{padding:0.55em 0;text-align:start;vertical-align:baseline;border-bottom:1px solid var(--os-color-border)}
.os-hours__table th{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading);padding-inline-end:var(--os-space-sm)}
.os-hours__table td{text-align:end;color:var(--os-color-text)}
.os-hours__table tr.is-closed td{color:var(--os-color-text-muted)}
.os-hours__note,.os-contact__note{margin:0;font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-hours--compact .os-hours__table th,.os-hours--compact .os-hours__table td{border:0;padding-block:0.2em}
.os-hours--compact .os-hours__table td{text-align:start}
.os-hours--card,.os-contact--card{padding:var(--os-space-md);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-hours--card,.os-block.has-radius .os-contact--card{border-radius:var(--radius)}
.os-block.os-themed .os-hours--card,.os-block.os-themed .os-contact--card{background:transparent;padding:0}
.os-hours--card .os-hours__table tr:last-child>*{border-bottom:0}

.os-contact{display:grid;gap:var(--os-space-sm)}
.os-contact__items{display:grid;gap:var(--os-space-sm);font-style:normal}
.os-contact__item{display:flex;gap:0.75em;align-items:flex-start;color:var(--os-color-text);min-width:0}
.os-contact__item>.os-icon{flex:none;margin-top:0.15em;color:var(--os-color-accent)}
.os-contact__item>div{display:grid;gap:0.15em;min-width:0}
.os-contact__item a{color:var(--os-color-link);overflow-wrap:anywhere}
.os-contact__name{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-contact__directions{font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);margin-top:0.2em}
.os-contact--list .os-contact__item{padding-bottom:var(--os-space-sm);border-bottom:1px solid var(--os-color-border)}
@container block (min-width:48rem){.os-contact--columns .os-contact__items{grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:var(--os-space-md)}}
`;
