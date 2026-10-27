import { galleryBlock } from "../../blocks/gallery";
import { socialFeedBlock } from "../../blocks/social-feed";
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

/** Second wave of galleries: wide carousels, captioned grids, social feeds, staggered sets. */

const headline = copy.headline(1, 10, 2);
const AVOID =
  "Mixing photo styles or colour temperatures in one gallery; more than twenty photos in a section; missing alt text.";

const gallery = (
  keys: [PhotoKey, string?][],
  width: number,
  o: {
    variant: string;
    aspect?: CropAspect | "auto";
    columns?: "2" | "3" | "4" | "5";
    captions?: boolean;
    col?: number;
  },
) =>
  make(
    galleryBlock,
    {
      images: keys.map(([k, caption]) => ({
        image: photo(k, width, o.aspect && o.aspect !== "auto" ? o.aspect : "original"),
        ...(caption ? { caption } : {}),
      })),
      aspect: o.aspect ?? "auto",
      columns: o.columns ?? "3",
      lightbox: true,
      showCaptions: o.captions ?? false,
    },
    { variant: o.variant, ...(o.col !== undefined ? { col: o.col } : {}) },
  );

export const galleryMorePresets = [
  definePreset({
    category: "gallery",
    name: "wide-carousel",
    label: "Wide carousel",
    description: "A full-width, swipeable carousel of landscape photographs under a small heading.",
    copy: [headline],
    images: [{ slot: "photos", aspect: "3:2", count: 5 }],
    defaultTheme: "light",
    tags: ["carousel", "wide", "landscape"],
    ai: {
      purpose: "A cinematic way to browse a set of photographs.",
      whenToUse: "Venues, travel, architecture and event photography.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "full", gap: "lg" }),
      blocks: [
        heading("Around the lodge", { eyebrow: "Gallery" }),
        gallery([["canyon"], ["dunes"], ["valley"], ["mountainLake"], ["road"]], 900, {
          variant: "carousel",
          aspect: "3:2",
        }),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "captioned-grid",
    label: "Captioned grid",
    description: "Six photographs in a three-column grid, each with a short caption.",
    copy: [headline, copy.items("caption", "Caption", "gallery", "images", "caption", 1, 10)],
    images: [{ slot: "photos", aspect: "4:5", count: 6 }],
    defaultTheme: "light",
    tags: ["grid", "captions", "three-up"],
    ai: {
      purpose: "Photographs with context — what, where or who.",
      whenToUse: "Portfolios, project pages and event recaps.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Portraits, 2025", { eyebrow: "Selected work" }),
        gallery(
          [
            ["portraitEditorial", "Ilse, studio session"],
            ["portraitJonah", "Jonah, Mile End"],
            ["portraitMono", "Noa, for Ink Quarterly"],
            ["portraitRaf", "Raf, at the allotment"],
            ["portraitElder", "Walter, 91, retired boatbuilder"],
            ["portraitLena", "Lena, Lisbon"],
          ],
          440,
          { variant: "grid", aspect: "4:5", columns: "3", captions: true },
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "masonry-wide",
    label: "Wide masonry",
    description: "A four-column masonry wall of mixed portrait and landscape photographs.",
    copy: [headline],
    images: [{ slot: "photos", aspect: "original", count: 8 }],
    defaultTheme: "light",
    tags: ["masonry", "wide", "many"],
    ai: {
      purpose: "Shows a large body of work at a glance without cropping.",
      whenToUse: "Photographers, florists and makers with many images.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide", gap: "lg" }),
      blocks: [
        heading("Recent weddings", { eyebrow: "Gallery", align: "center" }),
        gallery(
          [
            ["weddingMono"],
            ["weddingField"],
            ["weddingHands"],
            ["weddingAisle"],
            ["poppies"],
            ["sharedTable"],
            ["meadow"],
            ["dinner"],
          ],
          360,
          { variant: "masonry", columns: "4" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "single-feature",
    label: "Single photograph",
    description: "One wide photograph with its caption set over the lower edge.",
    copy: [copy.field("caption", "Caption", "image", "caption", 2, 20)],
    images: [{ slot: "photo", aspect: "21:9" }],
    defaultTheme: "light",
    tags: ["image", "wide", "single", "caption"],
    ai: {
      purpose: "A pause between sections that lets one photograph breathe.",
      whenToUse: "Between text-heavy sections; landscapes, rooms, products.",
      avoid: `${AVOID} Photos that don't survive a wide crop.`,
    },
    make: () => ({
      layout: stack({ width: "full" }),
      padding: { d: "none", m: "none" },
      blocks: [
        image(photo("dunes", 1920, "21:9"), {
          aspect: "21:9",
          variant: "caption-overlay",
          caption: "First light over the dunes, on the second morning of the trip.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "staggered-three",
    label: "Staggered three",
    description: "Three photographs of different heights stepped across the page, with a caption.",
    copy: [headline, copy.body(5, 40)],
    images: [{ slot: "photos", aspect: "fill", count: 3 }],
    defaultTheme: "light-accent",
    tags: ["grid", "editorial", "staggered"],
    ai: {
      purpose: "An editorial arrangement that gives a set of photos rhythm.",
      whenToUse: "Interiors, food, fashion and travel stories.",
      avoid: AVOID,
    },
    make: () => {
      const a = image(photo("livingRoom", 520));
      const b = image(photo("loungePlants", 420));
      const d = image(photo("bohoLounge", 520));
      const words = text([
        rt.h(2, "The Larkspur apartment", "h3"),
        rt.p("A rented flat, made calm with plants, linen and a lot of patience."),
      ]);
      return {
        ...grid([
          [a, r(1, 1, 9, 22), r(1, 1, 8, 12)],
          [b, r(11, 6, 6, 14), r(1, 14, 4, 10)],
          [d, r(18, 3, 7, 18), r(5, 14, 4, 10)],
          [words, r(11, 21, 14, 5), r(1, 25, 8, 6)],
        ]),
      };
    },
  }),

  definePreset({
    category: "gallery",
    name: "social-feed",
    label: "Social feed",
    description: "Recent posts from a social profile as a photo grid with a follow link.",
    copy: [copy.field("heading", "Heading", "social-feed", "heading", 1, 8)],
    images: [{ slot: "posts", aspect: "1:1", count: 6 }],
    defaultTheme: "light",
    tags: ["social", "instagram", "grid"],
    ai: {
      purpose: "Shows that the business is active and invites people to follow.",
      whenToUse: "Cafés, florists, makers, studios — anyone posting often.",
      avoid: `${AVOID} Linking to an account that hasn't posted in months.`,
    },
    make: () => ({
      layout: stack(),
      blocks: [
        make(
          socialFeedBlock,
          {
            heading: "Fresh from the studio",
            headingLevel: "h2",
            network: "instagram",
            handle: "slowstemsflowers",
            count: "6",
            followLabel: "Follow along",
            posts: (
              [
                ["poppies", "Poppy season"],
                ["meadow", "Field walk at dawn"],
                ["seedlings", "Seedlings in"],
                ["gardenTrowel", "Planting day"],
                ["succulent", "Studio corner"],
                ["urbanGarden", "Our first community bed"],
              ] as [PhotoKey, string][]
            ).map(([k, caption]) => ({
              image: photo(k, 320, "1:1"),
              url: url("https://www.instagram.com/slowstemsflowers/"),
              caption,
            })),
          },
          { variant: "grid" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "slideshow-split",
    label: "Slideshow with text",
    description: "A slideshow on one side and a short description with a link on the other.",
    copy: [headline, copy.body(8, 50)],
    images: [{ slot: "slides", aspect: "4:5", count: 4 }],
    defaultTheme: "dark",
    tags: ["slideshow", "two-column", "rooms"],
    links: { primary: "/rooms" },
    ai: {
      purpose: "Shows several views of one thing — a room, a product, a venue.",
      whenToUse: "Hotels, rentals, venues and products with several angles.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], align: "center", gap: "2xl" }),
      blocks: [
        gallery([["kitchen"], ["livingRoom"], ["bathtub"], ["loungePlants"]], 640, {
          variant: "slideshow",
          aspect: "4:5",
          col: 0,
        }),
        heading("The Garden Suite", { col: 1, eyebrow: "Rooms" }),
        text(
          [
            rt.p(
              "Our largest room opens onto the walled garden, with a deep bath, a small kitchen and a sofa that turns into a bed for a third guest.",
            ),
          ],
          { col: 1 },
        ),
        button("See all rooms", c.primary, { col: 1, role: "secondary" }),
      ],
    }),
  }),

  definePreset({
    category: "gallery",
    name: "strip-dark",
    label: "Photo strip on dark",
    description: "A dark band with a heading and a single strip of five square photographs.",
    copy: [headline],
    images: [{ slot: "photos", aspect: "1:1", count: 5 }],
    defaultTheme: "dark",
    tags: ["strips", "dark", "squares"],
    ai: {
      purpose: "A compact, moody reel of recent work.",
      whenToUse: "Bars, musicians, barbers and tattoo studios.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide", gap: "lg" }),
      blocks: [
        heading("Nights at the shop", { eyebrow: "Gallery" }),
        gallery([["barbershop"], ["barber"], ["streetNight"], ["stageLights"], ["concert"]], 320, {
          variant: "grid",
          aspect: "1:1",
          columns: "5",
        }),
      ],
    }),
  }),
];
