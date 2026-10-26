import { iconListBlock } from "../../blocks/card";
import { timelineBlock } from "../../blocks/data";
import { quoteBlock } from "../../blocks/quote";
import { photo } from "../images";
import { button, copy, definePreset, grid, heading, image, make, r, rt, stack, text } from "../kit";

const headline = copy.headline(2, 10, 2);
const AVOID =
  "Invented history, awards or credentials — ask the owner. Long autobiographies; keep it to what a new customer needs to trust you.";

export const aboutPresets = [
  definePreset({
    category: "about",
    name: "story-split",
    label: "Story with portrait",
    description: "A portrait photograph beside a heading and a few paragraphs of story.",
    copy: [headline, copy.body(40, 140)],
    images: [{ slot: "photo", aspect: "4:5" }],
    tags: ["image", "two-column", "story"],
    links: { primary: "/about" },
    ai: {
      purpose: "Introduces the person or people behind the business.",
      whenToUse: "Home or About pages of owner-run businesses.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        image(photo("portraitMaya", 520, "4:5"), { col: 0, aspect: "4:5" }),
        heading("Hi, I'm Ruth — I bake the bread", { col: 1, eyebrow: "Our story" }),
        text(
          [
            rt.p(
              "I started baking at 4am in my apartment kitchen in 2015, selling loaves from a folding table at the Saturday market. Within a year the line was longer than the table.",
            ),
            rt.p(
              "Today there are six of us, one big oven and the same rule as day one: flour from farms we can drive to, long slow fermentation, and nothing on the shelf we wouldn't eat ourselves.",
            ),
          ],
          { col: 1 },
        ),
        button("Meet the bakers", c.primary, { col: 1, role: "secondary" }),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "story-editorial",
    label: "Editorial story",
    description: "A narrow reading column with a drop cap — for a longer story told well.",
    copy: [headline, copy.body(60, 220)],
    defaultTheme: "light",
    tags: ["text-only", "story", "editorial"],
    ai: {
      purpose: "A longer, well-set story for readers who want the detail.",
      whenToUse: "About pages, manifestos and founder letters.",
      avoid: `${AVOID} More than four paragraphs.`,
    },
    make: () => ({
      layout: stack({ width: "narrow" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        heading("Why we started a bookshop in 2024", {
          eyebrow: "A letter from the owners",
          align: "center",
        }),
        text(
          [
            rt.p(
              "Everyone told us it was the wrong time to open a bookshop. Rents were up, people read on their phones, and the big online stores could ship anything by Tuesday. We opened anyway, because the town had lost its last one and we missed the way a good shop makes you pick up something you'd never have searched for.",
            ),
            rt.p(
              "So we keep the shelves small and personal. Every book has been read by one of us, most have a handwritten card, and if we don't have what you want we'll order it in by Thursday at no extra cost.",
            ),
            rt.p([
              "Come in, sit in the armchair by the window and stay as long as you like. ",
              rt.italic("— Priya & Tom"),
            ]),
          ],
          { variant: "drop-cap" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "portrait-overlap",
    label: "Portrait with overlapping story",
    description: "A tall portrait with a story panel layered across its edge.",
    copy: [headline, copy.body(30, 110)],
    images: [{ slot: "portrait", aspect: "fill" }],
    defaultTheme: "light-accent",
    tags: ["image", "grid", "overlap", "story"],
    links: { primary: "/book" },
    ai: {
      purpose: "A personal introduction with a magazine feel.",
      whenToUse: "Therapists, coaches, photographers — anyone whose face is the brand.",
      avoid: AVOID,
    },
    make: (c) => {
      const pic = image(photo("portraitNina", 560));
      const panel = text(
        [
          rt.p("About Dana", "eyebrow"),
          rt.h(2, "Calm, practical help with money and paperwork", "h2"),
          rt.p(
            "I spent twelve years as a tax accountant before opening my own practice. Now I help freelancers and families get organised, file on time and stop dreading the post.",
          ),
          rt.p("Most clients tell me the first meeting felt like a weight lifting. That's the goal."),
        ],
        { style: { colorTheme: c.theme, padding: { d: "xl", m: "md" } } },
      );
      const cta = button("Book a free consultation", c.primary);
      return {
        ...grid([
          [pic, r(2, 1, 9, 26), r(1, 1, 7, 16)],
          [panel, r(9, 6, 14, 15, { z: 2 }), r(1, 14, 8, 15, { z: 2 })],
          [cta, r(11, 22, 12, 3), r(1, 30, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "about",
    name: "milestones",
    label: "Milestones timeline",
    description: "A heading and short introduction beside a timeline of key moments.",
    copy: [headline, copy.items("milestone", "Milestone", "timeline", "items", "text", 6, 30)],
    tags: ["text-only", "timeline", "history"],
    ai: {
      purpose: "Shows how the business grew, one milestone at a time.",
      whenToUse: "Established businesses, nonprofits and family firms with real history.",
      avoid: `${AVOID} More than six milestones.`,
    },
    make: () => ({
      layout: stack({ cols: [5, 7], gap: "2xl" }),
      blocks: [
        heading("Forty years of fixing bikes", {
          col: 0,
          eyebrow: "Our history",
          sub: "Three generations, two shop moves and more inner tubes than we can count.",
        }),
        make(
          timelineBlock,
          {
            items: [
              {
                date: "1985",
                title: "A garage on Elm Street",
                text: "Walt opens a one-bench repair shop and fixes the neighbourhood's bikes for cash and coffee.",
              },
              {
                date: "1998",
                title: "The first shopfront",
                text: "We move to Main Street, start selling used bikes and run our first kids' maintenance class.",
              },
              {
                date: "2012",
                title: "Cargo bikes arrive",
                text: "Jo takes over and becomes the county's first cargo and e-bike specialist.",
              },
              {
                date: "Today",
                title: "Nine mechanics, one promise",
                text: "Every repair is quoted before we start, and done by the date we give you.",
              },
            ],
          },
          { col: 1, variant: "vertical" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "values",
    label: "Values",
    description: "A centred heading with three values as icon tiles.",
    copy: [
      headline,
      copy.items("value", "Value description", "icon-list", "items", "text", 8, 30),
    ],
    defaultTheme: "light-accent",
    tags: ["icons", "values", "centered"],
    ai: {
      purpose: "States what the business stands for in three short promises.",
      whenToUse: "About pages and home pages of mission-led businesses.",
      avoid: `${AVOID} Generic values ("quality", "integrity") without specifics.`,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("What we believe", {
          align: "center",
          eyebrow: "Our values",
          sub: "Three promises we make to every family who walks through the door.",
        }),
        make(
          iconListBlock,
          {
            items: [
              {
                icon: "sprout",
                title: "Children lead",
                text: "Days follow their curiosity, with plenty of time outdoors in every season.",
              },
              {
                icon: "heart-handshake",
                title: "Families are partners",
                text: "A short note home every day and an open door for parents, always.",
              },
              {
                icon: "recycle",
                title: "Less, but better",
                text: "Wooden toys, cloth nappies and food cooked from scratch in our kitchen.",
              },
            ],
            columns: "3",
          },
          { variant: "tiles" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "quote-and-image",
    label: "Founder quote with photo",
    description: "A large quotation from the founder beside a landscape photograph.",
    copy: [copy.field("quote", "Quote", "quote", "quote", 8, 40)],
    images: [{ slot: "photo", aspect: "3:2" }],
    defaultTheme: "dark",
    tags: ["image", "quote", "two-column"],
    ai: {
      purpose: "Puts the founder's own words at the centre of the story.",
      whenToUse: "Between story sections, or as a short About section on the home page.",
      avoid: `${AVOID} Quotes the person never said.`,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], align: "center", gap: "2xl", order: [1, 0] }),
      blocks: [
        image(photo("seedlings", 620, "3:2"), { col: 0, aspect: "3:2" }),
        make(
          quoteBlock,
          {
            quote: rt.doc(
              rt.p(
                "We grow everything from seed, by hand, a mile from the restaurant. When the tomatoes are over, they're off the menu.",
              ),
            ),
            attribution: "Elena Ruiz",
            source: "Chef and grower",
          },
          { col: 1, variant: "classic" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "about",
    name: "workshop-layers",
    label: "Workshop in layers",
    description: "Two layered photographs of the work beside a short story and a call to action.",
    copy: [headline, copy.body(25, 100)],
    images: [
      { slot: "wide", aspect: "fill" },
      { slot: "detail", aspect: "fill" },
    ],
    tags: ["image", "grid", "overlap", "craft"],
    links: { primary: "/workshops" },
    ai: {
      purpose: "Shows the craft behind the product — the hands, the tools, the process.",
      whenToUse: "Makers, studios and small manufacturers.",
      avoid: `${AVOID} Two photos of the same view.`,
    },
    make: (c) => {
      const wide = image(photo("pottery", 640));
      const detail = image(photo("ceramics", 360), { shadow: "lg" });
      const words = heading("Every piece is made by hand in Asheville", {
        eyebrow: "The studio",
      });
      const body = text([
        rt.p(
          "We throw, trim and glaze every mug and bowl in a converted feed store on the river. Each glaze is mixed in small batches, so no two pieces come out of the kiln quite the same.",
        ),
      ]);
      const cta = button("Join a weekend workshop", c.primary, { role: "secondary" });
      return {
        ...grid([
          [wide, r(1, 1, 12, 16), r(1, 1, 8, 10)],
          [detail, r(8, 11, 7, 14, { z: 2 }), r(4, 8, 5, 8, { z: 2 })],
          [words, r(16, 3, 9, 7), r(1, 17, 8, 6)],
          [body, r(16, 10, 9, 8), r(1, 23, 8, 7)],
          [cta, r(16, 19, 9, 3), r(1, 30, 8, 3)],
        ]),
      };
    },
  }),

  definePreset({
    category: "about",
    name: "two-column-text",
    label: "Heading with reading columns",
    description: "A split heading over two columns of reading text.",
    copy: [headline, copy.body(60, 200)],
    defaultTheme: "light",
    tags: ["text-only", "columns", "editorial"],
    ai: {
      purpose: "Longer explanatory text set in comfortable reading columns.",
      whenToUse: "Approach, philosophy or 'how we work' sections.",
      avoid: `${AVOID} Bullet-point lists (use a features preset).`,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("How we design gardens", {
          variant: "split",
          eyebrow: "Our approach",
          sub: "Every garden starts with a walk, a notebook and a lot of questions about how you actually spend your evenings.",
        }),
        text(
          [
            rt.p(
              "We begin with the site: where the sun falls at six in the evening, where the water collects after a storm, what's already thriving. Native and drought-tolerant plants do most of the work, which means less watering and more birds.",
            ),
            rt.p(
              "Then we draw — by hand first, then to scale — and walk you through it on site. Most gardens are built over two to four weeks by our own small crew, and we come back each season for the first year to tend what we planted.",
            ),
          ],
          { variant: "columns" },
        ),
      ],
    }),
  }),
];
