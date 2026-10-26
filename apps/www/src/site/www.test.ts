import { blocksRegistry } from "@openspace/blocks";
import { runCheck } from "@openspace/cli";
import { designCheck, seoCheck } from "@openspace/lint";
import { SiteDocumentSchema } from "@openspace/schema";
import { loadSiteDocument } from "@openspace/site-kit/content";
import { templateSpecs } from "@openspace/templates";
import { describe, expect, it } from "vitest";
import { WWW_ROOT } from "./generate";

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
    expect(text(doc.site.nav)).toContain("https://docs.openspace.dev");
    expect(doc.config.deploy).toMatchObject({
      url: "https://openspace.dev",
      customDomain: "openspace.dev",
    });
  });

  it("says the value proposition on the home page", () => {
    const home = text(bySlug(""));
    for (const phrase of ["Make your site — free", "You own it", "Connect your AI", "Templates"])
      expect(home).toContain(phrase);
  });

  it("lists all twelve templates with their looks in the gallery", () => {
    const gallery = text(bySlug("templates"));
    expect(templateSpecs).toHaveLength(12);
    for (const s of templateSpecs) {
      expect(gallery).toContain(`media/templates/${s.id}-looks.png`);
      expect(gallery).toContain(`https://studio.openspace.dev/new/${s.id}`);
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
    expect(report.findings.filter((f) => f.severity !== "info")).toEqual([]);
  });
});
