import { cardBlock, iconListBlock } from "../../blocks/card";
import { beforeAfterBlock } from "../../blocks/compare";
import { statsBlock } from "../../blocks/data";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(8, 40);
const AVOID =
  "Features the product doesn't have; vague benefits ('best in class'); more than eight items.";

const featureCard = (
  icon: string,
  heading: string,
  body: string,
  col: number,
  theme?: "light" | "light-accent" | "dark" | "dark-accent" | "brand",
) =>
  make(
    cardBlock,
    {
      image: undefined,
      eyebrow: undefined,
      icon,
      heading,
      body: rt.doc(rt.p(body)),
      link: undefined,
      linkLabel: undefined,
    },
    { col, variant: "minimal", ...(theme ? { style: { colorTheme: theme } } : {}) },
  );

export const featuresPresets = [
  definePreset({
    category: "features",
    name: "icon-row",
    label: "Four benefits with icons",
    description: "A centred heading with four benefits in a row of icon tiles.",
    copy: [headline, intro, copy.items("benefit", "Benefit", "icon-list", "items", "text", 5, 25)],
    tags: ["icons", "four-up", "centered"],
    ai: {
      purpose: "Answers 'why choose you?' at a glance.",
      whenToUse: "Right after the hero on product and service home pages.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Why families choose us", {
          align: "center",
          eyebrow: "The details",
          sub: "Little things that make the first swimming lesson a happy one.",
        }),
        make(
          iconListBlock,
          {
            columns: "4",
            items: [
              {
                icon: "users",
                title: "Four per class",
                text: "Every child gets time with the teacher.",
              },
              { icon: "sun", title: "Warm water", text: "Our pool is kept at a cosy 32°C." },
              {
                icon: "calendar",
                title: "Flexible makeups",
                text: "Missed a lesson? Swap it for another day.",
              },
              {
                icon: "award",
                title: "Qualified teachers",
                text: "Certified, first-aid trained and patient.",
              },
            ],
          },
          { variant: "tiles" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "checklist-image",
    label: "Checklist beside photo",
    description: "A heading and checklist of benefits next to a square photograph.",
    copy: [headline, intro],
    images: [{ slot: "photo", aspect: "1:1" }],
    defaultTheme: "light-accent",
    tags: ["image", "checklist", "two-column"],
    links: { primary: "/join" },
    ai: {
      purpose: "Lists what's included, with a photo that shows it.",
      whenToUse: "Memberships, packages and subscriptions.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("Membership that makes training easy", {
          col: 0,
          eyebrow: "What's included",
          sub: "One monthly fee, no joining charge and you can pause any time.",
        }),
        make(
          iconListBlock,
          {
            columns: "1",
            items: [
              { icon: "check", title: "Unlimited classes, 6am to 9pm" },
              { icon: "check", title: "A personal plan, reviewed every eight weeks" },
              { icon: "check", title: "Open gym and sauna at weekends" },
              { icon: "check", title: "Bring a friend free on Fridays" },
            ],
          },
          { col: 0, variant: "checklist" },
        ),
        button("Start a free week", c.primary, { col: 0 }),
        image(photo("gym", 620, "1:1"), { col: 1, aspect: "1:1" }),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "three-cards",
    label: "Feature cards beside heading",
    description: "A heading beside four icon cards on soft panels.",
    copy: [headline, copy.field("feature", "Feature description", "card", "body", 6, 35)],
    defaultTheme: "light",
    tags: ["cards", "icons", "three-up"],
    ai: {
      purpose: "Three distinct reasons to choose the product, each given equal weight.",
      whenToUse: "Software, products and services with three clear differentiators.",
      avoid: AVOID,
    },
    make: (c) => {
      const panel =
        c.theme === "light" ? "light-accent" : c.theme === "light-accent" ? "light" : undefined;
      return {
        layout: stack({ cols: [4, 4, 4], gap: "md" }),
        blocks: [
          heading("Booking software that stays out of the way", {
            col: 0,
            eyebrow: "Features",
          }),
          featureCard(
            "calendar",
            "Two-way calendar sync",
            "Works with Google, Outlook and Apple calendars, so you're never double-booked.",
            1,
            panel,
          ),
          featureCard(
            "message-circle",
            "Friendly reminders",
            "Clients get a text the day before. No-shows drop by half on average.",
            2,
            panel,
          ),
          featureCard(
            "lock",
            "Deposits, not chasing",
            "Take a deposit when someone books and refund it automatically if they cancel in time.",
            1,
            panel,
          ),
          featureCard(
            "globe",
            "Your brand, your link",
            "A booking page on your own domain, in your colours, with no ads.",
            2,
            panel,
          ),
        ],
      };
    },
  }),

  definePreset({
    category: "features",
    name: "screenshot-callout",
    label: "Photo with floating stats",
    description:
      "A wide photograph with a stats card layered over one corner, beside the benefit copy.",
    copy: [headline, copy.body(15, 70)],
    images: [{ slot: "photo", aspect: "fill" }],
    tags: ["image", "grid", "overlap", "stats"],
    links: { primary: "/demo" },
    ai: {
      purpose: "Backs up a benefit with numbers, layered for a product-page feel.",
      whenToUse: "Software and B2B services with measured results.",
      avoid: `${AVOID} Numbers the owner can't verify.`,
    },
    make: (c) => {
      const pic = image(photo("analytics", 760));
      const stats = make(
        statsBlock,
        {
          items: [
            { value: "6 hrs", label: "Saved each week" },
            { value: "98%", label: "On-time invoices" },
          ],
        },
        {
          variant: "row",
          style: {
            colorTheme: c.theme === "dark" ? "light" : "dark",
            padding: { d: "md", m: "sm" },
          },
        },
      );
      const words = heading("See your whole week at a glance", { eyebrow: "Reporting" });
      const body = text([
        rt.p(
          "One dashboard for bookings, payments and staff hours. Spot quiet afternoons before they happen and know exactly what you'll be paid on Friday.",
        ),
      ]);
      const cta = button("Book a demo", c.primary, { role: "secondary" });
      return {
        ...grid([
          [pic, r(1, 1, 14, 20), r(1, 1, 8, 11)],
          [stats, r(7, 15, 9, 6, { z: 2 }), r(2, 9, 7, 5, { z: 2 })],
          [words, r(17, 3, 8, 6), r(1, 15, 8, 6)],
          [body, r(17, 9, 8, 7), r(1, 21, 8, 7)],
          [cta, r(17, 16, 8, 3), r(1, 28, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "features",
    name: "bento",
    label: "Bento grid",
    description: "Feature cards of different sizes arranged in a tidy grid with one photo.",
    copy: [headline, copy.field("feature", "Feature description", "card", "body", 5, 35)],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "light",
    tags: ["grid", "cards", "modern"],
    ai: {
      purpose: "A modern, varied layout for four or five features of different importance.",
      whenToUse: "Product launches and apps; feature-rich services.",
      avoid: AVOID,
    },
    make: (c) => {
      const panel = c.theme === "light" ? "light-accent" : "light";
      const intro2 = heading("A café kit that does the thinking", {
        eyebrow: "Inside the box",
        size: "h2",
      });
      const big = featureCard(
        "coffee",
        "Fresh beans every fortnight",
        "Roasted on Monday, at your door by Wednesday. Pause or swap blends whenever you like.",
        0,
        "dark-accent",
      );
      const pic = image(photo("pourOver", 520));
      const a = featureCard(
        "recycle",
        "Zero-waste packaging",
        "Compostable bags and a return label for the tins.",
        0,
        panel,
      );
      const b = featureCard(
        "book-open",
        "Brew guides",
        "Short cards for every method, from moka pot to pour-over.",
        0,
        panel,
      );
      return {
        ...grid([
          [intro2, r(1, 1, 10, 6), r(1, 1, 8, 5)],
          [big, r(1, 9, 10, 12), r(1, 7, 8, 9)],
          [pic, r(12, 1, 13, 11), r(1, 17, 8, 9)],
          [a, r(12, 13, 6, 8), r(1, 27, 8, 7)],
          [b, r(19, 13, 6, 8), r(1, 35, 8, 7)],
        ]),
      };
    },
  }),

  definePreset({
    category: "features",
    name: "before-after",
    label: "Before and after",
    description: "A draggable before/after comparison beside a short explanation.",
    copy: [headline, copy.body(15, 70)],
    images: [{ slot: "comparison", aspect: "4:5", count: 2 }],
    tags: ["image", "comparison", "two-column"],
    links: { primary: "/projects" },
    ai: {
      purpose: "Proves a transformation with a side-by-side comparison.",
      whenToUse: "Renovation, cleaning, landscaping, retouching — any visible result.",
      avoid: `${AVOID} Comparing two different places as if they were one.`,
    },
    make: (c) => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        make(
          beforeAfterBlock,
          {
            before: photo("loungePlants", 620, "4:5"),
            after: photo("bohoLounge", 620, "4:5"),
            beforeLabel: "Scheme A",
            afterLabel: "Scheme B",
            start: 50,
            aspect: "4:5",
            caption: "Two schemes for the same brief: a north-facing lounge.",
          },
          { col: 0, variant: "labels" },
        ),
        heading("Two schemes, one room", { col: 1, eyebrow: "Interior styling" }),
        text(
          [
            rt.p(
              "We always present two directions so you can see the choice, not just imagine it. Drag the handle to compare a calm, green scheme with a warmer, terracotta one.",
            ),
          ],
          { col: 1 },
        ),
        button("See more rooms", c.primary, { col: 1, role: "secondary" }),
      ],
    }),
  }),
];
