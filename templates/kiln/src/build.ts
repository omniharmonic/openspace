import type { TemplateSpec } from "../../lib/define";
import { event, product } from "../../lib/define";
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
 * Kiln — makers and small shops (doc 04 §7). Tactile and crafted: Gloock / Albert Sans in clay,
 * bone and charcoal; a product grid, the maker's story and weekend workshops. (Checkout arrives
 * with commerce in Phase 5; products already show prices and options.)
 *
 * Demo owner: Saltmarsh Pottery, Wren Adeyemi's studio in a converted boatshed in Mystic,
 * Connecticut.
 */

const T = "kiln";
const PAGES = definePages(T, {
  home: "",
  workshops: "workshops",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Saltmarsh Pottery";
const EMAIL = "studio@saltmarshpottery.example";
const ADDRESS = "12 Holmes Street\nMystic, CT 06355";

const usd = (dollars: number) => ({ amount: dollars * 100, currency: "USD" });

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Saltmarsh Pottery makes wheel-thrown stoneware in a boatshed in Mystic, Connecticut. Shop vases, cups and planters, or join a workshop.",
    [
      fromPreset("hero/collage@1", {
        edit: {
          "image:1": {
            image: photo(
              "pottery",
              640,
              "original",
              "Handmade stoneware vases in soft clay colours on a studio shelf",
            ),
          },
          "image:2": {
            image: photo(
              "plantPot",
              380,
              "original",
              "A small cactus in one of our terracotta planters",
            ),
          },
          heading: {
            eyebrow: "Stoneware · Mystic, Connecticut",
            text: "Pots for everyday rituals",
            subheading:
              "Cups, vases and planters thrown by hand in a boatshed by the river, glazed in colours borrowed from the salt marsh at low tide.",
          },
          button: {
            label: "Shop the latest firing",
            link: url(collectionPath("shop")),
            secondaryLabel: "Weekend workshops",
            secondaryLink: page(P.workshops),
          },
        },
      }),
      fromPreset("products/grid@1", {
        edit: {
          summary: {
            heading: "Fresh from the kiln",
            source: { collection: "shop", sort: "date-desc", limit: 8 },
            columns: "3",
            linkLabel: "Shop everything",
            link: url(collectionPath("shop")),
            emptyMessage:
              "The next firing is cooling. New pieces arrive on the first Friday of the month.",
          },
        },
      }),
      fromPreset("about/workshop-layers@1", {
        theme: "light-accent",
        edit: {
          "image:1": {
            image: photo(
              "ceramics",
              640,
              "original",
              "Three matte grey bud vases with dried stems",
            ),
          },
          "image:2": {
            image: photo("pottery", 360, "original", "Glazed vases drying on the studio shelf"),
          },
          heading: { eyebrow: "The studio", text: "Made slowly, a few at a time" },
          text: {
            content: rt.doc(
              rt.p(
                "Every piece is thrown, trimmed and glazed by Wren in a 1920s boatshed on the Mystic River. Glazes are mixed in small batches from local clay and wood ash, so no two firings come out of the kiln quite alike.",
              ),
            ),
          },
          button: { label: "Read the maker's story", link: page(P.about) },
        },
      }),
      fromPreset("products/story-overlap@1", {
        theme: "light",
        edit: {
          image: {
            image: photo(
              "coffeeTable",
              600,
              "original",
              "Two of our morning cups on a small table with herbs",
            ),
          },
          text: {
            content: rt.doc(
              rt.p("Bestseller", "eyebrow"),
              rt.h(2, "The morning cup", "h2"),
              rt.p(
                "Shaped to fit two hands on a cold morning, with a thumb rest and a foot left raw so you can feel the clay. Holds a generous flat white. Dishwasher safe, though it would prefer a sink.",
              ),
            ),
          },
          product: {
            product: { collection: "shop", items: ["morning-cup-pair"] },
            buttonLabel: "Add to cart",
            detailsLabel: "See details",
          },
        },
      }),
      fromPreset("events/cards@1", {
        theme: "light-accent",
        collection: "classes",
        edit: {
          events: {
            heading: "Weekend workshops",
            source: { collection: "classes", filter: { upcoming: true }, limit: 4 },
            registerLabel: "Book a place",
            emptyMessage:
              "New workshop dates are posted each season. Join the newsletter to hear first.",
          },
        },
      }),
      fromPreset("testimonials/three-cards@1", {
        theme: "light",
        edit: {
          heading: { eyebrow: "Kind words", text: "From people who use them daily" },
          "testimonial:1": {
            quote: rt.doc(
              rt.p(
                "My morning cup is the first thing I reach for every day. It feels like it was made for my hands.",
              ),
            ),
            name: "Elise Thornton",
            role: "Customer, Providence",
            photo: photo("portraitClara", 120, "1:1", "Portrait of Elise Thornton"),
          },
          "testimonial:2": {
            quote: rt.doc(
              rt.p(
                "The wheel workshop was the best Saturday I've had in years. I came home with two wobbly bowls I love.",
              ),
            ),
            name: "Ben Akintola",
            role: "Workshop student",
            photo: photo("portraitSam", 120, "1:1", "Portrait of Ben Akintola"),
          },
          "testimonial:3": {
            quote: rt.doc(
              rt.p(
                "We stock Saltmarsh planters in both our shops and they sell out within a week of every firing.",
              ),
            ),
            name: "Hana Morioka",
            role: "Owner, Fern & Field",
            photo: photo("portraitAna", 120, "1:1", "Portrait of Hana Morioka"),
          },
        },
      }),
    ],
  );
}

function workshops() {
  return makePage(
    P.workshops,
    "Workshops",
    "workshops",
    "Weekend pottery workshops at Saltmarsh Pottery in Mystic: wheel throwing for beginners, hand-building and glazing. Six places per class.",
    [
      fromPreset("hero/split-image@1", {
        edit: {
          heading: {
            eyebrow: "Workshops",
            text: "Get your hands in the clay",
            subheading:
              "Small weekend workshops in the boatshed, for complete beginners and anyone who misses the wheel. Six students, all materials and two firings included.",
          },
          button: {
            label: "See upcoming dates",
            link: url(collectionPath("classes")),
            secondaryLabel: "Private groups",
            secondaryLink: page(P.contact),
            note: "Gift vouchers available for any workshop.",
          },
          image: {
            image: photo(
              "pottery",
              600,
              "4:5",
              "Finished pieces from a weekend workshop on the shelf",
            ),
          },
        },
      }),
      fromPreset("events/list@1", {
        collection: "classes",
        edit: {
          events: {
            heading: "Upcoming workshops",
            source: { collection: "classes", filter: { upcoming: true }, limit: 8 },
            registerLabel: "Book a place",
            emptyMessage: "New workshop dates are posted each season.",
          },
        },
      }),
      fromPreset("services/steps@1", {
        edit: {
          heading: { eyebrow: "What to expect", text: "From lump of clay to finished pot" },
          columns: {
            items: [
              {
                heading: "Saturday: make",
                body: body(
                  "Wedge, centre and throw on the wheel, with plenty of help. Most people make three to five pieces.",
                ),
              },
              {
                heading: "Sunday: trim",
                body: body(
                  "Come back the next morning to trim your favourites and add handles or carved details.",
                ),
              },
              {
                heading: "Three weeks later: collect",
                body: body(
                  "Choose a glaze; Wren fires everything twice and lets you know when your pots are ready.",
                ),
              },
            ],
          },
          button: { label: "Book a workshop", link: url(collectionPath("classes")) },
        },
      }),
      fromPreset("faq/centered@1", {
        edit: {
          heading: { eyebrow: "Workshops", text: "Good to know" },
          accordion: {
            items: [
              {
                question: "I've never touched clay. Is that OK?",
                answer: body(
                  "Completely. Most of our students are beginners, and the first hour is all about centring.",
                ),
              },
              {
                question: "What should I wear?",
                answer: body(
                  "Clothes you don't mind getting muddy and short nails. Aprons and towels are provided.",
                ),
              },
              {
                question: "Can I book the studio for a group?",
                answer: body(
                  "Yes, for four to eight people on weekday evenings. Write to us with a date in mind.",
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
    "Wren Adeyemi founded Saltmarsh Pottery in 2017 in a 1920s boatshed in Mystic. The story of the studio, the clay and the glazes.",
    [
      fromPreset("about/story-split@1", {
        edit: {
          image: {
            image: photo(
              "portraitOwen",
              520,
              "4:5",
              "Portrait of Wren Adeyemi, potter and founder of Saltmarsh",
            ),
          },
          heading: { eyebrow: "The maker", text: "Hello, I'm Wren", level: "h1", size: "h1" },
          text: {
            content: rt.doc(
              rt.p(
                "I learned to throw at a night class in New Haven when I was forty-three, after twenty years as a school librarian. Within a year I'd bought a second-hand wheel; within three, I'd given notice and rented a leaking boatshed on the Mystic River.",
              ),
              rt.p(
                "Saltmarsh Pottery has lived there since 2017. I make everything myself, fire the kiln about once a month and mix glazes from wood ash, local clay and a lot of trial and error. The colours come from the marsh outside the window: oyster grey, cordgrass green, the rust of old mooring chains.",
              ),
            ),
          },
          button: { label: "Visit the studio", link: page(P.contact), role: "secondary" },
        },
      }),
      fromPreset("about/values@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "How it's made",
            text: "Small batches, honest materials",
            subheading: "A few promises that shape every piece that leaves the studio.",
          },
          "icon-list": {
            items: [
              {
                icon: "leaf",
                title: "Local clay and ash",
                text: "Clay from a Connecticut supplier and wood ash from our own stove, so glazes are truly local.",
              },
              {
                icon: "recycle",
                title: "Nothing wasted",
                text: "Trimmings and seconds are reclaimed and rethrown; broken pieces become garden mosaics.",
              },
              {
                icon: "package",
                title: "Packed by hand",
                text: "Every order ships in recycled paper and straw, with a note about the firing it came from.",
              },
            ],
          },
        },
      }),
      fromPreset("gallery/mosaic@1", {
        edit: {
          "image:1": { image: photo("pottery", 640, "original", "A shelf of finished vases") },
          "image:2": {
            image: photo("ceramics", 320, "original", "Grey bud vases with dried stems"),
          },
          "image:3": {
            image: photo("plantPot", 320, "original", "A terracotta planter with a cactus"),
          },
          "image:4": {
            image: photo("succulent", 320, "original", "A mint-glazed planter with a succulent"),
          },
          "image:5": {
            image: photo("coffeeTable", 320, "original", "Morning cups on a small table"),
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
    "Visit Saltmarsh Pottery at 12 Holmes Street, Mystic. Studio hours, wholesale enquiries, commissions and private workshops.",
    [
      fromPreset("contact/form-split@1", {
        edit: {
          heading: {
            eyebrow: "Contact",
            text: "Visit, commission or stock our work",
            level: "h1",
            subheading:
              "The studio is open on Saturdays, and by appointment. For wholesale, commissions or private workshops, write below.",
          },
          "contact-info": {
            name: NAME,
            address: ADDRESS,
            phone: "+1 (860) 555-0174",
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
                  name: "topic",
                  label: "Enquiry",
                  width: "full",
                  options: [
                    "An order",
                    "Wholesale",
                    "Commission",
                    "Private workshop",
                    "Something else",
                  ],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Message",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send",
              success: {
                type: "message",
                message:
                  "Thank you! Wren replies within three working days, usually from the studio.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
      fromPreset("contact/location@1", {
        edit: {
          map: {
            name: NAME,
            address: "12 Holmes Street, Mystic, CT 06355",
            latitude: 41.3543,
            longitude: -71.9665,
          },
          heading: { eyebrow: "Visit", text: "Studio hours" },
          hours: {
            rows: [
              { day: "mon", closed: true },
              { day: "tue", closed: true },
              { day: "wed", closed: true },
              { day: "thu", opens: "12:00", closes: "17:00", closed: false },
              { day: "fri", opens: "12:00", closes: "17:00", closed: false },
              { day: "sat", opens: "10:00", closes: "16:00", closed: false },
              { day: "sun", closed: true },
            ],
            note: "Closed on firing days; check Instagram before a long drive. Free parking by the boat ramp.",
          },
          "contact-info": { address: ADDRESS, phone: "+1 (860) 555-0174", email: EMAIL },
        },
      }),
    ],
  );
}

const pot = (
  slug: string,
  title: string,
  price: number,
  key: Parameters<typeof photo>[0],
  alt: string,
  excerpt: string,
  text: string,
  options?: { name: string; values: string[] }[],
) =>
  product(
    slug,
    {
      title,
      price: usd(price),
      sku: `SMP-${slug.toUpperCase().replace(/-/g, "").slice(0, 10)}`,
      image: photoUrl(key, 1200),
      imageAlt: alt,
      images: [photo(key, 800, "4:5", alt)],
      excerpt,
      ...(options ? { options } : {}),
    },
    text,
  );

export const kiln: TemplateSpec = {
  id: T,
  name: "Kiln",
  description:
    "A tactile, crafted site for makers and small shops: a product grid, the maker's story and weekend workshops, ready for checkout when commerce arrives.",
  persona: "Makers, small shops",
  mood: "Tactile, crafted",
  tags: ["shop", "maker", "ceramics", "products", "workshops", "craft"],
  sample: { name: NAME, tagline: "Pots for everyday rituals." },
  thumbnail: P.home,
  looks: [
    {
      id: "charcoal-clay",
      name: "Charcoal & Clay",
      description: "Fired clay against charcoal and bone, with Gloock headings and soft corners.",
      choices: {
        palette: {
          brand: "oklch(0.52 0.08 50)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "gloock-albert-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "grain",
      },
    },
    {
      id: "glaze",
      name: "Celadon",
      description: "A pale celadon glaze green with Alegreya and rounded shapes.",
      choices: {
        palette: {
          brand: "oklch(0.58 0.06 170)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "alegreya",
        density: "airy",
        shape: "round",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "workshop",
      name: "Workshop",
      description: "Ink black and raw terracotta with Josefin Sans, crisp and graphic.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.13 40)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "josefin-crimson",
        density: "comfortable",
        shape: "sharp",
        buttons: "outline",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Pots for everyday rituals.",
        nav: [
          { type: "collection", collection: "shop", label: "Shop" },
          { type: "page", page: P.workshops, label: "Workshops" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Visit" },
        ],
        announcement: {
          enabled: true,
          message: "The December firing opens in the shop on Friday the 4th at 10am.",
          link: url(collectionPath("shop")),
          dismissible: true,
        },
        header: headerFrom("header/split@1", { sticky: true }),
        footer: fromPreset("footer/newsletter@1", {
          edit: {
            newsletter: {
              heading: "News from the boatshed",
              description: "New firings, workshop dates and studio sales, about once a month.",
              buttonLabel: "Subscribe",
              successMessage: "Thank you! Check your inbox to confirm.",
            },
            "text:1": {
              content: rt.doc(
                ...linkColumn("Shop", [
                  ["All pottery", collectionPath("shop")],
                  ["Workshops", href("workshops")],
                  ["About", href("about")],
                ]),
              ),
            },
            "text:2": {
              content: rt.doc(
                rt.p("Visit", "eyebrow"),
                rt.p("12 Holmes Street, Mystic, Connecticut"),
                rt.p([rt.link(EMAIL, `mailto:${EMAIL}`)]),
                rt.p("© 2026 Saltmarsh Pottery", "small"),
              ),
            },
            "social-links": { profiles: [] },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/saltmarshpottery.example" },
          { network: "pinterest", url: "https://pinterest.com/saltmarshpottery-example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Saltmarsh Pottery",
          description: "Wheel-thrown stoneware from a boatshed in Mystic, Connecticut.",
          image: photoUrl("pottery", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), workshops(), about(), contact()],
      collectionConfigs: {
        shop: {
          kind: "products",
          label: "Shop",
          itemLabel: "Piece",
          list: { layout: "grid", pageSize: 24, sort: "manual" },
          itemPage: { layout: "split", showRelated: true },
        },
        classes: {
          kind: "events",
          label: "Workshop dates",
          itemLabel: "Workshop",
          list: { layout: "cards", pageSize: 12, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
      },
      collections: {
        shop: [
          pot(
            "tide-vase",
            "Tide vase",
            86,
            "pottery",
            "Tall stoneware vases in soft clay colours",
            "A tall, narrow vase in our oyster and rust glazes. Holds a single branch beautifully.",
            "Wheel-thrown stoneware, about 26 cm tall. Each vase is unique; colours vary from firing to firing.\n",
            [{ name: "Glaze", values: ["Oyster", "Rust"] }],
          ),
          pot(
            "ash-bud-vases",
            "Ash bud vases, set of three",
            64,
            "ceramics",
            "Three matte grey bud vases with dried stems",
            "Three small vases in a matte wood-ash glaze, for dried stems or a single flower.",
            "Each vase is 9 to 12 cm tall. The glaze is made with ash from the studio's own wood stove.\n",
          ),
          pot(
            "morning-cup-pair",
            "Morning cups, pair",
            58,
            "coffeeTable",
            "Two stoneware cups of coffee on a small table",
            "Two generous cups with a thumb rest and a raw clay foot. Holds a flat white.",
            "Sold as a pair. 300 ml each, dishwasher and microwave safe.\n",
            [{ name: "Glaze", values: ["Cordgrass", "Oyster", "Mixed"] }],
          ),
          pot(
            "harbor-planter",
            "Harbor planter",
            48,
            "plantPot",
            "A small cactus in a terracotta planter",
            "Unglazed terracotta outside, glazed inside, with a drainage hole and saucer.",
            "12 cm across. Comes with a matching saucer. Plant not included, though we'd love to see what you choose.\n",
          ),
          pot(
            "sea-glass-planter",
            "Sea-glass planter",
            52,
            "succulent",
            "A spiky succulent in a mint-glazed planter",
            "A low planter in our sea-glass glaze, perfect for succulents on a sunny sill.",
            "14 cm across, with a drainage hole. Glaze colour shifts from mint to pale blue.\n",
          ),
          pot(
            "walnut-step-stool",
            "Walnut step stool",
            220,
            "stool",
            "A simple wooden stool against a pale blue wall",
            "Made with our neighbour Tom Okafor, a woodworker two doors down. For reaching the top shelf.",
            "Solid black walnut with a hand-rubbed oil finish. 45 cm tall. Made to order in about three weeks.\n",
          ),
        ],
        classes: [
          event(
            "wheel-weekend-january",
            {
              title: "Wheel weekend for beginners",
              start: "2027-01-16T10:00:00-05:00",
              end: "2027-01-17T13:00:00-05:00",
              timezone: "America/New_York",
              location: { name: NAME, address: "12 Holmes Street, Mystic, CT" },
              registrationUrl: "https://saltmarshpottery.example/book/wheel-january",
              price: "$240, materials and firing included",
              image: photoUrl("pottery", 1600),
              imageAlt: "Stoneware vases on a studio shelf",
              excerpt:
                "Two mornings on the wheel: centring, throwing and trimming your first cups and bowls.",
            },
            "Six students, two wheels each hour, and all the clay you can use. Pieces are glazed and fired for you.\n",
          ),
          event(
            "hand-building-february",
            {
              title: "Hand-building: coil and slab",
              start: "2027-02-13T10:00:00-05:00",
              end: "2027-02-13T15:00:00-05:00",
              timezone: "America/New_York",
              location: { name: NAME, address: "12 Holmes Street, Mystic, CT" },
              registrationUrl: "https://saltmarshpottery.example/book/hand-building",
              price: "$140, lunch included",
              image: photoUrl("ceramics", 1600),
              imageAlt: "Matte grey vases with dried stems",
              excerpt:
                "Build a planter and a set of small dishes without a wheel. A gentle start for all ages.",
            },
            "Suitable for teenagers with an adult. We break for soup at noon.\n",
          ),
          event(
            "glaze-day-march",
            {
              title: "Glaze day: colours from the marsh",
              start: "2027-03-06T10:00:00-05:00",
              end: "2027-03-06T14:00:00-05:00",
              timezone: "America/New_York",
              location: { name: NAME, address: "12 Holmes Street, Mystic, CT" },
              registrationUrl: "https://saltmarshpottery.example/book/glaze-day",
              price: "$120",
              image: photoUrl("succulent", 1600),
              imageAlt: "A mint-glazed planter with a succulent",
              excerpt: "Mix and test your own ash glazes, and take home a box of test tiles.",
            },
            "For anyone who has thrown before. Bring three bisque-fired pieces, or buy some from the studio.\n",
          ),
          event(
            "spring-studio-sale",
            {
              title: "Spring studio sale",
              start: "2027-04-10",
              allDay: true,
              location: { name: NAME, address: "12 Holmes Street, Mystic, CT" },
              price: "Free entry",
              image: photoUrl("plantPot", 1600),
              imageAlt: "A terracotta planter with a cactus",
              excerpt:
                "Seconds, test pieces and one-offs at studio prices, plus cider by the river.",
            },
            "Open 9 to 4. Cash and cards welcome.\n",
          ),
        ],
      },
    };
  },
};
