import { columnsBlock } from "../../blocks/card";
import { beforeAfterBlock } from "../../blocks/compare";
import { galleryBlock } from "../../blocks/gallery";
import { type CropAspect, type PhotoKey, photo } from "../images";
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
  stack,
  text,
  url,
} from "../kit";

const headline = copy.headline(1, 10, 2);
const AVOID =
  "Mixing photos of very different quality or colour; images without alt text; more than twenty photos in one section.";

const shots = (
  keys: PhotoKey[],
  width: number,
  aspect: CropAspect = "original",
  captions?: string[],
) =>
  keys.map((k, i) => ({
    image: photo(k, width, aspect),
    ...(captions?.[i] ? { caption: captions[i] } : {}),
  }));

const gallery = (
  images: ReturnType<typeof shots>,
  variant: string,
  fields: { aspect?: string; columns?: string; captions?: boolean } = {},
) =>
  make(
    galleryBlock,
    {
      images,
      aspect: fields.aspect ?? "auto",
      columns: fields.columns ?? "3",
      lightbox: true,
      showCaptions: fields.captions ?? false,
    },
    { variant },
  );

export const galleryPresets = [
  definePreset({
    category: "gallery",
    name: "grid",
    label: "Photo grid",
    description: "A heading over an even grid of square photos that open full screen.",
    copy: [headline, copy.sub(5, 30)],
    images: [{ slot: "photos", aspect: "1:1", count: 6 }],
    tags: ["grid", "lightbox"],
    ai: {
      purpose: "A tidy overview of many photos of similar weight.",
      whenToUse: "Menus of dishes, product ranges, event photos, interiors.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("From the kitchen this week", {
          eyebrow: "Gallery",
          sub: "Everything is cooked to order and changes with the market.",
        }),
        gallery(
          shots(["plates", "pizza", "saladBowl", "pancakes", "cake", "breadSliced"], 420, "1:1"),
          "grid",
          { aspect: "1:1" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "masonry",
    label: "Masonry wall",
    description: "Photos at their natural proportions in staggered columns.",
    copy: [headline],
    images: [{ slot: "photos", aspect: "original", count: 7 }],
    defaultTheme: "light",
    tags: ["masonry", "portfolio"],
    ai: {
      purpose: "A portfolio wall that respects each photo's original shape.",
      whenToUse: "Photographers, illustrators and stylists with mixed portrait and landscape work.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg", width: "wide" }),
      blocks: [
        heading("Recent commissions", { eyebrow: "Portfolio", align: "center" }),
        gallery(
          shots(
            [
              "portraitClara",
              "weddingHands",
              "portraitTheo",
              "weddingAisle",
              "portraitAna",
              "friendsSunset",
              "portraitSam",
            ],
            460,
          ),
          "masonry",
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "carousel",
    label: "Scrolling carousel",
    description: "A heading and a horizontally scrolling row of portrait photos with captions.",
    copy: [headline],
    images: [{ slot: "photos", aspect: "4:5", count: 6 }],
    tags: ["carousel", "captions"],
    ai: {
      purpose: "Shows lots of photos without a long page.",
      whenToUse: "Rooms, venues, collections and anything with captions worth reading.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Rooms at the guesthouse", { eyebrow: "Stay with us" }),
        gallery(
          shots(
            ["livingRoom", "bohoLounge", "yellowChair", "greenSofa", "kitchen", "loungePlants"],
            420,
            "4:5",
            [
              "The garden lounge",
              "The rust room",
              "Reading corner",
              "The green room",
              "Shared kitchen",
              "Library",
            ],
          ),
          "carousel",
          { aspect: "4:5", captions: true },
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "slideshow",
    label: "Full-width slideshow",
    description: "One large photograph at a time, with arrows to move through the set.",
    copy: [],
    images: [{ slot: "photos", aspect: "3:2", count: 4 }],
    defaultTheme: "dark",
    tags: ["slideshow", "immersive"],
    ai: {
      purpose: "A cinematic, one-at-a-time view of a few strong landscape photos.",
      whenToUse: "Venues, travel and architecture; the top of a project page.",
      avoid: `${AVOID} Portrait photos (they crop badly).`,
    },
    make: () => ({
      layout: stack({ width: "wide" }),
      padding: { d: "lg", m: "md" },
      blocks: [
        gallery(shots(["lake", "mountainLake", "valley", "coast"], 1440, "3:2"), "slideshow", {
          aspect: "3:2",
        }),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "strips",
    label: "Justified rows",
    description: "Photos in neat rows that keep their natural shapes, like a photo book.",
    copy: [headline],
    images: [{ slot: "photos", aspect: "original", count: 6 }],
    defaultTheme: "light",
    tags: ["rows", "portfolio"],
    ai: {
      purpose: "An even, book-like layout for photos of mixed shapes.",
      whenToUse: "Event coverage, travel diaries and project documentation.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Harvest supper, September", { eyebrow: "Events" }),
        gallery(shots(["sharedTable", "dinner", "plates", "terrace", "coffeeCheers", "pizza"], 640), "strips"),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "mosaic",
    label: "Mosaic",
    description: "One large photo with four smaller ones arranged around it.",
    copy: [],
    images: [{ slot: "photos", aspect: "fill", count: 5 }],
    defaultTheme: "light",
    tags: ["grid", "mosaic"],
    ai: {
      purpose: "A curated arrangement where one photo leads.",
      whenToUse: "Home pages that need a quick visual taste of the place or the work.",
      avoid: AVOID,
    },
    make: () => {
      const big = image(photo("cafeInterior", 760), { lightbox: true });
      const a = image(photo("pourOver", 300), { lightbox: true });
      const b = image(photo("croissant", 300), { lightbox: true });
      const c2 = image(photo("coffeeBeans", 300), { lightbox: true });
      const d = image(photo("cafeSign", 300), { lightbox: true });
      return {
        ...grid([
          [big, r(1, 1, 12, 21), r(1, 1, 8, 12)],
          [a, r(13, 1, 6, 10), r(1, 14, 4, 7)],
          [b, r(19, 1, 6, 10), r(5, 14, 4, 7)],
          [c2, r(13, 12, 6, 10), r(1, 22, 4, 7)],
          [d, r(19, 12, 6, 10), r(5, 22, 4, 7)],
        ]),
      };
    },
  }),

  definePreset({
    category: "gallery",
    name: "layered-pair",
    label: "Layered pair",
    description: "Two photographs layered with a caption beside them.",
    copy: [headline, copy.body(10, 50)],
    images: [{ slot: "photos", aspect: "fill", count: 2 }],
    tags: ["grid", "overlap", "editorial"],
    ai: {
      purpose: "A detail-and-context pairing with a short story.",
      whenToUse: "Craft, florals, fashion and food — a wide shot and a close-up.",
      avoid: AVOID,
    },
    make: () => {
      const wide = image(photo("weddingAisle", 700));
      const close = image(photo("weddingHands", 420), { shadow: "lg" });
      const words = heading("Flowers for the Hartley wedding", { eyebrow: "Recent work" });
      const body = text([
        rt.p(
          "Dahlias, garden roses and wild grasses from three local growers, arranged the morning of the ceremony.",
        ),
      ]);
      return {
        ...grid([
          [wide, r(1, 1, 13, 18), r(1, 1, 8, 11)],
          [close, r(10, 12, 7, 13, { z: 2 }), r(4, 9, 5, 9, { z: 2 })],
          [words, r(18, 6, 7, 6), r(1, 19, 8, 6)],
          [body, r(18, 12, 7, 7), r(1, 25, 8, 6)],
        ]),
      };
    },
  }),

  definePreset({
    category: "gallery",
    name: "project-feature",
    label: "Featured project",
    description: "A full-width project photo with a caption card overlapping it and a detail shot.",
    copy: [headline, copy.body(10, 50)],
    images: [
      { slot: "hero", aspect: "fill" },
      { slot: "detail", aspect: "fill" },
    ],
    defaultTheme: "dark",
    tags: ["grid", "overlap", "case-study"],
    links: { primary: "/projects/river-house" },
    ai: {
      purpose: "Introduces one project as a case study teaser.",
      whenToUse: "Architects, designers and builders featuring their best project.",
      avoid: AVOID,
    },
    make: (c) => {
      const hero = image(photo("poolHouse", 1440));
      const card = text(
        [
          rt.p("Project · 2025", "eyebrow"),
          rt.h(2, "The Palm House", "h2"),
          rt.p(
            "A 1960s bungalow opened up to the garden, with a new pool pavilion and a roof that collects every drop of rain.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } } },
      );
      const detail = image(photo("architecture", 440));
      const cta = button("View the project", c.primary, { role: "secondary" });
      return {
        ...grid(
          [
            [hero, r(1, 1, 24, 22), r(1, 1, 8, 12, { bleed: "both" })],
            [card, r(15, 16, 9, 12, { z: 2 }), r(1, 10, 8, 13, { z: 2 })],
            [detail, r(2, 24, 8, 12), r(1, 26, 8, 10)],
            [cta, r(15, 29, 9, 3), r(1, 23, 8, 3)],
          ],
          { width: "wide" },
        ),
      };
    },
  }),

  definePreset({
    category: "gallery",
    name: "project-cards",
    label: "Project index",
    description: "A heading and three linked project cards with portrait images.",
    copy: [headline, copy.items("project", "Project summary", "columns", "items", "body", 4, 25)],
    images: [{ slot: "projects", aspect: "4:5", count: 3 }],
    tags: ["cards", "portfolio", "links"],
    ai: {
      purpose: "An index of projects that each link to their own page.",
      whenToUse: "Portfolio home pages and 'selected work' sections.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Selected work", { eyebrow: "Portfolio", variant: "underline" }),
        make(
          columnsBlock,
          {
            columns: "3",
            aspect: "4:5",
            items: [
              {
                image: photo("ceramics", 400, "4:5"),
                heading: "Kiln & Clay",
                body: rt.doc(rt.p("Identity and packaging for a Brooklyn ceramics studio.")),
                link: url("/work/kiln-and-clay"),
                linkLabel: "View project",
              },
              {
                image: photo("shirts", 400, "4:5"),
                heading: "Field Supply",
                body: rt.doc(rt.p("An online shop for an organic workwear label.")),
                link: url("/work/field-supply"),
                linkLabel: "View project",
              },
              {
                image: photo("coffeeTable", 400, "4:5"),
                heading: "Morning Room",
                body: rt.doc(rt.p("Menus, signage and a website for a neighbourhood café.")),
                link: url("/work/morning-room"),
                linkLabel: "View project",
              },
            ],
          },
          { variant: "plain" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "before-after",
    label: "Before and after",
    description: "A centred heading over a large draggable before/after comparison.",
    copy: [headline, copy.sub(5, 30)],
    images: [{ slot: "comparison", aspect: "3:2", count: 2 }],
    defaultTheme: "light-accent",
    tags: ["comparison", "centered"],
    ai: {
      purpose: "Shows a transformation as the main event.",
      whenToUse: "Restoration, landscaping, styling and retouching portfolios.",
      avoid: `${AVOID} Comparing two different places as if they were one.`,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Same room, two moods", {
          align: "center",
          eyebrow: "Styling",
          sub: "Drag to compare a bright, neutral scheme with a warmer layered one.",
        }),
        make(
          beforeAfterBlock,
          {
            before: photo("livingRoom", 1280, "3:2"),
            after: photo("bohoLounge", 1280, "3:2"),
            beforeLabel: "Neutral",
            afterLabel: "Warm",
            start: 50,
            aspect: "3:2",
            caption: undefined,
          },
          { variant: "labels" },
        ),
      ],
    }),
  }),
];
