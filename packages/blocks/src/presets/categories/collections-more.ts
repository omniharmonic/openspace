import { mapBlock } from "../../blocks/map";
import { newsletterBlock } from "../../blocks/newsletter";
import { pricingBlock } from "../../blocks/pricing";
import { tabsBlock } from "../../blocks/tabs";
import type { photo } from "../images";
import { button, copy, definePreset, grid, heading, make, r, rt, stack, text, url } from "../kit";
import { card, eventList, panel, summary, team } from "../parts";

/** Second wave of blog, events (programme, speakers, tickets, venue) and product presets. */

const headline = copy.headline(1, 10, 2);
const BLOG_AVOID =
  "Showing more than six posts on a home page; hiding dates on time-sensitive posts.";
const EVENT_AVOID =
  "Dates, speakers, prices or venues that aren't confirmed; listing past events as upcoming.";
const PRODUCT_AVOID =
  "Products that are out of stock with no note; prices that differ from checkout.";

export const blogMorePresets = [
  definePreset({
    category: "blog",
    name: "magazine-wall",
    label: "Magazine wall",
    description: "A centred heading over a magazine-style wall of recent posts with images.",
    copy: [headline],
    images: [{ slot: "post images", aspect: "original", count: 5 }],
    collections: ["blog"],
    collection: "journal",
    defaultTheme: "light",
    tags: ["wall", "magazine", "image"],
    ai: {
      purpose: "Makes a blog feel like a publication.",
      whenToUse: "Magazines, food and travel blogs, studios with a busy journal.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "wide" }),
      blocks: [
        summary(c.collection, {
          heading: "Latest stories",
          variant: "wall",
          limit: 5,
          meta: true,
          linkLabel: "All stories",
          link: `/${c.collection}/`,
        }),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "intro-and-list",
    label: "Author intro with posts",
    description: "A short author introduction beside a list of the latest posts.",
    copy: [headline, copy.body(8, 45)],
    collections: ["blog"],
    collection: "essays",
    defaultTheme: "light-accent",
    tags: ["list", "two-column", "writer"],
    ai: {
      purpose: "Introduces the writer and gets readers straight to the writing.",
      whenToUse: "Personal sites, newsletters and writers' home pages.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("Recent writing", { col: 0, eyebrow: "Essays" }),
        text(
          [
            rt.p(
              "I write about walking, craft and paying attention — usually from a bench somewhere with a notebook.",
            ),
          ],
          { col: 0 },
        ),
        summary(c.collection, {
          col: 1,
          variant: "list",
          limit: 5,
          image: false,
          linkLabel: "Every essay",
          link: `/${c.collection}/`,
        }),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "archive-signup",
    label: "Archive with signup",
    description: "A list of past issues followed by an inline signup to get the next one.",
    copy: [headline],
    collections: ["blog"],
    collection: "letters",
    defaultTheme: "light",
    tags: ["list", "newsletter", "archive", "narrow"],
    ai: {
      purpose: "Turns the newsletter archive into a subscription page.",
      whenToUse: "Newsletter writers and publications.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "narrow", gap: "lg" }),
      blocks: [
        summary(c.collection, {
          heading: "From the archive",
          variant: "list",
          limit: 6,
          image: false,
        }),
        make(
          newsletterBlock,
          {
            heading: "Get the next one",
            description: "A new letter every other Sunday.",
            askName: false,
            placeholder: "you@example.com",
            buttonLabel: "Subscribe",
            successMessage: "You're subscribed — see you on Sunday.",
            note: "Free. Unsubscribe any time.",
          },
          { variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "blog",
    name: "two-up-large",
    label: "Two large posts",
    description: "The two latest posts as large image cards side by side.",
    copy: [headline],
    images: [{ slot: "post images", aspect: "3:2", count: 2 }],
    collections: ["blog"],
    collection: "journal",
    defaultTheme: "light",
    tags: ["grid", "two-up", "image", "featured"],
    ai: {
      purpose: "Gives the two newest posts real presence.",
      whenToUse: "Home pages where writing is a big part of the business.",
      avoid: BLOG_AVOID,
    },
    make: (c) => ({
      layout: stack({ width: "wide" }),
      blocks: [
        summary(c.collection, {
          heading: "From the journal",
          variant: "grid",
          columns: "2",
          limit: 2,
          linkLabel: "Read more",
          link: `/${c.collection}/`,
        }),
      ],
    }),
  }),
];

export const eventsMorePresets = [
  definePreset({
    category: "events",
    name: "programme-tabs",
    label: "Programme by day",
    description: "The event programme in tabs, one per day, with times and sessions.",
    copy: [headline, copy.sub(4, 30)],
    defaultTheme: "light",
    tags: ["tabs", "schedule", "conference", "festival"],
    ai: {
      purpose: "A clear day-by-day running order for multi-day events.",
      whenToUse: "Conferences, festivals and retreats.",
      avoid: EVENT_AVOID,
    },
    make: () => ({
      layout: stack({ width: "content", gap: "lg" }),
      blocks: [
        heading("Programme", {
          eyebrow: "Small Web Summit · 2027",
          sub: "Two days of talks and workshops. Times may shift a little — final schedule in May.",
        }),
        make(
          tabsBlock,
          {
            label: "Programme days",
            items: [
              {
                label: "Thu 10 June",
                content: rt.doc(
                  rt.h(3, "9:30 · Doors and coffee", "h4"),
                  rt.p("Registration in the foyer. Pastries from Twin Oaks."),
                  rt.h(3, "10:15 · Opening keynote: the web we want", "h4"),
                  rt.p("Main hall, followed by a short Q&A."),
                  rt.h(3, "14:00 · Workshops", "h4"),
                  rt.p(
                    "Accessibility clinic, typography lab, and running a site for under $5 a month.",
                  ),
                ),
              },
              {
                label: "Fri 11 June",
                content: rt.doc(
                  rt.h(3, "10:00 · Lightning talks", "h4"),
                  rt.p("Twelve five-minute talks from first-time speakers."),
                  rt.h(3, "13:30 · Panel: owning your audience", "h4"),
                  rt.p("Newsletters, feeds and why algorithms aren't a business plan."),
                  rt.h(3, "17:00 · Closing party", "h4"),
                  rt.p("On the roof, weather permitting."),
                ),
              },
            ],
          },
          { variant: "underline" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "events",
    name: "speakers",
    label: "Speakers",
    description: "Speakers in a grid with portraits, names and talk titles.",
    copy: [headline, copy.sub(4, 30)],
    images: [{ slot: "portraits", aspect: "4:5", count: 4 }],
    defaultTheme: "light-accent",
    tags: ["team", "grid", "conference", "speakers"],
    ai: {
      purpose: "Shows who's speaking — often the main reason people buy a ticket.",
      whenToUse: "Conferences, festivals and lecture series.",
      avoid: `${EVENT_AVOID} Listing speakers who haven't confirmed.`,
    },
    make: () => ({
      layout: stack({ gap: "xl" }),
      blocks: [
        heading("Speakers", {
          align: "center",
          eyebrow: "Line-up",
          sub: "Designers, developers and writers building a kinder, smaller web.",
        }),
        team(
          [
            ["Lena Brandt", "Designing calm software", "portraitLena"],
            ["Jonah Ellis", "Websites that last ten years", "portraitJonah"],
            ["Noa Feld", "Type on screen", "portraitMono"],
            ["Rafael Costa", "Small teams, big impact", "portraitRaf"],
          ],
          "4",
        ),
      ],
    }),
  }),

  definePreset({
    category: "events",
    name: "tickets",
    label: "Tickets",
    description: "Ticket types side by side with prices, inclusions and buy buttons.",
    copy: [headline, copy.sub(4, 30)],
    defaultTheme: "light",
    tags: ["tickets", "pricing", "festival", "conference"],
    links: { primary: "/tickets" },
    ai: {
      purpose: "Sells tickets with everything people need to choose.",
      whenToUse: "Festivals, conferences and ticketed events.",
      avoid: `${EVENT_AVOID} Fake scarcity ('only 3 left').`,
    },
    make: (c) => ({
      layout: stack({ gap: "lg" }),
      blocks: [
        heading("Tickets", {
          align: "center",
          eyebrow: "On sale now",
          sub: "Under-12s go free with an adult. Concession tickets for students and carers.",
        }),
        make(
          pricingBlock,
          {
            plans: [
              {
                name: "Day ticket",
                price: "$45",
                description: "Saturday or Sunday.",
                features: [{ text: "All stages, all day" }, { text: "Kids' area" }],
                buttonLabel: "Buy day tickets",
                link: c.primary,
                featured: false,
              },
              {
                name: "Weekend",
                price: "$95",
                description: "Friday evening to Sunday.",
                features: [
                  { text: "All three days" },
                  { text: "Ceilidh on Friday night" },
                  { text: "Free programme" },
                ],
                buttonLabel: "Buy weekend tickets",
                link: c.primary,
                featured: true,
                badge: "Best value",
              },
              {
                name: "Weekend + camping",
                price: "$130",
                description: "Pitch your tent by the river.",
                features: [
                  { text: "Weekend ticket" },
                  { text: "Two nights' camping" },
                  { text: "Hot showers" },
                ],
                buttonLabel: "Buy camping tickets",
                link: c.primary,
                featured: false,
              },
            ],
            note: "Prices include booking fees. Refunds up to 30 days before.",
          },
          { variant: "cards" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "events",
    name: "venue-travel",
    label: "Venue and travel",
    description: "A map of the venue beside how to get there by train, car and bike.",
    copy: [headline, copy.body(15, 90)],
    defaultTheme: "light-accent",
    tags: ["map", "venue", "travel", "two-column"],
    ai: {
      purpose: "Answers 'how do I get there?' for event-goers.",
      whenToUse: "Event, wedding and retreat sites.",
      avoid: EVENT_AVOID,
    },
    make: () => ({
      layout: stack({ cols: [6, 6], gap: "2xl" }),
      blocks: [
        heading("Getting to the meadow", { col: 0, eyebrow: "Venue & travel" }),
        text(
          [
            rt.h(3, "By train", "h4"),
            rt.p(
              "Riverbend station is a 15-minute walk. A free shuttle runs every 20 minutes on festival days.",
            ),
            rt.h(3, "By car", "h4"),
            rt.p("Parking is $10 a day in the north field — please car-share if you can."),
            rt.h(3, "By bike", "h4"),
            rt.p("Free, guarded bike parking by the main gate."),
          ],
          { col: 0 },
        ),
        make(
          mapBlock,
          {
            name: "Millers Meadow",
            address: "Mill Lane, Riverbend",
            latitude: 44.0462,
            longitude: -123.0221,
            zoom: 13,
            details: "Main gate on Mill Lane.",
            linkLabel: "Open in Maps",
            aspect: "4:3",
          },
          { col: 1, variant: "card" },
        ),
      ],
    }),
  }),

  definePreset({
    category: "events",
    name: "upcoming-split",
    label: "Upcoming events with intro",
    description: "A heading, line and button on the left; upcoming events as a list on the right.",
    copy: [headline, copy.body(6, 40)],
    collections: ["events"],
    collection: "events",
    defaultTheme: "light",
    tags: ["list", "two-column", "upcoming"],
    links: { primary: "/events" },
    ai: {
      purpose: "Keeps a home page lively with what's coming up.",
      whenToUse: "Venues, bookshops, studios and community groups.",
      avoid: EVENT_AVOID,
    },
    make: (c) => ({
      layout: stack({ cols: [4, 8], gap: "2xl" }),
      blocks: [
        heading("What's on", { col: 0, eyebrow: "Events" }),
        text(
          [
            rt.p(
              "Readings, workshops and late openings. Most events are free — booking helps us plan.",
            ),
          ],
          {
            col: 0,
          },
        ),
        button("Full calendar", c.primary, { col: 0, role: "secondary" }),
        eventList(c.collection, { col: 1, limit: 4, register: "Book a place" }),
      ],
    }),
  }),
];

export const productsMorePresets = [
  definePreset({
    category: "products",
    name: "category-tiles",
    label: "Shop by category",
    description: "Three category tiles with photographs, each linking to part of the shop.",
    copy: [headline],
    images: [{ slot: "category photos", aspect: "4:5", count: 3 }],
    defaultTheme: "light",
    tags: ["cards", "categories", "image", "three-up"],
    ai: {
      purpose: "Helps shoppers head straight to what they came for.",
      whenToUse: "Shops with three or more clear categories.",
      avoid: PRODUCT_AVOID,
    },
    make: () => {
      const h = heading("Shop by room", { eyebrow: "Collections" });
      const t = (title: string, body: string, k: Parameters<typeof photo>[0], href: string) =>
        card(title, body, {
          image: [k, 380, "4:5"],
          link: href,
          linkLabel: "Shop now",
          variant: "overlay",
        });
      const a = t("Living", "Chairs, sofas and side tables.", "greenSofa", "/shop/living");
      const b = t("Kitchen", "Stools, shelves and serving boards.", "stool", "/shop/kitchen");
      const d = t("Bedroom", "Linen, lamps and bedside tables.", "bohoLounge", "/shop/bedroom");
      return {
        ...grid([
          [h, r(1, 1, 16, 4), r(1, 1, 8, 4)],
          [a, r(1, 6, 8, 18), r(1, 6, 8, 14)],
          [b, r(9, 6, 8, 18), r(1, 21, 8, 14)],
          [d, r(17, 6, 8, 18), r(1, 36, 8, 14)],
        ]),
      };
    },
  }),

  definePreset({
    category: "products",
    name: "bestsellers-split",
    label: "Bestsellers beside intro",
    description: "A short introduction on a tinted panel beside two bestselling products.",
    copy: [headline, copy.body(6, 40)],
    images: [{ slot: "product images", aspect: "4:5", count: 2 }],
    collections: ["products"],
    collection: "shop",
    defaultTheme: "light",
    tags: ["grid", "two-up", "panel", "bestsellers"],
    links: { primary: "/shop" },
    ai: {
      purpose: "Introduces the shop with its two most-loved products.",
      whenToUse: "Home pages of small shops and makers.",
      avoid: PRODUCT_AVOID,
    },
    make: (c) => {
      const words = text(
        [
          rt.p("Bestsellers", "eyebrow"),
          rt.h(2, "The pieces people come back for", "h2"),
          rt.p("Made in small batches in our workshop and restocked every few weeks."),
        ],
        { style: panel("light-accent", "xl") },
      );
      const cta = button("Shop everything", url(`/${c.collection}/`), { role: "secondary" });
      const list = summary(c.collection, {
        variant: "grid",
        columns: "2",
        limit: 2,
        date: false,
        excerpt: false,
        empty: "New pieces are being photographed — the shop reopens soon.",
      });
      return {
        ...grid([
          [words, r(1, 1, 9, 14), r(1, 1, 8, 12)],
          [cta, r(1, 16, 9, 3), r(1, 14, 8, 3)],
          [list, r(11, 1, 14, 18), r(1, 18, 8, 26)],
        ]),
      };
    },
  }),
];
