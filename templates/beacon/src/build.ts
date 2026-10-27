import type { TemplateSpec } from "../../lib/define";
import { event, post } from "../../lib/define";
import {
  body,
  collectionPath,
  definePages,
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
 * Beacon — nonprofits, campaigns and causes. Mission first: a donate button on every screen,
 * impact told with real numbers, monthly giving, a campaign goal, ways to help beyond money,
 * transparent spending, news and volunteer days.
 *
 * Demo owner: Shade Street Trust, a street-tree charity planting on the hottest blocks.
 */

const T = "beacon";
const PAGES = definePages(T, {
  home: "",
  about: "about",
  work: "our-work",
  involved: "get-involved",
  donate: "donate",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Shade Street Trust";
const NEWS = "news";
const EVENTS = "events";

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Shade Street Trust plants and cares for street trees on the hottest blocks in Eastport, with the neighbours who live there. Donate or volunteer.",
    [
      fromPreset("hero/cause@1", {
        primary: page(P.donate),
        secondary: page(P.work),
        edit: {
          image: {
            image: photo("volunteers", 520, "4:5", "Two volunteers with shovels at a planting day"),
          },
          heading: {
            eyebrow: NAME,
            text: "Shade for every street in Eastport",
            subheading:
              "We plant trees on the hottest blocks first and teach neighbours to care for them. Sixty dollars plants and waters one for three years.",
          },
          button: { label: "Plant a tree", secondaryLabel: "How we work" },
          stats: { items: [{ value: "4,820", label: "Street trees planted since 2015" }] },
        },
      }),
      fromPreset("impact/numbers-over-photo@1", {
        style: {
          background: {
            type: "image",
            src: photo("seedlings", 1920).src,
            focal: [0.5, 0.5],
            overlay: { color: "background", opacity: 0.8 },
          },
        },
        edit: {
          heading: { eyebrow: "2025 in numbers", text: "A greener year, together" },
          stats: {
            items: [
              { value: "940", label: "Trees planted this year" },
              { value: "93%", label: "Still thriving after summer" },
              { value: "310", label: "Neighbours trained as keepers" },
            ],
          },
        },
      }),
      fromPreset("impact/program-stories@1", {
        edit: {
          heading: {
            eyebrow: "Our work",
            text: "Three ways we cool a city",
            subheading: "Each programme is run with residents, schools and the city's parks team.",
          },
          "card:1": {
            heading: "Trees on hot blocks",
            body: body("We map surface temperatures and plant where shade is missing most."),
            image: photo("sapling", 400, "3:2", "Hands holding a young tree seedling"),
            eyebrow: "940 this year",
            link: page(P.work),
            linkLabel: "See the map",
          },
          "card:2": {
            heading: "Gardens at school",
            body: body("Raised beds and weekly lessons that end with a harvest lunch."),
            image: photo("urbanGarden", 400, "3:2", "Raised flower beds in a community garden"),
            eyebrow: "Twelve schools",
            link: page(P.work, "schools"),
            linkLabel: "Visit a garden",
          },
          "card:3": {
            heading: "Keepers on every block",
            body: body(
              "We train neighbours to water, mulch and prune the trees outside their door.",
            ),
            image: photo("gardenPlanting", 400, "3:2", "A volunteer planting flowers in a bed"),
            eyebrow: "310 keepers",
            link: page(P.involved),
            linkLabel: "Become a keeper",
          },
        },
      }),
      fromPreset("testimonials/split-portrait@1", {
        primary: page(P.about),
        edit: {
          image: {
            image: photo(
              "portraitCoach",
              480,
              "4:5",
              "Rosa Delgado, a tree keeper on Linden Avenue",
            ),
          },
          testimonial: {
            quote: body(
              "Our block used to be the hottest on the map. Five summers later the kids play outside in July, and I know every tree by name.",
            ),
            name: "Rosa Delgado",
            role: "Tree keeper, Linden Avenue",
          },
          button: { label: "Read our story" },
        },
      }),
      fromPreset("impact/campaign-goal@1", {
        primary: page(P.donate),
        edit: {
          heading: {
            eyebrow: "Spring appeal",
            text: "Two hundred trees for Harbour Ward",
            subheading:
              "Help us plant the ward with the least shade in the city before the summer heat arrives.",
          },
          stats: {
            items: [
              { value: "$8,450", label: "Raised so far" },
              { value: "$12,000", label: "Our goal" },
              { value: "214", label: "Neighbours have given" },
            ],
          },
          countdown: {
            target: "2027-04-30T23:59:00-05:00",
            doneMessage: "The spring appeal has closed. Thank you!",
          },
          button: { label: "Give to the appeal" },
        },
      }),
      fromPreset("blog/latest-grid@1", {
        collection: NEWS,
        edit: {
          summary: {
            heading: "News from the street",
            linkLabel: "All news",
            link: url(collectionPath(NEWS)),
            emptyMessage: "News from planting season is on its way.",
          },
        },
      }),
      fromPreset("newsletter/with-benefits@1", {
        edit: {
          heading: { eyebrow: "Newsletter", text: "Get the seasonal letter" },
          "icon-list": {
            items: [
              { icon: "calendar", title: "Planting days before anyone else" },
              { icon: "sprout", title: "Care tips for your street tree" },
              { icon: "heart", title: "Stories from the blocks" },
            ],
          },
          newsletter: {
            heading: "Four letters a year",
            successMessage: "Thank you — the next letter goes out with the season.",
            buttonLabel: "Sign me up",
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
    "Shade Street Trust was founded by neighbours in 2015. Meet our board and partners, and see exactly how every donated dollar is spent.",
    [
      fromPreset("about/statement@1", {
        edit: {
          heading: {
            eyebrow: "Our mission",
            level: "h1",
            text: "Every child in Eastport should grow up within a short walk of shade.",
          },
          text: {
            content: rt.doc(
              rt.p(
                "Trees are the cheapest way to cool a city. We plant them where people need them most.",
              ),
            ),
          },
        },
      }),
      fromPreset("process/history-timeline@1", {
        edit: {
          heading: { eyebrow: "Our story", text: "Ten years of planting" },
          image: { image: photo("sapling", 480, "4:5", "A sapling held in cupped hands") },
          timeline: {
            items: [
              {
                date: "2015",
                title: "Forty trees and a borrowed truck",
                text: "Neighbours on Linden Avenue plant their own block.",
              },
              {
                date: "2018",
                title: "Registered as a charity",
                text: "And the first paid coordinator joins.",
              },
              {
                date: "2021",
                title: "The heat map",
                text: "We start planting the hottest blocks first.",
              },
              {
                date: "2025",
                title: "Twelve school gardens",
                text: "Harvest lunches become part of the timetable.",
              },
            ],
          },
        },
      }),
      fromPreset("team/circles-centered@1", {
        edit: {
          heading: { eyebrow: "Governance", text: "Our board of trustees" },
          team: {
            people: [
              { name: "Grace Liu", role: "Chair", photo: photo("portraitIris", 240, "1:1") },
              { name: "Owen Price", role: "Treasurer", photo: photo("portraitOwen", 240, "1:1") },
              { name: "Maya Chen", role: "Secretary", photo: photo("portraitMaya", 240, "1:1") },
              { name: "Jonah Ellis", role: "Trustee", photo: photo("portraitJonah", 240, "1:1") },
              { name: "Lena Brandt", role: "Trustee", photo: photo("portraitLena", 240, "1:1") },
              { name: "Daniel Okoro", role: "Trustee", photo: photo("portraitDaniel", 240, "1:1") },
            ],
          },
        },
      }),
      fromPreset("logos/partners-cards@1", {
        edit: {
          heading: { eyebrow: "Partners", text: "We plant with" },
          "card:1": {
            heading: "Eastport Schools",
            body: body("Twelve schools host our gardens and teach with them every week."),
            eyebrow: "Education",
          },
          "card:2": {
            heading: "Eastport Parks",
            body: body("The city supplies young trees at cost and shares its heat maps."),
            eyebrow: "City partner",
          },
          "card:3": {
            heading: "Harbour Community Fund",
            body: body("Funds keeper training and watering kits for every new block."),
            eyebrow: "Funder",
          },
        },
      }),
      fromPreset("impact/where-money-goes@1", {
        primary: page(P.donate),
        edit: {
          heading: { eyebrow: "Transparency", text: "How your gift is spent" },
          text: {
            content: rt.doc(
              rt.p(
                "Our accounts are independently examined each year. Four in every five dollars go straight to planting, watering and training.",
              ),
            ),
          },
          button: { label: "Make a donation" },
          chart: {
            title: "Spending in 2025",
            description: "Share of total spending, from our examined accounts.",
            rows: [
              { label: "Planting and watering", value: 79 },
              { label: "Training keepers", value: 11 },
              { label: "Fundraising", value: 6 },
              { label: "Running costs", value: 4 },
            ],
          },
        },
      }),
    ],
  );
}

function work() {
  return makePage(
    P.work,
    "Our work",
    "our-work",
    "How Shade Street Trust chooses where to plant, how trees are cared for and what twelve school gardens grow. Our programmes and results.",
    [
      fromPreset("hero/frame-photo@1", {
        primary: page(P.involved),
        secondary: page(P.donate),
        edit: {
          image: {
            image: photo(
              "urbanGarden",
              1440,
              "original",
              "A community garden of raised beds between houses",
            ),
          },
          text: {
            content: rt.doc(
              rt.p("Our work", "eyebrow"),
              rt.h(1, "Planting where the heat is worst", "h1"),
              rt.p(
                "We use the city's heat maps to choose blocks, then plant only where residents ask for trees.",
              ),
            ),
          },
          button: { label: "Get involved", secondaryLabel: "Donate" },
        },
      }),
      fromPreset("features/alternating-rows@1", {
        edit: {
          heading: { eyebrow: "Programmes", text: "From sapling to shade" },
          "image:1": { image: photo("volunteers", 640, "original", "Volunteers ready to plant") },
          "text:1": {
            content: rt.doc(
              rt.p("Street trees", "eyebrow"),
              rt.h(3, "Residents choose the trees", "h3"),
              rt.p(
                "Every block gets a walk-through with a tree officer, and neighbours vote on species that suit the street.",
              ),
            ),
          },
          "image:2": {
            image: photo("urbanGarden", 640, "original", "Flower beds in a school garden"),
          },
          "text:2": {
            content: rt.doc(
              rt.p("School gardens", "eyebrow"),
              rt.h(3, "Lessons you can eat", "h3"),
              rt.p(
                "Weekly garden lessons at twelve schools, ending each term with a harvest lunch for the whole class.",
              ),
            ),
          },
          "image:3": {
            image: photo(
              "gardenPlanting",
              640,
              "original",
              "A keeper planting around a young tree",
            ),
          },
          "text:3": {
            content: rt.doc(
              rt.p("Keepers", "eyebrow"),
              rt.h(3, "Care that lasts", "h3"),
              rt.p(
                "Trained keepers water and mulch through the first three summers, when young trees need it most.",
              ),
            ),
          },
        },
        anchor: "schools",
      }),
      fromPreset("impact/growth-chart@1", {
        primary: page(P.about),
        edit: {
          heading: { eyebrow: "Results", text: "More trees every year" },
          text: {
            content: rt.doc(
              rt.p(
                "We count a tree only when it has survived its first summer. Last year, 93 in every 100 did.",
              ),
            ),
          },
          button: { label: "About the trust" },
          chart: {
            title: "Trees planted each year",
            description: "Trees planted and alive after their first summer.",
            rows: [
              { label: "2021", value: 280 },
              { label: "2022", value: 410 },
              { label: "2023", value: 560 },
              { label: "2024", value: 720 },
              { label: "2025", value: 940 },
            ],
          },
        },
      }),
      fromPreset("gallery/captioned-grid@1", {
        edit: {
          heading: { eyebrow: "Photos", text: "Planting season, 2025" },
          gallery: {
            images: [
              { image: photo("volunteers", 440, "4:5"), caption: "Planting day on Linden Avenue" },
              { image: photo("sapling", 440, "4:5"), caption: "A London plane, ready to go in" },
              {
                image: photo("gardenPlanting", 440, "4:5"),
                caption: "Mulching at Harbour Primary",
              },
              { image: photo("urbanGarden", 440, "4:5"), caption: "The garden at Eastport Middle" },
              { image: photo("seedlings", 440, "4:5"), caption: "Seedlings in the nursery" },
              { image: photo("gardenTrowel", 440, "4:5"), caption: "Tools for a keeper kit" },
            ],
          },
        },
      }),
      fromPreset("cta/photo-split-dark@1", {
        primary: page(P.involved),
        edit: {
          image: {
            image: photo("volunteers", 960, "original", "Volunteers smiling at a planting day"),
          },
          text: {
            content: rt.doc(
              rt.p("Volunteer", "eyebrow"),
              rt.h(2, "One Saturday morning plants a whole block", "h2"),
              rt.p("No experience needed. We bring tools, trees and breakfast."),
            ),
          },
          button: { label: "Join a planting day" },
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
    "Volunteer at a planting day, become a tree keeper, fundraise or spread the word. Every way to help Shade Street Trust, with dates.",
    [
      fromPreset("impact/ways-to-give@1", {
        primary: page(P.donate),
        edit: {
          heading: { eyebrow: "Get involved", level: "h1", text: "Four ways to help this season" },
          "icon-list": {
            items: [
              {
                icon: "heart",
                title: "Give",
                text: "Sixty dollars plants and waters a tree for three years.",
              },
              {
                icon: "users",
                title: "Volunteer",
                text: "Planting days run every other Saturday, October to April.",
              },
              {
                icon: "droplet",
                title: "Keep a tree",
                text: "Water the tree outside your door through its first summers.",
              },
              {
                icon: "rocket",
                title: "Fundraise",
                text: "Birthday, bake sale or marathon — we'll send a kit.",
              },
            ],
          },
          button: { label: "Donate now" },
        },
      }),
      fromPreset("process/sticky-steps@1", {
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "Tree keepers", text: "Becoming a keeper" },
          text: {
            content: rt.doc(
              rt.p(
                "Keepers are the reason nine in ten of our trees survive. It takes about twenty minutes a week in summer.",
              ),
            ),
          },
          button: { label: "Sign up as a keeper" },
          timeline: {
            items: [
              {
                date: "Step 1",
                title: "Sign up for your block",
                text: "Tell us which tree you'd like to look after.",
              },
              {
                date: "Step 2",
                title: "A one-hour training",
                text: "Online or in the park, with a free watering kit.",
              },
              {
                date: "Step 3",
                title: "Water and report",
                text: "A quick photo each month helps us spot problems early.",
              },
            ],
          },
        },
      }),
      fromPreset("events/upcoming-split@1", {
        collection: EVENTS,
        primary: url(collectionPath(EVENTS)),
        edit: {
          heading: { eyebrow: "Dates", text: "Upcoming planting days" },
          text: {
            content: rt.doc(
              rt.p("Bring gloves if you have them. Children are welcome with an adult."),
            ),
          },
          button: { label: "All dates" },
          events: {
            registerLabel: "Sign up",
            emptyMessage: "Next season's dates are announced in September.",
          },
        },
      }),
      fromPreset("faq/centered@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Volunteering", text: "Before your first planting day" },
          accordion: {
            items: [
              {
                question: "Do I need any experience?",
                answer: body("None at all. A team leader shows every group what to do."),
              },
              {
                question: "What should I wear?",
                answer: body("Clothes and shoes you don't mind getting muddy. We provide gloves."),
              },
              {
                question: "Can I bring my children?",
                answer: body("Yes — children over six are welcome with an adult."),
              },
              {
                question: "What if it rains?",
                answer: body("We plant in light rain. We'll text you if a day is cancelled."),
              },
            ],
          },
        },
      }),
    ],
  );
}

function donate() {
  return makePage(
    P.donate,
    "Donate",
    "donate",
    "Donate to Shade Street Trust. A monthly gift waters young trees all summer; sixty dollars plants and cares for a tree for three years.",
    [
      fromPreset("impact/monthly-giving@1", {
        edit: {
          heading: { eyebrow: "Donate", level: "h1", text: "Give shade, monthly or once" },
          "icon-list": {
            items: [
              { icon: "droplet", title: "$10 keeps a young tree watered" },
              { icon: "sprout", title: "$25 plants a tree where it's hottest" },
              { icon: "users", title: "$50 trains a new tree keeper" },
            ],
          },
          donation: {
            frequency: "both",
            buttonLabel: "Donate",
            note: "Shade Street Trust is a registered charity. You'll get a receipt by email.",
          },
        },
      }),
      fromPreset("stats/cards-detail@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Your gift at work",
            text: "What donations did last year",
            subheading: "From our 2025 accounts, independently examined.",
          },
          stats: {
            items: [
              {
                value: "$60",
                label: "Plants one tree",
                detail: "Including three summers of watering.",
              },
              {
                value: "79¢",
                label: "Of every dollar to planting",
                detail: "The rest runs the charity.",
              },
              { value: "1,120", label: "Monthly donors", detail: "The steady base of our work." },
            ],
          },
        },
      }),
      fromPreset("faq/with-contact-card@1", {
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "Giving", text: "Questions about donating" },
          accordion: {
            items: [
              {
                question: "Is my donation tax-deductible?",
                answer: body(
                  "Yes. Shade Street Trust is a registered charity and every gift gets a receipt.",
                ),
              },
              {
                question: "Can I give in memory of someone?",
                answer: body("Yes — tell us their name and we'll plant a tree and send a card."),
              },
              {
                question: "Can my company match my gift?",
                answer: body("Many employers do. Ask your HR team and we'll send what they need."),
              },
              {
                question: "How do I cancel a monthly gift?",
                answer: body(
                  "Use the link in any receipt, or email us and we'll do it the same day.",
                ),
              },
            ],
          },
          image: { image: photo("portraitClara", 160, "1:1", "Rosa, our supporter care lead") },
          text: {
            content: rt.doc(
              rt.h(3, "Talk to Rosa", "h4"),
              rt.p("Rosa looks after our donors. Call her weekdays between 9am and 5pm."),
            ),
          },
          button: { label: "Get in touch" },
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
    "Contact Shade Street Trust about volunteering, donations, tree requests for your block or school gardens. Office hours and address.",
    [
      fromPreset("contact/map-wide@1", {
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Find the tree yard" },
          map: {
            name: NAME,
            address: "41 Mill Street, Eastport, ME 04631",
            latitude: 44.9062,
            longitude: -66.9898,
            linkLabel: "Get directions",
          },
          "contact-info": {
            headingLevel: "h2",
            address: "41 Mill Street\nEastport, ME 04631",
            phone: "+1 (207) 555-0136",
            email: "hello@shadestreet.example",
          },
          hours: { heading: "Office hours", headingLevel: "h2" },
        },
      }),
      fromPreset("contact/cards-row@1", {
        theme: "light-accent",
        edit: {
          "contact-info:1": {
            headingLevel: "h2",
            heading: "Request a tree",
            phone: undefined,
            email: "trees@shadestreet.example",
            note: "For your block or school",
          },
          "contact-info:2": {
            headingLevel: "h2",
            heading: "Donations",
            email: "giving@shadestreet.example",
            phone: undefined,
            note: "Receipts and gifts in memory",
          },
          "contact-info:3": {
            headingLevel: "h2",
            heading: "Press",
            address: undefined,
            email: "press@shadestreet.example",
            note: "Photos and interviews",
          },
        },
      }),
    ],
  );
}

export const beacon: TemplateSpec = {
  id: T,
  name: "Beacon",
  description:
    "A mission-first site for nonprofits and campaigns, with donate buttons throughout, monthly giving, a campaign goal, impact numbers and volunteer days.",
  persona: "Nonprofits, charities & campaigns",
  mood: "Hopeful, clear, trustworthy",
  tags: ["nonprofit", "charity", "donate", "campaign", "volunteer", "impact"],
  sample: { name: NAME, tagline: "Street trees for the hottest blocks in Eastport." },
  thumbnail: P.home,
  looks: [
    {
      id: "canopy",
      name: "Canopy",
      description: "Leaf green on warm paper with Libre Caslon headings.",
      choices: {
        palette: {
          brand: "oklch(0.52 0.12 150)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "libre-caslon-nunito-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "sunrise",
      name: "Sunrise",
      description: "A bold coral accent, DM Serif headings and confident pill buttons.",
      choices: {
        palette: {
          brand: "oklch(0.63 0.17 35)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "dm-serif-dm-sans",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "expressive",
        imageTreatment: "rounded",
      },
    },
    {
      id: "civic",
      name: "Civic",
      description: "Deep blue, Public Sans and square corners — sober and official.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.13 255)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "newsreader-public-sans",
        density: "compact",
        shape: "sharp",
        buttons: "solid",
        motion: "none",
        imageTreatment: "none",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Street trees for the hottest blocks in Eastport.",
        nav: [
          { type: "page", page: P.work, label: "Our work" },
          { type: "page", page: P.involved, label: "Get involved" },
          { type: "collection", collection: NEWS, label: "News" },
          { type: "page", page: P.about, label: "About" },
          { type: "button", label: "Donate", link: page(P.donate), style: "primary" },
        ],
        header: headerFrom("header/classic@1", { sticky: true }),
        footer: fromPreset("footer/sitemap@1", {
          drop: ["text:5"],
          theme: "dark-accent",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p("Neighbours planting shade on Eastport's hottest streets."),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Our work", [
                  ["Programmes", href("work")],
                  ["News", collectionPath(NEWS)],
                  ["Planting days", collectionPath(EVENTS)],
                ]),
              ),
            },
            "text:3": {
              content: rt.doc(
                ...linkColumn("Help", [
                  ["Donate", href("donate")],
                  ["Get involved", href("involved")],
                ]),
              ),
            },
            "text:4": {
              content: rt.doc(
                ...linkColumn("The trust", [
                  ["About", href("about")],
                  ["Contact", href("contact")],
                ]),
              ),
            },
            "text:6": {
              content: rt.doc(rt.p("© 2026 Shade Street Trust. Charity no. 1203417", "small")),
            },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/shadestreet.example" },
          { network: "facebook", url: "https://facebook.com/shadestreet.example" },
        ],
        seo: {
          titleTemplate: "%s · Shade Street Trust",
          description: "Street trees for the hottest blocks in Eastport.",
          image: photoUrl("volunteers", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), about(), work(), involved(), donate(), contact()],
      collectionConfigs: {
        [NEWS]: {
          kind: "blog",
          label: "News",
          itemLabel: "Story",
          list: { layout: "grid", pageSize: 12, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
        },
        [EVENTS]: {
          kind: "events",
          label: "Planting days",
          itemLabel: "Planting day",
          list: { layout: "list", pageSize: 20, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
      },
      collections: {
        [NEWS]: [
          post(
            "2026-10-14-planting-season-begins",
            {
              title: "Planting season begins on Linden Avenue",
              date: "2026-10-14",
              author: "Maya Chen",
              excerpt:
                "Forty volunteers, thirty-two trees and one very muddy Saturday to open the season.",
              image: photoUrl("treePlanting", 1600),
              imageAlt: "Neighbours kneeling to plant a young tree together",
            },
            "Our first planting day of the season brought forty volunteers to Linden Avenue, where thirty-two London planes and red maples went into the ground before lunch.\n\nThank you to everyone who came — and to Twin Oaks for the coffee.\n",
          ),
          post(
            "2026-09-30-school-gardens-harvest",
            {
              title: "A record harvest in school gardens",
              date: "2026-09-30",
              author: "Owen Price",
              excerpt:
                "Squash, beans and a lot of very proud children: the school gardens had their best year yet.",
              image: photoUrl("chardHarvest", 1600),
              imageAlt: "A child holding an armful of chard from a school garden",
            },
            "Twelve school gardens grew enough squash, beans and herbs for a harvest lunch at every school this autumn.\n\nNext term, three more schools join the programme.\n",
          ),
          post(
            "2026-09-12-heat-map-2026",
            {
              title: "What this summer's heat map tells us",
              date: "2026-09-12",
              author: "Grace Liu",
              excerpt:
                "Blocks with five-year-old trees were up to 6°F cooler at street level on the hottest days.",
              image: photoUrl("shadedStreet", 1600),
              imageAlt: "A street shaded by a canopy of mature plane trees",
            },
            "Volunteers measured street temperatures on twenty blocks during July's heatwave. Blocks with five-year-old trees were up to 6°F cooler than those without.\n\nWe'll use the map to choose next spring's planting sites.\n",
          ),
        ],
        [EVENTS]: [
          event(
            "planting-day-harbour-ward",
            {
              title: "Planting day: Harbour Ward",
              start: "2026-11-07T09:00:00-05:00",
              end: "2026-11-07T13:00:00-05:00",
              timezone: "America/New_York",
              location: {
                name: "Harbour Primary School",
                address: "18 Water Street, Eastport, ME",
              },
              price: "Free",
              excerpt:
                "Plant twenty-five trees along Water Street. Tools, gloves and breakfast provided.",
            },
            "Meet at the school gates at 9am. We'll split into teams of five, each with an experienced leader.\n",
          ),
          event(
            "keeper-training-november",
            {
              title: "Tree keeper training",
              start: "2026-11-14T10:00:00-05:00",
              end: "2026-11-14T11:00:00-05:00",
              timezone: "America/New_York",
              location: { name: "The tree yard", address: "41 Mill Street, Eastport, ME" },
              price: "Free",
              excerpt: "One hour to learn watering, mulching and what a stressed tree looks like.",
            },
            "Every keeper goes home with a watering bag, a mulch fork and a laminated care card.\n",
          ),
          event(
            "planting-day-linden-north",
            {
              title: "Planting day: Linden North",
              start: "2026-11-21T09:00:00-05:00",
              end: "2026-11-21T13:00:00-05:00",
              timezone: "America/New_York",
              location: {
                name: "Linden Avenue and 5th Street",
                address: "Linden Avenue, Eastport, ME",
              },
              price: "Free",
              excerpt: "Finish the avenue with thirty trees, then lunch in the church hall.",
            },
            "Bring a water bottle. Children over six are welcome with an adult.\n",
          ),
        ],
      },
    };
  },
};
