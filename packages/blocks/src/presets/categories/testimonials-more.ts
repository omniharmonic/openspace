import { quoteCarouselBlock } from "../../blocks/quote-carousel";
import { photo } from "../images";
import {
  button,
  copy,
  definePreset,
  grid,
  heading,
  image,
  make,
  type Placed,
  r,
  rt,
  scrim,
  stack,
  text,
} from "../kit";
import { avatar, logos, panel, pullQuote, raised, stats, testimonial } from "../parts";

/** Second wave of social proof: walls, spotlights, ratings, logos with quotes, results. */

const quoteRule = (min = 6, max = 60) =>
  copy.field("quote", "Testimonial", "testimonial", "quote", min, max);
const AVOID =
  "Inventing testimonials, names, ratings or results — ask the owner for real quotes and permission to use names, photos and logos.";

export const testimonialsMorePresets = [
  definePreset({
    category: "testimonials",
    name: "wall",
    label: "Review wall",
    description: "Six short reviews in a staggered, masonry-like wall under a centred heading.",
    copy: [copy.headline(2, 10, 2), quoteRule(5, 40)],
    defaultTheme: "light-accent",
    tags: ["grid", "wall", "many", "social-proof"],
    ai: {
      purpose: "Shows volume: lots of happy customers, each in a few words.",
      whenToUse: "Home and pricing pages for products and popular services.",
      avoid: AVOID,
    },
    make: () => {
      const h = heading("Loved by 2,000 home cooks", { eyebrow: "Reviews", align: "center" });
      const t = (q: string, n: string, role: string) =>
        testimonial(q, n, role, undefined, { rating: 5, variant: "card" });
      const items = [
        t(
          "Sunday planning used to take an hour. Now it's ten minutes and a cup of tea.",
          "Jo M.",
          "Parent of three",
        ),
        t("The shopping list sorted by aisle is genius.", "Ravi P.", "Weeknight cook"),
        t(
          "We waste far less food. Leftovers actually get planned into lunches now.",
          "Emma L.",
          "Student house",
        ),
        t(
          "My partner finally knows what's for dinner without asking me.",
          "Sam K.",
          "Busy household",
        ),
        t(
          "It suggested a curry from the half-bag of spinach I'd forgotten. Brilliant.",
          "Noor A.",
          "Home cook",
        ),
        t("Simple, calm, no ads. Worth every penny.", "Will T.", "Subscriber since 2024"),
      ];
      const rects = [
        [r(1, 7, 8, 8), r(1, 7, 8, 8)],
        [r(9, 7, 8, 6), r(1, 16, 8, 7)],
        [r(17, 7, 8, 9), r(1, 24, 8, 8)],
        [r(1, 16, 8, 7), r(1, 33, 8, 7)],
        [r(9, 14, 8, 9), r(1, 41, 8, 8)],
        [r(17, 17, 8, 6), r(1, 50, 8, 6)],
      ] as const;
      return {
        ...grid([
          [h, r(5, 1, 16, 5), r(1, 1, 8, 5)],
          ...items.map((b, i): Placed => [b, rects[i]?.[0] ?? r(1, 1, 1, 1), rects[i]?.[1]]),
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "spotlight-photo",
    label: "Spotlight over photo",
    description: "One quote set large over a dark, softened photograph.",
    copy: [copy.field("quote", "Quote", "quote", "quote", 8, 40)],
    images: [{ slot: "background", aspect: "fill" }],
    tags: ["image", "background", "quote", "statement"],
    ai: {
      purpose: "A dramatic pause between sections, carried by one person's words.",
      whenToUse: "Venues, retreats, nonprofits and creative studios.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow" }),
      padding: { d: "3xl", m: "2xl" },
      background: {
        type: "image",
        src: photo("lake", 1920).src,
        focal: [0.5, 0.5],
        overlay: scrim(0.86),
      },
      blocks: [
        pullQuote(
          "I came for the walks and left with a quieter head than I've had in years. Five days felt like a month.",
          "Helen Ashby",
          "Autumn retreat guest",
          { variant: "large" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "logo-quotes",
    label: "Quotes from clients",
    description:
      "Two client quotes side by side, each above the client's name, with a logo strip below.",
    copy: [copy.headline(2, 10, 2), quoteRule(8, 50)],
    images: [{ slot: "portraits", aspect: "1:1", count: 2 }],
    defaultTheme: "light",
    tags: ["b2b", "logos", "two-up", "clients"],
    ai: {
      purpose: "Business-to-business proof: named clients, in their words.",
      whenToUse: "Agencies, consultants and software sold to organisations.",
      avoid: AVOID,
    },
    make: (c) => {
      const h = heading("What our clients say", { eyebrow: "Clients" });
      const a = testimonial(
        "They rebuilt our checkout in eight weeks and conversion went up by a third. The calmest project we've ever run.",
        "Marta Oyelaran",
        "Head of Digital, Northwind Outfitters",
        "portraitClara",
        { variant: "card", style: panel(raised(c.theme)) },
      );
      const b = testimonial(
        "Clear thinking, honest estimates and a team that actually answers email. We've hired them three times.",
        "Tom Becker",
        "COO, Fieldhouse Coffee",
        "portraitOwen",
        { variant: "card", style: panel(raised(c.theme)) },
      );
      const wall = logos([
        "Northwind Outfitters",
        "Fieldhouse Coffee",
        "Saltmarsh Press",
        "Cedar & Pine",
      ]);
      return {
        ...grid([
          [h, r(1, 1, 16, 5), r(1, 1, 8, 5)],
          [a, r(1, 7, 12, 10), r(1, 7, 8, 12)],
          [b, r(13, 7, 12, 10), r(1, 20, 8, 12)],
          [wall, r(1, 19, 24, 4), r(1, 33, 8, 7)],
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "rating-bar",
    label: "Rating bar",
    description: "A compact band with the average rating, review count and two short quotes.",
    copy: [copy.items("stat", "Stat label", "stats", "items", "label", 1, 6), quoteRule(5, 30)],
    defaultTheme: "dark-accent",
    tags: ["ratings", "compact", "band", "stats"],
    ai: {
      purpose: "Summarises reputation in one glance, between other sections.",
      whenToUse: "Local businesses, shops and services with many public reviews.",
      avoid: `${AVOID} Ratings that don't match the public review sites.`,
    },
    make: () => ({
      layout: stack({ cols: [4, 4, 4], align: "center", gap: "xl" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        stats([["4.9 / 5", "From 640 reviews"]], { col: 0, variant: "row" }),
        testimonial(
          "On time, tidy and the fixed price was the price.",
          "Dana R.",
          "Boiler service",
          undefined,
          {
            col: 1,
            variant: "minimal",
            rating: 5,
          },
        ),
        testimonial(
          "Came out on a Sunday for a burst pipe. Lifesavers.",
          "Kofi B.",
          "Emergency call-out",
          undefined,
          {
            col: 2,
            variant: "minimal",
            rating: 5,
          },
        ),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "carousel-cards",
    label: "Review carousel",
    description: "A heading beside a swipeable carousel of review cards with photos.",
    copy: [
      copy.headline(2, 10, 2),
      copy.items("quote", "Quote", "quote-carousel", "quotes", "quote", 6, 40),
    ],
    images: [{ slot: "portraits", aspect: "1:1", count: 4 }],
    defaultTheme: "light",
    tags: ["carousel", "cards", "social-proof"],
    ai: {
      purpose: "Lots of reviews in little space, browsable by swipe or arrow.",
      whenToUse: "When there are five or more strong reviews.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Notes from our students", { eyebrow: "Students" }),
        make(
          quoteCarouselBlock,
          {
            label: "Student reviews",
            quotes: [
              {
                quote:
                  "I'd never held a brush before the course. Six weeks later I sold my first painting.",
                name: "Ana Ruiz",
                role: "Watercolour beginners",
                photo: avatar("portraitAna"),
              },
              {
                quote: "Patient teaching, tiny classes and the best tea in town.",
                name: "Daniel Okoro",
                role: "Life drawing",
                photo: avatar("portraitDaniel"),
              },
              {
                quote: "The Saturday critique sessions made me braver with colour.",
                name: "Iris Lund",
                role: "Oil painting",
                photo: avatar("portraitIris"),
              },
              {
                quote: "A studio that feels like a second living room.",
                name: "Theo Grant",
                role: "Printmaking",
                photo: avatar("portraitTheo"),
              },
            ],
          },
          { variant: "cards" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "result-cards",
    label: "Results with quotes",
    description: "Three cards, each a client's result as a number above their short quote.",
    copy: [copy.headline(2, 10, 2), copy.body(5, 40)],
    defaultTheme: "light-accent",
    tags: ["cards", "results", "three-up", "coaching"],
    ai: {
      purpose: "Combines a measurable result with the person who achieved it.",
      whenToUse: "Coaches, consultants, tutors and trainers.",
      avoid: `${AVOID} Results that aren't typical without saying so.`,
    },
    make: (c) => {
      const h = heading("Real results from real clients", { eyebrow: "Outcomes" });
      const tile = (value: string, quote: string, who: string) =>
        text([rt.h(3, value, "h1"), rt.p(`“${quote}”`), rt.p(who, "small")], {
          style: panel(raised(c.theme)),
        });
      const a = tile(
        "2× revenue",
        "Doubled our income in a year without working weekends.",
        "Lauren, design studio",
      );
      const b = tile(
        "12 hours",
        "Got back twelve hours a week from admin and meetings.",
        "Marcus, agency founder",
      );
      const d = tile(
        "First hire",
        "Hired our first employee with a plan instead of panic.",
        "Jess, bakery owner",
      );
      return {
        ...grid([
          [h, r(1, 1, 16, 5), r(1, 1, 8, 5)],
          [a, r(1, 7, 8, 11), r(1, 7, 8, 10)],
          [b, r(9, 7, 8, 11), r(1, 18, 8, 10)],
          [d, r(17, 7, 8, 11), r(1, 29, 8, 10)],
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "split-portrait",
    label: "Portrait and quote",
    description:
      "A large portrait of the customer beside their quote and a link to the full story.",
    copy: [quoteRule(10, 50)],
    images: [{ slot: "portrait", aspect: "4:5" }],
    defaultTheme: "light",
    tags: ["image", "two-column", "story", "single"],
    links: { primary: "/stories" },
    ai: {
      purpose: "Puts a face to one customer story.",
      whenToUse: "Nonprofits, schools, clinics and services with a featured story.",
      avoid: AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [5, 7], align: "center", gap: "2xl" }),
      blocks: [
        image(photo("portraitCoach", 480, "4:5"), { col: 0, aspect: "4:5" }),
        testimonial(
          "I'd been told my business was too small for a proper accountant. Here, I got someone who explained everything twice and never made me feel silly.",
          "Rosa Delgado",
          "Owner, Delgado Tailoring",
          undefined,
          { col: 1, variant: "large" },
        ),
        button("Read Rosa's story", c.primary, { col: 1, role: "tertiary", align: "center" }),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "press-quotes",
    label: "Press quotes",
    description: "Three short quotes from publications, each credited to its source.",
    copy: [copy.field("quote", "Quote", "quote", "quote", 3, 25)],
    defaultTheme: "light",
    tags: ["press", "three-up", "quotes", "media"],
    ai: {
      purpose: "Borrowed credibility from reviews and press coverage.",
      whenToUse: "Restaurants, books, shows, products and venues that have been reviewed.",
      avoid: `${AVOID} Quotes cut so they change the reviewer's meaning.`,
    },
    make: () => ({
      layout: stack({ cols: [4, 4, 4], gap: "xl" }),
      padding: { d: "lg", m: "lg" },
      blocks: [
        pullQuote(
          "The best fresh pasta in the city, and it isn't close.",
          undefined,
          "City Table Weekly",
          {
            col: 0,
            variant: "classic",
          },
        ),
        pullQuote(
          "A tiny room with a big heart and a perfect wine list.",
          undefined,
          "The Evening Ledger",
          {
            col: 1,
            variant: "classic",
          },
        ),
        pullQuote("Book the counter and watch the magic happen.", undefined, "Good Eating Guide", {
          col: 2,
          variant: "classic",
        }),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "dark-trio",
    label: "Three quotes on dark",
    description: "A heading and three minimal quotes with portraits on a dark band.",
    copy: [copy.headline(2, 10, 2), quoteRule(6, 40)],
    images: [{ slot: "portraits", aspect: "1:1", count: 3 }],
    defaultTheme: "dark",
    tags: ["three-up", "minimal", "dark"],
    ai: {
      purpose: "A restrained, editorial set of testimonials.",
      whenToUse: "Studios, agencies and premium services.",
      avoid: AVOID,
    },
    make: () => {
      const h = heading("Kind words", { eyebrow: "Testimonials" });
      const a = testimonial(
        "They made our tiny flat feel twice the size without moving a wall.",
        "Clara Moss",
        "Flat in Leith",
        "portraitClara",
        { variant: "minimal" },
      );
      const b = testimonial(
        "Every detail considered, every deadline met. Rare.",
        "Owen Price",
        "Townhouse renovation",
        "portraitOwen",
        { variant: "minimal" },
      );
      const d = testimonial(
        "We still find little touches we hadn't noticed.",
        "Nina Holt",
        "Cottage kitchen",
        "portraitNina",
        { variant: "minimal" },
      );
      return {
        ...grid([
          [h, r(1, 1, 16, 5), r(1, 1, 8, 5)],
          [a, r(1, 7, 8, 8), r(1, 7, 8, 8)],
          [b, r(9, 7, 8, 8), r(1, 16, 8, 8)],
          [d, r(17, 7, 8, 8), r(1, 25, 8, 8)],
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "numbers-and-quote",
    label: "Numbers and a quote",
    description: "A row of satisfaction numbers above one featured testimonial.",
    copy: [
      copy.headline(2, 10, 2),
      copy.items("stat", "Stat label", "stats", "items", "label", 1, 6),
      quoteRule(8, 45),
    ],
    images: [{ slot: "portrait", aspect: "1:1" }],
    defaultTheme: "light-accent",
    tags: ["stats", "testimonial", "centered", "trust"],
    ai: {
      purpose: "Proof at two scales: the crowd and one person.",
      whenToUse: "Schools, clinics, gyms and subscription businesses.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "xl" }),
      blocks: [
        heading("Parents recommend us", { align: "center", eyebrow: "Family survey 2025" }),
        stats(
          [
            ["96%", "Would recommend us"],
            ["4.8 / 5", "Average rating"],
            ["310", "Families surveyed"],
          ],
          { variant: "cards", style: { align: { d: "center" } } },
        ),
        testimonial(
          "Our son runs in every morning. The teachers notice the small things and tell us about them.",
          "Maya Chen",
          "Parent, Rainbow room",
          "portraitMaya",
          { variant: "large" },
        ),
      ],
    }),
  }),
];
