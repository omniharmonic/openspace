import {
  accordionBlock,
  buttonBlock,
  cardBlock,
  columnsBlock,
  DEMO,
  embedBlock,
  formBlock,
  imageBlock,
  newsletterBlock,
  quoteBlock,
  rt,
  socialLinksBlock,
  testimonialBlock,
  textBlock,
} from "@openspace/blocks";
import type { Block, ColorTheme, Page, Section, SiteDocument } from "@openspace/schema";

/**
 * A complete site document built from the real block library, used by the mock Hub
 * (`VITE_MOCK_API=1`) and by editor tests. Ids are deterministic so tests can address them.
 */

const id = (prefix: "pg" | "sec" | "blk", n: number) =>
  `${prefix}_dev${String(n).padStart(7, "0")}` as never;

export const DEV_IDS = {
  home: id("pg", 1),
  about: id("pg", 2),
  classes: id("pg", 3),
  hero: id("sec", 1),
  intro: id("sec", 2),
  offerings: id("sec", 3),
  story: id("sec", 4),
  faq: id("sec", 5),
  signup: id("sec", 6),
  aboutText: id("sec", 7),
  classesText: id("sec", 8),
  contact: id("sec", 9),
  footer: id("sec", 10),
  workshops: id("sec", 11),
  heroHeading: id("blk", 1),
  heroButton: id("blk", 2),
  heroImage: id("blk", 3),
  introText: id("blk", 4),
  offeringsHeading: id("blk", 5),
  offeringsColumns: id("blk", 6),
  storyImage: id("blk", 7),
  storyQuote: id("blk", 8),
  storyTestimonial: id("blk", 9),
  faqHeading: id("blk", 10),
  faqAccordion: id("blk", 11),
  signupText: id("blk", 12),
  signupNewsletter: id("blk", 13),
  aboutHeading: id("blk", 14),
  aboutImage: id("blk", 15),
  aboutCard: id("blk", 16),
  classesHeading: id("blk", 17),
  classesEmbed: id("blk", 18),
  contactText: id("blk", 19),
  contactForm: id("blk", 20),
  footerText: id("blk", 21),
  footerSocial: id("blk", 22),
} as const;

function stack(
  sid: string,
  label: string,
  blocks: Block[],
  options: {
    theme?: ColorTheme;
    columns?: number[];
    align?: "start" | "center" | "end" | "stretch";
  } = {},
): Section {
  return {
    id: sid as Section["id"],
    label,
    layout: {
      mode: "stack",
      columns: { d: options.columns ?? [12], m: [12] },
      ...(options.align ? { align: options.align } : {}),
    },
    style: { colorTheme: options.theme ?? "light" },
    blocks,
  };
}

export interface DevSiteOptions {
  siteId?: string;
  name?: string;
  tagline?: string | null;
  url?: string;
}

export function devSiteDocument(options: DevSiteOptions = {}): SiteDocument {
  const I = DEV_IDS;
  const name = options.name ?? "Willow Street Yoga";
  const tagline = options.tagline ?? "Slow classes for busy people";

  const home: Page = {
    id: I.home,
    title: "Home",
    slug: "",
    seo: { description: tagline },
    sections: [
      {
        ...stack(
          I.hero,
          "Hero",
          [
            textBlock.create({
              id: I.heroHeading,
              column: 0,
              fields: {
                content: rt.doc(
                  rt.p("Community studio · since 2014", "eyebrow"),
                  rt.h(1, name, "display"),
                  rt.p(tagline, "lead"),
                ),
              },
            }),
            buttonBlock.create({
              id: I.heroButton,
              column: 0,
              fields: { label: "See the schedule", secondaryLabel: "First class free" },
            }),
            imageBlock.create({
              id: I.heroImage,
              column: 1,
              fields: { image: DEMO.yogaDeck, aspect: "4:5" },
            }),
          ],
          { theme: "light-accent", columns: [7, 5], align: "center" },
        ),
        style: { colorTheme: "light-accent", padding: { d: "xl", m: "lg" } },
      },
      stack(I.intro, "Introduction", [textBlock.create({ id: I.introText })]),
      stack(
        I.offerings,
        "What we offer",
        [
          textBlock.create({
            id: I.offeringsHeading,
            fields: {
              content: rt.doc(
                rt.h(2, "Three ways to practise"),
                rt.p("Every class is capped at twelve people, so teachers learn your name."),
              ),
            },
          }),
          columnsBlock.create({ id: I.offeringsColumns }),
        ],
        { theme: "light" },
      ),
      stack(
        I.story,
        "Stories",
        [
          imageBlock.create({ id: I.storyImage, column: 0, fields: { image: DEMO.hills } }),
          quoteBlock.create({ id: I.storyQuote, column: 1 }),
          testimonialBlock.create({ id: I.storyTestimonial, column: 1 }),
        ],
        { theme: "dark", columns: [6, 6], align: "center" },
      ),
      stack(I.faq, "Questions", [
        textBlock.create({
          id: I.faqHeading,
          fields: { content: rt.doc(rt.h(2, "Before your first class")) },
        }),
        accordionBlock.create({ id: I.faqAccordion }),
      ]),
      stack(
        I.signup,
        "Newsletter",
        [
          textBlock.create({
            id: I.signupText,
            column: 0,
            fields: {
              content: rt.doc(
                rt.h(2, "One letter a month"),
                rt.p("New classes, workshops and the occasional recipe. Never more than that."),
              ),
            },
          }),
          newsletterBlock.create({ id: I.signupNewsletter, column: 1 }),
        ],
        { theme: "brand", columns: [6, 6], align: "center" },
      ),
    ],
  };

  const about: Page = {
    id: I.about,
    title: "About",
    slug: "about",
    sections: [
      stack(
        I.aboutText,
        "Our story",
        [
          textBlock.create({
            id: I.aboutHeading,
            column: 0,
            fields: {
              content: rt.doc(
                rt.h(1, "Six mats and a kettle"),
                rt.p(
                  "We started in a borrowed room above a bakery. The mats were mismatched and the kettle was always on. Ten years later the room is bigger, but the classes are still small.",
                  "lead",
                ),
                rt.ul(
                  "Classes capped at twelve",
                  "Teachers with 500+ training hours",
                  "Tea after every evening class",
                ),
              ),
            },
          }),
          imageBlock.create({ id: I.aboutImage, column: 1, fields: { image: DEMO.portraitLake } }),
        ],
        { columns: [7, 5], align: "center" },
      ),
      stack(I.workshops, "Workshops", [cardBlock.create({ id: I.aboutCard })]),
    ],
  };

  const classes: Page = {
    id: I.classes,
    title: "Classes",
    slug: "classes",
    sections: [
      stack(I.classesText, "Schedule", [
        textBlock.create({
          id: I.classesHeading,
          fields: {
            content: rt.doc(
              rt.h(1, "This week’s classes"),
              rt.p("Book online below. Drop-ins are welcome when there’s a free mat."),
            ),
          },
        }),
        embedBlock.create({
          id: I.classesEmbed,
          fields: {
            title: "Class schedule",
            embed: {
              type: "code",
              code: '<div id="s" style="padding:24px;border:1px dashed currentColor;border-radius:12px">Loading the schedule…</div><script>document.getElementById("s").textContent="Mon 7:00 Foundations · Wed 18:30 Slow flow · Sat 9:00 Restorative";</script>',
            },
          },
        }),
      ]),
      stack(
        I.contact,
        "Contact",
        [
          textBlock.create({
            id: I.contactText,
            column: 0,
            fields: {
              content: rt.doc(
                rt.h(2, "Ask us anything"),
                rt.p("We answer within a day, usually between classes."),
              ),
            },
          }),
          formBlock.create({ id: I.contactForm, column: 1 }),
        ],
        { theme: "light-accent", columns: [5, 7] },
      ),
    ],
  };

  return {
    config: {
      siteId: (options.siteId ?? "st_8m2kq0w4zd") as never,
      schemaVersion: 1,
      template: { id: "meadow", version: "1.0.0" },
      hub: "https://hub.openspace.dev",
      deploy: {
        target: "github-pages",
        url: options.url ?? "https://sam-rivera.github.io/willow-street-yoga",
        customDomain: null,
      },
      features: { forms: true, newsletter: true, analytics: false, search: false },
    },
    site: {
      title: name,
      tagline,
      logo: null,
      nav: [
        { type: "page", page: I.home, label: "Home" },
        { type: "page", page: I.about },
        { type: "page", page: I.classes },
        {
          type: "button",
          label: "Book a class",
          link: { type: "page", page: I.classes },
          style: "primary",
        },
      ],
      header: {
        variant: "classic-left",
        sticky: true,
        transparentOnHero: false,
        mobileMenu: "slide",
      },
      footer: {
        id: I.footer,
        layout: { mode: "stack", columns: { d: [8, 4], m: [12] }, align: "center" },
        style: { colorTheme: "dark" },
        blocks: [
          textBlock.create({
            id: I.footerText,
            column: 0,
            fields: {
              content: rt.doc(
                rt.p([rt.bold(name)]),
                rt.p("214 Willow Street · Open daily from 6:30", "small"),
              ),
            },
          }),
          socialLinksBlock.create({ id: I.footerSocial, column: 1 }),
        ],
      },
      social: [
        { network: "instagram", url: "https://instagram.com/willowstreetyoga" },
        { network: "email", url: "mailto:hello@willowstreetyoga.com" },
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
    pages: { [I.home]: home, [I.about]: about, [I.classes]: classes },
    collections: {},
    media: {},
  } as SiteDocument;
}

/** A content-less document (no pages) used while a new site is still being set up. */
export function placeholderDocument(): SiteDocument {
  const doc = devSiteDocument();
  return {
    ...doc,
    site: { ...doc.site, nav: [], footer: { ...doc.site.footer, blocks: [] } },
    pages: {},
  };
}
