import type { CollectionItem } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { nextOccurrence, queryCollection } from "./collections";
import {
  expandOccurrences,
  itemKey,
  occurrenceDates,
  shiftDateTime,
  zoneOffsetMinutes,
} from "./recurrence";

const event = (slug: string, fm: Record<string, unknown>): CollectionItem =>
  ({
    kind: "events",
    slug,
    frontmatter: { title: slug, status: "published", ...fm },
    body: "",
  }) as CollectionItem;

const weekly = event("tuesday-flow", {
  start: "2026-11-03T19:00:00-07:00", // a Tuesday
  end: "2026-11-03T20:15:00-07:00",
  recurrence: "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6",
});
const once = event("open-house", { start: "2026-11-21", allDay: true });

describe("repeating events", () => {
  it("lists occurrence dates for weekly, monthly and yearly rules with COUNT and UNTIL", () => {
    expect(occurrenceDates("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6", "2026-11-03")).toEqual([
      "2026-11-03",
      "2026-11-05",
      "2026-11-10",
      "2026-11-12",
      "2026-11-17",
      "2026-11-19",
    ]);
    expect(occurrenceDates("FREQ=MONTHLY;BYDAY=1TU;COUNT=3", "2026-11-03")).toEqual([
      "2026-11-03",
      "2026-12-01",
      "2027-01-05",
    ]);
    expect(occurrenceDates("FREQ=MONTHLY;BYMONTHDAY=31", "2027-01-31", { max: 3 })).toEqual([
      "2027-01-31",
      "2027-03-31",
      "2027-05-31",
    ]);
    expect(occurrenceDates("FREQ=DAILY;INTERVAL=2;UNTIL=20261109", "2026-11-03")).toEqual([
      "2026-11-03",
      "2026-11-05",
      "2026-11-07",
      "2026-11-09",
    ]);
    // The first date counts even when it isn't one of the BYDAY days.
    expect(occurrenceDates("FREQ=WEEKLY;BYDAY=FR;COUNT=2", "2026-11-03")).toEqual([
      "2026-11-03",
      "2026-11-06",
    ]);
  });

  it("expands upcoming events into one item per date, keeping times and length", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    const items = queryCollection(
      { collection: "events", filter: { upcoming: true } },
      { events: { "tuesday-flow": weekly, "open-house": once } },
      { now },
    );
    expect(items.map((i) => (i.frontmatter as { start: string }).start)).toEqual([
      "2026-11-12T19:00:00-07:00",
      "2026-11-17T19:00:00-07:00",
      "2026-11-19T19:00:00-07:00",
      "2026-11-21",
    ]);
    expect((items[0] as CollectionItem).frontmatter as { end: string }).toMatchObject({
      end: "2026-11-12T20:15:00-07:00",
    });
    expect(((items[0] as CollectionItem).frontmatter as { end: string }).end).toBe(
      "2026-11-12T20:15:00-07:00",
    );
    expect(new Set(items.map(itemKey)).size).toBe(items.length);
    const past = queryCollection(
      { collection: "events", filter: { upcoming: false } },
      { events: { "tuesday-flow": weekly } },
      { now },
    );
    expect(past).toHaveLength(3);
  });

  it("shows a series at its next date where lists aren't filtered by date", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect((nextOccurrence(weekly, now).frontmatter as { start: string }).start).toBe(
      "2026-11-12T19:00:00-07:00",
    );
    // After the last date, the last one stays (it moves to "past" lists).
    expect(
      (nextOccurrence(weekly, new Date("2027-01-01T00:00:00Z")).frontmatter as { start: string })
        .start,
    ).toBe("2026-11-19T19:00:00-07:00");
    expect(expandOccurrences([once], { from: "2026-11-01", through: "2026-12-01" })).toEqual([
      once,
    ]);
  });

  it("finds upcoming dates of long-running series without counting old ones against the cap", () => {
    const daily = event("daily-sit", {
      start: "2025-01-01T07:00:00-07:00",
      recurrence: "FREQ=DAILY",
    });
    const now = new Date("2026-11-11T20:00:00Z"); // 13:00 in Denver: today's sit has passed
    expect(occurrenceDates("FREQ=DAILY", "2025-01-01", { from: "2026-11-11", max: 2 })).toEqual([
      "2026-11-11",
      "2026-11-12",
    ]);
    expect((nextOccurrence(daily, now).frontmatter as { start: string }).start).toBe(
      "2026-11-12T07:00:00-07:00",
    );
    const upcoming = queryCollection(
      { collection: "events", filter: { upcoming: true } },
      { events: { "daily-sit": daily } },
      { now },
    );
    // Up to 12 dates from today; today's 7am sit is over, so the list starts tomorrow.
    expect(upcoming).toHaveLength(11);
    expect(((upcoming[0] as CollectionItem).frontmatter as { start: string }).start).toBe(
      "2026-11-12T07:00:00-07:00",
    );
    // COUNT still counts from the first date.
    expect(occurrenceDates("FREQ=DAILY;COUNT=10", "2026-11-01", { from: "2026-11-08" })).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
    ]);
  });

  it("keeps the local time across daylight-saving changes in the event's time zone", () => {
    const tuesdays = event("tuesday-flow", {
      start: "2026-10-27T19:00:00-06:00", // summer time in Denver
      end: "2026-10-27T20:15:00-06:00",
      timezone: "America/Denver",
      recurrence: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
    });
    const [, nov3] = expandOccurrences([tuesdays], { from: "2026-10-01", through: "2026-12-31" });
    expect(nov3?.frontmatter).toMatchObject({
      start: "2026-11-03T19:00:00-07:00",
      end: "2026-11-03T20:15:00-07:00",
    });
    expect(shiftDateTime("2026-11-03T19:00:00-07:00", 0, "Not/AZone")).toBe(
      "2026-11-03T19:00:00-07:00",
    );
    expect(zoneOffsetMinutes("Europe/London", Date.UTC(2026, 6, 1))).toBe(60);
  });
});
