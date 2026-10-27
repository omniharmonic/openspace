import { statsBlock } from "../../blocks/data";
import { testimonialBlock } from "../../blocks/quote";
import { quoteCarouselBlock } from "../../blocks/quote-carousel";
import { type PhotoKey, photo } from "../images";
import { copy, definePreset, grid, heading, image, make, r, rt, stack } from "../kit";

const quoteRule = copy.field("quote", "Testimonial", "testimonial", "quote", 8, 60);
const AVOID =
  "Inventing testimonials, names or ratings — ask the owner for real quotes and permission to use names and photos.";

const avatar = (k: PhotoKey) => photo(k, 80, "1:1");

const testimonial = (
  quote: string,
  name: string,
  role: string,
  face: PhotoKey | undefined,
  o: {
    col?: number;
    variant?: string;
    rating?: number;
    theme?: "light" | "light-accent" | "dark" | "dark-accent" | "brand";
  } = {},
) =>
  make(
    testimonialBlock,
    {
      quote: rt.doc(rt.p(quote)),
      name,
      role,
      photo: face ? avatar(face) : undefined,
      rating: o.rating,
    },
    {
      ...(o.col !== undefined ? { col: o.col } : {}),
      variant: o.variant ?? "card",
      ...(o.theme ? { style: { colorTheme: o.theme, padding: { d: "lg", m: "md" } } } : {}),
    },
  );

export const testimonialsPresets = [
  definePreset({
    category: "testimonials",
    name: "three-cards",
    label: "Three testimonial cards",
    description: "A centred heading and three short reviews side by side, with names and photos.",
    images: [{ slot: "portraits", aspect: "1:1", count: 3 }],
    copy: [copy.headline(2, 10, 2), quoteRule],
    defaultTheme: "light-accent",
    tags: ["cards", "three-up", "social-proof"],
    ai: {
      purpose: "Social proof from several different kinds of customer.",
      whenToUse: "Near a call to action on home, services and pricing pages.",
      avoid: AVOID,
    },
    make: () => {
      const h = heading("Kind words from the people we work with", {
        eyebrow: "Reviews",
        align: "center",
      });
      const a = testimonial(
        "Clear, friendly and on time from the first email to the last detail. We felt looked after throughout.",
        "Marcus Webb",
        "Customer since 2019",
        "portraitDaniel",
        { rating: 5 },
      );
      const b = testimonial(
        "They listened properly, explained every option and delivered exactly what we hoped for — a year later we still recommend them.",
        "Hana Okafor",
        "First-time customer",
        "portraitAna",
        { rating: 5 },
      );
      const d = testimonial(
        "Easy to work with and genuinely kind. We have come back again and again, and so have our friends.",
        "Leo Brandt",
        "Returning customer",
        "portraitSam",
        { rating: 5 },
      );
      return {
        ...grid([
          [h, r(5, 1, 16, 5), r(1, 1, 8, 5)],
          [a, r(1, 7, 8, 9), r(1, 7, 8, 11)],
          [b, r(9, 7, 8, 9), r(1, 19, 8, 11)],
          [d, r(17, 7, 8, 9), r(1, 31, 8, 11)],
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "large-single",
    label: "One big testimonial",
    description: "A single testimonial set large and centred.",
    images: [{ slot: "portraits", aspect: "1:1", count: 1 }],
    copy: [copy.field("quote", "Testimonial", "testimonial", "quote", 8, 45)],
    defaultTheme: "dark-accent",
    tags: ["single", "centered", "statement"],
    ai: {
      purpose: "Lets one outstanding review speak for the business.",
      whenToUse: "Between sections on a long page, or under a hero.",
      avoid: `${AVOID} Testimonials longer than three sentences.`,
    },
    make: () => ({
      layout: stack({ width: "narrow" }),
      padding: { d: "xl", m: "lg" },
      blocks: [
        make(
          testimonialBlock,
          {
            quote: rt.doc(
              rt.p(
                "Six months in, my back pain is gone and I actually look forward to Monday mornings. I wish I'd found this studio years ago.",
              ),
            ),
            name: "Grace Liu",
            role: "Member since 2024",
            photo: avatar("portraitIris"),
            rating: undefined,
          },
          { variant: "large", style: { align: { d: "center" } } },
        ),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "carousel",
    label: "Testimonial slides",
    description: "Several testimonials, one at a time, with arrows to move between them.",
    images: [{ slot: "portraits", aspect: "1:1", count: 3 }],
    copy: [copy.items("quote", "Testimonial", "quote-carousel", "quotes", "quote", 8, 55)],
    defaultTheme: "light",
    tags: ["carousel", "social-proof"],
    ai: {
      purpose: "Many testimonials without a long page.",
      whenToUse: "When there are four or more good reviews worth sharing.",
      avoid: AVOID,
    },
    make: () => ({
      layout: stack({ width: "narrow" }),
      blocks: [
        make(
          quoteCarouselBlock,
          {
            label: "What clients say",
            quotes: [
              {
                quote:
                  "Our books were a mess when we found Clearwater. Now I know our numbers every Monday and tax season is boring — in the best way.",
                name: "Ines Moreau",
                role: "Owner, Moreau Florals",
                photo: avatar("portraitClara"),
              },
              {
                quote:
                  "They spotted a payroll error that had been costing us for two years and fixed it in a week.",
                name: "Owen Patel",
                role: "Director, Patel & Sons Joinery",
                photo: avatar("portraitOwen"),
              },
              {
                quote: "Calm, clear and always available when I panic. Worth every penny.",
                name: "Sasha Kim",
                role: "Freelance illustrator",
                photo: avatar("portraitIris"),
              },
            ],
          },
          { variant: "slides" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "testimonials",
    name: "photo-overlap",
    label: "Testimonial over photo",
    description: "A photograph with a testimonial card layered across its edge.",
    copy: [copy.field("quote", "Testimonial", "testimonial", "quote", 8, 50)],
    images: [{ slot: "photo", aspect: "fill" }],
    tags: ["image", "grid", "overlap"],
    ai: {
      purpose: "Puts a real customer story next to a photo of the experience.",
      whenToUse: "Venues, classes, retreats and services with a strong photo.",
      avoid: AVOID,
    },
    make: (c) => {
      const pic = image(photo("beachClass", 850));
      const quote = testimonial(
        "I came for a weekend and left with a daily practice. Gentle, funny teachers and the most beautiful mornings on the sand.",
        "Amelia Hart",
        "Spring retreat guest",
        "portraitLake",
        { variant: "card", theme: c.theme, rating: 5 },
      );
      return {
        ...grid([
          [pic, r(1, 1, 16, 22), r(1, 1, 8, 12)],
          [quote, r(13, 7, 12, 9, { z: 2 }), r(1, 10, 8, 13, { z: 2 })],
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "pair",
    label: "Two testimonials",
    description: "A heading and two longer testimonials side by side, without cards.",
    images: [{ slot: "portraits", aspect: "1:1", count: 2 }],
    copy: [copy.headline(2, 10, 2), quoteRule],
    defaultTheme: "light",
    tags: ["two-up", "minimal"],
    ai: {
      purpose: "Two detailed testimonials for considered purchases.",
      whenToUse: "Coaching, consulting, design and other high-trust services.",
      avoid: AVOID,
    },
    make: () => {
      const h = heading("What it's like to work with us", { eyebrow: "Client stories" });
      const a = testimonial(
        "Fernhill rebuilt our brand from the name up. Sales through the website doubled in the first season, and for the first time I'm proud to hand out a business card.",
        "Tamsin Reed",
        "Founder, Reed & Rye",
        "portraitNina",
        { variant: "minimal" },
      );
      const b = testimonial(
        "They listened more than they talked, kept every deadline and made our tiny shop look like it had a team of fifty.",
        "Jonah Price",
        "Owner, Price Hardware",
        "portraitMarcus",
        { variant: "minimal" },
      );
      return {
        ...grid([
          [h, r(1, 1, 12, 5), r(1, 1, 8, 5)],
          [a, r(1, 7, 11, 11), r(1, 7, 8, 11)],
          [b, r(14, 7, 11, 11), r(1, 19, 8, 11)],
        ]),
      };
    },
  }),

  definePreset({
    category: "testimonials",
    name: "ratings-summary",
    label: "Ratings with reviews",
    description: "Headline review numbers beside a carousel of short review cards.",
    copy: [
      copy.headline(2, 10, 2),
      copy.items("quote", "Review", "quote-carousel", "quotes", "quote", 6, 40),
    ],
    defaultTheme: "light-accent",
    tags: ["stats", "carousel", "social-proof"],
    ai: {
      purpose: "Combines the overall rating with individual voices.",
      whenToUse: "Businesses with many public reviews (with permission to quote them).",
      avoid: `${AVOID} Ratings that don't match the public review sites.`,
    },
    make: () => ({
      layout: stack({ cols: [4, 8], gap: "2xl", align: "center" }),
      blocks: [
        heading("Rated 4.9 by our customers", { col: 0, eyebrow: "Reviews" }),
        make(
          statsBlock,
          {
            items: [
              { value: "4.9", label: "Average rating", detail: "From 312 reviews" },
              { value: "92%", label: "Book again within a year" },
            ],
          },
          { col: 0, variant: "row" },
        ),
        make(
          quoteCarouselBlock,
          {
            label: "Customer reviews",
            quotes: [
              {
                quote:
                  "Showed up on time, fixed the leak in twenty minutes and left the kitchen cleaner than they found it.",
                name: "Rosa M.",
                role: "Kitchen repair",
              },
              {
                quote: "Honest quote, no upselling, and they explained everything as they went.",
                name: "David K.",
                role: "Boiler service",
              },
              {
                quote:
                  "Our go-to for every odd job now. The maintenance plan has already paid for itself.",
                name: "Priya S.",
                role: "Maintenance plan",
              },
            ],
          },
          { col: 1, variant: "cards" },
        ),
      ],
    }),
  }),
];
