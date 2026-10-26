import { blocksRegistry } from "@openspace/blocks";
import { validate } from "@openspace/ops";
import { type CollectionItem, CollectionItemSchema, type SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { demoCollections } from "../../api/growth-fixtures";
import { niceTicks } from "../analytics/charts";
import { bandLabel, LABEL_MAX } from "../commerce/StoreSettingsView";
import { devSiteDocument } from "../editor/model/dev-site";
import { forceDark, previewEmail } from "../marketing/emailPreview";
import { duration, money, parseDuration, parseMoney } from "../workspace/format";
import { workspacePath, workspaceRoute } from "../workspace/routes";
import { diffLines, fieldChanges } from "./diff";
import {
  configOps,
  effectiveStatus,
  filterItems,
  itemProblems,
  newItem,
  saveItemOps,
  slugFromPattern,
  uniqueCollectionName,
} from "./itemOps";
import { KIND_META, kindOf, listCollections } from "./kinds";
import {
  defaultRepeat,
  describeRepeat,
  isSimpleRule,
  matchUntilType,
  nextDates,
  parseRRule,
  retargetRule,
  toRRule,
} from "./rrule";
import { combinations, suggestSku, syncVariants } from "./variants";

const NOW = Date.UTC(2026, 9, 26, 12);

function demoDoc(): SiteDocument {
  const doc = devSiteDocument({ siteId: "st_1", name: "Willow", url: "https://willow.example" });
  return { ...doc, ...demoCollections(NOW) } as SiteDocument;
}

/** Apply op bodies with the real validator (what the room does). */
function apply(doc: SiteDocument, bodies: unknown[]): SiteDocument {
  let d = doc;
  for (const [i, b] of bodies.entries()) {
    const op = { ...(b as object), id: `op_${i}`, actor: "user:test", ts: NOW + i };
    const r = validate(d, op as never, { registry: blocksRegistry(), trusted: true });
    if (!r.ok) throw new Error(r.errors.map((e) => e.message).join("; "));
    d = r.doc;
  }
  return d;
}

describe("workspace routes", () => {
  it("parses areas and nested paths, and builds them back", () => {
    expect(workspaceRoute("/sites/st_1/content/journal/slow-mornings")).toEqual({
      area: "content",
      rest: ["journal", "slow-mornings"],
    });
    expect(workspaceRoute("/sites/st_1/inbox")).toEqual({ area: "inbox", rest: [] });
    expect(workspaceRoute("/sites/st_1/settings/general")).toBeNull();
    expect(workspaceRoute("/sites/st_1")).toBeNull();
    expect(workspacePath("st_1", "orders", "ord 1")).toBe("/sites/st_1/orders/ord%201");
  });
});

describe("repeat rules", () => {
  const start = "2026-11-03T19:00:00-07:00"; // a Tuesday
  it("round-trips weekly, monthly-by-weekday and until rules", () => {
    const weekly = {
      ...defaultRepeat(start),
      byDay: ["TU", "TH"] as const,
      end: { type: "count", count: 10 } as const,
    };
    const rule = toRRule({ ...weekly, byDay: [...weekly.byDay] }, start);
    expect(rule).toBe("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10");
    expect(parseRRule(rule, start)).toMatchObject({
      freq: "WEEKLY",
      byDay: ["TU", "TH"],
      end: { count: 10 },
    });
    const monthly = toRRule(
      { ...defaultRepeat(start), freq: "MONTHLY", monthMode: "weekday" },
      start,
    );
    expect(monthly).toBe("FREQ=MONTHLY;BYDAY=1TU");
    const until = toRRule(
      { ...defaultRepeat(start), end: { type: "until", date: "2027-01-31" } },
      start,
    );
    expect(until).toBe("FREQ=WEEKLY;BYDAY=TU;UNTIL=20270131T235959Z");
    expect(parseRRule(until, start)?.end).toMatchObject({ type: "until", date: "2027-01-31" });
    // Every rule the editor writes is one the schema accepts.
    for (const r of [rule, monthly, until]) {
      const item = {
        kind: "events",
        slug: "x",
        frontmatter: { title: "X", status: "draft", start, recurrence: r },
        body: "",
      };
      expect(CollectionItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it("writes all-day UNTIL as a date and doesn't add the start's weekday", () => {
    const allDay = "2026-11-03"; // a Tuesday
    expect(toRRule({ ...defaultRepeat(allDay), byDay: ["FR"] }, allDay)).toBe(
      "FREQ=WEEKLY;BYDAY=FR",
    );
    expect(
      toRRule({ ...defaultRepeat(allDay), end: { type: "until", date: "2026-12-31" } }, allDay),
    ).toBe("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231");
    const item = {
      kind: "events",
      slug: "x",
      frontmatter: {
        title: "X",
        status: "draft",
        start: allDay,
        allDay: true,
        recurrence: "FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231",
      },
      body: "",
    };
    expect(CollectionItemSchema.safeParse(item).success).toBe(true);
  });

  it("tells simple rules from custom ones and keeps unmodeled parts when edited", () => {
    const tue = "2026-11-03T19:00:00-07:00";
    for (const simple of [
      "FREQ=WEEKLY;BYDAY=TU",
      "FREQ=WEEKLY",
      "FREQ=WEEKLY;BYDAY=TH,TU;COUNT=4",
      "FREQ=MONTHLY",
      "FREQ=MONTHLY;BYMONTHDAY=3",
      "FREQ=MONTHLY;BYDAY=1TU",
      "FREQ=DAILY;INTERVAL=1;UNTIL=20261231T060000Z",
      "FREQ=WEEKLY;BYDAY=TU;WKST=SU",
    ])
      expect(isSimpleRule(simple, tue), simple).toBe(true);
    for (const custom of [
      "FREQ=MONTHLY;BYMONTHDAY=15",
      "FREQ=MONTHLY;BYDAY=-1TU",
      "FREQ=MONTHLY;BYDAY=1TU,3TU",
      "FREQ=YEARLY;BYMONTH=6;BYDAY=2SU",
      "FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2",
    ])
      expect(isSimpleRule(custom, tue), custom).toBe(false);
    // Editing a simple rule keeps WKST and the exact UNTIL time.
    const r = parseRRule("FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T060000Z;WKST=SU", tue);
    if (!r) throw new Error("no rule");
    expect(toRRule({ ...r, interval: 2 }, tue)).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20261231T060000Z;WKST=SU",
    );
  });

  it("matches UNTIL to the start's value type", () => {
    expect(matchUntilType("FREQ=WEEKLY;UNTIL=20261231T060000Z;COUNT=3", "2026-11-03")).toBe(
      "FREQ=WEEKLY;UNTIL=20261231;COUNT=3",
    );
    expect(matchUntilType("FREQ=WEEKLY;UNTIL=20261231", "2026-11-03T18:00:00-07:00")).toBe(
      "FREQ=WEEKLY;UNTIL=20261231T235959Z",
    );
    expect(matchUntilType("FREQ=DAILY", "2026-11-03")).toBe("FREQ=DAILY");
  });

  it("moves rules that followed the first date, and leaves the rest alone", () => {
    const tue = "2026-11-03";
    const wed = "2026-11-04";
    expect(retargetRule("FREQ=WEEKLY;BYDAY=TU;COUNT=5", tue, wed)).toBe(
      "FREQ=WEEKLY;BYDAY=WE;COUNT=5",
    );
    expect(retargetRule("FREQ=WEEKLY;BYDAY=TU,TH", tue, wed)).toBe("FREQ=WEEKLY;BYDAY=TU,TH");
    expect(retargetRule("FREQ=MONTHLY;BYDAY=1TU", tue, "2026-11-11")).toBe(
      "FREQ=MONTHLY;BYDAY=2WE",
    );
    expect(retargetRule("FREQ=MONTHLY;BYMONTHDAY=3;BYMONTH=6", tue, wed)).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=4;BYMONTH=6",
    );
    expect(retargetRule("FREQ=MONTHLY;BYDAY=-1TU", tue, wed)).toBe("FREQ=MONTHLY;BYDAY=-1TU");
  });

  it("describes rules in plain words and lists the next dates", () => {
    const r = parseRRule("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=3", start);
    if (!r) throw new Error("no rule");
    expect(describeRepeat(r, start)).toBe("Every week on Tuesday and Thursday, 3 times");
    expect(nextDates(r, start, 5)).toEqual(["2026-11-03", "2026-11-05", "2026-11-10"]);
    const m = parseRRule("FREQ=MONTHLY;BYDAY=1TU", start);
    if (!m) throw new Error("no rule");
    expect(describeRepeat(m, start)).toBe("Every month on the first Tuesday");
    expect(nextDates(m, start, 3)).toEqual(["2026-11-03", "2026-12-01", "2027-01-05"]);
    const every2 = parseRRule("FREQ=DAILY;INTERVAL=2", "2026-11-03");
    if (!every2) throw new Error("no rule");
    expect(describeRepeat(every2, "2026-11-03")).toBe("Every 2 days");
    expect(nextDates(every2, "2026-11-03", 3)).toEqual(["2026-11-03", "2026-11-05", "2026-11-07"]);
  });
});

describe("product variants", () => {
  it("builds every combination and keeps settings for combinations that stay", () => {
    const options = [
      { name: "Size", values: ["S", "M"] },
      { name: "Color", values: ["Sage", "Clay"] },
    ];
    expect(combinations(options)).toHaveLength(4);
    expect(suggestSku("TEE", { Size: "M", Color: "Sage green" })).toBe("TEE-M-SAGE-GREEN");
    const first = syncVariants(options, [], "TEE");
    const priced = first.map((v) =>
      v.options.Size === "M" ? { ...v, price: { amount: 3000, currency: "USD" } } : v,
    );
    const next = syncVariants(
      [
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Sage"] },
      ],
      priced,
      "TEE",
    );
    expect(next).toHaveLength(2);
    expect(next.find((v) => v.options.Size === "M")?.price?.amount).toBe(3000);
  });
});

describe("collection items", () => {
  it("finds collections and their kinds from settings, items or folder names", () => {
    const doc = demoDoc();
    expect(listCollections(doc).map((c) => [c.name, c.kind])).toEqual([
      ["journal", "blog"],
      ["events", "events"],
      ["podcast", "podcast"],
      ["shop", "products"],
    ]);
    expect(kindOf({ ...doc, collectionConfigs: {} } as SiteDocument, "work")).toBe("portfolio");
  });

  it("creates valid new items of every kind except episodes without audio", () => {
    const doc = demoDoc();
    for (const kind of ["blog", "events", "portfolio", "products"] as const) {
      const item = newItem(doc, "x", kind, { now: NOW });
      expect(itemProblems(item), kind).toEqual([]);
    }
    const ep = newItem(doc, "podcast", "podcast", { now: NOW });
    expect(ep.kind === "podcast" && ep.frontmatter.episode).toBe(13);
    expect(itemProblems(ep).map((p) => p.field)).toEqual(
      expect.arrayContaining(["Audio file", "Length"]),
    );
  });

  it("explains problems in plain words", () => {
    const item = { ...newItem(demoDoc(), "journal", "blog", { now: NOW }) } as CollectionItem;
    item.frontmatter = { ...item.frontmatter, title: "", status: "scheduled" };
    const problems = itemProblems(item);
    expect(problems).toEqual(
      expect.arrayContaining([
        { field: "Title", message: "Give it a title." },
        { field: "Publish date", message: "Pick when it should go live." },
      ]),
    );
  });

  it("fills slug patterns and keeps addresses unique", () => {
    expect(slugFromPattern("{date}-{title}", "Opening Day!", "2026-10-26")).toBe(
      "2026-10-26-opening-day",
    );
    expect(slugFromPattern(undefined, "Café & Tea", "2026-10-26")).toBe("cafe-and-tea");
    const doc = demoDoc();
    expect(newItem(doc, "journal", "blog", { title: "Slow mornings", now: NOW }).slug).toBe(
      "slow-mornings-2",
    );
    expect(uniqueCollectionName(doc, "Journal")).toBe("journal-2");
  });

  it("saves through ops the room accepts, with a redirect when a live address changes", () => {
    const doc = demoDoc();
    const item = structuredClone(doc.collections.journal?.["slow-mornings"]) as CollectionItem;
    item.slug = "starting-slow";
    const next = apply(doc, saveItemOps(doc, "journal", item, "slow-mornings"));
    expect(next.collections.journal?.["slow-mornings"]).toBeUndefined();
    expect(next.collections.journal?.["starting-slow"]?.frontmatter.title).toBe(
      item.frontmatter.title,
    );
    expect(next.site.redirects).toContainEqual({
      from: "/journal/slow-mornings",
      to: "/journal/starting-slow",
      status: 301,
    });
    const withConfig = apply(doc, configOps("work", KIND_META.portfolio.config()));
    expect(withConfig.collectionConfigs?.work?.kind).toBe("portfolio");
  });

  it("filters by status, search, category and upcoming events", () => {
    const doc = demoDoc();
    const posts = Object.values(doc.collections.journal ?? {});
    expect(filterItems(posts, { status: "draft" }, "date-desc", NOW)).toHaveLength(2);
    expect(filterItems(posts, { q: "retreat" }, "date-desc", NOW).map((i) => i.slug)).toEqual([
      "winter-retreat",
      "spring-retreat-recap",
    ]);
    expect(filterItems(posts, { category: "practice" }, "title", NOW)).toHaveLength(2);
    const scheduled = posts.find((p) => p.slug === "winter-retreat") as CollectionItem;
    expect(effectiveStatus(scheduled, NOW)).toBe("scheduled");
    expect(effectiveStatus(scheduled, NOW + 10 * 86_400_000)).toBe("published");
  });
});

describe("review diffs", () => {
  it("lists changed fields and body lines", () => {
    const doc = demoDoc();
    const before = doc.collections.journal?.["slow-mornings"] as CollectionItem;
    const after = structuredClone(before);
    after.frontmatter.title = "Starting slow";
    after.body = before.body.replace("It surprises people.", "People are surprised.");
    expect(fieldChanges(before, after)).toEqual([
      { key: "title", label: "Title", before: before.frontmatter.title, after: "Starting slow" },
    ]);
    const lines = diffLines(before.body, after.body);
    expect(lines.filter((l) => l.kind === "remove")).toHaveLength(1);
    expect(lines.filter((l) => l.kind === "add")[0]?.text).toContain("People are surprised.");
  });
});

describe("shipping labels", () => {
  it("keeps a weight band label within the Hub's 60 characters", () => {
    expect(bandLabel("Standard", "up to 2 kg")).toBe("Standard (up to 2 kg)");
    const long = bandLabel("x".repeat(80), "up to 20 kilograms ok");
    expect(long.length).toBeLessThanOrEqual(LABEL_MAX);
    expect(long.endsWith("(up to 20 kilograms o)")).toBe(true);
  });
});

describe("formatting", () => {
  it("handles money in minor units, durations and chart ticks", () => {
    expect(money(2400, "USD", "en-US")).toBe("$24.00");
    expect(money(500, "JPY", "en-US")).toBe("¥500");
    expect(parseMoney("24.5", "USD")).toBe(2450);
    expect(parseMoney("1,200", "USD")).toBe(120000);
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(duration(2710)).toBe("45:10");
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("45m")).toBe(2700);
    expect(niceTicks(77)).toEqual([0, 20, 40, 60, 80]);
  });
});

describe("email preview", () => {
  it("renders campaign blocks in the browser and can force dark mode", () => {
    const doc = demoDoc();
    const r = previewEmail(doc, {
      subject: "Hello",
      preheader: "News",
      baseUrl: "https://willow.example",
      blocks: [
        {
          id: "blk_a000000000" as never,
          type: "text",
          v: 1,
          fields: {
            content: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Hi there" }] }],
            },
          },
        },
      ],
    });
    expect(r.html).toContain("Hi there");
    expect(r.html).toContain("{{os_unsubscribe}}");
    expect(r.html).toMatch(/prefers-color-scheme:\s*dark/);
    expect(forceDark(r.html)).not.toMatch(/prefers-color-scheme:\s*dark/);
  });
});
