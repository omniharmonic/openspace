import { textBlock } from "@omniharmonic/openspace-blocks";
import type { PhoneProbeResult } from "@omniharmonic/openspace-lint";
import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import type { PhoneMeasureRequest } from "./store";
import { meadowDoc, setup } from "./test-helpers";

/** A doc whose home page has a stack section with phone columns squeezing text. */
async function squeezedDoc(): Promise<{ doc: SiteDocument; page: Page; section: string }> {
  const doc = await meadowDoc();
  const page = Object.values(doc.pages).find((p) => p.slug === "") as Page;
  const section = page.sections.find((s) => s.layout.mode === "stack") as Page["sections"][number];
  if (section.layout.mode !== "stack") throw new Error("stack");
  section.layout.columns = { d: [6, 6], m: [4, 8] };
  const long =
    "We keep classes small so every teacher knows every name, and we start every class slowly enough that nobody gets left behind on the first morning of the week.";
  section.blocks.push({
    ...textBlock.create({
      fields: {
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: long }] }],
        } as never,
      },
    }),
    column: 0,
  });
  return { doc, page, section: section.id };
}

describe("phone_check / fix_for_phones", () => {
  it("runs the static phone rules without a browser and says so", async () => {
    const { doc } = await squeezedDoc();
    const { rpc } = await setup({ doc });
    const r = (await rpc.call("phone_check", {})).data;
    expect(r.rendered).toBe(false);
    expect(r.note).toMatch(/browser/);
    expect(r.issues.some((i: { rule: string }) => i.rule === "phone-columns")).toBe(true);
    expect(r.next).toMatch(/fix_for_phones/);
  });

  it("measures pages at 360 and 390 px where the store can, and fixes everything for phones", async () => {
    const { doc, page } = await squeezedDoc();
    const seen: PhoneMeasureRequest[] = [];
    const measurePhone = async (
      _site: string,
      req: PhoneMeasureRequest,
    ): Promise<PhoneProbeResult> => {
      seen.push(req);
      return {
        width: req.width,
        height: 780,
        scrollWidth: req.width,
        findings:
          req.pageId === page.id
            ? [
                {
                  kind: "tap-target",
                  area: "footer",
                  tag: "a",
                  text: "Privacy",
                  value: 20,
                  limit: 44,
                },
              ]
            : [],
      };
    };
    const { rpc, store, siteId } = await setup({ doc, store: { measurePhone } });
    const r = (await rpc.call("phone_check", { page: page.id })).data;
    expect(r.rendered).toBe(true);
    expect(seen.map((s) => s.width)).toEqual([360, 390]);
    expect(seen[0]?.html).toContain("<main");
    expect(r.issues.map((i: { rule: string }) => i.rule)).toEqual(
      expect.arrayContaining(["phone-columns", "phone-tap-target"]),
    );

    const fixed = (await rpc.call("fix_for_phones", { page: page.id })).data;
    expect(fixed.fixed).toContain("Stack the columns on phones");
    // The tap target has no automatic fix: it stays, explained.
    expect(fixed.issues.map((i: { rule: string }) => i.rule)).toEqual(["phone-tap-target"]);
    const after = await store.getDocument(siteId);
    const sec = Object.values(after.pages)
      .find((p) => p.id === page.id)
      ?.sections.find((s) => s.layout.mode === "stack" && s.layout.columns.d.join() === "6,6");
    expect(sec?.layout.mode === "stack" && sec.layout.columns.m).toEqual([12]);
  });
});
