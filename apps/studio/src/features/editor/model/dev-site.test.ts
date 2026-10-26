import { blocksRegistry } from "@openspace/blocks";
import { validateDocument } from "@openspace/ops";
import { describe, expect, it } from "vitest";
import { devSiteDocument } from "./dev-site";

describe("dev site fixture", () => {
  it("is a valid document whose blocks validate", () => {
    const doc = devSiteDocument();
    const r = validateDocument(doc, { registry: blocksRegistry() });
    expect(r).toMatchObject({ ok: true });
    expect(blocksRegistry().validateDocument(doc)).toEqual([]);
  });
});
