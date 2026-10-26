import { loadSiteDocument } from "@openspace/site-kit/content";
import { blocksRegistry } from "@openspace/blocks";
import { describe, expect, it } from "vitest";
import { MEADOW_DIR, meadowSite, writeMeadowSite } from "./meadow-site";

describe("meadow fixture site", () => {
  it("on disk matches the generator (UPDATE_FIXTURES=1 rewrites it)", async () => {
    if (process.env.UPDATE_FIXTURES) await writeMeadowSite();
    const expected = await meadowSite();
    const loaded = await loadSiteDocument(MEADOW_DIR);
    expect(loaded).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(blocksRegistry().validateDocument(loaded)).toEqual([]);
  }, 60_000);
});
