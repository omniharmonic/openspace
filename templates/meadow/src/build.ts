import type { TemplateSpec } from "../../lib/define";
import { event, post } from "../../lib/define";
import {
  block,
  body,
  button,
  collectionPath,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  heading,
  linkColumn,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  section,
  text,
  url,
} from "../../lib/kit";

/**
 * Meadow — yoga, therapy, bodywork, wellness (doc 04 §7). Calm, airy, organic: Fraunces /
 * Hanken Grotesk on oat, sage and clay; arched image masks, soft grain, generous whitespace,
 * a weekly class schedule and booking.
 *
 * Demo owner: Fernwood Yoga & Bodywork, a small studio on SE Division Street in Portland run by
 * Hana Moreau.
 */

const T = "meadow";
const PAGES = definePages(T, {
  home: "",
  classes: "classes",
  bodywork: "bodywork",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const ADDRESS = "2418 SE Division Street\nPortland, OR 97202";
const PHONE = "+1 (503) 555-0142";
const EMAIL = "hello@fernwoodyoga.example";
const BOOKING = "https://cal.com/fernwood-yoga";

const hours = [
  { day: "mon", opens: "06:30", closes: "20:30", closed: false },
  { day: "tue", opens: "06:30", closes: "20:30", closed: false },
  { day: "wed", opens: "06:30", closes: "20:30", closed: false },
  { day: "thu", opens: "06:30", closes: "20:30", closed: false },
  { day: "fri", opens: "06:30", closes: "18:00", closed: false },
  { day: "sat", opens: "08:00", closes: "14:00", closed: false },
  { day: "sun", opens: "09:00", closes: "13:00", closed: false },
];

/** One day of the weekly timetable as rich text. */
const day = (...classes: [time: string, name: string, teacher: string][]) =>
  rt.doc(
    ...classes.map(([time, name, teacher]) => rt.p([rt.bold(time), `  ${name} · ${teacher}`])),
  );

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Unhurried yoga classes and therapeutic massage on SE Division Street in Portland. Twelve mats per class, and tea afterwards.",
    [
      fromPreset("hero/arch-window@1", {
        edit: {
          heading: {
            eyebrow: "Yoga & bodywork · SE Portland",
            text: "Slow yoga and bodywork for real bodies",
            subheading:
              "Small, patient classes for every kind of body, and massage therapists who listen first. Twelve mats a class, tea afterwards, and nobody in a hurry.",
          },
          button: {
            label: "See the class schedule",
            link: page(P.classes),
            secondaryLabel: "Book a massage",
            secondaryLink: page(P.bodywork),
            note: "New here? Your first week is $25.",
          },
          image: {
            image: photo(
              "yogaDeck",
              520,
              "4:5",
              "A woman meditating cross-legged on a wooden deck in the early light",
            ),
          },
        },
      }),
      fromPreset("about/values@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "The Fernwood way",
            text: "Come exactly as you are",
            subheading:
              "No mirrors, no performance, no perfect poses. Just a warm room and teachers who meet you where you are today.",
          },
          "icon-list": {
            items: [
              {
                icon: "users",
                title: "Twelve mats, never more",
                text: "Small enough that your teacher learns your name, your knees and what helps on a hard day.",
              },
              {
                icon: "clock",
                title: "Time to arrive",
                text: "Doors open fifteen minutes early so you can settle, stretch and leave the day outside.",
              },
              {
                icon: "leaf",
                title: "Tea after every class",
                text: "A pot of something warm on the bench by the window, and people worth talking to.",
              },
            ],
          },
        },
      }),
      fromPreset("services/alternating@1", {
        theme: "light-accent",
        edit: {
          "image:1": {
            image: photo(
              "beachClass",
              640,
              "original",
              "A small group holding tree pose together on a misty morning",
            ),
          },
          "text:1": {
            content: rt.doc(
              rt.p("Group classes", "eyebrow"),
              rt.h(2, "Thirty classes a week", "h2"),
              rt.p(
                "From a gentle 6:30am flow to Friday-night restorative with bolsters and blankets. Every class offers options, so beginners and long-time students share the same room happily.",
              ),
              rt.p([rt.link("See this week's schedule →", href("classes"))]),
            ),
          },
          "image:2": {
            image: photo(
              "massage",
              640,
              "original",
              "A therapist warming oil in her hands before a back massage",
            ),
          },
          "text:2": {
            content: rt.doc(
              rt.p("Bodywork", "eyebrow"),
              rt.h(2, "Massage that listens", "h2"),
              rt.p(
                "Therapeutic, deep tissue and pregnancy massage with licensed therapists in two quiet rooms upstairs. Sixty or ninety minutes, with evening appointments four nights a week.",
              ),
              rt.p([rt.link("Treatments and prices →", href("bodywork"))]),
            ),
          },
        },
      }),
      fromPreset("testimonials/large-single@1", {
        edit: {
          testimonial: {
            quote: rt.doc(
              rt.p(
                "I walked in with a stiff back and a lot of nerves. A year later I practise three mornings a week, and the people on the mats beside me have become friends.",
              ),
            ),
            name: "Rosalind Achebe",
            role: "Student since 2025",
            photo: photo("portraitClara", 160, "1:1", "Portrait of Rosalind, a Fernwood student"),
          },
        },
      }),
      fromPreset("events/cards@1", {
        theme: "light",
        collection: "workshops",
        edit: {
          events: {
            heading: "Workshops & retreats",
            registerLabel: "Save a place",
            emptyMessage: "New workshops are posted at the start of each season — check back soon.",
            source: { collection: "workshops", filter: { upcoming: true }, limit: 3 },
          },
        },
      }),
      fromPreset("cta/banner@1", {
        edit: {
          heading: {
            text: "New to Fernwood? Start with a week",
            subheading:
              "Seven days of unlimited classes for $25, so you can find the teachers and times that feel right.",
          },
          button: {
            label: "Claim your intro week",
            link: url(BOOKING),
            secondaryLabel: "Gift a class card",
            secondaryLink: page(P.contact),
          },
        },
      }),
    ],
  );
}

function classes() {
  return makePage(
    P.classes,
    "Classes",
    "classes",
    "The weekly class schedule at Fernwood: slow flow, foundations, yin, prenatal and restorative yoga, plus memberships and class cards.",
    [
      section(
        [
          heading("Classes & schedule", {
            level: 1,
            size: "display",
            eyebrow: "Thirty classes a week",
            sub: "Every class is 60 or 75 minutes and capped at twelve students. Book ahead online, or drop in if there's a mat free.",
            align: "center",
          }),
        ],
        { width: "narrow" },
        { theme: "light-accent", padding: { d: "xl", m: "lg" } },
      ),
      section(
        [
          heading("Find a time that fits", {
            eyebrow: "Weekly schedule",
            sub: "The schedule runs all year. Holiday changes are posted in the journal and emailed to students a week ahead.",
            col: 0,
          }),
          text(
            [
              rt.p(
                "Not sure where to start? Foundations and Slow Flow suit complete beginners, and every teacher offers simpler options in every class.",
              ),
            ],
            { col: 0 },
          ),
          button("Book a class", url(BOOKING), { role: "secondary", col: 0 }),
          block(
            "tabs",
            {
              label: "Days of the week",
              items: [
                {
                  label: "Mon",
                  content: day(
                    ["6:30am", "Slow Morning Flow", "Hana"],
                    ["12:15pm", "Lunchtime Stretch (45 min)", "Iris"],
                    ["6:00pm", "Foundations", "Theo"],
                    ["7:30pm", "Yin & Breath", "Iris"],
                  ),
                },
                {
                  label: "Tue",
                  content: day(
                    ["7:00am", "Strong & Steady", "Theo"],
                    ["9:30am", "Prenatal Yoga", "Iris"],
                    ["6:00pm", "Slow Flow", "Hana"],
                  ),
                },
                {
                  label: "Wed",
                  content: day(
                    ["6:30am", "Slow Morning Flow", "Hana"],
                    ["12:15pm", "Lunchtime Stretch (45 min)", "Theo"],
                    ["7:30pm", "Restorative", "Hana"],
                  ),
                },
                {
                  label: "Thu",
                  content: day(
                    ["7:00am", "Strong & Steady", "Theo"],
                    ["9:30am", "Prenatal Yoga", "Iris"],
                    ["6:00pm", "Foundations", "Hana"],
                  ),
                },
                {
                  label: "Fri",
                  content: day(
                    ["6:30am", "Slow Morning Flow", "Iris"],
                    ["5:30pm", "Restorative & Tea", "Hana"],
                  ),
                },
                {
                  label: "Sat",
                  content: day(
                    ["8:30am", "Foundations", "Theo"],
                    ["10:15am", "Slow Flow", "Hana"],
                    ["12:00pm", "Postnatal & Baby", "Iris"],
                  ),
                },
                {
                  label: "Sun",
                  content: day(
                    ["9:30am", "Yin & Breath", "Iris"],
                    ["11:15am", "Community Class (by donation)", "Theo"],
                  ),
                },
              ],
            },
            { variant: "underline", col: 1 },
          ),
        ],
        { cols: [5, 7], gap: "lg" },
        { theme: "light", preset: "services/tabs@1", label: "Weekly schedule" },
      ),
      fromPreset("pricing/three-plans@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Memberships & passes",
            text: "Practise as often as you like",
            subheading: "No joining fee and no contracts. Pause or cancel with a month's notice.",
          },
          pricing: {
            plans: [
              {
                name: "Drop-in",
                price: "$22",
                period: "per class",
                description: "For an occasional class or a visit from out of town.",
                features: [
                  { text: "Any group class" },
                  { text: "Mats and props provided" },
                  { text: "Valid for 30 days" },
                ],
                buttonLabel: "Buy a drop-in",
                link: url(BOOKING),
                featured: false,
              },
              {
                name: "Unlimited",
                price: "$128",
                period: "per month",
                description: "For a steady practice, as many classes as you like.",
                features: [
                  { text: "Unlimited group classes" },
                  { text: "A guest pass every month" },
                  { text: "15% off workshops and massage" },
                ],
                buttonLabel: "Become a member",
                link: url(BOOKING),
                featured: true,
                badge: "Most popular",
              },
              {
                name: "Ten-class card",
                price: "$190",
                period: "10 classes",
                description: "For a practice that comes and goes with the seasons.",
                features: [
                  { text: "Shareable with family" },
                  { text: "Valid for six months" },
                  { text: "Use for any class" },
                ],
                buttonLabel: "Buy a card",
                link: url(BOOKING),
                featured: false,
              },
            ],
            note: "Students, teachers and healthcare workers save 20% on memberships.",
          },
        },
      }),
      section(
        [
          block(
            "booking",
            {
              url: `${BOOKING}/class`,
              provider: "cal",
              heading: "Book your mat online",
              headingLevel: "h2",
              description:
                "Reserve up to two weeks ahead and cancel free until two hours before class. We hold three mats in every class for drop-ins.",
              buttonLabel: "Open the booking calendar",
              height: "760",
            },
            { variant: "split" },
          ),
        ],
        {},
        { theme: "light" },
      ),
      fromPreset("faq/centered@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "First class", text: "Before you come" },
          accordion: {
            items: [
              {
                question: "I've never done yoga. Which class should I take?",
                answer: body(
                  "Foundations or Slow Flow. Both move gently and explain each pose, and your teacher will offer simpler options whenever you need them.",
                ),
              },
              {
                question: "What should I bring?",
                answer: body(
                  "Comfortable clothes and a water bottle. Mats, blocks, bolsters and blankets are all provided and cleaned between classes.",
                ),
              },
              {
                question: "Can I come if I'm pregnant or recovering from an injury?",
                answer: body(
                  "Yes. Tell your teacher before class. Prenatal Yoga is ideal from the second trimester, and our massage therapists can suggest classes that suit your recovery.",
                ),
              },
              {
                question: "Is the studio accessible?",
                answer: body(
                  "The main studio is on the ground floor with step-free access and an accessible restroom. The bodywork rooms are upstairs; ask us about ground-floor appointments.",
                ),
              },
            ],
          },
        },
      }),
    ],
  );
}

function bodywork() {
  return makePage(
    P.bodywork,
    "Bodywork",
    "bodywork",
    "Therapeutic, deep tissue, pregnancy and lymphatic massage with licensed therapists at Fernwood in SE Portland. Evening appointments available.",
    [
      fromPreset("hero/split-image@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Massage & bodywork",
            text: "Hands-on care, at your pace",
            subheading:
              "Licensed massage therapists in two quiet rooms above the studio. Every appointment starts with a conversation about what hurts, what helps and how you'd like to feel afterwards.",
          },
          button: {
            label: "Book a treatment",
            link: url(BOOKING),
            secondaryLabel: "Meet the therapists",
            secondaryLink: page(P.bodywork, "therapists"),
            note: "Evening appointments Monday to Thursday.",
          },
          image: {
            image: photo("massage", 600, "4:5", "A therapist preparing warm oil for a massage"),
            style: { imageTreatment: "arch" },
          },
        },
      }),
      fromPreset("services/price-list@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Treatments",
            text: "Treatments & prices",
            subheading:
              "Members save 15% on every treatment. Most extended health plans reimburse massage by a licensed therapist; ask for a receipt.",
          },
          button: { label: "Book a treatment", link: url(BOOKING) },
          "restaurant-menu": {
            sections: [
              {
                title: "Massage",
                items: [
                  {
                    name: "Therapeutic massage · 60 min",
                    description: "Relaxing, whole-body work with long, steady strokes.",
                    price: "95",
                    dietary: [],
                  },
                  {
                    name: "Deep tissue · 60 min",
                    description: "Slow, focused pressure for stubborn knots and old injuries.",
                    price: "110",
                    dietary: [],
                  },
                  {
                    name: "Pregnancy massage · 60 min",
                    description: "Side-lying with plenty of pillows, from the second trimester.",
                    price: "100",
                    dietary: [],
                  },
                ],
              },
              {
                title: "Bodywork",
                items: [
                  {
                    name: "Lymphatic drainage · 60 min",
                    description:
                      "Very light, rhythmic work that eases swelling after surgery or travel.",
                    price: "105",
                    dietary: [],
                  },
                  {
                    name: "Yoga therapy · 60 min",
                    description: "One-to-one movement and breath work shaped around your body.",
                    price: "90",
                    dietary: [],
                  },
                ],
              },
            ],
            currency: "$",
            footnote:
              "Ninety-minute sessions are available for every massage. Cancel free up to 24 hours before.",
          },
        },
      }),
      fromPreset("team/bios@1", {
        theme: "light-accent",
        anchor: "therapists",
        edit: {
          heading: { eyebrow: "Bodywork team", text: "Your therapists" },
          team: {
            people: [
              {
                name: "Daniel Reyes, LMT",
                role: "Deep tissue & sports massage",
                photo: photo("portraitDaniel", 220, "4:5", "Portrait of Daniel Reyes"),
                bio: "Daniel worked with runners and rock climbers for eight years before joining Fernwood. He is patient with old injuries and good at explaining what he finds.",
              },
              {
                name: "Iris Okonjo, LMT",
                role: "Pregnancy & lymphatic massage",
                photo: photo("portraitIris", 220, "4:5", "Portrait of Iris Okonjo"),
                bio: "Iris is a certified prenatal massage therapist and also teaches our prenatal yoga classes, so she knows exactly what a tired, pregnant back needs.",
              },
            ],
          },
        },
      }),
      fromPreset("cta/split@1", {
        edit: {
          heading: { eyebrow: "Appointments", text: "Ready for an hour to yourself?" },
          button: {
            label: "Book a treatment",
            link: url(BOOKING),
            note: "Online booking, or call the front desk.",
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
    "Fernwood Yoga & Bodywork opened on SE Division Street in 2016. Meet founder Hana Moreau, our teachers and the story of the studio.",
    [
      fromPreset("about/story-split@1", {
        theme: "light",
        edit: {
          image: {
            image: photo("portraitAna", 520, "4:5", "Portrait of Hana Moreau, founder of Fernwood"),
            style: { imageTreatment: "arch" },
          },
          heading: {
            eyebrow: "Our story",
            text: "A studio built around slowing down",
            level: "h1",
            size: "h1",
          },
          text: {
            content: rt.doc(
              rt.p(
                "Hana Moreau taught her first class in 2012, in a borrowed church hall with eight mats and a space heater. She had spent ten years as a nurse and had seen how rarely people are given time to notice their own bodies.",
              ),
              rt.p(
                "Fernwood opened in 2016 with one room, one teacher and a kettle. Today there are six teachers, two massage therapists and thirty classes a week, but the rules are the same: small classes, patient teaching, and tea afterwards for anyone who wants to stay.",
              ),
            ),
          },
          button: { label: "Meet the teachers", link: page(P.about, "teachers") },
        },
      }),
      fromPreset("about/milestones@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Ten years on Division Street",
            text: "How Fernwood grew",
            subheading: "One room became two, and a weekly class became a small community.",
          },
          timeline: {
            items: [
              {
                date: "2016",
                title: "The first room",
                text: "Hana signs the lease on a former florist's shop and teaches every class herself.",
              },
              {
                date: "2018",
                title: "Teachers join",
                text: "Theo and Iris arrive, and the schedule grows from eight classes to twenty.",
              },
              {
                date: "2021",
                title: "Bodywork upstairs",
                text: "Two treatment rooms open above the studio for massage and yoga therapy.",
              },
              {
                date: "Today",
                title: "Thirty classes a week",
                text: "Still twelve mats per class, still tea afterwards, still on Division Street.",
              },
            ],
          },
        },
      }),
      fromPreset("team/circles@1", {
        theme: "light",
        anchor: "teachers",
        edit: {
          heading: { eyebrow: "Meet us", text: "Your teachers" },
          team: {
            people: [
              {
                name: "Hana Moreau",
                role: "Founder · Slow flow",
                photo: photo("portraitAna", 280, "1:1", "Portrait of Hana Moreau"),
              },
              {
                name: "Theo Nakamura",
                role: "Foundations & strength",
                photo: photo("portraitTheo", 280, "1:1", "Portrait of Theo Nakamura"),
              },
              {
                name: "Iris Okonjo",
                role: "Prenatal & yin",
                photo: photo("portraitIris", 280, "1:1", "Portrait of Iris Okonjo"),
              },
            ],
          },
        },
      }),
      fromPreset("gallery/carousel@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "The studio", text: "A look around" },
          gallery: {
            images: [
              {
                image: photo("yogaMats", 420, "4:5", "Rolled mats in a woven basket by a plant"),
                caption: "Mats and props for everyone",
              },
              {
                image: photo(
                  "coffeeTable",
                  420,
                  "4:5",
                  "Two warm drinks on a small table with herbs",
                ),
                caption: "Tea on the window bench",
              },
              {
                image: photo("massage", 420, "4:5", "A treatment room prepared for a massage"),
                caption: "The upstairs treatment room",
              },
              {
                image: photo(
                  "beachClass",
                  420,
                  "4:5",
                  "A small group practising tree pose on the beach",
                ),
                caption: "Summer retreat at Manzanita",
              },
            ],
          },
        },
      }),
    ],
    { image: photoUrl("yogaMats", 1200) },
  );
}

function contact() {
  return makePage(
    P.contact,
    "Contact",
    "contact",
    "Find Fernwood Yoga & Bodywork at 2418 SE Division Street, Portland. Opening hours, directions and a contact form for questions.",
    [
      fromPreset("contact/form-split@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Contact",
            text: "Questions? We'd love to hear from you",
            level: "h1",
            subheading:
              "The front desk answers messages within a day, usually sooner. For bookings, the online calendar is quickest.",
          },
          "contact-info": {
            name: "Fernwood Yoga & Bodywork",
            address: ADDRESS,
            phone: PHONE,
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
                  label: "What's it about?",
                  width: "full",
                  options: [
                    "Classes & memberships",
                    "Massage & bodywork",
                    "Workshops & retreats",
                    "Gift cards",
                    "Something else",
                  ],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Message",
                  required: true,
                  maxLength: 2000,
                },
              ],
              submitLabel: "Send message",
              success: { type: "message", message: "Thank you — we'll reply within a day." },
              notifyOwner: true,
            },
          },
        },
      }),
      fromPreset("contact/location@1", {
        edit: {
          map: {
            name: "Fernwood Yoga & Bodywork",
            address: "2418 SE Division Street, Portland, OR 97202",
            latitude: 45.5048,
            longitude: -122.6406,
          },
          heading: { eyebrow: "Visit", text: "Find the studio" },
          hours: {
            rows: hours,
            note: "Front desk hours. Bike racks out front; street parking on 24th and 25th.",
          },
          "contact-info": { address: ADDRESS, phone: PHONE, email: EMAIL },
        },
      }),
    ],
  );
}

export const meadow: TemplateSpec = {
  id: T,
  name: "Meadow",
  description:
    "A calm, airy site for yoga studios, therapists and bodyworkers, with a weekly class schedule, treatments and online booking.",
  persona: "Yoga, therapy, bodywork, wellness",
  mood: "Calm, airy, organic",
  tags: ["wellness", "yoga", "massage", "schedule", "booking", "classes"],
  sample: { name: "Fernwood Yoga & Bodywork", tagline: "Slow yoga and bodywork for real bodies." },
  thumbnail: P.home,
  looks: [
    {
      id: "oat-sage",
      name: "Oat & Sage",
      description:
        "Sage on oat paper with a clay accent, Fraunces headings and arched photographs.",
      choices: {
        palette: {
          brand: "oklch(0.62 0.07 145)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "fraunces-hanken",
        density: "airy",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "grain",
      },
      overrides: { color: { accent: { $value: "oklch(0.55 0.12 40)", $type: "color" } } },
    },
    {
      id: "clay-linen",
      name: "Clay & Linen",
      description:
        "Sun-baked terracotta with DM Serif headings, rounded corners and outlined buttons.",
      choices: {
        palette: {
          brand: "oklch(0.6 0.11 45)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "dm-serif-dm-sans",
        density: "comfortable",
        shape: "round",
        buttons: "pill-outline",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "dusk",
      name: "Dusk",
      description:
        "Soft lavender and cool greys with Libre Caslon, for an evening, restorative feel.",
      choices: {
        palette: {
          brand: "oklch(0.7 0.1 300)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "libre-caslon-nunito-sans",
        density: "airy",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "arch",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: "Fernwood Yoga & Bodywork",
        tagline: "Slow yoga and bodywork for real bodies.",
        nav: [
          { type: "page", page: P.classes, label: "Classes" },
          { type: "page", page: P.bodywork, label: "Bodywork" },
          { type: "collection", collection: "workshops", label: "Workshops" },
          { type: "collection", collection: "journal", label: "Journal" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
          { type: "button", label: "Book a class", link: url(BOOKING), style: "primary" },
        ],
        header: headerFrom("header/classic@1"),
        footer: fromPreset("footer/newsletter@1", {
          edit: {
            newsletter: {
              heading: "Letters from the studio",
              description:
                "One short email a month: new classes, workshops and the occasional recipe for the tea.",
              buttonLabel: "Subscribe",
              successMessage: "Thank you — check your inbox to confirm.",
            },
            "text:1": {
              content: rt.doc(
                ...linkColumn("Practice", [
                  ["Class schedule", href("classes")],
                  ["Bodywork", href("bodywork")],
                  ["Workshops", collectionPath("workshops")],
                  ["Journal", collectionPath("journal")],
                ]),
              ),
            },
            "text:2": {
              content: rt.doc(
                rt.p("Visit", "eyebrow"),
                rt.p("2418 SE Division Street, Portland"),
                rt.p([rt.link(EMAIL, `mailto:${EMAIL}`)]),
                rt.p("© 2026 Fernwood Yoga & Bodywork", "small"),
              ),
            },
            "social-links": { profiles: [] },
          },
        }),
        social: [
          { network: "instagram", url: "https://instagram.com/fernwoodyoga.example" },
          { network: "youtube", url: "https://youtube.com/@fernwoodyoga.example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Fernwood Yoga",
          description:
            "Sage on oat paper with clay-coloured buttons and links, Fraunces headings and arched photographs.",
          image: photoUrl("yogaDeck", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: BOOKING, stripeConnected: false },
      },
      pages: [home(), classes(), bodywork(), about(), contact()],
      collectionConfigs: {
        journal: {
          kind: "blog",
          label: "Journal",
          slugPattern: "{date}-{title}",
          list: { layout: "cards", pageSize: 12, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: true },
          taxonomies: {
            categories: [
              { slug: "practice", label: "Practice" },
              { slug: "studio", label: "Studio news" },
            ],
            tags: true,
          },
          feed: {
            enabled: true,
            title: "The Fernwood Journal",
            description: "Notes on practice, rest and the studio.",
          },
        },
        workshops: {
          kind: "events",
          label: "Workshops",
          itemLabel: "Workshop",
          list: { layout: "cards", pageSize: 12, sort: "date-asc" },
          itemPage: { layout: "split" },
        },
      },
      collections: {
        journal: [
          post(
            "2026-10-12-why-twelve-mats",
            {
              title: "Why we stop at twelve mats",
              date: "2026-10-12",
              author: "Hana Moreau",
              categories: ["studio"],
              tags: ["teaching", "community"],
              image: photoUrl("yogaMats", 1600),
              imageAlt: "Rolled mats in a woven basket, ready for class",
              excerpt: "Twelve is a choice, not a limit. Here's what a small room makes possible.",
            },
            `People sometimes ask why we don't squeeze in a few more mats. The honest answer: twelve is the most people one teacher can really *see*.

With twelve students I can notice who is protecting a shoulder, who needs a blanket under their knees and who has quietly stopped breathing in a twist. With twenty, I'd be teaching to the middle of the room.

## What small classes make possible

- Real options for every pose, offered to the person who needs them
- Time to learn names, and to remember them next week
- A room calm enough that nervous beginners stay

Twelve mats also means some classes fill up. Book ahead when you can, and know that we always hold three mats for drop-ins.
`,
          ),
          post(
            "2026-09-28-a-practice-for-dark-mornings",
            {
              title: "A ten-minute practice for dark mornings",
              date: "2026-09-28",
              author: "Iris Okonjo",
              categories: ["practice"],
              tags: ["home practice", "autumn"],
              image: photoUrl("yogaDeck", 1600),
              imageAlt: "A woman meditating on a wooden deck at sunrise",
              excerpt: "Five gentle shapes to do before the kettle boils, as the mornings draw in.",
            },
            `When the mornings get dark, the hardest part of practice is getting out from under the duvet. So make it small.

1. **Child's pose**, five slow breaths.
2. **Cat and cow**, moving with the breath, eight rounds.
3. **Low lunge** each side, hands on blocks or a pile of books.
4. **Standing forward fold** with soft knees, swaying side to side.
5. **Sit for one minute** and notice three things you can hear.

That's it. Ten minutes, maybe less, and the day starts a little kinder.
`,
          ),
          post(
            "2026-09-02-meet-daniel",
            {
              title: "Meet Daniel, our new massage therapist",
              date: "2026-09-02",
              author: "Hana Moreau",
              categories: ["studio"],
              tags: ["bodywork", "team"],
              image: photoUrl("massage", 1600),
              imageAlt: "A therapist preparing warm oil before a massage",
              excerpt: "Eight years with runners and climbers, and a very calm pair of hands.",
            },
            `Daniel Reyes joins the bodywork team this month. He spent eight years working with runners and rock climbers, and he is very good at explaining what he finds.

> "Most pain has a story. I like to hear it before I start."

Daniel takes deep tissue and sports massage appointments on Tuesday and Thursday evenings and Saturday mornings. Members save 15% on every treatment.
`,
          ),
        ],
        workshops: [
          event(
            "winter-solstice-restorative",
            {
              title: "Winter solstice restorative",
              start: "2026-12-20T17:00:00-08:00",
              end: "2026-12-20T19:00:00-08:00",
              timezone: "America/Los_Angeles",
              location: {
                name: "Fernwood Yoga & Bodywork",
                address: "2418 SE Division Street, Portland",
              },
              registrationUrl: BOOKING,
              price: "$35",
              image: photoUrl("yogaSilhouette", 1600),
              imageAlt: "A person holding a low lunge at dusk",
              excerpt:
                "Two hours of long, supported poses by candlelight on the longest night of the year.",
            },
            "Bolsters, blankets and very little effort. We finish with a short guided rest and a warm spiced tea.\n",
          ),
          event(
            "foundations-four-weeks",
            {
              title: "Foundations: a four-week course",
              start: "2027-01-09T10:00:00-08:00",
              end: "2027-01-30T11:30:00-08:00",
              timezone: "America/Los_Angeles",
              location: {
                name: "Fernwood Yoga & Bodywork",
                address: "2418 SE Division Street, Portland",
              },
              registrationUrl: BOOKING,
              price: "$120 for four Saturdays",
              image: photoUrl("yogaMats", 1600),
              imageAlt: "Mats and props ready for the Saturday course",
              excerpt:
                "Four Saturday mornings for complete beginners: breath, alignment and how to rest.",
            },
            "Each week builds on the last. By the end you'll feel at home in any Fernwood class. Mats and props provided.\n",
          ),
          event(
            "manzanita-spring-retreat",
            {
              title: "Spring retreat at Manzanita",
              start: "2027-04-16T16:00:00-07:00",
              end: "2027-04-18T13:00:00-07:00",
              timezone: "America/Los_Angeles",
              location: { name: "Neahkahnie House", address: "Manzanita, Oregon" },
              registrationUrl: BOOKING,
              price: "From $540, meals included",
              image: photoUrl("beachClass", 1600),
              imageAlt: "A small group practising tree pose on a misty beach",
              excerpt:
                "Three days on the coast: morning practice on the sand, long walks and shared meals.",
            },
            "Twelve places, shared or private rooms, and every meal cooked for us. Suitable for every level.\n",
          ),
          event(
            "breath-and-rest-workshop",
            {
              title: "Breath & rest: a Sunday workshop",
              start: "2027-02-21T13:00:00-08:00",
              end: "2027-02-21T16:00:00-08:00",
              timezone: "America/Los_Angeles",
              location: {
                name: "Fernwood Yoga & Bodywork",
                address: "2418 SE Division Street, Portland",
              },
              registrationUrl: BOOKING,
              price: "$45",
              image: photoUrl("yogaDeck", 1600),
              imageAlt: "A woman sitting cross-legged in meditation at sunrise",
              excerpt:
                "Three hours of simple breathing practices and guided rest you can take home.",
            },
            "We cover four breathing practices for sleep, stress and focus, then finish with forty minutes of yoga nidra.\n",
          ),
        ],
      },
    };
  },
};
