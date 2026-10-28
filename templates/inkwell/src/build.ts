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
 * Inkwell — writers, newsletters and authors. Reading-first and signup-first: an editorial
 * opening, the newsletter above the fold, essays, books with press, speaking and a simple
 * contact page.
 *
 * Demo owner: June Okafor, an essayist who writes the fortnightly newsletter Slow Light.
 */

const T = "inkwell";
const PAGES = definePages(T, {
  home: "",
  about: "about",
  books: "books",
  speaking: "speaking",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "June Okafor";
const ESSAYS = "essays";
const EMAIL = "june@juneokafor.example";

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "June Okafor writes essays about attention, place and the slow work of noticing. Read Slow Light, her free fortnightly newsletter.",
    [
      fromPreset("hero/editorial-type@1", {
        primary: url(collectionPath(ESSAYS)),
        secondary: page(P.about),
        edit: {
          heading: {
            eyebrow: "Slow Light · Essay 112",
            text: "On walking the same mile for a year",
          },
          text: {
            content: rt.doc(
              rt.p(
                "Essays about attention, place and the small, stubborn work of noticing. A new one every other Thursday.",
              ),
            ),
          },
          button: { label: "Read the essays", secondaryLabel: "About June" },
        },
      }),
      fromPreset("newsletter/centered-dark@1", {
        edit: {
          heading: {
            eyebrow: "Slow Light",
            text: "A letter worth opening, every other Thursday",
            subheading:
              "One essay, three things I loved and a photograph. Free, and read by 14,000 people.",
          },
          newsletter: {
            buttonLabel: "Subscribe free",
            successMessage: "Welcome! Your first letter arrives on Thursday.",
            note: "No ads, no tracking, unsubscribe in one click.",
          },
        },
      }),
      fromPreset("blog/two-up-large@1", {
        collection: ESSAYS,
        edit: {
          summary: {
            heading: "Recent essays",
            linkLabel: "Every essay",
            link: url(collectionPath(ESSAYS)),
            emptyMessage: "The next essay is on its way.",
          },
        },
      }),
      fromPreset("features/feature-with-review@1", {
        edit: {
          image: {
            image: photo(
              "typewriter",
              560,
              "4:5",
              "A pale blue typewriter with a blank sheet of paper",
            ),
          },
          heading: { eyebrow: "The new book", text: "The Mile, out in March" },
          text: {
            content: rt.doc(
              rt.p(
                "A year of walking one mile of riverbank every morning, and everything it taught me about paying attention. Published by Saltmarsh Press.",
              ),
            ),
          },
          testimonial: {
            quote: body(
              "A quiet, luminous book that made me want to go outside and look at everything again.",
            ),
            name: "Dana Whitlock",
            role: "Author of Small Hours",
            photo: photo("portraitClara", 80, "1:1"),
          },
        },
      }),
      fromPreset("testimonials/press-quotes@1", {
        theme: "light-accent",
        edit: {
          "quote:1": {
            quote: body("Okafor writes about noticing like no one else."),
            source: "The Evening Ledger",
          },
          "quote:2": {
            quote: body("The newsletter I actually look forward to."),
            source: "Inbox Review",
          },
          "quote:3": {
            quote: body("Patient, funny and exact."),
            source: "Northern Books Quarterly",
          },
        },
      }),
      fromPreset("cta/minimal-link@1", {
        primary: page(P.speaking),
        edit: {
          heading: { text: "Taking talk and workshop invitations for autumn." },
          button: { label: "Speaking" },
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
    "June Okafor is an essayist and the author of The Mile. She writes the Slow Light newsletter from a small flat by the river in Leeds.",
    [
      fromPreset("hero/personal-intro@1", {
        primary: url(collectionPath(ESSAYS)),
        secondary: page(P.contact),
        edit: {
          image: { image: photo("portraitEditorial", 420, "1:1", "June Okafor") },
          heading: {
            eyebrow: "About",
            text: "I'm June. I write slowly.",
            subheading:
              "Essayist, walker and reluctant gardener. My newsletter, Slow Light, has gone out every other Thursday since 2020.",
          },
          button: { label: "Read the essays", secondaryLabel: "Say hello" },
        },
      }),
      fromPreset("about/founder-letter@1", {
        edit: {
          heading: { eyebrow: "Why I write", text: "A short note on Slow Light" },
          text: {
            content: rt.doc(
              rt.p(
                "I started the newsletter during a long winter when I couldn't go far, so I wrote about what was near: the river, the allotment, the man who feeds the swans.",
              ),
              rt.p(
                "It turned out a lot of people wanted to read about small things carefully observed. Thank you for being one of them.",
              ),
              rt.p(
                "Slow Light is free and always will be. If you'd like to support it, buy a book from your local shop.",
              ),
              rt.p("— June", "small"),
            ),
          },
        },
      }),
      fromPreset("about/recognition@1", {
        edit: {
          heading: { eyebrow: "Recognition", text: "Prizes and publications" },
          text: { content: rt.doc(rt.p("A few of the places my writing has found a home.")) },
          "icon-list": {
            items: [
              {
                icon: "award",
                title: "Nature Writing Prize, shortlist 2025",
                text: "For the essay Swan Season.",
              },
              { icon: "book-open", title: "The Mile", text: "Saltmarsh Press, March 2027." },
              {
                icon: "feather",
                title: "Essays in print",
                text: "Field & Atlas, The Evening Ledger, Northern Review.",
              },
            ],
          },
        },
      }),
    ],
  );
}

function books() {
  return makePage(
    P.books,
    "Books",
    "books",
    "Books by June Okafor: The Mile, a year of walking one riverbank, and the essay collection Small Weather. Where to buy and what critics said.",
    [
      fromPreset("hero/centered@1", {
        primary: url("https://saltmarshpress.example/the-mile"),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Books",
            text: "Two books about paying attention",
            subheading:
              "Available from independent bookshops, libraries and the usual places online.",
          },
          button: { label: "Pre-order The Mile", secondaryLabel: "Ask about events" },
        },
      }),
      fromPreset("portfolio/alternating-projects@1", {
        primary: url("https://saltmarshpress.example/the-mile"),
        secondary: url("https://saltmarshpress.example/small-weather"),
        edit: {
          heading: { eyebrow: "Books", text: "The books" },
          "image:1": {
            image: photo(
              "libraryBrowse",
              880,
              "original",
              "A reader reaching for a book in the library stacks",
            ),
          },
          "text:1": {
            content: rt.doc(
              rt.h(3, "The Mile (2027)", "h3"),
              rt.p("A year of walking the same mile of river every morning, season by season."),
            ),
          },
          "button:1": { label: "Pre-order" },
          "image:2": {
            image: photo(
              "bookshelf",
              880,
              "original",
              "A colourful wall of books on wooden shelves",
            ),
          },
          "text:2": {
            content: rt.doc(
              rt.h(3, "Small Weather (2023)", "h3"),
              rt.p(
                "Twenty-four essays on rain, kitchens, buses and the joy of being slightly lost.",
              ),
            ),
          },
          "button:2": { label: "Buy the paperback" },
        },
      }),
      fromPreset("testimonials/spotlight-photo@1", {
        style: {
          background: {
            type: "image",
            src: photo("readingCafe", 1920).src,
            focal: [0.5, 0.5],
            overlay: { color: "background", opacity: 0.86 },
          },
        },
        edit: {
          quote: {
            quote: body(
              "Small Weather is the kind of book you press into a friend's hands and then ask for back.",
            ),
            attribution: "Northern Books Quarterly",
            source: "Review of Small Weather",
          },
        },
      }),
      fromPreset("cta/banner@1", {
        primary: page(P.contact),
        secondary: page(P.speaking),
        edit: {
          heading: {
            text: "Book clubs welcome",
            subheading: "I join one book club a month by video. Write and tell me about yours.",
          },
          button: { label: "Invite June", secondaryLabel: "Talks and workshops" },
        },
      }),
    ],
  );
}

function speaking() {
  return makePage(
    P.speaking,
    "Speaking",
    "speaking",
    "June Okafor gives talks, readings and writing workshops for festivals, schools and libraries. Formats, past hosts and how to book.",
    [
      fromPreset("hero/big-type@1", {
        primary: page(P.contact),
        secondary: url(collectionPath(ESSAYS)),
        edit: {
          heading: { eyebrow: "Talks & workshops", text: "Come and notice things with me." },
          text: {
            content: rt.doc(
              rt.p(
                "Readings, conversations and practical writing workshops for festivals, libraries, schools and teams.",
                "lead",
              ),
            ),
          },
          button: { label: "Invite June", secondaryLabel: "Read first" },
        },
      }),
      fromPreset("services/horizontal-cards@1", {
        edit: {
          heading: { eyebrow: "Formats", text: "Ways I can join you" },
          "card:1": {
            heading: "Readings and conversations",
            body: body(
              "Forty minutes of reading and an open conversation, for festivals and bookshops.",
            ),
            image: photo("readingCafe", 360, "3:2", "A reader with a book at a cafe table"),
            link: page(P.contact),
            linkLabel: "Ask about dates",
          },
          "card:2": {
            heading: "Writing workshops",
            body: body(
              "Two hours of noticing exercises and short writing, for twelve to twenty people.",
            ),
            image: photo("writing", 360, "3:2", "A notebook and pen on a wooden table"),
            link: page(P.contact),
            linkLabel: "Workshop details",
          },
          "card:3": {
            heading: "Talks for teams",
            body: body("A talk on attention at work, with a short walk for anyone who wants one."),
            image: photo("typewriterDesk", 360, "3:2", "An old typewriter on a dark wooden desk"),
            link: page(P.contact),
            linkLabel: "Book a talk",
          },
        },
      }),
      fromPreset("testimonials/logo-quotes@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Hosts", text: "What hosts say" },
          "testimonial:1": {
            quote: body(
              "Our sold-out audience stayed for an hour of questions. June is a natural.",
            ),
            name: "Owen Price",
            role: "Director, Riverside Book Festival",
            photo: photo("portraitOwen", 80, "1:1"),
          },
          "testimonial:2": {
            quote: body("Her workshop got our most reluctant writers filling notebooks."),
            name: "Maya Chen",
            role: "Librarian, Northland Libraries",
            photo: photo("portraitMaya", 80, "1:1"),
          },
          "logo-strip": {
            logos: [
              { name: "Riverside Book Festival" },
              { name: "Northland Libraries" },
              { name: "Saltmarsh Press" },
              { name: "Field & Atlas Live" },
            ],
          },
        },
      }),
      fromPreset("faq/centered@1", {
        edit: {
          heading: { eyebrow: "Booking", text: "Practical questions" },
          accordion: {
            items: [
              {
                question: "What do you charge?",
                answer: body(
                  "Readings from $400, workshops from $650. Reduced fees for libraries and schools.",
                ),
              },
              {
                question: "Do you travel?",
                answer: body(
                  "Yes, within the UK by train, and abroad for festivals with some notice.",
                ),
              },
              {
                question: "Can you sign books?",
                answer: body("Always. Your local bookshop can supply copies for the event."),
              },
            ],
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
    "Write to June Okafor about talks, workshops, book clubs or the Slow Light newsletter. She replies to every letter, slowly but surely.",
    [
      fromPreset("contact/simple-centered@1", {
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Write to me" },
          text: {
            content: rt.doc(
              rt.p([rt.link(EMAIL, `mailto:${EMAIL}`)], "lead"),
              rt.p("I read everything and reply within a week or two."),
            ),
          },
        },
      }),
      fromPreset("contact/photo-form@1", {
        style: {
          background: {
            type: "image",
            src: photo("typewriterDesk", 1920).src,
            focal: [0.5, 0.5],
            overlay: { color: "background", opacity: 0.82 },
          },
        },
        edit: {
          heading: {
            eyebrow: "Invitations",
            text: "Talks, workshops and book clubs",
            subheading: "Tell me a little about the event and I'll reply with dates and a fee.",
          },
          form: {
            form: {
              id: formId(),
              name: "Event invitation",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "text",
                  name: "event",
                  label: "Event or organisation",
                  required: true,
                  width: "half",
                },
                {
                  type: "date",
                  name: "date",
                  label: "Possible date",
                  required: false,
                  width: "half",
                },
              ],
              submitLabel: "Send invitation",
              success: {
                type: "message",
                message: "Thank you — I'll reply with dates within a week.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

export const inkwell: TemplateSpec = {
  id: T,
  name: "Inkwell",
  description:
    "A reading-first site for writers and newsletters, with signup above the fold, essays, books with press, speaking and a simple way to write in.",
  persona: "Writers, authors & newsletters",
  mood: "Literary, warm, unhurried",
  tags: ["writer", "newsletter", "author", "essays", "books", "speaking"],
  sample: { name: NAME, tagline: "Essays on attention, place and noticing." },
  thumbnail: P.home,
  looks: [
    {
      id: "paper",
      name: "Paper",
      description: "Cream paper, an oxblood accent and EB Garamond for long reading.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.13 25)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "eb-garamond-inter",
        density: "airy",
        shape: "sharp",
        buttons: "text-arrow",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "riverbank",
      name: "Riverbank",
      description: "A sage accent, Alegreya type and soft corners — a gentle, natural feel.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.07 150)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "alegreya",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-outline",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "night-edition",
      name: "Night edition",
      description: "Ink blue, Libre Caslon headings and an underline button style.",
      choices: {
        palette: {
          brand: "oklch(0.42 0.12 265)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "libre-caslon-nunito-sans",
        density: "comfortable",
        shape: "sharp",
        buttons: "underline",
        motion: "none",
        imageTreatment: "grain",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Essays on attention, place and noticing.",
        nav: [
          { type: "collection", collection: ESSAYS, label: "Essays" },
          { type: "page", page: P.books, label: "Books" },
          { type: "page", page: P.speaking, label: "Speaking" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
        ],
        header: headerFrom("header/masthead@1"),
        footer: fromPreset("footer/signup-dark@1", {
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p("Slow Light", "lead"),
                rt.p("Essays from June Okafor, every other Thursday."),
              ),
            },
            newsletter: {
              buttonLabel: "Subscribe",
              successMessage: "Thank you — the next letter is on its way.",
            },
            "text:2": {
              content: rt.doc(
                rt.p(
                  [
                    "© 2026 June Okafor · ",
                    rt.link("Essays", collectionPath(ESSAYS)),
                    " · ",
                    rt.link("Contact", href("contact")),
                  ],
                  "small",
                ),
              ),
            },
          },
        }),
        social: [
          { network: "bluesky", url: "https://bsky.app/profile/juneokafor.example" },
          { network: "instagram", url: "https://instagram.com/juneokafor.example" },
        ],
        seo: {
          titleTemplate: "%s · June Okafor",
          description: "Essays on attention, place and noticing, and the Slow Light newsletter.",
          image: photoUrl("typewriter", 1200),
        },
        locale: "en-GB",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), about(), books(), speaking(), contact()],
      collectionConfigs: {
        [ESSAYS]: {
          kind: "blog",
          label: "Essays",
          itemLabel: "Essay",
          list: { layout: "list", pageSize: 20, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: false, showRelated: true },
          feed: { enabled: true, title: "Slow Light", description: "Essays by June Okafor." },
        },
      },
      collections: {
        [ESSAYS]: [
          post(
            "2026-10-15-the-same-mile",
            {
              title: "On walking the same mile for a year",
              date: "2026-10-15",
              author: NAME,
              excerpt:
                "Repetition isn't boring if you let the mile change you instead of the other way round.",
              image: photoUrl("libraryBrowse", 1600),
              imageAlt: "A reader browsing tall library shelves",
            },
            "By March I knew which heron would be on which post. By June I knew the heron knew me.\n\nThis is an essay about the strange freedom of going nowhere new.\n",
          ),
          post(
            "2026-10-01-kitchen-radio",
            {
              title: "The kitchen radio",
              date: "2026-10-01",
              author: NAME,
              excerpt: "My grandmother's radio only got one station. That turned out to be enough.",
              image: photoUrl("readingCafe", 1600),
              imageAlt: "A woman reading at a cafe table in low light",
            },
            "It was tuned to the shipping forecast so long the dial rusted in place.\n\nI've been thinking about what we lose when we can choose everything.\n",
          ),
          post(
            "2026-09-17-notebooks",
            {
              title: "Seventeen notebooks",
              date: "2026-09-17",
              author: NAME,
              excerpt: "What I found when I reread every notebook I've kept since I was twelve.",
              image: photoUrl("writing", 1600),
              imageAlt: "A notebook and pen on a wooden desk",
            },
            "Mostly lists. Some weather. One very bad poem about a bus.\n\nAnd underneath it all, the same three questions, asked again and again.\n",
          ),
        ],
      },
    };
  },
};
