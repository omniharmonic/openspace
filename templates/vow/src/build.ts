import type { TemplateSpec } from "../../lib/define";
import { pageId } from "../../lib/ids";
import {
  body,
  formId,
  fromPreset,
  headerFrom,
  makePage,
  page,
  photo,
  photoBackground,
  photoUrl,
  rt,
  url,
} from "../../lib/kit";

/**
 * Vow — weddings and celebrations (doc 04 §7). Romantic and refined: Cormorant Garamond / Jost
 * in linen, ink and dusty rose; a timeline of the day, an RSVP form, travel information and
 * registry links.
 *
 * Demo owners: Amara Osei and Theo Lindgren, marrying in Glen Ellen, California, in
 * September 2027.
 */

const T = "vow";
const P = {
  home: pageId(T, "home"),
  schedule: pageId(T, "schedule"),
  travel: pageId(T, "travel"),
  registry: pageId(T, "registry"),
  rsvp: pageId(T, "rsvp"),
  about: pageId(T, "about"),
};

const COUPLE = "Amara & Theo";
const VENUE = "Beltane Ranch, 11775 Sonoma Highway, Glen Ellen, CA 95442";

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Amara Osei and Theo Lindgren are getting married on September 18, 2027 in Glen Ellen, California. Details, travel and RSVP.",
    [
      fromPreset("hero/full-bleed-photo@1", {
        style: {
          background: photoBackground(
            photo(
              "weddingAisle",
              1440,
              "original",
              "A couple walking back down the aisle as guests cheer",
            ),
            0.5,
            [0.5, 0.5],
          ),
        },
        edit: {
          0: {
            eyebrow: "September 18, 2027 · Glen Ellen, California",
            text: "Amara & Theo are getting married",
            subheading:
              "We'd love you to spend a long weekend with us in Sonoma wine country: welcome drinks on Friday, the wedding on Saturday and a slow brunch on Sunday.",
          },
          1: {
            label: "RSVP",
            link: page(P.rsvp),
            secondaryLabel: "The weekend",
            secondaryLink: page(P.schedule),
          },
        },
      }),
      fromPreset("cta/countdown@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "Save the date",
            text: "Counting down to the big day",
            subheading:
              "The ceremony begins at 4pm under the old oak at Beltane Ranch. Please reply by July 1, 2027.",
          },
          1: {
            target: "2027-09-18T16:00:00-07:00",
            doneMessage: "We're married! Thank you for celebrating with us.",
            headingLevel: "h3",
          },
          2: { label: "Reply to the invitation", link: page(P.rsvp) },
        },
      }),
      fromPreset("about/story-split@1", {
        edit: {
          0: {
            image: photo(
              "weddingHands",
              520,
              "4:5",
              "Amara and Theo's hands with their rings, resting on a bouquet",
            ),
          },
          1: { eyebrow: "Our story", text: "A wrong train and a long conversation" },
          2: {
            content: rt.doc(
              rt.p(
                "We met in 2019 on the wrong train out of Oakland: Amara was heading to a job interview, Theo was heading home from a night shift, and both of us had misread the board. By the time we worked it out, we'd talked through four stops and missed two more.",
              ),
              rt.p(
                "Seven years, two apartments and one very opinionated cat later, Theo proposed on the same platform. We can't wait to celebrate with the people who made the years in between so good.",
              ),
            ),
          },
          3: { label: "Read our story", link: page(P.about), role: "secondary" },
        },
      }),
      fromPreset("features/icon-row@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "The weekend",
            text: "Three days in Sonoma",
            subheading:
              "Come for the wedding, or stay for all of it. Every event is at or near Beltane Ranch.",
          },
          1: {
            items: [
              {
                icon: "sun",
                title: "Friday welcome",
                text: "Drinks and pizza on the ranch porch from 6pm.",
              },
              {
                icon: "heart",
                title: "Saturday wedding",
                text: "Ceremony at 4pm, then dinner and dancing until late.",
              },
              {
                icon: "coffee",
                title: "Sunday brunch",
                text: "A slow goodbye with coffee and pastries, 10am to noon.",
              },
              {
                icon: "map-pin",
                title: "Getting there",
                text: "An hour north of San Francisco; shuttles run all weekend.",
              },
            ],
          },
        },
      }),
      fromPreset("cta/banner@1", {
        edit: {
          0: {
            text: "Kindly reply by July 1, 2027",
            subheading:
              "Let us know whether you can come, who's with you and what you'd like for dinner.",
          },
          1: {
            label: "RSVP now",
            link: page(P.rsvp),
            secondaryLabel: "Travel & stay",
            secondaryLink: page(P.travel),
          },
        },
      }),
    ],
  );
}

function schedule() {
  return makePage(
    P.schedule,
    "The weekend",
    "schedule",
    "The schedule for Amara and Theo's wedding weekend in Glen Ellen: welcome drinks, the ceremony and reception, and Sunday brunch.",
    [
      fromPreset("hero/centered@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "September 17 – 19, 2027",
            text: "The wedding weekend",
            subheading:
              "Everything happens at Beltane Ranch unless we say otherwise. Dress code for Saturday: garden formal, comfortable shoes for the lawn.",
          },
          1: {
            label: "RSVP",
            link: page(P.rsvp),
            secondaryLabel: "Travel & hotels",
            secondaryLink: page(P.travel),
          },
        },
      }),
      fromPreset("about/milestones@1", {
        edit: {
          0: {
            eyebrow: "Saturday, September 18",
            text: "The day",
            subheading: "A rough guide to the day. Shuttles leave the Glen Ellen hotels at 3:15pm.",
          },
          1: {
            variant: "alternating",
            items: [
              {
                date: "3:30 pm",
                title: "Arrive at the ranch",
                text: "Lemonade and iced tea under the walnut trees while everyone finds a seat.",
              },
              {
                date: "4:00 pm",
                title: "Ceremony under the oak",
                text: "A short, unplugged ceremony led by our friend Priya. Tissues provided.",
              },
              {
                date: "4:45 pm",
                title: "Cocktails on the lawn",
                text: "Local wine, a signature spritz and oysters while we take photos.",
              },
              {
                date: "6:30 pm",
                title: "Dinner in the barn",
                text: "A long-table, family-style supper from Ember & Vine, with toasts between courses.",
              },
              {
                date: "8:30 pm",
                title: "First dance, then everyone",
                text: "A live band until ten, then a DJ until the neighbours complain.",
              },
              {
                date: "11:30 pm",
                title: "Last shuttle",
                text: "Shuttles back to Glen Ellen and Sonoma leave every twenty minutes from 10pm.",
              },
            ],
          },
        },
      }),
      fromPreset("services/image-cards@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "Friday & Sunday",
            text: "Before and after",
            subheading: "Optional, relaxed and very much encouraged if you're in town.",
          },
          1: {
            items: [
              {
                image: photo(
                  "sharedTable",
                  420,
                  "4:5",
                  "Friends gathered around a long table outdoors",
                ),
                heading: "Friday welcome party",
                body: body(
                  "Wood-fired pizza and drinks on the ranch porch from 6pm. Come as you are.",
                ),
                link: page(P.travel),
                linkLabel: "Getting to the ranch",
              },
              {
                image: photo(
                  "weddingAisle",
                  420,
                  "4:5",
                  "Guests cheering as the couple walk down the aisle",
                ),
                heading: "Saturday wedding",
                body: body("Ceremony at 4pm, then cocktails, dinner in the barn and dancing."),
                link: page(P.schedule),
                linkLabel: "See the day",
              },
              {
                image: photo("coffeeTable", 420, "4:5", "Coffee cups on a small table with herbs"),
                heading: "Sunday brunch",
                body: body("Coffee, pastries and goodbyes from 10am to noon in the ranch garden."),
                link: page(P.rsvp),
                linkLabel: "Let us know you're coming",
              },
            ],
          },
        },
      }),
    ],
  );
}

function travel() {
  return makePage(
    P.travel,
    "Travel & stay",
    "travel",
    "How to get to Beltane Ranch in Glen Ellen, where to stay in Sonoma, our hotel room blocks and the wedding shuttle times.",
    [
      fromPreset("hero/split-landscape@1", {
        edit: {
          0: { image: photo("valley", 760, "3:2", "Morning mist over the valley near Glen Ellen") },
          1: {
            eyebrow: "Travel & stay",
            text: "Getting to Glen Ellen",
            subheading:
              "Beltane Ranch is an hour's drive north of San Francisco. Fly into SFO or Oakland, or into Santa Rosa (STS) for the shortest drive.",
          },
          2: {
            label: "Book a hotel",
            link: page(P.travel, "hotels"),
            secondaryLabel: "Shuttle times",
            secondaryLink: page(P.travel, "faq"),
          },
        },
      }),
      fromPreset("contact/two-locations@1", {
        theme: "light-accent",
        anchor: "hotels",
        edit: {
          0: { eyebrow: "Room blocks", text: "Where to stay" },
          1: {
            heading: "Glen Ellen Inn",
            address: "13670 Arnold Drive\nGlen Ellen, CA 95442",
            phone: "+1 (707) 555-0164",
            note: "Mention AMARA-THEO for our rate until July 1. Shuttle pick-up at the front door.",
          },
          2: {
            heading: "The Sonoma Plaza Hotel",
            address: "110 West Spain Street\nSonoma, CA 95476",
            phone: "+1 (707) 555-0192",
            note: "Book with code VOW27 by June 15. Twenty minutes from the ranch by shuttle.",
          },
        },
      }),
      fromPreset("faq/split@1", {
        anchor: "faq",
        edit: {
          0: { eyebrow: "Questions", text: "Good to know" },
          1: {
            content: rt.doc(
              rt.p("Anything else? Text Theo's sister Freya, our day-of coordinator."),
            ),
          },
          2: { label: "Send us a message", link: page(P.rsvp), role: "secondary" },
          3: {
            items: [
              {
                question: "Is there parking at the ranch?",
                answer: body(
                  "Very little, so please take the shuttle. It runs from both hotels from 3:15pm and back from 10pm.",
                ),
              },
              {
                question: "Are children invited?",
                answer: body(
                  "We love your kids, but Saturday is adults only. The hotels can recommend local sitters.",
                ),
              },
              {
                question: "What's the weather like in September?",
                answer: body(
                  "Warm days around 80°F and cool evenings. Bring a layer for after sunset.",
                ),
              },
              {
                question: "Can I bring a plus-one?",
                answer: body(
                  "If your invitation names a guest, yes! Their name will be on the RSVP form.",
                ),
              },
            ],
          },
        },
      }),
    ],
  );
}

function registry() {
  return makePage(
    P.registry,
    "Registry",
    "registry",
    "Gift registry for Amara and Theo: a honeymoon fund for Portugal, a small home registry and a charity close to our hearts.",
    [
      fromPreset("hero/centered@1", {
        edit: {
          0: {
            eyebrow: "Registry",
            text: "Your presence is the present",
            subheading:
              "Truly. But if you'd like to give something, we've put together a few ideas, including a fund for our honeymoon on the coast of Portugal.",
          },
          1: {
            label: "Honeymoon fund",
            link: url("https://honeyfund.example/amara-and-theo", true),
            secondaryLabel: "RSVP",
            secondaryLink: page(P.rsvp),
          },
        },
      }),
      fromPreset("services/image-cards@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "Gift ideas",
            text: "Three ways to give",
            subheading:
              "Every gift comes with a handwritten thank-you, probably late, definitely sincere.",
          },
          1: {
            items: [
              {
                image: photo("beach", 420, "4:5", "Waves washing onto an empty beach at sunset"),
                heading: "Honeymoon in Portugal",
                body: body(
                  "Two weeks on the Alentejo coast. Contribute a dinner, a surf lesson or a night by the sea.",
                ),
                link: url("https://honeyfund.example/amara-and-theo", true),
                linkLabel: "Visit our honeyfund",
              },
              {
                image: photo("kitchen", 420, "4:5", "A bright kitchen with pendant lights"),
                heading: "For our first home",
                body: body(
                  "A short list of things for the kitchen and garden of the house we're about to buy.",
                ),
                link: url("https://registry.example/amara-theo", true),
                linkLabel: "See the registry",
              },
              {
                image: photo("seedlings", 420, "4:5", "Seedlings sprouting in a tray of soil"),
                heading: "Plant a school garden",
                body: body(
                  "A gift to Oakland Grows, which builds gardens at the school where Amara teaches.",
                ),
                link: url("https://oaklandgrows.example/give", true),
                linkLabel: "Give to Oakland Grows",
              },
            ],
          },
        },
      }),
    ],
  );
}

function rsvp() {
  return makePage(
    P.rsvp,
    "RSVP",
    "rsvp",
    "RSVP for Amara and Theo's wedding on September 18, 2027. Please reply by July 1 with your meal choice and any dietary needs.",
    [
      fromPreset("contact/booking-request@1", {
        edit: {
          0: {
            eyebrow: "Kindly reply by July 1, 2027",
            text: "Will you celebrate with us?",
            level: "h1",
            subheading:
              "One reply per invitation, please. You can change your answer any time before July 1 by sending the form again.",
          },
          1: {
            form: {
              id: formId(),
              name: "RSVP",
              fields: [
                {
                  type: "text",
                  name: "name",
                  label: "Your name(s)",
                  required: true,
                  width: "half",
                },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "attending",
                  label: "Will you attend?",
                  required: true,
                  width: "half",
                  options: ["Joyfully accepts", "Regretfully declines"],
                },
                {
                  type: "select",
                  name: "guests",
                  label: "Number of guests",
                  width: "half",
                  options: ["1", "2"],
                },
                {
                  type: "select",
                  name: "dinner",
                  label: "Dinner choice",
                  width: "half",
                  options: [
                    "Grilled halibut",
                    "Braised short rib",
                    "Wild mushroom risotto (vegetarian)",
                  ],
                },
                {
                  type: "select",
                  name: "events",
                  label: "Also joining",
                  width: "half",
                  options: [
                    "Friday and Sunday",
                    "Friday welcome only",
                    "Sunday brunch only",
                    "Just the wedding",
                  ],
                },
                {
                  type: "text",
                  name: "dietary",
                  label: "Allergies or dietary needs",
                  width: "full",
                },
                {
                  type: "text",
                  name: "song",
                  label: "A song that will get you dancing",
                  width: "full",
                },
                { type: "textarea", name: "note", label: "A note for the couple", maxLength: 1000 },
              ],
              submitLabel: "Send RSVP",
              success: {
                type: "message",
                message: "Thank you! We've got your reply and can't wait to celebrate.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

function about() {
  return makePage(
    P.about,
    "Our story",
    "about",
    "How Amara Osei and Theo Lindgren met on the wrong train, and the friends and family standing with them on the day.",
    [
      fromPreset("about/story-editorial@1", {
        edit: {
          0: {
            eyebrow: "Our story",
            text: "Seven years and one wrong train",
            level: "h1",
            size: "h1",
          },
          1: {
            content: rt.doc(
              rt.p(
                "In March 2019, Amara boarded a train at Oakland's 12th Street station, sure it was going to Berkeley. Theo, coming home from a hospital night shift, was sure of the same thing. It was going to Richmond. By the time they realised, they had covered favourite books, terrible roommates and why anyone eats cereal for dinner.",
              ),
              rt.p(
                "Their first date was a week later, at a taco truck that has since closed and is still mourned. There followed two apartments, one adopted cat called Admiral, a lot of camping in the rain and a shared conviction that the best evenings involve a long table and too much food.",
              ),
              rt.p(
                "Theo proposed in April 2026 on the 12th Street platform, during the evening rush, with a ring hidden in a paperback. Amara said yes before he'd finished the question. We're so glad you're part of the story.",
              ),
            ),
          },
        },
      }),
      fromPreset("gallery/layered-pair@1", {
        theme: "light-accent",
        edit: {
          0: {
            image: photo(
              "weddingAisle",
              640,
              "original",
              "Walking back down the aisle at a friend's wedding",
            ),
          },
          1: { image: photo("weddingHands", 360, "original", "Rings resting on a bouquet") },
          2: { eyebrow: "The proposal", text: "Platform 2, rush hour" },
          3: {
            content: rt.doc(
              rt.p(
                "A paperback, a ring and a lot of very surprised commuters, who applauded when Amara said yes.",
              ),
            ),
          },
        },
      }),
      fromPreset("team/circles@1", {
        edit: {
          0: { eyebrow: "Standing with us", text: "The wedding party" },
          1: {
            people: [
              {
                name: "Priya Nair",
                role: "Officiant · Amara's oldest friend",
                photo: photo("portraitIris", 280, "1:1", "Portrait of Priya Nair"),
              },
              {
                name: "Freya Lindgren",
                role: "Best woman · Theo's sister",
                photo: photo("portraitClara", 280, "1:1", "Portrait of Freya Lindgren"),
              },
              {
                name: "Kwame Osei",
                role: "Man of honour · Amara's brother",
                photo: photo("portraitSam", 280, "1:1", "Portrait of Kwame Osei"),
              },
            ],
          },
        },
      }),
    ],
  );
}

export const vow: TemplateSpec = {
  id: T,
  name: "Vow",
  description:
    "A romantic, refined site for weddings and celebrations, with a countdown, a timeline of the day, travel and hotel details, registry links and an RSVP form.",
  persona: "Weddings, celebrations",
  mood: "Romantic, refined",
  tags: ["wedding", "rsvp", "celebration", "event", "travel", "registry"],
  sample: { name: COUPLE, tagline: "September 18, 2027 · Glen Ellen, California" },
  thumbnail: P.home,
  looks: [
    {
      id: "dusty-rose",
      name: "Dusty Rose",
      description: "Linen, ink and a muted rose, with Cormorant Garamond and airy spacing.",
      choices: {
        palette: {
          brand: "oklch(0.68 0.07 10)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "cormorant-jost",
        density: "airy",
        shape: "soft",
        buttons: "pill-outline",
        motion: "subtle",
        imageTreatment: "arch",
      },
    },
    {
      id: "garden",
      name: "Garden Party",
      description: "Soft sage with Playfair Display, for an outdoor, summery celebration.",
      choices: {
        palette: {
          brand: "oklch(0.6 0.06 140)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "playfair-source-sans",
        density: "airy",
        shape: "round",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "black-tie",
      name: "Black Tie",
      description: "Ink and champagne gold with Bodoni Moda, formal and elegant.",
      choices: {
        palette: {
          brand: "oklch(0.7 0.08 85)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "bodoni-montserrat",
        density: "comfortable",
        shape: "sharp",
        buttons: "outline",
        motion: "subtle",
        imageTreatment: "frame",
      },
    },
  ],
  build() {
    return {
      site: {
        title: COUPLE,
        tagline: "September 18, 2027 · Glen Ellen, California",
        nav: [
          { type: "page", page: P.about, label: "Our story" },
          { type: "page", page: P.schedule, label: "The weekend" },
          { type: "page", page: P.travel, label: "Travel" },
          { type: "page", page: P.registry, label: "Registry" },
          { type: "button", label: "RSVP", link: page(P.rsvp), style: "primary" },
        ],
        header: headerFrom("header/logo-above@1", { sticky: false }),
        footer: fromPreset("footer/centered@1", {
          edit: {
            0: {
              content: rt.doc(rt.p(COUPLE, "lead"), rt.p(`September 18, 2027 · ${VENUE}`, "small")),
            },
            1: { profiles: [] },
            2: {
              content: rt.doc(
                rt.p(
                  [
                    "Questions? Write to ",
                    rt.link("hello@amaraandtheo.example", "mailto:hello@amaraandtheo.example"),
                    " · ",
                    rt.link("RSVP", "/rsvp/"),
                  ],
                  "small",
                ),
              ),
            },
          },
        }),
        social: [{ network: "email", url: "mailto:hello@amaraandtheo.example" }],
        seo: {
          titleTemplate: "%s · Amara & Theo",
          description: "Amara and Theo's wedding, September 18, 2027, Glen Ellen, California.",
          image: photoUrl("weddingHands", 1200),
          noindex: false,
        },
        locale: "en-US",
        integrations: { analytics: false, bookingUrl: null, stripeConnected: false },
      },
      features: { analytics: false },
      pages: [home(), schedule(), travel(), registry(), rsvp(), about()],
    };
  },
};
