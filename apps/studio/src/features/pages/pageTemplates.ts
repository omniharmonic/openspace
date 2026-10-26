import {
  accordionBlock,
  buttonBlock,
  cardBlock,
  columnsBlock,
  contactInfoBlock,
  DEMO,
  eventsBlock,
  formBlock,
  galleryBlock,
  hoursBlock,
  imageBlock,
  linkListBlock,
  newsletterBlock,
  quoteBlock,
  rt,
  socialLinksBlock,
  starterSection,
  summaryBlock,
  textBlock,
} from "@openspace/blocks";
import type { Block, ColorTheme, Section } from "@openspace/schema";

/**
 * Page templates for "Add page" (Task 24): each builds real sections from library blocks with
 * fresh ids, in the site's own styles. Copy is written to be edited, never lorem ipsum.
 */
export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  /** Suggested page title and address. */
  title: string;
  slug: string;
  /** Section outline for the gallery thumbnail. */
  outline: Array<"hero" | "text" | "columns" | "image" | "form" | "list" | "links" | "band">;
  build: () => Section[];
}

/** A plain stacked section with a starter look (editors may add these; see `starterSection`). */
const section = (
  label: string,
  blocks: Block[],
  options: { columns?: number[]; theme?: ColorTheme; align?: "start" | "center" } = {},
): Section => starterSection(label, blocks, options);

const intro = (heading: string, body: string, theme: ColorTheme = "light") =>
  section(
    "Introduction",
    [textBlock.create({ fields: { content: rt.doc(rt.h(1, heading), rt.p(body)) } })],
    { theme, align: "center" },
  );

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    description: "One heading, ready for any sections you add",
    title: "New page",
    slug: "new-page",
    outline: ["text"],
    build: () => [
      section("Heading", [
        textBlock.create({
          fields: {
            content: rt.doc(rt.h(1, "New page"), rt.p("Start with a sentence about this page.")),
          },
        }),
      ]),
    ],
  },
  {
    id: "about",
    label: "About",
    description: "Your story, a photo and a few kind words",
    title: "About",
    slug: "about",
    outline: ["hero", "columns", "band"],
    build: () => [
      section(
        "Story",
        [
          textBlock.create({
            column: 0,
            fields: {
              content: rt.doc(
                rt.h(1, "About"),
                rt.p(
                  "Tell people who you are, what you care about and how you came to do this work.",
                ),
                rt.p(
                  "A second paragraph can cover what someone can expect when they work with you.",
                ),
              ),
            },
          }),
          imageBlock.create({ column: 1, fields: { image: DEMO.forest, aspect: "4:5" } }),
        ],
        { columns: [6, 6], align: "center" },
      ),
      section("Values", [columnsBlock.create()]),
      section("Kind words", [quoteBlock.create({ variant: "large" })], { theme: "dark" }),
    ],
  },
  {
    id: "services",
    label: "Services",
    description: "What you offer, with prices and questions",
    title: "Services",
    slug: "services",
    outline: ["text", "columns", "list", "band"],
    build: () => [
      intro("Services", "A short line about how you help, and who it's for."),
      section("Offerings", [cardBlock.create(), cardBlock.create(), cardBlock.create()], {
        columns: [4, 4, 4],
      }),
      section("Questions", [
        textBlock.create({ fields: { content: rt.doc(rt.h(2, "Questions")) } }),
        accordionBlock.create(),
      ]),
      section(
        "Book",
        [
          textBlock.create({
            fields: {
              content: rt.doc(rt.h(2, "Ready when you are"), rt.p("Pick a time that suits you.")),
            },
          }),
          buttonBlock.create(),
        ],
        { theme: "light-accent", align: "center" },
      ),
    ],
  },
  {
    id: "contact",
    label: "Contact",
    description: "A form, your details and opening hours",
    title: "Contact",
    slug: "contact",
    outline: ["text", "form"],
    build: () => [
      section(
        "Contact",
        [
          textBlock.create({
            column: 0,
            fields: {
              content: rt.doc(rt.h(1, "Get in touch"), rt.p("We reply within a working day.")),
            },
          }),
          contactInfoBlock.create({ column: 0 }),
          hoursBlock.create({ column: 0 }),
          formBlock.create({ column: 1 }),
        ],
        { columns: [5, 7] },
      ),
    ],
  },
  {
    id: "blog",
    label: "Blog",
    description: "Your latest posts, with a signup at the end",
    title: "Journal",
    slug: "journal",
    outline: ["text", "list", "band"],
    build: () => [
      intro("Journal", "Notes, news and the occasional recipe."),
      section("Latest posts", [
        summaryBlock.create({
          variant: "list",
          fields: { heading: undefined, linkLabel: undefined, link: undefined },
        }),
      ]),
      section("Newsletter", [newsletterBlock.create({ variant: "card" })], {
        theme: "light-accent",
      }),
    ],
  },
  {
    id: "events",
    label: "Events",
    description: "Upcoming dates from your events collection",
    title: "Events",
    slug: "events",
    outline: ["text", "list"],
    build: () => [
      intro("Events", "Workshops, gatherings and retreats coming up."),
      section("Upcoming", [eventsBlock.create()]),
    ],
  },
  {
    id: "shop",
    label: "Shop",
    description: "Products from your store, ready to buy",
    title: "Shop",
    slug: "shop",
    outline: ["text", "list", "image"],
    build: () => [
      intro("Shop", "Small-batch goods, made with care."),
      section("Products", [
        summaryBlock.create({
          variant: "grid",
          fields: {
            heading: undefined,
            source: { collection: "products", sort: "date-desc", limit: 12 },
            linkLabel: undefined,
            link: undefined,
            emptyMessage: "New products are on their way.",
          },
        }),
      ]),
      section("Gallery", [galleryBlock.create()]),
    ],
  },
  {
    id: "links",
    label: "Link in bio",
    description: "A tidy list of links for your social profiles",
    title: "Links",
    slug: "links",
    outline: ["hero", "links"],
    build: () => [
      section(
        "Links",
        [
          imageBlock.create({ fields: { image: DEMO.yogaDeck, aspect: "1:1" } }),
          textBlock.create({
            fields: { content: rt.doc(rt.h(1, "Hello"), rt.p("Everything in one place.")) },
          }),
          linkListBlock.create(),
          socialLinksBlock.create(),
        ],
        { align: "center" },
      ),
    ],
  },
];

export function pageTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}
