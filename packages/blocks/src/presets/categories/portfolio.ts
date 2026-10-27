import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, r, rt, stack, text } from "../kit";
import { columns, logos, pullQuote, stats, summary } from "../parts";

/** Portfolio & case-study presets: project openers, results, indexes and client words. */

const headline = copy.headline(1, 10, 2);
const AVOID =
  "Results, client names or quotes the owner can't share; projects without permission to publish; more than one case study per section.";

export const portfolioPresets = [
  definePreset({
    category: "portfolio",
    name: "case-study-opener",
    label: "Case study opener",
    description:
      "Project title and summary beside client, role and year, above a wide project photograph.",
    copy: [headline, copy.body(4, 45)],
    images: [{ slot: "photo", aspect: "21:9" }],
    defaultTheme: "light",
    tags: ["case-study", "image", "wide", "project"],
    ai: {
      purpose: "Opens a case study page with the essentials at a glance.",
      whenToUse: "The first section of a project or case study page.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [8, 4], gap: "xl", width: "wide" }),
      blocks: [
        heading("Rebuilding the Harbourside Library", {
          col: 0,
          eyebrow: "Case study · Civic architecture",
        }),
        text(
          [
            rt.p(
              "A 1970s concrete library turned inside out: a new glass reading room on the water, daylight in every stack and a ground floor that's open to everyone, all day.",
              "lead",
            ),
          ],
          { col: 0 },
        ),
        text(
          [
            rt.p("Client", "eyebrow"),
            rt.p("City of Port Ellis"),
            rt.p("Role", "eyebrow"),
            rt.p("Architecture and interiors"),
            rt.p("Completed", "eyebrow"),
            rt.p("Spring 2025"),
          ],
          { col: 1 },
        ),
        image(photo("whiteCurves", 1440, "21:9"), { aspect: "21:9" }),
      ],
    }),
  }),

  definePreset({
    category: "portfolio",
    name: "results-band",
    label: "Results band",
    description: "A short heading and three outcome numbers on a dark band.",
    copy: [headline, copy.items("result", "Result label", "stats", "items", "label", 2, 8)],
    defaultTheme: "dark",
    tags: ["case-study", "stats", "results"],
    ai: {
      purpose: "Shows what a project achieved, in numbers the client agreed to publish.",
      whenToUse: "Inside case studies, after the story and before the next project.",
      avoid: `${AVOID} Percentages without a baseline.`,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("What changed in the first year", { eyebrow: "Results" }),
        stats(
          [
            ["3×", "More weekday visitors", "Compared with the year before closing."],
            ["62%", "Lower energy use", "Heat pumps, shading and a new roof."],
            ["11 pm", "Latest opening hour", "The ground floor stays open for study."],
          ],
          { variant: "row" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "portfolio",
    name: "project-index",
    label: "Project index",
    description: "A compact list of projects from the portfolio, newest first.",
    copy: [headline],
    collections: ["portfolio"],
    collection: "work",
    defaultTheme: "light",
    tags: ["list", "collection", "index", "minimal"],
    ai: {
      purpose: "An index of all work — fast to scan, easy to keep up to date.",
      whenToUse: "Portfolio pages with many projects; architects, designers, studios.",
      avoid: "Showing projects without an image or a one-line summary.",
    },
    make: (c) => ({
      layout: stack({ width: "content" }),
      blocks: [
        summary(c.collection, {
          heading: "Index of projects",
          variant: "list",
          limit: 12,
          image: false,
          excerpt: true,
          empty: "Projects are being added — check back soon.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "portfolio",
    name: "project-grid",
    label: "Selected work grid",
    description: "Projects as large two-up image cards with titles and a link to all work.",
    copy: [headline],
    images: [{ slot: "project images", aspect: "3:2", count: 4 }],
    collections: ["portfolio"],
    collection: "work",
    tags: ["grid", "collection", "image", "two-up"],
    ai: {
      purpose: "Leads with the pictures — the best way into a visual portfolio.",
      whenToUse: "Home and work pages for photographers, designers and makers.",
      avoid: "More than eight projects on a home page; inconsistent image crops.",
    },
    make: (c) => ({
      layout: stack({ width: "wide" }),
      blocks: [
        summary(c.collection, {
          heading: "Selected work",
          variant: "grid",
          columns: "2",
          limit: 4,
          date: false,
          excerpt: false,
          linkLabel: "All projects",
          link: `/${c.collection}/`,
          empty: "Projects are being added — check back soon.",
        }),
      ],
    }),
  }),

  definePreset({
    category: "portfolio",
    name: "challenge-approach-outcome",
    label: "Challenge, approach, outcome",
    description:
      "The case-study story in three columns: what was wrong, what we did, what changed.",
    copy: [headline],
    defaultTheme: "light-accent",
    tags: ["case-study", "three-up", "columns", "story"],
    ai: {
      purpose: "Tells a project story in the shape buyers expect.",
      whenToUse: "Consultants, agencies and studios writing up client work.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("A checkout that people finish", { eyebrow: "Northwind Outfitters" }),
        columns(
          [
            {
              heading: "The challenge",
              body: "Seven in ten mobile shoppers abandoned the checkout, most of them at the shipping step.",
            },
            {
              heading: "Our approach",
              body: "Twenty customer calls, a one-page checkout and shipping costs shown on every product.",
            },
            {
              heading: "The outcome",
              body: "Mobile conversion up by a third within eight weeks, with fewer support emails.",
            },
          ],
          "3",
          { variant: "cards" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "portfolio",
    name: "alternating-projects",
    label: "Alternating projects",
    description:
      "Two projects as large photos with captions, stepping left and right down the page.",
    copy: [headline, copy.body(6, 40)],
    images: [{ slot: "project photos", aspect: "fill", count: 2 }],
    defaultTheme: "light",
    tags: ["grid", "image", "editorial", "two-up"],
    links: { primary: "/work/coastline", secondary: "/work/desert-light" },
    ai: {
      purpose: "An editorial way to feature two projects with room for each.",
      whenToUse: "Photographers and studios featuring two series or commissions.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("Recent commissions", { eyebrow: "Selected work" });
      const a = image(photo("dunes", 880));
      const aText = text([
        rt.h(3, "Desert light", "h3"),
        rt.p("A month photographing the dunes at dawn for a travel magazine's winter issue."),
      ]);
      const aLink = button("View the series", c.primary, { role: "tertiary" });
      const b = image(photo("streetShadows", 880));
      const bText = text([
        rt.h(3, "Long shadows", "h3"),
        rt.p(
          "Street portraits of commuters in the hour before sunset, shot for a city arts festival.",
        ),
      ]);
      const bLink = button("View the series", c.secondary, { role: "tertiary" });
      return {
        ...grid(
          [
            [h, r(1, 1, 12, 4), r(1, 1, 8, 4)],
            [a, r(1, 6, 15, 18), r(1, 6, 8, 11)],
            [aText, r(17, 16, 8, 6), r(1, 18, 8, 6)],
            [aLink, r(17, 22, 8, 2), r(1, 24, 8, 2)],
            [b, r(10, 27, 15, 18), r(1, 28, 8, 11)],
            [bText, r(1, 37, 8, 6), r(1, 40, 8, 6)],
            [bLink, r(1, 43, 8, 2), r(1, 46, 8, 2)],
          ],
          { width: "wide" },
        ),
      };
    },
  }),

  definePreset({
    category: "portfolio",
    name: "client-quote",
    label: "Client words with project",
    description: "A large client quote beside a tall project photograph.",
    copy: [headline, copy.field("quote", "Quote", "quote", "quote", 8, 45)],
    images: [{ slot: "photo", aspect: "4:5" }],
    defaultTheme: "dark-accent",
    tags: ["quote", "image", "two-column", "case-study"],
    ai: {
      purpose: "Lets the client describe the result in their own words.",
      whenToUse: "Between case studies or at the end of one.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ cols: [7, 5], align: "center", gap: "2xl" }),
      blocks: [
        heading("In the client's words", { col: 0, eyebrow: "Harbourside Library" }),
        pullQuote(
          "They listened to librarians, teenagers and the night cleaners before drawing a single line. You can feel that in every room.",
          "Dana Whitlock",
          "Head of Libraries, Port Ellis",
          { col: 0 },
        ),
        image(photo("architecture", 480, "4:5"), { col: 1, aspect: "4:5" }),
      ],
    }),
  }),

  definePreset({
    category: "portfolio",
    name: "capabilities-clients",
    label: "Capabilities and clients",
    description: "What the studio does as a list of disciplines, beside a wall of client names.",
    copy: [headline, copy.body(6, 40)],
    defaultTheme: "light",
    tags: ["services", "logos", "two-column", "agency"],
    links: { primary: "/contact" },
    ai: {
      purpose: "Summarises disciplines and track record in one compact section.",
      whenToUse: "Agencies, studios and freelancers after the portfolio.",
      avoid: `${AVOID} Logos of clients the studio didn't work for directly.`,
    },
    make: (c) => {
      const h = heading("What we do, and who for", { eyebrow: "Capabilities" });
      const list = text([
        rt.p(
          "Brand identity · Packaging · Websites · Editorial design · Signage and wayfinding · Art direction",
          "lead",
        ),
      ]);
      const cta = button("Start a project", c.primary, { role: "secondary" });
      const wall = logos(
        [
          "Fieldhouse Coffee",
          "Port Ellis Libraries",
          "Northwind Outfitters",
          "Saltmarsh Press",
          "Cedar & Pine",
          "The Lantern Theatre",
        ],
        "Clients include",
        { variant: "grid", style: { colorTheme: "light-accent", padding: { d: "lg", m: "md" } } },
      );
      return {
        ...grid([
          [h, r(1, 1, 10, 5), r(1, 1, 8, 5)],
          [list, r(1, 7, 10, 8), r(1, 7, 8, 8)],
          [cta, r(1, 16, 10, 3), r(1, 16, 8, 3)],
          [wall, r(13, 1, 12, 18), r(1, 20, 8, 16)],
        ]),
      };
    },
  }),
];
