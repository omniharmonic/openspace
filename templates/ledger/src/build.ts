import type { TemplateSpec } from "../../lib/define";
import { post, project } from "../../lib/define";
import { pageId } from "../../lib/ids";
import {
  block,
  body,
  formId,
  fromPreset,
  headerFrom,
  linkColumn,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  section,
  url,
} from "../../lib/kit";

/**
 * Ledger — consultants, coaches and freelancers (doc 04 §7). Crisp, editorial, confident:
 * Source Serif 4 / IBM Plex Sans in ink, ivory and deep green; case studies with challenge,
 * approach and outcome, services framed by the results they produce, and a booking call to
 * action on every page.
 *
 * Demo owner: Naomi Calder of Calder Advisory, an operations consultant in Minneapolis.
 */

const T = "ledger";
const P = {
  home: pageId(T, "home"),
  services: pageId(T, "services"),
  about: pageId(T, "about"),
  contact: pageId(T, "contact"),
};

const NAME = "Calder Advisory";
const EMAIL = "naomi@calderadvisory.example";
const BOOKING = "https://cal.com/calder-advisory/intro";

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Calder Advisory helps founder-led companies of 20 to 200 people fix operations, hire leaders and plan growth without the chaos.",
    [
      fromPreset("hero/big-type@1", {
        style: { padding: { d: "3xl", m: "xl" } },
        edit: {
          0: { eyebrow: "Operations advisory · Minneapolis", text: "Calm operations for companies that grew fast" },
          1: {
            content: rt.doc(
              rt.p(
                "I help founder-led businesses of 20 to 200 people untangle their operations, hire the right leaders and plan the next stage of growth, so the founder can stop being the bottleneck.",
                "lead",
              ),
            ),
          },
          2: {
            label: "Book an intro call",
            link: url(BOOKING),
            secondaryLabel: "Read the case studies",
            secondaryLink: url("/case-studies/"),
          },
        },
      }),
      fromPreset("logos/row@1", {
        theme: "light-accent",
        edit: {
          0: {
            label: "Recent clients",
            logos: [
              { name: "Larkspur Foods" },
              { name: "Ostrander Clinics" },
              { name: "Twin Rivers Outfitters" },
              { name: "Mercer & Lowe" },
              { name: "Fieldwork Coffee" },
            ],
          },
        },
      }),
      fromPreset("services/accordion-detail@1", {
        edit: {
          0: {
            eyebrow: "Services",
            text: "Three ways to work together",
            subheading: "Every engagement is scoped around one outcome you can measure, with a fixed fee agreed up front.",
          },
          1: { label: "See services and fees", link: page(P.services) },
          2: {
            items: [
              {
                question: "Operations reset",
                answer: body(
                  "A twelve-week project to map how work really flows, remove the bottlenecks and set up the few rituals and dashboards that keep it running.",
                  rt.p([rt.bold("Outcome: "), "the founder spends half as many hours on day-to-day decisions."]),
                ),
              },
              {
                question: "Leadership hiring",
                answer: body(
                  "Defining the role, running the search alongside your recruiter and onboarding your first COO, head of operations or finance lead.",
                  rt.p([rt.bold("Outcome: "), "a leader in seat within four months, with a 90-day plan."]),
                ),
              },
              {
                question: "Fractional COO",
                answer: body(
                  "Two days a week inside your team for six months, running the operating cadence while you hire or grow into the role.",
                  rt.p([rt.bold("Outcome: "), "a steady quarter, and a playbook the next leader can inherit."]),
                ),
              },
            ],
          },
        },
      }),
      fromPreset("stats/cards@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "Outcomes",
            text: "What changes for clients",
            subheading: "Measured with each client twelve months after the engagement ends.",
          },
          1: {
            items: [
              { value: "48%", label: "Fewer founder hours on operations", detail: "Average across 22 operations resets since 2021." },
              { value: "4 mo", label: "To a leader in seat", detail: "Median time from kickoff to a signed senior hire." },
              { value: "91%", label: "Hires still in role", detail: "Leaders placed since 2020 who are still there today." },
            ],
          },
        },
      }),
      fromPreset("blog/latest-grid@1", {
        collection: "case-studies",
        edit: {
          0: {
            heading: "Case studies",
            source: { collection: "case-studies", sort: "date-desc", limit: 3 },
            linkLabel: "All case studies",
            link: url("/case-studies/"),
            showDate: false,
            showExcerpt: true,
            emptyMessage: "New case studies are being written up — check back soon.",
          },
        },
      }),
      fromPreset("testimonials/pair@1", {
        theme: "light-accent",
        edit: {
          0: { eyebrow: "Clients", text: "In their words" },
          1: {
            quote: rt.doc(
              rt.p(
                "Naomi found the three meetings that were eating our week and the one report nobody read. Within a quarter I was back to working on the business instead of in it.",
              ),
            ),
            name: "Priya Raman",
            role: "Founder & CEO, Larkspur Foods",
            photo: photo("portraitIris", 160, "1:1", "Portrait of Priya Raman"),
          },
          2: {
            quote: rt.doc(
              rt.p(
                "We'd failed twice to hire a COO. Naomi helped us write the role we actually needed, and the person we hired is still here three years later.",
              ),
            ),
            name: "Daniel Ostrander",
            role: "Managing partner, Ostrander Clinics",
            photo: photo("portraitDaniel", 160, "1:1", "Portrait of Daniel Ostrander"),
          },
        },
      }),
      fromPreset("cta/split@1", {
        edit: {
          0: { eyebrow: "Start here", text: "Thirty minutes, no slides, no pitch" },
          1: { label: "Book an intro call", link: url(BOOKING), note: "Free. Usually within the week." },
        },
      }),
    ],
  );
}

function services() {
  return makePage(
    P.services,
    "Services",
    "services",
    "Operations resets, leadership hiring and fractional COO support from Calder Advisory, each with a fixed fee and a measurable outcome.",
    [
      fromPreset("hero/split-image@1", {
        theme: "light",
        edit: {
          0: {
            eyebrow: "Services",
            text: "Fixed fees, measurable outcomes",
            subheading:
              "Before we start, we agree on one result you'll be able to see in a year. Then I scope the smallest piece of work that gets you there.",
          },
          1: {
            label: "Book an intro call",
            link: url(BOOKING),
            secondaryLabel: "How engagements run",
            secondaryLink: page(P.services, "process"),
            note: "Taking two new clients for spring 2027.",
          },
          2: { image: photo("workshop", 600, "4:5", "Planning a project with sticky notes on a wall") },
        },
      }),
      fromPreset("services/tabs@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "Engagements",
            text: "Choose the shape of the work",
            subheading: "Most clients start with an operations reset. Some go on to hire, and a few keep me on as a fractional COO.",
          },
          1: {
            label: "Engagement types",
            items: [
              {
                label: "Operations reset",
                content: rt.doc(
                  rt.p("Twelve weeks · from $28,000"),
                  rt.ul(
                    "Interviews with every team lead and a map of how decisions really get made",
                    "A new weekly operating rhythm, with three meetings at most",
                    "One page of metrics the leadership team actually reads",
                  ),
                  rt.p([rt.bold("Outcome: "), "fewer decisions waiting on the founder, measured monthly."]),
                ),
              },
              {
                label: "Leadership hiring",
                content: rt.doc(
                  rt.p("Four months · from $22,000"),
                  rt.ul(
                    "A role scorecard written with your board and leadership team",
                    "Shortlist interviews and work samples alongside your recruiter",
                    "A 90-day onboarding plan for the new leader",
                  ),
                  rt.p([rt.bold("Outcome: "), "a senior hire in seat, set up to succeed."]),
                ),
              },
              {
                label: "Fractional COO",
                content: rt.doc(
                  rt.p("Six months · $9,500 per month"),
                  rt.ul(
                    "Two days a week with your team, on site or remote",
                    "Running the operating cadence and quarterly planning",
                    "A written playbook for your next operations leader",
                  ),
                  rt.p([rt.bold("Outcome: "), "a calm, predictable quarter while you grow or hire."]),
                ),
              },
            ],
          },
        },
      }),
      fromPreset("services/steps@1", {
        anchor: "process",
        theme: "light",
        edit: {
          0: { eyebrow: "Process", text: "How every engagement runs" },
          1: {
            items: [
              { heading: "Diagnose", body: body("Two weeks of interviews, shadowing and reading your numbers. You get a written diagnosis whether or not we go further.") },
              { heading: "Agree the outcome", body: body("We choose one measurable result and the smallest scope of work that will reach it, at a fixed fee.") },
              { heading: "Do the work, then leave", body: body("I work alongside your team, hand over everything in writing and check in at three and twelve months.") },
            ],
          },
          2: { label: "Book an intro call", link: url(BOOKING) },
        },
      }),
      fromPreset("faq/split@1", {
        theme: "light-accent",
        edit: {
          0: { eyebrow: "FAQ", text: "Good questions to ask" },
          1: { content: rt.doc(rt.p("Anything else? Ask on the intro call; there's no obligation to go further.")) },
          2: { label: "Book a call", link: url(BOOKING) },
          3: {
            items: [
              {
                question: "What size of company do you work with?",
                answer: body("Usually 20 to 200 people, founder-led, growing faster than its systems. Industry matters less than stage."),
              },
              {
                question: "Do you work outside Minneapolis?",
                answer: body("Yes. About half my clients are elsewhere in the US; I travel for the diagnosis weeks and work remotely otherwise."),
              },
              {
                question: "How do fees work?",
                answer: body("Fixed fees, half at kickoff and half at the midpoint. No hourly billing and no surprise invoices."),
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
    "Naomi Calder spent fifteen years running operations at growing companies before founding Calder Advisory in 2019.",
    [
      fromPreset("team/founder-overlap@1", {
        edit: {
          0: { image: photo("portraitNina", 520, "original", "Portrait of Naomi Calder by a sunlit window") },
          1: {
            content: rt.doc(
              rt.p("About", "eyebrow"),
              rt.h(1, "Naomi Calder", "h1"),
              rt.p(
                "I spent fifteen years inside growing companies: first as an analyst at a regional grocery chain, then as COO of a 180-person outdoor retailer through three acquisitions. I started Calder Advisory in 2019 to help founders get through the awkward middle of growth with fewer scars than I collected.",
              ),
              rt.p("I live in south Minneapolis with my partner, two teenagers and a very old dog."),
            ),
          },
          2: { label: "Book an intro call", link: url(BOOKING), role: "primary" },
        },
      }),
      fromPreset("about/two-column-text@1", {
        theme: "light-accent",
        edit: {
          0: {
            eyebrow: "Approach",
            text: "Fewer meetings, clearer owners",
            subheading: "Most operational pain comes from decisions without owners. My work is mostly finding them and writing them down.",
          },
          1: {
            content: rt.doc(
              rt.p(
                "I don't arrive with a framework to install. I start by listening: to the founder, to the managers and to the people closest to customers. Patterns appear quickly. The same three decisions always wait on the same person, and the same weekly meeting always runs long.",
              ),
              rt.p(
                "Then we change as little as possible. A clear owner for each decision, a short weekly rhythm and a single page of numbers fix more than any software rollout. When I leave, the new way of working is written down and owned by your team, not by me.",
              ),
            ),
          },
        },
      }),
      fromPreset("about/milestones@1", {
        edit: {
          0: { eyebrow: "Background", text: "Before Calder Advisory", subheading: "Twenty years of operations work, mostly in retail and food." },
          1: {
            items: [
              { date: "2004", title: "Analyst, Kowalczyk Markets", text: "Store operations and supply planning for a 30-store regional grocery chain." },
              { date: "2011", title: "Head of operations, Twin Rivers Outfitters", text: "Grew the team from 40 to 180 people across retail, e-commerce and a warehouse." },
              { date: "2016", title: "COO, Twin Rivers Outfitters", text: "Led the business through three acquisitions and a move to a new distribution center." },
              { date: "2019", title: "Calder Advisory", text: "Forty-one clients since, from clinics and coffee roasters to software firms." },
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
    "Book a free 30-minute intro call with Naomi Calder, or send a note about your company and what's getting in the way.",
    [
      fromPreset("contact/form-split@1", {
        theme: "light",
        edit: {
          0: {
            eyebrow: "Contact",
            text: "Let's talk about your company",
            level: "h1",
            subheading: "A few sentences about your company and what's getting in the way is plenty. I reply within two working days.",
          },
          1: { name: NAME, address: "Minneapolis, Minnesota", phone: "+1 (612) 555-0107", email: EMAIL },
          2: {
            form: {
              id: formId(),
              name: "Enquiry",
              fields: [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                { type: "email", name: "email", label: "Work email", required: true, width: "half" },
                { type: "text", name: "company", label: "Company", width: "half" },
                {
                  type: "select",
                  name: "size",
                  label: "Team size",
                  width: "half",
                  options: ["Under 20", "20 – 50", "50 – 200", "Over 200"],
                },
                { type: "textarea", name: "message", label: "What's getting in the way?", required: true, maxLength: 3000 },
              ],
              submitLabel: "Send note",
              success: { type: "message", message: "Thank you. I'll reply within two working days." },
              notifyOwner: true,
            },
          },
        },
      }),
      section(
        [
          block(
            "booking",
            {
              url: BOOKING,
              provider: "cal",
              heading: "Book a 30-minute intro call",
              headingLevel: "h2",
              description:
                "Pick a time that suits you. We'll talk about your company, what's slowing it down and whether I'm the right person to help. No slides and no pitch.",
              buttonLabel: "See available times",
              height: "760",
            },
            { variant: "split" },
          ),
        ],
        {},
        { theme: "light-accent", padding: { d: "xl", m: "lg" } },
      ),
    ],
  );
}

const caseStudy = (
  slug: string,
  title: string,
  client: string,
  year: number,
  excerpt: string,
  cover: "teamTable" | "meeting" | "officeDesks",
  sections: { challenge: string; approach: string[]; outcome: string; quote: [string, string] },
) =>
  project(
    slug,
    {
      title,
      date: `${year}-09-01`,
      year,
      client,
      role: "Operations reset",
      excerpt,
      image: photoUrl(cover, 1600),
      imageAlt: `${client}: ${title}`,
    },
    `## The challenge

${sections.challenge}

## What we did

${sections.approach.map((a) => `- ${a}`).join("\n")}

## The outcome

${sections.outcome}

{% quote attribution="${sections.quote[1]}" %}
${sections.quote[0]}
{% /quote %}
`,
  );

export const ledger: TemplateSpec = {
  id: T,
  name: "Ledger",
  description:
    "A crisp, editorial site for consultants, coaches and freelancers, with case studies, services framed by outcomes and a booking call to action.",
  persona: "Consultants, coaches, freelancers",
  mood: "Crisp, editorial, confident",
  tags: ["consulting", "coaching", "professional services", "case studies", "booking"],
  sample: { name: NAME, tagline: "Calm operations for companies that grew fast." },
  thumbnail: P.home,
  looks: [
    {
      id: "ledger-green",
      name: "Ledger Green",
      description: "Ink and ivory with a deep green accent, Source Serif headings and crisp square corners.",
      choices: {
        palette: { brand: "oklch(0.42 0.08 160)", neutral: "warm", contrast: "standard", source: "curated" },
        pairing: "source-serif-plex",
        density: "comfortable",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "ink-blue",
      name: "Ink Blue",
      description: "Fountain-pen blue with Libre Baskerville and Karla, for a quieter, literary tone.",
      choices: {
        palette: { brand: "oklch(0.35 0.08 265)", neutral: "cool", contrast: "standard", source: "curated" },
        pairing: "libre-baskerville-karla",
        density: "comfortable",
        shape: "soft",
        buttons: "outline",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "modern",
      name: "Modern",
      description: "Space Grotesk and Inter on cool greys with a teal accent and rounded buttons.",
      choices: {
        palette: { brand: "oklch(0.5 0.09 200)", neutral: "cool", contrast: "standard", source: "brand" },
        pairing: "space-grotesk-inter",
        density: "compact",
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
        tagline: "Calm operations for companies that grew fast.",
        nav: [
          { type: "page", page: P.services, label: "Services" },
          { type: "collection", collection: "case-studies", label: "Case studies" },
          { type: "collection", collection: "insights", label: "Insights" },
          { type: "page", page: P.about, label: "About" },
          { type: "button", label: "Book a call", link: page(P.contact), style: "primary" },
        ],
        header: headerFrom("header/classic@1"),
        footer: fromPreset("footer/columns@1", {
          edit: {
            0: {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p("Operations advice for founder-led companies of 20 to 200 people. Based in Minneapolis, working across the US."),
              ),
            },
            1: { profiles: [] },
            2: {
              content: rt.doc(
                ...linkColumn("Work", [
                  ["Services", "/services/"],
                  ["Case studies", "/case-studies/"],
                  ["Insights", "/insights/"],
                ]),
              ),
            },
            3: {
              content: rt.doc(
                ...linkColumn("Studio", [
                  ["About", "/about/"],
                  ["Contact", "/contact/"],
                ]),
              ),
            },
            4: {
              content: rt.doc(
                rt.p("Monthly letter", "eyebrow"),
                rt.p(["One short essay on running a growing company, the first Monday of each month. ", rt.link("Read past letters", "/insights/")]),
                rt.p("© 2026 Calder Advisory LLC", "small"),
              ),
            },
          },
        }),
        social: [
          { network: "linkedin", url: "https://linkedin.com/in/naomicalder-example" },
          { network: "email", url: `mailto:${EMAIL}` },
        ],
        seo: {
          titleTemplate: "%s · Calder Advisory",
          description: "Operations advice for founder-led companies of 20 to 200 people.",
          image: photoUrl("meeting", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: BOOKING, stripeConnected: false },
      },
      pages: [home(), services(), about(), contact()],
      collectionConfigs: {
        "case-studies": {
          kind: "portfolio",
          label: "Case studies",
          itemLabel: "Case study",
          list: { layout: "cards", pageSize: 12, sort: "date-desc" },
          itemPage: { layout: "article", showRelated: true },
        },
        insights: {
          kind: "blog",
          label: "Insights",
          slugPattern: "{date}-{title}",
          list: { layout: "list", pageSize: 12, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: false, showRelated: true },
          feed: { enabled: true, title: "Calder Advisory insights", description: "Essays on running a growing company." },
        },
      },
      collections: {
        "case-studies": [
          caseStudy(
            "larkspur-foods",
            "Getting the founder out of every decision",
            "Larkspur Foods",
            2026,
            "A 90-person food maker where every purchase over $500 waited on the founder's inbox.",
            "teamTable",
            {
              challenge:
                "Larkspur had grown from a farmers' market stall to 90 people and three product lines in five years. Every purchase, hire and price change still went through Priya, the founder, who was answering email at midnight.",
              approach: [
                "Mapped 140 recurring decisions and gave each one a single owner",
                "Replaced six weekly meetings with one 50-minute leadership meeting",
                "Built a one-page weekly scorecard from data the team already had",
              ],
              outcome:
                "Within a quarter, decisions waiting on the founder fell from 30 a week to 6. Priya now spends Fridays on product development, which is why she started the company.",
              quote: ["I got my Fridays back, and the team makes better calls than I did.", "Priya Raman, founder"],
            },
          ),
          caseStudy(
            "ostrander-clinics",
            "A COO search that finally worked",
            "Ostrander Clinics",
            2025,
            "Two failed hires, one clear scorecard and a COO who is still there.",
            "meeting",
            {
              challenge:
                "Ostrander Clinics had hired two COOs in three years and lost both within a year. The partners agreed they needed help, but not on what the role actually was.",
              approach: [
                "Facilitated three working sessions to write a shared role scorecard",
                "Ran structured interviews and a paid work sample with four finalists",
                "Wrote a 90-day onboarding plan and coached the new COO through it",
              ],
              outcome:
                "The new COO started in four months and has now led the group through two clinic openings. Patient wait times are down by a third.",
              quote: ["For the first time, we agreed on what we were hiring for.", "Daniel Ostrander, managing partner"],
            },
          ),
          caseStudy(
            "fieldwork-coffee",
            "Six months as a fractional COO",
            "Fieldwork Coffee",
            2025,
            "Steadying a roaster and four cafés while the founders searched for a permanent operations lead.",
            "officeDesks",
            {
              challenge:
                "Fieldwork's head of operations left two weeks before their busiest season, with a new café opening and a wholesale contract to deliver.",
              approach: [
                "Ran the weekly operating meeting and quarterly planning for six months",
                "Rebuilt the roasting schedule around wholesale orders",
                "Wrote the operations playbook and helped hire the permanent lead",
              ],
              outcome: "The café opened on time, wholesale orders shipped complete and the new operations lead inherited a written playbook on day one.",
              quote: ["Naomi kept the wheels on while we caught our breath.", "Jonah Mercer, co-founder"],
            },
          ),
        ],
        insights: [
          post(
            "2026-10-05-the-decision-log",
            {
              title: "Keep a decision log, not more meetings",
              date: "2026-10-05",
              categories: [],
              tags: ["operations"],
              excerpt: "The cheapest operations tool I know is a shared document with four columns.",
            },
            `Most teams don't have a meeting problem. They have a memory problem: nobody can remember what was decided, so it gets decided again.

A decision log fixes that. Four columns: **the decision**, **who owns it**, **when**, and **why**. Keep it in a shared document and link to it from every meeting agenda.

After a month, you'll notice which decisions keep coming back, and that tells you where ownership is unclear.
`,
          ),
          post(
            "2026-09-07-hiring-your-first-coo",
            {
              title: "Before you hire your first COO",
              date: "2026-09-07",
              tags: ["hiring", "leadership"],
              excerpt: "Three questions to answer before you write the job description.",
            },
            `Founders usually start a COO search with a job description. Start with these questions instead:

1. Which decisions do you want to stop making?
2. Which ones will you never give up?
3. How will you know, in a year, that the hire worked?

If your leadership team answers them differently, the search will fail however good the candidates are.
`,
          ),
          post(
            "2026-08-10-one-page-of-numbers",
            {
              title: "One page of numbers",
              date: "2026-08-10",
              tags: ["metrics"],
              excerpt: "Why the best scorecards fit on a single sheet of paper.",
            },
            `If your weekly report needs scrolling, nobody reads the bottom half. Pick the eight numbers that would change a decision this week, put them on one page, and show the trend next to each one.

Everything else can live in a dashboard for the people who need it.
`,
          ),
        ],
      },
    };
  },
};

