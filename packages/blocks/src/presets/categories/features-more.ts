import { chartBlock } from "../../blocks/chart";
import { tabsBlock } from "../../blocks/tabs";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";
import { card, icons, logos, panel, raised, stats, table, testimonial } from "../parts";

/** Second wave of features & benefits: alternating rows, comparisons, tabs, tiles, specs. */

const headline = copy.headline(2, 10, 2);
const intro = copy.sub(6, 35);
const item = (min = 1, max = 6) =>
  copy.items("feature", "Feature name", "icon-list", "items", "title", min, max);
const AVOID =
  "Features the product or service doesn't have; jargon; more than eight features in one list; comparisons with named competitors.";

export const featuresMorePresets = [
  definePreset({
    category: "features",
    name: "alternating-rows",
    label: "Alternating feature rows",
    description: "Three features, each a photograph beside its explanation, alternating sides.",
    copy: [headline, copy.body(8, 40)],
    images: [{ slot: "feature photos", aspect: "fill", count: 3 }],
    defaultTheme: "light",
    tags: ["image", "alternating", "rows", "grid"],
    ai: {
      purpose: "Explains three key features in depth, each with a picture.",
      whenToUse: "Product and service pages where each feature deserves a paragraph.",
      avoid: AVOID,
    },
    make: () => {
      const h = heading("Built for the way kitchens really work", {
        eyebrow: "Why cooks choose us",
        align: "center",
      });
      const row = (title: string, body: string) =>
        text([
          rt.p(title.split(" — ")[0] as string, "eyebrow"),
          rt.h(3, title.split(" — ")[1] as string, "h3"),
          rt.p(body),
        ]);
      const a = image(photo("blueprint", 640));
      const at = row(
        "Layout — Planned around your cooking",
        "We watch how you cook before drawing anything, so the bin, the knives and the kettle end up exactly where your hands go.",
      );
      const b = image(photo("kitchen", 640));
      const bt = row(
        "Materials — Solid wood, oiled not lacquered",
        "Oak and ash from managed forests, finished with oil you can renew yourself. Scratches sand out instead of chipping.",
      );
      const d = image(photo("woodworker", 640));
      const dt = row(
        "Aftercare — We come back every year",
        "An annual visit to oil worktops, adjust hinges and fix anything that's bothering you, for as long as you own the kitchen.",
      );
      return {
        ...grid([
          [h, r(5, 1, 16, 5), r(1, 1, 8, 6)],
          [a, r(1, 8, 12, 16), r(1, 8, 8, 10)],
          [at, r(15, 12, 10, 8), r(1, 19, 8, 9)],
          [b, r(13, 26, 12, 16), r(1, 30, 8, 10)],
          [bt, r(1, 30, 10, 8), r(1, 41, 8, 9)],
          [d, r(1, 44, 12, 16), r(1, 52, 8, 10)],
          [dt, r(15, 48, 10, 8), r(1, 63, 8, 9)],
        ]),
      };
    },
  }),

  definePreset({
    category: "features",
    name: "comparison-table",
    label: "Comparison table",
    description: "A heading over a table comparing the offer with the usual way, row by row.",
    copy: [headline, intro],
    defaultTheme: "light",
    tags: ["table", "comparison", "versus"],
    ai: {
      purpose: "Makes the difference from the usual alternative obvious, point by point.",
      whenToUse: "Products and services replacing a familiar, worse way of doing things.",
      avoid: `${AVOID} Unfair or unverifiable claims about alternatives.`,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("A bookkeeper, not a shoebox", {
          align: "center",
          eyebrow: "Compare",
          sub: "What changes when your books are kept every week instead of once a year.",
        }),
        table(
          [["Doing it yourself"], ["With Ledgerly", "From $18 a month", true]],
          [
            ["Receipts matched to transactions", "no", "yes"],
            ["Sales tax worked out each quarter", "Spreadsheet", "Automatic"],
            ["Time spent each month", "About 6 hours", "About 20 minutes"],
            ["A person to ask", "no", "yes"],
            ["Year-end pack for your accountant", "no", "yes"],
          ],
          { caption: "Doing your own books compared with Ledgerly", variant: "lines" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "tabbed",
    label: "Features in tabs",
    description: "A heading and introduction beside tabs that each explain one feature.",
    copy: [headline, intro],
    defaultTheme: "light-accent",
    tags: ["tabs", "two-column", "product"],
    ai: {
      purpose: "Packs several features into one tidy section without a wall of text.",
      whenToUse: "Software and services with three to five distinct capabilities.",
      avoid: `${AVOID} Hiding the most important feature in a later tab.`,
    },
    make: () => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("One app for the whole front desk", {
          col: 0,
          eyebrow: "Features",
          sub: "Bookings, payments and reminders for studios and clinics, without the patchwork of tools.",
        }),
        make(
          tabsBlock,
          {
            label: "Front desk features",
            items: [
              {
                label: "Bookings",
                content: rt.doc(
                  rt.h(3, "Clients book themselves", "h4"),
                  rt.p(
                    "A booking page that shows real availability, with waitlists that fill cancellations automatically.",
                  ),
                ),
              },
              {
                label: "Payments",
                content: rt.doc(
                  rt.h(3, "Paid before they arrive", "h4"),
                  rt.p(
                    "Deposits, class packs and memberships, paid online and reconciled for you.",
                  ),
                ),
              },
              {
                label: "Reminders",
                content: rt.doc(
                  rt.h(3, "Fewer no-shows", "h4"),
                  rt.p("Text and email reminders the day before, with one-tap rescheduling."),
                ),
              },
            ],
          },
          { col: 1, variant: "underline" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "tile-grid",
    label: "Feature tiles",
    description: "Eight short features as icon tiles in four columns under a centred heading.",
    copy: [headline, intro, item(1, 5)],
    defaultTheme: "light",
    tags: ["icons", "tiles", "four-up", "amenities"],
    ai: {
      purpose: "Covers many small features or amenities at a glance.",
      whenToUse: "Venues, rentals, coworking spaces and software with many capabilities.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Everything you need to do good work", {
          align: "center",
          eyebrow: "The space",
          sub: "Desks, rooms and the small things that make a working day easier, all included in membership.",
        }),
        icons(
          [
            ["wifi", "Fast fibre wifi"],
            ["coffee", "Local coffee, free"],
            ["lock", "24/7 key access"],
            ["users", "Bookable meeting rooms"],
            ["phone", "Quiet phone booths"],
            ["bike", "Secure bike storage"],
            ["package", "Mail and parcels"],
            ["sun", "Rooftop terrace"],
          ],
          "4",
          { variant: "tiles" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "split-list",
    label: "Heading with feature list",
    description:
      "A heading, paragraph and button on the left, a two-column feature list on the right.",
    copy: [headline, copy.body(8, 40), item(1, 6)],
    defaultTheme: "light",
    tags: ["icons", "two-column", "list"],
    links: { primary: "/pricing" },
    ai: {
      purpose: "Lists what's included with room for a little explanation.",
      whenToUse: "Memberships, packages and plans with six to eight inclusions.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("What every membership includes", { col: 0, eyebrow: "Membership" }),
        text(
          [
            rt.p(
              "One monthly price for the whole gym — no add-ons for classes, towels or the sauna, and no contract longer than a month.",
            ),
          ],
          { col: 0 },
        ),
        button("See membership prices", c.primary, { col: 0 }),
        icons(
          [
            ["dumbbell", "Open gym, 5am–11pm", "Free weights, racks and rowers."],
            ["users", "Forty classes a week", "Strength, mobility and spin."],
            ["award", "A coached induction", "A plan built around your goals."],
            ["waves", "Sauna and showers", "Towels included."],
            ["calendar", "Pause any month", "Travel or injury, no fee."],
            ["heart", "Monthly check-ins", "Fifteen minutes with a coach."],
          ],
          "2",
          { col: 1, variant: "list" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "with-chart",
    label: "Feature with chart",
    description: "A feature explained beside a line chart that shows its effect.",
    copy: [headline, copy.body(8, 45)],
    defaultTheme: "dark",
    tags: ["chart", "two-column", "data", "product"],
    ai: {
      purpose: "Proves a claim with a simple, honest chart.",
      whenToUse: "Products and services with a measurable effect (speed, savings, growth).",
      avoid: `${AVOID} Charts without units or with cherry-picked ranges.`,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        heading("Watch your energy bill fall", { col: 0, eyebrow: "Live usage" }),
        text(
          [
            rt.p(
              "The Brightline app shows what your panels make and what your home uses, hour by hour, so you can run the dishwasher when the sun is out.",
            ),
          ],
          { col: 0 },
        ),
        make(
          chartBlock,
          {
            title: "Average monthly bill after installation",
            description: "Across 380 homes installed in 2024.",
            rows: [
              { label: "Before", value: 182 },
              { label: "Month 1", value: 118 },
              { label: "Month 3", value: 74 },
              { label: "Month 6", value: 41 },
              { label: "Month 12", value: 36 },
            ],
            prefix: "$",
            showValues: true,
            showTable: false,
          },
          { col: 1, variant: "line", style: panel("dark-accent") },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "integrations",
    label: "Works with your tools",
    description: "A heading and short line beside a grid of tools the product connects to.",
    copy: [headline, copy.body(6, 35)],
    defaultTheme: "light-accent",
    tags: ["logos", "integrations", "two-column", "saas"],
    links: { primary: "/integrations" },
    ai: {
      purpose: "Reassures buyers the product fits the tools they already use.",
      whenToUse: "Software with real integrations.",
      avoid: `${AVOID} Listing integrations that don't exist; using other companies' logos without checking their brand rules.`,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        heading("Fits the tools you already use", { col: 0, eyebrow: "Integrations" }),
        text(
          [
            rt.p(
              "Connect your calendar, accounting and chat in a couple of clicks. Everything stays in sync both ways.",
            ),
          ],
          { col: 0 },
        ),
        button("Browse integrations", c.primary, { col: 0, role: "secondary" }),
        logos(["Calendars", "Accounting", "Team chat", "Payments", "Email", "Storage"], undefined, {
          col: 1,
          variant: "grid",
        }),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "bento-stats",
    label: "Bento with numbers",
    description:
      "A bento grid of a headline tile, a photograph, two feature cards and a big number.",
    copy: [
      headline,
      copy.body(6, 30),
      copy.items("stat", "Stat label", "stats", "items", "label", 1, 6),
    ],
    images: [{ slot: "photo", aspect: "fill" }],
    defaultTheme: "light",
    tags: ["bento", "grid", "cards", "stats", "image"],
    ai: {
      purpose: "A lively overview of what makes the offer different.",
      whenToUse: "Home pages of studios, gyms, schools and products.",
      avoid: AVOID,
    },
    make: () => {
      const h = text(
        [
          rt.p("Why Northside Climbing", "eyebrow"),
          rt.h(2, "Small classes, serious progress", "h2"),
          rt.p("Coached sessions for new and returning climbers, four evenings a week."),
        ],
        { style: panel("light-accent", "xl") },
      );
      const pic = image(photo("gym", 560));
      const a = card(
        "Coaches on every wall",
        "Every session has a coach watching, cueing and spotting.",
        {
          icon: "users",
          style: panel("dark"),
        },
      );
      const b = card(
        "A plan that adapts",
        "Your programme changes as you get stronger, every four weeks.",
        {
          icon: "target",
          style: panel("light-accent"),
        },
      );
      const n = stats([["8", "Climbers per class, at most"]], {
        variant: "large",
        style: panel("brand"),
      });
      return {
        ...grid([
          [h, r(1, 1, 10, 10), r(1, 1, 8, 8)],
          [pic, r(11, 1, 14, 14), r(1, 10, 8, 11)],
          [a, r(1, 12, 10, 10), r(1, 22, 8, 9)],
          [b, r(11, 16, 7, 10), r(1, 32, 8, 9)],
          [n, r(18, 16, 7, 10), r(1, 42, 8, 7)],
        ]),
      };
    },
  }),

  definePreset({
    category: "features",
    name: "wide-image-points",
    label: "Wide photo with three points",
    description: "A centred heading, a wide photograph and three short points underneath.",
    copy: [headline, item(1, 6)],
    images: [{ slot: "photo", aspect: "21:9" }],
    defaultTheme: "light",
    tags: ["image", "wide", "icons", "three-up"],
    ai: {
      purpose: "Shows the place or product in full, then the three things to know.",
      whenToUse: "Venues, rentals, retreats and physical products.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide", gap: "xl" }),
      blocks: [
        heading("A room built for gatherings", { align: "center", eyebrow: "The barn" }),
        image(photo("sharedTable", 1440, "21:9"), { aspect: "21:9" }),
        icons(
          [
            ["users", "Seats eighty", "Long tables or a dance floor — or both."],
            ["utensils", "Full kitchen", "Bring your caterer or use ours."],
            ["car", "Free parking", "Forty spaces and a minibus drop-off."],
          ],
          "3",
          { variant: "list" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "included-checklist",
    label: "Everything included",
    description: "A tinted panel listing everything included, in three columns of checks.",
    copy: [headline, intro, item(1, 7)],
    defaultTheme: "light",
    tags: ["checklist", "panel", "three-column", "packages"],
    links: { primary: "/book" },
    ai: {
      purpose: "Answers 'what do I get?' completely, so there are no surprises.",
      whenToUse: "Packages, retreats, courses, weddings and service bundles.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Everything included in your retreat", {
          align: "center",
          eyebrow: "Five nights · $1,450",
          sub: "One price covers the room, the food and every session. Bring walking boots and a notebook.",
        }),
        icons(
          [
            ["check", "Five nights, private room"],
            ["check", "Three meals a day"],
            ["check", "Morning yoga"],
            ["check", "Guided coastal walks"],
            ["check", "Evening sound baths"],
            ["check", "Sauna and cold plunge"],
            ["check", "Transfers from the station"],
            ["check", "A one-to-one session"],
            ["check", "Journals and materials"],
          ],
          "3",
          { variant: "checklist", style: panel(raised(c.theme), "xl") },
        ),
        button("Reserve a place", c.primary, { align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "feature-with-review",
    label: "Feature with review",
    description:
      "A photograph beside a feature explanation, with a short customer review beneath it.",
    copy: [
      headline,
      copy.body(8, 45),
      copy.field("quote", "Testimonial", "testimonial", "quote", 6, 35),
    ],
    images: [
      { slot: "photo", aspect: "4:5" },
      { slot: "portrait", aspect: "1:1" },
    ],
    defaultTheme: "light-accent",
    tags: ["image", "two-column", "testimonial"],
    ai: {
      purpose: "Pairs a feature with proof that it works for real people.",
      whenToUse: "Services and products where one feature is the reason people buy.",
      avoid: `${AVOID} Invented reviews.`,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl" }),
      blocks: [
        image(photo("coachingSession", 560, "4:5"), { col: 0, aspect: "4:5" }),
        heading("A coach who knows your business", { col: 1, eyebrow: "One-to-one" }),
        text(
          [
            rt.p(
              "Every member is paired with one coach for the whole year — someone who remembers last month's numbers and asks the awkward questions.",
            ),
          ],
          { col: 1 },
        ),
        testimonial(
          "Having the same coach all year changed everything. She spotted problems before I did.",
          "Priya Natarajan",
          "Founder, Saltmarsh Press",
          "portraitMaya",
          { col: 1, variant: "minimal" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "features",
    name: "spec-sheet",
    label: "Product specifications",
    description: "A product photograph beside a striped table of its specifications.",
    copy: [headline],
    images: [{ slot: "product photo", aspect: "4:5" }],
    defaultTheme: "light",
    tags: ["table", "specs", "product", "two-column"],
    ai: {
      purpose: "Gives detail-minded buyers the exact numbers.",
      whenToUse: "Physical products: furniture, gear, equipment, instruments.",
      avoid: `${AVOID} Specs that differ from the label or listing.`,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        image(photo("yellowChair", 480, "4:5"), { col: 0, aspect: "4:5" }),
        heading("The Lark chair, in detail", { col: 1, eyebrow: "Specifications" }),
        table(
          [["Lark lounge chair"]],
          [
            ["Width", "74 cm"],
            ["Depth", "81 cm"],
            ["Seat height", "41 cm"],
            ["Frame", "Solid ash, oiled"],
            ["Upholstery", "Wool bouclé, 6 colours"],
            ["Made in", "Grand Rapids, Michigan"],
            ["Warranty", "Ten years on the frame"],
          ],
          { col: 1, variant: "striped", corner: "Specification" },
        ),
      ],
    }),
  }),
];
