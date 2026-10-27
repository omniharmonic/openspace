import type { TemplateSpec } from "../../lib/define";
import {
  body,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  tel,
} from "../../lib/kit";

/**
 * Fixwell — local service businesses: plumbers, electricians, cleaners, salons. Built to get the
 * phone ringing: a call button in the first screen and on every page, trust points, published
 * rates, a service-area map, reviews and a quote form that asks the right questions.
 *
 * Demo owner: Fixwell Plumbing & Electric, a family firm in north Denver.
 */

const T = "fixwell";
const PAGES = definePages(T, {
  home: "",
  services: "services",
  pricing: "pricing",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Fixwell Plumbing & Electric";
const PHONE = "+13035550148";
const PHONE_LABEL = "Call (303) 555‑0148";

const quoteForm = () => ({
  id: formId(),
  name: "Quote request",
  fields: [
    {
      type: "text" as const,
      name: "name",
      label: "Your name",
      required: true,
      width: "half" as const,
    },
    {
      type: "phone" as const,
      name: "phone",
      label: "Phone",
      required: true,
      width: "half" as const,
    },
    {
      type: "email" as const,
      name: "email",
      label: "Email",
      required: false,
      width: "full" as const,
    },
    {
      type: "select" as const,
      name: "job",
      label: "What do you need?",
      required: true,
      width: "full" as const,
      options: [
        "A leak or blockage",
        "Electrical fault",
        "Water heater",
        "Bathroom or kitchen project",
        "Something else",
      ],
    },
    {
      type: "textarea" as const,
      name: "message",
      label: "Tell us a little more",
      required: false,
      maxLength: 3000,
    },
  ],
  submitLabel: "Get my quote",
  success: {
    type: "message" as const,
    message: "Thanks! We'll call you back within two working hours.",
  },
  notifyOwner: true,
});

const phoneBand = (heading: string, eyebrow: string) =>
  fromPreset("cta/phone-band@1", {
    edit: {
      heading: { text: heading, eyebrow },
      button: { label: PHONE_LABEL, link: tel(PHONE) },
    },
  });

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Licensed plumbers and electricians in north Denver. Same-day repairs, fixed prices before we start and a two-year labour guarantee.",
    [
      fromPreset("hero/local-service@1", {
        primary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Plumbing & electrical · North Denver",
            text: "Fixed today, at the price we quoted",
            subheading:
              "A family firm of licensed plumbers and electricians, on the road seven days a week across north Denver and Wheat Ridge.",
          },
          button: { label: PHONE_LABEL, link: tel(PHONE), secondaryLabel: "Ask for a quote" },
          "icon-list": {
            items: [
              { icon: "shield-check", title: "Licensed and fully insured" },
              { icon: "clock", title: "Same-day visits, seven days" },
              { icon: "check", title: "A fixed price before work starts" },
            ],
          },
          image: {
            image: photo(
              "electrician",
              520,
              "4:5",
              "A Fixwell electrician working on a wall panel",
            ),
          },
        },
      }),
      fromPreset("stats/inline-strip@1", {
        theme: "light-accent",
        edit: {
          stats: {
            items: [
              { value: "4.9★", label: "From 640 local reviews" },
              { value: "1998", label: "Family-run since" },
              { value: "2 yrs", label: "Labour guarantee" },
              { value: "7 days", label: "Emergency call-outs" },
            ],
          },
        },
      }),
      fromPreset("services/dark-icon-cards@1", {
        edit: {
          heading: {
            eyebrow: "Services",
            text: "Pipes, wires and everything in between",
            subheading: "One call for the jobs that usually need two tradespeople.",
          },
          "card:1": {
            heading: "Leaks and blockages",
            body: body("Burst pipes, dripping taps and slow drains found and fixed the same day."),
            icon: "droplet",
            link: page(P.services, "repairs"),
            linkLabel: "Repairs",
          },
          "card:2": {
            heading: "Water heaters",
            body: body("Repairs, replacements and tankless upgrades with permits handled."),
            icon: "flame",
            link: page(P.services, "repairs"),
            linkLabel: "Water heaters",
          },
          "card:3": {
            heading: "Electrical work",
            body: body("Faults, rewires, new circuits and EV chargers by licensed electricians."),
            icon: "zap",
            link: page(P.services, "repairs"),
            linkLabel: "Electrical",
          },
          "card:4": {
            heading: "Bathrooms",
            body: body("Complete bathroom renovations from one team, in about three weeks."),
            icon: "home",
            link: page(P.services, "bathrooms"),
            linkLabel: "Renovations",
          },
        },
      }),
      fromPreset("process/step-cards@1", {
        theme: "light",
        primary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "How it works",
            text: "Booked, fixed, guaranteed",
            subheading: "Most repairs are done within a day of your first call.",
          },
          "card:1": {
            heading: "Call or ask for a quote",
            body: body("Tell us what's wrong and we'll give you a time slot, often the same day."),
            icon: "phone",
            eyebrow: "Step one",
          },
          "card:2": {
            heading: "A fixed price first",
            body: body("We look, explain the fix and agree the price before any work starts."),
            icon: "shield-check",
            eyebrow: "Step two",
          },
          "card:3": {
            heading: "Done and tidied",
            body: body("We fix it, test it, clean up and guarantee the labour for two years."),
            icon: "check",
            eyebrow: "Step three",
          },
          button: { label: "Request a quote" },
        },
      }),
      fromPreset("testimonials/rating-bar@1", {
        edit: {
          stats: { items: [{ value: "4.9 / 5", label: "From 640 reviews" }] },
          "testimonial:1": {
            quote: body("Arrived within the hour and the bill was exactly the quote."),
            name: "Dana R.",
            role: "Burst pipe, Highland",
          },
          "testimonial:2": {
            quote: body("Rewired our 1920s bungalow and left it spotless."),
            name: "Kofi B.",
            role: "Rewire, Berkeley",
          },
        },
      }),
      fromPreset("services/areas-served@1", {
        primary: page(P.contact),
        edit: {
          map: { name: NAME, address: "2150 West 32nd Avenue, Denver, CO 80211" },
          heading: { eyebrow: "Service area", text: "Where we work" },
          text: {
            content: rt.doc(
              rt.p(
                "Same-day visits across Highland, Berkeley, Sunnyside, Sloan's Lake, Wheat Ridge and Edgewater. Further afield? Call — if we can get there in half an hour, we'll come.",
              ),
            ),
          },
          button: { label: "Ask about your street" },
        },
      }),
      phoneBand("Water where it shouldn't be?", "Emergency call-outs, seven days"),
    ],
  );
}

function services() {
  return makePage(
    P.services,
    "Services",
    "services",
    "Plumbing repairs, water heaters, electrical work, EV chargers and bathroom renovations by Fixwell in north Denver, with fixed prices.",
    [
      fromPreset("hero/split-form@1", {
        edit: {
          heading: {
            eyebrow: "Services",
            text: "Tell us what's wrong, we'll do the rest",
            subheading:
              "Licensed plumbers and electricians for repairs, upgrades and full renovations.",
          },
          "icon-list": {
            items: [
              { icon: "check", title: "Call-back within two hours" },
              { icon: "check", title: "Fixed price before we start" },
              { icon: "check", title: "Two-year labour guarantee" },
            ],
          },
          form: { form: quoteForm() },
        },
      }),
      fromPreset("services/accordion-image@1", {
        anchor: "repairs",
        edit: {
          image: {
            image: photo("toolWall", 480, "4:5", "Tools hanging neatly on the van's pegboard"),
          },
          heading: { eyebrow: "Repairs", text: "Repairs and upgrades" },
          accordion: {
            items: [
              {
                question: "Leaks and burst pipes",
                answer: body(
                  "Found with thermal cameras, not crowbars. Most fixed within the first hour.",
                ),
              },
              {
                question: "Blocked drains",
                answer: body(
                  "Cleared with jetting and checked with a drain camera so it stays clear.",
                ),
              },
              {
                question: "Water heaters",
                answer: body(
                  "Same-day repairs; tank and tankless replacements usually within two days.",
                ),
              },
              {
                question: "Electrical faults",
                answer: body(
                  "Tripping breakers, dead sockets and flickering lights, traced and fixed safely.",
                ),
              },
              {
                question: "EV chargers",
                answer: body(
                  "Load check, permit and installation for any charger, usually in one visit.",
                ),
              },
            ],
            openFirst: true,
          },
        },
      }),
      fromPreset("services/detail-split@1", {
        anchor: "bathrooms",
        primary: page(P.contact),
        edit: {
          image: {
            image: photo(
              "bathroom",
              480,
              "4:5",
              "A bathroom Fixwell renovated, with a glass shower",
            ),
          },
          heading: { eyebrow: "From $13,900", text: "Bathroom renovations" },
          text: {
            content: rt.doc(
              rt.p(
                "Plumbing, electrics, tiling and fitting by one team with one project lead, finished in about three weeks.",
              ),
            ),
          },
          "icon-list": {
            items: [
              { icon: "check", title: "Design visit and layout" },
              { icon: "check", title: "All trades, one lead" },
              { icon: "check", title: "Waste removal and clean" },
              { icon: "check", title: "Five-year workmanship guarantee" },
            ],
          },
          button: { label: "Book a design visit" },
        },
      }),
      fromPreset("faq/two-column@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "FAQ", text: "Before you book" },
          "accordion:1": {
            items: [
              {
                question: "Is there a call-out fee?",
                answer: body(
                  "$95, which covers the first hour of work. Nothing extra for travel within our area.",
                ),
              },
              {
                question: "Are you licensed?",
                answer: body(
                  "Every plumber and electrician holds a Colorado licence. We're insured for $2 million.",
                ),
              },
            ],
          },
          "accordion:2": {
            items: [
              {
                question: "Do you work on weekends?",
                answer: body("Yes. Evenings and weekends are charged at time and a half."),
              },
              {
                question: "How do I pay?",
                answer: body(
                  "Card, bank transfer or check when the job is done. No deposits for repairs.",
                ),
              },
            ],
          },
        },
      }),
      phoneBand("Need someone today?", "Same-day visits"),
    ],
  );
}

function pricing() {
  return makePage(
    P.pricing,
    "Prices",
    "pricing",
    "Fixwell's published rates: call-out, hourly rates, fixed-price jobs and maintenance plans. Plumbing and electrical prices in north Denver.",
    [
      fromPreset("hero/centered@1", {
        primary: page(P.contact),
        secondary: tel(PHONE),
        edit: {
          heading: {
            eyebrow: "Prices",
            text: "Honest prices, published",
            subheading:
              "Our standard rates are below. For bigger jobs we'll visit and give you a fixed price in writing.",
          },
          button: { label: "Get a written quote", secondaryLabel: PHONE_LABEL },
        },
      }),
      fromPreset("pricing/rate-card@1", {
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "Rates", text: "Standard rates" },
          text: {
            content: rt.doc(
              rt.p(
                "We always confirm the price before starting. Parts are charged at cost, with the receipt attached to your invoice.",
              ),
            ),
          },
          button: { label: "Ask for a quote" },
          table: {
            corner: "Job",
            columns: [{ label: "Price", highlight: false }],
            rows: [
              { label: "Call-out and first hour", group: false, cells: [{ value: "$95" }] },
              { label: "Each extra half hour", group: false, cells: [{ value: "$45" }] },
              { label: "Evenings and weekends", group: false, cells: [{ value: "+50%" }] },
              { label: "Tap or toilet repair", group: false, cells: [{ value: "From $85" }] },
              {
                label: "Water heater replacement",
                group: false,
                cells: [{ value: "From $1,450" }],
              },
              { label: "EV charger installation", group: false, cells: [{ value: "From $890" }] },
            ],
            note: "All prices include tax.",
          },
        },
      }),
      fromPreset("services/service-table@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Maintenance plans",
            text: "Keep small problems small",
            subheading:
              "Yearly check-ups for your plumbing and electrics, with priority booking all year.",
          },
          table: {
            caption: "Maintenance plans compared",
            columns: [
              { label: "Essential", detail: "$12 / month", highlight: false },
              { label: "Complete", detail: "$22 / month", highlight: true },
            ],
            rows: [
              {
                label: "Annual plumbing check",
                group: false,
                cells: [{ value: "yes" }, { value: "yes" }],
              },
              {
                label: "Annual electrical check",
                group: false,
                cells: [{ value: "no" }, { value: "yes" }],
              },
              {
                label: "Water heater flush",
                group: false,
                cells: [{ value: "yes" }, { value: "yes" }],
              },
              {
                label: "Priority booking",
                group: false,
                cells: [{ value: "yes" }, { value: "yes" }],
              },
              {
                label: "Discount on repairs",
                group: false,
                cells: [{ value: "10%" }, { value: "15%" }],
              },
            ],
          },
        },
      }),
      fromPreset("faq/dark-minimal@1", {
        edit: {
          heading: { eyebrow: "Pricing FAQ", text: "Money questions" },
          text: { content: rt.doc(rt.p("Still unsure? Call and we'll talk it through.")) },
          accordion: {
            items: [
              {
                question: "Why publish prices?",
                answer: body(
                  "Because you should know roughly what a job costs before you pick up the phone.",
                ),
              },
              {
                question: "What if the job takes longer?",
                answer: body(
                  "Fixed-price jobs stay fixed. Hourly jobs never go over without your OK.",
                ),
              },
              {
                question: "Do you offer finance?",
                answer: body("For renovations over $5,000, yes — twelve months interest-free."),
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
    "Fixwell is a family-run plumbing and electrical firm in north Denver since 1998. Meet the crew, see our licences and read reviews.",
    [
      fromPreset("hero/split-image@1", {
        primary: page(P.contact),
        secondary: page(P.services),
        edit: {
          heading: {
            eyebrow: "About Fixwell",
            text: "A family firm that answers its own phone",
            subheading:
              "Jo Kowalski's dad started Fixwell with one van in 1998. Today there are nine of us, and we still turn up when we say we will.",
          },
          button: {
            label: "Get a quote",
            secondaryLabel: "Our services",
            note: "Licensed in Colorado since 1998.",
          },
          image: {
            image: photo("electricPanel", 620, "4:5", "A Fixwell electrician wiring a cabinet"),
          },
        },
      }),
      fromPreset("team/hiring@1", {
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "The crew", text: "Who'll turn up at your door" },
          team: {
            people: [
              {
                name: "Jo Kowalski",
                role: "Owner and master plumber",
                photo: photo("portraitClara", 360, "4:5"),
              },
              {
                name: "Marcus Hale",
                role: "Lead electrician",
                photo: photo("portraitMarcus", 360, "4:5"),
              },
              { name: "Sam Ortiz", role: "Plumber", photo: photo("portraitSam", 360, "4:5") },
            ],
          },
          card: {
            heading: "We're hiring an apprentice",
            body: body("Paid training towards your plumbing licence, a van and a four-day week."),
            link: page(P.contact),
            linkLabel: "Get in touch",
          },
          button: { label: "Join the crew" },
        },
      }),
      fromPreset("about/recognition@1", {
        edit: {
          heading: { eyebrow: "Credentials", text: "Licensed, insured, recommended" },
          text: {
            content: rt.doc(
              rt.p("Copies of every licence and certificate are available on request."),
            ),
          },
          "icon-list": {
            items: [
              {
                icon: "shield-check",
                title: "Colorado master plumber licence",
                text: "Number MP.0041177.",
              },
              { icon: "zap", title: "Licensed master electrician", text: "Number ME.0029930." },
              {
                icon: "award",
                title: "Neighbourhood Business of the Year, 2025",
                text: "North Denver Chamber.",
              },
              {
                icon: "star",
                title: "4.9 stars from 640 reviews",
                text: "On the major review sites.",
              },
            ],
          },
        },
      }),
      fromPreset("testimonials/three-cards@1", {
        edit: {
          heading: { eyebrow: "Reviews", text: "What neighbours say" },
          "testimonial:1": {
            quote: body(
              "They found the leak without tearing up the floor. Fair price, lovely people.",
            ),
            name: "Grace Liu",
            role: "Highland",
            photo: photo("portraitIris", 80, "1:1"),
          },
          "testimonial:2": {
            quote: body(
              "Our water heater died on Christmas Eve. Fixwell had a new one in by lunchtime.",
            ),
            name: "Daniel Okoro",
            role: "Sunnyside",
            photo: photo("portraitDaniel", 80, "1:1"),
          },
          "testimonial:3": {
            quote: body(
              "Quoted, booked and finished our bathroom on schedule. Highly recommended.",
            ),
            name: "Maya Chen",
            role: "Wheat Ridge",
            photo: photo("portraitMaya", 80, "1:1"),
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
    "Call Fixwell on (303) 555-0148 or ask for a written quote online. Same-day plumbing and electrical visits across north Denver.",
    [
      fromPreset("contact/quote-request@1", {
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Get a written quote, free" },
          "icon-list": {
            items: [
              {
                icon: "phone",
                title: "Call-back within two hours",
                text: "Monday to Saturday, 7am to 7pm.",
              },
              {
                icon: "home",
                title: "A free visit for big jobs",
                text: "Usually within two days.",
              },
              {
                icon: "shield-check",
                title: "The price, in writing",
                text: "What we quote is what you pay.",
              },
            ],
          },
          form: { form: quoteForm() },
        },
      }),
      fromPreset("contact/map-wide@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Visit", text: "Our yard and office" },
          map: {
            name: NAME,
            address: "2150 West 32nd Avenue, Denver, CO 80211",
            latitude: 39.7617,
            longitude: -105.0136,
            linkLabel: "Get directions",
          },
          "contact-info": {
            address: "2150 W 32nd Ave\nDenver, CO 80211",
            phone: "+1 (303) 555-0148",
            email: "jobs@fixwell.example",
          },
          hours: {
            heading: "Office hours",
            rows: [
              { day: "mon", opens: "07:00", closes: "19:00", closed: false },
              { day: "tue", opens: "07:00", closes: "19:00", closed: false },
              { day: "wed", opens: "07:00", closes: "19:00", closed: false },
              { day: "thu", opens: "07:00", closes: "19:00", closed: false },
              { day: "fri", opens: "07:00", closes: "19:00", closed: false },
              { day: "sat", opens: "08:00", closes: "16:00", closed: false },
              { day: "sun", closed: true },
            ],
            note: "Emergency call-outs answered around the clock.",
          },
        },
      }),
    ],
  );
}

export const fixwell: TemplateSpec = {
  id: T,
  name: "Fixwell",
  description:
    "A phone-first site for local trades and services, with a call button on every page, trust points, published rates, a service-area map and a quote form.",
  persona: "Local services: trades, cleaners, salons",
  mood: "Dependable, direct, local",
  tags: ["local", "trades", "plumber", "electrician", "services", "quotes"],
  sample: { name: NAME, tagline: "Licensed plumbers and electricians in north Denver." },
  thumbnail: P.home,
  looks: [
    {
      id: "workwear",
      name: "Workwear",
      description: "Navy and safety orange with Archivo — sturdy and easy to read.",
      choices: {
        palette: {
          brand: "oklch(0.62 0.18 45)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "archivo",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "fresh",
      name: "Fresh",
      description:
        "A clean teal, Plus Jakarta Sans and round pill buttons — for cleaners and salons.",
      choices: {
        palette: {
          brand: "oklch(0.58 0.12 190)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "plus-jakarta",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "heritage",
      name: "Heritage",
      description:
        "Forest green, Zilla Slab headings and square corners — an old-school family firm.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.09 160)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "zilla-slab-inter",
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
      site: {
        title: NAME,
        tagline: "Licensed plumbers and electricians in north Denver.",
        nav: [
          { type: "page", page: P.services, label: "Services" },
          { type: "page", page: P.pricing, label: "Prices" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
          { type: "button", label: "Call now", link: tel(PHONE), style: "primary" },
        ],
        header: headerFrom("header/classic@1", { sticky: true }),
        footer: fromPreset("footer/hours-footer@1", {
          theme: "dark",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p("2150 W 32nd Ave, Denver"),
                rt.p([rt.link("(303) 555‑0148", "tel:+13035550148")]),
              ),
            },
            hours: {
              heading: "Office hours",
              rows: [
                { day: "mon", opens: "07:00", closes: "19:00", closed: false },
                { day: "tue", opens: "07:00", closes: "19:00", closed: false },
                { day: "wed", opens: "07:00", closes: "19:00", closed: false },
                { day: "thu", opens: "07:00", closes: "19:00", closed: false },
                { day: "fri", opens: "07:00", closes: "19:00", closed: false },
                { day: "sat", opens: "08:00", closes: "16:00", closed: false },
                { day: "sun", closed: true },
              ],
            },
            "text:2": {
              content: rt.doc(
                rt.p("More", "eyebrow"),
                rt.p([rt.link("Services", href("services"))]),
                rt.p([rt.link("Prices", href("pricing"))]),
                rt.p("© 2026 Fixwell Plumbing & Electric LLC", "small"),
              ),
            },
          },
        }),
        social: [
          { network: "facebook", url: "https://facebook.com/fixwell.example" },
          { network: "instagram", url: "https://instagram.com/fixwell.example" },
        ],
        seo: {
          titleTemplate: "%s · Fixwell",
          description: "Licensed plumbers and electricians in north Denver.",
          image: photoUrl("electrician", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), services(), pricing(), about(), contact()],
    };
  },
};
