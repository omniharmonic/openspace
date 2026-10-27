import type { InlineNode, RichTextDoc } from "@omniharmonic/openspace-schema";
import { contactInfoBlock, hoursBlock } from "../../blocks/business";
import { lineBlock } from "../../blocks/decor";
import { newsletterBlock } from "../../blocks/newsletter";
import { socialLinksBlock } from "../../blocks/social";
import {
  copy,
  defineHeaderPreset,
  definePreset,
  grid,
  heading,
  make,
  r,
  rt,
  stack,
  text,
} from "../kit";

/** Footer and site header presets. */

type Node = RichTextDoc["content"][number];

/** A column of links, one per line (paragraphs, so no list bullets). */
const links = (...items: [string, string][]): Node[] =>
  items.map(([text, href]) => rt.p([rt.link(text, href) as InlineNode]));

const label = (t: string) => rt.p(t, "eyebrow");
const small = (t: string | (string | InlineNode)[]) => rt.p(t, "small");

const social = (o: { col?: number; variant?: string; align?: "start" | "center" | "end" } = {}) =>
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

export const footerPresets = [
  definePreset({
    category: "footer",
    name: "columns",
    label: "Footer with link columns",
    description: "A short description, three columns of links and social icons.",
    copy: [copy.body(1, 40)],
    footer: true,
    defaultTheme: "dark",
    tags: ["columns", "links"],
    ai: {
      purpose: "A full footer for sites with several sections.",
      whenToUse: "Most business sites with five or more pages.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 2, 2, 4], m: [6, 6], gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        text(
          [
            rt.p("Little Ember Bakery", "lead"),
            rt.p("Wood-fired bread and pastries on Linden Street since 2015."),
          ],
          { col: 0 },
        ),
        social({ col: 0 }),
        text(
          [
            label("Visit"),
            ...links(["Menu", "/menu"], ["Hours & location", "/visit"], ["Catering", "/catering"]),
          ],
          { col: 1 },
        ),
        text(
          [
            label("About"),
            ...links(["Our story", "/about"], ["Journal", "/journal/"], ["Jobs", "/jobs"]),
          ],
          { col: 2 },
        ),
        text(
          [
            label("Wholesale"),
            rt.p([
              "Supplying cafés and restaurants across the Front Range. ",
              rt.link("Become a stockist", "/wholesale"),
            ]),
            small("© 2026 Little Ember Bakery"),
          ],
          { col: 3 },
        ),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "centered",
    label: "Centred footer",
    description: "Name, social icons and small print, centred.",
    copy: [copy.body(1, 40)],
    footer: true,
    defaultTheme: "light-accent",
    tags: ["centered", "minimal"],
    ai: {
      purpose: "A quiet, minimal footer.",
      whenToUse: "Portfolios, one-page sites and small practices.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "md" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        text(
          [
            rt.p("June Barlow Studio", "lead"),
            small("Prints, paintings and commissions from Asheville, North Carolina."),
          ],
          { align: "center" },
        ),
        social({ align: "center" }),
        text(
          [
            small([
              "© 2026 June Barlow · ",
              rt.link("Privacy", "/privacy"),
              " · ",
              rt.link("Shipping & returns", "/shipping"),
            ]),
          ],
          { align: "center" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "newsletter",
    label: "Footer with newsletter",
    description: "A newsletter signup alongside links and contact details.",
    copy: [copy.body(1, 40), copy.field("heading", "Heading", "newsletter", "heading", 2, 8)],
    footer: true,
    defaultTheme: "dark-accent",
    tags: ["newsletter", "columns"],
    ai: {
      purpose: "Ends every page with an invitation to stay in touch.",
      whenToUse: "Sites that send a newsletter.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 3, 3], gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        make(
          newsletterBlock,
          {
            heading: "Notes from the garden",
            description: "What to sow, what's flowering and our workshop dates, twice a month.",
            askName: false,
            placeholder: "you@example.com",
            buttonLabel: "Subscribe",
            successMessage: "Thanks — check your inbox to confirm.",
            note: undefined,
          },
          { col: 0, variant: "stacked" },
        ),
        text(
          [
            label("Explore"),
            ...links(
              ["Garden design", "/services"],
              ["Workshops", "/workshops"],
              ["Journal", "/journal/"],
            ),
          ],
          { col: 1 },
        ),
        text(
          [
            label("Contact"),
            rt.p([rt.link("hello@wildrootgardens.com", "mailto:hello@wildrootgardens.com")]),
            rt.p("Tuesday – Saturday, 9am – 5pm"),
          ],
          { col: 2 },
        ),
        social({ col: 2 }),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "big-name",
    label: "Big name footer",
    description: "The business name set large across the page, with links and small print beneath.",
    copy: [copy.body(1, 40), copy.headline(1, 3)],
    footer: true,
    defaultTheme: "brand",
    tags: ["typographic", "bold"],
    ai: {
      purpose: "A confident sign-off that repeats the brand.",
      whenToUse: "Brands with a short, strong name.",
      avoid: `${FOOTER_AVOID} Long names (they wrap awkwardly).`,
    },
    make: () => ({
      ...grid([
        [heading("Fernhill", { level: 2, size: "display" }), r(1, 1, 24, 3), r(1, 1, 8, 3)],
        [
          make(
            lineBlock,
            { thickness: "hairline", length: "full", color: "text" },
            { variant: "solid" },
          ),
          r(1, 5, 24, 1),
          r(1, 5, 8, 1),
        ],
        [
          text([...links(["Work", "/work"], ["Studio", "/about"], ["Contact", "/contact"])]),
          r(1, 7, 8, 5),
          r(1, 7, 4, 5),
        ],
        [social(), r(9, 7, 8, 3), r(5, 7, 4, 3)],
        [
          text([small("© 2026 Fernhill Studio, Portland")], { align: "end", mobileAlign: "start" }),
          r(17, 7, 8, 3),
          r(1, 13, 8, 3),
        ],
      ]),
      padding: { d: "xl", m: "lg" },
    }),
  }),

  definePreset({
    category: "footer",
    name: "visit",
    label: "Footer with hours and address",
    description: "Address, opening hours and social links — everything for visitors.",
    copy: [copy.body(1, 40), copy.field("heading", "Heading", "contact-info", "heading", 1, 4)],
    footer: true,
    defaultTheme: "dark",
    tags: ["hours", "address", "local"],
    ai: {
      purpose: "Puts visiting details on every page.",
      whenToUse: "Restaurants, cafés, shops and studios.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 4, 4], gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        text(
          [
            rt.p("Morning Room Café", "lead"),
            small("Breakfast, lunch and very good coffee in the Fan District."),
          ],
          { col: 0 },
        ),
        social({ col: 0 }),
        make(
          contactInfoBlock,
          {
            heading: "Find us",
            headingLevel: "h2",
            name: undefined,
            address: "77 Grove Avenue\nRichmond, VA 23220",
            phone: "+1 (804) 555-0128",
            email: "hello@morningroom.cafe",
            directions: true,
            note: undefined,
          },
          { col: 1, variant: "list" },
        ),
        make(
          hoursBlock,
          {
            heading: "Hours",
            headingLevel: "h2",
            rows: (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) =>
              day === "mon"
                ? { day, closed: true }
                : { day, opens: "07:30", closes: "16:00", closed: false },
            ),
            note: undefined,
          },
          { col: 2, variant: "compact" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "footer",
    name: "minimal-row",
    label: "One-line footer",
    description: "Small print on the left, links on the right, in a single row.",
    copy: [copy.body(1, 40)],
    footer: true,
    defaultTheme: "light",
    tags: ["minimal", "compact"],
    ai: {
      purpose: "The lightest possible footer.",
      whenToUse: "Landing pages, link-in-bio and single-page sites.",
      avoid: FOOTER_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "md" }),
      padding: { d: "md", m: "md" },
      blocks: [
        text([small("© 2026 Bright Acre Solar · Licensed & insured, CA #1048291")], { col: 0 }),
        text(
          [
            small([
              rt.link("Privacy", "/privacy"),
              " · ",
              rt.link("Terms", "/terms"),
              " · ",
              rt.link("Careers", "/careers"),
            ]),
          ],
          { col: 1, align: "end", mobileAlign: "start" },
        ),
      ],
    }),
  }),
];

// --- headers --------------------------------------------------------------------------------------

const HEADER_AVOID =
  "More than seven top-level links; long link labels; two primary buttons in the header.";

export const headerPresets = [
  defineHeaderPreset({
    category: "header",
    name: "classic",
    label: "Classic",
    description: "Logo on the left, navigation on the right. Stays at the top while scrolling.",
    tags: ["classic", "sticky"],
    ai: {
      purpose: "A familiar, no-surprises header.",
      whenToUse: "Almost any business site.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "classic-left",
      sticky: true,
      transparentOnHero: false,
      mobileMenu: "slide",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "centered-nav",
    label: "Centred navigation",
    description: "Logo on the left with the navigation centred in the bar.",
    tags: ["balanced"],
    ai: {
      purpose: "A balanced header for four to six links.",
      whenToUse: "Studios and shops with a short menu.",
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
    name: "split",
    label: "Split around logo",
    description: "Navigation split either side of a centred logo.",
    tags: ["symmetrical", "boutique"],
    ai: {
      purpose: "An elegant, symmetrical header.",
      whenToUse: "Restaurants, hotels and boutiques with an even number of links.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "split-nav",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "fullscreen",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "logo-centered",
    label: "Logo centred, menu left",
    description: "The navigation on the left, a centred logo, buttons and cart on the right.",
    tags: ["boutique", "centered", "shop"],
    ai: {
      purpose: "A fashion- and boutique-style header with the brand in the middle.",
      whenToUse: "Shops and studios whose wordmark should sit centre stage.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "nav-left-logo-center",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "fullscreen",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "sidebar",
    label: "Sidebar",
    description: "Logo, title and the menu in a column down the left; the page beside it.",
    tags: ["blog", "editorial", "sidebar"],
    ai: {
      purpose: "A blog- or journal-style layout with the site's identity always in view.",
      whenToUse: "Writers, journals and foundations with a short menu and a strong colour.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "sidebar-left",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "slide",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "logo-above",
    label: "Logo above navigation",
    description: "A centred logo with the navigation in a row beneath it.",
    tags: ["editorial", "centered"],
    ai: {
      purpose: "A masthead-style header.",
      whenToUse: "Magazines, writers and brands with a wordmark.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "logo-center-nav-below",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "slide",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "minimal",
    label: "Minimal menu",
    description: "Just the logo and a menu button at every screen size.",
    tags: ["minimal", "portfolio"],
    ai: {
      purpose: "Gets out of the way of the work.",
      whenToUse: "Portfolios and image-led sites.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "minimal-burger",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "fullscreen",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "stacked",
    label: "Stacked",
    description: "Logo above a left-aligned navigation row.",
    tags: ["stacked"],
    ai: {
      purpose: "A compact, left-aligned two-row header.",
      whenToUse: "Text-heavy sites and long site names.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "stacked",
      sticky: false,
      transparentOnHero: false,
      mobileMenu: "dropdown",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "drawer",
    label: "Side drawer",
    description: "Navigation lives in a drawer that slides in from the side.",
    tags: ["drawer", "many-links"],
    ai: {
      purpose: "Room for a long menu without crowding the bar.",
      whenToUse: "Sites with many pages or folders.",
      avoid: HEADER_AVOID,
    },
    make: (theme) => ({
      variant: "sidebar-drawer",
      sticky: true,
      transparentOnHero: false,
      mobileMenu: "slide",
      colorTheme: theme,
    }),
  }),
  defineHeaderPreset({
    category: "header",
    name: "overlay",
    label: "Transparent over hero",
    description: "The header floats over a photographic first section, then turns solid on scroll.",
    defaultTheme: "dark",
    tags: ["transparent", "immersive"],
    ai: {
      purpose: "Lets a full-bleed hero photo reach the top of the screen.",
      whenToUse: "Pages that open with a full-bleed photo hero.",
      avoid: `${HEADER_AVOID} Using it over light, busy photos.`,
    },
    make: (theme) => ({
      variant: "transparent-overlay",
      sticky: true,
      transparentOnHero: true,
      mobileMenu: "fullscreen",
      colorTheme: theme,
    }),
  }),
];
