import type { InlineNode, RichTextDoc } from "@omniharmonic/openspace-schema";
import { newsletterBlock } from "../../blocks/newsletter";
import { socialLinksBlock } from "../../blocks/social";
import {
  button,
  copy,
  defineHeaderPreset,
  definePreset,
  heading,
  make,
  rt,
  stack,
  text,
} from "../kit";
import { hours, weekHours } from "../parts";

/** Second wave of footers and header presets. */

type Node = RichTextDoc["content"][number];
const links = (...items: [string, string][]): Node[] =>
  items.map(([t, href]) => rt.p([rt.link(t, href) as InlineNode]));
const label = (t: string) => rt.p(t, "eyebrow");
const small = (t: string | (string | InlineNode)[]) => rt.p(t, "small");
const social = (o: { col?: number; align?: "start" | "center" | "end"; variant?: string } = {}) =>
  make(
    socialLinksBlock,
    { source: "site", label: undefined },
    {
      variant: o.variant ?? "icons",
      ...(o.col !== undefined ? { col: o.col } : {}),
      ...(o.align ? { style: { align: { d: o.align } } } : {}),
    },
  );

const FOOTER_AVOID =
  "Repeating the whole navigation; tiny unreadable text; outdated copyright years and addresses.";
const HEADER_AVOID =
  "More than seven top-level links; long link labels; two primary buttons in the header.";

export const footerMorePresets = [
  definePreset({
    category: "footer",
    name: "cta-footer",
    label: "Footer with call to action",
    description: "A big closing line and button above a slim row of links and small print.",
    copy: [copy.headline(2, 10, 2), copy.body(1, 40)],
    footer: true,
    defaultTheme: "dark",
    tags: ["cta", "closing", "rows"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Ends every page with the main next step.",
      whenToUse: "Agencies, consultants and service businesses.",
      avoid: FOOTER_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [8, 4], align: "end", gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Let's build something good together.", { col: 0, size: "h1" }),
        button("Start a project", c.primary, { col: 1, align: "end", mobileAlign: "start" }),
        text(
          [
            small([
              "© 2026 Fernhill Studio · ",
              rt.link("Work", "/work") as InlineNode,
              " · ",
              rt.link("About", "/about") as InlineNode,
              " · ",
              rt.link("Privacy", "/privacy") as InlineNode,
            ]),
          ],
          { col: 0 },
        ),
        social({ col: 1, align: "end" }),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "sitemap",
    label: "Sitemap footer",
    description: "A brand column and four columns of links — for larger sites.",
    copy: [copy.body(1, 40)],
    footer: true,
    defaultTheme: "dark-accent",
    tags: ["columns", "links", "sitemap", "large"],
    ai: {
      purpose: "Helps visitors find any page on a large site.",
      whenToUse: "Nonprofits, schools, products and sites with many pages.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [3, 3, 3, 3], m: [6, 6], gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        text(
          [
            rt.p("Shade Street Trust", "lead"),
            rt.p("Planting and caring for street trees since 2015."),
          ],
          {
            col: 0,
          },
        ),
        social({ col: 0 }),
        text(
          [
            label("Our work"),
            ...links(
              ["Street trees", "/our-work"],
              ["School gardens", "/our-work"],
              ["Impact", "/impact"],
            ),
          ],
          { col: 1 },
        ),
        text(
          [
            label("Get involved"),
            ...links(
              ["Volunteer", "/volunteer"],
              ["Fundraise", "/fundraise"],
              ["Events", "/events/"],
            ),
          ],
          { col: 2 },
        ),
        text(
          [
            label("Give"),
            ...links(
              ["Donate", "/donate"],
              ["Monthly giving", "/donate"],
              ["Leave a gift", "/legacy"],
            ),
          ],
          { col: 3 },
        ),
        text(
          [
            label("About"),
            ...links(["Our story", "/about"], ["Team", "/team"], ["Contact", "/contact"]),
          ],
          { col: 3 },
        ),
        text([small("© 2026 Shade Street Trust · Registered charity 1180342")], { col: 0 }),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "hours-footer",
    label: "Footer with hours",
    description:
      "Address, opening hours and social links in three columns — for places people visit.",
    copy: [copy.body(1, 40), copy.field("heading", "Heading", "hours", "heading", 1, 4)],
    footer: true,
    defaultTheme: "dark-accent",
    tags: ["hours", "location", "columns", "local"],
    ai: {
      purpose: "Keeps the address and hours one scroll away on every page.",
      whenToUse: "Restaurants, cafés, shops and studios.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 4, 4], gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        text(
          [
            rt.p("Osteria Lupa", "lead"),
            rt.p("212 Alder Street, Portland"),
            rt.p([rt.link("(503)\u00a0555\u20110148", "tel:+15035550148") as InlineNode]),
          ],
          { col: 0 },
        ),
        hours(weekHours("17:30", "23:00", ["17:30", "23:00"], ["12:00", "16:00"]), {
          col: 1,
          heading: "Opening hours",
        }),
        text([label("Follow"), small("New dishes and wine nights, first on Instagram.")], {
          col: 2,
        }),
        social({ col: 2 }),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "signup-dark",
    label: "Footer with signup band",
    description: "A newsletter signup band above a simple row of links and small print.",
    copy: [copy.body(1, 40)],
    footer: true,
    defaultTheme: "dark",
    tags: ["newsletter", "rows"],
    ai: {
      purpose: "Grows the email list from every page.",
      whenToUse: "Writers, shops and nonprofits with a newsletter.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        text(
          [rt.p("The Margin", "lead"), rt.p("A fortnightly letter on slow work and long walks.")],
          { col: 0 },
        ),
        make(
          newsletterBlock,
          {
            heading: undefined,
            description: undefined,
            askName: false,
            placeholder: "you@example.com",
            buttonLabel: "Subscribe",
            successMessage: "Welcome — the next letter arrives on Sunday.",
            note: undefined,
          },
          { variant: "inline", col: 1 },
        ),
        text(
          [
            small([
              "© 2026 The Margin · ",
              rt.link("Archive", "/letters/") as InlineNode,
              " · ",
              rt.link("About", "/about") as InlineNode,
            ]),
          ],
          { col: 0 },
        ),
        social({ col: 1, align: "end" }),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "giant-wordmark",
    label: "Giant wordmark",
    description:
      "Links and small print above the site name set huge across the bottom of the page.",
    copy: [copy.headline(1, 3, 2), copy.body(1, 40)],
    footer: true,
    defaultTheme: "light-accent",
    tags: ["wordmark", "typographic", "bold"],
    ai: {
      purpose: "A memorable sign-off that doubles as branding.",
      whenToUse: "Studios, portfolios and brands with a short name.",
      avoid: `${FOOTER_AVOID} Names longer than ten letters — they won't fit.`,
    },
    make: () => ({
      layout: stack({ cols: [4, 4, 4], m: [6, 6], gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        text([small("Brand and web design for independent shops. Portland, Oregon.")], { col: 0 }),
        text([...links(["Work", "/work"], ["Studio", "/about"])], { col: 1 }),
        text([...links(["Journal", "/journal/"], ["Contact", "/contact"])], { col: 2 }),
        heading("Fernhill", { size: "display" }),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "legal-row",
    label: "Single row with legal links",
    description: "One slim row: copyright on the left, legal links and social icons on the right.",
    copy: [copy.body(1, 40)],
    footer: true,
    defaultTheme: "light",
    tags: ["minimal", "row", "legal"],
    ai: {
      purpose: "The smallest useful footer.",
      whenToUse: "Landing pages, apps and one-page sites.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "md" }),
      padding: { d: "md", m: "md" },
      blocks: [
        text([small("© 2026 Tidewire, Inc.")], { col: 0 }),
        text(
          [
            small([
              rt.link("Privacy", "/privacy") as InlineNode,
              " · ",
              rt.link("Terms", "/terms") as InlineNode,
              " · ",
              rt.link("Status", "/status") as InlineNode,
            ]),
          ],
          { col: 1, align: "end", mobileAlign: "start" },
        ),
      ],
    }),
  }),
];

export const headerMorePresets = [
  defineHeaderPreset({
    category: "header",
    name: "dark-bar",
    label: "Dark bar",
    description: "A classic header on a dark bar that stays at the top while scrolling.",
    themes: ["dark", "dark-accent"],
    defaultTheme: "dark",
    tags: ["dark", "sticky", "classic"],
    ai: {
      purpose: "A strong, contrasting frame for light pages.",
      whenToUse: "Products, agencies and nightlife.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "classic-left",
      sticky: true,
      transparentOnHero: false,
      mobileMenu: "fullscreen",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "brand-bar",
    label: "Brand-colour bar",
    description: "Centred navigation on a bar in the brand colour.",
    themes: ["brand", "dark-accent"],
    defaultTheme: "brand",
    tags: ["brand", "bold", "centered"],
    ai: {
      purpose: "A bold, branded frame for playful sites.",
      whenToUse: "Events, launches, kids' businesses and link-in-bio sites.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "classic-center",
      sticky: true,
      transparentOnHero: false,
      mobileMenu: "dropdown",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "social-classic",
    label: "Classic with social icons",
    description: "Logo left, navigation right and social icons at the end of the bar.",
    tags: ["social", "classic"],
    ai: {
      purpose: "Keeps social profiles one tap away.",
      whenToUse: "Creators, musicians, cafés and shops active on social media.",
      avoid: `${HEADER_AVOID} Linking dormant profiles.`,
    },
    make: (theme) => ({
      variant: "classic-left",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "slide",
      colorTheme: theme,
      showSocial: true,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "transparent-split",
    label: "Transparent split",
    description: "Navigation either side of the logo, transparent over a photo hero.",
    themes: ["dark", "dark-accent", "light"],
    defaultTheme: "dark",
    tags: ["transparent", "symmetrical", "hospitality"],
    ai: {
      purpose: "An elegant, immersive header for photo-led home pages.",
      whenToUse: "Hotels, restaurants and wedding venues with a full-bleed hero.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "split-nav",
      sticky: false,
      transparentOnHero: true,
      mobileMenu: "fullscreen",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "masthead",
    label: "Large masthead",
    description: "A large centred logo with navigation beneath — like a magazine masthead.",
    tags: ["editorial", "masthead", "large-logo"],
    ai: {
      purpose: "Gives a wordmark real presence.",
      whenToUse: "Publications, writers and fashion brands.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "logo-center-nav-below",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "fullscreen",
      colorTheme: theme,
      logoHeight: { d: 72, m: 44 },
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "sticky-minimal",
    label: "Sticky minimal",
    description: "Logo and menu button only, staying at the top while scrolling.",
    tags: ["minimal", "sticky", "portfolio"],
    ai: {
      purpose: "Always-available navigation that never competes with the content.",
      whenToUse: "Long portfolio and essay pages.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "minimal-burger",
      sticky: true,
      transparentOnHero: false,
      mobileMenu: "slide",
      colorTheme: theme,
    }),
  }),
];
