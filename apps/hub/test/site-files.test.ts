import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { siteFixture } from "../../../packages/schema/src/__fixtures__/site";
import {
  diffSiteFiles,
  isDocumentPath,
  loadSiteDocument,
  pagePathForSlug,
  parseMdoc,
  SiteFilesError,
  serializeMdoc,
  siteDocumentToFiles,
  slugForPagePath,
} from "../src/services/site-files";

function withNestedPages(): SiteDocument {
  const doc = siteFixture();
  const about = Object.values(doc.pages).find((p) => p.slug === "about");
  if (!about) throw new Error("fixture changed");
  const services = {
    ...about,
    id: "pg_5erv1cesxx" as const,
    slug: "services",
    title: "Services",
    sections: [],
  };
  const pricing = {
    ...about,
    id: "pg_pr1cesxxxx" as const,
    slug: "services/pricing",
    title: "Pricing",
    sections: [],
  };
  return { ...doc, pages: { ...doc.pages, [services.id]: services, [pricing.id]: pricing } };
}

describe("page paths", () => {
  it("maps slugs to files and back (folders mirror URLs)", () => {
    const slugs = ["", "about", "services", "services/pricing", "home"];
    expect(pagePathForSlug("", slugs)).toBe("content/pages/home.json");
    expect(pagePathForSlug("about", slugs)).toBe("content/pages/about.json");
    expect(pagePathForSlug("services", slugs)).toBe("content/pages/services/index.json");
    expect(pagePathForSlug("services/pricing", slugs)).toBe("content/pages/services/pricing.json");
    expect(pagePathForSlug("home", slugs)).toBe("content/pages/home/index.json");
    for (const s of slugs) expect(slugForPagePath(pagePathForSlug(s, slugs))).toBe(s);
    expect(slugForPagePath("content/site.json")).toBeNull();
  });
});

describe("Markdoc items", () => {
  it("round-trips frontmatter and body", () => {
    const fm = { title: "Opening day", date: "2026-10-26", tags: ["studio"], publishAt: null };
    const text = serializeMdoc(fm, 'We\'re in.\n\n{% button href="/x" %}Go{% /button %}\n');
    expect(text.startsWith("---\ntitle: Opening day\n")).toBe(true);
    const parsed = parseMdoc(text);
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body).toBe('We\'re in.\n\n{% button href="/x" %}Go{% /button %}\n');
  });
});

describe("SiteDocument <-> files", () => {
  it("round-trips the schema fixture (with nested pages, collections and media)", () => {
    const doc = withNestedPages();
    const files = siteDocumentToFiles(doc);
    expect(Object.keys(files).sort()).toEqual([
      "content/collections/journal/2026-10-26-opening-day.mdoc",
      "content/collections/journal/_collection.json",
      "content/media.json",
      "content/pages/about.json",
      "content/pages/home.json",
      "content/pages/services/index.json",
      "content/pages/services/pricing.json",
      "content/site.json",
      "content/styles.json",
      "openspace.json",
    ]);
    expect(loadSiteDocument(files)).toEqual(doc);
    for (const p of Object.keys(files)) expect(isDocumentPath(p)).toBe(true);
  });

  it("ignores non-document files and reports schema problems", () => {
    const files = { ...siteDocumentToFiles(siteFixture()), "README.md": "# hi", "src/x.astro": "" };
    expect(loadSiteDocument(files).site.title).toBe("Maya Yoga");
    expect(isDocumentPath("README.md")).toBe(false);
    const broken = { ...files, "content/site.json": JSON.stringify({ title: "" }) };
    expect(() => loadSiteDocument(broken)).toThrow(SiteFilesError);
    const missing: Record<string, string> = { ...files };
    delete missing["openspace.json"];
    expect(() => loadSiteDocument(missing)).toThrow(/Missing openspace.json/);
  });

  it("diffs: writes changed files, deletes vanished ones, leaves others alone", () => {
    const doc = siteFixture();
    const current = { ...siteDocumentToFiles(doc), "README.md": "keep" };
    expect(diffSiteFiles(current, doc)).toEqual([]);
    const about = Object.values(doc.pages).find((p) => p.slug === "about");
    if (!about) throw new Error("fixture changed");
    const renamed: SiteDocument = {
      ...doc,
      pages: { ...doc.pages, [about.id]: { ...about, slug: "our-story" } },
    };
    const changes = diffSiteFiles(current, renamed);
    expect(changes).toEqual([
      { path: "content/pages/about.json", content: null },
      { path: "content/pages/our-story.json", content: expect.stringContaining('"our-story"') },
    ]);
  });
});
