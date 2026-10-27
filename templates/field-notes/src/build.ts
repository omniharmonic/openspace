import type { TemplateSpec } from "../../lib/define";
import { post } from "../../lib/define";
import {
  body,
  collectionPath,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  url,
} from "../../lib/kit";

/**
 * Field Notes — writers, newsletters and blogs (doc 04 §7). Reading-first and literary:
 * Literata / Manrope on paper and ink with a highlighter-yellow mark; a newsletter-first home,
 * long essays with footnotes and reading times.
 *
 * Demo owner: Ruth Ellery, who writes The Long Field, a fortnightly letter from Vermont.
 */

const T = "field-notes";
const PAGES = definePages(T, {
  home: "",
  subscribe: "subscribe",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "The Long Field";
const EMAIL = "ruth@thelongfield.example";

const signup = {
  askName: false,
  placeholder: "you@example.com",
  buttonLabel: "Subscribe",
  successMessage: "You're in. The next letter arrives on a Sunday morning.",
};

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "The Long Field is a fortnightly letter by Ruth Ellery about walking, rural places and paying attention. Free, with essays every other Sunday.",
    [
      fromPreset("hero/signup@1", {
        theme: "light-accent",
        style: { padding: { d: "3xl", m: "xl" } },
        edit: {
          heading: {
            eyebrow: "A letter every other Sunday",
            text: "Essays on walking, weather and paying attention",
            subheading:
              "The Long Field is a free letter from a hill farm in Vermont: one essay, one walk and one good thing to read. Joined by 14,000 readers.",
          },
          newsletter: {
            ...signup,
            note: "Free. One click to unsubscribe, and I never share your address.",
          },
        },
      }),
      fromPreset("stats/inline-strip@1", {
        theme: "light",
        edit: {
          stats: {
            items: [
              { value: "14,000", label: "Readers" },
              { value: "Sundays", label: "Every other week" },
              { value: "180+", label: "Letters since 2019" },
              { value: "Free", label: "And always will be" },
            ],
          },
        },
      }),
      fromPreset("blog/intro-list@1", {
        theme: "light",
        collection: "essays",
        edit: {
          heading: { eyebrow: "Latest", text: "Recent essays" },
          text: {
            content: rt.doc(
              rt.p(
                "Long-form pieces about land, work and the small rituals of rural life. Each one also arrives in your inbox, if you'd like it there.",
              ),
            ),
          },
          button: { label: "Browse the archive", link: url(collectionPath("essays")) },
          summary: {
            source: { collection: "essays", sort: "date-desc", limit: 4 },
            showImage: false,
            emptyMessage: "The next essay is being written. Subscribe to get it first.",
          },
        },
      }),
      fromPreset("blog/magazine-wall@1", {
        theme: "light-accent",
        collection: "essays",
        edit: {
          summary: {
            heading: "From the archive",
            linkLabel: "Every essay",
            link: url(collectionPath("essays")),
            emptyMessage: "The archive fills up one Sunday at a time.",
          },
        },
      }),
      fromPreset("about/portrait-overlap@1", {
        edit: {
          image: {
            image: photo(
              "portraitLake",
              520,
              "original",
              "Portrait of the writer Ruth Ellery beside a lake",
            ),
          },
          text: {
            content: rt.doc(
              rt.p("About the writer", "eyebrow"),
              rt.h(2, "Hello, I'm Ruth", "h2"),
              rt.p(
                "I left a newspaper job in Boston in 2019 for forty acres of hill farm and a dog who refuses to walk in the rain. The Long Field began as letters to friends about what I was learning, and slowly found more readers than I ever expected.",
              ),
              rt.p([
                "I write about land, work and attention, and ",
                { type: "text", text: "I answer every reply.", marks: [{ type: "highlight" }] },
              ]),
            ),
          },
          button: { label: "Read more about me", link: page(P.about), role: "tertiary" },
        },
      }),
      fromPreset("testimonials/carousel@1", {
        edit: {
          "quote-carousel": {
            label: "What readers say",
            quotes: [
              {
                quote:
                  "The only email I open with a cup of tea and read twice. Ruth writes the way good walks feel.",
                name: "Hannah Ostrowski",
                role: "Reader since 2021",
                photo: photo("portraitClara", 120, "1:1", "Portrait of Hannah Ostrowski"),
              },
              {
                quote:
                  "Every other Sunday I learn the name of a bird, a tool or a field I'd never noticed. It has changed how I walk to work.",
                name: "Marcus Bell",
                role: "Reader in Glasgow",
                photo: photo("portraitMarcus", 120, "1:1", "Portrait of Marcus Bell"),
              },
              {
                quote:
                  "Quietly the best writing about rural life I've read in years, and it arrives for free.",
                name: "June Abara",
                role: "Editor, Quarry Quarterly",
                photo: photo("portraitAna", 120, "1:1", "Portrait of June Abara"),
              },
            ],
          },
        },
      }),
      fromPreset("newsletter/card@1", {
        theme: "brand",
        edit: {
          newsletter: {
            heading: "Get the next letter",
            description:
              "One essay every other Sunday morning, plus the occasional photograph from the farm.",
            ...signup,
            askName: true,
            note: "Free, and always will be.",
          },
        },
      }),
    ],
  );
}

function subscribe() {
  return makePage(
    P.subscribe,
    "Subscribe",
    "subscribe",
    "Subscribe to The Long Field for free, or become a supporter for $6 a month to keep the letter independent and ad-free.",
    [
      fromPreset("hero/centered@1", {
        edit: {
          heading: {
            eyebrow: "Subscribe",
            text: "Free to read, kept alive by readers",
            subheading:
              "Every essay is free. Supporters pay what a coffee costs each month, which pays for the writing time, the printing of the yearly anthology and nothing else.",
          },
          button: {
            label: "Subscribe free",
            link: page(P.home),
            secondaryLabel: "Become a supporter",
            secondaryLink: page(P.subscribe, "support"),
          },
        },
      }),
      fromPreset("pricing/two-plans@1", {
        anchor: "support",
        edit: {
          heading: {
            eyebrow: "Two ways to read",
            text: "Choose how you read",
            subheading:
              "Both get every essay. Supporters get a little more, and my lasting gratitude.",
          },
          pricing: {
            plans: [
              {
                name: "Reader",
                price: "Free",
                period: "always",
                description: "Every essay by email, every other Sunday.",
                features: [
                  { text: "The fortnightly essay" },
                  { text: "The full archive online" },
                  { text: "Replies always welcome" },
                ],
                buttonLabel: "Subscribe free",
                link: page(P.home),
                featured: false,
              },
              {
                name: "Supporter",
                price: "$6",
                period: "per month",
                description: "Keeps the letter independent and ad-free.",
                features: [
                  { text: "A printed anthology every December" },
                  { text: "Audio readings of each essay" },
                  { text: "A seasonal walk with readers" },
                ],
                buttonLabel: "Become a supporter",
                link: page(P.contact),
                featured: true,
                badge: "Thank you",
              },
            ],
          },
        },
      }),
      fromPreset("faq/centered@1", {
        edit: {
          heading: { eyebrow: "Questions", text: "Before you subscribe" },
          accordion: {
            items: [
              {
                question: "How often will I hear from you?",
                answer: body(
                  "Every other Sunday morning, Eastern time. Never more, occasionally less in lambing season.",
                ),
              },
              {
                question: "Can I read without subscribing?",
                answer: body("Yes. Every essay goes up in the archive a day after it's sent."),
              },
              {
                question: "Can I give a supporter subscription?",
                answer: body(
                  "Of course. Write to me with their address and I'll send a card with the first anthology.",
                ),
              },
            ],
          },
        },
      }),
    ],
  );
}

function about() {
  return makePage(
    P.about,
    "About",
    "about",
    "Ruth Ellery is a former newspaper reporter who writes The Long Field from a hill farm in Vermont. Her story, books and press.",
    [
      fromPreset("about/story-editorial@1", {
        edit: {
          heading: { eyebrow: "About", text: "A letter from a hill farm", level: "h1", size: "h1" },
          text: {
            content: rt.doc(
              rt.p(
                "For twelve years I covered city hall for a Boston newspaper. I wrote fast, about meetings, and rarely looked up. In 2019 my partner and I bought a run-down hill farm in Vermont with a leaking barn, an orchard nobody had pruned since the eighties and a view that still stops me in the lane.",
              ),
              rt.p(
                "The Long Field started as emails to friends who wanted to know what we were doing up here. They forwarded them, and their friends forwarded them again. Today the letter goes to fourteen thousand people in sixty countries, and it is still written at the same kitchen table, usually on a Saturday night.",
              ),
              rt.p(
                "I write about land, work and attention: what a stone wall tells you about the people who built it, how to learn a field by walking it every day for a year. My first book, Small Weather, comes out from Harrow & Lane in the spring.",
              ),
            ),
          },
        },
      }),
      fromPreset("logos/marquee@1", {
        edit: {
          "logo-strip": {
            label: "Writing has appeared in",
            logos: [
              { name: "Quarry Quarterly" },
              { name: "The Hill Review" },
              { name: "Northern Almanac" },
              { name: "Field & Hedge" },
              { name: "The Sunday Letter" },
              { name: "Granite State Radio" },
            ],
          },
        },
      }),
      fromPreset("newsletter/split-image@1", {
        edit: {
          image: {
            image: photo("writing", 520, "4:5", "Writing notes in a notebook beside a mug of tea"),
          },
          heading: { eyebrow: "The letter", text: "Read along every other Sunday" },
          "icon-list": {
            items: [
              { icon: "book-open", title: "One long essay" },
              { icon: "mountain", title: "One walk worth taking" },
              { icon: "heart", title: "One good thing to read" },
            ],
          },
          newsletter: {
            ...signup,
            buttonLabel: "Subscribe",
            note: "Free. Unsubscribe with one click.",
          },
        },
      }),
    ],
  );
}

function contact() {
  return makePage(
    P.contact,
    "Contact",
    "contact",
    "Write to Ruth Ellery about The Long Field, supporter subscriptions, speaking, reprints or press. Every reply is read.",
    [
      fromPreset("contact/form-split@1", {
        edit: {
          heading: {
            eyebrow: "Contact",
            text: "Write to me",
            level: "h1",
            subheading:
              "Replying to any letter reaches me too. For press, reprints and speaking, the form below is quickest.",
          },
          "contact-info": {
            name: "Ruth Ellery",
            address: "Peacham, Vermont",
            phone: undefined,
            email: EMAIL,
          },
          form: {
            form: {
              id: formId(),
              name: "Contact",
              fields: [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "topic",
                  label: "About",
                  width: "full",
                  options: ["A letter", "Supporter subscription", "Speaking", "Reprints & press"],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Message",
                  required: true,
                  maxLength: 4000,
                },
              ],
              submitLabel: "Send",
              success: {
                type: "message",
                message: "Thank you for writing. I read everything, usually on Sunday evenings.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

const essay = (
  slug: string,
  title: string,
  date: string,
  minutes: number,
  excerpt: string,
  image: Parameters<typeof photoUrl>[0],
  imageAlt: string,
  text: string,
  notes: string[],
) =>
  post(
    slug,
    {
      title,
      date,
      author: "Ruth Ellery",
      categories: ["essays"],
      tags: [`${minutes}-minute read`],
      image: photoUrl(image, 1600),
      imageAlt,
      excerpt,
    },
    `*${minutes}-minute read*

${text.trim()}

---

**Notes**

${notes.map((n, i) => `${i + 1}. ${n}`).join("\n")}
`,
  );

export const fieldNotes: TemplateSpec = {
  id: T,
  name: "Field Notes",
  description:
    "A reading-first site for writers, newsletters and blogs: a newsletter-first home, long essays with footnotes and reading times, and a supporter page.",
  persona: "Writers, newsletters, blogs",
  mood: "Reading-first, literary",
  tags: ["writing", "newsletter", "blog", "essays", "publishing"],
  sample: { name: NAME, tagline: "Essays on walking, weather and paying attention." },
  thumbnail: P.home,
  looks: [
    {
      id: "highlighter",
      name: "Highlighter",
      description:
        "Paper and ink with highlighter-yellow washes and marks, and Literata for long reading.",
      choices: {
        palette: {
          brand: "oklch(0.9 0.17 100)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "literata-manrope",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "none",
        imageTreatment: "none",
      },
      overrides: {
        color: {
          "light-accent": { background: { $value: "oklch(0.975 0.045 100)", $type: "color" } },
        },
      },
    },
    {
      id: "ink",
      name: "Ink",
      description: "Fountain-pen blue with Crimson Pro and Figtree, quiet and serious.",
      choices: {
        palette: {
          brand: "oklch(0.35 0.08 265)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "crimson-figtree",
        density: "comfortable",
        shape: "sharp",
        buttons: "underline",
        motion: "none",
        imageTreatment: "none",
      },
    },
    {
      id: "almanac",
      name: "Almanac",
      description: "Russet and parchment with Libre Caslon, like an old farm almanac.",
      choices: {
        palette: {
          brand: "oklch(0.5 0.11 45)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "libre-caslon-nunito-sans",
        density: "airy",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "grain",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Essays on walking, weather and paying attention.",
        nav: [
          { type: "collection", collection: "essays", label: "Essays" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
          { type: "button", label: "Subscribe", link: page(P.subscribe), style: "primary" },
        ],
        header: headerFrom("header/logo-above@1", { sticky: false }),
        footer: fromPreset("footer/centered@1", {
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p(
                  "A letter every other Sunday from a hill farm in Peacham, Vermont, by Ruth Ellery.",
                  "small",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                rt.p(
                  [
                    "© 2026 Ruth Ellery · ",
                    rt.link("Essays", collectionPath("essays")),
                    " · ",
                    rt.link("Subscribe", href("subscribe")),
                    " · ",
                    rt.link("RSS", "/essays/rss.xml"),
                  ],
                  "small",
                ),
              ),
            },
          },
        }),
        social: [
          { network: "substack", url: "https://thelongfield.substack.example" },
          { network: "instagram", url: "https://instagram.com/thelongfield.example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · The Long Field",
          description: "Essays on walking, weather and paying attention, by Ruth Ellery.",
          image: photoUrl("books", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), subscribe(), about(), contact()],
      collectionConfigs: {
        essays: {
          kind: "blog",
          label: "Essays",
          itemLabel: "Essay",
          slugPattern: "{title}",
          list: { layout: "list", pageSize: 20, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
          taxonomies: { categories: [{ slug: "essays", label: "Essays" }], tags: true },
          feed: {
            enabled: true,
            title: NAME,
            description: "Essays on walking, weather and paying attention.",
          },
        },
      },
      collections: {
        essays: [
          essay(
            "learning-a-field",
            "Learning a field by heart",
            "2026-10-18",
            8,
            "I walked the same eleven acres every morning for a year. Here is what the field taught me.",
            "hills",
            "Green hills seen from above, ridges catching the light",
            `
On the first of November last year I made myself a promise: every morning, before coffee, I would walk the long field below the house. Same route, same gate, whatever the weather.¹

By February I could tell you where the snow drifted deepest and where the deer crossed. By May I knew the order the wildflowers came in: coltsfoot, then bloodroot, then the bluets that turn the north corner pale. By August I had stopped noticing the field and started noticing *changes* in it, which is a different and much better kind of attention.

## What repetition gives you

We tend to think of novelty as the engine of seeing. Go somewhere new and the world looks bright. But the field taught me the opposite. It was only on the two-hundredth walk that I noticed the stone wall bends where an older wall once met it, and that the old wall lines up with a cellar hole in the woods.²

Knowing a place by heart is slow. It asks for a year, not an afternoon. I'm starting on the orchard next.
`,
            [
              "I broke the promise eleven times, mostly in mud season. The dog kept walking it anyway.",
              "The town's 1859 map shows a farmhouse there, belonging to someone called A. Ellery. No relation, as far as I can tell.",
            ],
          ),
          essay(
            "the-wall-builders",
            "The wall builders",
            "2026-10-04",
            6,
            "New England has more stone wall than the moon has craters. Who built them, and why?",
            "forest",
            "Sunlight falling through tall trees onto a forest path",
            `
Walk any Vermont woods and you'll find them: grey stone walls running through trees, enclosing nothing. A century ago these woods were sheep pasture, and every one of those stones was lifted by hand.¹

There are roughly 240,000 miles of stone wall in New England. Most were built between 1775 and 1825, when forests were cleared for farms and the frost heaved up a fresh crop of rocks every spring.

## Reading a wall

Small stones mean a field was ploughed, and the farmer threw the pickings on the wall. Large, carefully laid stones mean pasture. A wall with a gap mid-span marks an old gate; two parallel walls are a lane.
`,
            [
              "The geologist Robert Thorson estimates the walls hold more stone than the Egyptian pyramids. His book on the subject is wonderful.",
            ],
          ),
          essay(
            "small-weather",
            "Small weather",
            "2026-09-20",
            5,
            "On the private weather of a single valley, and learning to forecast it from the porch.",
            "valley",
            "A misty river valley with pine trees and cliffs at dawn",
            `
The forecast for our town is almost always wrong for our valley. Fog pools here when the ridge is clear; frost comes ten days earlier than the village; rain arrives from the west twenty minutes after it reaches the Wilsons' barn.

So I started keeping a weather book: three lines a day, written on the porch with the first coffee. Two years in, I can forecast the next morning's fog from the evening's dew better than any app.¹
`,
            [
              "My neighbour Ed, who is 84, says he could have told me that in an afternoon. He is right.",
            ],
          ),
          essay(
            "a-year-of-apples",
            "A year of apples",
            "2026-09-06",
            7,
            "Pruning a forgotten orchard back to life, one tree and one mistake at a time.",
            "meadow",
            "Wild poppies scattered through a summer meadow",
            `
The orchard came with the farm and with no instructions. Twenty-two trees, unpruned since the 1980s, their branches crossing like arguments.

I learned to prune from a library book and a retired orchardist named Lorraine, who watched me make my first cut and said, kindly, "Well. It'll grow back."¹ This autumn, for the first time, we picked enough to press cider.
`,
            ["She was right about that too. Apple trees forgive almost everything except shade."],
          ),
        ],
      },
    };
  },
};
