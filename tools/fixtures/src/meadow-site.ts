/**
 * The Meadow fixture site (`tools/fixtures/meadow-site`): a small but complete OpenSpace site
 * assembled from the real block library — several pages, a journal (blog) with published,
 * draft and scheduled posts, events, a shop, a podcast, forms, redirects and local media.
 * `meadowSite()` returns the document; `writeMeadowSite()` writes it (plus generated images)
 * through site-kit's `writeSiteDocument`, so the files on disk are exactly what the loader
 * reads back.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blocksRegistry, rt } from "@openspace/blocks";
import type {
  Block,
  CollectionItem,
  MediaMeta,
  Page,
  Section,
  SiteDocument,
} from "@openspace/schema";
import { stableId, writeSiteDocument } from "@openspace/site-kit";

export const MEADOW_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "meadow-site");

const id = <P extends "pg" | "sec" | "blk">(p: P, seed: string) => stableId(p, `meadow:${seed}`);

export const PAGE = {
  home: id("pg", "home"),
  about: id("pg", "about"),
  classes: id("pg", "classes"),
  contact: id("pg", "contact"),
  thanks: id("pg", "thanks"),
} as const;

export const FORM_ID = "frm_c0ntactmdw";
export const SITE_ID = "st_meadw00001";

function block(
  seed: string,
  type: string,
  fields: Record<string, unknown>,
  variant?: string,
  column?: number,
): Block {
  const def = blocksRegistry().get(type);
  if (!def) throw new Error(`unknown block ${type}`);
  const b: Block = { id: id("blk", seed), type, v: def.version, fields };
  if (variant) b.variant = variant;
  if (column !== undefined) b.column = column;
  const r = def.validate(b);
  if (!r.success)
    throw new Error(
      `${seed}: ${r.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  return b;
}

function section(
  seed: string,
  blocks: Block[],
  columns: number[] = [12],
  colorTheme: Section["style"]["colorTheme"] = "light",
): Section {
  return {
    id: id("sec", seed),
    layout: { mode: "stack", columns: { d: columns, ...(columns.length > 1 ? { m: [12] } : {}) } },
    style: { colorTheme },
    blocks,
  };
}

/** Image files the fixture ships: path → [width, height, colors, alt]. */
export const IMAGES: Record<
  string,
  { w: number; h: number; from: string; to: string; alt: string; format: "jpeg" | "png" }
> = {
  "media/2026/10/morning-light.jpg": {
    w: 2400,
    h: 1600,
    from: "#e9dcc4",
    to: "#7f9a6a",
    alt: "Morning light across the practice room floor",
    format: "jpeg",
  },
  "media/2026/10/studio-open.jpg": {
    w: 1600,
    h: 1067,
    from: "#f1e6d2",
    to: "#b3754f",
    alt: "The new studio on Pearl Street with mats laid out",
    format: "jpeg",
  },
  "media/2026/10/tea-after-class.jpg": {
    w: 1600,
    h: 1067,
    from: "#efe3cf",
    to: "#6f5540",
    alt: "Cups of tea on a low wooden table after class",
    format: "jpeg",
  },
  "media/2026/10/foundations.jpg": {
    w: 1200,
    h: 1500,
    from: "#dfe8d9",
    to: "#45604a",
    alt: "A teacher guiding a student into a supported lunge",
    format: "jpeg",
  },
  "media/2026/11/retreat-meadow.jpg": {
    w: 1800,
    h: 1200,
    from: "#d9e6ef",
    to: "#5b7a5f",
    alt: "A meadow at the foothills at dusk",
    format: "jpeg",
  },
  "media/2026/11/bolster.jpg": {
    w: 1200,
    h: 1200,
    from: "#efe7dc",
    to: "#8a6d55",
    alt: "A linen-covered bolster in oatmeal",
    format: "jpeg",
  },
  "media/brand/logo.png": {
    w: 480,
    h: 144,
    from: "#7f9a6a",
    to: "#45604a",
    alt: "Meadow Yoga",
    format: "png",
  },
};
export const AUDIO = "media/podcast/slow-mornings-01.mp3";
const CREATED = "2026-10-20T15:04:05Z";

const text = (seed: string, ...content: Parameters<typeof rt.doc>) =>
  block(seed, "text", { content: rt.doc(...content) });
const img = (src: string) => ({
  src,
  alt: IMAGES[src]?.alt ?? "",
  width: IMAGES[src]?.w,
  height: IMAGES[src]?.h,
});

function pages(): Record<string, Page> {
  const home: Page = {
    id: PAGE.home,
    title: "Home",
    slug: "",
    seo: { description: "Small, unhurried yoga classes on Pearl Street in Boulder." },
    sections: [
      section(
        "home-hero",
        [
          {
            ...text(
              "home-hero-text",
              rt.p("Pearl Street · Boulder", "eyebrow"),
              rt.h(1, "Yoga for slow mornings", "display"),
              rt.p(
                "Small classes, patient teaching and tea afterwards. Everyone starts somewhere — start here.",
                "lead",
              ),
            ),
            column: 0,
          },
          block(
            "home-hero-cta",
            "button",
            {
              label: "See the class schedule",
              link: { type: "page", page: PAGE.classes },
              role: "primary",
            },
            "large",
            0,
          ),
          block(
            "home-hero-image",
            "image",
            { image: img("media/2026/10/morning-light.jpg"), aspect: "4:5", lightbox: false },
            undefined,
            1,
          ),
        ],
        [7, 5],
        "light-accent",
      ),
      section(
        "home-quote",
        [
          block(
            "home-testimonial",
            "testimonial",
            {
              quote: rt.doc(
                rt.p(
                  "The first class where nobody rushed me. I've been coming every Saturday since.",
                ),
              ),
              name: "Priya Raman",
              role: "Member since 2025",
            },
            "large",
          ),
        ],
        [12],
        "dark",
      ),
      section("home-news", [
        block(
          "home-newsletter",
          "newsletter",
          {
            heading: "Letters from the studio",
            description:
              "One short email a month: new classes, workshops and the occasional recipe.",
            askName: false,
            placeholder: "you@example.com",
            buttonLabel: "Subscribe",
            successMessage: "Thanks — check your inbox to confirm.",
          },
          "card",
        ),
      ]),
    ],
  };
  const about: Page = {
    id: PAGE.about,
    title: "About",
    slug: "about",
    seo: {
      description: "Meadow Yoga has taught in Boulder since 2014.",
      image: "media/2026/10/studio-open.jpg",
    },
    sections: [
      section("about-intro", [
        text(
          "about-text",
          rt.h(1, "About the studio"),
          rt.p(
            "We opened in 2014 with six mats and a kettle. The room is bigger now, but the idea hasn't changed: twelve people at most, teachers who learn your name, and time afterwards to sit and talk.",
          ),
        ),
      ]),
      section("about-gallery", [
        block(
          "about-photos",
          "gallery",
          {
            images: [
              {
                image: img("media/2026/10/studio-open.jpg"),
                caption: "The east room in the morning",
              },
              { image: img("media/2026/10/tea-after-class.jpg"), caption: "Tea after every class" },
              { image: img("media/2026/10/foundations.jpg"), caption: "Saturday Foundations" },
            ],
            aspect: "auto",
            columns: "3",
            lightbox: true,
            showCaptions: true,
          },
          "grid",
        ),
      ]),
    ],
  };
  const classes: Page = {
    id: PAGE.classes,
    title: "Classes",
    slug: "classes",
    sections: [
      section("classes-intro", [
        text(
          "classes-text",
          rt.h(1, "Classes"),
          rt.p("Six days a week, never more than twelve mats. Drop in, or buy a card of ten."),
        ),
      ]),
      section("classes-faq", [
        block(
          "classes-faq-list",
          "accordion",
          {
            items: [
              {
                question: "I've never done yoga. Which class should I take?",
                answer: rt.doc(rt.p("Saturday Foundations. We go slowly and explain every pose.")),
              },
              {
                question: "Do I need to bring a mat?",
                answer: rt.doc(rt.p("No — mats, blocks and blankets are provided.")),
              },
            ],
            exclusive: true,
            openFirst: false,
            faqSchema: true,
          },
          "lines",
        ),
      ]),
    ],
  };
  const contact: Page = {
    id: PAGE.contact,
    title: "Contact",
    slug: "contact",
    sections: [
      section("contact-main", [
        text(
          "contact-text",
          rt.h(1, "Say hello"),
          rt.p(
            "Questions about classes, private sessions or the retreat? We reply within two working days.",
          ),
        ),
        block(
          "contact-form",
          "form",
          {
            form: {
              id: FORM_ID,
              name: "Contact",
              fields: [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "textarea",
                  name: "message",
                  label: "Message",
                  required: true,
                  maxLength: 2000,
                },
              ],
              submitLabel: "Send message",
              success: { type: "redirect", link: { type: "page", page: PAGE.thanks } },
              notifyOwner: true,
            },
          },
          "card",
        ),
        block(
          "contact-map",
          "map",
          {
            name: "Meadow Yoga",
            address: "1420 Pearl Street, Boulder, CO 80302",
            latitude: 40.0186,
            longitude: -105.2797,
            zoom: 15,
            linkLabel: "Open in Maps",
            aspect: "16:9",
          },
          "card",
        ),
      ]),
    ],
  };
  const thanks: Page = {
    id: PAGE.thanks,
    title: "Thank you",
    slug: "contact/thanks",
    hidden: true,
    seo: { noindex: true },
    sections: [
      section("thanks-main", [
        text(
          "thanks-text",
          rt.h(1, "Thank you"),
          rt.p("Your message is on its way. We'll be in touch soon."),
        ),
      ]),
    ],
  };
  return {
    [home.id]: home,
    [about.id]: about,
    [classes.id]: classes,
    [contact.id]: contact,
    [thanks.id]: thanks,
  };
}

function item(
  kind: CollectionItem["kind"],
  slug: string,
  frontmatter: Record<string, unknown>,
  body: string,
): CollectionItem {
  return { kind, slug, frontmatter, body } as CollectionItem;
}

function collections(): SiteDocument["collections"] {
  return {
    journal: {
      "2026-10-26-opening-day": item(
        "blog",
        "2026-10-26-opening-day",
        {
          title: "Opening day at the new studio",
          status: "published",
          date: "2026-10-26",
          author: "Maya",
          categories: ["news"],
          tags: ["studio", "Boulder"],
          image: "media/2026/10/studio-open.jpg",
          excerpt: "We're in. Here's what the first week looks like.",
        },
        `We're finally in the **new space** on Pearl Street. The floors are warm, the windows face east and the kettle is already on.

## The first week

- Foundations every morning at 8
- Restorative on Wednesday evening
- An open house on Sunday afternoon

{% gallery layout="grid" images=["media/2026/10/studio-open.jpg", "media/2026/10/tea-after-class.jpg"] /%}

Come and say hello — the first class is on us.

{% button href="/classes/" variant="primary" %}See the schedule{% /button %}
`,
      ),
      "2026-10-12-why-we-keep-classes-small": item(
        "blog",
        "2026-10-12-why-we-keep-classes-small",
        {
          title: "Why we keep classes small",
          status: "published",
          date: "2026-10-12",
          author: "Maya",
          categories: ["teaching"],
          tags: ["studio"],
          excerpt: "Twelve mats is a choice, not a limit.",
        },
        `With twelve people in the room a teacher can see everyone, learn their names and notice when a shoulder needs a blanket.

![A teacher guiding a student into a supported lunge](media/2026/10/foundations.jpg)

---

{% quote attribution="A Saturday regular" %}
I finally stopped comparing myself to the person on the next mat.
{% /quote %}
`,
      ),
      "2026-11-30-winter-schedule": item(
        "blog",
        "2026-11-30-winter-schedule",
        {
          title: "The winter schedule",
          status: "scheduled",
          publishAt: "2026-11-30T08:00:00-07:00",
          date: "2026-11-30",
          categories: ["news"],
          excerpt: "Earlier evenings, a later Saturday.",
        },
        "Classes move half an hour earlier from December.\n",
      ),
      "draft-retreat-notes": item(
        "blog",
        "draft-retreat-notes",
        {
          title: "Notes for the spring retreat",
          status: "draft",
          date: "2026-10-01",
        },
        "Unfinished notes.\n",
      ),
    },
    events: {
      "autumn-retreat": item(
        "events",
        "autumn-retreat",
        {
          title: "Autumn retreat in the foothills",
          status: "published",
          start: "2026-11-14T09:00:00-07:00",
          end: "2026-11-14T16:00:00-07:00",
          timezone: "America/Denver",
          location: {
            name: "Sunshine Canyon Lodge",
            address: "4100 Sunshine Canyon Dr, Boulder, CO",
          },
          registrationUrl: "https://tickets.example.org/meadow-retreat",
          price: "$95, lunch included",
          image: "media/2026/11/retreat-meadow.jpg",
          excerpt: "A day of slow practice, a long walk and a shared lunch.",
        },
        "Bring layers and a water bottle. We'll practise twice and walk the meadow trail at noon.\n",
      ),
      "open-house": item(
        "events",
        "open-house",
        {
          title: "Open house",
          status: "published",
          start: "2026-11-01",
          allDay: true,
          location: { name: "Meadow Yoga", address: "1420 Pearl Street, Boulder" },
          excerpt: "Drop in, meet the teachers, try a short class.",
        },
        "Short taster classes on the hour from 1 to 4.\n",
      ),
    },
    shop: {
      "linen-bolster": item(
        "products",
        "linen-bolster",
        {
          title: "Linen bolster",
          status: "published",
          price: { amount: 6800, currency: "USD" },
          sku: "MDW-BOL-01",
          image: "media/2026/11/bolster.jpg",
          excerpt: "Firm, buckwheat-filled support in washed linen.",
          options: [{ name: "Color", values: ["Oat", "Sage"] }],
          variants: [
            { sku: "MDW-BOL-01-OAT", options: { Color: "Oat" } },
            {
              sku: "MDW-BOL-01-SAGE",
              options: { Color: "Sage" },
              price: { amount: 7200, currency: "USD" },
            },
          ],
        },
        "Hand-sewn in Colorado. The cover comes off for washing.\n",
      ),
      "class-card": item(
        "products",
        "class-card",
        {
          title: "Ten-class card",
          status: "published",
          price: { amount: 15000, currency: "USD" },
          sku: "MDW-CARD-10",
          digital: true,
          excerpt: "Ten classes, valid for six months.",
        },
        "Use it for any group class.\n",
      ),
    },
    podcast: {
      "slow-mornings-01": item(
        "podcast",
        "slow-mornings-01",
        {
          title: "Slow mornings, episode 1: beginnings",
          status: "published",
          date: "2026-10-20",
          audio: { src: AUDIO, duration: 1520, mime: "audio/mpeg" },
          episode: 1,
          season: 1,
          excerpt: "Maya on starting a practice, and starting a studio.",
        },
        "In our first episode Maya talks about the first class she ever taught.\n",
      ),
    },
  };
}

/** Tiny blurred placeholder (what the Studio media pipeline stores in media.json). */
async function placeholder(abs: string): Promise<string> {
  const { default: sharp } = await import("sharp");
  const buf = await sharp(await readFile(abs))
    .resize(12)
    .blur(0.6)
    .webp({ quality: 30 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

export async function meadowMedia(root = MEADOW_DIR): Promise<Record<string, MediaMeta>> {
  const out: Record<string, MediaMeta> = {};
  let n = 0;
  for (const [path, spec] of Object.entries(IMAGES)) {
    n++;
    const abs = join(root, path);
    const bytes = existsSync(abs) ? (await stat(abs)).size : 0;
    const meta: MediaMeta = {
      id: `med_${String(n).padStart(10, "0")}` as MediaMeta["id"],
      path,
      kind: "image",
      mime: spec.format === "png" ? "image/png" : "image/jpeg",
      bytes,
      width: spec.w,
      height: spec.h,
      alt: spec.alt,
      createdAt: CREATED,
    };
    if (bytes) meta.placeholder = await placeholder(abs);
    out[path] = meta;
  }
  const audioAbs = join(root, AUDIO);
  out[AUDIO] = {
    id: "med_a00000000a" as MediaMeta["id"],
    path: AUDIO,
    kind: "audio",
    mime: "audio/mpeg",
    bytes: existsSync(audioAbs) ? (await stat(audioAbs)).size : 0,
    duration: 1520,
    createdAt: CREATED,
  };
  return out;
}

export async function meadowSite(root = MEADOW_DIR): Promise<SiteDocument> {
  return {
    config: {
      $schema: "https://schema.openspace.dev/v1/site-config.json",
      siteId: SITE_ID,
      schemaVersion: 1,
      template: { id: "meadow", version: "1.0.0" },
      hub: "https://hub.openspace.dev",
      deploy: {
        target: "github-pages",
        url: "https://meadow.github.io/meadow-yoga",
        customDomain: "meadowyoga.example",
      },
      features: { forms: true, newsletter: true, analytics: false, search: true },
    },
    site: {
      title: "Meadow Yoga",
      tagline: "Small, unhurried yoga classes in Boulder.",
      logo: { src: "media/brand/logo.png", alt: "Meadow Yoga", width: 480, height: 144 },
      nav: [
        { type: "page", page: PAGE.classes },
        { type: "collection", collection: "events", label: "Events" },
        { type: "collection", collection: "journal", label: "Journal" },
        { type: "collection", collection: "shop", label: "Shop" },
        { type: "page", page: PAGE.about },
        {
          type: "button",
          label: "Get in touch",
          link: { type: "page", page: PAGE.contact },
          style: "primary",
        },
      ],
      header: {
        variant: "classic-left",
        sticky: true,
        transparentOnHero: false,
        mobileMenu: "slide",
      },
      footer: section(
        "footer",
        [
          text(
            "footer-text",
            rt.p("Meadow Yoga · 1420 Pearl Street, Boulder"),
            rt.p("Open daily from 7am."),
          ),
        ],
        [12],
        "dark",
      ),
      social: [
        { network: "instagram", url: "https://instagram.com/meadowyoga.example" },
        { network: "email", url: "mailto:hello@meadowyoga.example" },
      ],
      seo: {
        titleTemplate: "%s · Meadow Yoga",
        description: "Small, unhurried yoga classes in Boulder.",
      },
      locale: "en-US",
      integrations: { analytics: false, bookingUrl: null, stripeConnected: false },
      redirects: [
        { from: "/schedule", to: "/classes/", status: 301 },
        { from: "/old/blog", to: "/journal/", status: 301 },
      ],
    },
    styles: {
      choices: {
        palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
        pairing: "fraunces-hanken",
        density: "airy",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    pages: pages() as SiteDocument["pages"],
    collections: collections(),
    collectionConfigs: {
      journal: {
        kind: "blog",
        label: "Journal",
        slugPattern: "{date}-{title}",
        list: { layout: "cards", pageSize: 12, sort: "date-desc" },
        itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
        taxonomies: {
          categories: [
            { slug: "news", label: "Studio news" },
            { slug: "teaching", label: "On teaching" },
          ],
          tags: true,
        },
        feed: {
          enabled: true,
          title: "Meadow Yoga Journal",
          description: "Notes from the studio.",
        },
      },
      events: {
        kind: "events",
        label: "Events",
        list: { layout: "list", pageSize: 20, sort: "date-asc" },
        itemPage: { layout: "split" },
      },
      shop: {
        kind: "products",
        label: "Shop",
        list: { layout: "grid", pageSize: 24, sort: "title" },
      },
      podcast: {
        kind: "podcast",
        label: "Slow Mornings",
        list: { layout: "list", pageSize: 20, sort: "date-desc" },
        feed: {
          enabled: true,
          description: "Conversations about practice, teaching and slowing down.",
        },
      },
    },
    media: await meadowMedia(root),
  };
}

/** Generate the fixture's image and audio files (only missing ones). */
export async function writeMeadowMedia(root = MEADOW_DIR): Promise<void> {
  const { default: sharp } = await import("sharp");
  for (const [path, spec] of Object.entries(IMAGES)) {
    const abs = join(root, path);
    if (existsSync(abs)) continue;
    await mkdir(dirname(abs), { recursive: true });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w}" height="${spec.h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${spec.from}"/><stop offset="1" stop-color="${spec.to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${spec.w * 0.7}" cy="${spec.h * 0.35}" r="${Math.min(spec.w, spec.h) * 0.18}" fill="${spec.from}" opacity="0.55"/></svg>`;
    const image = sharp(Buffer.from(svg));
    const buf =
      spec.format === "png"
        ? await image.png().toBuffer()
        : await image.jpeg({ quality: 72 }).toBuffer();
    await writeFile(abs, buf);
  }
  const audio = join(root, AUDIO);
  if (!existsSync(audio)) {
    await mkdir(dirname(audio), { recursive: true });
    // A silent MPEG-1 Layer III frame header repeated: enough for a feed enclosure fixture.
    const frame = Buffer.alloc(417, 0);
    frame.set([0xff, 0xfb, 0x90, 0x64]);
    await writeFile(audio, Buffer.concat(Array.from({ length: 24 }, () => frame)));
  }
}

/** (Re)write the fixture site on disk. */
export async function writeMeadowSite(root = MEADOW_DIR): Promise<void> {
  await writeMeadowMedia(root);
  await writeSiteDocument(root, await meadowSite(root));
}
