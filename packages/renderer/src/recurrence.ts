import type { CollectionItem } from "@openspace/schema";

/**
 * Repeating events (RFC 5545 RRULE bodies such as `FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10`), the
 * subset Studio writes: DAILY / WEEKLY / MONTHLY / YEARLY, INTERVAL, BYDAY (weekly days or
 * monthly "2TU"), BYMONTHDAY, COUNT and UNTIL. Dates are calendar dates as written (the
 * event's own time zone); the first date always counts as an occurrence.
 */

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEK = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_MS = 86_400_000;

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** Weekly days, e.g. ["TU", "TH"]. */
  byDay: string[];
  /** Monthly "nth weekday" (1–5 or -1), from BYDAY=2TU. */
  nth?: { n: number; day: string };
  byMonthDay?: number;
  count?: number;
  /** Last allowed date, YYYY-MM-DD. */
  until?: string;
}

export function parseRecurrence(rule: string): RecurrenceRule | null {
  const map = new Map<string, string>();
  for (const part of rule.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = part.split("=");
    if (k && v) map.set(k.toUpperCase(), v.toUpperCase());
  }
  const freq = map.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  const interval = Math.max(1, Number(map.get("INTERVAL") ?? 1) || 1);
  const out: RecurrenceRule = { freq, interval, byDay: [] };
  for (const d of (map.get("BYDAY") ?? "").split(",").filter(Boolean)) {
    const m = /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(d);
    if (!m) continue;
    if (m[1] && freq === "MONTHLY") out.nth = { n: Number(m[1]), day: m[2] as string };
    else out.byDay.push(m[2] as string);
  }
  const bmd = Number(map.get("BYMONTHDAY"));
  if (Number.isInteger(bmd) && bmd > 0) out.byMonthDay = bmd;
  const count = Number(map.get("COUNT"));
  if (Number.isInteger(count) && count > 0) out.count = count;
  const until = map.get("UNTIL");
  if (until && /^\d{8}/.test(until))
    out.until = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  return out;
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Occurrence dates (YYYY-MM-DD) of a rule starting on `start`, in order, until `through`
 * (inclusive) or `max` dates. COUNT is counted from the first date even when `through` cuts
 * the list short.
 */
export function occurrenceDates(
  rule: string | RecurrenceRule,
  start: string,
  options: { through?: string; max?: number } = {},
): string[] {
  const r = typeof rule === "string" ? parseRecurrence(rule) : rule;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const first = utc(y, mo, d);
  if (!r) return [iso(first)];
  const max = Math.min(options.max ?? 500, r.count ?? Number.POSITIVE_INFINITY);
  const last = [r.until, options.through].filter(Boolean).sort()[0];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (date: Date) => {
    const s = iso(date);
    if (date < first || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  push(first); // DTSTART is always the first occurrence.
  const over = (date: Date) => (last ? iso(date) > last : false);
  for (let i = 0; out.length < max && i < 5000; i++) {
    const batch: Date[] = [];
    if (r.freq === "DAILY") batch.push(utc(y, mo, d + i * r.interval));
    else if (r.freq === "WEEKLY") {
      const monday = utc(y, mo, d - ((first.getUTCDay() + 6) % 7) + i * 7 * r.interval);
      const days = r.byDay.length ? r.byDay : [DAYS[first.getUTCDay()] as string];
      for (const day of WEEK)
        if (days.includes(day))
          batch.push(
            utc(
              monday.getUTCFullYear(),
              monday.getUTCMonth() + 1,
              monday.getUTCDate() + WEEK.indexOf(day),
            ),
          );
    } else if (r.freq === "MONTHLY") {
      const month = utc(y, mo + i * r.interval, 1);
      if (r.nth) {
        const want = DAYS.indexOf(r.nth.day as (typeof DAYS)[number]);
        if (r.nth.n > 0) {
          const offset = (want - month.getUTCDay() + 7) % 7;
          const date = utc(
            month.getUTCFullYear(),
            month.getUTCMonth() + 1,
            1 + offset + (r.nth.n - 1) * 7,
          );
          if (date.getUTCMonth() === month.getUTCMonth()) batch.push(date);
        } else {
          const end = utc(month.getUTCFullYear(), month.getUTCMonth() + 2, 0);
          const back = (end.getUTCDay() - want + 7) % 7;
          batch.push(utc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate() - back));
        }
      } else {
        const day = r.byMonthDay ?? d;
        const date = utc(month.getUTCFullYear(), month.getUTCMonth() + 1, day);
        if (date.getUTCDate() === day) batch.push(date); // months without that date are skipped
      }
    } else {
      const date = utc(y + i * r.interval, mo, d);
      if (date.getUTCDate() === d) batch.push(date);
    }
    let stop = false;
    for (const date of batch) {
      if (out.length >= max) break;
      if (over(date)) {
        stop = true;
        break;
      }
      push(date);
    }
    if (stop || batch.some(over)) break;
  }
  return out;
}

/** The same event moved to another date (time of day, offset and length kept). */
export function eventOn(item: Extract<CollectionItem, { kind: "events" }>, date: string) {
  const fm = item.frontmatter;
  const shift = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${fm.start.slice(0, 10)}T00:00:00Z`);
  const move = (v: string) =>
    `${new Date(Date.parse(`${v.slice(0, 10)}T00:00:00Z`) + shift).toISOString().slice(0, 10)}${v.slice(10)}`;
  return {
    ...item,
    frontmatter: { ...fm, start: move(fm.start), ...(fm.end ? { end: move(fm.end) } : {}) },
  } as typeof item;
}

/**
 * Repeating events as one item per occurrence between `from` and `through` (YYYY-MM-DD),
 * at most `perEvent` each. Other items pass through unchanged.
 */
export function expandOccurrences(
  items: CollectionItem[],
  window: { from: string; through: string; perEvent?: number },
): CollectionItem[] {
  const out: CollectionItem[] = [];
  for (const item of items) {
    if (item.kind !== "events" || !item.frontmatter.recurrence) {
      out.push(item);
      continue;
    }
    const fm = item.frontmatter;
    const lengthDays = fm.end
      ? Math.round(
          (Date.parse(`${fm.end.slice(0, 10)}T00:00:00Z`) -
            Date.parse(`${fm.start.slice(0, 10)}T00:00:00Z`)) /
            DAY_MS,
        )
      : 0;
    const dates = occurrenceDates(fm.recurrence as string, fm.start, { through: window.through });
    // Keep occurrences that haven't ended before the window starts.
    const fromStart = iso(new Date(Date.parse(`${window.from}T00:00:00Z`) - lengthDays * DAY_MS));
    const inWindow = dates.filter((x) => x >= fromStart).slice(0, window.perEvent ?? 12);
    for (const date of inWindow) out.push(eventOn(item, date));
  }
  return out;
}

/** React key for a listed item (repeating events share a slug). */
export function itemKey(item: CollectionItem): string {
  return item.kind === "events" && item.frontmatter.recurrence
    ? `${item.slug}@${item.frontmatter.start}`
    : item.slug;
}
