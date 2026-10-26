import { applyAll, validate } from "@openspace/ops";
import type { Page, SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { btn, h, img, p, page, siteWith, stackSection } from "./__fixtures__/doc";
import { designCheck, effectiveTitle, type Issue, seoCheck } from "./index";

const LONG_TEXT =
  "Small, unhurried yoga classes on Pearl Street in Boulder. Foundations on Saturday mornings for complete beginners, vinyasa four evenings a week and a slow yin class on Sunday nights. Mats, blocks and blankets are provided, and every teacher knows your name by the second class. Come ten minutes early for tea.";

function goodPage(): Page {
  return page(
    "Classes",
    "classes",
    [
      stackSection([
        h("Yoga classes in Boulder", 1),
        p(LONG_TEXT),
        p(LONG_TEXT.replace("Small", "Our")),
        img(),
        btn("See the class timetable"),
      ]),
    ],
    {
      seo: {
        description:
          "Small yoga classes in Boulder for every body: beginner foundations, evening vinyasa and Sunday yin.",
        image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200",
      },
    },
  );
}

const rules = (i: Issue[]) => i.map((x) => x.rule);
function fix(doc: SiteDocument, i: Issue | undefined): SiteDocument {
  expect(i?.autofix).toBeDefined();
  let next = doc;
  for (const op of i?.autofix?.ops ?? []) {
    const v = validate(next, op);
    expect(v.ok ? [] : v.errors).toEqual([]);
    next = applyAll(next, [op]);
  }
  return next;
}
const pageOf = (doc: SiteDocument, id: string) => doc.pages[id as Page["id"]] as Page;

describe("seoCheck", () => {
  it("a well-described page passes", () => {
    const pg = goodPage();
    expect(seoCheck(pg, siteWith([pg]))).toEqual([]);
  });

  it("flags a missing description and fills it from the first paragraph", () => {
    const pg = goodPage();
    delete pg.seo;
    const doc = siteWith([pg]);
    const issue = seoCheck(pg, doc).find((i) => i.rule === "seo-description-missing");
    expect(issue?.severity).toBe("warning");
    const fixed = fix(doc, issue);
    const desc = pageOf(fixed, pg.id).seo?.description ?? "";
    expect(desc.length).toBeLessThanOrEqual(155);
    expect(desc.startsWith("Small, unhurried yoga")).toBe(true);
    expect(rules(seoCheck(pageOf(fixed, pg.id), fixed))).not.toContain("seo-description-missing");
  });

  it("downgrades a missing page description to info when the site has a default", () => {
    const pg = goodPage();
    delete pg.seo;
    const doc = siteWith([pg]);
    doc.site.seo = {
      description: "Slow, grounded yoga in Boulder, Colorado — small classes for every body.",
    };
    expect(seoCheck(pg, doc).find((i) => i.rule === "seo-description-missing")?.severity).toBe(
      "info",
    );
  });

  it("flags descriptions that are too short or long, and duplicates", () => {
    const a = goodPage();
    const b = { ...goodPage(), slug: "b", title: "Other" };
    b.seo = { ...a.seo };
    const doc = siteWith([a, b]);
    expect(rules(seoCheck(a, doc))).toContain("seo-description-duplicate");
    a.seo = { description: "Yoga." };
    expect(rules(seoCheck(a, doc))).toContain("seo-description-length");
  });

  it("flags long and duplicate titles, applying the site's title template", () => {
    const a = goodPage();
    const b = { ...goodPage(), slug: "b" };
    const doc = siteWith([a, b]);
    doc.site.seo = { titleTemplate: "%s — Juniper Yoga" };
    expect(effectiveTitle(a, doc)).toBe("Classes — Juniper Yoga");
    expect(rules(seoCheck(a, doc))).toContain("seo-title-duplicate");
    a.title = "Every single class we teach at our studio, from beginners to advanced";
    expect(rules(seoCheck(a, doc))).toContain("seo-title-long");
  });

  it("leaves Heading 1 problems to designCheck (one owner)", () => {
    const pg = goodPage();
    pg.sections = [stackSection([h("Classes"), p(LONG_TEXT), p(LONG_TEXT), btn()])];
    const doc = siteWith([pg]);
    expect(rules(seoCheck(pg, doc)).filter((r) => r.includes("h1"))).toEqual([]);
    expect(designCheck(doc).map((i) => i.rule)).toContain("heading-missing-h1");
  });

  it("treats an empty SEO description like a missing one", () => {
    const pg = goodPage();
    pg.seo = { ...pg.seo, description: "" };
    expect(rules(seoCheck(pg, siteWith([pg])))).toContain("seo-description-missing");
  });

  it("suggests a share image from the page's first photo", () => {
    const pg = goodPage();
    if (pg.seo) delete pg.seo.image;
    const doc = siteWith([pg]);
    const issue = seoCheck(pg, doc).find((i) => i.rule === "seo-share-image");
    const fixed = fix(doc, issue);
    expect(pageOf(fixed, pg.id).seo?.image).toMatch(/^https:\/\/images\.unsplash\.com/);
  });

  it("notes thin content, missing alt text and vague button labels", () => {
    const pg = goodPage();
    pg.sections = [
      stackSection([h("Classes", 1), p("Come along."), img(undefined, ""), btn("Click here")]),
    ];
    const r = rules(seoCheck(pg, siteWith([pg])));
    expect(r).toEqual(
      expect.arrayContaining(["seo-thin-content", "seo-image-alt", "seo-link-text"]),
    );
  });

  it("notes hidden-from-search pages and can reverse it", () => {
    const pg = goodPage();
    pg.seo = { ...pg.seo, noindex: true };
    const doc = siteWith([pg]);
    const issue = seoCheck(pg, doc).find((i) => i.rule === "seo-noindex");
    expect(issue?.severity).toBe("info");
    const fixed = fix(doc, issue);
    expect(pageOf(fixed, pg.id).seo?.noindex).toBeUndefined();
  });
});
