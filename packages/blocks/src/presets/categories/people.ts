import { accordionBlock } from "../../blocks/accordion";
import { statsBlock } from "../../blocks/data";
import { logoStripBlock } from "../../blocks/logo-strip";
import { tabsBlock } from "../../blocks/tabs";
import { teamBlock } from "../../blocks/team";
import { type PhotoKey, photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";

/** FAQ, team, stats and logos presets. */

const headline = copy.headline(1, 10, 2);
const q = copy.items("question", "Question", "accordion", "items", "question", 3, 16);
const FAQ_AVOID =
  "Inventing policies, guarantees or prices; answers longer than a short paragraph; more than ten questions in one list.";

const qa = (question: string, answer: string) => ({ question, answer: rt.doc(rt.p(answer)) });
const accordion = (
  items: ReturnType<typeof qa>[],
  variant: string,
  col?: number,
  openFirst = false,
) =>
  make(
    accordionBlock,
    { items, exclusive: false, openFirst, faqSchema: true },
    { variant, ...(col !== undefined ? { col } : {}) },
  );

const VISIT_FAQ = [
  qa(
    "Do I need to book?",
    "We keep half the tables for walk-ins. For groups of six or more, please book ahead.",
  ),
  qa(
    "Do you cater for allergies?",
    "Yes. Tell your server and the kitchen will walk you through every dish. Most of the menu can be made gluten-free.",
  ),
  qa(
    "Is there parking?",
    "There's free street parking after 6pm and a public lot two minutes' walk away on Ash Street.",
  ),
  qa(
    "Can I bring my dog?",
    "Well-behaved dogs are very welcome on the patio, and there's always a water bowl by the door.",
  ),
];

const person = (name: string, role: string, face: PhotoKey, bio?: string, w = 320) => ({
  name,
  role,
  photo: photo(face, w, "4:5"),
  ...(bio ? { bio } : {}),
});

export const faqPresets = [
  definePreset({
    category: "faq",
    name: "split",
    label: "Questions beside heading",
    description: "A heading and contact prompt on the left, questions on the right.",
    copy: [headline, q, copy.body(4, 25)],
    defaultTheme: "light",
    tags: ["accordion", "two-column"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Answers common questions before people need to ask.",
      whenToUse: "Home, services and booking pages.",
      avoid: FAQ_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Good to know before you visit", { col: 0, eyebrow: "FAQ" }),
        text([rt.p("Can't find what you're looking for? We're happy to help.")], { col: 0 }),
        button("Get in touch", c.primary, { col: 0, role: "secondary" }),
        accordion(VISIT_FAQ, "lines", 1, true),
      ],
    }),
  }),

  definePreset({
    category: "faq",
    name: "centered",
    label: "Centred questions",
    description: "A centred heading over a narrow column of questions.",
    copy: [headline, q],
    defaultTheme: "light-accent",
    tags: ["accordion", "centered"],
    ai: {
      purpose: "A calm, focused list of frequently asked questions.",
      whenToUse: "FAQ pages and the end of long landing pages.",
      avoid: FAQ_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Questions about your first class", { align: "center", eyebrow: "New students" }),
        accordion(
          [
            qa(
              "I've never done yoga. Is that OK?",
              "Absolutely. Foundations classes are designed for complete beginners, and every teacher offers options for every pose.",
            ),
            qa(
              "What should I bring?",
              "Just comfortable clothes and water. Mats, blocks and blankets are provided.",
            ),
            qa(
              "How early should I arrive?",
              "Ten minutes before your first class, so we can show you around and ask about any injuries.",
            ),
            qa(
              "Can I cancel a booking?",
              "Yes, up to four hours before class without losing your credit.",
            ),
          ],
          "minimal",
        ),
      ],
    }),
  }),

  definePreset({
    category: "faq",
    name: "cards",
    label: "Question cards",
    description: "Questions as soft cards, with a closing prompt to get in touch.",
    copy: [headline, q],
    tags: ["accordion", "cards"],
    links: { primary: "/contact" },
    ai: {
      purpose: "A friendlier, more visual FAQ.",
      whenToUse: "Consumer businesses: shops, events, family services.",
      avoid: FAQ_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Ordering and delivery", { align: "center", eyebrow: "Help" }),
        accordion(
          [
            qa(
              "How long does delivery take?",
              "Orders placed before noon ship the same day. Most arrive within two to three working days.",
            ),
            qa(
              "Can I return something?",
              "Yes, within 30 days in its original condition. Return postage is on us.",
            ),
            qa(
              "Do you ship internationally?",
              "We ship to Canada, the UK and the EU. Duties are calculated at checkout.",
            ),
          ],
          "cards",
        ),
        button("Ask us anything", c.primary, {
          role: "secondary",
          align: "center",
          note: "We reply within one working day.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "faq",
    name: "by-topic",
    label: "Questions by topic",
    description: "Questions grouped into tabs by topic.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["tabs", "topics"],
    ai: {
      purpose: "Organises a long FAQ into a few topics.",
      whenToUse: "When there are more than eight questions across clear themes.",
      avoid: FAQ_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Frequently asked questions", { eyebrow: "Help centre" }),
        make(
          tabsBlock,
          {
            label: "Question topics",
            items: [
              {
                label: "Booking",
                content: rt.doc(
                  rt.h(3, "How do I book a stay?", "h4"),
                  rt.p(
                    "Choose your dates on the availability calendar and pay a 30% deposit to confirm.",
                  ),
                  rt.h(3, "Can I change my dates?", "h4"),
                  rt.p("Free of charge up to 30 days before arrival, subject to availability."),
                ),
              },
              {
                label: "Your stay",
                content: rt.doc(
                  rt.h(3, "What time is check-in?", "h4"),
                  rt.p(
                    "From 4pm. Check-out is at 11am, and late check-out is often possible on Sundays.",
                  ),
                  rt.h(3, "Is breakfast included?", "h4"),
                  rt.p("Yes — a basket of local bread, eggs and fruit is waiting in the kitchen."),
                ),
              },
              {
                label: "Getting here",
                content: rt.doc(
                  rt.h(3, "Do I need a car?", "h4"),
                  rt.p(
                    "It helps. The nearest station is twenty minutes away, and we can arrange a taxi.",
                  ),
                ),
              },
            ],
          },
          { variant: "pills" },
        ),
      ],
    }),
  }),
];

const TEAM_AVOID =
  "Inventing staff, titles or qualifications; photos of people who don't work there.";

export const teamPresets = [
  definePreset({
    category: "team",
    name: "grid",
    label: "Team grid",
    description: "A heading and a grid of portraits with names and roles.",
    copy: [headline, copy.sub(6, 30)],
    images: [{ slot: "portraits", aspect: "4:5", count: 4 }],
    tags: ["portraits", "grid"],
    ai: {
      purpose: "Puts faces to the business.",
      whenToUse: "About pages and teams of three to twelve people.",
      avoid: TEAM_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("The people behind the work", {
          eyebrow: "Our team",
          sub: "A small team who've worked together for years — and still care about every detail.",
        }),
        make(
          teamBlock,
          {
            columns: "4",
            people: [
              person("Elena Ruiz", "Founder", "portraitMaya"),
              person("Sam Okoro", "Lead", "portraitSam"),
              person("Clara Jensen", "Client care", "portraitClara"),
              person("Theo Marsh", "Operations", "portraitTheo"),
            ],
          },
          { variant: "grid" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "team",
    name: "circles",
    label: "Team in circles",
    description: "A centred heading with round portraits — friendly and compact.",
    copy: [headline],
    images: [{ slot: "portraits", aspect: "1:1", count: 3 }],
    defaultTheme: "light-accent",
    tags: ["portraits", "centered", "compact"],
    ai: {
      purpose: "A light-touch introduction to a small team.",
      whenToUse: "Home pages and small practices of two to six people.",
      avoid: TEAM_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Your teachers", { align: "center", eyebrow: "Meet us" }),
        make(
          teamBlock,
          {
            columns: "3",
            people: [
              person("Maya Lindqvist", "Founder · Vinyasa", "portraitAna", undefined, 200),
              person("Daniel Brooks", "Yin & restorative", "portraitDaniel", undefined, 200),
              person("Iris Chen", "Pregnancy yoga", "portraitIris", undefined, 200),
            ],
          },
          { variant: "circles" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "team",
    name: "bios",
    label: "Team with bios",
    description: "Portraits with longer biographies in a list.",
    copy: [headline, copy.items("bio", "Biography", "team", "people", "bio", 12, 55)],
    images: [{ slot: "portraits", aspect: "4:5", count: 2 }],
    defaultTheme: "light",
    tags: ["portraits", "list", "bios"],
    ai: {
      purpose: "Introduces each practitioner properly, with credentials.",
      whenToUse: "Clinics, law firms, consultancies — where clients choose a person.",
      avoid: TEAM_AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Our physiotherapists", { eyebrow: "The clinic" }),
        make(
          teamBlock,
          {
            columns: "2",
            people: [
              person(
                "Dr Nina Alvarez",
                "Clinical director",
                "portraitNina",
                "Nina has treated runners, dancers and desk-bound backs for fifteen years. She specialises in knee and hip rehabilitation and still runs the trails every Sunday.",
                220,
              ),
              person(
                "Marcus Bell",
                "Sports physiotherapist",
                "portraitMarcus",
                "Marcus works with the county rugby club and leads our return-to-sport programme. Ask him about the stretch that fixed his own shoulder.",
                220,
              ),
            ],
          },
          { variant: "list" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "team",
    name: "founder-overlap",
    label: "Founder spotlight",
    description: "A founder portrait with a biography panel layered beside it.",
    copy: [headline, copy.body(25, 100)],
    images: [{ slot: "portrait", aspect: "fill" }],
    defaultTheme: "light-accent",
    tags: ["portrait", "grid", "overlap", "founder"],
    links: { primary: "/about" },
    ai: {
      purpose: "Spotlights one person — usually the founder — in depth.",
      whenToUse: "Owner-led businesses where trust is personal.",
      avoid: TEAM_AVOID,
    },
    make: (c) => {
      const pic = image(photo("portraitOwen", 580));
      const panel = text(
        [
          rt.p("Founder", "eyebrow"),
          rt.h(2, "Marion Hughes", "h2"),
          rt.p(
            "Marion built her first bike from scrap parts at eleven and opened the shop at twenty-four. Forty years later she still does every wheel build herself and teaches the Tuesday repair class.",
          ),
        ],
        { style: { colorTheme: c.theme, padding: { d: "xl", m: "md" } } },
      );
      const cta = button("Read our story", c.primary, { role: "tertiary" });
      return {
        ...grid([
          // Phones: the words and button first, the portrait after them.
          [pic, r(13, 1, 10, 24), r(2, 19, 7, 16)],
          [panel, r(3, 5, 12, 14, { z: 2 }), r(1, 1, 8, 14, { z: 2 })],
          [cta, r(4, 20, 9, 3), r(1, 15, 8, 3)],
        ]),
      };
    },
  }),
];

export const statsPresets = [
  definePreset({
    category: "stats",
    name: "row",
    label: "Numbers in a row",
    description: "A centred heading with three or four key numbers in a row.",
    copy: [headline, copy.items("stat", "Stat label", "stats", "items", "label", 1, 8)],
    defaultTheme: "dark-accent",
    tags: ["numbers", "impact", "centered"],
    ai: {
      purpose: "Shows impact or scale in a few numbers.",
      whenToUse: "Nonprofits, established businesses and annual reports.",
      avoid: "Numbers the owner can't verify; vanity metrics; more than four numbers.",
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Our year in numbers", { align: "center", eyebrow: "2025 impact" }),
        make(
          statsBlock,
          {
            items: [
              { value: "38,000", label: "Meals served" },
              { value: "212", label: "Volunteers" },
              { value: "14", label: "Partner schools" },
              { value: "92¢", label: "Of every dollar to programs" },
            ],
          },
          { variant: "row", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "cards",
    label: "Numbers on cards",
    description:
      "A heading and introduction beside numbers on cards, each with a short explanation.",
    copy: [
      headline,
      copy.sub(6, 30),
      copy.items("detail", "Stat detail", "stats", "items", "detail", 4, 20),
    ],
    defaultTheme: "light",
    tags: ["numbers", "cards", "two-column"],
    ai: {
      purpose: "Numbers with context — what each one means.",
      whenToUse: "Results pages, case studies and investor or donor updates.",
      avoid: "Numbers the owner can't verify; vanity metrics; more than four numbers.",
    },
    make: () => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Results that last", {
          col: 0,
          eyebrow: "Outcomes",
          sub: "Measured with every client six months after their last session.",
        }),
        make(
          statsBlock,
          {
            items: [
              {
                value: "87%",
                label: "Pain-free at six months",
                detail: "Self-reported by clients with chronic back pain.",
              },
              {
                value: "9 / 10",
                label: "Back to their sport",
                detail: "Athletes returning within the expected timeline.",
              },
              {
                value: "6",
                label: "Average sessions",
                detail: "Most people need fewer than they expect.",
              },
            ],
          },
          { col: 1, variant: "cards" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "stats",
    name: "with-image",
    label: "Big numbers with photo",
    description: "Large numbers beside a photograph of the work behind them.",
    copy: [headline],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light-accent",
    tags: ["numbers", "image", "two-column"],
    ai: {
      purpose: "Grounds impact numbers in a real photo of the people involved.",
      whenToUse: "Community groups, schools, farms and cooperatives.",
      avoid: "Numbers the owner can't verify; photos of people without consent.",
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl", align: "center" }),
      blocks: [
        image(photo("kidsSmiling", 520, "4:5"), { col: 0, aspect: "4:5" }),
        heading("Ten summers of free sports camp", { col: 1, eyebrow: "Since 2016" }),
        make(
          statsBlock,
          {
            items: [
              { value: "4,600", label: "Kids through camp" },
              { value: "100%", label: "Free to every family" },
              { value: "31", label: "Local coaches" },
            ],
          },
          { col: 1, variant: "large" },
        ),
      ],
    }),
  }),
];

const LOGO_AVOID =
  "Logos of companies or publications that never worked with or covered the business.";
const logos = (...names: string[]) => names.map((name) => ({ name }));

export const logosPresets = [
  definePreset({
    category: "logos",
    name: "row",
    label: "Logo row",
    description: "A short label and a single row of partner or press logos.",
    copy: [],
    defaultTheme: "light",
    tags: ["logos", "press", "compact"],
    ai: {
      purpose: "Borrowed credibility in one quiet line.",
      whenToUse: "Under a hero, or between testimonials and a call to action.",
      avoid: LOGO_AVOID,
    },
    make: () => ({
      layout: stack(),
      padding: { d: "md", m: "md" },
      blocks: [
        make(
          logoStripBlock,
          {
            label: "Trusted by teams at",
            logos: logos(
              "Northwind Co-op",
              "Harbor Mutual",
              "Juniper & Vale",
              "Clearwater Labs",
              "Oak Street Books",
            ),
            monochrome: true,
          },
          { variant: "row" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "logos",
    name: "grid",
    label: "Partner grid",
    description: "A heading and introduction above a grid of partner logos.",
    copy: [headline, copy.sub(6, 30)],
    defaultTheme: "light-accent",
    tags: ["logos", "partners", "grid"],
    ai: {
      purpose: "Recognises funders, partners or stockists.",
      whenToUse: "Nonprofits, coalitions and brands with many stockists.",
      avoid: LOGO_AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Where to find our sauces", {
          align: "center",
          eyebrow: "Stockists",
          sub: "Independent grocers and delis across the Southwest — with more joining every month.",
        }),
        make(
          logoStripBlock,
          {
            label: undefined,
            logos: logos(
              "Mesa Market",
              "The Corner Larder",
              "Adobe Grocery",
              "Rio Fresh",
              "Sunbelt Deli",
              "High Desert Co-op",
              "Plaza Provisions",
              "Green Chile Store",
            ),
            monochrome: true,
          },
          { variant: "grid" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "logos",
    name: "marquee",
    label: "Scrolling press strip",
    description: "Press or partner names gliding past in a continuous strip.",
    copy: [],
    defaultTheme: "dark",
    tags: ["logos", "press", "motion"],
    ai: {
      purpose: "A lively way to show many publications or partners.",
      whenToUse: "Launches, events and brands with lots of coverage.",
      avoid: LOGO_AVOID,
    },
    make: () => ({
      layout: stack({ width: "full" }),
      padding: { d: "md", m: "sm" },
      blocks: [
        make(
          logoStripBlock,
          {
            label: "In the press",
            logos: logos(
              "The Weekend Paper",
              "Craft & Table",
              "City Living",
              "Good Design Daily",
              "Maker Monthly",
              "The Local Gazette",
            ),
            monochrome: true,
          },
          { variant: "marquee" },
        ),
      ],
    }),
  }),
];
