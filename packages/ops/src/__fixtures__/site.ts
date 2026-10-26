import type { SiteDocument } from "@openspace/schema";

/** A small but complete, valid site used across tests (Meadow-style yoga studio). */
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
  footerText: "blk_f1f1f1f1f1",
  aboutText: "blk_b1b1b1b1b1",
  media: "med_k3f9k3f9k3",
  form: "frm_c0ntact001",
} as const;

export function siteFixture(): SiteDocument {
  return {
    config: {
      $schema: "https://schema.openspace.dev/v1/site-config.json",
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
      logo: { src: "media/2026/10/logo-maya.png", alt: "Maya Yoga", width: 320, height: 96 },
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
        transparentOnHero: true,
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
      redirects: [{ from: "/classes", to: "/schedule", status: 301 }],
    },
    styles: {
      $schema: "https://schema.openspace.dev/v1/styles.json",
      choices: {
        palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
        pairing: "fraunces-hanken",
        density: "airy",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "arch",
      },
      overrides: {
        color: { accent: { $value: "oklch(0.58 0.12 40)", $type: "color" } },
        type: { display: { letterSpacing: { $value: "-0.02em" } } },
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
        header: { transparentOnHero: true },
        sections: [
          {
            id: IDS.hero,
            preset: "hero/split-image@2",
            layout: { mode: "stack", columns: { d: [7, 5], m: [12] }, align: "center" },
            style: {
              colorTheme: "light-accent",
              padding: { d: "xl", m: "lg" },
              minHeight: { d: "80vh" },
              background: { type: "none" },
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
                    src: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=2400&q=80",
                    alt: "A woman in a seated twist by a sunlit window",
                    focal: [0.42, 0.35],
                  },
                },
                style: { radius: "lg" },
              },
            ],
          },
          {
            id: IDS.grid,
            layout: {
              mode: "grid",
              rows: { d: 16, m: 22 },
              items: {
                [IDS.c1]: { d: { x: 1, y: 1, w: 10, h: 8 }, m: { x: 1, y: 1, w: 8, h: 9 } },
                [IDS.c2]: { d: { x: 9, y: 5, w: 14, h: 10, z: 2 }, m: { x: 1, y: 10, w: 8, h: 8 } },
              },
            },
            style: {
              colorTheme: "dark",
              background: {
                type: "image",
                src: "media/2026/10/hero-k3f9.jpg",
                focal: [0.5, 0.5],
                overlay: { color: "neutral-900", opacity: 0.4 },
              },
            },
            blocks: [
              {
                id: IDS.c1,
                type: "text",
                v: 1,
                fields: {
                  content: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Classes six days a week." }],
                      },
                    ],
                  },
                },
              },
              {
                id: IDS.c2,
                type: "image",
                v: 1,
                fields: { image: { src: "media/2026/10/hero-k3f9.jpg", alt: "" } },
              },
            ],
          },
        ],
      },
      [IDS.about]: {
        id: IDS.about,
        title: "About",
        slug: "about",
        access: { password: false },
        sections: [
          {
            id: "sec_ab0vtab0vt",
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
                        content: [{ type: "text", text: "Maya has taught since 2012." }],
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
    collections: {
      journal: {
        "2026-10-26-opening-day": {
          kind: "blog",
          slug: "2026-10-26-opening-day",
          frontmatter: {
            title: "Opening day at the new studio",
            date: "2026-10-26",
            author: "maya",
            categories: ["news"],
            tags: ["studio", "boulder"],
            image: "media/2026/10/studio-open.jpg",
            excerpt: "We're in. Here's what the first week looks like.",
            status: "published",
            publishAt: null,
          },
          body: "We're finally in the new space on Pearl Street.\n",
        },
      },
    },
    collectionConfigs: {
      journal: {
        kind: "blog",
        label: "Journal",
        slugPattern: "{date}-{title}",
        list: { layout: "cards", pageSize: 12, sort: "date-desc" },
        itemPage: { layout: "article", showDate: true, showAuthor: true },
        taxonomies: { categories: [{ slug: "news", label: "News" }], tags: true },
        feed: { enabled: true, format: "rss" },
      },
    },
    media: {
      "media/2026/10/hero-k3f9.jpg": {
        id: IDS.media,
        path: "media/2026/10/hero-k3f9.jpg",
        kind: "image",
        mime: "image/jpeg",
        bytes: 482113,
        width: 2400,
        height: 1600,
        alt: "Maya in a seated twist by a window",
        focal: [0.42, 0.35],
        createdAt: "2026-10-20T15:04:05Z",
      },
    },
  };
}
