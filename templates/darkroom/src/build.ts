import type { TemplateSpec } from "../../lib/define";
import { project } from "../../lib/define";
import {
  body,
  collectionPath,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  linkColumn,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  url,
} from "../../lib/kit";

/**
 * Darkroom — photographers and creative portfolios. Editorial and image-first: generous
 * whitespace, a quiet serif, work shown large; a portfolio collection with project pages,
 * packages with prices and an enquiry form that asks the right questions.
 *
 * Demo owner: Mara Quill, a portrait and editorial photographer in Brooklyn.
 */

const T = "darkroom";
const PAGES = definePages(T, {
  home: "",
  about: "about",
  services: "services",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Mara Quill";
const EMAIL = "studio@maraquill.example";
const WORK = "work";

const projects = [
  {
    slug: "after-hours",
    title: "After Hours",
    year: 2026,
    client: "Personal series",
    excerpt: "Night-shift workers photographed in the last hour before dawn, in their own light.",
    cover: "streetNight" as const,
    gallery: ["streetNight", "streetShadows", "portraitElder", "photographerStreet"] as const,
  },
  {
    slug: "faces-of-the-guild",
    title: "Faces of the Guild",
    year: 2025,
    client: "Commission, Brooklyn Makers Guild",
    excerpt:
      "Forty portraits of furniture makers, printers and weavers for the guild's centenary book.",
    cover: "portraitEditorial" as const,
    gallery: ["portraitEditorial", "portraitMono", "portraitJonah", "portraitRaf"] as const,
  },
  {
    slug: "dry-season",
    title: "Dry Season",
    year: 2025,
    client: "Editorial, Field & Atlas magazine",
    excerpt: "A fortnight in the desert with a geologist mapping how dunes move across a year.",
    cover: "dunes" as const,
    gallery: ["dunes", "canyon", "road", "valley"] as const,
  },
  {
    slug: "two-weddings",
    title: "Two Small Weddings",
    year: 2024,
    client: "Private commissions",
    excerpt: "An elopement in the fog and a backyard wedding for thirty, both shot on film.",
    cover: "weddingMono" as const,
    gallery: ["weddingMono", "weddingField", "weddingHands", "weddingAisle"] as const,
  },
  {
    slug: "white-lines",
    title: "White Lines",
    year: 2024,
    client: "Commission, Halden Architects",
    excerpt: "A new arts centre photographed over a single summer day, from first light to dusk.",
    cover: "whiteCurves" as const,
    gallery: ["whiteCurves", "darkFacade", "architecture", "city"] as const,
  },
];

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Mara Quill photographs people and places in natural light. Portraits, editorial commissions and small weddings, based in Brooklyn.",
    [
      fromPreset("hero/gallery-strip@1", {
        primary: page(P.services),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Portrait & editorial photographer · Brooklyn",
            text: "Quiet portraits of people at work and at home",
            subheading:
              "Natural light, no props and plenty of time. I photograph people for magazines, books and their own walls.",
          },
          button: { label: "See sessions & prices", secondaryLabel: "Get in touch" },
          "image:1": {
            image: photo(
              "portraitEditorial",
              340,
              "4:5",
              "Studio portrait from Faces of the Guild",
            ),
          },
          "image:2": {
            image: photo(
              "streetNight",
              340,
              "4:5",
              "A lantern-lit street at night, from After Hours",
            ),
          },
          "image:3": {
            image: photo(
              "portraitMono",
              340,
              "4:5",
              "Black-and-white portrait from Faces of the Guild",
            ),
          },
          "image:4": { image: photo("dunes", 340, "4:5", "Sand dunes at dawn, from Dry Season") },
        },
      }),
      fromPreset("portfolio/project-grid@1", {
        collection: WORK,
        edit: {
          summary: {
            heading: "Recent projects",
            linkLabel: "Every project",
            link: url(collectionPath(WORK)),
            emptyMessage: "New projects are on their way.",
          },
        },
      }),
      fromPreset("services/horizontal-cards@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Commissions", text: "Three ways to work together" },
          "card:1": {
            heading: "Portrait sessions",
            body: body("Two unhurried hours at your home, studio or a place that matters to you."),
            image: photo("portraitJonah", 360, "3:2", "A smiling man photographed outdoors"),
            link: page(P.services, "portraits"),
            linkLabel: "Sessions and prices",
          },
          "card:2": {
            heading: "Editorial and books",
            body: body("Portraits and stories for magazines, annual reports and publishers."),
            image: photo("photographerStreet", 360, "3:2", "Mara photographing on a city street"),
            link: page(P.services, "editorial"),
            linkLabel: "How it works",
          },
          "card:3": {
            heading: "Small weddings",
            body: body("Elopements and weddings under fifty guests, shot on film and digital."),
            image: photo("weddingField", 360, "3:2", "A couple embracing in a misty field"),
            link: page(P.services, "weddings"),
            linkLabel: "Wedding coverage",
          },
        },
      }),
      fromPreset("testimonials/dark-trio@1", {
        edit: {
          heading: { eyebrow: "Clients", text: "What people say afterwards" },
          "testimonial:1": {
            quote: body(
              "I've never liked a photo of myself until these. She made the morning feel like a conversation.",
            ),
            name: "Hana Okafor",
            role: "Portrait session",
            photo: photo("portraitAna", 80, "1:1"),
          },
          "testimonial:2": {
            quote: body(
              "Mara delivered forty portraits on time and every one of them had a story in it.",
            ),
            name: "Theo Grant",
            role: "Editor, Brooklyn Makers Guild",
            photo: photo("portraitTheo", 80, "1:1"),
          },
          "testimonial:3": {
            quote: body(
              "Our wedding photos look like the day felt: relaxed, a bit foggy and full of laughing.",
            ),
            name: "Iris Lund",
            role: "Wedding, October",
            photo: photo("portraitIris", 80, "1:1"),
          },
        },
      }),
      fromPreset("cta/minimal-link@1", {
        primary: page(P.contact),
        edit: {
          heading: { text: "Now booking portrait sessions for spring." },
          button: { label: "Check my availability" },
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
    "Mara Quill has photographed people for magazines, publishers and families for twelve years. Read about her approach, clients and press.",
    [
      fromPreset("hero/personal-intro@1", {
        primary: page(P.services),
        secondary: page(P.contact),
        edit: {
          image: { image: photo("photographerSelf", 420, "1:1", "Mara Quill holding her camera") },
          heading: {
            eyebrow: "About",
            text: "I'm Mara. I take my time.",
            subheading:
              "Twelve years photographing people for magazines, publishers and their families — always in natural light, always slowly.",
          },
          button: { label: "Sessions & prices", secondaryLabel: "Write to me" },
        },
      }),
      fromPreset("about/story-numbers@1", {
        edit: {
          heading: { eyebrow: "The story", text: "From darkroom assistant to my own studio" },
          text: {
            content: rt.doc(
              rt.p(
                "I learned to print in a basement darkroom in Philadelphia, then spent six years assisting editorial photographers before going on my own in 2014.",
              ),
              rt.p(
                "I still shoot a roll of film on every job, and every client gets one hand-printed photograph in the post.",
              ),
            ),
          },
          stats: {
            items: [
              { value: "2014", label: "Working for myself since" },
              { value: "600+", label: "Portrait sessions" },
              { value: "38", label: "Magazine and book commissions" },
            ],
          },
        },
      }),
      fromPreset("about/recognition@1", {
        theme: "light",
        edit: {
          heading: { eyebrow: "Recognition", text: "Exhibitions and awards" },
          text: {
            content: rt.doc(
              rt.p("A few moments I'm proud of, and the people who made them possible."),
            ),
          },
          "icon-list": {
            items: [
              {
                icon: "award",
                title: "Portrait Prize shortlist, 2025",
                text: "For Faces of the Guild.",
              },
              {
                icon: "image",
                title: "After Hours, solo exhibition",
                text: "Atlantic Avenue Gallery, 2026.",
              },
              {
                icon: "book-open",
                title: "Faces of the Guild, the book",
                text: "Published by Saltmarsh Press.",
              },
            ],
          },
        },
      }),
      fromPreset("testimonials/press-quotes@1", {
        theme: "light-accent",
        edit: {
          "quote:1": {
            quote: body("Patient, unshowy portraits that let their subjects breathe."),
            source: "Field & Atlas",
          },
          "quote:2": {
            quote: body("One of the most humane portrait books of the year."),
            source: "The Evening Ledger",
          },
          "quote:3": {
            quote: body("Quill's night portraits glow without a single flash."),
            source: "City Arts Weekly",
          },
        },
      }),
      fromPreset("cta/big-type@1", {
        primary: page(P.contact),
        edit: {
          heading: { text: "Let's make a portrait you'll keep." },
          button: { label: "Get in touch" },
        },
      }),
    ],
  );
}

function services() {
  return makePage(
    P.services,
    "Sessions & prices",
    "services",
    "Portrait sessions, editorial commissions and small wedding coverage by Mara Quill, with clear prices and what every package includes.",
    [
      fromPreset("hero/editorial-type@1", {
        primary: page(P.contact),
        secondary: url(collectionPath(WORK)),
        edit: {
          heading: { eyebrow: "Sessions & prices", text: "Portraits, stories and small weddings" },
          text: {
            content: rt.doc(
              rt.p(
                "Every session starts with a call about you, the place and how you'll use the photographs.",
              ),
            ),
          },
          button: { label: "Book a call", secondaryLabel: "See the work" },
        },
      }),
      fromPreset("pricing/packages-photos@1", {
        anchor: "portraits",
        primary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Portraits",
            text: "Portrait sessions",
            subheading:
              "Each session includes a planning call, natural-light shooting and an online gallery to download from.",
          },
          "card:1": {
            eyebrow: "$350",
            heading: "Short session",
            body: body("Forty-five minutes in one place, with fifteen finished photographs."),
            image: photo("portraitRaf", 380, "4:5", "Portrait of a man outdoors in a green shirt"),
          },
          "card:2": {
            eyebrow: "$650",
            heading: "Half morning",
            body: body("Two hours, two places and forty finished photographs, plus one print."),
            image: photo("portraitLena", 380, "4:5", "Portrait of a smiling woman by the water"),
          },
          "card:3": {
            eyebrow: "$1,200",
            heading: "A day in your life",
            body: body("A full day at home or work, with eighty photographs and a small book."),
            image: photo("portraitElder", 380, "4:5", "Black-and-white portrait of an older man"),
          },
          button: { label: "Book a portrait session" },
        },
      }),
      fromPreset("process/numbered-steps@1", {
        anchor: "editorial",
        primary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Editorial & books",
            text: "How a commission works",
            subheading:
              "For magazines, publishers and organisations. Day rate from $1,800 plus licensing.",
          },
          columns: {
            items: [
              {
                heading: "Brief",
                body: body("Send the story, the deadline and where the pictures will run."),
              },
              {
                heading: "Recce",
                body: body("I visit or call ahead, so nothing about the light is a surprise."),
              },
              {
                heading: "Shoot",
                body: body("Unhurried and quiet, with a contact sheet the same evening."),
              },
              {
                heading: "Deliver",
                body: body("Edited, captioned files within five working days."),
              },
            ],
          },
          button: { label: "Send a brief" },
        },
      }),
      fromPreset("faq/dark-minimal@1", {
        anchor: "weddings",
        edit: {
          heading: { eyebrow: "Weddings", text: "Small weddings, asked and answered" },
          text: { content: rt.doc(rt.p("Coverage starts at $2,400 for four hours.")) },
          accordion: {
            items: [
              {
                question: "How many weddings do you take a year?",
                answer: body(
                  "Twelve at most, so each couple gets my full attention and their photos within three weeks.",
                ),
              },
              {
                question: "Do you shoot film?",
                answer: body(
                  "Yes — one or two rolls of black-and-white film alongside digital, at no extra cost.",
                ),
              },
              {
                question: "Will you travel?",
                answer: body(
                  "Anywhere. Travel within two hours of New York is included; beyond that, at cost.",
                ),
              },
            ],
          },
        },
      }),
      fromPreset("cta/split-photo@1", {
        primary: page(P.contact),
        edit: {
          heading: {
            text: "Not sure which session fits?",
            subheading:
              "Tell me what the photographs are for and I'll suggest the simplest option.",
          },
          button: { label: "Ask me" },
          image: {
            image: photo("photographerSelf", 640, "3:2", "Mara framing a shot with her camera"),
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
    "Book a portrait session, send an editorial brief or ask about wedding dates. Mara Quill replies within two working days.",
    [
      fromPreset("contact/photo-form@1", {
        edit: {
          heading: {
            eyebrow: "Contact",
            level: "h1",
            text: "Tell me what you have in mind",
            subheading:
              "A few details help me reply with dates and a quote. I answer within two working days.",
          },
          form: {
            form: {
              id: formId(),
              name: "Session enquiry",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "kind",
                  label: "What kind of photographs?",
                  required: true,
                  width: "full",
                  options: [
                    "Portrait session",
                    "Editorial or book",
                    "Small wedding",
                    "Something else",
                  ],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Tell me a little more",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send enquiry",
              success: {
                type: "message",
                message: "Thank you — I'll reply within two working days.",
              },
              notifyOwner: true,
            },
          },
        },
        style: {
          background: {
            type: "image",
            src: photo("streetShadows", 1920).src,
            focal: [0.5, 0.5],
            overlay: { color: "background", opacity: 0.82 },
          },
        },
      }),
      fromPreset("contact/cards-row@1", {
        edit: {
          "contact-info:1": {
            headingLevel: "h2",
            heading: "Email",
            phone: undefined,
            email: EMAIL,
            note: "The quickest way to reach me",
          },
          "contact-info:2": {
            headingLevel: "h2",
            heading: "Phone",
            email: undefined,
            phone: "+1 (718) 555-0164",
            note: "Weekdays, 10am–5pm",
          },
          "contact-info:3": {
            headingLevel: "h2",
            heading: "Studio",
            address: "88 Dobbin Street, Studio 3\nBrooklyn, NY 11222",
            note: "Visits by appointment",
          },
        },
      }),
    ],
  );
}

export const darkroom: TemplateSpec = {
  id: T,
  name: "Darkroom",
  description:
    "An editorial, image-first portfolio for photographers and visual artists, with project pages, session packages and an enquiry form.",
  persona: "Photographers & creative portfolios",
  mood: "Editorial, quiet, image-first",
  tags: ["photography", "portfolio", "creative", "projects", "packages", "weddings"],
  sample: { name: NAME, tagline: "Portrait and editorial photographer in Brooklyn." },
  thumbnail: P.home,
  looks: [
    {
      id: "gallery",
      name: "Gallery",
      description: "White walls, ink-black type and EB Garamond — the work does the talking.",
      choices: {
        palette: {
          brand: "oklch(0.32 0.02 260)",
          neutral: "pure",
          contrast: "standard",
          source: "curated",
        },
        pairing: "eb-garamond-inter",
        density: "airy",
        shape: "sharp",
        buttons: "underline",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "contact-sheet",
      name: "Contact sheet",
      description: "Grotesque type, tight spacing and a red grease-pencil accent.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.19 28)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "archivo",
        density: "compact",
        shape: "sharp",
        buttons: "solid",
        motion: "none",
        imageTreatment: "none",
      },
    },
    {
      id: "golden-hour",
      name: "Golden hour",
      description: "Warm paper, a saffron accent and Playfair headings with soft corners.",
      choices: {
        palette: {
          brand: "oklch(0.62 0.12 65)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "playfair-source-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-outline",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
  ],
  build() {
    return {
      site: {
        title: NAME,
        tagline: "Portrait and editorial photographer in Brooklyn.",
        nav: [
          { type: "collection", collection: WORK, label: "Work" },
          { type: "page", page: P.services, label: "Sessions" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
        ],
        header: headerFrom("header/minimal@1", { sticky: true }),
        footer: fromPreset("footer/giant-wordmark@1", {
          theme: "light",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p("Portraits and editorial photography. Brooklyn, New York.", "small"),
              ),
            },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Studio", [
                  ["Work", collectionPath(WORK)],
                  ["Sessions", href("services")],
                ]).slice(1),
              ),
            },
            "text:3": {
              content: rt.doc(
                ...linkColumn("More", [
                  ["About", href("about")],
                  ["Contact", href("contact")],
                ]).slice(1),
              ),
            },
            heading: { text: "Mara Quill" },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/maraquill.example" },
          { network: "pinterest", url: "https://pinterest.com/maraquill.example" },
        ],
        seo: {
          titleTemplate: "%s · Mara Quill",
          description: "Portrait and editorial photographer in Brooklyn.",
          image: photoUrl("portraitEditorial", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), about(), services(), contact()],
      collectionConfigs: {
        [WORK]: {
          kind: "portfolio",
          label: "Work",
          itemLabel: "Project",
          list: { layout: "grid", pageSize: 24, sort: "date-desc" },
          itemPage: { layout: "gallery" },
        },
      },
      collections: {
        [WORK]: projects.map((p) =>
          project(
            p.slug,
            {
              title: p.title,
              date: `${p.year}-05-01`,
              year: p.year,
              client: p.client,
              role: "Photography",
              excerpt: p.excerpt,
              image: photoUrl(p.cover, 1600),
              imageAlt: `${p.title}, cover photograph`,
              gallery: p.gallery.filter((k) => k !== p.cover).map((k) => photo(k, 1200)),
            },
            `${p.excerpt}\n\nPhotographed by ${NAME}. Prints from this project are available on request.\n`,
          ),
        ),
      },
    };
  },
};
