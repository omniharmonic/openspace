import { tabsBlock } from "../../blocks/tabs";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";
import { card, columns, icons, panel, raised, timeline } from "../parts";

/** Process & timeline presets: steps, how-it-works, histories, schedules and programmes. */

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(6, 35);
const AVOID =
  "More than six steps; steps that are really features; timelines with invented dates or milestones.";
const stepTitle = (min = 1, max = 8) =>
  copy.items("step", "Step title", "timeline", "items", "title", min, max);

export const processPresets = [
  definePreset({
    category: "process",
    name: "numbered-steps",
    label: "Numbered steps",
    description: "A centred heading over three or four numbered steps in a row.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["steps", "numbered", "centered", "how-it-works"],
    links: { primary: "/book" },
    ai: {
      purpose: "Shows how working together goes, so the first step feels small.",
      whenToUse: "Services, trades, coaching and anything bought by booking or enquiry.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("How a project with us works", {
          align: "center",
          eyebrow: "The process",
          sub: "Four steps from first call to finished room, with a fixed price agreed before any work starts.",
        }),
        columns(
          [
            {
              heading: "Talk it through",
              body: "A free half-hour call about the room, your budget and how you live in it.",
            },
            {
              heading: "Visit and measure",
              body: "We come to you, take measurements and photos, and listen some more.",
            },
            {
              heading: "Design and price",
              body: "Drawings, samples and one fixed price within two weeks of the visit.",
            },
            {
              heading: "Build and fit",
              body: "Made in our workshop, fitted in days, and checked again after a month.",
            },
          ],
          "4",
          { variant: "steps" },
        ),
        button("Book a free call", c.primary, { align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "history-timeline",
    label: "History timeline",
    description: "Heading and photograph on one side, a dated vertical timeline on the other.",
    copy: [headline, stepTitle()],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light-accent",
    tags: ["timeline", "history", "two-column", "about"],
    ai: {
      purpose: "Tells the organisation's story through a few real dates.",
      whenToUse: "About pages for businesses and nonprofits with a history worth telling.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Forty years on the same corner", { col: 0, eyebrow: "Our story" }),
        image(photo("cafeInterior", 480, "4:5"), { col: 0, aspect: "4:5" }),
        timeline(
          [
            [
              "1986",
              "Rosa opens a six-stool counter",
              "Coffee, eggs and the best rye in the neighbourhood.",
            ],
            [
              "1999",
              "The bakery moves in next door",
              "We knock through the wall and start baking overnight.",
            ],
            [
              "2014",
              "The second generation takes over",
              "Rosa's son Theo keeps the rye and adds a roaster.",
            ],
            [
              "2024",
              "A garden patio, finally",
              "Twenty seats under the plane tree, open May to October.",
            ],
          ],
          { col: 1 },
        ),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "phases-horizontal",
    label: "Project phases",
    description: "A heading and a horizontal timeline of project phases with durations.",
    copy: [headline, intro, stepTitle()],
    defaultTheme: "light",
    tags: ["timeline", "horizontal", "phases", "consulting"],
    ai: {
      purpose: "Sets expectations about how long each part of an engagement takes.",
      whenToUse: "Consultants, agencies, builders and course providers.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Twelve weeks, start to launch", {
          eyebrow: "Engagement timeline",
          sub: "Every website project follows the same four phases, so you always know what's next and what we need from you.",
        }),
        timeline(
          [
            ["Weeks 1–2", "Discovery", "Interviews, analytics and a one-page brief."],
            ["Weeks 3–5", "Design", "Two directions, then one, refined with you."],
            ["Weeks 6–10", "Build", "Pages, content and testing on real phones."],
            ["Weeks 11–12", "Launch", "Go live, train your team, fix the small things."],
          ],
          { variant: "horizontal" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "how-it-works-photos",
    label: "How it works with photos",
    description: "Three steps, each with a photograph, a step label and a short explanation.",
    copy: [headline],
    images: [{ slot: "step photos", aspect: "3:2", count: 3 }],
    defaultTheme: "light",
    tags: ["steps", "image", "three-up", "how-it-works"],
    links: { primary: "/subscribe" },
    ai: {
      purpose: "Makes a service tangible by showing each step.",
      whenToUse: "Subscriptions, deliveries, classes and rentals.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("From our farm to your fridge", { eyebrow: "How the box works" }),
        columns(
          [
            {
              heading: "1. We pick on Monday",
              body: "Whatever's ripest that week, harvested the morning we pack.",
              image: ["seedlings", 380, "3:2"],
            },
            {
              heading: "2. You choose by Tuesday",
              body: "Swap anything you don't love from the week's list of extras.",
              image: ["saladBowl", 380, "3:2"],
            },
            {
              heading: "3. It arrives Thursday",
              body: "Delivered by bike across town, in a box we collect next week.",
              image: ["breadLoaves", 380, "3:2"],
            },
          ],
          "3",
          { aspect: "3:2" },
        ),
        button("Start a weekly box", c.primary),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "day-schedule",
    label: "Day schedule",
    description: "An alternating timeline of the day's events with times — a running order.",
    copy: [headline, intro, stepTitle(1, 8)],
    defaultTheme: "light-accent",
    tags: ["timeline", "alternating", "schedule", "wedding", "event"],
    ai: {
      purpose: "Gives guests a clear running order for the day.",
      whenToUse: "Weddings, retreats, workshops and one-day events.",
      avoid: `${AVOID} Times that aren't final.`,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "xl" }),
      blocks: [
        heading("The day, hour by hour", {
          align: "center",
          eyebrow: "Saturday 14 September",
          sub: "Everything happens at Hollins Barn. Bring layers — evenings in the hills get chilly.",
        }),
        timeline(
          [
            ["2:30 pm", "Guests arrive", "Lemonade on the lawn and lawn games for the kids."],
            ["3:00 pm", "Ceremony in the orchard", "About twenty minutes; seats for everyone."],
            ["4:00 pm", "Drinks and photos", "Local cider, a string trio and a long golden hour."],
            ["6:00 pm", "Dinner in the barn", "Family-style plates from Hollins Kitchen."],
            ["8:30 pm", "Dancing", "Until the band packs up at midnight."],
          ],
          { variant: "alternating" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "sticky-steps",
    label: "Steps beside heading",
    description:
      "A heading, introduction and button on the left; a numbered vertical timeline on the right.",
    copy: [headline, copy.body(8, 40), stepTitle()],
    defaultTheme: "light",
    tags: ["timeline", "two-column", "steps", "onboarding"],
    links: { primary: "/apply" },
    ai: {
      purpose: "Explains a multi-step process with room for detail.",
      whenToUse: "Applications, onboarding, adoption, admissions and memberships.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Adopting a dog from the shelter", { col: 0, eyebrow: "Adoption" }),
        text(
          [
            rt.p(
              "Most adoptions take about two weeks. We'd rather go slowly and find the right match than rush and see a dog come back.",
            ),
          ],
          { col: 0 },
        ),
        button("Start an application", c.primary, { col: 0 }),
        timeline(
          [
            [
              "Step 1",
              "Tell us about your home",
              "A short form about your space, routine and other pets.",
            ],
            [
              "Step 2",
              "Meet the dogs",
              "Visit on a weekend and spend time with two or three possible matches.",
            ],
            [
              "Step 3",
              "A home visit",
              "A volunteer drops by for half an hour. It's friendly, we promise.",
            ],
            ["Step 4", "Foster to adopt", "Two weeks together before anything is final."],
          ],
          { col: 1 },
        ),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "step-cards",
    label: "Step cards",
    description: "Three icon cards on tinted panels, each a step, under a left-aligned heading.",
    copy: [headline, intro],
    defaultTheme: "dark",
    tags: ["steps", "cards", "icons", "three-up"],
    links: { primary: "/quote" },
    ai: {
      purpose: "A bold, compact explanation of how to get started.",
      whenToUse: "Product sign-ups, quotes and services with a simple three-step path.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("Solar in three steps", {
        eyebrow: "Getting started",
        sub: "Most homes go from first call to switched on in about six weeks.",
      });
      const a = card(
        "Free roof survey",
        "We check your roof, wiring and usage, and send an honest estimate.",
        {
          icon: "home",
          eyebrow: "Step one",
          style: panel(raised(c.theme)),
        },
      );
      const b = card(
        "Fixed quote",
        "One price covering panels, battery, permits and installation.",
        {
          icon: "shield-check",
          eyebrow: "Step two",
          style: panel(raised(c.theme)),
        },
      );
      const d = card(
        "Two-day install",
        "A local crew fits everything and leaves the place tidier than before.",
        {
          icon: "sun",
          eyebrow: "Step three",
          style: panel(raised(c.theme)),
        },
      );
      const cta = button("Book a roof survey", c.primary);
      return {
        ...grid([
          [h, r(1, 1, 14, 6), r(1, 1, 8, 7)],
          [a, r(1, 8, 8, 10), r(1, 9, 8, 9)],
          [b, r(9, 8, 8, 10), r(1, 19, 8, 9)],
          [d, r(17, 8, 8, 10), r(1, 29, 8, 9)],
          [cta, r(1, 19, 8, 3), r(1, 39, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "process",
    name: "curriculum-tabs",
    label: "Programme by week",
    description: "A programme or curriculum in tabs, one tab per week or module.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["tabs", "curriculum", "course", "programme"],
    links: { primary: "/enrol" },
    ai: {
      purpose: "Lays out what a course or programme covers, step by step.",
      whenToUse: "Courses, cohorts, retreats and training programmes.",
      avoid: `${AVOID} More than eight tabs.`,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Six weeks to your first loaf", {
          eyebrow: "Sourdough foundations",
          sub: "One evening a week in the bakery, with homework you can eat.",
        }),
        make(
          tabsBlock,
          {
            label: "Course weeks",
            items: [
              {
                label: "Weeks 1–2",
                content: rt.doc(
                  rt.h(3, "Starter and flour", "h4"),
                  rt.p("Feed and read a starter, choose flours and bake a simple country loaf."),
                ),
              },
              {
                label: "Weeks 3–4",
                content: rt.doc(
                  rt.h(3, "Shaping and scoring", "h4"),
                  rt.p("Tension, banneton work and the cuts that make a loaf open in the oven."),
                ),
              },
              {
                label: "Weeks 5–6",
                content: rt.doc(
                  rt.h(3, "Your own recipe", "h4"),
                  rt.p("Adjust hydration and timing to your kitchen, then bake for the group."),
                ),
              },
            ],
          },
          { variant: "pills" },
        ),
        button("Enrol for spring", c.primary, { note: "Eight places per course." }),
      ],
    }),
  }),

  definePreset({
    category: "process",
    name: "prep-checklist",
    label: "Before your visit",
    description: "A checklist of what to bring or do beforehand, beside a photograph.",
    copy: [headline, copy.items("item", "Checklist item", "icon-list", "items", "title", 2, 8)],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "light-accent",
    tags: ["checklist", "image", "two-column", "preparation"],
    ai: {
      purpose: "Prepares people for a first appointment or visit, so it goes smoothly.",
      whenToUse: "Clinics, salons, tattoo studios, tours and classes.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [7, 5], align: "center", gap: "2xl" }),
      blocks: [
        heading("Before your first appointment", { col: 0, eyebrow: "New clients" }),
        icons(
          [
            ["clock", "Arrive ten minutes early", "There's a short health form to fill in."],
            ["droplet", "Drink plenty of water", "It helps your muscles recover afterwards."],
            ["user", "Wear something comfortable", "Loose layers are easiest."],
            ["phone", "Need to reschedule?", "Call us at least 24 hours ahead."],
          ],
          "2",
          { col: 0, variant: "checklist" },
        ),
        image(photo("massage", 460, "4:5"), { col: 1, aspect: "4:5" }),
      ],
    }),
  }),
];
