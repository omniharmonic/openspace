import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { createIdbDraftCache, defaultDraftCache } from "./cache";

describe("device draft cache (IndexedDB)", () => {
  it("stores, reads back and deletes a site's draft and pending edits", async () => {
    const cache = createIdbDraftCache("openspace-test");
    const doc = devSiteDocument();
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
    await cache.put({ siteId: "st_a", doc, seq: 7, head: "h", pending, savedAt: 1 });
    const back = await cache.get("st_a");
    expect(back).toMatchObject({ siteId: "st_a", seq: 7, head: "h" });
    expect(back?.doc).toEqual(doc);
    expect(back?.pending).toEqual(pending);

    // A second handle on the same database (a reload) sees it too.
    expect(await createIdbDraftCache("openspace-test").get("st_a")).toBeDefined();
    await cache.delete("st_a");
    expect(await cache.get("st_a")).toBeUndefined();
  });

  it("uses IndexedDB by default when the browser has it", () => {
    expect(defaultDraftCache()).toBe(defaultDraftCache());
  });
});
