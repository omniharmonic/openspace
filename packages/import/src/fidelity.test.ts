import type { Section } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import {
  colorDistance,
  compareLooks,
  fidelityMarkdown,
  fidelityReport,
  matchSections,
} from "./fidelity/compare";
import { confirmGoogleFonts } from "./fidelity/fonts";
import { applyLayoutHints } from "./fidelity/hints";
import { lookFromProbe } from "./fidelity/look";
import type { LookProbe, ProbeSection, ProbeText } from "./fidelity/probe";
import { lookFromTokens, px } from "./fidelity/tokens";
import { UrlMap } from "./map/urls";
import { stripTags } from "./squarespace/blocks";
import type { SqSite } from "./types";

const t = (family: string, size: number, extra: Partial<ProbeText> = {}): ProbeText => ({
  family,
  size,
  lineHeight: 1.2,
  letterSpacing: 0,
  case: "none",
  weight: 400,
  italic: false,
  ...extra,
});

const section = (heading: string, extra: Partial<ProbeSection> = {}): ProbeSection => ({
  index: 0,
  top: 0,
  height: 600,
  background: "#0f0e0c",
  heading: { ...t("Cormorant Garamond", 60), text: heading, tag: "h2", left: 120 },
  body: t("EB Garamond", 21, { color: "#ede6d8" }),
  columns: 1,
  italicLines: 0,
  text: heading,
  ...extra,
});

/** What a browser measures on a Cormorant / EB Garamond / Montserrat site. */
const ORIGINAL: LookProbe = {
  url: "https://life-culture.github.io/powerwith/",
  viewport: 1440,
  title: "Power With",
  presets: {
    h1: t("Cormorant Garamond", 96, { weight: 500, lineHeight: 1 }),
    h2: t("Cormorant Garamond", 60, { weight: 500, lineHeight: 1.08 }),
    h3: t("Montserrat", 12, { case: "uppercase", letterSpacing: 0.22 }),
    body: t("EB Garamond", 21, { lineHeight: 1.5 }),
    eyebrow: t("Montserrat", 12, { case: "uppercase", letterSpacing: 0.3 }),
    button: t("Montserrat", 12, { case: "uppercase", letterSpacing: 0.22 }),
    nav: t("Montserrat", 12, { letterSpacing: 0.24 }),
  },
  buttons: { radius: 0, border: 0, paddingX: 28 },
  eyebrowRule: true,
  layout: { contentWidth: 1200, left: 120, sectionPadding: 112 },
  sections: [
    section("Power With", {
      eyebrow: { ...t("Montserrat", 12, { case: "uppercase", color: "#c2b8a6" }), text: "A BOOK" },
      rule: true,
      image: { side: "right", widthShare: 0.22, top: 100 },
    }),
    section("The drive that builds companies", {
      columns: 2,
      italicLines: 1,
      background: "#4a1c18",
    }),
    section("Ten capacities", { columns: 5 }),
  ],
  height: 9000,
};

describe("design-token files", () => {
  it("reads sizes in any unit", () => {
    expect(px("96px")).toBe(96);
    expect(px("1.5rem")).toBe(24);
    expect(px("clamp(40px, 5vw, 60px)")).toBe(60);
    expect(px(12)).toBe(12);
  });

  it("maps fonts per role, the type ladder, labels and rhythm", () => {
    const look = lookFromTokens({
      font: {
        display: "'Cormorant Garamond', Georgia, serif",
        body: "'EB Garamond', Georgia, serif",
        label: "Montserrat, Helvetica, Arial, sans-serif",
        weights: { display: 500, body: 400, label: 400, labelLarge: 300 },
      },
      type: {
        "display-xl": { desktop: "96px", mobile: "58px", lineHeight: 1.0, font: "display" },
        "display-lg": { desktop: "76px", mobile: "44px", lineHeight: 1.02, font: "display" },
        "display-md": { desktop: "60px", mobile: "40px", lineHeight: 1.08, font: "display" },
        "display-sm": { desktop: "34px", mobile: "27px", lineHeight: 1.2, font: "display" },
        quote: { desktop: "30px", mobile: "23px", lineHeight: 1.25, font: "display" },
        "body-lg": { desktop: "21px", mobile: "19px", lineHeight: 1.5, font: "body" },
        "body-sm": { desktop: "17px", mobile: "16px", lineHeight: 1.45, font: "body" },
        label: { desktop: "12px", mobile: "11px", letterSpacing: "0.30em", transform: "uppercase" },
        button: { desktop: "12px", letterSpacing: "0.22em", transform: "uppercase" },
        wordmark: { desktop: "14px", letterSpacing: "0.32em", transform: "uppercase" },
      },
      space: {
        contentMax: "1200px",
        sectionPadDesktop: "112px",
        sectionPadMobile: "56px",
        ruleHeight: "2px",
      },
      grounds: { a: { text: "bone", label: "stone" }, b: { text: "bone", label: "stone" } },
    });
    expect(look?.fonts).toEqual({
      heading: "Cormorant Garamond",
      body: "EB Garamond",
      label: "Montserrat",
    });
    const s = look?.typography.scale ?? {};
    expect([s.display?.size, s.h1?.size, s.h2?.size, s.h3?.size]).toEqual([96, 76, 60, 34]);
    expect(s.h2?.weight).toBe(500);
    expect(s.lead).toMatchObject({ size: 30, font: "heading" });
    expect(s.body).toMatchObject({ size: 21, sizeMobile: 19 });
    expect(s.small?.size).toBe(17);
    expect(s.eyebrow).toMatchObject({
      size: 12,
      letterSpacing: 0.3,
      case: "uppercase",
      font: "label",
    });
    expect(s.wordmark).toMatchObject({ size: 14, letterSpacing: 0.32, font: "label" });
    expect(look?.typography.label?.weights).toEqual([300, 400]);
    expect(look?.typography.eyebrowColor).toBe("muted");
    expect(look?.layout).toEqual({
      contentWidth: 1200,
      sectionPadding: 112,
      sectionPaddingMobile: 56,
    });
    expect(look?.eyebrowRule).toBe(true);
  });

  it("returns nothing for a token file without type or rhythm", () => {
    expect(lookFromTokens({ color: { ink: "#000000" } })).toBeUndefined();
  });
});

describe("a measured look", () => {
  it("becomes fonts per role, a type scale and the rhythm", () => {
    const mobile: LookProbe = {
      ...ORIGINAL,
      viewport: 390,
      presets: { ...ORIGINAL.presets, h1: t("Cormorant Garamond", 58), body: t("EB Garamond", 19) },
      layout: { contentWidth: 350, left: 20, sectionPadding: 56 },
    };
    const look = lookFromProbe(ORIGINAL, mobile);
    expect(look?.fonts).toEqual({
      heading: "Cormorant Garamond",
      body: "EB Garamond",
      label: "Montserrat",
    });
    const s = look?.typography.scale ?? {};
    expect(s.h1).toMatchObject({ size: 96, sizeMobile: 58, weight: 500 });
    // A small-caps h3 is a label, not a heading size: the ladder is filled instead.
    expect(s.h3?.size).toBeGreaterThan(30);
    expect(s.eyebrow).toMatchObject({ case: "uppercase", letterSpacing: 0.3, font: "label" });
    expect(s.nav?.sizeMobile).toBeUndefined();
    expect(look?.layout).toEqual({
      contentWidth: 1200,
      sectionPadding: 112,
      sectionPaddingMobile: 56,
      gutter: 32,
      gutterMobile: 20,
    });
    expect(look?.eyebrowRule).toBe(true);
  });
});

describe("Google Fonts", () => {
  it("confirms families Google serves and curated-pairing families offline", async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      return /EB\+Garamond/.test(url)
        ? new Response("@font-face { font-family: 'EB Garamond'; }")
        : new Response("Bad request", { status: 400 });
    }) as unknown as typeof fetch;
    const ok = await confirmGoogleFonts(
      ["EB Garamond", "Freight Text Pro", "Fraunces", "x;y"],
      fake,
    );
    expect(ok).toEqual(["eb garamond", "fraunces"]);
    expect(asked.some((u) => u.includes("Fraunces"))).toBe(false);
  });
});

describe("fidelity comparison", () => {
  const imported: LookProbe = {
    ...ORIGINAL,
    url: "http://127.0.0.1/",
    presets: {
      ...ORIGINAL.presets,
      h1: t("Cormorant Garamond", 48),
      body: t("Jost", 16),
      button: t("Jost", 16),
    },
    layout: { contentWidth: 1280, left: 80, sectionPadding: 120 },
    sections: [
      section("Power With", {
        eyebrow: { ...t("Jost", 12), text: "A BOOK" },
        image: { side: "right", widthShare: 0.4, top: 0 },
      }),
      section("The drive that builds companies", { background: "#321409" }),
      section("Ten capacities", { columns: 3 }),
    ],
  };

  it("names each difference and the setting that closes it", () => {
    const cmp = compareLooks(ORIGINAL, imported, "/");
    const fail = (what: string) => cmp.checks.find((c) => c.what === what);
    expect(fail("Heading 1 size")).toMatchObject({
      ok: false,
      fix: "choices.typography.scale.h1.size = 96",
    });
    expect(fail("Body font")).toMatchObject({
      ok: false,
      original: "EB Garamond",
      imported: "Jost",
    });
    expect(fail("Heading font")?.ok).toBe(true);
    expect(fail("Content width")).toMatchObject({
      ok: false,
      fix: "choices.layout.contentWidth = 1200",
    });
    expect(cmp.checks.some((c) => c.what === "Heading 3 size")).toBe(false);
    const [hero, pattern, grid] = cmp.sections;
    expect(hero?.checks.find((c) => c.what === "Eyebrow and rule")?.ok).toBe(false);
    expect(hero?.checks.find((c) => c.what === "Image placement")?.ok).toBe(false);
    expect(pattern?.checks.find((c) => c.what === "Columns")?.ok).toBe(false);
    expect(pattern?.checks.find((c) => c.what === "Italic lines")?.ok).toBe(false);
    expect(pattern?.checks.find((c) => c.what === "Background")?.ok).toBe(false);
    expect(grid?.checks.find((c) => c.what === "Columns")).toMatchObject({
      original: "5",
      imported: "3",
    });
    expect(cmp.score).toBeLessThan(80);
    expect(compareLooks(ORIGINAL, ORIGINAL, "/").score).toBe(100);
    const md = fidelityMarkdown(fidelityReport([cmp]), {
      images: { "/@1440": ["sbs-home-d-0.png"] },
    });
    expect(md).toContain("![side by side](sbs-home-d-0.png)");
    expect(md).toContain("choices.typography.scale.h1.size = 96");
  });

  it("matches sections by heading, then words, then position", () => {
    const o = [
      section("Alpha"),
      section("", { heading: undefined, text: "All Tops Bottoms" }),
      section("Gamma"),
    ];
    const i = [
      section("Alpha"),
      section("", { heading: undefined, text: "Haori Jacket $50" }),
      section("Gamma"),
    ];
    expect(matchSections(o, i)).toEqual([0, 1, 2]);
    expect(matchSections([section("Alpha"), section("Missing")], [section("Alpha")])).toEqual([
      0,
      undefined,
    ]);
    expect(colorDistance("#4a1c18", "#4a1c18")).toBe(0);
    expect(colorDistance("#ffffff", "#000000")).toBeGreaterThan(200);
  });
});

describe("layout hints", () => {
  it("gives card grids the original's columns and an image its share of the width", () => {
    const heading = (text: string) => ({
      id: "blk_h",
      type: "heading",
      v: 1,
      fields: { text, level: "h2" },
    });
    const sections = [
      {
        id: "sec_a",
        layout: { mode: "stack", columns: { d: [7, 5] } },
        style: {},
        blocks: [
          { ...heading("Power With"), column: 0 },
          { id: "blk_i", type: "image", v: 1, fields: {}, column: 1 },
        ],
      },
      {
        id: "sec_b",
        layout: { mode: "stack", columns: { d: [12] } },
        style: {},
        blocks: [
          heading("Ten capacities"),
          {
            id: "blk_c",
            type: "columns",
            v: 1,
            fields: { items: Array(10).fill({}), columns: "4" },
          },
        ],
      },
    ] as unknown as Section[];
    const changed = applyLayoutHints(sections, {
      viewport: 1440,
      contentWidth: 1200,
      sections: ORIGINAL.sections,
    });
    expect(sections[0]?.layout.mode === "stack" && sections[0].layout.columns.d).toEqual([9, 3]);
    expect(sections[1]?.blocks[1]?.fields.columns).toBe("5");
    expect(changed).toHaveLength(2);
  });
});

describe("Squarespace stores", () => {
  it("keeps words apart across blocks and names variant products by their whole path", () => {
    expect(
      stripTags("<pre><code>DESCRIPTION</code></pre><p>Lorem.</p><ul><li><p>Cotton</p></li></ul>"),
    ).toBe("DESCRIPTION Lorem. Cotton");
    const site = {
      baseUrl: "https://shop.example",
      pages: [],
      collections: [
        {
          path: "/shop",
          kind: "products",
          title: "Shop",
          items: [
            { path: "/shop/p/lounge-tunic", title: "Lounge Tunic" },
            { path: "/shop/p/lounge-tunic-/-blue", title: "Lounge Tunic / Blue" },
            { path: "/shop/p/wide-pant-/-blue", title: "Wide Pant / Blue" },
          ],
        },
      ],
      aliases: [],
    } as unknown as SqSite;
    const urls = new UrlMap(site);
    expect([...urls.items.values()].map((i) => i.slug)).toEqual([
      "lounge-tunic",
      "lounge-tunic-blue",
      "wide-pant-blue",
    ]);
  });
});
