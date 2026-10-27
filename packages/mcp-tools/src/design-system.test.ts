import { compileStyles } from "@omniharmonic/openspace-theme";
import { describe, expect, it } from "vitest";
import { setup } from "./test-helpers";

describe("design system tools", () => {
  it("describes a site without a record from its Site Styles", async () => {
    const { rpc } = await setup();
    const r = (await rpc.call("get_design_system")).data;
    expect(r.note).toMatch(/no design-system record yet/);
    expect(r.designSystem.tokens.fonts.heading.family).toBeTruthy();
    expect(r.guidance).toMatch(/Keep to the design system/);
  });

  it("reads a token file into the record and restyles the site from it", async () => {
    const { rpc, store, siteId } = await setup();
    const r = (
      await rpc.call("update_design_system", {
        changes: { brief: { about: "A riverside bakery", feeling: ["warm", "unhurried"] } },
        tokens: {
          color: { cream: "#fbf3e6", cocoa: "#3b2416", primary: "#b5532a" },
          font: { heading: "'Fraunces', serif", body: "'Work Sans', sans-serif" },
          radius: "999px",
        },
        applyToStyles: true,
      })
    ).data;
    expect(r.designSystem.brief.about).toBe("A riverside bakery");
    expect(r.designSystem.tokens.colors.cream.role).toBe("background");
    expect(r.designSystem.mapping.notes.join(" ")).toMatch(/brand colour/);
    const doc = await store.getDocument(siteId);
    expect(doc.designSystem?.sources?.[0]?.kind).toBe("tokens");
    expect(doc.styles.choices.palette.brand).toBe("#b5532a");
    expect(doc.styles.choices.buttons).toMatch(/^pill/);
    const light = compileStyles(doc.styles).tokens.themes.light;
    expect(light.background).toBe("#fbf3e6");
    expect(compileStyles(doc.styles).contrast.failures).toEqual([]);
    const again = (await rpc.call("get_design_system")).data;
    expect(again.note).toBeUndefined();
  });

  it("explains a file without tokens", async () => {
    const { rpc } = await setup();
    const r = await rpc.callError("update_design_system", { tokens: { hello: "world" } });
    expect(JSON.stringify(r)).toMatch(/couldn't find any colours/);
  });
});
