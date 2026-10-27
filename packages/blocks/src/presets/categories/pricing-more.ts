import { pricingBlock } from "../../blocks/pricing";
import { button, copy, definePreset, grid, heading, make, r, rt, stack, text, url } from "../kit";
import { card, panel, table } from "../parts";

/** Second wave of pricing: billing toggle, full comparison, four tiers, rate cards, packages. */

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(6, 35);
const AVOID =
  "Prices the owner hasn't confirmed; hidden fees; fake discounts; more than one featured plan.";

interface Plan {
  name: string;
  price: string;
  period?: string;
  altPrice?: string;
  altPeriod?: string;
  description?: string;
  features: string[];
  button?: string;
  link?: string;
  featured?: boolean;
  badge?: string;
}
const plans = (list: Plan[]) =>
  list.map((p) => ({
    name: p.name,
    price: p.price,
    ...(p.period ? { period: p.period } : {}),
    ...(p.altPrice ? { altPrice: p.altPrice } : {}),
    ...(p.altPeriod ? { altPeriod: p.altPeriod } : {}),
    ...(p.description ? { description: p.description } : {}),
    features: p.features.map((text) => ({ text })),
    ...(p.button ? { buttonLabel: p.button, link: url(p.link ?? "/signup") } : {}),
    featured: !!p.featured,
    ...(p.badge ? { badge: p.badge } : {}),
  }));

const pricing = (
  list: Plan[],
  o: {
    variant?: string;
    col?: number;
    note?: string;
    toggle?: [main: string, alt: string, note?: string];
  } = {},
) =>
  make(
    pricingBlock,
    {
      plans: plans(list),
      note: o.note,
      periodLabel: o.toggle?.[0],
      altPeriodLabel: o.toggle?.[1],
      altNote: o.toggle?.[2],
    },
    { variant: o.variant ?? "cards", ...(o.col !== undefined ? { col: o.col } : {}) },
  );

const SAAS: Plan[] = [
  {
    name: "Solo",
    price: "$12",
    period: "/ month",
    altPrice: "$10",
    altPeriod: "/ month, billed yearly",
    description: "For one practitioner and their clients.",
    features: ["Online booking page", "Card payments", "Email reminders"],
    button: "Start free",
  },
  {
    name: "Studio",
    price: "$39",
    period: "/ month",
    altPrice: "$32",
    altPeriod: "/ month, billed yearly",
    description: "For teams of up to ten.",
    features: [
      "Everything in Solo",
      "Class schedules and waitlists",
      "Text reminders",
      "Memberships and packs",
    ],
    button: "Start free",
    featured: true,
    badge: "Most studios",
  },
  {
    name: "Multi-site",
    price: "$89",
    period: "/ month",
    altPrice: "$74",
    altPeriod: "/ month, billed yearly",
    description: "For several locations.",
    features: ["Everything in Studio", "Shared clients across sites", "Priority support"],
    button: "Talk to us",
    link: "/contact",
  },
];

export const pricingMorePresets = [
  definePreset({
    category: "pricing",
    name: "billing-toggle",
    label: "Plans with billing toggle",
    description:
      "Three plans with a monthly / yearly switch that changes the prices — no JavaScript.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["plans", "toggle", "three-up", "saas"],
    ai: {
      purpose: "Shows subscription prices for both billing periods without clutter.",
      whenToUse: "Software and memberships that offer a yearly discount.",
      avoid: `${AVOID} A yearly price that isn't really cheaper.`,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Simple prices that grow with you", {
          align: "center",
          eyebrow: "Pricing",
          sub: "Every plan includes unlimited clients and a 30-day free trial. Switch or cancel any time.",
        }),
        pricing(SAAS, { toggle: ["Monthly", "Yearly", "Save 2 months"] }),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "full-comparison",
    label: "Plans with full comparison",
    description: "Plan cards followed by a detailed comparison table of every feature.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["plans", "table", "comparison", "saas"],
    ai: {
      purpose: "Lets careful buyers check every detail before choosing a plan.",
      whenToUse: "Pricing pages for software and memberships with several tiers.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Compare every plan", {
          align: "center",
          eyebrow: "Plans",
          sub: "Start on any plan; everything you set up moves with you when you change.",
        }),
        pricing(SAAS.map(({ altPrice: _price, altPeriod: _period, ...p }) => p)),
        table(
          [
            ["Solo", "$12"],
            ["Studio", "$39", true],
            ["Multi-site", "$89"],
          ],
          [
            "Booking",
            ["Online booking page", "yes", "yes", "yes"],
            ["Class schedules", "no", "yes", "yes"],
            ["Waitlists", "no", "yes", "yes"],
            "Payments",
            ["Card payments", "yes", "yes", "yes"],
            ["Memberships and packs", "no", "yes", "yes"],
            "Team",
            ["Staff accounts", "1", "Up to 10", "Unlimited"],
            ["Locations", "1", "1", "Up to 10"],
            ["Support", "Email", "Email and chat", "Named contact"],
          ],
          { caption: "Features in each plan", corner: "Features", variant: "lines" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "four-tiers",
    label: "Four tiers",
    description: "Four plans in a row, from free to enterprise, with the middle one featured.",
    copy: [headline],
    defaultTheme: "light-accent",
    tags: ["plans", "four-up", "saas"],
    ai: {
      purpose: "Covers everyone from hobbyists to large organisations.",
      whenToUse: "Products with a free tier and an enterprise option.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide", gap: "lg" }),
      blocks: [
        heading("A plan for every newsroom", { align: "center", eyebrow: "Pricing" }),
        pricing([
          {
            name: "Free",
            price: "$0",
            description: "For trying it out.",
            features: ["One writer", "100 subscribers"],
            button: "Start free",
          },
          {
            name: "Writer",
            price: "$9",
            period: "/ month",
            description: "For independent writers.",
            features: ["One writer", "5,000 subscribers", "Paid subscriptions"],
            button: "Start writing",
            featured: true,
            badge: "Popular",
          },
          {
            name: "Publication",
            price: "$29",
            period: "/ month",
            description: "For small teams.",
            features: ["Five writers", "25,000 subscribers", "Custom domain"],
            button: "Start a trial",
          },
          {
            name: "Newsroom",
            price: "Custom",
            description: "For larger organisations.",
            features: ["Unlimited writers", "SSO and audit log", "Migration help"],
            button: "Contact sales",
            link: "/contact",
          },
        ]),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "rate-card",
    label: "Rate card",
    description: "A short introduction beside a striped table of services and their rates.",
    copy: [headline, copy.body(8, 45)],
    defaultTheme: "light",
    tags: ["table", "rates", "services", "two-column"],
    links: { primary: "/quote" },
    ai: {
      purpose: "Publishes standard rates so customers can budget before calling.",
      whenToUse: "Trades, freelancers, studios and hire businesses.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Clear, upfront rates", { col: 0, eyebrow: "Rates" }),
        text(
          [
            rt.p(
              "No call-out surprises. We confirm the price before starting, and parts are charged at cost with the receipt attached to your invoice.",
            ),
          ],
          { col: 0 },
        ),
        button("Get a written quote", c.primary, { col: 0 }),
        table(
          [["Rate"]],
          [
            ["Call-out and first hour", "$95"],
            ["Each extra half hour", "$40"],
            ["Evenings and weekends", "+50%"],
            ["Boiler service", "$120 fixed"],
            ["Tap or toilet repair", "From $80"],
            ["Water heater install", "From $1,450"],
          ],
          {
            col: 1,
            variant: "striped",
            corner: "Service",
            note: "Prices include tax. Parts extra.",
          },
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "packages-photos",
    label: "Packages with photos",
    description: "Three packages as photo cards with the price as the label and what's included.",
    copy: [headline, intro],
    images: [{ slot: "package photos", aspect: "4:5", count: 3 }],
    defaultTheme: "light",
    tags: ["cards", "image", "packages", "three-up", "photography"],
    links: { primary: "/book" },
    ai: {
      purpose: "Sells experiences or sessions as packages, with a photo of each.",
      whenToUse: "Photographers, venues, salons, tours and event services.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("Portrait sessions", {
        eyebrow: "Packages",
        sub: "Every session includes a planning call, natural-light shooting and a private online gallery.",
      });
      const a = card("Mini session", "Thirty minutes, one location and ten edited photographs.", {
        eyebrow: "$240",
        image: ["portraitJonah", 380, "4:5"],
      });
      const b = card(
        "Classic session",
        "Ninety minutes, two locations and thirty edited photographs.",
        {
          eyebrow: "$480",
          image: ["portraitEditorial", 380, "4:5"],
        },
      );
      const d = card(
        "Story session",
        "A half day at home or work, with sixty edited photographs.",
        {
          eyebrow: "$890",
          image: ["portraitRaf", 380, "4:5"],
        },
      );
      const cta = button("Book a session", c.primary);
      return {
        ...grid([
          [h, r(1, 1, 14, 7), r(1, 1, 8, 8)],
          [a, r(1, 9, 8, 18), r(1, 10, 8, 15)],
          [b, r(9, 9, 8, 18), r(1, 26, 8, 15)],
          [d, r(17, 9, 8, 18), r(1, 42, 8, 15)],
          [cta, r(1, 28, 8, 3), r(1, 58, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "pricing",
    name: "sliding-scale",
    label: "Sliding scale",
    description: "Pay-what-you-can tiers as a compact list, with a note on how to choose.",
    copy: [headline, intro],
    defaultTheme: "light-accent",
    tags: ["compact", "list", "community", "sliding-scale"],
    ai: {
      purpose: "Offers fair, tiered pricing without asking people to justify themselves.",
      whenToUse: "Community classes, therapy, workshops and nonprofits.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Pay what fits your budget", {
          eyebrow: "Sliding scale",
          sub: "Choose the tier that feels right. Nobody checks, and every tier gets exactly the same class.",
        }),
        pricing(
          [
            {
              name: "Supported",
              price: "$10",
              period: "per class",
              description: "For students, carers and anyone on a tight month.",
              features: [],
              button: "Book",
              link: "/book",
            },
            {
              name: "Standard",
              price: "$18",
              period: "per class",
              description: "Covers the real cost of the class.",
              features: [],
              button: "Book",
              link: "/book",
            },
            {
              name: "Supporter",
              price: "$26",
              period: "per class",
              description: "Pays for a supported place for someone else.",
              features: [],
              button: "Book",
              link: "/book",
            },
          ],
          { variant: "compact", note: "Need a free place? Email us — no questions asked." },
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "plans-and-custom",
    label: "Two plans and a custom quote",
    description: "Two plans side by side and a panel inviting larger customers to ask for a quote.",
    copy: [headline, copy.body(6, 35)],
    defaultTheme: "light",
    tags: ["plans", "two-up", "enterprise", "panel"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Keeps pricing simple while catching bigger, custom deals.",
      whenToUse: "Services and software with a standard offer and bespoke work.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("Cleaning plans for small offices", { eyebrow: "Pricing" });
      const p = pricing(
        [
          {
            name: "Weekly",
            price: "$180",
            period: "/ week",
            description: "Up to 2,000 sq ft, one evening visit.",
            features: ["Desks, kitchen and bathrooms", "Bins and recycling", "Supplies included"],
            button: "Book a walk-through",
            link: "/quote",
          },
          {
            name: "Twice weekly",
            price: "$320",
            period: "/ week",
            description: "Up to 2,000 sq ft, two evening visits.",
            features: ["Everything in Weekly", "Windows monthly", "Fridge clear-out"],
            button: "Book a walk-through",
            link: "/quote",
            featured: true,
          },
        ],
        { variant: "cards" },
      );
      const custom = text(
        [
          rt.h(3, "Bigger space or special needs?", "h4"),
          rt.p(
            "Clinics, studios and buildings over 2,000 sq ft get a custom plan after a free walk-through.",
          ),
        ],
        { style: panel("dark-accent") },
      );
      const cta = button("Ask for a quote", c.primary, { role: "secondary" });
      return {
        ...grid([
          [h, r(1, 1, 16, 4), r(1, 1, 8, 5)],
          [p, r(1, 6, 16, 22), r(1, 7, 8, 40)],
          [custom, r(18, 6, 7, 12), r(1, 48, 8, 10)],
          [cta, r(18, 19, 7, 3), r(1, 59, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "pricing",
    name: "dark-columns",
    label: "Plans in columns on dark",
    description: "Three plans divided by hairlines on a dark band, with a note underneath.",
    copy: [headline, intro],
    defaultTheme: "dark",
    tags: ["plans", "columns", "dark", "minimal"],
    ai: {
      purpose: "A restrained, premium presentation of a few plans.",
      whenToUse: "Studios, coaching and premium services.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Coaching, three ways", {
          eyebrow: "Work with me",
          sub: "Every option starts with a free twenty-minute call to see if we're a good fit.",
        }),
        pricing(
          [
            {
              name: "Single session",
              price: "$180",
              description: "One focused ninety-minute session on a decision or problem.",
              features: ["Written summary afterwards", "Two weeks of email follow-up"],
              button: "Book a session",
              link: "/book",
            },
            {
              name: "Three months",
              price: "$1,400",
              description: "Fortnightly sessions for a season of change.",
              features: ["Six sessions", "Messaging between sessions", "A mid-point review"],
              button: "Apply",
              link: "/apply",
              featured: true,
            },
            {
              name: "Team day",
              price: "$3,200",
              description: "A facilitated day for a leadership team of up to eight.",
              features: ["Pre-work interviews", "Facilitation and notes", "Follow-up session"],
              button: "Enquire",
              link: "/contact",
            },
          ],
          {
            variant: "columns",
            note: "Sliding-scale places are available each quarter for nonprofits.",
          },
        ),
      ],
    }),
  }),
];
