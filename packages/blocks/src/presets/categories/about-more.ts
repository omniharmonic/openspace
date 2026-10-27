import { videoBlock } from "../../blocks/video";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";
import { columns, icons, panel, raised, stats } from "../parts";

/** Second wave of about & story presets: letters, statements, numbers, beliefs, awards. */

const headline = copy.headline(1, 12, 2);
const AVOID =
  "Inventing history, awards or credentials; corporate filler ('passionate about excellence'); writing about the business instead of for the reader.";

export const aboutMorePresets = [
  definePreset({
    category: "about",
    name: "founder-letter",
    label: "Letter from the founder",
    description: "A narrow, letter-style column opening with a drop cap and signed off by name.",
    copy: [headline, copy.body(40, 160)],
    defaultTheme: "light",
    tags: ["text-only", "letter", "narrow", "personal"],
    ai: {
      purpose: "A personal note that explains why the business exists, in the owner's voice.",
      whenToUse: "About pages for small, owner-run businesses and nonprofits.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        heading("Why I opened the shop", { eyebrow: "A note from Hannah" }),
        text(
          [
            rt.p(
              "I spent ten years buying flowers flown in from three continents for hotel lobbies. They were beautiful and they smelled of nothing.",
            ),
            rt.p(
              "So in 2019 I rented a quarter-acre behind my parents' house and started growing the flowers I'd always wanted to work with: sweet peas that fill a room, dahlias the size of dinner plates, grasses that move.",
            ),
            rt.p(
              "Everything in the shop is grown within thirty miles, cut the morning you collect it and wrapped in paper, not plastic. Thank you for choosing slow flowers.",
            ),
            rt.p("— Hannah Reyes, grower and florist", "small"),
          ],
          { variant: "drop-cap" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "statement",
    label: "Mission statement",
    description:
      "A single large mission sentence centred on a calm band, with a short line beneath.",
    copy: [copy.headline(4, 22, 2), copy.body(5, 30)],
    defaultTheme: "dark-accent",
    tags: ["text-only", "statement", "centered", "mission"],
    ai: {
      purpose: "States what the organisation is for, in one memorable sentence.",
      whenToUse: "Nonprofits, cooperatives and mission-led businesses.",
      avoid: `${AVOID} Mission statements longer than two lines.`,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      padding: { d: "2xl", m: "xl" },
      blocks: [
        heading("We believe every child should grow up within a short walk of a tree.", {
          size: "h1",
          align: "center",
          eyebrow: "Our mission",
        }),
        text([rt.p("That's the whole plan. Everything we do is in service of it.")], {
          align: "center",
        }),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "photo-pair",
    label: "Story with two photos",
    description: "Two overlapping photographs beside a short story and a link.",
    copy: [headline, copy.body(15, 70)],
    images: [{ slot: "photos", aspect: "fill", count: 2 }],
    defaultTheme: "light",
    tags: ["image", "grid", "overlap", "story"],
    links: { primary: "/about" },
    ai: {
      purpose: "A warm introduction to the people and the place.",
      whenToUse: "Home pages of cafés, studios, shops and family businesses.",
      avoid: AVOID,
    },
    make: (c) => {
      const big = image(photo("cafeInterior", 520));
      const small = image(photo("pourOver", 320), { shadow: "lg" });
      const words = text([
        rt.p("Our story", "eyebrow"),
        rt.h(2, "A café run by two sisters and a very old roaster", "h2"),
        rt.p(
          "Mira and Sol opened Twin Oaks in 2017 with savings, a second-hand roaster and their grandmother's cardamom bun recipe. They still roast every Friday and still argue about the buns.",
        ),
      ]);
      const cta = button("Meet the team", c.primary, { role: "tertiary" });
      return {
        ...grid([
          [big, r(1, 1, 10, 20), r(1, 1, 6, 13)],
          [small, r(7, 13, 7, 12, { z: 2 }), r(4, 9, 5, 8, { z: 2 })],
          [words, r(15, 4, 10, 14), r(1, 19, 8, 13)],
          [cta, r(15, 19, 10, 3), r(1, 33, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "about",
    name: "story-numbers",
    label: "Story with numbers",
    description: "A short history beside a column of three big numbers.",
    copy: [
      headline,
      copy.body(15, 80),
      copy.items("stat", "Stat label", "stats", "items", "label", 1, 8),
    ],
    defaultTheme: "light-accent",
    tags: ["stats", "two-column", "story", "trust"],
    ai: {
      purpose: "Tells the story and backs it with a few real figures.",
      whenToUse: "Trades, family firms, cooperatives and nonprofits with a track record.",
      avoid: `${AVOID} Rounded-up or unverifiable numbers.`,
    },
    make: () => ({
      layout: stack({ cols: [7, 5], gap: "2xl" }),
      blocks: [
        heading("Three generations of builders", { col: 0, eyebrow: "About us" }),
        text(
          [
            rt.p(
              "Abe Kowalski started the firm with a ladder and a van in 1972. His granddaughter Jo runs it today, with many of the same carpenters' kids on the crew.",
            ),
            rt.p(
              "We still answer our own phone, still give fixed prices and still come back when something isn't right.",
            ),
          ],
          { col: 0 },
        ),
        stats(
          [
            ["1972", "Building in the valley since"],
            ["2,300+", "Homes extended or restored"],
            ["18", "People on the crew"],
          ],
          { col: 1, variant: "large" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "team-photo-wide",
    label: "Team photo with three columns",
    description: "A wide team photograph above three short paragraphs about how the team works.",
    copy: [headline],
    images: [{ slot: "team photo", aspect: "21:9" }],
    defaultTheme: "light",
    tags: ["image", "wide", "team", "three-up"],
    ai: {
      purpose: "Shows the people together, then how they work.",
      whenToUse: "Agencies, clinics, schools and any team-based business.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "wide", gap: "xl" }),
      blocks: [
        heading("A small team that does the work itself", { eyebrow: "Who we are" }),
        image(photo("teamScreens", 1440, "21:9"), { aspect: "21:9" }),
        columns(
          [
            {
              heading: "No hand-offs",
              body: "The person you meet on the first call is the one who builds your project.",
            },
            {
              heading: "Remote, not distant",
              body: "Six people in four cities, together in one room every quarter.",
            },
            {
              heading: "Four-day weeks",
              body: "Rested people make fewer mistakes. Fridays are for learning and walks.",
            },
          ],
          "3",
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "beliefs",
    label: "What we believe",
    description:
      "A heading beside a numbered list of short beliefs, each with a line of explanation.",
    copy: [headline],
    defaultTheme: "light",
    tags: ["list", "values", "two-column", "manifesto"],
    ai: {
      purpose: "States the principles that guide the work, so the right customers self-select.",
      whenToUse: "Studios, schools, practices and mission-led businesses.",
      avoid: `${AVOID} More than six beliefs; beliefs anyone would claim ('quality matters').`,
    },
    make: () => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Four things we believe about teaching", { col: 0, eyebrow: "Our approach" }),
        columns(
          [
            {
              heading: "Curiosity beats talent",
              body: "Every child can learn to love a subject if it's met with questions, not answers.",
            },
            {
              heading: "Small groups, always",
              body: "Six students at most, so nobody can hide and nobody gets lost.",
            },
            {
              heading: "Mistakes are the lesson",
              body: "We celebrate wrong answers that were worth trying.",
            },
            {
              heading: "Parents are partners",
              body: "A short note home after every session, written by the tutor.",
            },
          ],
          "2",
          { col: 1, variant: "steps" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "with-video",
    label: "Story with video",
    description: "A short story and link beside a click-to-play video.",
    copy: [headline, copy.body(10, 60)],
    images: [{ slot: "poster", aspect: "16:9" }],
    defaultTheme: "dark",
    tags: ["video", "two-column", "story"],
    links: { primary: "/about" },
    ai: {
      purpose:
        "Lets people see and hear the founders or the place. The sample video is an open movie — replace it.",
      whenToUse: "When there's a short, honest film about the business.",
      avoid: `${AVOID} Videos longer than three minutes.`,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        heading("Two minutes in the workshop", { col: 0, eyebrow: "Behind the scenes" }),
        text(
          [
            rt.p(
              "Every chair starts as a rough plank from a local sawmill. Watch Pete and Lou turn one into a seat you'll keep for forty years.",
            ),
          ],
          { col: 0 },
        ),
        button("Our story", c.primary, { col: 0, role: "secondary" }),
        make(
          videoBlock,
          {
            source: "embed",
            url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            title: "Sample video: Big Buck Bunny, an open movie from the Blender Foundation",
            poster: photo("stool", 900, "16:9"),
            caption: "Sample video — replace it with your own.",
            aspect: "16:9",
            background: false,
          },
          { col: 1, variant: "default" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "recognition",
    label: "Awards and recognition",
    description: "A short introduction beside a list of awards, certifications and memberships.",
    copy: [
      headline,
      copy.body(6, 40),
      copy.items("award", "Award", "icon-list", "items", "title", 2, 8),
    ],
    defaultTheme: "light-accent",
    tags: ["awards", "trust", "two-column", "credentials"],
    ai: {
      purpose: "Lists the credentials that matter to buyers.",
      whenToUse: "Professional services, trades, restaurants and schools.",
      avoid: `${AVOID} Awards that were paid for or don't exist.`,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Recognised by our peers", { col: 0, eyebrow: "Credentials" }),
        text(
          [
            rt.p(
              "We don't enter many awards, but we're proud of these — and of the standards behind them.",
            ),
          ],
          { col: 0 },
        ),
        icons(
          [
            ["award", "Regional Builder of the Year, 2024", "Valley Home Builders Association"],
            ["shield-check", "Certified Passive House tradesperson", "Every site lead is trained."],
            ["leaf", "Member, Green Building Council", "Since 2015."],
            ["star", "4.9 stars from 380 reviews", "Across the major review sites."],
          ],
          "1",
          { col: 1, variant: "list", style: panel(raised(c.theme)) },
        ),
      ],
    }),
  }),
];
