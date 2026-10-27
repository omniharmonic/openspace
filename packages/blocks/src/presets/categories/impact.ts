import type { BlockStyle } from "@omniharmonic/openspace-schema";
import { chartBlock } from "../../blocks/chart";
import { donationBlock } from "../../blocks/commerce";
import { countdownBlock } from "../../blocks/countdown";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, make, r, rt, scrim, stack, text } from "../kit";
import { card, icons, panel, stats } from "../parts";

/** Impact & donation presets for nonprofits, campaigns and community funds. */

const headline = copy.headline(2, 10, 2);
const AVOID =
  "Impact numbers, costs per outcome or financial splits the organisation can't evidence; guilt-driven copy; pity imagery.";

const donation = (
  o: {
    heading?: string;
    description?: string;
    amounts: number[];
    frequency: "both" | "once" | "monthly";
    button: string;
    note?: string;
  },
  place: { col?: number; variant: string; style?: BlockStyle },
) =>
  make(
    donationBlock,
    {
      heading: o.heading,
      headingLevel: "h3",
      description: o.description,
      mode: "checkout",
      currency: "USD",
      amounts: o.amounts.map((amount) => ({ amount })),
      allowCustom: true,
      frequency: o.frequency,
      buttonLabel: o.button,
      note: o.note,
    },
    place,
  );

export const impactPresets = [
  definePreset({
    category: "impact",
    name: "monthly-giving",
    label: "Monthly giving",
    description:
      "What a monthly gift pays for, as a short list, beside a donation card set to monthly.",
    copy: [headline, copy.items("outcome", "Outcome", "icon-list", "items", "title", 2, 10)],
    defaultTheme: "light-accent",
    tags: ["donate", "monthly", "two-column", "nonprofit"],
    ai: {
      purpose: "Turns visitors into regular supporters by making a monthly gift concrete.",
      whenToUse: "Donate pages and home pages of nonprofits with recurring giving.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        heading("Become a monthly tree keeper", { col: 0, eyebrow: "Give monthly" }),
        icons(
          [
            ["droplet", "$10 waters a young tree all summer"],
            ["sprout", "$25 plants a tree on a hot street"],
            ["users", "$50 trains a block's tree team"],
          ],
          "1",
          { col: 0, variant: "list" },
        ),
        donation(
          {
            amounts: [10, 25, 50],
            frequency: "monthly",
            button: "Give monthly",
            note: "Cancel any time from the link in your receipt.",
          },
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "impact",
    name: "numbers-over-photo",
    label: "Impact numbers over photo",
    description: "Three big impact numbers over a photograph of the work, with a short heading.",
    copy: [headline, copy.items("stat", "Stat label", "stats", "items", "label", 2, 8)],
    images: [{ slot: "background", aspect: "fill" }],
    tags: ["stats", "image", "background", "nonprofit"],
    ai: {
      purpose: "Shows the scale of the work in a single, memorable band.",
      whenToUse: "Home and about pages for nonprofits and community groups.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      padding: { d: "2xl", m: "xl" },
      background: {
        type: "image",
        src: photo("foodBank", 1920).src,
        focal: [0.5, 0.5],
        overlay: scrim(0.8),
      },
      blocks: [
        heading("What we did together last year", { eyebrow: "2025 in numbers", align: "center" }),
        stats(
          [
            ["212,000", "Meals packed by volunteers"],
            ["1,340", "Families with a weekly box"],
            ["38", "Partner schools and clinics"],
          ],
          { variant: "row", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "impact",
    name: "where-money-goes",
    label: "Where your money goes",
    description: "A pie chart of how each dollar is spent beside a short, plain explanation.",
    copy: [headline, copy.body(8, 50)],
    defaultTheme: "light",
    tags: ["chart", "transparency", "two-column", "nonprofit"],
    links: { primary: "/annual-report" },
    ai: {
      purpose: "Builds trust by showing how donations are spent.",
      whenToUse: "Donate and about pages, with figures from the latest accounts.",
      avoid: `${AVOID} Rounded figures that don't add up to 100.`,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        heading("Where every dollar goes", { col: 0, eyebrow: "Transparency" }),
        text(
          [
            rt.p(
              "Our accounts are audited every year and published in full. Most of what you give goes straight to planting and watering trees on the hottest streets.",
            ),
          ],
          { col: 0 },
        ),
        button("Read the annual report", c.primary, { col: 0, role: "secondary" }),
        make(
          chartBlock,
          {
            title: "Spending in 2025",
            description: "Share of total spending, from audited accounts.",
            rows: [
              { label: "Planting and care", value: 78 },
              { label: "Training neighbours", value: 12 },
              { label: "Fundraising", value: 6 },
              { label: "Running costs", value: 4 },
            ],
            suffix: "%",
            showValues: true,
            showTable: false,
          },
          { col: 1, variant: "pie" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "impact",
    name: "campaign-goal",
    label: "Campaign goal",
    description:
      "A campaign's goal, amount raised and donors so far, a countdown and a donate button.",
    copy: [headline, copy.sub(6, 35)],
    defaultTheme: "brand",
    themes: ["brand", "dark", "dark-accent", "light-accent"],
    tags: ["campaign", "stats", "countdown", "donate", "centered"],
    links: { primary: "/donate" },
    ai: {
      purpose: "Rallies support behind a time-limited appeal.",
      whenToUse: "Giving days, building appeals and emergency funds with a real deadline.",
      avoid: `${AVOID} Fake deadlines; totals that aren't updated.`,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "lg" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Help us buy the garden lot", {
          align: "center",
          eyebrow: "Spring appeal",
          sub: "The lot behind the library is for sale. If we raise $120,000 by 30 April, it becomes a garden forever.",
        }),
        stats(
          [
            ["$84,300", "Raised so far"],
            ["$120,000", "Our goal"],
            ["912", "Neighbours have given"],
          ],
          { variant: "row", style: { align: { d: "center" } } },
        ),
        make(
          countdownBlock,
          {
            heading: undefined,
            headingLevel: "h3",
            target: "2027-04-30T23:59:00-07:00",
            showSeconds: false,
            doneMessage: "The appeal has closed — thank you, everyone.",
            buttonLabel: undefined,
            link: undefined,
          },
          { variant: "inline", style: { align: { d: "center" } } },
        ),
        button("Give to the appeal", c.primary, { align: "center", size: "large" }),
      ],
    }),
  }),

  definePreset({
    category: "impact",
    name: "program-stories",
    label: "Programme stories",
    description: "Three programmes as photo cards, each with a result in the eyebrow and a link.",
    copy: [headline, copy.sub(6, 35)],
    images: [{ slot: "programme photos", aspect: "3:2", count: 3 }],
    defaultTheme: "light",
    tags: ["cards", "image", "three-up", "programmes"],
    ai: {
      purpose: "Shows what the organisation actually does, programme by programme.",
      whenToUse: "Home and 'Our work' pages for nonprofits.",
      avoid: AVOID,
    },
    make: () => {
      const h = heading("What we do", {
        eyebrow: "Our programmes",
        sub: "Three programmes, run with neighbours and partner schools across the east side.",
      });
      const a = card(
        "Street trees",
        "We plant on the hottest blocks first, with residents choosing the species.",
        {
          image: ["sapling", 400, "3:2"],
          eyebrow: "4,820 trees",
          link: "/our-work/street-trees",
          linkLabel: "How it works",
        },
      );
      const b = card(
        "School gardens",
        "Raised beds, a weekly lesson and a harvest lunch at twelve schools.",
        {
          image: ["urbanGarden", 400, "3:2"],
          eyebrow: "12 schools",
          link: "/our-work/school-gardens",
          linkLabel: "Visit a garden",
        },
      );
      const d = card(
        "Tree keepers",
        "Training for neighbours who water, prune and look after their block.",
        {
          image: ["gardenPlanting", 400, "3:2"],
          eyebrow: "310 keepers",
          link: "/volunteer",
          linkLabel: "Become a keeper",
        },
      );
      return {
        ...grid([
          [h, r(1, 1, 16, 7), r(1, 1, 8, 8)],
          [a, r(1, 9, 8, 17), r(1, 10, 8, 15)],
          [b, r(9, 9, 8, 17), r(1, 26, 8, 15)],
          [d, r(17, 9, 8, 17), r(1, 42, 8, 15)],
        ]),
      };
    },
  }),

  definePreset({
    category: "impact",
    name: "ways-to-give",
    label: "Ways to help",
    description:
      "Four ways to get involved as tiles: give, volunteer, fundraise and spread the word.",
    copy: [headline, copy.items("way", "Way to help", "icon-list", "items", "title", 1, 5)],
    defaultTheme: "light-accent",
    tags: ["icons", "tiles", "get-involved", "nonprofit"],
    links: { primary: "/get-involved" },
    ai: {
      purpose: "Offers something for everyone who wants to help, not only donors.",
      whenToUse: "Get-involved pages and the end of nonprofit home pages.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Four ways to help this spring", { eyebrow: "Get involved", align: "center" }),
        icons(
          [
            ["heart", "Give", "A one-off or monthly gift plants and waters trees."],
            ["users", "Volunteer", "Planting days every other Saturday, all ages welcome."],
            ["rocket", "Fundraise", "Run, bake or birthday-fundraise with our kit."],
            [
              "message-circle",
              "Spread the word",
              "Tell your block — the best trees are wanted ones.",
            ],
          ],
          "4",
          { variant: "tiles" },
        ),
        button("Find your way in", c.primary, { align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "impact",
    name: "growth-chart",
    label: "Growth over the years",
    description: "A column chart of growth over several years on a panel, beside a short story.",
    copy: [headline, copy.body(8, 50)],
    defaultTheme: "dark",
    tags: ["chart", "growth", "two-column", "report"],
    links: { primary: "/annual-report" },
    ai: {
      purpose: "Shows a trend — members, meals, trees, hours — over time.",
      whenToUse: "About, impact and annual report pages.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        heading("Ten years of steady growth", { col: 0, eyebrow: "Our impact" }),
        text(
          [
            rt.p(
              "We started with forty trees and a borrowed truck. Every year since, more neighbours have asked for trees on their street — and stayed to look after them.",
            ),
          ],
          { col: 0 },
        ),
        button("See the annual report", c.primary, { col: 0 }),
        make(
          chartBlock,
          {
            title: "Trees planted each year",
            description: "Trees planted and still alive after one summer.",
            rows: [
              { label: "2021", value: 310 },
              { label: "2022", value: 450 },
              { label: "2023", value: 620 },
              { label: "2024", value: 780 },
              { label: "2025", value: 940 },
            ],
            showValues: true,
            showTable: false,
          },
          { col: 1, variant: "column", style: panel("dark-accent") },
        ),
      ],
    }),
  }),
];
