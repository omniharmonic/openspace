import type { Block, SiteDocument } from "@omniharmonic/openspace-schema";
import { newId } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { page, siteWith, stackSection } from "./__fixtures__/doc";
import { designCheck, gatedPageLinks, isGatedPage, publishCheck } from "./index";

const donation = (): Block =>
  ({
    id: newId("blk"),
    type: "donation",
    v: 1,
    fields: {},
  }) as unknown as Block;

function site(target: "github-pages" | "cloudflare") {
  const members = page("Members", "members", [stackSection([])]);
  const home = page("Home", "", [stackSection([donation()])]);
  const doc = siteWith([home, members]);
  doc.site.nav = [{ type: "page", page: members.id }];
  doc.config.deploy.target = target;
  return { doc: doc as SiteDocument, home, members };
}

describe("GitHub Pages hosting", () => {
  it("treats /members and access-restricted pages as members-only", () => {
    expect(isGatedPage({ slug: "members" })).toBe(true);
    expect(isGatedPage({ slug: "members/videos" })).toBe(true);
    expect(isGatedPage({ slug: "directory", access: { members: true } })).toBe(true);
    expect(isGatedPage({ slug: "directory" })).toBe(false);
  });

  it("warns about links to members-only pages, members-only pages and donation blocks", () => {
    const { doc, home, members } = site("github-pages");
    expect(gatedPageLinks(doc)).toHaveLength(1);
    const issues = designCheck(doc);
    const rules = issues.map((i) => i.rule);
    expect(rules).toContain("gated-link");
    expect(rules).toContain("gated-page");
    expect(issues.find((i) => i.rule === "needs-cloudflare")).toMatchObject({
      severity: "warning",
      page: home.id,
    });
    expect(issues.find((i) => i.rule === "gated-page")?.page).toBe(members.id);
    const check = publishCheck(doc);
    expect(check.errors.filter((e) => e.rule === "link")).toEqual([]);
    expect(check.warnings.map((w) => w.message).join("\n")).toMatch(/members-only page/);
    expect(check.warnings.map((w) => w.message).join("\n")).toMatch(/Donations on Home/);
  });

  it("is quiet on Cloudflare hosting", () => {
    const { doc } = site("cloudflare");
    expect(gatedPageLinks(doc)).toEqual([]);
    const rules = designCheck(doc).map((i) => i.rule);
    expect(rules).not.toContain("gated-link");
    expect(rules).not.toContain("needs-cloudflare");
    expect(publishCheck(doc).warnings).toEqual([]);
  });
});
