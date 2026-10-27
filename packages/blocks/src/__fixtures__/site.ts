import {
  type Block,
  type CollectionItem,
  type ColorTheme,
  newId,
  type Page,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";

export const SITE_ID = "st_01jb3q8w2n";
export const HUB = "https://hub.openspace.host";

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
    collections: demoCollections(),
    media: {},
  } as SiteDocument;
}

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=2400&q=80`;
const day = 864e5;
/** `YYYY-MM-DD` / ISO date-time `n` days from now (keeps "upcoming" fixtures upcoming). */
const fromNow = (n: number, time?: string) => {
  const d = new Date(Date.now() + n * day).toISOString().slice(0, 10);
  return time ? `${d}T${time}-07:00` : d;
};

/** Collections the summary, events and product blocks read by default. */
export function demoCollections(): Record<string, Record<string, CollectionItem>> {
  const post = (slug: string, title: string, date: string, excerpt: string, image: string) =>
    ({
      kind: "blog",
      slug,
      body: "",
      frontmatter: {
        title,
        date,
        status: "published",
        author: "Maya Lindqvist",
        categories: ["news"],
        excerpt,
        image: img(image),
        imageAlt: title,
      },
    }) as CollectionItem;
  const event = (slug: string, title: string, start: string, end: string, place: string) =>
    ({
      kind: "events",
      slug,
      body: "",
      frontmatter: {
        title,
        start,
        end,
        timezone: "America/Denver",
        status: "published",
        excerpt: "Small group, all levels welcome. Mats and props provided.",
        location: { name: place, address: "1840 Pearl Street, Boulder, CO" },
        registrationUrl: "https://juniperyoga.com/register",
        price: "$35",
      },
    }) as CollectionItem;
  return {
    journal: {
      "opening-day": post(
        "opening-day",
        "Opening day at the new studio",
        fromNow(-20),
        "We're in. Here's what the first week looks like.",
        "1545205597-3d9d02c29597",
      ),
      "slow-mornings": post(
        "slow-mornings",
        "The case for slow mornings",
        fromNow(-40),
        "Ten unhurried minutes before the day starts, and why they matter.",
        "1506126613408-eca07ce68773",
      ),
      "winter-schedule": post(
        "winter-schedule",
        "Our winter schedule",
        fromNow(-60),
        "Earlier evening classes and a new Sunday restore.",
        "1518611012118-696072aa579a",
      ),
    },
    events: {
      "sound-bath": event(
        "sound-bath",
        "Full-moon sound bath",
        fromNow(9, "19:00:00"),
        fromNow(9, "20:30:00"),
        "The quiet room",
      ),
      "foundations-workshop": event(
        "foundations-workshop",
        "Foundations: a two-hour workshop",
        fromNow(16, "09:30:00"),
        fromNow(16, "11:30:00"),
        "Main studio",
      ),
      "old-retreat": event(
        "old-retreat",
        "Autumn retreat",
        fromNow(-30, "09:00:00"),
        fromNow(-28, "16:00:00"),
        "Estes Park",
      ),
    },
    shop: {
      "cork-yoga-mat": {
        kind: "products",
        slug: "cork-yoga-mat",
        body: "",
        frontmatter: {
          title: "Cork yoga mat",
          status: "published",
          excerpt:
            "Natural cork on a recycled rubber base: grippy when you sweat, kind to the planet.",
          price: { amount: 6800, currency: "USD" },
          compareAtPrice: { amount: 8000, currency: "USD" },
          sku: "MAT-CORK",
          image: img("1601925260368-ae2f83cf8b7f"),
          imageAlt: "Yoga mats rolled up on white shelves",
          options: [{ name: "Length", values: ["Standard", "Long"] }],
          variants: [
            { sku: "MAT-CORK-STD", options: { Length: "Standard" } },
            {
              sku: "MAT-CORK-LONG",
              options: { Length: "Long" },
              price: { amount: 7600, currency: "USD" },
            },
          ],
        },
      } as CollectionItem,
    },
  };
}
