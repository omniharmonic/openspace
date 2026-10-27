import { occurrenceDates } from "@omniharmonic/openspace-renderer";

/**
 * Repeat rules for events: a friendly model ⇄ RFC 5545 RRULE bodies (`FREQ=WEEKLY;BYDAY=TU`),
 * a plain-language description, and the next few dates for a preview.
 * Covers what people set up by hand: every N days/weeks/months/years, weekdays, "the 2nd
 * Tuesday" or "the 15th" of the month, and ending never / after N times / on a date.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};

export interface Repeat {
  freq: Freq;
  interval: number;
  /** Weekly: which days. */
  byDay: Weekday[];
  /** Monthly: on the same date ("the 15th") or the same weekday ("the 2nd Tuesday"). */
  monthMode: "date" | "weekday";
  end:
    | { type: "never" }
    | { type: "count"; count: number }
    /** `raw` keeps the UNTIL value as written while its date is unchanged. */
    | { type: "until"; date: string; raw?: string };
  /** Rule parts the editor doesn't model (e.g. WKST), written back verbatim. */
  extra?: string[];
}

/** Parts the simple editor understands. */
const MODELED = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "COUNT", "UNTIL"]);
/** Unmodeled parts that don't change which dates happen (safe to carry along). */
const HARMLESS = new Set(["WKST"]);

const JS_DAY: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Calendar date (Y, M, D) of an ISO date or date-time, as written (no time zone shift). */
function ymd(start: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const weekdayOf = (date: Date): Weekday => JS_DAY[date.getUTCDay()] as Weekday;
/** 1..5: which occurrence of its weekday the date is in its month. */
const nthOfMonth = (date: Date) => Math.ceil(date.getUTCDate() / 7);

/** An all-day start ("2026-11-03") rather than a date-time. */
export function isDateOnly(start: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(start);
}

/** `KEY=VALUE` parts of a rule, keys upper-cased, values as written. */
function partsOf(rule: string): Array<[string, string]> {
  return rule
    .replace(/^RRULE:/i, "")
    .split(";")
    .map((p) => p.split("="))
    .filter((kv): kv is [string, string] => Boolean(kv[0] && kv[1]))
    .map(([k, v]) => [k.toUpperCase(), v]);
}

/** A comparable form: defaults spelled out, lists sorted, order ignored. */
function canonical(rule: string, start: string): string {
  const p = ymd(start);
  const startDay = p ? weekdayOf(utc(p.y, p.m, p.d)) : "MO";
  const map = new Map(partsOf(rule).map(([k, v]) => [k, v.toUpperCase()]));
  if (map.get("INTERVAL") === "1") map.delete("INTERVAL");
  if (map.get("FREQ") === "WEEKLY" && !map.has("BYDAY")) map.set("BYDAY", startDay);
  if (map.get("FREQ") === "MONTHLY" && !map.has("BYDAY") && !map.has("BYMONTHDAY") && p)
    map.set("BYMONTHDAY", String(p.d));
  if (map.has("BYDAY")) map.set("BYDAY", (map.get("BYDAY") as string).split(",").sort().join(","));
  if (map.has("UNTIL")) map.set("UNTIL", (map.get("UNTIL") as string).slice(0, 8));
  return [...map]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(";");
}

/**
 * Whether the simple editor can show and edit this rule without changing what it means.
 * Anything else (BYSETPOS, BYMONTH, "last Tuesday", several weekdays a month…) is a custom rule:
 * shown as text and only changed when the person edits it.
 */
export function isSimpleRule(rule: string, start: string): boolean {
  const r = parseRRule(rule, start);
  if (!r) return false;
  if (partsOf(rule).some(([k]) => !MODELED.has(k) && !HARMLESS.has(k))) return false;
  return canonical(rule, start) === canonical(toRRule(r, start), start);
}

/** UNTIL rewritten to the start's value type: a DATE for all-day starts, else a UTC date-time. */
export function matchUntilType(rule: string, start: string): string {
  return partsOf(rule)
    .map(([k, v]) => {
      if (k !== "UNTIL") return `${k}=${v}`;
      const day = v.slice(0, 8);
      if (isDateOnly(start)) return `UNTIL=${day}`;
      return v.length > 8 ? `UNTIL=${v}` : `UNTIL=${day}T235959Z`;
    })
    .join(";");
}

/**
 * The rule after the event's first date moves from `from` to `to`: days that were simply "the
 * start's day" follow it (weekly BYDAY, monthly BYMONTHDAY or nth weekday). Everything else is
 * kept exactly as written.
 */
export function retargetRule(rule: string, from: string, to: string): string {
  const a = ymd(from);
  const b = ymd(to);
  if (!a || !b) return rule;
  const da = utc(a.y, a.m, a.d);
  const db = utc(b.y, b.m, b.d);
  const parts = partsOf(rule);
  const freq = parts.find(([k]) => k === "FREQ")?.[1].toUpperCase();
  return parts
    .map(([k, v]) => {
      const V = v.toUpperCase();
      if (k === "BYDAY" && freq === "WEEKLY" && V === weekdayOf(da)) return `${k}=${weekdayOf(db)}`;
      if (k === "BYDAY" && freq === "MONTHLY" && V === `${nthOfMonth(da)}${weekdayOf(da)}`)
        return `${k}=${nthOfMonth(db)}${weekdayOf(db)}`;
      if (k === "BYMONTHDAY" && Number(V) === a.d) return `${k}=${b.d}`;
      return `${k}=${v}`;
    })
    .join(";");
}

export function defaultRepeat(start: string): Repeat {
  const p = ymd(start);
  const day = p ? weekdayOf(utc(p.y, p.m, p.d)) : "MO";
  return { freq: "WEEKLY", interval: 1, byDay: [day], monthMode: "date", end: { type: "never" } };
}

export function toRRule(r: Repeat, start: string): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${Math.floor(r.interval)}`);
  const p = ymd(start);
  if (r.freq === "WEEKLY" && r.byDay.length) {
    const days = WEEKDAYS.filter((d) => r.byDay.includes(d));
    parts.push(`BYDAY=${days.join(",")}`);
  }
  if (r.freq === "MONTHLY" && p) {
    const date = utc(p.y, p.m, p.d);
    if (r.monthMode === "weekday") parts.push(`BYDAY=${nthOfMonth(date)}${weekdayOf(date)}`);
    else parts.push(`BYMONTHDAY=${p.d}`);
  }
  if (r.end.type === "count") parts.push(`COUNT=${Math.max(1, Math.floor(r.end.count))}`);
  if (r.end.type === "until") {
    // RFC 5545: UNTIL has the same value type as DTSTART — a DATE for all-day events.
    const day = r.end.date.replace(/-/g, "");
    if (r.end.raw && r.end.raw.slice(0, 8) === day) parts.push(`UNTIL=${r.end.raw}`);
    else parts.push(isDateOnly(start) ? `UNTIL=${day}` : `UNTIL=${day}T235959Z`);
  }
  for (const extra of r.extra ?? []) parts.push(extra);
  return parts.join(";");
}

export function parseRRule(rule: string, start: string): Repeat | null {
  const map = new Map<string, string>();
  for (const part of rule.replace(/^RRULE:/, "").split(";")) {
    const [k, v] = part.split("=");
    if (k && v) map.set(k.toUpperCase(), v.toUpperCase());
  }
  const freq = map.get("FREQ") as Freq | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const base = defaultRepeat(start);
  const interval = Number(map.get("INTERVAL") ?? 1);
  const byDayRaw = map.get("BYDAY") ?? "";
  const byDay = byDayRaw
    .split(",")
    .map((d) => d.replace(/^[+-]?\d+/, "") as Weekday)
    .filter((d) => (WEEKDAYS as readonly string[]).includes(d));
  const until = map.get("UNTIL");
  const count = map.get("COUNT");
  const extra = partsOf(rule)
    .filter(([k]) => !MODELED.has(k))
    .map(([k, v]) => `${k}=${v}`);
  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    byDay: freq === "WEEKLY" ? (byDay.length ? byDay : base.byDay) : base.byDay,
    monthMode: freq === "MONTHLY" && /\d/.test(byDayRaw) ? "weekday" : "date",
    end: count
      ? { type: "count", count: Number(count) }
      : until
        ? {
            type: "until",
            date: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`,
            raw: until,
          }
        : { type: "never" },
    ...(extra.length ? { extra } : {}),
  };
}

const ORDINAL = ["", "first", "second", "third", "fourth", "fifth"];
const unit: Record<Freq, [string, string]> = {
  DAILY: ["day", "days"],
  WEEKLY: ["week", "weeks"],
  MONTHLY: ["month", "months"],
  YEARLY: ["year", "years"],
};

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** "Every week on Tuesday and Thursday, 10 times". */
export function describeRepeat(r: Repeat, start: string): string {
  const [one, many] = unit[r.freq];
  let s = r.interval > 1 ? `Every ${r.interval} ${many}` : `Every ${one}`;
  const p = ymd(start);
  if (r.freq === "WEEKLY" && r.byDay.length)
    s += ` on ${list(WEEKDAYS.filter((d) => r.byDay.includes(d)).map((d) => WEEKDAY_NAMES[d]))}`;
  if (r.freq === "MONTHLY" && p) {
    const date = utc(p.y, p.m, p.d);
    s +=
      r.monthMode === "weekday"
        ? ` on the ${ORDINAL[nthOfMonth(date)]} ${WEEKDAY_NAMES[weekdayOf(date)]}`
        : ` on the ${dayOrdinal(p.d)}`;
  }
  if (r.end.type === "count") s += `, ${r.end.count} ${r.end.count === 1 ? "time" : "times"}`;
  if (r.end.type === "until") s += `, until ${r.end.date}`;
  return s;
}

function dayOrdinal(d: number): string {
  if (d % 100 >= 11 && d % 100 <= 13) return `${d}th`;
  const last = d % 10;
  return `${d}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

/** The first `n` dates (YYYY-MM-DD) the rule produces from `start` (the renderer's expander). */
export function nextDates(r: Repeat, start: string, n = 5): string[] {
  return occurrenceDates(toRRule(r, start), start, { max: n });
}
