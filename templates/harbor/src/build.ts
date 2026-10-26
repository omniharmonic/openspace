import type { TemplateSpec } from "../../lib/define";
import { event, post } from "../../lib/define";
import {
  body,
  collectionPath,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  linkColumn,
  makePage,
  PHOTO_SCRIM,
  page,
  photo,
  photoBackground,
  photoUrl,
  rt,
  url,
} from "../../lib/kit";

/**
 * Harbor — nonprofits and community organisations (doc 04 §7). Trustworthy, warm, civic:
 * Newsreader / Public Sans in deep blue on warm paper with a signal-orange accent; an impact
 * stats band, a programs grid, an events list and a donate button that stays in the header.
 *
 * Demo owner: Riverbend Neighbors, a food, youth and home-repair nonprofit in Pittsburgh.
 */

const T = "harbor";
const PAGES = definePages(T, {
  home: "",
  programs: "programs",
  involved: "get-involved",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Riverbend Neighbors";
const ADDRESS = "3120 Penn Avenue\nPittsburgh, PA 15201";
const PHONE = "+1 (412) 555-0186";
const EMAIL = "hello@riverbendneighbors.example";

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Riverbend Neighbors runs a free grocery pantry, after-school tutoring and home repairs for older neighbors in Lawrenceville, Pittsburgh.",
    [
      fromPreset("hero/full-bleed-photo@1", {
        style: {
          background: photoBackground(
            photo(
              "friendsSunset",
              1440,
              "original",
              "Volunteers with their arms around each other at sunset",
            ),
            PHOTO_SCRIM,
            [0.5, 0.45],
          ),
        },
        edit: {
          heading: {
            eyebrow: "Lawrenceville, Pittsburgh · Since 2004",
            text: "Neighbors keeping neighbors fed and home",
            subheading:
              "Free groceries, homework help and safe repairs for older homeowners, run by 300 volunteers who live on the same streets.",
          },
          button: {
            label: "Donate today",
            link: page(P.involved, "donate"),
            secondaryLabel: "See our programs",
            secondaryLink: page(P.programs),
          },
        },
      }),
      fromPreset("stats/row@1", {
        edit: {
          heading: { eyebrow: "Our 2025 report", text: "One year on Penn Avenue" },
          stats: {
            items: [
              { value: "41,200", label: "Grocery visits" },
              { value: "318", label: "Volunteers" },
              { value: "146", label: "Homes made safe" },
              { value: "94¢", label: "Of each dollar spent on programs" },
            ],
          },
        },
      }),
      fromPreset("services/image-cards@1", {
        edit: {
          heading: {
            eyebrow: "What we do",
            text: "Three programs, one neighborhood",
            subheading:
              "Everything we run is free, open to anyone in the 15201 and 15224 zip codes, and shaped by the people who use it.",
          },
          columns: {
            items: [
              {
                image: photo(
                  "sharedTable",
                  420,
                  "4:5",
                  "Volunteers and neighbors talking over a long table",
                ),
                heading: "Penn Avenue Pantry",
                body: body(
                  "Fresh produce, dairy and staples three days a week, chosen like a grocery store. No paperwork, no questions.",
                ),
                link: page(P.programs, "pantry"),
                linkLabel: "Visit the pantry",
              },
              {
                image: photo(
                  "kidsSmiling",
                  420,
                  "4:5",
                  "Children grinning at the camera after homework club",
                ),
                heading: "Homework Harbor",
                body: body(
                  "After-school tutoring, a hot snack and a quiet table for 80 kids, every school day from 3 to 6.",
                ),
                link: page(P.programs),
                linkLabel: "About Homework Harbor",
              },
              {
                image: photo(
                  "porchHouse",
                  420,
                  "4:5",
                  "A white clapboard house with a porch after repairs",
                ),
                heading: "Safe at Home",
                body: body(
                  "Free ramps, railings, roof patches and furnace checks so older neighbors can stay in the houses they love.",
                ),
                link: page(P.programs, "repairs"),
                linkLabel: "Request a repair",
              },
            ],
          },
        },
      }),
      fromPreset("events/list@1", {
        theme: "light-accent",
        edit: {
          events: {
            heading: "Coming up in the neighborhood",
            registerLabel: "Sign up",
            emptyMessage: "New volunteer days are posted every month — check back soon.",
          },
        },
      }),
      fromPreset("testimonials/photo-overlap@1", {
        edit: {
          image: {
            image: photo(
              "gardenTrowel",
              960,
              "original",
              "Volunteer hands planting seedlings in the community garden",
            ),
          },
          testimonial: {
            quote: rt.doc(
              rt.p(
                "When my husband passed, I didn't know who to call about the furnace. Riverbend sent two volunteers that week, and they still check in every winter.",
              ),
            ),
            name: "Dolores Kaminski",
            role: "Safe at Home neighbor since 2019",
            photo: photo("portraitOwen", 160, "1:1", "Portrait of Dolores Kaminski"),
            rating: undefined,
          },
        },
      }),
      fromPreset("cta/donate@1", {
        edit: {
          heading: { eyebrow: "Give", text: "Keep the pantry shelves full" },
          text: {
            content: rt.doc(
              rt.p(
                "Every week we welcome more than 800 families. $40 stocks one family's groceries for a week, and a monthly gift lets us buy fresh produce from local farms at wholesale prices.",
              ),
            ),
          },
          donation: {
            amounts: [{ amount: 20 }, { amount: 40 }, { amount: 100 }, { amount: 250 }],
            buttonLabel: "Give now",
            note: "Riverbend Neighbors is a 501(c)(3). Gifts are tax-deductible; your receipt arrives by email.",
          },
        },
      }),
    ],
  );
}

function programs() {
  return makePage(
    P.programs,
    "Programs",
    "programs",
    "Free groceries at the Penn Avenue Pantry, after-school tutoring at Homework Harbor and home repairs through Safe at Home.",
    [
      fromPreset("hero/split-landscape@1", {
        edit: {
          image: {
            image: photo(
              "kidsSmiling",
              760,
              "3:2",
              "Children at Homework Harbor making peace signs",
            ),
          },
          heading: {
            eyebrow: "Programs",
            text: "Help that starts with listening",
            subheading:
              "Each program began when neighbors told us what was missing. They're all free, and most are run by people who once used them.",
          },
          button: {
            label: "Volunteer with us",
            link: page(P.involved),
            secondaryLabel: "Ask for help",
            secondaryLink: page(P.contact),
          },
        },
      }),
      fromPreset("services/alternating@1", {
        anchor: "pantry",
        edit: {
          "image:1": {
            image: photo(
              "sharedTable",
              640,
              "original",
              "Neighbors chatting at a long table at the pantry",
            ),
          },
          "text:1": {
            content: rt.doc(
              rt.p("Tuesday, Thursday & Saturday", "eyebrow"),
              rt.h(2, "Penn Avenue Pantry", "h2"),
              rt.p(
                "A choice pantry set up like a small grocery store, with fresh produce from three local farms, milk, eggs and pantry staples. Bring a bag; we'll bring the coffee.",
              ),
              rt.p([rt.link("Pantry hours and address →", href("contact"))]),
            ),
          },
          "image:2": {
            image: photo(
              "kidsSmiling",
              640,
              "original",
              "Kids from Homework Harbor smiling together",
            ),
          },
          "text:2": {
            content: rt.doc(
              rt.p("School days, 3–6pm", "eyebrow"),
              rt.h(2, "Homework Harbor", "h2"),
              rt.p(
                "Volunteer tutors, a hot snack and a calm place to work for students in grades 3 to 8. Parents can pick up groceries from the pantry on the same visit.",
              ),
              rt.p([rt.link("Enroll a student →", href("contact"))]),
            ),
          },
        },
      }),
      fromPreset("services/steps@1", {
        anchor: "repairs",
        edit: {
          heading: { eyebrow: "Safe at Home", text: "How a free repair works" },
          columns: {
            items: [
              {
                heading: "Call or write to us",
                body: body(
                  "Tell us what needs fixing. Homeowners aged 62 and over, or living with a disability, qualify.",
                ),
              },
              {
                heading: "A volunteer visits",
                body: body(
                  "A licensed contractor from our crew looks at the job and explains what we can do, usually within two weeks.",
                ),
              },
              {
                heading: "We fix it, free",
                body: body(
                  "Ramps, rails, roofs and furnaces are repaired by volunteers, with materials paid for by donors.",
                ),
              },
            ],
          },
          button: { label: "Request a repair", link: page(P.contact) },
        },
      }),
      fromPreset("faq/split@1", {
        edit: {
          heading: { eyebrow: "Questions", text: "Getting help" },
          text: {
            content: rt.doc(
              rt.p(
                "Not sure if a program is right for you? Call the front desk and we'll talk it through.",
              ),
            ),
          },
          button: { label: "Contact us", link: page(P.contact) },
          accordion: {
            items: [
              {
                question: "Do I need ID or proof of income for the pantry?",
                answer: body(
                  "No. Just give us your first name and zip code so we can plan how much food to order.",
                ),
              },
              {
                question: "Is there a cost for Homework Harbor?",
                answer: body(
                  "Never. Snacks, supplies and tutoring are free for every student who enrolls.",
                ),
              },
              {
                question: "Can renters ask for repairs?",
                answer: body(
                  "Safe at Home is for homeowners, but we'll connect renters with the tenants' union and city inspectors.",
                ),
              },
              {
                question: "Do you offer help in other languages?",
                answer: body(
                  "Volunteers speak Spanish, Nepali and Arabic on pantry days, and we can arrange interpreters for repair visits.",
                ),
              },
            ],
          },
        },
      }),
    ],
  );
}

function involved() {
  return makePage(
    P.involved,
    "Get involved",
    "get-involved",
    "Donate, volunteer or join a committee at Riverbend Neighbors. Monthly gifts keep the pantry stocked and the repair crew on the road.",
    [
      fromPreset("hero/centered@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Get involved",
            text: "There's a place for you here",
            subheading:
              "Give once or every month, spend a Saturday morning at the pantry, or lend your skills to the repair crew. Every hour and every dollar stays in the neighborhood.",
          },
          button: {
            label: "Donate",
            link: page(P.involved, "donate"),
            secondaryLabel: "Volunteer",
            secondaryLink: page(P.involved, "volunteer"),
          },
        },
      }),
      fromPreset("cta/donate@1", {
        theme: "light",
        anchor: "donate",
        edit: {
          heading: { eyebrow: "Donate", text: "A monthly gift goes furthest" },
          text: {
            content: rt.doc(
              rt.p(
                "Monthly donors let us buy produce in bulk, plan repair crews a season ahead and say yes when a family needs us. Choose an amount and how often to give.",
              ),
            ),
          },
          donation: {
            amounts: [{ amount: 15 }, { amount: 40 }, { amount: 75 }, { amount: 150 }],
            buttonLabel: "Donate",
            note: "Secure checkout. You can change or cancel a monthly gift any time.",
          },
        },
      }),
      fromPreset("cta/card-over-photo@1", {
        anchor: "volunteer",
        edit: {
          image: {
            image: photo(
              "friendsSunset",
              1100,
              "original",
              "Volunteers with their arms around each other at sunset",
            ),
          },
          text: {
            content: rt.doc(
              rt.h(2, "Spend a Saturday with us", "h2"),
              rt.p(
                "Stock shelves, drive deliveries, tutor a fourth grader or swing a hammer. Training is provided, and lunch is on us.",
              ),
            ),
          },
          button: { label: "Sign up to volunteer", link: page(P.contact) },
        },
      }),
      fromPreset("faq/cards@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Giving", text: "Questions donors ask" },
          accordion: {
            items: [
              {
                question: "How much of my gift goes to programs?",
                answer: body(
                  "94 cents of every dollar. Our annual report and audited accounts are on the About page.",
                ),
              },
              {
                question: "Can I give in honor of someone?",
                answer: body(
                  "Yes. Add their name at checkout and we'll send a card to them or their family.",
                ),
              },
              {
                question: "Do you accept food donations?",
                answer: body(
                  "Fresh produce, yes, on pantry mornings. For packaged food, a cash gift buys about three times as much.",
                ),
              },
            ],
          },
          button: {
            label: "Talk to our development team",
            link: page(P.contact),
            note: "We reply within two working days.",
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
    "Riverbend Neighbors began in a church basement in 2004. Meet our staff and board, our partners and how we spend every dollar.",
    [
      fromPreset("hero/centered@1", {
        edit: {
          heading: {
            eyebrow: "About us",
            text: "Twenty years on Penn Avenue",
            subheading:
              "We started with a folding table and six bags of groceries. Today Riverbend is a staff of nine, three hundred volunteers and one stubborn idea: nobody here should go without.",
          },
          button: {
            label: "Read the 2025 report",
            link: url(collectionPath("news")),
            secondaryLabel: "Meet the team",
            secondaryLink: page(P.about, "team"),
          },
        },
      }),
      fromPreset("about/story-editorial@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Our story", text: "How a church basement became a pantry" },
          text: {
            content: rt.doc(
              rt.p(
                "In the winter of 2004, the steel-mill pensions on our block were cut in half. Margaret Oyelaran, a retired school nurse, noticed that her neighbors were skipping meals so they could heat their homes. She set up a folding table in the basement of St. Augustine's, borrowed a van, and started giving away groceries on Saturday mornings.",
              ),
              rt.p(
                "Word travelled. Within a year there were forty volunteers and a waiting list for help with leaking roofs and broken furnaces. Homework Harbor followed in 2012, when parents who came to the pantry asked for somewhere safe for their kids after school. We still ask the same question before starting anything new: what do our neighbors say they need?",
              ),
            ),
          },
        },
      }),
      fromPreset("team/grid@1", {
        anchor: "team",
        edit: {
          heading: {
            eyebrow: "Staff",
            text: "The people behind the programs",
            subheading:
              "Nine staff, most of whom first came to Riverbend as volunteers or neighbors.",
          },
          team: {
            people: [
              {
                name: "Simone Achterberg",
                role: "Executive director",
                photo: photo("portraitNina", 300, "4:5", "Portrait of Simone Achterberg"),
              },
              {
                name: "Marcus Ellery",
                role: "Pantry manager",
                photo: photo("portraitMarcus", 300, "4:5", "Portrait of Marcus Ellery"),
              },
              {
                name: "Ana Ruiz-Patel",
                role: "Youth programs lead",
                photo: photo("portraitAna", 300, "4:5", "Portrait of Ana Ruiz-Patel"),
              },
              {
                name: "Sam Whitfield",
                role: "Repair crew coordinator",
                photo: photo("portraitSam", 300, "4:5", "Portrait of Sam Whitfield"),
              },
            ],
          },
        },
      }),
      fromPreset("stats/cards@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Accountability",
            text: "Where the money goes",
            subheading: "From our audited 2025 accounts. The full report is free to download.",
          },
          stats: {
            items: [
              {
                value: "94%",
                label: "Programs",
                detail: "Food, tutoring, repair materials and the staff who run them.",
              },
              {
                value: "4%",
                label: "Fundraising",
                detail: "Mailings, events and our small donor database.",
              },
              {
                value: "2%",
                label: "Administration",
                detail: "Audit, insurance and keeping the lights on.",
              },
            ],
          },
        },
      }),
      fromPreset("logos/grid@1", {
        edit: {
          heading: {
            eyebrow: "Partners",
            text: "Good work is never done alone",
            subheading:
              "Farms, schools, congregations and businesses who share food, space and expertise.",
          },
          "logo-strip": {
            logos: [
              { name: "Allegheny Food Network" },
              { name: "Three Rivers Farm Co-op" },
              { name: "St. Augustine's Parish" },
              { name: "Arsenal Middle School" },
              { name: "Penn Ave Hardware" },
              { name: "Lawrenceville United" },
              { name: "Steel City Builders Guild" },
              { name: "Butler Street Bakery" },
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
    "Visit Riverbend Neighbors at 3120 Penn Avenue, Pittsburgh. Pantry hours, how to ask for help and how to reach our staff.",
    [
      fromPreset("contact/form-split@1", {
        edit: {
          heading: {
            eyebrow: "Contact",
            text: "Ask for help, or offer it",
            level: "h1",
            subheading:
              "Write to us about any program, volunteering or a donation. Someone will reply within two working days.",
          },
          "contact-info": { name: NAME, address: ADDRESS, phone: PHONE, email: EMAIL },
          form: {
            form: {
              id: formId(),
              name: "Contact",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "topic",
                  label: "I'm writing about",
                  width: "full",
                  options: [
                    "Getting groceries",
                    "Homework Harbor",
                    "A home repair",
                    "Volunteering",
                    "Donating",
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
              submitLabel: "Send message",
              success: {
                type: "message",
                message: "Thank you. We'll reply within two working days.",
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
            address: "3120 Penn Avenue, Pittsburgh, PA 15201",
            latitude: 40.4627,
            longitude: -79.9671,
          },
          heading: { eyebrow: "Visit", text: "Pantry & office hours" },
          hours: {
            heading: "Pantry hours",
            rows: [
              { day: "mon", closed: true },
              { day: "tue", opens: "10:00", closes: "18:00", closed: false },
              { day: "wed", closed: true },
              { day: "thu", opens: "10:00", closes: "18:00", closed: false },
              { day: "fri", closed: true },
              { day: "sat", opens: "09:00", closes: "13:00", closed: false },
              { day: "sun", closed: true },
            ],
            note: "The office is open weekdays 9 to 5. The 54 and 93 buses stop at the corner of 32nd Street.",
          },
          "contact-info": { address: ADDRESS, phone: PHONE, email: EMAIL },
        },
      }),
    ],
  );
}

export const harbor: TemplateSpec = {
  id: T,
  name: "Harbor",
  description:
    "A warm, trustworthy site for nonprofits and community groups, with an impact band, programs, events and a donate button that's always in reach.",
  persona: "Nonprofits, community organisations",
  mood: "Trustworthy, warm, civic",
  tags: ["nonprofit", "community", "donations", "events", "volunteers"],
  sample: { name: NAME, tagline: "Neighbors keeping neighbors fed and home." },
  thumbnail: P.home,
  looks: [
    {
      id: "harbor-blue",
      name: "Harbor Blue",
      description:
        "Deep civic blue on warm paper with a signal-orange accent and Newsreader headings.",
      choices: {
        palette: {
          brand: "oklch(0.42 0.12 255)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "newsreader-public-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
      overrides: { color: { accent: { $value: "oklch(0.56 0.17 42)", $type: "color" } } },
    },
    {
      id: "signal",
      name: "Signal",
      description: "A bright call-to-action orange with Zilla Slab headings and square corners.",
      choices: {
        palette: {
          brand: "oklch(0.68 0.19 45)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "zilla-slab-inter",
        density: "comfortable",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "riverside",
      name: "Riverside",
      description:
        "Steady forest green with Merriweather and Open Sans, round buttons and a calmer pace.",
      choices: {
        palette: {
          brand: "oklch(0.4 0.07 150)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "merriweather-open-sans",
        density: "airy",
        shape: "round",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Neighbors keeping neighbors fed and home.",
        nav: [
          { type: "page", page: P.programs, label: "Programs" },
          { type: "collection", collection: "events", label: "Events" },
          { type: "collection", collection: "news", label: "News" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
          { type: "button", label: "Donate", link: page(P.involved, "donate"), style: "primary" },
        ],
        header: headerFrom("header/classic@1", { sticky: true }),
        announcement: {
          enabled: true,
          message:
            "Winter coat drive: drop off new or gently used coats at the pantry through December 19.",
          link: page(P.involved),
          dismissible: true,
        },
        footer: fromPreset("footer/columns@1", {
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p(
                  "Food, homework help and home repairs in Lawrenceville since 2004. A 501(c)(3) nonprofit, EIN 25-1234567.",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Programs", [
                  ["Penn Avenue Pantry", href("programs", "pantry")],
                  ["Homework Harbor", href("programs")],
                  ["Safe at Home", href("programs", "repairs")],
                ]),
              ),
            },
            "text:3": {
              content: rt.doc(
                ...linkColumn("Organization", [
                  ["About", href("about")],
                  ["News", collectionPath("news")],
                  ["Events", collectionPath("events")],
                ]),
              ),
            },
            "text:4": {
              content: rt.doc(
                rt.p("Visit", "eyebrow"),
                rt.p("3120 Penn Avenue, Pittsburgh, PA 15201. "),
                rt.p([rt.link("Volunteer or donate", href("involved"))]),
                rt.p("© 2026 Riverbend Neighbors", "small"),
              ),
            },
          },
        }),
        social: [
          { network: "facebook", url: "https://facebook.com/riverbendneighbors.example" },
          { network: "instagram", url: "https://instagram.com/riverbendneighbors.example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Riverbend Neighbors",
          description:
            "Free groceries, homework help and home repairs in Lawrenceville, Pittsburgh.",
          image: photoUrl("friendsBench", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), programs(), involved(), about(), contact()],
      collectionConfigs: {
        events: {
          kind: "events",
          label: "Events",
          itemLabel: "Event",
          list: { layout: "list", pageSize: 20, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
        news: {
          kind: "blog",
          label: "News",
          slugPattern: "{date}-{title}",
          list: { layout: "cards", pageSize: 12, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
          taxonomies: {
            categories: [
              { slug: "stories", label: "Neighbor stories" },
              { slug: "reports", label: "Reports" },
            ],
            tags: true,
          },
          feed: {
            enabled: true,
            title: "Riverbend Neighbors news",
            description: "Stories and updates from Penn Avenue.",
          },
        },
      },
      collections: {
        events: [
          event(
            "coat-drive-sorting-day",
            {
              title: "Coat drive sorting day",
              start: "2026-12-12T09:00:00-05:00",
              end: "2026-12-12T13:00:00-05:00",
              timezone: "America/New_York",
              location: { name: "Penn Avenue Pantry", address: "3120 Penn Avenue, Pittsburgh" },
              registrationUrl: "https://riverbendneighbors.example/volunteer",
              price: "Free · volunteers welcome",
              image: photoUrl("friendsSunset", 1600),
              imageAlt: "Volunteers arm in arm at sunset",
              excerpt: "Help sort, size and hang 600 donated coats before the winter giveaway.",
            },
            "No experience needed. Coffee and bagels from Butler Street Bakery from 8:30.\n",
          ),
          event(
            "winter-coat-giveaway",
            {
              title: "Winter coat giveaway",
              start: "2026-12-19T10:00:00-05:00",
              end: "2026-12-19T14:00:00-05:00",
              timezone: "America/New_York",
              location: { name: "St. Augustine's Hall", address: "220 37th Street, Pittsburgh" },
              price: "Free",
              image: photoUrl("friendsBench", 1600),
              imageAlt: "Neighbors gathered together outdoors",
              excerpt: "Warm coats, hats and gloves for every age, plus hot soup and a toy table.",
            },
            "Everyone is welcome. Bring the kids so we can find the right sizes.\n",
          ),
          event(
            "safe-at-home-build-day",
            {
              title: "Safe at Home build day",
              start: "2027-03-20T08:00:00-04:00",
              end: "2027-03-20T15:00:00-04:00",
              timezone: "America/New_York",
              location: { name: "Meet at the pantry", address: "3120 Penn Avenue, Pittsburgh" },
              registrationUrl: "https://riverbendneighbors.example/build-day",
              price: "Free · tools provided",
              image: photoUrl("porchHouse", 1600),
              imageAlt: "A white house with a porch on a sunny day",
              excerpt: "Four crews, four houses: ramps, railings and spring roof repairs.",
            },
            "Skilled and unskilled volunteers both welcome. Closed-toe shoes required; lunch provided.\n",
          ),
          event(
            "spring-community-supper",
            {
              title: "Spring community supper",
              start: "2027-04-24T17:30:00-04:00",
              end: "2027-04-24T20:00:00-04:00",
              timezone: "America/New_York",
              location: { name: "St. Augustine's Hall", address: "220 37th Street, Pittsburgh" },
              registrationUrl: "https://riverbendneighbors.example/supper",
              price: "Pay what you can",
              image: photoUrl("sharedTable", 1600),
              imageAlt: "Friends talking over a long shared table",
              excerpt:
                "Our yearly supper for volunteers, neighbors and donors, cooked by Homework Harbor families.",
            },
            "Proceeds support the summer lunch program. Children eat free.\n",
          ),
        ],
        news: [
          post(
            "2026-10-08-the-2025-annual-report",
            {
              title: "Our 2025 annual report",
              date: "2026-10-08",
              author: "Simone Achterberg",
              categories: ["reports"],
              tags: ["accountability"],
              image: photoUrl("meeting", 1600),
              imageAlt: "The board listening to a presentation",
              excerpt:
                "41,200 grocery visits, 146 homes made safe and what we're changing next year.",
            },
            `Every autumn we publish our numbers in full, along with what we learned.

## The year in brief

- **41,200** grocery visits at the Penn Avenue Pantry, up 18%
- **146** homes made safe by the repair crew
- **80** students enrolled at Homework Harbor, with average attendance of 4 days a week

## What we're changing

Lines at the pantry got long on Saturday mornings, so from January we're adding a Thursday evening session for working families. Thank you to every donor and volunteer who made this year possible.
`,
          ),
          post(
            "2026-09-15-meet-the-repair-crew",
            {
              title: "Meet the Saturday repair crew",
              date: "2026-09-15",
              author: "Sam Whitfield",
              categories: ["stories"],
              tags: ["safe at home", "volunteers"],
              image: photoUrl("porchHouse", 1600),
              imageAlt: "A house with a freshly repaired porch",
              excerpt:
                "Retired electricians, a roofer and two engineering students walk into a basement.",
            },
            `Our Safe at Home crew is twelve volunteers who give one Saturday a month. Between them they have more than 200 years in the trades.

> "I spent forty years fixing other people's furnaces for money. Now I do it for my neighbors."
> — Walt, retired HVAC technician

The crew finished its 146th home this year. If you know your way around a toolbox, we'd love to meet you.
`,
          ),
          post(
            "2026-08-28-back-to-school-at-homework-harbor",
            {
              title: "Back to school at Homework Harbor",
              date: "2026-08-28",
              author: "Ana Ruiz-Patel",
              categories: ["stories"],
              tags: ["youth"],
              image: photoUrl("kidsSmiling", 1600),
              imageAlt: "Children smiling and making peace signs",
              excerpt: "Eighty backpacks, twenty new tutors and a very loud first afternoon.",
            },
            `We opened the doors on Monday to 80 students, 20 new volunteer tutors and a mountain of donated backpacks.

This year we're adding a reading corner for the younger kids and a Thursday coding club run by students from the university. Thank you to everyone who filled a backpack.
`,
          ),
        ],
      },
    };
  },
};
