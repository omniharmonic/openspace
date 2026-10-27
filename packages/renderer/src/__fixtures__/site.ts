import type { SiteDocument } from "@omniharmonic/openspace-schema";

export const IDS = {
  site: "st_01jb3q8w2n",
  home: "pg_7hq2k3f9mz",
  about: "pg_a8bx1c2d3e",
  hero: "sec_7hq2abcdef",
  grid: "sec_9bz1abcdef",
  footer: "sec_f00tergr1d",
  heading: "blk_a1a1a1a1a1",
  button: "blk_a2a2a2a2a2",
  image: "blk_a3a3a3a3a3",
  c1: "blk_c1c1c1c1c1",
  c2: "blk_c2c2c2c2c2",
  c3: "blk_c3c3c3c3c3",
  footerText: "blk_f1f1f1f1f1",
  aboutText: "blk_b1b1b1b1b1",
  aboutSection: "sec_ab0tsect12",
} as const;

const HERO_PHOTO = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=2400&q=80";

/** A small, valid Meadow-style site exercising stack + grid sections. */
export function siteFixture(): SiteDocument {
  return {
    config: {
      siteId: IDS.site,
      schemaVersion: 1,
      template: { id: "meadow", version: "1.2.0" },
      hub: "https://hub.openspace.dev",
      deploy: {
        target: "github-pages",
        url: "https://maya.github.io/maya-yoga",
        customDomain: null,
      },
      features: { forms: true, newsletter: true, analytics: true, search: false },
    },
    site: {
      title: "Maya Yoga",
      tagline: "Slow, grounded yoga in Boulder.",
      logo: null,
      favicon: "media/2026/10/favicon.png",
      nav: [
        { type: "page", page: IDS.home, label: "Home" },
        {
          type: "folder",
          label: "Studio",
          items: [
            { type: "page", page: IDS.about },
            { type: "collection", collection: "journal", label: "Journal" },
          ],
        },
        { type: "link", label: "Instagram", href: "https://instagram.com/mayayoga", newTab: true },
        {
          type: "button",
          label: "Book a class",
          link: { type: "url", url: "https://cal.com/maya" },
          style: "primary",
        },
        { type: "page", page: IDS.about, label: "Old about", hidden: true },
      ],
      header: {
        variant: "classic-left",
        sticky: true,
        transparentOnHero: false,
        mobileMenu: "slide",
      },
      footer: {
        id: IDS.footer,
        layout: {
          mode: "grid",
          rows: { d: 6, m: 8 },
          items: {
            [IDS.footerText]: { d: { x: 1, y: 1, w: 12, h: 4 }, m: { x: 1, y: 1, w: 8, h: 6 } },
          },
        },
        style: { colorTheme: "dark" },
        blocks: [
          {
            id: IDS.footerText,
            type: "text",
            v: 1,
            fields: {
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "1420 Pearl Street, Boulder" }],
                  },
                ],
              },
            },
          },
        ],
      },
      announcement: {
        enabled: true,
        message: "New Saturday morning class starts November 2.",
        link: { type: "page", page: IDS.about },
      },
      social: [
        { network: "instagram", url: "https://instagram.com/mayayoga" },
        { network: "email", url: "mailto:hello@mayayoga.com" },
      ],
      seo: {
        titleTemplate: "%s — Maya Yoga",
        description: "Slow, grounded yoga classes in Boulder.",
      },
      locale: "en-US",
      integrations: { analytics: true, bookingUrl: "https://cal.com/maya", stripeConnected: false },
      customCss: ".os-header__title { letter-spacing: 0.01em; }",
    },
    styles: {
      choices: {
        palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
        pairing: "fraunces-hanken",
        density: "airy",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "arch",
      },
    },
    pages: {
      [IDS.home]: {
        id: IDS.home,
        title: "Home",
        slug: "",
        seo: {
          title: null,
          description: "Slow, grounded yoga in Boulder.",
          image: "media/2026/10/hero-k3f9.jpg",
        },
        sections: [
          {
            id: IDS.hero,
            preset: "hero/split-image@2",
            anchor: "welcome",
            layout: {
              mode: "stack",
              columns: { d: [7, 5], m: [12] },
              order: { m: [1, 0] },
              align: "center",
            },
            style: {
              colorTheme: "light-accent",
              padding: { d: "xl", m: "lg" },
              minHeight: { d: "80vh" },
              background: { type: "none" },
              animation: { entrance: "rise", stagger: true },
            },
            blocks: [
              {
                id: IDS.heading,
                type: "text",
                v: 1,
                column: 0,
                fields: {
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "heading",
                        attrs: { level: 1, preset: "display" },
                        content: [{ type: "text", text: "Slow, grounded yoga" }],
                      },
                      {
                        type: "paragraph",
                        attrs: { preset: "lead" },
                        content: [
                          { type: "text", text: "Small classes on " },
                          { type: "text", text: "Pearl Street", marks: [{ type: "bold" }] },
                          { type: "text", text: ". " },
                          {
                            type: "text",
                            text: "See the schedule",
                            marks: [{ type: "link", attrs: { href: "/schedule" } }],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
              {
                id: IDS.button,
                type: "button",
                v: 1,
                column: 0,
                fields: {
                  label: "Book a class",
                  link: { type: "page", page: IDS.about },
                  variant: "primary",
                },
              },
              {
                id: IDS.image,
                type: "image",
                v: 1,
                column: 1,
                fields: {
                  image: {
                    src: HERO_PHOTO,
                    alt: "A woman in a seated twist by a sunlit window",
                    focal: [0.42, 0.35],
                  },
                },
                style: { radius: "lg", align: { d: "center", m: "start" } },
              },
            ],
          },
          {
            id: IDS.grid,
            layout: {
              mode: "grid",
              rows: { d: 16, m: 22 },
              items: {
                [IDS.c1]: {
                  d: { x: 1, y: 1, w: 10, h: 8, bleed: "left" },
                  m: { x: 1, y: 1, w: 8, h: 9 },
                },
                [IDS.c2]: {
                  d: { x: 9, y: 5, w: 14, h: 10, z: 2 },
                  t: { x: 7, y: 5, w: 18, h: 10 },
                  m: { x: 1, y: 10, w: 8, h: 8 },
                },
                [IDS.c3]: { d: { x: 12, y: 1, w: 8, h: 3 } },
              },
            },
            style: {
              colorTheme: "dark",
              background: {
                type: "image",
                src: "media/2026/10/studio.jpg",
                focal: [0.5, 0.3],
                overlay: { color: "neutral-950", opacity: 0.4 },
                parallax: true,
              },
            },
            blocks: [
              {
                id: IDS.c2,
                type: "text",
                v: 1,
                fields: {
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Morning flow, every weekday at 7." }],
                      },
                    ],
                  },
                },
              },
              {
                id: IDS.c1,
                type: "image",
                v: 2,
                fields: {
                  image: { src: "media/2026/10/hero-k3f9.jpg", alt: "The studio at dawn" },
                },
              },
              {
                id: IDS.c3,
                type: "text",
                v: 1,
                fields: {
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "heading",
                        attrs: { level: 2 },
                        content: [{ type: "text", text: "This week" }],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      [IDS.about]: {
        id: IDS.about,
        title: "About",
        slug: "about",
        sections: [
          {
            id: IDS.aboutSection,
            layout: { mode: "stack", columns: { d: [12] } },
            style: {},
            blocks: [
              {
                id: IDS.aboutText,
                type: "text",
                v: 1,
                fields: {
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Maya has taught in Boulder since 2014." }],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    },
    collections: { journal: {} },
    media: {
      "media/2026/10/hero-k3f9.jpg": {
        id: "med_k3f9k3f9k3",
        path: "media/2026/10/hero-k3f9.jpg",
        kind: "image",
        mime: "image/jpeg",
        bytes: 482113,
        width: 2400,
        height: 3000,
        alt: "The studio at dawn",
        createdAt: "2026-10-01T09:00:00Z",
      },
    },
  };
}

/** Non-null assertion for tests. */
export function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("fixture value missing");
  return value;
}
