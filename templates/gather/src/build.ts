import type { TemplateSpec } from "../../lib/define";
import { event } from "../../lib/define";
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
 * Gather — events, festivals and conferences. Date and place first: a countdown hero, speakers,
 * a day-by-day programme, ticket types with a comparison, venue and travel, fringe events and
 * a signup for announcements.
 *
 * Demo owner: Open Field, a two-day conference on design for public services.
 */

const T = "gather";
const PAGES = definePages(T, {
  home: "",
  programme: "programme",
  speakers: "speakers",
  tickets: "tickets",
  venue: "venue",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Open Field 2027";
const FRINGE = "fringe";
const TICKETS = "https://tickets.openfield.example";

const speakers = [
  {
    name: "Lena Brandt",
    talk: "Forms people can finish",
    face: "portraitLena" as const,
    bio: "Leads design for a national benefits service and has rewritten more forms than anyone should.",
  },
  {
    name: "Jonah Ellis",
    talk: "Small teams, public money",
    face: "portraitJonah" as const,
    bio: "Runs a twelve-person digital team inside a city government, shipping weekly.",
  },
  {
    name: "Ines Varga",
    talk: "Libraries as infrastructure",
    face: "portraitFounder" as const,
    bio: "Architect and researcher studying how public buildings earn trust.",
  },
  {
    name: "Rafael Costa",
    talk: "Accessibility is the default",
    face: "portraitRaf" as const,
    bio: "Accessibility lead and screen-reader user who audits services for a living.",
  },
];

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Open Field is a two-day conference on design for public services, 10–11 June 2027 in Minneapolis. Speakers, programme and tickets.",
    [
      fromPreset("hero/event-countdown@1", {
        primary: page(P.tickets),
        secondary: page(P.programme),
        style: {
          background: {
            type: "image",
            src: photo("auditorium", 1920).src,
            focal: [0.5, 0.5],
            overlay: { color: "background", opacity: 0.8 },
          },
        },
        edit: {
          heading: {
            eyebrow: "10–11 June 2027 · Minneapolis",
            text: "Open Field: design for public services",
            subheading:
              "Two days of talks and workshops for the designers, researchers and civil servants making public services simpler, fairer and kinder.",
          },
          countdown: {
            target: "2027-06-10T09:00:00-05:00",
            doneMessage: "Open Field is happening now — see you in the main hall.",
          },
          button: { label: "Get tickets", secondaryLabel: "See the programme" },
        },
      }),
      fromPreset("logos/stats-and-logos@1", {
        edit: {
          stats: { items: [{ value: "1,200", label: "People at Open Field 2026" }] },
          "logo-strip": {
            logos: [
              { name: "City of Lakewood" },
              { name: "Civic Design Lab" },
              { name: "Northland Libraries" },
              { name: "Public Code Co-op" },
              { name: "State Digital Service" },
              { name: "Harbour Health" },
            ],
          },
        },
      }),
      fromPreset("events/speakers@1", {
        edit: {
          heading: {
            eyebrow: "Speakers",
            text: "Who's on stage",
            subheading:
              "Practitioners from city halls, libraries, hospitals and national services.",
          },
          team: {
            people: speakers.map((s) => ({
              name: s.name,
              role: s.talk,
              photo: photo(s.face, 360, "4:5"),
            })),
          },
        },
      }),
      fromPreset("features/wide-image-points@1", {
        edit: {
          heading: { eyebrow: "The event", text: "Two days, three rooms, one big question" },
          image: {
            image: photo("expoStage", 1440, "21:9", "A packed hall facing a brightly lit stage"),
          },
          "icon-list": {
            items: [
              {
                icon: "mic",
                title: "Twenty-four talks",
                text: "Short, practical and recorded for later.",
              },
              {
                icon: "users",
                title: "Twelve workshops",
                text: "Small groups, real problems, take-home tools.",
              },
              {
                icon: "coffee",
                title: "Long breaks",
                text: "Because the hallway is half the conference.",
              },
            ],
          },
        },
      }),
      fromPreset("testimonials/carousel-cards@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Last year", text: "What people took home" },
          "quote-carousel": {
            label: "Attendee reviews",
            quotes: [
              {
                quote: "The only conference where I came back with things to try on Monday.",
                name: "Ana Ruiz",
                role: "Service designer",
                photo: photo("portraitAna", 80, "1:1"),
              },
              {
                quote: "Brilliant talks, kind people and actual lunch breaks.",
                name: "Daniel Okoro",
                role: "Product manager, city government",
                photo: photo("portraitDaniel", 80, "1:1"),
              },
              {
                quote: "The accessibility workshop changed how my whole team works.",
                name: "Iris Lund",
                role: "Content designer",
                photo: photo("portraitIris", 80, "1:1"),
              },
              {
                quote: "I met three people I now call every month for advice.",
                name: "Theo Grant",
                role: "User researcher",
                photo: photo("portraitTheo", 80, "1:1"),
              },
            ],
          },
        },
      }),
      fromPreset("cta/card-centered@1", {
        primary: page(P.tickets),
        secondary: page(P.contact),
        edit: {
          text: {
            content: rt.doc(
              rt.h(2, "Early-bird tickets end 31 March", "h2"),
              rt.p(
                "Public-sector and nonprofit rates available. Group discounts for teams of five or more.",
              ),
            ),
          },
          button: { label: "Choose a ticket", secondaryLabel: "Ask about groups" },
        },
      }),
      fromPreset("newsletter/inline-band@1", {
        edit: {
          heading: { eyebrow: "Announcements", text: "Hear first about speakers" },
          newsletter: {
            buttonLabel: "Keep me posted",
            successMessage: "Thanks — you'll hear about new speakers first.",
          },
        },
      }),
    ],
  );
}

function programme() {
  return makePage(
    P.programme,
    "Programme",
    "programme",
    "The Open Field 2027 programme: two days of talks and workshops on public service design, plus fringe events across Minneapolis.",
    [
      fromPreset("hero/editorial-type@1", {
        primary: page(P.tickets),
        secondary: page(P.speakers),
        edit: {
          heading: { eyebrow: "Programme · draft 2", text: "Two days, hour by hour" },
          text: {
            content: rt.doc(
              rt.p(
                "Times may shift a little until May. Every main-stage talk is captioned and recorded.",
              ),
            ),
          },
          button: { label: "Get tickets", secondaryLabel: "Speakers" },
        },
      }),
      fromPreset("events/programme-tabs@1", {
        edit: {
          heading: {
            eyebrow: "Main hall",
            text: "Talks and workshops",
            subheading: "Workshops run in the two side rooms; sign up on the day.",
          },
          tabs: {
            label: "Conference days",
            items: [
              {
                label: "Thu 10 June",
                content: rt.doc(
                  rt.h(3, "9:00 · Registration and breakfast", "h4"),
                  rt.p("Coffee from Twin Oaks, pastries from Little Ember."),
                  rt.h(3, "10:00 · Forms people can finish", "h4"),
                  rt.p("Lena Brandt on rewriting a benefits application from scratch."),
                  rt.h(3, "14:00 · Workshops", "h4"),
                  rt.p("Plain language clinic, research with small budgets, and accessible PDFs."),
                ),
              },
              {
                label: "Fri 11 June",
                content: rt.doc(
                  rt.h(3, "10:00 · Small teams, public money", "h4"),
                  rt.p("Jonah Ellis on shipping weekly inside city government."),
                  rt.h(3, "13:30 · Panel: trust in public spaces", "h4"),
                  rt.p("Libraries, clinics and the digital front door."),
                  rt.h(3, "16:30 · Closing and drinks", "h4"),
                  rt.p("On the terrace, rain or shine."),
                ),
              },
            ],
          },
        },
      }),
      fromPreset("events/upcoming-split@1", {
        collection: FRINGE,
        primary: url(collectionPath(FRINGE)),
        edit: {
          heading: { eyebrow: "Fringe", text: "Around the conference" },
          text: {
            content: rt.doc(
              rt.p("Free evening events hosted by local teams. Conference badge not needed."),
            ),
          },
          button: { label: "All fringe events" },
          events: {
            registerLabel: "Save a place",
            emptyMessage: "Fringe events are announced in April.",
          },
        },
      }),
      fromPreset("cta/banner@1", {
        primary: page(P.tickets),
        secondary: page(P.contact),
        edit: {
          heading: {
            text: "Bring your whole team",
            subheading: "Groups of five or more save 15%, and we'll seat you together at lunch.",
          },
          button: { label: "Team tickets", secondaryLabel: "Ask a question" },
        },
      }),
    ],
  );
}

function speakersPage() {
  return makePage(
    P.speakers,
    "Speakers",
    "speakers",
    "Meet the Open Field 2027 speakers: practitioners designing public services in cities, libraries, hospitals and national government.",
    [
      fromPreset("hero/centered@1", {
        primary: page(P.tickets),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Speakers",
            text: "People who've done the work",
            subheading:
              "No keynotes from vendors. Every speaker works on a public service and will tell you what went wrong.",
          },
          button: { label: "Get tickets", secondaryLabel: "Propose a talk" },
        },
      }),
      fromPreset("team/list-bios@1", {
        edit: {
          heading: { eyebrow: "Main stage", text: "This year's line-up" },
          team: {
            people: speakers.map((s) => ({
              name: s.name,
              role: s.talk,
              photo: photo(s.face, 360, "4:5"),
              bio: s.bio,
            })),
          },
        },
      }),
      fromPreset("cta/split@1", {
        primary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Call for proposals",
            text: "Got a story worth telling? Propose a talk.",
          },
          button: {
            label: "Send a proposal",
            note: "Closes 15 February. First-time speakers welcome.",
          },
        },
      }),
    ],
  );
}

function tickets() {
  return makePage(
    P.tickets,
    "Tickets",
    "tickets",
    "Open Field 2027 tickets: early bird, standard and public-sector rates, workshop passes and group discounts. Compare what's included.",
    [
      fromPreset("hero/with-stats@1", {
        primary: url(TICKETS),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Tickets",
            text: "Pick your pass",
            subheading:
              "Every ticket includes lunch, coffee and the recordings. Public-sector and nonprofit rates are half price.",
          },
          button: { label: "Buy tickets", secondaryLabel: "Group bookings" },
          stats: {
            items: [
              { value: "2 days", label: "Of talks and workshops" },
              { value: "50%", label: "Public-sector discount" },
              { value: "1,200", label: "Seats in total" },
            ],
          },
        },
      }),
      fromPreset("events/tickets@1", {
        primary: url(TICKETS),
        edit: {
          heading: {
            eyebrow: "Passes",
            text: "Conference passes",
            subheading: "Prices include tax and fees. Refunds or transfers up to 30 days before.",
          },
          pricing: {
            plans: [
              {
                name: "Day pass",
                price: "$240",
                description: "Thursday or Friday.",
                features: [{ text: "All talks that day" }, { text: "Lunch and coffee" }],
                buttonLabel: "Buy a day pass",
                link: url(TICKETS),
                featured: false,
              },
              {
                name: "Full conference",
                price: "$420",
                description: "Both days.",
                features: [
                  { text: "All talks" },
                  { text: "One workshop" },
                  { text: "Closing drinks" },
                ],
                buttonLabel: "Buy full passes",
                link: url(TICKETS),
                featured: true,
                badge: "Most popular",
              },
              {
                name: "Public sector",
                price: "$210",
                description: "Both days, for public and nonprofit staff.",
                features: [{ text: "Everything in Full" }, { text: "Work email required" }],
                buttonLabel: "Buy at half price",
                link: url(TICKETS),
                featured: false,
              },
            ],
            note: "Need help paying? Twenty free places are reserved for students and people between jobs.",
          },
        },
      }),
      fromPreset("features/comparison-table@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Compare",
            text: "What each pass includes",
            subheading: "Workshop places are limited and allocated in booking order.",
          },
          table: {
            caption: "Open Field passes compared",
            columns: [
              { label: "Day pass", highlight: false },
              { label: "Full conference", highlight: true },
            ],
            rows: [
              {
                label: "Main-stage talks",
                group: false,
                cells: [{ value: "One day" }, { value: "Both days" }],
              },
              { label: "Workshop place", group: false, cells: [{ value: "no" }, { value: "yes" }] },
              {
                label: "Lunch and coffee",
                group: false,
                cells: [{ value: "yes" }, { value: "yes" }],
              },
              { label: "Closing drinks", group: false, cells: [{ value: "no" }, { value: "yes" }] },
              { label: "Recordings", group: false, cells: [{ value: "yes" }, { value: "yes" }] },
            ],
          },
        },
      }),
      fromPreset("faq/two-column@1", {
        edit: {
          heading: { eyebrow: "FAQ", text: "Ticket questions" },
          "accordion:1": {
            items: [
              {
                question: "Can I transfer my ticket?",
                answer: body("Yes, to anyone, up to the day before. Just email us their name."),
              },
              {
                question: "Do you offer invoices?",
                answer: body(
                  "Yes — choose 'pay by invoice' at checkout for orders of three or more.",
                ),
              },
            ],
          },
          "accordion:2": {
            items: [
              {
                question: "Is the venue accessible?",
                answer: body(
                  "Fully step-free, with captioning, a quiet room and reserved seating.",
                ),
              },
              {
                question: "Is there a code of conduct?",
                answer: body("Yes, and a named team to contact throughout both days."),
              },
            ],
          },
        },
      }),
    ],
  );
}

function venue() {
  return makePage(
    P.venue,
    "Venue & travel",
    "venue",
    "Open Field 2027 takes place at the Mill City Hall in Minneapolis. Getting there by train, bus and bike, accessibility and where to stay.",
    [
      fromPreset("hero/frame-photo@1", {
        primary: page(P.tickets),
        secondary: page(P.contact),
        edit: {
          image: {
            image: photo(
              "conference",
              1440,
              "original",
              "Rows of attendees in the Mill City Hall auditorium",
            ),
          },
          text: {
            content: rt.doc(
              rt.p("Venue & travel", "eyebrow"),
              rt.h(1, "Mill City Hall, by the river", "h1"),
              rt.p(
                "A restored flour mill with a 900-seat hall, two workshop rooms and a terrace over the Mississippi.",
              ),
            ),
          },
          button: { label: "Get tickets", secondaryLabel: "Access questions" },
        },
      }),
      fromPreset("events/venue-travel@1", {
        edit: {
          heading: { eyebrow: "Getting here", text: "Train, bus or bike" },
          text: {
            content: rt.doc(
              rt.h(3, "By light rail", "h4"),
              rt.p(
                "Downtown East station is a seven-minute walk. Trains run every ten minutes from the airport.",
              ),
              rt.h(3, "By bus", "h4"),
              rt.p("Routes 7 and 22 stop outside the main doors on Second Street."),
              rt.h(3, "By bike", "h4"),
              rt.p("Free valet bike parking by the terrace entrance, both days."),
            ),
          },
          map: {
            name: "Mill City Hall",
            address: "704 S 2nd St, Minneapolis, MN 55401",
            latitude: 44.9786,
            longitude: -93.2571,
            details: "Main entrance on Second Street.",
          },
        },
      }),
      fromPreset("features/tile-grid@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Access",
            text: "Designed so everyone can take part",
            subheading: "Tell us what you need when you book, or any time before the event.",
          },
          "icon-list": {
            items: [
              { icon: "accessibility", title: "Step-free throughout" },
              { icon: "file-text", title: "Live captions on stage" },
              { icon: "headphones", title: "Hearing loop in the hall" },
              { icon: "moon", title: "A quiet room" },
              { icon: "baby", title: "Parents' room" },
              { icon: "utensils", title: "Every diet catered" },
              { icon: "users", title: "Free carer tickets" },
              { icon: "map-pin", title: "Sighted guides on request" },
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
    "Open Field is a not-for-profit conference run by public servants since 2019. Our mission, organisers, numbers and partners.",
    [
      fromPreset("about/statement@1", {
        edit: {
          heading: {
            eyebrow: "About Open Field",
            level: "h1",
            text: "Public services should be as good as the best things on the internet.",
          },
          text: {
            content: rt.doc(
              rt.p("We bring the people who make them together once a year to learn how."),
            ),
          },
        },
      }),
      fromPreset("stats/over-photo@1", {
        style: {
          background: {
            type: "image",
            src: photo("networking", 1920).src,
            focal: [0.5, 0.5],
            overlay: { color: "background", opacity: 0.8 },
          },
        },
        edit: {
          heading: { eyebrow: "Since 2019", text: "Seven years of Open Field" },
          stats: {
            items: [
              { value: "6,400", label: "People have attended" },
              { value: "180", label: "Talks, all recorded" },
              { value: "40%", label: "Tickets at public-sector rates" },
            ],
          },
        },
      }),
      fromPreset("team/four-up@1", {
        edit: {
          heading: {
            eyebrow: "Organisers",
            text: "Run by volunteers",
            subheading: "Four public servants who give their evenings to it.",
          },
          team: {
            people: [
              { name: "Maya Chen", role: "Programme", photo: photo("portraitMaya", 360, "4:5") },
              {
                name: "Owen Price",
                role: "Venue and access",
                photo: photo("portraitOwen", 360, "4:5"),
              },
              {
                name: "Clara Moss",
                role: "Sponsorship",
                photo: photo("portraitClara", 360, "4:5"),
              },
              {
                name: "Marcus Hale",
                role: "Volunteers",
                photo: photo("portraitMarcus", 360, "4:5"),
              },
            ],
          },
        },
      }),
      fromPreset("logos/partners-cards@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Partners", text: "Made possible by" },
          "card:1": {
            heading: "Civic Design Lab",
            body: body("Covers the free student and job-seeker places."),
            eyebrow: "Access partner",
          },
          "card:2": {
            heading: "Northland Libraries",
            body: body("Hosts the fringe programme in six branch libraries."),
            eyebrow: "Fringe partner",
          },
          "card:3": {
            heading: "Public Code Co-op",
            body: body("Captions, recordings and the conference app."),
            eyebrow: "Media partner",
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
    "Contact the Open Field team about tickets, group bookings, speaking, sponsorship, press or access needs. Replies within two days.",
    [
      fromPreset("contact/quote-request@1", {
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Ask the organisers" },
          "icon-list": {
            items: [
              { icon: "mail", title: "Replies within two days", text: "From a real organiser." },
              {
                icon: "accessibility",
                title: "Access needs welcome",
                text: "Tell us anything that helps.",
              },
              { icon: "users", title: "Group bookings", text: "Five or more save 15%." },
            ],
          },
          form: {
            form: {
              id: formId(),
              name: "Organiser enquiry",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "select",
                  name: "topic",
                  label: "Topic",
                  required: true,
                  width: "full",
                  options: ["Tickets and groups", "Speaking", "Sponsorship", "Press", "Access"],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Your message",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send",
              success: {
                type: "message",
                message: "Thanks — an organiser will reply within two days.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
      fromPreset("contact/cards-row@1", {
        theme: "light-accent",
        edit: {
          "contact-info:1": {
            headingLevel: "h2",
            heading: "Tickets",
            phone: undefined,
            email: "tickets@openfield.example",
            note: "Orders, invoices, transfers",
          },
          "contact-info:2": {
            headingLevel: "h2",
            heading: "Partners",
            phone: undefined,
            email: "partners@openfield.example",
            note: "Sponsorship and fringe",
          },
          "contact-info:3": {
            headingLevel: "h2",
            heading: "Press",
            address: undefined,
            email: "press@openfield.example",
            note: "Passes and interviews",
          },
        },
      }),
    ],
  );
}

export const gather: TemplateSpec = {
  id: T,
  name: "Gather",
  description:
    "A site for conferences, festivals and events, with a countdown hero, speakers, a day-by-day programme, ticket passes, venue and travel, and fringe events.",
  persona: "Events, festivals & conferences",
  mood: "Energetic, clear, welcoming",
  tags: ["event", "conference", "festival", "tickets", "speakers", "programme"],
  sample: { name: NAME, tagline: "Design for public services · 10–11 June 2027, Minneapolis." },
  thumbnail: P.home,
  looks: [
    {
      id: "marquee",
      name: "Marquee",
      description: "A punchy magenta accent with Unbounded headings and pill buttons.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.22 350)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "unbounded-figtree",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "expressive",
        imageTreatment: "rounded",
      },
    },
    {
      id: "programme",
      name: "Programme",
      description: "Printed-programme feel: Libre Baskerville, a forest accent and sharp rules.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.1 155)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "libre-baskerville-karla",
        density: "comfortable",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "festival",
      name: "Festival",
      description: "Sunny saffron, Syne headings and soft corners for outdoor events.",
      choices: {
        palette: {
          brand: "oklch(0.7 0.15 75)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "syne-dm-sans",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "expressive",
        imageTreatment: "rounded",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "Design for public services · 10–11 June 2027, Minneapolis.",
        nav: [
          { type: "page", page: P.programme, label: "Programme" },
          { type: "page", page: P.speakers, label: "Speakers" },
          { type: "page", page: P.venue, label: "Venue" },
          { type: "page", page: P.about, label: "About" },
          { type: "button", label: "Get tickets", link: page(P.tickets), style: "primary" },
        ],
        header: headerFrom("header/dark-bar@1"),
        footer: fromPreset("footer/signup-dark@1", {
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p("10–11 June 2027 at Mill City Hall, Minneapolis."),
              ),
            },
            newsletter: {
              buttonLabel: "Get updates",
              successMessage: "Thanks — speaker news is on its way.",
            },
            "text:2": {
              content: rt.doc(
                rt.p(
                  [
                    "© 2026 Open Field · ",
                    rt.link("Tickets", href("tickets")),
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
          { network: "linkedin", url: "https://linkedin.com/company/openfield-example" },
          { network: "mastodon", url: "https://mastodon.social/@openfield_example" },
        ],
        seo: {
          titleTemplate: "%s · Open Field 2027",
          description: "A two-day conference on design for public services, Minneapolis.",
          image: photoUrl("auditorium", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), programme(), speakersPage(), tickets(), venue(), about(), contact()],
      collectionConfigs: {
        [FRINGE]: {
          kind: "events",
          label: "Fringe",
          itemLabel: "Fringe event",
          list: { layout: "list", pageSize: 20, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
      },
      collections: {
        [FRINGE]: [
          event(
            "plain-language-pub-quiz",
            {
              title: "Plain-language pub quiz",
              start: "2027-06-09T19:00:00-05:00",
              end: "2027-06-09T21:30:00-05:00",
              timezone: "America/Chicago",
              location: { name: "The Grain Exchange", address: "301 4th Ave S, Minneapolis, MN" },
              price: "Free",
              excerpt:
                "Teams of four rewrite government sentences against the clock. Prizes for the shortest.",
            },
            "Hosted by the Civic Design Lab. Arrive by 6:45 to form teams.\n",
          ),
          event(
            "library-open-studio",
            {
              title: "Open studio at Central Library",
              start: "2027-06-10T18:00:00-05:00",
              end: "2027-06-10T20:00:00-05:00",
              timezone: "America/Chicago",
              location: { name: "Central Library", address: "300 Nicollet Mall, Minneapolis, MN" },
              price: "Free",
              excerpt:
                "See how the library redesigned its card sign-up with the people who use it.",
            },
            "A walk-through with the library's service team, followed by drinks in the atrium.\n",
          ),
          event(
            "morning-run",
            {
              title: "Morning run by the river",
              start: "2027-06-11T07:00:00-05:00",
              end: "2027-06-11T08:00:00-05:00",
              timezone: "America/Chicago",
              location: {
                name: "Mill City Hall terrace",
                address: "704 S 2nd St, Minneapolis, MN",
              },
              price: "Free",
              excerpt: "An easy 5k along the Mississippi before the second day begins.",
            },
            "All paces welcome. Coffee waiting at the finish.\n",
          ),
        ],
      },
    };
  },
};
