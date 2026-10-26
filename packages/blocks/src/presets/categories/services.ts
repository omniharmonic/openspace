import { accordionBlock } from "../../blocks/accordion";
import { columnsBlock, iconListBlock } from "../../blocks/card";
import { restaurantMenuBlock } from "../../blocks/restaurant-menu";
import { tabsBlock } from "../../blocks/tabs";
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

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(8, 40);
const AVOID =
  "Services the owner doesn't offer, invented prices or guarantees. More than six services in one section — link to a services page instead.";

export const servicesPresets = [
  definePreset({
    category: "services",
    name: "image-cards",
    label: "Three services with photos",
    description:
      "A heading and three service cards, each with a photo, short description and link.",
    copy: [
      headline,
      intro,
      copy.items("service", "Service description", "columns", "items", "body", 8, 40),
    ],
    images: [{ slot: "cards", aspect: "4:5", count: 3 }],
    tags: ["image", "cards", "three-up"],
    ai: {
      purpose: "Introduces the main things the business offers, each with a way in.",
      whenToUse: "Home pages and services overviews with two to four offerings.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Ways to work with us", {
          eyebrow: "Services",
          sub: "From a single consultation to a whole new garden, we work at the pace and budget that suits you.",
        }),
        make(
          columnsBlock,
          {
            columns: "3",
            aspect: "4:5",
            items: [
              {
                image: photo("gardenTrowel", 400, "4:5"),
                heading: "Garden consultations",
                body: rt.doc(
                  rt.p(
                    "Two hours on site with a designer, a written plan and a plant list you can take to any nursery.",
                  ),
                ),
                link: url("/services/consultations"),
                linkLabel: "About consultations",
              },
              {
                image: photo("seedlings", 400, "4:5"),
                heading: "Planting design",
                body: rt.doc(
                  rt.p(
                    "Borders, meadows and pots planned for year-round interest and very little watering.",
                  ),
                ),
                link: url("/services/planting"),
                linkLabel: "About planting",
              },
              {
                image: photo("porchHouse", 400, "4:5"),
                heading: "Full garden builds",
                body: rt.doc(
                  rt.p(
                    "Design, landscaping and planting by our own crew, with a season of aftercare included.",
                  ),
                ),
                link: url("/services/builds"),
                linkLabel: "About garden builds",
              },
            ],
          },
          { variant: "plain" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "price-list",
    label: "Service menu with prices",
    description: "A heading beside a tidy list of services grouped by type, each with a price.",
    copy: [headline, intro],
    defaultTheme: "light-accent",
    tags: ["prices", "list", "salon"],
    links: { primary: "/book" },
    ai: {
      purpose: "A clear price list people can scan before booking.",
      whenToUse: "Salons, barbers, spas, clinics and trades with fixed prices.",
      avoid: `${AVOID} Prices the owner hasn't confirmed.`,
    },
    make: (c) => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Cuts, colour & care", {
          col: 0,
          eyebrow: "Price list",
          sub: "Every appointment starts with a consultation and ends with a style you can recreate at home.",
        }),
        button("Book an appointment", c.primary, { col: 0 }),
        make(
          restaurantMenuBlock,
          {
            currency: "$",
            legend: false,
            sections: [
              {
                title: "Cuts",
                items: [
                  {
                    name: "Restyle cut",
                    description: "Consultation, wash, cut and finish.",
                    price: "85",
                    dietary: [],
                  },
                  {
                    name: "Trim & tidy",
                    description: "Keeping your current shape fresh.",
                    price: "60",
                    dietary: [],
                  },
                  { name: "Short cut & clipper work", price: "45", dietary: [] },
                ],
              },
              {
                title: "Colour",
                items: [
                  {
                    name: "Full head colour",
                    description: "Includes a toner and gloss.",
                    price: "from 120",
                    dietary: [],
                  },
                  {
                    name: "Balayage",
                    description: "Hand-painted, soft grow-out.",
                    price: "from 190",
                    dietary: [],
                  },
                ],
              },
            ],
            footnote:
              "Prices vary with hair length and thickness — we'll always confirm before we start.",
          },
          { col: 1, variant: "minimal" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "icon-grid",
    label: "Service grid with icons",
    description: "A centred heading and six services as icon tiles.",
    copy: [
      headline,
      intro,
      copy.items("service", "Service description", "icon-list", "items", "text", 4, 30),
    ],
    tags: ["icons", "grid", "six-up"],
    ai: {
      purpose: "A compact overview of many related services.",
      whenToUse: "Trades, agencies and clinics with four to six services.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Everything your home needs, one call away", {
          align: "center",
          eyebrow: "What we do",
          sub: "Licensed, insured and local — with a two-hour arrival window you can actually rely on.",
        }),
        make(
          iconListBlock,
          {
            columns: "3",
            items: [
              {
                icon: "wrench",
                title: "Repairs",
                text: "Dripping taps, sticking doors and everything in between.",
              },
              {
                icon: "zap",
                title: "Electrical",
                text: "Lights, sockets and safety checks by certified electricians.",
              },
              { icon: "waves", title: "Plumbing", text: "Leaks, boilers and bathroom refits." },
              {
                icon: "brush",
                title: "Decorating",
                text: "Interior painting with low-odour, eco paints.",
              },
              {
                icon: "home",
                title: "Carpentry",
                text: "Shelves, built-in wardrobes and garden decking.",
              },
              {
                icon: "shield-check",
                title: "Maintenance plans",
                text: "Twice-yearly visits so small problems stay small.",
              },
            ],
          },
          { variant: "tiles" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "alternating",
    label: "Alternating image and text",
    description: "Two services as alternating rows of photo and description.",
    copy: [copy.headline(2, 8, 2), copy.body(15, 70)],
    images: [{ slot: "photos", aspect: "fill", count: 2 }],
    tags: ["image", "grid", "rows"],
    ai: {
      purpose: "Gives two flagship services room to breathe, each with its own photo.",
      whenToUse: "Studios and practitioners with two main offerings.",
      avoid: AVOID,
    },
    make: () => {
      const p1 = image(photo("studioStretch", 660));
      const t1 = text([
        rt.p("Group classes", "eyebrow"),
        rt.h(2, "Small classes, big attention", "h2"),
        rt.p(
          "Never more than twelve on the mat. Teachers learn your name, your injuries and how you like to be adjusted — or not adjusted at all.",
        ),
        rt.p([rt.link("See the class timetable →", "/timetable")]),
      ]);
      const p2 = image(photo("yogaDeck", 660));
      const t2 = text([
        rt.p("Private sessions", "eyebrow"),
        rt.h(2, "One to one, at your pace", "h2"),
        rt.p(
          "Ideal after an injury, during pregnancy or if you'd simply like to build a home practice that fits your life.",
        ),
        rt.p([rt.link("Book a private session →", "/privates")]),
      ]);
      return {
        ...grid([
          [p1, r(1, 1, 12, 16), r(1, 1, 8, 11)],
          [t1, r(15, 4, 9, 10), r(1, 12, 8, 10)],
          [p2, r(13, 18, 12, 16), r(1, 23, 8, 11)],
          [t2, r(2, 21, 9, 10), r(1, 34, 8, 10)],
        ]),
      };
    },
  }),

  definePreset({
    category: "services",
    name: "steps",
    label: "How it works in three steps",
    description: "A heading and three numbered steps explaining the process.",
    copy: [headline, copy.items("step", "Step description", "columns", "items", "body", 6, 35)],
    defaultTheme: "light-accent",
    tags: ["steps", "process", "three-up"],
    links: { primary: "/start" },
    ai: {
      purpose: "Explains what happens after someone gets in touch.",
      whenToUse: "Any service with a process: design, building, coaching, cleaning.",
      avoid: `${AVOID} More than four steps.`,
    },
    make: (c) => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("How a project works", { eyebrow: "The process", align: "center" }),
        make(
          columnsBlock,
          {
            columns: "3",
            aspect: "original",
            items: [
              {
                heading: "A free first call",
                body: rt.doc(
                  rt.p(
                    "Thirty minutes to talk through what you need, your timeline and your budget.",
                  ),
                ),
              },
              {
                heading: "A fixed-price proposal",
                body: rt.doc(
                  rt.p(
                    "Within a week you'll have a clear scope, a schedule and one price — no hourly surprises.",
                  ),
                ),
              },
              {
                heading: "Design, build, launch",
                body: rt.doc(
                  rt.p(
                    "We share progress every Friday and hand over a site your team can edit on day one.",
                  ),
                ),
              },
            ],
          },
          { variant: "steps" },
        ),
        button("Book your first call", c.primary, { align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "tabs",
    label: "Services in tabs",
    description: "A heading and tabbed panels, one per service, for detail without length.",
    copy: [headline, intro],
    tags: ["tabs", "detail"],
    ai: {
      purpose: "Lets visitors compare a few services in depth without a long page.",
      whenToUse: "Two to five services that each need a paragraph or a short list.",
      avoid: `${AVOID} Hiding essential information like prices in a tab nobody opens.`,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Therapy that fits where you are", {
          eyebrow: "Sessions",
          sub: "All sessions are fifty minutes, online or in our Oak Park rooms.",
        }),
        make(
          tabsBlock,
          {
            label: "Types of therapy",
            items: [
              {
                label: "Individual",
                content: rt.doc(
                  rt.p(
                    "Weekly one-to-one sessions for anxiety, low mood, grief and life transitions.",
                  ),
                  rt.ul(
                    "Free 15-minute introduction call",
                    "Evening appointments available",
                    "$140 per session, sliding scale on request",
                  ),
                ),
              },
              {
                label: "Couples",
                content: rt.doc(
                  rt.p(
                    "A calm space to untangle communication, conflict and big decisions together.",
                  ),
                  rt.ul("Seventy-minute sessions", "In person or online", "$190 per session"),
                ),
              },
              {
                label: "Groups",
                content: rt.doc(
                  rt.p(
                    "Eight-week closed groups on burnout and on new parenthood, capped at eight people.",
                  ),
                  rt.ul("Tuesday evenings", "$360 for the full course"),
                ),
              },
            ],
          },
          { variant: "underline" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "services",
    name: "feature-overlap",
    label: "Photo with service checklist",
    description: "A large photograph with a checklist panel of services layered across its edge.",
    copy: [headline],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "light-accent",
    tags: ["image", "grid", "overlap", "checklist"],
    links: { primary: "/quote" },
    ai: {
      purpose: "Pairs one strong photo of the work with a scannable list of what's included.",
      whenToUse: "Cleaning, catering, events and trades — services judged by results.",
      avoid: AVOID,
    },
    make: (c) => {
      const pic = image(photo("kitchen", 820));
      const panel = heading("Home cleaning, done properly", {
        eyebrow: "Weekly · Fortnightly · One-off",
        style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } },
      });
      const list = make(
        iconListBlock,
        {
          columns: "1",
          items: [
            { icon: "check", title: "The same cleaner every visit" },
            { icon: "check", title: "Eco products, supplied by us" },
            { icon: "check", title: "Insured and background-checked" },
            { icon: "check", title: "Skip or reschedule with a text" },
          ],
        },
        { variant: "checklist", style: { colorTheme: c.theme, padding: { d: "lg", m: "md" } } },
      );
      const cta = button("Get a quote in 2 minutes", c.primary);
      return {
        ...grid([
          [pic, r(1, 1, 15, 24, { bleed: "left" }), r(1, 1, 8, 12, { bleed: "both" })],
          [panel, r(13, 3, 12, 6, { z: 2 }), r(1, 10, 8, 6, { z: 2 })],
          [list, r(13, 9, 12, 10, { z: 2 }), r(1, 16, 8, 10, { z: 2 })],
          [cta, r(16, 20, 9, 3), r(1, 27, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "services",
    name: "accordion-detail",
    label: "Services with expandable detail",
    description:
      "A heading and action on the left; services that expand to show detail on the right.",
    copy: [
      headline,
      intro,
      copy.items("service", "Service name", "accordion", "items", "question", 1, 8),
    ],
    defaultTheme: "light",
    tags: ["accordion", "two-column", "detail"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Many services with real detail, kept tidy until opened.",
      whenToUse: "Accountants, lawyers, consultants and clinics with many specialised services.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Legal help for small businesses", {
          col: 0,
          eyebrow: "Practice areas",
          sub: "Plain-English advice at fixed fees, from your first contract to selling the company.",
        }),
        button("Ask a question", c.primary, { col: 0, role: "secondary" }),
        make(
          accordionBlock,
          {
            exclusive: true,
            openFirst: true,
            faqSchema: false,
            items: [
              {
                question: "Starting a business",
                answer: rt.doc(
                  rt.p(
                    "Company formation, shareholder agreements and the terms of business you'll use every day.",
                  ),
                ),
              },
              {
                question: "Contracts & terms",
                answer: rt.doc(
                  rt.p(
                    "Supplier, client and freelancer contracts drafted or reviewed within five working days.",
                  ),
                ),
              },
              {
                question: "Employment",
                answer: rt.doc(
                  rt.p(
                    "Contracts, handbooks and calm, practical support when things get difficult.",
                  ),
                ),
              },
              {
                question: "Leases & property",
                answer: rt.doc(
                  rt.p(
                    "Commercial leases negotiated and reviewed before you sign, so there are no surprises later.",
                  ),
                ),
              },
            ],
          },
          { col: 1, variant: "lines" },
        ),
      ],
    }),
  }),
];
