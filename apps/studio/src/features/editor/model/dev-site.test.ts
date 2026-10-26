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

describe("placeholder document", () => {
  it("is valid", async () => {
    const { placeholderDocument } = await import("./placeholder");
    const r = validateDocument(placeholderDocument());
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});
