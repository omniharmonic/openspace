import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { HubApi } from "../../api/types";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { loadDraft } from "./bootstrap";
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

describe("device storage that stops answering (Safari after the background)", () => {
  it("fails within the deadline instead of hanging, and reopens on the next call", async () => {
    let opens = 0;
    const real = (await import("idb")).openDB;
    const openDb = ((...args: Parameters<typeof real>) => {
      opens++;
      // The first connection never opens; the next one works.
      return opens === 1 ? new Promise(() => {}) : real(...args);
    }) as typeof real;
    const cache = createIdbDraftCache("openspace-test-stall", { timeoutMs: 30, openDb });
    await expect(cache.list("u1", "s1")).rejects.toThrow(/didn’t answer/);
    await cache.put(record("u1", "s1", "t1"));
    expect(await cache.list("u1", "s1")).toHaveLength(1);
    expect(opens).toBe(2);
  });

  it("a stalled cache doesn't stop the editor from opening from OpenSpace", async () => {
    const stalled = createIdbDraftCache("openspace-test-stall-2", {
      timeoutMs: 30,
      openDb: (() => new Promise(() => {})) as never,
    });
    const doc = devSiteDocument();
    const hub = {
      getRoomDocument: async () => ({ document: doc, seq: 3, head: "h" }),
    } as unknown as HubApi;
    const boot = await loadDraft(hub, stalled, "s1", { userId: "u1", tabId: "t1" });
    expect(boot).toMatchObject({ seq: 3, offline: false });
  });
});
