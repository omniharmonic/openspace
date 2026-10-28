import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import { runCheck } from "@omniharmonic/openspace-cli";
import { designCheck, seoCheck } from "@omniharmonic/openspace-lint";
import { SiteDocumentSchema } from "@omniharmonic/openspace-schema";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { templateSpecs } from "@omniharmonic/openspace-templates";
import { describe, expect, it } from "vitest";
import { WWW_ROOT } from "./generate";
import { DOCS, DONATE, PLANS, PRICES, SIGN_IN, suggestGift } from "./www";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const doc = await loadSiteDocument(WWW_ROOT);
const pages = Object.values(doc.pages);
const bySlug = (slug: string) => pages.find((p) => p.slug === slug);
const text = (v: unknown) => JSON.stringify(v);

describe("openspace.host site document", () => {
  it("is a valid OpenSpace site", () => {
    expect(SiteDocumentSchema.safeParse(doc).success).toBe(true);
    expect(blocksRegistry().validateDocument(doc)).toEqual([]);
  });

  it("has home, templates, pricing, about and support pages, with docs linked from the navigation", () => {
    expect(pages.map((p) => p.slug).sort()).toEqual([
      "",
      "about",
      "pricing",
      "support",
      "templates",
    ]);
    expect(text(doc.site.nav)).toContain(DOCS);
    expect(doc.config.deploy).toMatchObject({
      url: "https://openspace.host",
      customDomain: "openspace.host",
    });
    expect(doc.config.hub).toBe("https://hub.openspace.host");
  });

  it("tells the story on the home page, in order", () => {
    const home = bySlug("");
    expect(home?.sections.map((s) => s.anchor)).toEqual([
      "hero",
      "numbers",
      "move",
      "start-with-claude",
      "why",
      "cost",
      "lockin",
      "how",
      "claude",
      "features",
      "templates",
      "own",
      "support",
      "faq",
      "start",
    ]);
    const t = text(home);
    for (const phrase of [
      "Stop renting your own website",
      "Start free",
      "Move my site",
      "Start with Claude",
      "https://studio.openspace.host/templates",
      "https://github.com/omniharmonic/openspace",
      "Is it ready?",
      "pre-release",
    ])
      expect(t).toContain(phrase);
  });

  it("compares three-year costs from the published prices, with dated sources", () => {
    const cost = text(bySlug("")?.sections.find((s) => s.anchor === "cost"));
    for (const v of Object.values(PRICES)) expect(cost).toContain(`"value":${v * 36}`);
    const notes = text(bySlug("")?.sections.find((s) => s.anchor === "lockin"));
    expect(notes).toContain("27 October 2026");
    for (const src of [
      "https://www.squarespace.com/pricing",
      "https://www.wix.com/plans",
      "https://webflow.com/pricing",
    ])
      expect(notes).toContain(src);
  });

  it("is honest about what needs Cloudflare and Stripe", () => {
    const features = text(bySlug("")?.sections.find((s) => s.anchor === "features"));
    expect(features).toContain("need your site on your own Cloudflare account");
    expect(features.match(/Cloudflare only/g)).toHaveLength(2);
  });

  it("runs its demos and the calculator as sandboxed Code blocks, not page scripts", () => {
    const embeds = [bySlug(""), bySlug("support")]
      .flatMap((p) => p?.sections ?? [])
      .flatMap((s) => s.blocks.filter((b) => b.type === "embed"));
    expect(embeds).toHaveLength(5);
    for (const b of embeds) {
      expect(b.fields.embed).toMatchObject({ type: "code" });
      expect(String((b.fields.embed as { code: string }).code)).toContain("prefers-reduced-motion");
    }
    expect(doc.site.headInjection ?? "").toBe("");
    expect(doc.site.footerInjection ?? "").toBe("");
  });

  it("lets existing users sign in from the header, beside Start free", () => {
    const buttons = doc.site.nav.filter((i) => i.type === "button").map((i) => i.label);
    expect(buttons).toEqual(["Sign in", "Start free"]);
    expect(text(doc.site.nav)).toContain(SIGN_IN);
    expect(SIGN_IN).toBe("https://studio.openspace.host/sites");
  });

  it("Move my site leads to Studio's no-install move; commands are for developers", () => {
    const home = bySlug("");
    const hero = text(home?.sections.find((s) => s.anchor === "hero"));
    expect(hero).toContain("https://studio.openspace.host/move");
    expect(text(home?.sections.find((s) => s.anchor === "start"))).toContain(
      "https://studio.openspace.host/move",
    );
    const move = home?.sections.find((s) => s.anchor === "move");
    const t = text(move);
    // The Studio link comes before any command.
    expect(t.indexOf("https://studio.openspace.host/move")).toBeGreaterThan(-1);
    expect(t.indexOf("https://studio.openspace.host/move")).toBeLessThan(t.indexOf("/plugin"));
    expect(t).toContain("For developers");
    expect(t).toContain("Nothing to install");
  });

  it("centers moving an existing site, with the plugin commands and honest platform scope", () => {
    const move = text(bySlug("")?.sections.find((s) => s.anchor === "move"));
    for (const phrase of [
      "Bring your site home",
      "/plugin marketplace add omniharmonic/openspace",
      "/plugin install openspace@openspace",
      "/openspace:migrate",
      "Squarespace, WordPress, Wix, Webflow or anywhere else",
      "https://docs.openspace.host/guides/migrate-to-openspace/",
    ])
      expect(move).toContain(phrase);
  });

  it("takes donations only through the DONATE links, each listed without JavaScript", () => {
    const all = [...Object.values(DONATE.oneTime), ...Object.values(DONATE.monthly)];
    for (const link of all) expect(link).toMatch(/^https:\/\/(donate|buy)\.stripe\.com\//);
    for (const slug of ["", "support"]) {
      const t = text(bySlug(slug));
      for (const link of all) expect(t, `${slug} lists ${link}`).toContain(link);
      expect(t).toContain("prefers-reduced-motion");
    }
    const support = text(bySlug("support"));
    expect(support).toContain("tax-deductible");
    expect(support).toContain("whether or not you give");
  });

  it("suggests the gift nearest a tenth of what leaving saves", () => {
    expect(PLANS.map((p) => p.monthly)).toEqual(Object.values(PRICES));
    expect(suggestGift(PRICES.squarespaceBasic)).toEqual({ once: 25, monthly: 3 });
    expect(suggestGift(PRICES.webflowEcomPlus)).toEqual({ once: 100, monthly: 5 });
    expect(suggestGift(0)).toEqual({ once: 10, monthly: 3 });
    expect(suggestGift(500)).toEqual({ once: 250, monthly: 20 });
  });

  it("lists every template with its looks in the gallery", () => {
    const gallery = text(bySlug("templates"));
    expect(templateSpecs).toHaveLength(20);
    for (const s of templateSpecs) {
      expect(gallery).toContain(`media/templates/${s.id}-looks.png`);
      expect(gallery).toContain(`https://studio.openspace.host/new/${s.id}`);
      for (const look of s.looks) expect(gallery).toContain(look.name);
    }
  });

  it("states pricing as free, forever, by architecture", () => {
    expect(text(bySlug("pricing"))).toContain("Free, forever — by architecture");
  });

  it("passes the Design check with no errors or warnings", () => {
    const shown = designCheck(doc, undefined, { now: NOW })
      .filter((i) => i.severity !== "info")
      .map((i) => `${i.severity} ${i.rule} ${i.page ?? ""} ${i.section ?? ""}: ${i.message}`);
    expect(shown.join("\n")).toBe("");
  });

  it("passes the SEO check on every page", () => {
    const bad = pages.flatMap((p) =>
      seoCheck(p, doc, { now: NOW })
        .filter((i) => i.severity !== "info")
        .map((i) => `${p.slug || "home"} ${i.rule}: ${i.message}`),
    );
    expect(bad.join("\n")).toBe("");
  });

  it("has no placeholder copy", () => {
    expect(text(doc)).not.toMatch(/lorem|ipsum|TODO|TBD|\{\{/i);
  });

  it("passes `openspace check` (schema, links, images, secrets)", async () => {
    const report = await runCheck(WWW_ROOT);
    expect(report.findings).toEqual([]);
  });
});
