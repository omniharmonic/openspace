import type { Section } from "@omniharmonic/openspace-schema";
import type { TemplateSpec } from "../../lib/define";
import { project } from "../../lib/define";
import {
  body,
  definePages,
  formId,
  fromPreset,
  grid,
  headerFrom,
  heading,
  item,
  makePage,
  page,
  photo,
  photoUrl,
  r,
  rt,
  section,
} from "../../lib/kit";

/**
 * Atelier — photographers and visual artists (doc 04 §7). Gallery-first with minimal chrome:
 * Instrument Serif / Instrument Sans in monochrome with one vermilion accent; a full-bleed
 * slideshow, a project index whose photographs zoom on hover, and lightboxes everywhere.
 *
 * Demo owner: Elias Varga, a landscape and architecture photographer in Denver.
 */

const T = "atelier";
const PAGES = definePages(T, {
  home: "",
  work: "work",
  commissions: "commissions",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const EMAIL = "studio@eliasvarga.example";

const projects = [
  {
    slug: "cordillera",
    title: "Cordillera",
    year: 2026,
    client: "Personal project",
    excerpt:
      "Three winters above the treeline in the San Juan Mountains, waiting for the light to go flat.",
    cover: "mountainLake" as const,
    gallery: ["mountainLake", "lake", "valley", "cliffs"] as const,
  },
  {
    slug: "white-city",
    title: "White City",
    year: 2025,
    client: "Monograph, Halden Press",
    excerpt: "Modernist facades in noon sun: a study of edges, shadows and the colour white.",
    cover: "architecture" as const,
    gallery: ["architecture", "city", "street", "poolHouse"] as const,
  },
  {
    slug: "salt-and-glass",
    title: "Salt & Glass",
    year: 2025,
    client: "Commission, Tidewater Hotels",
    excerpt:
      "The Pacific coast from above and at eye level, for a hotel group's new coastal lodges.",
    cover: "coast" as const,
    gallery: ["coast", "beach", "ocean", "cliffs"] as const,
  },
  {
    slug: "field-studies",
    title: "Field Studies",
    year: 2024,
    client: "Exhibition, Lowry Gallery",
    excerpt: "Meadows, back roads and wildflowers from a summer spent driving the high plains.",
    cover: "meadow" as const,
    gallery: ["meadow", "poppies", "hills", "road"] as const,
  },
];

/** Turn a one-block stack section into an edge-to-edge grid section (no side gutters). */
function fullBleed(s: Section): Section {
  const [only] = s.blocks;
  if (!only || s.blocks.length !== 1) throw new Error("fullBleed expects one block");
  s.layout = grid(
    [[only, r(1, 1, 24, 30, { bleed: "both" }), r(1, 1, 8, 12, { bleed: "both" })]],
    "full",
  ).layout;
  return s;
}

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Elias Varga photographs landscapes and architecture in quiet light. Portfolio, commissions and limited-edition prints from Denver.",
    [
      fullBleed(
        fromPreset("gallery/slideshow@1", {
          style: { padding: { d: "none", m: "none" } },
          edit: {
            gallery: {
              images: [
                {
                  image: photo(
                    "lake",
                    1440,
                    "3:2",
                    "A rowing boat on a turquoise lake below jagged peaks, from Cordillera",
                  ),
                },
                {
                  image: photo(
                    "poolHouse",
                    1440,
                    "3:2",
                    "A white modernist villa and its pool among palms, from White City",
                  ),
                },
                {
                  image: photo(
                    "beach",
                    1440,
                    "3:2",
                    "Low waves washing onto an empty beach at sunset, from Salt & Glass",
                  ),
                },
                {
                  image: photo(
                    "hills",
                    1440,
                    "3:2",
                    "Rolling green hills catching the evening light, from Field Studies",
                  ),
                },
                {
                  image: photo(
                    "valley",
                    1440,
                    "3:2",
                    "A misty river valley with pines at dawn, from Cordillera",
                  ),
                },
              ],
              lightbox: true,
            },
          },
        }),
      ),
      fromPreset("hero/big-type@1", {
        edit: {
          heading: {
            eyebrow: "Elias Varga · Photographer",
            text: "Land, light and the buildings between",
          },
          text: {
            content: rt.doc(
              rt.p(
                "Landscape and architecture photography for publishers, architects and hotels, made slowly and printed by hand in my Denver studio.",
                "lead",
              ),
            ),
          },
          button: {
            label: "See the work",
            link: page(P.work),
            secondaryLabel: "Commission a series",
            secondaryLink: page(P.commissions),
          },
        },
      }),
      fromPreset("gallery/project-cards@1", {
        edit: {
          heading: { eyebrow: "Index", text: "Selected projects" },
          columns: {
            columns: "2",
            items: projects.map((p) => ({
              image: photo(p.cover, 620, "4:5", `${p.title}: ${p.excerpt.split(":")[0]}`),
              heading: p.title,
              body: body(`${p.client}, ${p.year}.`),
              link: item("projects", p.slug),
              linkLabel: "View project",
            })),
          },
        },
      }),
      fromPreset("testimonials/large-single@1", {
        theme: "dark",
        edit: {
          testimonial: {
            quote: rt.doc(
              rt.p(
                "Elias spent four days on a building we thought we knew, and found angles none of us had noticed in ten years. The book sold out in a month.",
              ),
            ),
            name: "Ingrid Halden",
            role: "Publisher, Halden Press",
            photo: photo("portraitNina", 160, "1:1", "Portrait of Ingrid Halden"),
          },
        },
      }),
      fromPreset("logos/row@1", {
        edit: {
          "logo-strip": {
            label: "Published and exhibited by",
            logos: [
              { name: "Halden Press" },
              { name: "Lowry Gallery" },
              { name: "Field & Form" },
              { name: "The Modern House Review" },
              { name: "Tidewater Hotels" },
            ],
          },
        },
      }),
      fromPreset("cta/split@1", {
        theme: "dark",
        edit: {
          heading: { eyebrow: "Commissions", text: "Booking spring 2027 commissions now" },
          button: {
            label: "Start a conversation",
            link: page(P.contact),
            note: "Architecture, hospitality and editorial.",
          },
        },
      }),
    ],
    { header: { transparentOnHero: false } },
  );
}

function work() {
  return makePage(
    P.work,
    "Work",
    "work",
    "The complete portfolio of Elias Varga: Cordillera, White City, Salt & Glass and Field Studies, plus selected single images.",
    [
      section(
        [
          heading("Work", {
            level: 1,
            size: "display",
            eyebrow: "Portfolio 2024–2026",
            sub: "Four long projects and a wall of single frames. Click any photograph to see it larger.",
          }),
        ],
        { width: "content" },
        { padding: { d: "xl", m: "lg" } },
      ),
      fromPreset("gallery/project-feature@1", {
        edit: {
          "image:1": {
            image: photo(
              "lake",
              1440,
              "original",
              "A rowing boat on a turquoise lake below jagged peaks",
            ),
          },
          text: {
            content: rt.doc(
              rt.p("Project · 2026", "eyebrow"),
              rt.h(2, "Cordillera", "h2"),
              rt.p(
                "Three winters above the treeline in the San Juan Mountains, waiting for the light to go flat and the colour to drain out of the snow.",
              ),
            ),
          },
          "image:2": {
            image: photo("valley", 520, "original", "Mist rising from a river valley at dawn"),
          },
          button: { label: "View the series", link: item("projects", "cordillera") },
        },
      }),
      fromPreset("gallery/masonry@1", {
        edit: {
          heading: { eyebrow: "Single frames", text: "From the contact sheets" },
          gallery: {
            images: [
              {
                image: photo(
                  "bridge",
                  460,
                  "original",
                  "A walker crossing a suspension bridge into the forest",
                ),
              },
              {
                image: photo(
                  "street",
                  460,
                  "original",
                  "A downtown street of tall buildings and yellow cabs",
                ),
              },
              {
                image: photo(
                  "road",
                  460,
                  "original",
                  "A desert road running toward red rock mountains",
                ),
              },
              {
                image: photo(
                  "forest",
                  460,
                  "original",
                  "Sunlight through tall trees onto a forest path",
                ),
              },
              {
                image: photo("poppies", 460, "original", "Orange poppies against a clear blue sky"),
              },
              {
                image: photo(
                  "city",
                  460,
                  "original",
                  "A city skyline stretching to the lake at golden hour",
                ),
              },
              {
                image: photo(
                  "hills",
                  460,
                  "original",
                  "Green hills from above, ridges catching the light",
                ),
              },
            ],
            lightbox: true,
          },
        },
      }),
    ],
  );
}

function commissions() {
  return makePage(
    P.commissions,
    "Commissions",
    "commissions",
    "Commission Elias Varga for architecture, hospitality and editorial photography, or buy a signed, limited-edition print.",
    [
      fromPreset("hero/split-landscape@1", {
        edit: {
          image: {
            image: photo(
              "poolHouse",
              760,
              "3:2",
              "A white villa with a pool framed by palms, shot for a hotel commission",
            ),
          },
          heading: {
            eyebrow: "Commissions & prints",
            text: "Photographs made for a place",
            subheading:
              "I take on six commissions a year, for architects, hotels and publishers who want their buildings and landscapes seen slowly and honestly.",
          },
          button: {
            label: "Enquire about a commission",
            link: page(P.contact),
            secondaryLabel: "Buy a print",
            secondaryLink: page(P.commissions, "prints"),
          },
        },
      }),
      fromPreset("services/steps@1", {
        edit: {
          heading: { eyebrow: "Working together", text: "How a commission runs" },
          columns: {
            items: [
              {
                heading: "A walk-through",
                body: body(
                  "We visit the site together, or talk it through on a call, and agree on the light and the shot list.",
                ),
              },
              {
                heading: "Days on location",
                body: body(
                  "I shoot over two to five days, returning at the hours the building or land looks its best.",
                ),
              },
              {
                heading: "Edit and delivery",
                body: body(
                  "Within three weeks you receive a tight, retouched edit and licensed files for print and web.",
                ),
              },
            ],
          },
          button: { label: "Ask about availability", link: page(P.contact) },
        },
      }),
      fromPreset("pricing/compact-list@1", {
        anchor: "prints",
        edit: {
          heading: { eyebrow: "Editions", text: "Signed prints" },
          pricing: {
            plans: [
              {
                name: "Small · 30 × 40 cm",
                price: "$340",
                period: "edition of 25",
                description: "Archival pigment print on cotton rag, signed and numbered.",
                features: [],
                buttonLabel: "Order a small print",
                link: page(P.contact),
                featured: false,
              },
              {
                name: "Large · 70 × 100 cm",
                price: "$1,200",
                period: "edition of 10",
                description: "Printed by hand in the studio and shipped flat in a crate.",
                features: [],
                buttonLabel: "Order a large print",
                link: page(P.contact),
                featured: false,
              },
              {
                name: "Framed · 70 × 100 cm",
                price: "$1,750",
                period: "edition of 10",
                description: "Oak frame with museum glass, delivered within the continental US.",
                features: [],
                buttonLabel: "Order framed",
                link: page(P.contact),
                featured: false,
              },
            ],
            note: "Every print comes with a certificate of authenticity. Prices include shipping in the US.",
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
    "Elias Varga grew up in the Front Range and trained as an architect before turning to photography. Biography, press and clients.",
    [
      fromPreset("about/story-split@1", {
        edit: {
          image: {
            image: photo("portraitTheo", 520, "4:5", "Portrait of the photographer Elias Varga"),
          },
          heading: { eyebrow: "About", text: "Elias Varga", level: "h1", size: "h1" },
          text: {
            content: rt.doc(
              rt.p(
                "I grew up in Golden, Colorado, and spent my twenties drawing buildings for an architecture firm in Chicago. Photography started as a way to remember the places I was drawing. It became the work when I realised I cared more about how light moved across a wall than about the wall itself.",
              ),
              rt.p(
                "Since 2016 I have photographed mountains, coastlines and modernist buildings for publishers, architects and a handful of hotels. I shoot slowly, mostly on a large-format camera, and print every edition by hand in my studio in RiNo.",
              ),
            ),
          },
          button: { label: "Get in touch", link: page(P.contact), role: "secondary" },
        },
      }),
      fromPreset("about/milestones@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Selected",
            text: "Exhibitions & books",
            subheading: "Solo shows, publications and awards since 2018.",
          },
          timeline: {
            items: [
              {
                date: "2026",
                title: "Cordillera",
                text: "Solo exhibition at the Lowry Gallery, Denver, with a limited-run catalogue.",
              },
              {
                date: "2025",
                title: "White City",
                text: "Monograph published by Halden Press; shortlisted for the Field & Form book prize.",
              },
              {
                date: "2023",
                title: "Coastlines",
                text: "Group show at the Kessler Foundation for Photography, Portland.",
              },
              {
                date: "2018",
                title: "First commission",
                text: "Twelve modernist houses in Palm Springs for The Modern House Review.",
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
    "Contact Elias Varga about commissions, print sales, licensing and exhibitions. The studio replies within two working days.",
    [
      fromPreset("contact/form-split@1", {
        edit: {
          heading: {
            eyebrow: "Contact",
            text: "Tell me about the place",
            level: "h1",
            subheading:
              "Commissions, licensing and print orders all start here. I reply personally within two working days.",
          },
          "contact-info": {
            name: "Elias Varga Studio",
            address: "3301 Walnut Street, Studio 12\nDenver, CO 80205",
            phone: "+1 (720) 555-0131",
            email: EMAIL,
          },
          form: {
            form: {
              id: formId(),
              name: "Studio enquiry",
              fields: [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "type",
                  label: "Enquiry",
                  width: "full",
                  options: ["Commission", "Print order", "Image licensing", "Exhibition or press"],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Tell me more",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send enquiry",
              success: {
                type: "message",
                message: "Thank you. I'll be in touch within two working days.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

export const atelier: TemplateSpec = {
  id: T,
  name: "Atelier",
  description:
    "A gallery-first portfolio for photographers and visual artists: a full-bleed slideshow, a project index and lightboxes, with chrome that stays out of the way.",
  persona: "Photographers, visual artists",
  mood: "Gallery-first, minimal chrome",
  tags: ["portfolio", "photography", "art", "gallery", "prints"],
  sample: { name: "Elias Varga", tagline: "Land, light and the buildings between." },
  thumbnail: P.home,
  looks: [
    {
      id: "monochrome",
      name: "Monochrome",
      description:
        "Ink and white with a single vermilion accent, Instrument Serif headings and square corners.",
      choices: {
        palette: {
          brand: "oklch(0.25 0 0)",
          neutral: "pure",
          contrast: "standard",
          source: "curated",
        },
        pairing: "instrument",
        density: "airy",
        shape: "sharp",
        buttons: "text-arrow",
        motion: "subtle",
        imageTreatment: "none",
      },
      overrides: { color: { accent: { $value: "oklch(0.56 0.2 32)", $type: "color" } } },
    },
    {
      id: "gallery-blue",
      name: "Gallery Blue",
      description:
        "Cool greys with a deep ultramarine accent, Bodoni headings and outlined buttons.",
      choices: {
        palette: {
          brand: "oklch(0.42 0.18 268)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "bodoni-montserrat",
        density: "airy",
        shape: "sharp",
        buttons: "outline",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "darkroom",
      name: "Darkroom",
      description: "Warm, print-like neutrals and EB Garamond for an archival, darkroom feel.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.05 60)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "eb-garamond-inter",
        density: "comfortable",
        shape: "soft",
        buttons: "underline",
        motion: "subtle",
        imageTreatment: "frame",
      },
    },
  ],
  build() {
    return {
      site: {
        title: "Elias Varga",
        tagline: "Land, light and the buildings between.",
        nav: [
          { type: "page", page: P.work, label: "Work" },
          { type: "collection", collection: "projects", label: "Projects" },
          { type: "page", page: P.commissions, label: "Commissions" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
        ],
        header: headerFrom("header/minimal@1", { sticky: false }),
        footer: fromPreset("footer/minimal-row@1", {
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(
                  "© 2026 Elias Varga. All photographs are the property of the artist.",
                  "small",
                ),
              ),
            },
            "text:2": {
              content: rt.doc(
                rt.p(
                  [
                    rt.link("Instagram", "https://instagram.com/eliasvarga.example"),
                    " · ",
                    rt.link("Email", `mailto:${EMAIL}`),
                    " · ",
                    rt.link("Prints", href("commissions", "prints")),
                  ],
                  "small",
                ),
              ),
            },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/eliasvarga.example" },
          { network: "behance", url: "https://behance.net/eliasvarga-example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Elias Varga, photographer",
          description: "Landscape and architecture photography by Elias Varga, Denver.",
          image: photoUrl("mountainLake", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), work(), commissions(), about(), contact()],
      collectionConfigs: {
        projects: {
          kind: "portfolio",
          label: "Projects",
          itemLabel: "Project",
          list: { layout: "grid", pageSize: 24, sort: "date-desc" },
          itemPage: { layout: "gallery" },
        },
      },
      collections: {
        projects: projects.map((p) =>
          project(
            p.slug,
            {
              title: p.title,
              date: `${p.year}-06-01`,
              year: p.year,
              client: p.client,
              role: "Photography",
              excerpt: p.excerpt,
              image: photoUrl(p.cover, 1600),
              imageAlt: `${p.title}, cover photograph`,
              gallery: p.gallery.map((k) => photo(k, 1200)),
            },
            `${p.excerpt}\n\nShot on large-format film and printed in the studio. Prints from this series are available in editions of 25 and 10.\n`,
          ),
        ),
      },
    };
  },
};
