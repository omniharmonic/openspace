import { statsBlock } from "../../blocks/data";
import { logoStripBlock } from "../../blocks/logo-strip";
import { marqueeBlock } from "../../blocks/marquee";
import { newsletterBlock } from "../../blocks/newsletter";
import { photo } from "../images";
import {
  button,
  copy,
  definePreset,
  grid,
  heading,
  image,
  make,
  r,
  rt,
  scrim,
  stack,
  text,
} from "../kit";

const headline = copy.headline(3, 10, 1);
const intro = copy.sub(10, 40);

const AI_AVOID =
  "More than one hero per page; a second Heading 1; headlines longer than ten words; stock photos that don't show the business.";

export const heroPresets = [
  definePreset({
    category: "hero",
    name: "split-image",
    label: "Split with portrait image",
    description: "Headline, introduction and two actions beside a tall photograph.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light-accent",
    tags: ["image", "two-column", "classic"],
    links: { primary: "/classes", secondary: "/timetable" },
    ai: {
      purpose:
        "Opens a home or landing page with a clear promise, a photo of the real thing and one main action.",
      whenToUse:
        "The default hero for most small businesses: studios, cafés, makers and practitioners.",
      avoid: AI_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Make something with your hands this week", {
          col: 0,
          level: 1,
          size: "h1",
          eyebrow: "Pottery studio · East Austin",
          sub: "Small wheel-throwing classes for complete beginners and returning potters. Clay, glazes and kiln firings are all included.",
        }),
        button("Book a taster class", c.primary, {
          col: 0,
          second: { label: "See the timetable", link: c.secondary },
          note: "Six people per class, aprons provided.",
        }),
        image(photo("pottery", 620, "4:5"), { col: 1, aspect: "4:5" }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "split-landscape",
    label: "Split with landscape image",
    description: "A wide photograph on the left, headline and action on the right.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "3:2" }],
    tags: ["image", "two-column"],
    links: { primary: "/reserve", secondary: "/menu" },
    ai: {
      purpose: "Leads with the place or the product, then the promise.",
      whenToUse: "When the photograph sells better than the words: restaurants, venues, rentals.",
      avoid: AI_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], align: "center", order: [1, 0], gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        image(photo("dining", 730, "3:2"), { col: 0, aspect: "3:2" }),
        heading("Seasonal plates, slow evenings", {
          col: 1,
          level: 1,
          size: "h1",
          eyebrow: "Neighbourhood bistro",
          sub: "A short menu that changes with the farmers' market, natural wines by the glass and a dining room that never rushes you out.",
        }),
        button("Reserve a table", c.primary, {
          col: 1,
          second: { label: "Tonight's menu", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "centered",
    label: "Centered statement",
    description: "A centred headline, introduction and actions — no image.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["text-only", "centered", "minimal"],
    links: { primary: "/work", secondary: "/contact" },
    ai: {
      purpose: "A typographic opening that lets the words carry the page.",
      whenToUse:
        "Consultants, writers and studios whose work is ideas; pages where a photo would be filler.",
      avoid: AI_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("Brand and website design for independent shops", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Fernhill Studio",
          sub: "We help small makers look as good online as their work does in person — names, logos, packaging and sites that are easy to keep up to date.",
        }),
        button("See recent work", c.primary, {
          align: "center",
          second: { label: "Start a project", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "image-below",
    label: "Headline over wide image",
    description: "A centred headline and actions above a cinematic photograph.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "21:9" }],
    tags: ["image", "centered", "wide"],
    links: { primary: "/stay", secondary: "/rooms" },
    ai: {
      purpose: "States the promise, then shows the place at full width.",
      whenToUse: "Hospitality, venues and destinations with one strong landscape photograph.",
      avoid: AI_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "wide", gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("A quiet cabin above the valley", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Two nights minimum · Sleeps four",
          sub: "Wake to mist on the river, walk straight onto the ridge trail and finish the day by the wood stove.",
        }),
        button("Check availability", c.primary, {
          align: "center",
          second: { label: "Inside the cabin", link: c.secondary },
        }),
        image(photo("valley", 1440, "21:9"), { aspect: "21:9" }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "full-bleed-photo",
    label: "Full-bleed photograph",
    description:
      "A tall section with a background photograph, a soft scrim and a centred headline.",
    copy: [headline, intro],
    images: [{ slot: "background", aspect: "fill" }],
    defaultTheme: "dark",
    tags: ["image", "background", "centered", "immersive"],
    links: { primary: "/book", secondary: "/retreats" },
    ai: {
      purpose: "An immersive opening where the photograph sets the mood.",
      whenToUse: "Retreats, travel, events and venues with a striking landscape-format photo.",
      avoid: `${AI_AVOID} Busy photos where text sits over faces or detail.`,
    },
    make: (c) => ({
      layout: stack({ width: "narrow" }),
      padding: { d: "3xl", m: "2xl" },
      minHeight: { d: "88vh", m: "80svh" },
      background: {
        type: "image",
        src: photo("cliffs", 1920).src,
        focal: [0.5, 0.55],
        overlay: scrim(0.55),
      },
      blocks: [
        heading("Five days of silence by the sea", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Autumn retreat · 14–19 October",
          sub: "Guided meditation, coastal walks and simple vegetarian food for twelve guests at a farmhouse on the cliffs.",
        }),
        button("Reserve your place", c.primary, {
          align: "center",
          second: { label: "What's included", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "photo-corner-text",
    label: "Photograph with corner headline",
    description: "A full-height background photograph with the headline anchored bottom left.",
    copy: [headline, intro],
    images: [{ slot: "background", aspect: "fill" }],
    defaultTheme: "dark",
    tags: ["image", "background", "editorial"],
    links: { primary: "/portfolio", secondary: "/contact" },
    ai: {
      purpose: "A gallery-like opening for visual businesses: the photo first, words second.",
      whenToUse: "Photographers, architects, florists and designers.",
      avoid: `${AI_AVOID} Photos whose subject sits in the bottom-left corner.`,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], align: "end" }),
      padding: { d: "2xl", m: "xl" },
      minHeight: { d: "92vh", m: "85svh" },
      background: {
        type: "image",
        src: photo("modernHouse", 1920).src,
        focal: [0.6, 0.45],
        overlay: scrim(0.62),
      },
      blocks: [
        heading("Houses that sit lightly on the land", {
          col: 0,
          level: 1,
          size: "display",
          eyebrow: "Wren & Hale Architects",
          sub: "Timber homes and studios in the Hudson Valley, designed around light, views and the trees already there.",
        }),
        button("View our projects", c.primary, {
          col: 0,
          role: "primary",
          second: { label: "Talk to us", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "editorial-overlap",
    label: "Editorial overlap",
    description:
      "A large photograph bleeding off the right edge with a text panel layered over it.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "light-accent",
    tags: ["image", "grid", "overlap", "editorial"],
    links: { primary: "/menu", secondary: "/visit" },
    ai: {
      purpose: "A magazine-style opening: photo and words share the frame.",
      whenToUse: "When there is one great horizontal photo and a short, confident headline.",
      avoid: `${AI_AVOID} Long introductions — the panel is compact.`,
    },
    make: (c) => {
      const photoBlock = image(photo("bakeryShelves", 960));
      const panel = heading("Bread worth getting up early for", {
        level: 1,
        size: "display",
        eyebrow: "Open daily from 7am",
        sub: "Naturally leavened loaves, laminated pastries and good coffee, baked through the night in our wood-fired oven on Linden Street.",
        style: { colorTheme: c.theme, padding: { d: "xl", m: "md" } },
      });
      const cta = button("See today's bakes", c.primary, {
        second: { label: "Find us", link: c.secondary },
      });
      return {
        padding: { d: "xl", m: "md" },
        ...grid([
          [photoBlock, r(10, 1, 15, 24, { bleed: "right" }), r(1, 1, 8, 14, { bleed: "both" })],
          [panel, r(1, 5, 12, 14, { z: 2 }), r(1, 12, 8, 13, { z: 2 })],
          [cta, r(2, 20, 10, 3), r(1, 26, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "collage",
    label: "Photo collage",
    description: "Two overlapping photographs beside a headline and actions.",
    copy: [headline, intro],
    images: [
      { slot: "large", aspect: "fill" },
      { slot: "small", aspect: "fill" },
    ],
    tags: ["image", "grid", "overlap", "playful"],
    links: { primary: "/shop", secondary: "/workshops" },
    ai: {
      purpose:
        "Shows two sides of the business at once — the place and the product, the maker and the work.",
      whenToUse: "Shops, makers and studios with a pair of complementary photos.",
      avoid: `${AI_AVOID} Two photos with clashing colour or the same subject.`,
    },
    make: (c) => {
      const big = image(photo("succulent", 640));
      const small = image(photo("plantPot", 380), { shadow: "lg" });
      const words = heading("Plants that are hard to kill", {
        level: 1,
        size: "display",
        eyebrow: "Greenhouse & plant shop",
        sub: "Hardy, characterful houseplants for real homes and busy people, potted in our own terracotta and delivered across town.",
      });
      const cta = button("Shop the plants", c.primary, {
        second: { label: "Potting workshops", link: c.secondary },
      });
      return {
        padding: { d: "xl", m: "lg" },
        ...grid([
          [big, r(1, 1, 11, 22), r(1, 1, 6, 14)],
          [small, r(8, 12, 7, 13, { z: 2 }), r(5, 10, 4, 8, { z: 2 })],
          [words, r(15, 4, 10, 14), r(1, 19, 8, 10)],
          [cta, r(15, 18, 10, 4), r(1, 29, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "big-type",
    label: "Big type with details",
    description:
      "An oversized headline across the page with the introduction and action in two columns below.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["text-only", "typographic", "bold"],
    links: { primary: "/contact", secondary: "/case-studies" },
    ai: {
      purpose: "A confident, type-led opening for brands with a strong line.",
      whenToUse:
        "Agencies, consultants, product launches — when the headline is short and memorable.",
      avoid: `${AI_AVOID} Headlines over six words; they become a wall of type.`,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], align: "end", gap: "xl" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("Clear numbers. Calm founders.", {
          col: 0,
          level: 1,
          size: "display",
          eyebrow: "Bookkeeping & fractional finance",
        }),
        text(
          [
            rt.p(
              "Monthly books, cash-flow forecasts and a finance lead on call for creative businesses with two to fifty people. Fixed fees, no surprises.",
              "lead",
            ),
          ],
          { col: 1 },
        ),
        button("Book an intro call", c.primary, {
          col: 1,
          second: { label: "Read client stories", link: c.secondary },
        }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "arch-window",
    label: "Arched image",
    description: "Headline and actions beside a photograph in an arched frame.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light-accent",
    tags: ["image", "two-column", "soft", "wellness"],
    links: { primary: "/book", secondary: "/treatments" },
    ai: {
      purpose: "A gentle, welcoming opening with a softened image shape.",
      whenToUse: "Wellness, beauty, therapy and wedding businesses.",
      avoid: AI_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], align: "center", gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Massage and bodywork for tired, busy bodies", {
          col: 0,
          level: 1,
          size: "h1",
          eyebrow: "Still Point Bodywork",
          sub: "Deep tissue, pregnancy and lymphatic massage in a calm room above the bookshop, with evening appointments four nights a week.",
        }),
        button("Book a treatment", c.primary, {
          col: 0,
          second: { label: "Treatments & prices", link: c.secondary },
          note: "Gift cards available at the front desk.",
        }),
        image(photo("massage", 500, "4:5"), { col: 1, aspect: "4:5", treatment: "arch" }),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "staggered-photos",
    label: "Staggered photographs",
    description: "Three photos stepped across the page with the headline layered in front.",
    copy: [headline, intro],
    images: [{ slot: "photos", aspect: "fill", count: 3 }],
    defaultTheme: "light",
    tags: ["image", "grid", "overlap", "gallery"],
    links: { primary: "/menu", secondary: "/private-dining" },
    ai: {
      purpose: "A lively, layered opening that shows variety — dishes, rooms, people.",
      whenToUse: "Restaurants, event venues and creative studios with three strong photographs.",
      avoid: `${AI_AVOID} Photos with very different colour temperatures.`,
    },
    make: (c) => {
      const a = image(photo("plates", 420));
      const b = image(photo("chefPrep", 320));
      const d = image(photo("sharedTable", 420));
      const words = text(
        [
          rt.p("Open-fire cooking · Since 2016", "eyebrow"),
          rt.h(1, "Cooked over fire, shared at the table", "h1"),
          rt.p(
            "Plates come out when they're ready and go in the middle. Bring friends and order a bit of everything.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } } },
      );
      const cta = button("Book a table", c.primary, {
        second: { label: "Private dining", link: c.secondary },
      });
      return {
        padding: { d: "xl", m: "lg" },
        ...grid([
          [a, r(1, 1, 8, 24), r(1, 1, 5, 12)],
          [b, r(10, 4, 6, 16), r(6, 5, 3, 9)],
          [d, r(17, 1, 8, 13), r(1, 14, 8, 9)],
          [words, r(14, 11, 11, 11, { z: 2 }), r(1, 21, 8, 11, { z: 2 })],
          [cta, r(15, 23, 10, 3), r(1, 33, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "marquee-launch",
    label: "Launch with ticker",
    description: "A bold headline and action above a scrolling ticker of highlights.",
    copy: [headline, intro],
    defaultTheme: "brand",
    tags: ["text-only", "bold", "launch", "motion"],
    links: { primary: "/preorder", secondary: "/how-it-works" },
    ai: {
      purpose: "A loud, energetic opening for launches, drops and events.",
      whenToUse: "Product launches, festivals, sales and openings.",
      avoid: `${AI_AVOID} More than six ticker items; ticker text that repeats the headline.`,
    },
    make: (c) => ({
      layout: stack({ width: "wide", gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("The everyday bag, rebuilt to last", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Pre-orders open now",
          sub: "Waxed canvas, solid brass and a lifetime repair promise. Made in small batches in our Portland workshop.",
        }),
        button("Pre-order yours", c.primary, {
          align: "center",
          size: "large",
          second: { label: "How it's made", link: c.secondary },
        }),
        make(
          marqueeBlock,
          {
            items: [
              { text: "Lifetime repairs" },
              { text: "Waxed canvas" },
              { text: "Ships in March" },
              { text: "Made in Portland" },
              { text: "Free returns" },
            ],
            separator: "star",
            size: "h3",
            speed: "slow",
          },
          { variant: "text" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "caption-card",
    label: "Photograph with caption card",
    description: "A wide photograph with a card overlapping its lower edge.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "fill" }],
    tags: ["image", "grid", "overlap", "card"],
    links: { primary: "/donate", secondary: "/our-work" },
    ai: {
      purpose: "A photo-led opening that keeps the message legible on a solid card.",
      whenToUse: "Nonprofits, community groups and services where the photo shows people.",
      avoid: `${AI_AVOID} Photos where the card would cover faces.`,
    },
    make: (c) => {
      const pic = image(photo("friendsBench", 1440));
      const card = text(
        [
          rt.p("Riverside Community Fund", "eyebrow"),
          rt.h(1, "Neighbours helping neighbours since 1998", "h1"),
          rt.p(
            "We fund small, local projects — food pantries, youth sports, repair cafés — chosen each spring by people who live here.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "xl", m: "md" }, radius: "md" } },
      );
      const cta = button("Give monthly", c.primary, {
        second: { label: "See what we fund", link: c.secondary },
      });
      return {
        padding: { d: "lg", m: "md" },
        ...grid(
          [
            [pic, r(1, 1, 24, 20), r(1, 1, 8, 12, { bleed: "both" })],
            [card, r(3, 13, 11, 13, { z: 2 }), r(1, 10, 8, 14, { z: 2 })],
            [cta, r(3, 27, 11, 3), r(1, 25, 8, 3)],
          ],
          { width: "wide" },
        ),
      };
    },
  }),

  definePreset({
    category: "hero",
    name: "signup",
    label: "Headline with email signup",
    description: "A centred headline with an inline email signup instead of a button.",
    copy: [headline, intro],
    defaultTheme: "dark-accent",
    tags: ["text-only", "newsletter", "launch", "centered"],
    ai: {
      purpose: "Collects emails from the first screen — for launches, waitlists and newsletters.",
      whenToUse: "Coming-soon pages, writers and anything not yet open.",
      avoid: `${AI_AVOID} Promising perks the owner hasn't confirmed.`,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("A letter about cooking with what's in season", {
          level: 1,
          size: "h1",
          align: "center",
          eyebrow: "The Market Basket · every Thursday",
          sub: "One market haul, three simple recipes and a note from the farm. Read by 12,000 home cooks.",
        }),
        make(
          newsletterBlock,
          {
            heading: undefined,
            description: undefined,
            askName: false,
            placeholder: "you@example.com",
            buttonLabel: "Subscribe",
            successMessage: "You're in. The next letter arrives on Thursday morning.",
            note: "Free. Unsubscribe in one click.",
          },
          { variant: "inline", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "with-stats",
    label: "Headline with proof points",
    description: "A left-aligned headline and action with three key numbers beneath.",
    copy: [headline, intro, copy.items("stat", "Stat label", "stats", "items", "label", 1, 6)],
    defaultTheme: "light",
    tags: ["text-only", "stats", "trust"],
    links: { primary: "/quote", secondary: "/services" },
    ai: {
      purpose: "Pairs the promise with immediate, verifiable proof.",
      whenToUse: "Trades, services and B2B businesses with real numbers to show.",
      avoid: `${AI_AVOID} Invented or unverifiable numbers — ask the owner.`,
    },
    make: (c) => ({
      layout: stack({ cols: [8, 4], gap: "2xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Solar for homes, installed by people who live here", {
          col: 0,
          level: 1,
          size: "h1",
          eyebrow: "Bright Acre Solar",
          sub: "Free roof surveys, honest payback numbers and a crew that cleans up after itself. Serving the county since 2011.",
        }),
        button("Get a free survey", c.primary, {
          col: 0,
          second: { label: "How it works", link: c.secondary },
        }),
        make(
          statsBlock,
          {
            items: [
              { value: "1,400+", label: "Homes installed" },
              { value: "4.9★", label: "Average review" },
              { value: "25 yr", label: "Panel warranty" },
            ],
          },
          { col: 1, variant: "large" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "hero",
    name: "with-logos",
    label: "Headline with press strip",
    description: "A centred headline and actions above a strip of publications or partners.",
    copy: [headline, intro],
    defaultTheme: "light-accent",
    tags: ["text-only", "centered", "logos", "trust"],
    links: { primary: "/shop", secondary: "/reviews" },
    ai: {
      purpose: "Opens with the promise and borrowed credibility.",
      whenToUse: "Products and services that have real press coverage or notable partners.",
      avoid: `${AI_AVOID} Logos of publications that never covered the business.`,
    },
    make: (c) => ({
      layout: stack({ gap: "xl" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Hot sauce made from our own peppers", {
          level: 1,
          size: "display",
          align: "center",
          eyebrow: "Small-batch · Grown in New Mexico",
          sub: "Five sauces, from smoky and gentle to properly fierce, fermented for six weeks and bottled on the farm.",
        }),
        button("Shop the sauces", c.primary, {
          align: "center",
          second: { label: "Read the reviews", link: c.secondary },
        }),
        make(
          logoStripBlock,
          {
            label: "As featured in",
            logos: [
              { name: "The Daily Larder" },
              { name: "Southwest Table" },
              { name: "Pepper Quarterly" },
              { name: "Good Food Weekly" },
            ],
            monochrome: true,
          },
          { variant: "row" },
        ),
      ],
    }),
  }),
];
