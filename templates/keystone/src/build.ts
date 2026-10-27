import type { TemplateSpec } from "../../lib/define";
import { post } from "../../lib/define";
import {
  body,
  collectionPath,
  definePages,
  formId,
  fromPreset,
  headerFrom,
  mail,
  makePage,
  page,
  photo,
  photoUrl,
  rt,
  url,
} from "../../lib/kit";

/**
 * Keystone — consultants and coaches with a personal brand. Type-led and calm: a clear promise,
 * three ways to work together with prices, client results, a short essay list and a discovery
 * call form.
 *
 * Demo owner: Nadia Brooks, a leadership coach for first-time founders.
 */

const T = "keystone";
const PAGES = definePages(T, {
  home: "",
  services: "work-with-me",
  results: "results",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Nadia Brooks";
const NOTES = "notes";
const EMAIL = "hello@nadiabrooks.example";

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Nadia Brooks coaches first-time founders through hiring, growth and the hard conversations. One-to-one coaching, cohorts and team days.",
    [
      fromPreset("hero/big-type@1", {
        primary: page(P.contact),
        secondary: page(P.results),
        edit: {
          heading: { eyebrow: "Leadership coaching for founders", text: "Lead well. Sleep fine." },
          text: {
            content: rt.doc(
              rt.p(
                "I help first-time founders of five-to-fifty-person companies build the habits, team and calm that growth demands — without losing what made the company good.",
                "lead",
              ),
            ),
          },
          button: { label: "Book a discovery call", secondaryLabel: "Client results" },
        },
      }),
      fromPreset("logos/press-band@1", {
        edit: {
          "logo-strip": {
            label: "As heard on",
            logos: [
              { name: "Founders at Dusk" },
              { name: "The Small Giants Show" },
              { name: "Seed to Series A" },
              { name: "Calm Company Radio" },
            ],
          },
        },
      }),
      fromPreset("services/index-list@1", {
        edit: {
          heading: { eyebrow: "Work with me", text: "Three ways in" },
          text: {
            content: rt.doc(
              rt.h(3, "01 — One-to-one coaching", "h3"),
              rt.p(
                "Fortnightly sessions for founders facing a season of growth or change. Three or six months.",
              ),
              rt.h(3, "02 — Founder cohorts", "h3"),
              rt.p("Eight founders, six evenings, one honest room. Peer coaching with structure."),
              rt.h(3, "03 — Leadership team days", "h3"),
              rt.p(
                "A facilitated day to agree priorities, roles and how your team makes decisions.",
              ),
              rt.p([rt.link("Prices and details", href("services"))]),
            ),
          },
        },
      }),
      fromPreset("testimonials/result-cards@1", {
        edit: {
          heading: { eyebrow: "Outcomes", text: "What changes for clients" },
          "text:1": {
            content: rt.doc(
              rt.h(3, "First VP hired", "h1"),
              rt.p("“Hired our first VP with a scorecard instead of a hunch.”"),
              rt.p("Ellis, fintech founder", "small"),
            ),
          },
          "text:2": {
            content: rt.doc(
              rt.h(3, "Ten hours back", "h1"),
              rt.p("“I stopped being the bottleneck and got ten hours a week back.”"),
              rt.p("Priya, climate software", "small"),
            ),
          },
          "text:3": {
            content: rt.doc(
              rt.h(3, "No more 2am emails", "h1"),
              rt.p("“The team started deciding without me — and decided well.”"),
              rt.p("Tom, design agency", "small"),
            ),
          },
        },
      }),
      fromPreset("features/feature-with-review@1", {
        edit: {
          image: {
            image: photo(
              "coachingSession",
              560,
              "4:5",
              "Nadia in a coaching conversation at a small table",
            ),
          },
          heading: { eyebrow: "How I work", text: "Practical, candid, on your side" },
          text: {
            content: rt.doc(
              rt.p(
                "Sessions end with one decision and one experiment. Between them I'm a message away, and I remember what you said three months ago.",
              ),
            ),
          },
          testimonial: {
            quote: body(
              "Nadia asks the question everyone else is too polite to ask, then helps you answer it.",
            ),
            name: "Ellis Moreno",
            role: "Founder, Brightledger",
            photo: photo("portraitJonah", 80, "1:1"),
          },
        },
      }),
      fromPreset("blog/intro-and-list@1", {
        collection: NOTES,
        edit: {
          heading: { eyebrow: "Notes", text: "Short essays for busy founders" },
          text: {
            content: rt.doc(
              rt.p("One idea every fortnight about leading small teams. Five-minute reads."),
            ),
          },
          summary: {
            linkLabel: "All notes",
            link: url(collectionPath(NOTES)),
            emptyMessage: "The next note is being written.",
          },
        },
      }),
      fromPreset("cta/with-testimonial@1", {
        primary: page(P.contact),
        edit: {
          heading: {
            text: "Ready to lead with less strain?",
            subheading: "Discovery calls are free, thirty minutes and pressure-free.",
          },
          button: { label: "Book a discovery call" },
          testimonial: {
            quote: body("The most useful hour of my fortnight, every fortnight, for a year."),
            name: "Priya Natarajan",
            role: "CEO, Saltmarsh Climate",
            photo: photo("portraitMaya", 80, "1:1"),
          },
        },
      }),
    ],
  );
}

function services() {
  return makePage(
    P.services,
    "Work with me",
    "work-with-me",
    "One-to-one coaching, founder cohorts and leadership team days with Nadia Brooks. What's included in each, how it works and prices.",
    [
      fromPreset("hero/centered@1", {
        primary: page(P.contact),
        secondary: page(P.results),
        edit: {
          heading: {
            eyebrow: "Work with me",
            text: "Coaching that fits a founder's week",
            subheading:
              "Every engagement starts with a free call to see whether we're a good fit. If we aren't, I'll suggest someone who is.",
          },
          button: { label: "Book a call", secondaryLabel: "See results" },
        },
      }),
      fromPreset("pricing/dark-columns@1", {
        edit: {
          heading: {
            eyebrow: "Options and prices",
            text: "Three ways to work together",
            subheading:
              "Prices are per founder. Sliding-scale places are available for nonprofits.",
          },
          pricing: {
            plans: [
              {
                name: "One-to-one",
                price: "$1,600",
                period: "per quarter",
                description: "Six ninety-minute sessions over three months.",
                features: [
                  { text: "Messaging between sessions" },
                  { text: "A written plan after session one" },
                ],
                buttonLabel: "Apply",
                link: page(P.contact),
                featured: true,
              },
              {
                name: "Founder cohort",
                price: "$1,200",
                description: "Six evenings with seven other founders.",
                features: [{ text: "Peer coaching circles" }, { text: "Workbook and recordings" }],
                buttonLabel: "Join the waitlist",
                link: page(P.contact),
                featured: false,
              },
              {
                name: "Team day",
                price: "$4,500",
                description: "A facilitated day for up to eight leaders.",
                features: [
                  { text: "Interviews beforehand" },
                  { text: "Follow-up session at six weeks" },
                ],
                buttonLabel: "Enquire",
                link: page(P.contact),
                featured: false,
              },
            ],
            note: "Prices exclude travel for in-person team days outside Chicago.",
          },
        },
      }),
      fromPreset("process/phases-horizontal@1", {
        edit: {
          heading: {
            eyebrow: "One-to-one coaching",
            text: "How the first quarter goes",
            subheading:
              "Most founders work with me for two quarters. Here's the shape of the first.",
          },
          timeline: {
            items: [
              {
                date: "Week 1",
                title: "Discovery",
                text: "Your goals, your team, what keeps you up at night.",
              },
              {
                date: "Weeks 2–6",
                title: "Focus",
                text: "One leadership habit at a time, practised for real.",
              },
              {
                date: "Weeks 7–11",
                title: "Team",
                text: "Delegation, hiring and hard conversations.",
              },
              { date: "Week 12", title: "Review", text: "What changed, and whether to continue." },
            ],
          },
        },
      }),
      fromPreset("features/included-checklist@1", {
        primary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Included",
            text: "What every client gets",
            subheading: "Beyond the sessions, the small things that make coaching stick.",
          },
          "icon-list": {
            items: [
              { icon: "check", title: "A written plan" },
              { icon: "check", title: "Session notes" },
              { icon: "check", title: "Messaging access" },
              { icon: "check", title: "Hiring scorecards" },
              { icon: "check", title: "Meeting templates" },
              { icon: "check", title: "Reading list" },
            ],
          },
          button: { label: "Book a discovery call" },
        },
      }),
      fromPreset("faq/split@1", {
        primary: mail(EMAIL),
        edit: {
          heading: { eyebrow: "FAQ", text: "Questions founders ask" },
          text: { content: rt.doc(rt.p("Something else on your mind? Email me directly.")) },
          button: { label: "Email Nadia" },
          accordion: {
            items: [
              {
                question: "Do you work with co-founders together?",
                answer: body("Yes — joint sessions every few weeks alongside individual ones."),
              },
              {
                question: "Is it confidential?",
                answer: body(
                  "Completely. Even when a company pays, what we discuss stays between us.",
                ),
              },
              {
                question: "Do you meet in person?",
                answer: body("Online by default; in person in Chicago, or for team days anywhere."),
              },
            ],
          },
        },
      }),
    ],
  );
}

function results() {
  return makePage(
    P.results,
    "Results",
    "results",
    "Client results from Nadia Brooks's leadership coaching: case studies, survey numbers and what founders say about working together.",
    [
      fromPreset("hero/minimal-line@1", {
        primary: page(P.contact),
        edit: {
          heading: { text: "Founders who lead calmly build better companies." },
          button: { label: "Start with a call" },
        },
      }),
      fromPreset("portfolio/challenge-approach-outcome@1", {
        edit: {
          heading: { eyebrow: "Case study · Brightledger", text: "From founder-led to team-led" },
          columns: {
            items: [
              {
                heading: "The challenge",
                body: body(
                  "Forty people, every decision still routed through the founder, two senior hires leaving.",
                ),
              },
              {
                heading: "The approach",
                body: body(
                  "Six months of coaching, a decision framework and a new leadership team rhythm.",
                ),
              },
              {
                heading: "The outcome",
                body: body(
                  "Three strong hires, a founder with free afternoons and record retention.",
                ),
              },
            ],
          },
        },
      }),
      fromPreset("portfolio/results-band@1", {
        edit: {
          heading: { eyebrow: "Client survey 2025", text: "After six months of coaching" },
          stats: {
            items: [
              {
                value: "91%",
                label: "Felt more confident leading",
                detail: "From 64 clients surveyed.",
              },
              {
                value: "8 hrs",
                label: "Weekly time saved, median",
                detail: "Mostly fewer meetings.",
              },
              { value: "4.9", label: "Average rating out of five", detail: "Anonymous survey." },
            ],
          },
        },
      }),
      fromPreset("testimonials/logo-quotes@1", {
        edit: {
          heading: { eyebrow: "Clients", text: "In their words" },
          "testimonial:1": {
            quote: body(
              "She helped me become the founder my team needed, not the one I was pretending to be.",
            ),
            name: "Tom Becker",
            role: "Founder, Field Office Design",
            photo: photo("portraitOwen", 80, "1:1"),
          },
          "testimonial:2": {
            quote: body(
              "Our leadership team finally makes decisions without me in the room, and makes them well.",
            ),
            name: "Clara Moss",
            role: "CEO, Parcelly",
            photo: photo("portraitClara", 80, "1:1"),
          },
          "logo-strip": {
            logos: [
              { name: "Brightledger" },
              { name: "Parcelly" },
              { name: "Saltmarsh Climate" },
              { name: "Field Office" },
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
    "Nadia Brooks founded and sold a forty-person company before training as a coach. Her story, beliefs about leadership and clients.",
    [
      fromPreset("hero/personal-intro@1", {
        primary: page(P.services),
        secondary: page(P.contact),
        edit: {
          image: { image: photo("portraitAdvisor", 420, "1:1", "Nadia Brooks, leadership coach") },
          heading: {
            eyebrow: "About",
            text: "I'm Nadia. I've sat in your chair.",
            subheading:
              "I built and sold a forty-person company, made most of the classic mistakes, then trained as a coach so fewer founders have to.",
          },
          button: { label: "Ways to work together", secondaryLabel: "Get in touch" },
        },
      }),
      fromPreset("about/founder-letter@1", {
        edit: {
          heading: { eyebrow: "Why I coach", text: "The job nobody trains you for" },
          text: {
            content: rt.doc(
              rt.p(
                "At twenty-nine I went from writing code to managing twelve people in about six weeks. Nobody told me how; I learned by getting it wrong, loudly.",
              ),
              rt.p(
                "After selling the company I trained with the Co-Active institute and spent two years coaching founders for free while I learned the craft.",
              ),
              rt.p(
                "Now I work with around fifteen founders at a time. It's the best job I've had.",
              ),
              rt.p("— Nadia", "small"),
            ),
          },
        },
      }),
      fromPreset("about/beliefs@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "My approach", text: "What I believe about leading" },
          columns: {
            items: [
              {
                heading: "Clarity is kindness",
                body: body("Most team stress comes from unclear decisions, not hard ones."),
              },
              {
                heading: "Habits beat heroics",
                body: body("Small weekly rhythms outlast any offsite."),
              },
              {
                heading: "You set the weather",
                body: body("A calm founder makes a calm company; the reverse is also true."),
              },
              {
                heading: "Rest is strategy",
                body: body("Tired founders make expensive decisions."),
              },
            ],
          },
        },
      }),
      fromPreset("logos/split-heading@1", {
        edit: {
          heading: { eyebrow: "Clients", text: "Founders I've worked with lead" },
          "logo-strip": {
            logos: [
              { name: "Brightledger" },
              { name: "Parcelly" },
              { name: "Saltmarsh Climate" },
              { name: "Field Office" },
              { name: "Kinfold" },
              { name: "Orchard Pay" },
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
    "Book a free, thirty-minute discovery call with leadership coach Nadia Brooks, or email her directly. Replies within two working days.",
    [
      fromPreset("contact/appointment@1", {
        drop: ["hours"],
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Book a discovery call" },
          text: {
            content: rt.doc(
              rt.p(
                "Thirty minutes to talk about where you are and where you're stuck. Free, and no hard sell — promise.",
              ),
            ),
          },
          form: {
            form: {
              id: formId(),
              name: "Discovery call",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                {
                  type: "text",
                  name: "company",
                  label: "Company and team size",
                  required: false,
                  width: "full",
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "Where are you stuck right now?",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Request a call",
              success: {
                type: "message",
                message: "Thank you — I'll email within two working days with times.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
      fromPreset("contact/simple-centered@1", {
        edit: {
          heading: { eyebrow: "Email", text: "Prefer to write?", level: "h2" },
          text: {
            content: rt.doc(
              rt.p([rt.link(EMAIL, `mailto:${EMAIL}`)], "lead"),
              rt.p("Based in Chicago, coaching founders in any time zone."),
            ),
          },
        },
      }),
    ],
  );
}

export const keystone: TemplateSpec = {
  id: T,
  name: "Keystone",
  description:
    "A calm, type-led site for consultants and coaches, with ways to work together and prices, client results, short essays and a discovery-call form.",
  persona: "Consultants & coaches",
  mood: "Calm, candid, assured",
  tags: ["coach", "consultant", "personal-brand", "services", "case-studies", "booking"],
  sample: { name: NAME, tagline: "Leadership coaching for first-time founders." },
  thumbnail: P.home,
  looks: [
    {
      id: "slate",
      name: "Slate",
      description: "Warm paper, a deep teal accent and Lora headings.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.08 200)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "lora-inter",
        density: "airy",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "clay",
      name: "Clay",
      description: "A terracotta accent, Crimson Pro headings and round pill buttons.",
      choices: {
        palette: {
          brand: "oklch(0.58 0.12 40)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "crimson-figtree",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "circle",
      },
    },
    {
      id: "boardroom",
      name: "Boardroom",
      description: "Ink blue, Manrope throughout and crisp square corners.",
      choices: {
        palette: {
          brand: "oklch(0.4 0.1 260)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "manrope",
        density: "comfortable",
        shape: "sharp",
        buttons: "outline",
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
        tagline: "Leadership coaching for first-time founders.",
        nav: [
          { type: "page", page: P.services, label: "Work with me" },
          { type: "page", page: P.results, label: "Results" },
          { type: "collection", collection: NOTES, label: "Notes" },
          { type: "page", page: P.about, label: "About" },
          { type: "button", label: "Book a call", link: page(P.contact), style: "primary" },
        ],
        header: headerFrom("header/centered-nav@1", { sticky: true }),
        footer: fromPreset("footer/cta-footer@1", {
          theme: "dark",
          primary: page(P.contact),
          edit: {
            heading: { text: "Lead well. Sleep fine. Let's talk." },
            button: { label: "Book a discovery call" },
            text: {
              content: rt.doc(
                rt.p(
                  [
                    "© 2026 Nadia Brooks Coaching · ",
                    rt.link("Work with me", href("services")),
                    " · ",
                    rt.link("Notes", collectionPath(NOTES)),
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
          { network: "linkedin", url: "https://linkedin.com/in/nadiabrooks-example" },
          { network: "bluesky", url: "https://bsky.app/profile/nadiabrooks.example" },
        ],
        seo: {
          titleTemplate: "%s · Nadia Brooks",
          description: "Leadership coaching for first-time founders.",
          image: photoUrl("portraitAdvisor", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), services(), results(), about(), contact()],
      collectionConfigs: {
        [NOTES]: {
          kind: "blog",
          label: "Notes",
          itemLabel: "Note",
          list: { layout: "list", pageSize: 20, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: false, showRelated: true },
          feed: {
            enabled: true,
            title: "Notes by Nadia Brooks",
            description: "Short essays on leading small teams.",
          },
        },
      },
      collections: {
        [NOTES]: [
          post(
            "2026-10-15-the-first-manager",
            {
              title: "Your first manager hire is about you",
              date: "2026-10-15",
              author: NAME,
              excerpt: "Before you hire someone to manage people, decide what you'll stop doing.",
            },
            "Founders hire their first manager hoping to get time back. They rarely do, because they never decided which decisions they'd let go of.\n\nWrite the list first. Then hire.\n",
          ),
          post(
            "2026-10-01-weekly-rhythm",
            {
              title: "A weekly rhythm for teams of ten",
              date: "2026-10-01",
              author: NAME,
              excerpt: "Three short meetings that replace a dozen long ones.",
            },
            "Monday priorities, a Wednesday unblock and a Friday demo. Thirty minutes each, the same time every week.\n\nThe point isn't the meetings — it's that everyone knows when a decision will be made.\n",
          ),
          post(
            "2026-09-17-hard-conversations",
            {
              title: "The hard conversation you're avoiding",
              date: "2026-09-17",
              author: NAME,
              excerpt:
                "Most founders know exactly which conversation they're putting off. Here's a script.",
            },
            "Name what you've noticed, say what it means for the team, ask what's going on, then decide together what happens next.\n\nIt's never as bad as the week of dread before it.\n",
          ),
        ],
      },
    };
  },
};
