import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import { runCheck } from "@omniharmonic/openspace-cli";
import { designCheck, seoCheck } from "@omniharmonic/openspace-lint";
import { SiteDocumentSchema } from "@omniharmonic/openspace-schema";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { templateSpecs } from "@omniharmonic/openspace-templates";
import { describe, expect, it } from "vitest";
import { WWW_ROOT } from "./generate";
import { DOCS, PRICES } from "./www";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const doc = await loadSiteDocument(WWW_ROOT);
const pages = Object.values(doc.pages);
const bySlug = (slug: string) => pages.find((p) => p.slug === slug);
const text = (v: unknown) => JSON.stringify(v);

describe("openspace.dev site document", () => {
  it("is a valid OpenSpace site", () => {
    expect(SiteDocumentSchema.safeParse(doc).success).toBe(true);
    expect(blocksRegistry().validateDocument(doc)).toEqual([]);
  });

  it("has home, templates, pricing and about pages, with docs linked from the navigation", () => {
    expect(pages.map((p) => p.slug).sort()).toEqual(["", "about", "pricing", "templates"]);
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
      "how",
      "cost",
      "lockin",
      "claude",
      "features",
      "templates",
      "own",
      "faq",
      "start",
    ]);
    const t = text(home);
    for (const phrase of [
      "A professional website that's yours to keep",
      "Start free",
      "See it on GitHub",
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

  it("runs its three demos as sandboxed Code blocks, not page scripts", () => {
    const embeds = (bySlug("")?.sections ?? []).flatMap((s) =>
      s.blocks.filter((b) => b.type === "embed"),
    );
    expect(embeds).toHaveLength(3);
    for (const b of embeds) {
      expect(b.fields.embed).toMatchObject({ type: "code" });
      expect(String((b.fields.embed as { code: string }).code)).toContain("prefers-reduced-motion");
    }
    expect(doc.site.headInjection ?? "").toBe("");
    expect(doc.site.footerInjection ?? "").toBe("");
  });

  it("lists all twelve templates with their looks in the gallery", () => {
    const gallery = text(bySlug("templates"));
    expect(templateSpecs).toHaveLength(12);
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
