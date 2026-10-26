import type { CollectionConfig, CollectionItem, SiteDocument } from "@openspace/schema";

/**
 * Demo collections for Willow Street Yoga (mock Hub, dev only): a journal, events, a small
 * shop and a podcast, in every publishing state, so each Studio surface has something real to
 * show. Portfolio is left out on purpose to show the "add a collection" path.
 */

const day = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isoTime = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

export const DEMO_PHOTO = {
  studio: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1600&h=1067&fit=crop",
  mats: "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=1600&h=1067&fit=crop",
  candle: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1600&h=1067&fit=crop",
};

export function demoCollections(
  now: number,
): Pick<SiteDocument, "collections" | "collectionConfigs"> {
  const journal: Record<string, CollectionItem> = {
    "slow-mornings": {
      kind: "blog",
      slug: "slow-mornings",
      frontmatter: {
        title: "Why we start slow in the mornings",
        status: "published",
        date: isoDate(now - 9 * day),
        author: "Sam Rivera",
        excerpt: "Five quiet minutes before the first pose changes the whole practice.",
        image: DEMO_PHOTO.studio,
        imageAlt: "Morning light across the studio floor",
        categories: ["practice"],
        tags: ["mornings", "breath"],
      },
      body: [
        "Most classes at Willow Street begin sitting down. It surprises people.",
        "",
        "We start slow because the body arrives before the mind does. Five minutes of breath gives both a chance to catch up.",
        "",
        '{% quote attribution="Sam Rivera" %}',
        "You can't rush your way into stillness.",
        "{% /quote %}",
        "",
        "## Try it at home",
        "",
        "- Sit somewhere you won't be interrupted",
        "- Breathe in for four, out for six",
        "- Notice one thing you can hear",
        "",
        '{% button label="See the class schedule" link={"type":"url","url":"https://willowstreetyoga.com/classes"} /%}',
      ].join("\n"),
    },
    "winter-retreat": {
      kind: "blog",
      slug: "winter-retreat",
      frontmatter: {
        title: "Our winter retreat is open for sign-ups",
        status: "scheduled",
        publishAt: isoTime(now + 3 * day),
        date: isoDate(now + 3 * day),
        author: "Sam Rivera",
        excerpt: "Three days in the mountains, two meals a day cooked by Jordan.",
        categories: ["news"],
        tags: ["retreats"],
      },
      body: "Three days in the mountains. Two meals a day. No phones after dinner.\n\nWe'll share the full schedule soon.",
    },
    "teacher-notes": {
      kind: "blog",
      slug: "teacher-notes",
      frontmatter: {
        title: "Notes from teacher training",
        status: "draft",
        date: isoDate(now),
        author: "Jordan Lee",
        categories: ["practice"],
        tags: [],
      },
      body: "Half-finished thoughts from week three of training.",
    },
    "spring-retreat-recap": {
      kind: "blog",
      slug: "spring-retreat-recap",
      frontmatter: {
        title: "Spring retreat recap",
        status: "draft",
        date: isoDate(now - day),
        author: "Rae Okafor",
        excerpt: "Twelve of us, one lake, a lot of rain.",
        categories: ["news"],
        tags: ["retreats"],
      },
      body: "Twelve of us went up to the lake in April. It rained for two days straight and nobody minded.\n\nThe best moment was the silent breakfast on the last morning.",
    },
  };

  const events: Record<string, CollectionItem> = {
    "tuesday-candlelight-flow": {
      kind: "events",
      slug: "tuesday-candlelight-flow",
      frontmatter: {
        title: "Tuesday candlelight flow",
        status: "published",
        start: `${isoDate(now + 2 * day)}T19:00:00-07:00`,
        end: `${isoDate(now + 2 * day)}T20:15:00-07:00`,
        timezone: "America/Denver",
        recurrence: "FREQ=WEEKLY;BYDAY=TU;COUNT=12",
        location: { name: "Willow Street Yoga", address: "214 Willow Street" },
        registrationUrl: "https://willowstreetyoga.com/book",
        price: "$22",
        image: DEMO_PHOTO.candle,
        imageAlt: "Candles along the front of the studio",
        excerpt: "A slow evening flow by candlelight. All levels welcome.",
      },
      body: "Bring a blanket. We dim the lights and move slowly for an hour, then rest.",
    },
    "community-open-house": {
      kind: "events",
      slug: "community-open-house",
      frontmatter: {
        title: "Community open house",
        status: "published",
        start: isoDate(now + 12 * day),
        allDay: true,
        location: { name: "Willow Street Yoga", address: "214 Willow Street" },
        excerpt: "Free taster classes all day, tea and snacks in the lobby.",
      },
      body: "Drop in for a free 30-minute taster class any time between 9 and 4.",
    },
  };

  const shop: Record<string, CollectionItem> = {
    "cork-block": {
      kind: "products",
      slug: "cork-block",
      frontmatter: {
        title: "Cork yoga block",
        status: "published",
        price: { amount: 2400, currency: "USD" },
        sku: "BLOCK",
        image: DEMO_PHOTO.mats,
        imageAlt: "Cork blocks stacked on a mat",
        excerpt: "Firm, light and made from natural cork.",
        options: [{ name: "Size", values: ["Standard", "Wide"] }],
        variants: [
          { sku: "BLOCK-STD", options: { Size: "Standard" } },
          {
            sku: "BLOCK-WIDE",
            options: { Size: "Wide" },
            price: { amount: 2800, currency: "USD" },
          },
        ],
      },
      body: "Our favourite block, used in every class at the studio.",
    },
    "home-practice-guide": {
      kind: "products",
      slug: "home-practice-guide",
      frontmatter: {
        title: "Home practice guide (PDF)",
        status: "published",
        price: { amount: 1200, currency: "USD" },
        sku: "GUIDE-PDF",
        digital: true,
        excerpt: "Twelve short sequences you can do in a small space.",
      },
      body: "A 40-page guide with photos of every pose.",
    },
  };

  const podcast: Record<string, CollectionItem> = {
    "breath-as-an-anchor": {
      kind: "podcast",
      slug: "breath-as-an-anchor",
      frontmatter: {
        title: "Breath as an anchor",
        status: "published",
        date: isoDate(now - 20 * day),
        audio: {
          src: "https://cdn.willowstreetyoga.com/podcast/ep-12.mp3",
          duration: 2710,
          mime: "audio/mpeg",
        },
        season: 2,
        episode: 12,
        explicit: false,
        excerpt: "Sam talks with Jordan about breathing when life gets loud.",
      },
      body: "In this episode we talk about using the breath as an anchor on hard days.",
    },
  };

  const config = (
    kind: CollectionConfig["kind"],
    label: string,
    itemLabel: string,
    list: CollectionConfig["list"],
    extra: Partial<CollectionConfig> = {},
  ): CollectionConfig => ({ kind, label, itemLabel, list, ...extra });

  return {
    collections: { journal, events, shop, podcast },
    collectionConfigs: {
      journal: config(
        "blog",
        "Journal",
        "Post",
        { layout: "cards", pageSize: 12, sort: "date-desc" },
        {
          slugPattern: "{title}",
          itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
          taxonomies: {
            categories: [
              { slug: "practice", label: "Practice" },
              { slug: "news", label: "Studio news" },
            ],
            tags: true,
          },
          feed: { enabled: true, format: "rss" },
        },
      ),
      events: config(
        "events",
        "Events",
        "Event",
        { layout: "list", pageSize: 20, sort: "date-asc" },
        { feed: { enabled: true, format: "ical" } },
      ),
      shop: config("products", "Shop", "Product", { layout: "grid", pageSize: 24, sort: "manual" }),
      podcast: config(
        "podcast",
        "Podcast",
        "Episode",
        { layout: "list", pageSize: 20, sort: "date-desc" },
        { feed: { enabled: true, format: "podcast", title: "The Willow Street podcast" } },
      ),
    },
  };
}
