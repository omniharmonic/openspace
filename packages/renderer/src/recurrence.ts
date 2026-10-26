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
 * Occurrence dates (YYYY-MM-DD) of a rule starting on `start`, in order.
 * - `from` / `through` bound the dates returned (inclusive);
 * - `max` caps how many are returned (counted from `from`, never from the first date);
 * - COUNT is counted from the first date, as RFC 5545 says (DTSTART is the first occurrence).
 * Without COUNT, the walk jumps straight to `from`, so a series that started years ago costs the
 * same as a new one.
 */
export function occurrenceDates(
  rule: string | RecurrenceRule,
  start: string,
  options: { from?: string; through?: string; max?: number } = {},
): string[] {
  const r = typeof rule === "string" ? parseRecurrence(rule) : rule;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const first = utc(y, mo, d);
  const from = options.from ?? iso(first);
  const max = options.max ?? 500;
  if (!r) return iso(first) >= from && max > 0 ? [iso(first)] : [];
  const last = [r.until, options.through].filter(Boolean).sort()[0];
  const over = (date: Date) => (last ? iso(date) > last : false);
  const out: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  const take = (date: Date) => {
    const s = iso(date);
    if (date < first || seen.has(s)) return;
    seen.add(s);
    total += 1;
    if (s >= from) out.push(s);
  };
  const done = () => out.length >= max || (r.count !== undefined && total >= r.count);

  // Jump close to `from` when COUNT doesn't need every earlier date (whole periods only).
  let i0 = 0;
  if (r.count === undefined && from > iso(first)) {
    const f = new Date(`${from}T00:00:00Z`);
    const days = Math.floor((f.getTime() - first.getTime()) / DAY_MS);
    const months = (f.getUTCFullYear() - y) * 12 + (f.getUTCMonth() + 1 - mo);
    const periods =
      r.freq === "DAILY"
        ? days / r.interval
        : r.freq === "WEEKLY"
          ? days / (7 * r.interval)
          : r.freq === "MONTHLY"
            ? months / r.interval
            : (f.getUTCFullYear() - y) / r.interval;
    i0 = Math.max(0, Math.floor(periods) - 1);
  }
  if (i0 === 0) take(first); // DTSTART is always the first occurrence.

  for (let i = i0; !done() && i < i0 + 20_000; i++) {
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
      if (done()) break;
      if (over(date)) {
        stop = true;
        break;
      }
      take(date);
    }
    if (stop) break;
  }
  return out;
}

/** UTC offset (minutes) of an IANA zone at an instant; null when the zone is unknown. */
export function zoneOffsetMinutes(timeZone: string, at: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(at));
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
    return Math.round((wall - at) / 60_000);
  } catch {
    return null;
  }
}

const fmtOffset = (min: number) => {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

/**
 * A date-time on another day at the same local wall time. With an IANA `timeZone` the offset is
 * the zone's offset on that day (so 7pm stays 7pm across daylight-saving changes); otherwise the
 * written offset is kept.
 */
export function shiftDateTime(value: string, days: number, timeZone?: string): string {
  const day = new Date(Date.parse(`${value.slice(0, 10)}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?$/.exec(
    value,
  );
  if (!m) return `${day}${value.slice(10)}`;
  const time = m[1] as string;
  if (!timeZone) return `${day}T${time}${m[2] ?? ""}`;
  const wall = Date.parse(`${day}T${time.length === 5 ? `${time}:00` : time}Z`);
  // The instant whose local time in the zone is `wall` (two passes settle DST edges).
  let off = zoneOffsetMinutes(timeZone, wall);
  if (off === null) return `${day}T${time}${m[2] ?? ""}`;
  off = zoneOffsetMinutes(timeZone, wall - off * 60_000) ?? off;
  return `${day}T${time}${fmtOffset(off)}`;
}

/** The same event moved to another date (local time of day and length kept). */
export function eventOn(item: Extract<CollectionItem, { kind: "events" }>, date: string) {
  const fm = item.frontmatter;
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${fm.start.slice(0, 10)}T00:00:00Z`)) / DAY_MS,
  );
  const move = (v: string) => shiftDateTime(v, days, fm.timezone);
  return {
    ...item,
    frontmatter: { ...fm, start: move(fm.start), ...(fm.end ? { end: move(fm.end) } : {}) },
  } as typeof item;
}

/** Whole days an event spans (0 for a single-day event). */
export function eventLengthDays(item: CollectionItem): number {
  if (item.kind !== "events" || !item.frontmatter.end) return 0;
  const fm = item.frontmatter;
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${(fm.end as string).slice(0, 10)}T00:00:00Z`) -
        Date.parse(`${fm.start.slice(0, 10)}T00:00:00Z`)) /
        DAY_MS,
    ),
  );
}

/**
 * Repeating events as one item per occurrence between `from` and `through` (YYYY-MM-DD),
 * at most `perEvent` each: the earliest ones, or with `newest` the most recent ones (for past
 * lists). Other items pass through unchanged.
 */
export function expandOccurrences(
  items: CollectionItem[],
  window: { from: string; through: string; perEvent?: number; newest?: boolean },
): CollectionItem[] {
  const out: CollectionItem[] = [];
  for (const item of items) {
    if (item.kind !== "events" || !item.frontmatter.recurrence) {
      out.push(item);
      continue;
    }
    const fm = item.frontmatter;
    const lengthDays = eventLengthDays(item);
    // Keep occurrences that haven't ended before the window starts.
    const fromStart = iso(new Date(Date.parse(`${window.from}T00:00:00Z`) - lengthDays * DAY_MS));
    const per = window.perEvent ?? 12;
    // A window is at most about a year, so every date in it is cheap to list; past lists keep the
    // latest ones (counted back from the end of the window).
    const all = occurrenceDates(fm.recurrence as string, fm.start, {
      from: fromStart,
      through: window.through,
      max: window.newest ? 2000 : per,
    });
    const dates = window.newest ? all.slice(-per) : all;
    for (const date of dates) out.push(eventOn(item, date));
  }
  return out;
}

/** React key for a listed item (repeating events share a slug). */
export function itemKey(item: CollectionItem): string {
  return item.kind === "events" && item.frontmatter.recurrence
    ? `${item.slug}@${item.frontmatter.start}`
    : item.slug;
}
