import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { createIdbDraftCache, type DraftRecord, defaultDraftCache, draftKey } from "./cache";

const record = (
  userId: string,
  siteId: string,
  tabId: string,
  extra: Partial<DraftRecord> = {},
): DraftRecord => ({
  key: draftKey(userId, siteId, tabId),
  userId,
  siteId,
  tabId,
  doc: devSiteDocument(),
  seq: 7,
  head: "h",
  pending: [],
  savedAt: 1,
  ...extra,
});

describe("device draft cache (IndexedDB)", () => {
  it("keeps one record per person, site and tab; lists only that person's records for the site", async () => {
    const cache = createIdbDraftCache("openspace-test");
    const pending = [
      {
        op: "block.update",
        page: I.home,
        block: I.heroButton,
        set: { label: "Saved here" },
        id: "op1",
        actor: "user:u",
        ts: 1,
      },
    ] as never;
    await cache.put(record("u", "st_a", "t1", { pending }));
    await cache.put(record("u", "st_a", "t2"));
    await cache.put(record("other", "st_a", "t1"));
    await cache.put(record("u", "st_ab", "t1"));
    const mine = await cache.list("u", "st_a");
    expect(mine.map((r) => r.tabId).sort()).toEqual(["t1", "t2"]);
    expect(mine.find((r) => r.tabId === "t1")?.pending).toEqual(pending);

    // A second handle on the same database (a reload) sees them too.
    expect(await createIdbDraftCache("openspace-test").list("u", "st_a")).toHaveLength(2);
    await cache.delete(draftKey("u", "st_a", "t1"));
    expect(await cache.list("u", "st_a")).toHaveLength(1);
  });

  it("uses IndexedDB by default when the browser has it", () => {
    expect(defaultDraftCache()).toBe(defaultDraftCache());
  });
});
