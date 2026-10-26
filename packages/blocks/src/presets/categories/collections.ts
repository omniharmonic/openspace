import { eventsBlock, summaryBlock } from "../../blocks/collections";
import { productBlock } from "../../blocks/commerce";
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
  stack,
  text,
  url,
} from "../kit";

/** Blog/summary, events and products presets (they read collections). */

const headline = copy.headline(1, 10, 2);

const summary = (
  collection: string,
  variant: string,
  o: {
    heading?: string;
    level?: "h2" | "h3";
    limit?: number;
    columns?: "2" | "3" | "4";
    image?: boolean;
    excerpt?: boolean;
    date?: boolean;
    meta?: boolean;
    linkLabel?: string;
    link?: string;
    empty: string;
    col?: number;
  },
) =>
  make(
    summaryBlock,
    {
      heading: o.heading,
      headingLevel: o.level ?? "h2",
      source: { collection, sort: "date-desc", limit: o.limit ?? 3 },
      columns: o.columns ?? "3",
      showImage: o.image ?? true,
      showDate: o.date ?? true,
      showExcerpt: o.excerpt ?? true,
      showMeta: o.meta ?? false,
      linkLabel: o.linkLabel,
      link: o.link ? url(o.link) : undefined,
      emptyMessage: o.empty,
    },
    { variant, ...(o.col !== undefined ? { col: o.col } : {}) },
  );

const BLOG_AVOID =
  "Showing more than six posts on a home page; hiding dates on time-sensitive posts.";
const BLOG_EMPTY = "New posts are on the way — check back soon.";

export const blogPresets = [
  definePreset({
    category: "blog",
    name: "latest-grid",
    label: "Latest posts",
    description: "The three latest posts as cards, with a link to the full journal.",
    copy: [headline],
    images: [{ slot: "post images", aspect: "3:2", count: 3 }],
    collections: ["blog"],
    collection: "journal",
    tags: ["cards", "three-up"],
    ai: {
      purpose: "Keeps the home page fresh with the latest writing.",
      whenToUse: "Any site with a blog, journal or news section.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [
        summary(c.collection, "grid", {
          heading: "From the journal",
          linkLabel: "All posts",
          link: `/${c.collection}/`,
          empty: BLOG_EMPTY,
        }),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "list",
    label: "Post list",
    description: "A compact list of recent posts with dates and excerpts.",
    copy: [headline],
    collections: ["blog"],
    collection: "journal",
    defaultTheme: "light",
    tags: ["list", "compact", "reading"],
    ai: {
      purpose: "A reading-first index of posts.",
      whenToUse: "Writers, newsletters and news pages.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow" }),
      blocks: [
        summary(c.collection, "list", {
          heading: "Recent writing",
          limit: 5,
          image: false,
          linkLabel: "The archive",
          link: `/${c.collection}/`,
          empty: BLOG_EMPTY,
        }),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "carousel",
    label: "Post carousel",
    description: "Recent posts in a horizontally scrolling row.",
    copy: [headline],
    collections: ["blog"],
    collection: "journal",
    defaultTheme: "light-accent",
    tags: ["carousel"],
    ai: {
      purpose: "Shows more posts without a tall section.",
      whenToUse: "Sites that publish often.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [
        summary(c.collection, "carousel", {
          heading: "Stories and recipes",
          limit: 6,
          excerpt: false,
          empty: BLOG_EMPTY,
        }),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "wall",
    label: "Post wall",
    description: "Posts as large image tiles with titles over the photographs.",
    copy: [headline],
    collections: ["blog"],
    collection: "journal",
    defaultTheme: "dark",
    tags: ["image", "tiles", "magazine"],
    ai: {
      purpose: "A magazine-style, image-led index.",
      whenToUse: "Travel, food and lifestyle blogs with strong cover photos.",
      avoid: `${BLOG_AVOID} Posts without cover images.`,
    },
    make: (c) => ({
      layout: stack({ width: "wide" }),
      blocks: [
        summary(c.collection, "wall", {
          heading: "Field notes",
          columns: "3",
          excerpt: false,
          empty: BLOG_EMPTY,
        }),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "intro-list",
    label: "Journal with introduction",
    description: "A heading and introduction beside a list of recent posts.",
    copy: [headline, copy.body(10, 50)],
    collections: ["blog"],
    collection: "journal",
    defaultTheme: "light",
    tags: ["two-column", "list"],
    links: { primary: "/subscribe" },
    ai: {
      purpose: "Introduces what the journal is about before listing posts.",
      whenToUse: "Home pages of writers, coaches and studios with a regular journal.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("The journal", { col: 0, eyebrow: "Writing" }),
        text(
          [
            rt.p(
              "Short essays on practice, rest and the small rituals that make a week feel lighter. A new one most Sundays.",
            ),
          ],
          { col: 0 },
        ),
        button("Get it by email", c.primary, { col: 0, role: "secondary" }),
        summary(c.collection, "list", {
          level: "h3",
          limit: 3,
          image: true,
          empty: BLOG_EMPTY,
          col: 1,
        }),
      ],
    }),
  }),
];

const events = (
  collection: string,
  variant: string,
  o: { heading?: string; level?: "h2" | "h3"; image?: boolean; limit?: number; col?: number },
) =>
  make(
    eventsBlock,
    {
      heading: o.heading,
      headingLevel: o.level ?? "h2",
      source: { collection, filter: { upcoming: true }, limit: o.limit ?? 6 },
      showImage: o.image ?? false,
      showLocation: true,
      showExcerpt: true,
      registerLabel: "Reserve a spot",
      emptyMessage: "No events on the calendar right now — new dates are posted every month.",
      structuredData: true,
    },
    { variant, ...(o.col !== undefined ? { col: o.col } : {}) },
  );

const EVENT_AVOID = "Listing past events as upcoming; events without a time zone or location.";

export const eventsPresets = [
  definePreset({
    category: "events",
    name: "list",
    label: "Upcoming events list",
    description: "Upcoming events as a clear list with dates, places and a register link.",
    copy: [headline],
    collections: ["events"],
    collection: "events",
    defaultTheme: "light",
    tags: ["list", "dates"],
    ai: {
      purpose: "What's on next, at a glance.",
      whenToUse: "Studios, venues, community groups and bands.",
      avoid: EVENT_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow" }),
      blocks: [events(c.collection, "list", { heading: "What's on" })],
    }),
  }),

  definePreset({
    category: "events",
    name: "cards",
    label: "Event cards",
    description: "Upcoming events as cards with images.",
    copy: [headline],
    collections: ["events"],
    collection: "events",
    defaultTheme: "light-accent",
    tags: ["cards", "image"],
    ai: {
      purpose: "A more visual programme of events.",
      whenToUse: "Workshops, retreats and festivals with event photos.",
      avoid: EVENT_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [events(c.collection, "cards", { heading: "Workshops & gatherings", image: true })],
    }),
  }),

  definePreset({
    category: "events",
    name: "calendar",
    label: "Event calendar",
    description: "A month calendar of events with an agenda beneath.",
    copy: [headline],
    collections: ["events"],
    collection: "events",
    defaultTheme: "light",
    tags: ["calendar"],
    ai: {
      purpose: "A full calendar for busy schedules.",
      whenToUse: "Venues and organisations with many events a month.",
      avoid: EVENT_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [events(c.collection, "calendar", { heading: "Calendar", limit: 20 })],
    }),
  }),

  definePreset({
    category: "events",
    name: "featured",
    label: "Featured event with list",
    description: "A photograph and introduction for the season beside the upcoming list.",
    copy: [headline, copy.body(10, 50)],
    images: [{ slot: "photo", aspect: "fill" }],
    collections: ["events"],
    collection: "events",
    defaultTheme: "dark",
    tags: ["image", "grid", "overlap", "list"],
    ai: {
      purpose: "Sets the mood for a season or series, then lists the dates.",
      whenToUse: "Concert series, supper clubs and seasonal programmes.",
      avoid: EVENT_AVOID,
    },
    make: (c) => {
      const pic = image(photo("stageLights", 690));
      const intro = text(
        [
          rt.p("Autumn season", "eyebrow"),
          rt.h(2, "Live at the Granary", "h2"),
          rt.p(
            "Folk, jazz and the occasional brass band in a 200-year-old barn. Doors at seven, music at eight.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } } },
      );
      const list = events(c.collection, "list", { level: "h3", limit: 4 });
      return {
        ...grid([
          [pic, r(1, 1, 13, 18), r(1, 1, 8, 11)],
          [intro, r(8, 12, 9, 10, { z: 2 }), r(1, 9, 8, 11, { z: 2 })],
          [list, r(17, 1, 8, 24), r(1, 21, 8, 16)],
        ]),
      };
    },
  }),
];

const PRODUCT_AVOID =
  "Products that aren't in the shop collection; prices typed into text (they come from the catalog).";
const product = (collection: string, variant: string, col?: number) =>
  make(
    productBlock,
    {
      product: { collection },
      showDescription: true,
      quantity: true,
      buttonLabel: "Add to cart",
      detailsLabel: "View details",
    },
    { variant, ...(col !== undefined ? { col } : {}) },
  );

export const productsPresets = [
  definePreset({
    category: "products",
    name: "grid",
    label: "Product grid",
    description: "A heading and a grid of products with prices.",
    copy: [headline],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "light",
    tags: ["grid", "shop"],
    ai: {
      purpose: "Shows a range of products with a way into the shop.",
      whenToUse: "Home pages and collection pages of shops.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [
        summary(c.collection, "grid", {
          heading: "New in the shop",
          columns: "4",
          limit: 8,
          date: false,
          excerpt: false,
          linkLabel: "Shop everything",
          link: `/${c.collection}/`,
          empty: "New pieces are being photographed — the shop reopens soon.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "products",
    name: "carousel",
    label: "Product carousel",
    description: "Products in a scrolling row — good for bestsellers.",
    copy: [headline],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "light-accent",
    tags: ["carousel", "shop"],
    ai: {
      purpose: "A compact showcase of favourites.",
      whenToUse: "Bestsellers, new arrivals or gift ideas on the home page.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [
        summary(c.collection, "carousel", {
          heading: "Customer favourites",
          limit: 8,
          date: false,
          excerpt: false,
          empty: "New pieces are being photographed — the shop reopens soon.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "products",
    name: "single-split",
    label: "Featured product",
    description: "One product with image, price, options and Add to cart.",
    copy: [],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "light",
    tags: ["single", "buy"],
    ai: {
      purpose: "Sells one product directly from a landing page.",
      whenToUse: "Launches and hero products.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => ({
      layout: stack(),
      blocks: [product(c.collection, "split")],
    }),
  }),

  definePreset({
    category: "products",
    name: "story-overlap",
    label: "Product with its story",
    description: "A making-of photograph layered with the product story and a buy box.",
    copy: [headline, copy.body(15, 70)],
    images: [{ slot: "photo", aspect: "fill" }],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "light-accent",
    tags: ["image", "grid", "overlap", "story"],
    ai: {
      purpose: "Tells how a product is made, then lets people buy it.",
      whenToUse: "Makers and small brands with a craft story.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => {
      const pic = image(photo("yogaMats", 640));
      const story = text(
        [
          rt.p("How it's made", "eyebrow"),
          rt.h(2, "Cork from the bark, not the tree", "h2"),
          rt.p(
            "Our mats are made from cork harvested by hand every nine years in Portugal. The tree keeps growing; the mat grips better the more you sweat.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } } },
      );
      const buy = product(c.collection, "minimal");
      return {
        ...grid([
          [pic, r(1, 1, 12, 22), r(1, 1, 8, 12)],
          [story, r(9, 4, 9, 12, { z: 2 }), r(1, 10, 8, 13, { z: 2 })],
          [buy, r(19, 4, 6, 14), r(1, 24, 8, 12)],
        ]),
      };
    },
  }),

  definePreset({
    category: "products",
    name: "card-trio",
    label: "Product with collection link",
    description: "A product card beside an introduction to the collection.",
    copy: [headline, copy.body(10, 50)],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "light",
    tags: ["card", "two-column"],
    links: { primary: "/shop/" },
    ai: {
      purpose: "Introduces a collection with one example product.",
      whenToUse: "Small shops highlighting a range.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [7, 5], gap: "2xl", align: "center" }),
      blocks: [
        heading("The practice collection", { col: 0, eyebrow: "Shop" }),
        text(
          [
            rt.p(
              "Everything we use in the studio, chosen to last for years: natural cork mats, organic cotton bolsters and blocks made from offcuts.",
            ),
          ],
          { col: 0 },
        ),
        button("Shop the collection", c.primary, { col: 0, role: "secondary" }),
        product(c.collection, "card", 1),
      ],
    }),
  }),

  definePreset({
    category: "products",
    name: "wall",
    label: "Product wall",
    description: "Large product tiles with names over the photographs.",
    copy: [headline],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "dark",
    tags: ["tiles", "image", "lookbook"],
    ai: {
      purpose: "A lookbook-style product index.",
      whenToUse: "Fashion, homeware and art shops with strong photography.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "wide" }),
      blocks: [
        summary(c.collection, "wall", {
          heading: "The autumn edit",
          columns: "3",
          limit: 6,
          date: false,
          excerpt: false,
          empty: "New pieces are being photographed — the shop reopens soon.",
        }),
      ],
    }),
  }),
];
