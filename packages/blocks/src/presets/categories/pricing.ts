import { accordionBlock } from "../../blocks/accordion";
import { iconListBlock } from "../../blocks/card";
import { pricingBlock } from "../../blocks/pricing";
import { tabsBlock } from "../../blocks/tabs";
import { button, copy, definePreset, heading, make, rt, stack, url } from "../kit";

const headline = copy.headline(2, 10, 2);
const AVOID =
  "Prices, discounts or plan features the owner hasn't confirmed; more than four plans; hiding the price behind 'contact us' when it's fixed.";

const feat = (...items: string[]) => items.map((text) => ({ text }));

const plan = (
  name: string,
  price: string,
  period: string | undefined,
  description: string,
  features: string[],
  buttonLabel: string,
  link: string,
  featured = false,
  badge?: string,
) => ({
  name,
  price,
  ...(period ? { period } : {}),
  description,
  features: feat(...features),
  buttonLabel,
  link: url(link),
  featured,
  ...(badge ? { badge } : {}),
});

const pricing = (plans: ReturnType<typeof plan>[], variant: string, note?: string, col?: number) =>
  make(pricingBlock, { plans, note }, { variant, ...(col !== undefined ? { col } : {}) });

export const pricingPresets = [
  definePreset({
    category: "pricing",
    name: "three-plans",
    label: "Three plans",
    description: "A centred heading and three plan cards, with the middle plan highlighted.",
    copy: [
      headline,
      copy.sub(6, 30),
      copy.items("plan", "Plan description", "pricing", "plans", "description", 4, 25),
    ],
    tags: ["cards", "three-up", "membership"],
    ai: {
      purpose: "Compares memberships or packages so people can pick one quickly.",
      whenToUse: "Studios, gyms, subscriptions and software with tiered plans.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Find your rhythm", {
          align: "center",
          eyebrow: "Memberships",
          sub: "No joining fee, no contracts. Pause or cancel any time with a month's notice.",
        }),
        pricing(
          [
            plan(
              "Drop-in",
              "$24",
              "per class",
              "For trying us out or an irregular week.",
              ["Any regular class", "Mat and props included", "Valid for 30 days"],
              "Buy a class",
              "/buy/drop-in",
            ),
            plan(
              "Unlimited",
              "$139",
              "per month",
              "For a steady practice, as often as you like.",
              ["Unlimited classes", "Two guest passes a month", "10% off workshops"],
              "Become a member",
              "/buy/unlimited",
              true,
              "Most popular",
            ),
            plan(
              "Ten-class pass",
              "$190",
              "valid 4 months",
              "For a practice that moves around your week.",
              ["Ten classes, any time", "Share with a partner", "Mat hire included"],
              "Buy the pass",
              "/buy/ten-pass",
            ),
          ],
          "cards",
          "Students and over-65s save 20% on every option — just ask at the desk.",
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "two-plans",
    label: "Two plans in columns",
    description: "A heading beside two plans laid out as clean columns.",
    copy: [headline, copy.sub(6, 30)],
    defaultTheme: "light-accent",
    tags: ["two-up", "columns"],
    ai: {
      purpose: "A simple either/or choice between two options.",
      whenToUse: "Services with a standard and a premium option, or monthly vs yearly.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Simple, fixed monthly fees", {
          col: 0,
          eyebrow: "Pricing",
          sub: "Every plan includes a named bookkeeper and year-end accounts.",
        }),
        pricing(
          [
            plan(
              "Essentials",
              "$290",
              "per month",
              "Sole traders and small teams up to five people.",
              ["Monthly bookkeeping", "Quarterly tax returns", "Email support within a day"],
              "Choose Essentials",
              "/start?plan=essentials",
            ),
            plan(
              "Growth",
              "$590",
              "per month",
              "Growing teams who need forecasts and payroll.",
              ["Everything in Essentials", "Payroll for up to 25 people", "Monthly forecast call"],
              "Choose Growth",
              "/start?plan=growth",
              true,
              "Best value",
            ),
          ],
          "columns",
          undefined,
          1,
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "compact-list",
    label: "Compact price list",
    description: "Plans as a compact list — good for many small options.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["list", "compact"],
    ai: {
      purpose: "Lists several prices without the weight of big cards.",
      whenToUse: "Classes, rentals, tickets and add-ons.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Studio hire", { eyebrow: "Rates", align: "center" }),
        pricing(
          [
            plan(
              "Hourly",
              "$45",
              "per hour",
              "Minimum two hours, weekdays before 5pm.",
              [],
              "Book hourly",
              "/hire?rate=hourly",
            ),
            plan(
              "Half day",
              "$160",
              "4 hours",
              "Ideal for shoots, rehearsals and workshops.",
              [],
              "Book a half day",
              "/hire?rate=half",
            ),
            plan(
              "Full day",
              "$290",
              "9am – 6pm",
              "Includes lighting kit and the kitchen.",
              [],
              "Book a full day",
              "/hire?rate=day",
            ),
          ],
          "compact",
          "All rates include Wi-Fi, chairs for twenty and tea and coffee.",
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "single-offer",
    label: "Single offer",
    description: "One featured package beside a description and what's included.",
    copy: [headline, copy.sub(6, 30)],
    defaultTheme: "dark-accent",
    tags: ["single", "course", "two-column"],
    ai: {
      purpose: "Sells one product or course with everything it includes.",
      whenToUse: "Courses, retreats, launch offers and single-package services.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], gap: "2xl", align: "center" }),
      blocks: [
        heading("The eight-week sourdough course", {
          col: 0,
          eyebrow: "Online course",
          sub: "Bake a proper loaf by week three, then learn baguettes, focaccia and enriched doughs.",
        }),
        make(
          iconListBlock,
          {
            columns: "1",
            items: [
              { icon: "check", title: "Sixteen short video lessons" },
              { icon: "check", title: "A live Q&A every Sunday" },
              { icon: "check", title: "A starter kit posted to your door" },
            ],
          },
          { col: 0, variant: "checklist" },
        ),
        pricing(
          [
            plan(
              "Full course",
              "$149",
              "one-off",
              "Lifetime access, including every future lesson.",
              ["Starter kit included", "Private community", "Certificate on completion"],
              "Enrol now",
              "/course/enrol",
              true,
              "Next cohort: 3 March",
            ),
          ],
          "cards",
          "Not for you? Full refund within 14 days.",
          1,
        ),
      ],
    }),
  }),

  definePreset({
    category: "pricing",
    name: "with-faq",
    label: "Plans with questions",
    description: "Plan options in tabs, with the most common billing questions below.",
    copy: [headline, copy.items("question", "Question", "accordion", "items", "question", 3, 15)],
    defaultTheme: "light",
    tags: ["tabs", "faq"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Pricing plus answers to the questions that stop people buying.",
      whenToUse: "Pricing pages for subscriptions and memberships.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Plans and billing", { eyebrow: "Pricing", align: "center" }),
        make(
          tabsBlock,
          {
            label: "Billing period",
            items: [
              {
                label: "Monthly",
                content: rt.doc(
                  rt.p(
                    "$18 a month for one fresh bag every two weeks. Skip, pause or cancel whenever you like.",
                  ),
                  rt.ul("Free delivery", "Swap blends any time"),
                ),
              },
              {
                label: "Yearly",
                content: rt.doc(
                  rt.p(
                    "$180 a year — two months free. Includes a ceramic pour-over set in your first box.",
                  ),
                  rt.ul("Free delivery", "Pour-over set included"),
                ),
              },
            ],
          },
          { variant: "pills" },
        ),
        make(
          accordionBlock,
          {
            exclusive: false,
            openFirst: false,
            faqSchema: true,
            items: [
              {
                question: "Can I pause my subscription?",
                answer: rt.doc(
                  rt.p("Yes — pause for up to three months from your account, no questions asked."),
                ),
              },
              {
                question: "When am I charged?",
                answer: rt.doc(
                  rt.p("On the day each bag is roasted. You'll get an email the day before."),
                ),
              },
            ],
          },
          { variant: "lines" },
        ),
        button("Still have questions?", c.primary, { role: "tertiary", align: "center" }),
      ],
    }),
  }),
];
