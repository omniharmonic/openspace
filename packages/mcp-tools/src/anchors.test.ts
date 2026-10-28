import { findBrokenLinks } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { setup } from "./test-helpers";

/**
 * Boulder Foodshed: Claude set the menu to "How it works / Baskets / Questions" (anchors) but
 * never named the sections, so the header scrolled nowhere. The tools now let Claude name a
 * section as it adds it, and connect menu entries to the section they mean.
 */
describe("menu entries to sections", () => {
  it("names a section as it is added (insert_component / insert_section anchor)", async () => {
    const { rpc, store, siteId } = await setup();
    const c = (
      await rpc.call("insert_component", { page: "/", name: "editorial-hero", anchor: "welcome" })
    ).data;
    const s = (
      await rpc.call("insert_section", { page: "/", preset: "faq/split@1", anchor: "questions" })
    ).data;
    const doc = await store.getDocument(siteId);
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    const anchorOf = (id: string) => home?.sections.find((x) => x.id === id)?.anchor;
    expect(anchorOf(c.section)).toBe("welcome");
    expect(anchorOf(s.section.id)).toBe("questions");
    expect(
      (await rpc.callError("insert_section", { page: "/", preset: "faq/split@1", anchor: "Q&A" }))
        .code,
    ).toBe("invalid_arguments");
  });

  it("update_navigation connects entries to the section they mean, and says so", async () => {
    const { rpc, store, siteId } = await setup();
    const before = await store.getDocument(siteId);
    const home = Object.values(before.pages).find((p) => p.slug === "");
    if (!home) throw new Error("fixture");
    const r = (
      await rpc.call("update_navigation", {
        tree: [
          { type: "page", page: home.id, label: "Newsletter", anchor: "newsletter" },
          { type: "page", page: home.id, label: "Zebras", anchor: "zebras" },
          {
            type: "button",
            label: "Sign up",
            link: { type: "url", url: "/#newsletter" },
            style: "primary",
          },
        ],
      })
    ).data;
    const signup = home.sections.find((s) => s.blocks.some((b) => b.type === "newsletter"));
    expect(r.connected).toEqual([
      { anchor: "newsletter", section: signup?.id, sectionLabel: expect.any(String) },
    ]);
    expect(r.warnings).toEqual([expect.stringMatching(/“zebras”.*update_section.*"anchor"/)]);
    const doc = await store.getDocument(siteId);
    const after = doc.pages[home.id];
    expect(after?.sections.find((s) => s.id === signup?.id)?.anchor).toBe("newsletter");
    expect(findBrokenLinks(doc).map((l) => l.target)).toEqual(["/#zebras"]);
  });

  it("the tool descriptions tell Claude how to link the menu to a section", async () => {
    const { rpc } = await setup();
    const tools = (await rpc.request("tools/list")).tools as Array<{
      name: string;
      description: string;
    }>;
    const nav = tools.find((t) => t.name === "update_navigation");
    expect(nav?.description).toMatch(/anchor/);
    expect(nav?.description).toMatch(/section/);
  });
});
