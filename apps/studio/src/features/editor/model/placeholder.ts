import type { SiteDocument } from "@openspace/schema";

/**
 * A content-less document (no pages, empty footer) that backs the editor while a new site is
 * still being set up. Kept apart from the dev fixture so production builds never include demo
 * content.
 */
export function placeholderDocument(): SiteDocument {
  return {
    config: {
      siteId: "st_0000000000",
      schemaVersion: 1,
      template: { id: "starter", version: "1.0.0" },
      hub: "https://hub.openspace.dev",
      deploy: { target: "github-pages", url: "https://example.github.io/site", customDomain: null },
      features: { forms: false, newsletter: false, analytics: false, search: false },
    },
    site: {
      title: "New site",
      logo: null,
      nav: [],
      header: {
        variant: "classic-left",
        sticky: false,
        transparentOnHero: false,
        mobileMenu: "slide",
      },
      footer: {
        id: "sec_0000000000",
        layout: { mode: "stack", columns: { d: [12] } },
        style: {},
        blocks: [],
      },
      social: [],
      locale: "en-US",
    },
    styles: {
      choices: {
        palette: { brand: "oklch(0.55 0.12 250)", neutral: "warm", contrast: "standard" },
        pairing: "fraunces-hanken",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    pages: {},
    collections: {},
    media: {},
  } as SiteDocument;
}
