import { buttonBlock, headingBlock, imageBlock, textBlock } from "@omniharmonic/openspace-blocks";
import {
  type Block,
  type ColorTheme,
  type GridRect,
  newId,
  type Page,
  type RichTextDoc,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";

/** Small builders for lint tests. */

export const h = (text: string, level: 1 | 2 | 3 | 4 = 2): Block =>
  headingBlock.create({
    fields: { text, level: `h${level}`, eyebrow: undefined, subheading: undefined } as never,
  });

export const p = (text: string): Block =>
  textBlock.create({
    fields: {
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      } as RichTextDoc,
    },
  });

export const btn = (label = "Book a class", role: "primary" | "secondary" = "primary"): Block =>
  buttonBlock.create({
    fields: {
      label,
      role,
      link: { type: "url", url: "/" },
      secondaryLabel: undefined,
      secondaryLink: undefined,
      note: undefined,
    } as never,
  });

export const img = (
  src = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80",
  alt = "A studio by the window",
  width = 800,
  height = 600,
  aspect = "original",
): Block =>
  imageBlock.create({
    fields: { image: { src, alt, width, height }, aspect, caption: undefined } as never,
  });

export function stackSection(
  blocks: Block[],
  colorTheme: ColorTheme = "light",
  cols = [12],
): Section {
  return {
    id: newId("sec"),
    layout: { mode: "stack", columns: { d: cols } },
    style: { colorTheme },
    blocks,
  };
}

export function gridSection(
  placed: [Block, GridRect, GridRect?][],
  colorTheme: ColorTheme = "light",
): Section {
  const items: Record<string, { d: GridRect; m?: GridRect }> = {};
  let rows = 1;
  let mrows = 1;
  for (const [b, d, m] of placed) {
    items[b.id] = m ? { d, m } : { d };
    rows = Math.max(rows, d.y + d.h - 1);
    if (m) mrows = Math.max(mrows, m.y + m.h - 1);
  }
  return {
    id: newId("sec"),
    layout: {
      mode: "grid",
      rows: placed.some(([, , m]) => m) ? { d: rows, m: Math.max(mrows, rows) } : { d: rows },
      items,
    } as Section["layout"],
    style: { colorTheme },
    blocks: placed.map(([b]) => b),
  };
}

export const page = (
  title: string,
  slug: string,
  sections: Section[],
  extra: Partial<Page> = {},
): Page => ({
  id: newId("pg"),
  title,
  slug,
  sections,
  ...extra,
});

export function siteWith(pages: Page[]): SiteDocument {
  return {
    config: {
      siteId: "st_01jb3q8w2n",
      schemaVersion: 1,
      template: { id: "meadow", version: "1.0.0" },
      hub: "https://hub.openspace.dev",
      deploy: { target: "github-pages", url: "https://juniper.github.io/site", customDomain: null },
      features: { forms: true, newsletter: true, analytics: false, search: false },
    },
    site: {
      title: "Juniper Yoga",
      logo: null,
      nav: [],
      header: {
        variant: "classic-left",
        sticky: true,
        transparentOnHero: false,
        mobileMenu: "slide",
      },
      footer: {
        id: newId("sec"),
        layout: { mode: "stack", columns: { d: [12] } },
        style: { colorTheme: "dark" },
        blocks: [p("© 2026 Juniper Yoga, Boulder")],
      },
      locale: "en-US",
    },
    styles: {
      choices: {
        palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
        pairing: "fraunces-hanken",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    pages: Object.fromEntries(pages.map((pg) => [pg.id, pg])),
    collections: {},
    media: {},
  } as SiteDocument;
}

/** A healthy one-page site: H1 hero with a button, then a few varied sections. */
export function healthyDoc() {
  const home = page("Home", "", [
    stackSection(
      [
        h("Slow, grounded yoga in Boulder", 1),
        p("Small classes for every body, every morning and evening of the week."),
        btn(),
      ],
      "light-accent",
    ),
    stackSection([
      h("Classes"),
      p("Foundations, vinyasa and yin, never more than twelve people on the mat."),
    ]),
    stackSection(
      [h("Visit"), p("1840 Pearl Street, Boulder. Free parking behind the building.")],
      "dark",
    ),
  ]);
  return { doc: siteWith([home]), home };
}
