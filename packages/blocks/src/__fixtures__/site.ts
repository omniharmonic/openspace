import {
  type Block,
  type ColorTheme,
  newId,
  type Page,
  type Section,
  type SiteDocument,
} from "@openspace/schema";

export const SITE_ID = "st_01jb3q8w2n";
export const HUB = "https://hub.openspace.dev";

/** A stack section holding the given blocks in one column. */
export function stackSection(blocks: Block[], colorTheme: ColorTheme = "light"): Section {
  return {
    id: newId("sec"),
    layout: { mode: "stack", columns: { d: [12] } },
    style: { colorTheme },
    blocks,
  };
}

/** A grid section placing each block in its own row band. */
export function gridSection(blocks: Block[]): Section {
  const items: Record<string, { d: { x: number; y: number; w: number; h: number } }> = {};
  blocks.forEach((b, i) => {
    items[b.id] = { d: { x: 3, y: 1 + i * 8, w: 14, h: 8 } };
  });
  return {
    id: newId("sec"),
    layout: { mode: "grid", rows: { d: Math.max(8, blocks.length * 8) }, items },
    style: { colorTheme: "dark" },
    blocks,
  };
}

export function page(title: string, slug: string, sections: Section[]): Page {
  return { id: newId("pg"), title, slug, sections };
}

/** A minimal valid site containing the given pages. */
export function siteWith(pages: Page[]): SiteDocument {
  return {
    config: {
      siteId: SITE_ID,
      schemaVersion: 1,
      template: { id: "meadow", version: "1.0.0" },
      hub: HUB,
      deploy: {
        target: "github-pages",
        url: "https://juniper.github.io/juniper-yoga",
        customDomain: null,
      },
      features: { forms: true, newsletter: true, analytics: false, search: false },
    },
    site: {
      title: "Juniper Yoga",
      tagline: "Slow, grounded yoga in Boulder.",
      logo: null,
      nav: pages.slice(0, 3).map((p) => ({ type: "page" as const, page: p.id })),
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
        blocks: [],
      },
      social: [
        { network: "instagram", url: "https://instagram.com/juniperyoga" },
        { network: "email", url: "mailto:hello@juniperyoga.com" },
      ],
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
    pages: Object.fromEntries(pages.map((p) => [p.id, p])),
    collections: {},
    media: {},
  } as SiteDocument;
}
