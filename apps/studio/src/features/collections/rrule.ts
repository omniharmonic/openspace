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
  end: { type: "never" } | { type: "count"; count: number } | { type: "until"; date: string };
}

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

/** The rule written the way `toRRule` writes it today (or null when it isn't a rule). */
export function normalizeRRule(rule: string, start: string): string | null {
  const r = parseRRule(rule, start);
  return r ? toRRule(r, start) : null;
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
  if (r.freq === "WEEKLY") {
    // The first date always counts as an occurrence (and toward COUNT), so its weekday is always
    // part of the rule; otherwise calendars disagree about which dates COUNT covers.
    const startDay = p ? weekdayOf(utc(p.y, p.m, p.d)) : undefined;
    const days = WEEKDAYS.filter((d) => r.byDay.includes(d) || d === startDay);
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
    parts.push(isDateOnly(start) ? `UNTIL=${day}` : `UNTIL=${day}T235959Z`);
  }
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
  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    byDay: freq === "WEEKLY" ? (byDay.length ? byDay : base.byDay) : base.byDay,
    monthMode: freq === "MONTHLY" && /\d/.test(byDayRaw) ? "weekday" : "date",
    end: count
      ? { type: "count", count: Number(count) }
      : until
        ? { type: "until", date: `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` }
        : { type: "never" },
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

/** The first `n` dates (YYYY-MM-DD) the rule produces from `start`. */
export function nextDates(r: Repeat, start: string, n = 5): string[] {
  const p = ymd(start);
  if (!p) return [];
  const first = utc(p.y, p.m, p.d);
  const until = r.end.type === "until" ? Date.parse(`${r.end.date}T23:59:59Z`) : Infinity;
  const max = r.end.type === "count" ? Math.min(n, r.end.count) : n;
  const out: string[] = [];
  const push = (d: Date) => {
    if (d.getTime() >= first.getTime() && d.getTime() <= until && out.length < max)
      out.push(d.toISOString().slice(0, 10));
  };
  const step = Math.max(1, r.interval);
  for (let i = 0; out.length < max && i < 600; i++) {
    if (r.freq === "DAILY") push(utc(p.y, p.m, p.d + i * step));
    else if (r.freq === "WEEKLY") {
      // Week starts on Monday (RFC 5545 default WKST=MO).
      const mondayOffset = (first.getUTCDay() + 6) % 7;
      const weekStart = utc(p.y, p.m, p.d - mondayOffset + i * 7 * step);
      for (const day of WEEKDAYS)
        if (r.byDay.includes(day))
          push(
            utc(
              weekStart.getUTCFullYear(),
              weekStart.getUTCMonth() + 1,
              weekStart.getUTCDate() + WEEKDAYS.indexOf(day),
            ),
          );
    } else if (r.freq === "MONTHLY") {
      const m0 = p.m + i * step;
      if (r.monthMode === "date") {
        const d = utc(p.y, m0, p.d);
        if (d.getUTCDate() === p.d) push(d); // skip months without that date
      } else {
        const nth = nthOfMonth(first);
        const wd = first.getUTCDay();
        const firstOfMonth = utc(p.y, m0, 1);
        const offset = (wd - firstOfMonth.getUTCDay() + 7) % 7;
        const d = utc(
          firstOfMonth.getUTCFullYear(),
          firstOfMonth.getUTCMonth() + 1,
          1 + offset + (nth - 1) * 7,
        );
        if (d.getUTCMonth() === firstOfMonth.getUTCMonth()) push(d);
      }
    } else {
      const d = utc(p.y + i * step, p.m, p.d);
      if (d.getUTCDate() === p.d) push(d);
    }
    if (out.length && Date.parse(`${out.at(-1)}T00:00:00Z`) > until) break;
  }
  return out;
}
