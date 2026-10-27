import type { TemplateSpec } from "../../lib/define";
import { post, project } from "../../lib/define";
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
 * Folio — a personal site and résumé. One person, clearly: a friendly introduction, selected
 * projects, experience as a timeline, skills, references, writing and a way to get in touch.
 *
 * Demo owner: Priya Raman, a product designer who works on data tools.
 */

const T = "folio";
const PAGES = definePages(T, {
  home: "",
  experience: "experience",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Priya Raman";
const PROJECTS = "projects";
const WRITING = "writing";
const EMAIL = "hello@priyaraman.example";

const projects = [
  {
    slug: "harbour-health-dashboards",
    title: "Dashboards nurses actually use",
    year: 2026,
    client: "Harbour Health",
    excerpt:
      "Redesigning ward dashboards with nurses so the important number is the first thing you see.",
    cover: "dashboardLight" as const,
    gallery: ["analytics", "teamOffice", "whiteboard"] as const,
  },
  {
    slug: "open-budget",
    title: "The city budget, readable",
    year: 2025,
    client: "City of Lakewood",
    excerpt:
      "An interactive budget that residents can explore in two minutes, now used at every town hall.",
    cover: "planningBoard" as const,
    gallery: ["whiteboard", "meeting", "deskSetup"] as const,
  },
  {
    slug: "field-notes-app",
    title: "A field notebook for ecologists",
    year: 2024,
    client: "Northland Conservation",
    excerpt: "An offline-first app for recording plant surveys in places with no signal.",
    cover: "forest" as const,
    gallery: ["forest", "meadow", "seedlings"] as const,
  },
  {
    slug: "transit-times",
    title: "Bus times you can trust",
    year: 2023,
    client: "Kitebase",
    excerpt:
      "Arrival predictions that admit uncertainty, so riders know when to run and when to wait.",
    cover: "city" as const,
    gallery: ["street", "developer", "deskMinimal"] as const,
  },
];

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Priya Raman is a product designer who makes data tools clear for nurses, planners and scientists. Projects, experience and writing.",
    [
      fromPreset("hero/personal-intro@1", {
        primary: url(collectionPath(PROJECTS)),
        secondary: page(P.contact),
        edit: {
          image: { image: photo("portraitFounder", 420, "1:1", "Priya Raman") },
          heading: {
            eyebrow: "Product designer · Pittsburgh",
            text: "Hi, I'm Priya. I make data feel obvious.",
            subheading:
              "Nine years designing dashboards, maps and tools for nurses, city planners and field scientists. Open to senior and lead roles.",
          },
          button: { label: "Selected projects", secondaryLabel: "Get in touch" },
        },
      }),
      fromPreset("stats/inline-strip@1", {
        theme: "light-accent",
        edit: {
          stats: {
            items: [
              { value: "9 yrs", label: "Designing products" },
              { value: "30+", label: "Tools shipped" },
              { value: "3", label: "Design teams led" },
              { value: "2", label: "Design awards" },
            ],
          },
        },
      }),
      fromPreset("portfolio/project-grid@1", {
        collection: PROJECTS,
        edit: {
          summary: {
            heading: "Selected projects",
            linkLabel: "All projects",
            link: url(collectionPath(PROJECTS)),
            emptyMessage: "Case studies are on their way.",
          },
        },
      }),
      fromPreset("logos/split-heading@1", {
        edit: {
          heading: { eyebrow: "Experience", text: "I've designed for" },
          "logo-strip": {
            logos: [
              { name: "Harbour Health" },
              { name: "City of Lakewood" },
              { name: "Northland Conservation" },
              { name: "Kitebase" },
              { name: "Orchard Pay" },
              { name: "Civic Design Lab" },
            ],
          },
        },
      }),
      fromPreset("blog/intro-and-list@1", {
        collection: WRITING,
        edit: {
          heading: { eyebrow: "Writing", text: "Notes on design" },
          text: {
            content: rt.doc(
              rt.p(
                "Occasional essays about charts, research and designing for people under pressure.",
              ),
            ),
          },
          summary: {
            linkLabel: "All writing",
            link: url(collectionPath(WRITING)),
            emptyMessage: "A new note is being written.",
          },
        },
      }),
      fromPreset("cta/big-type@1", {
        primary: page(P.contact),
        edit: {
          heading: { text: "Hiring a designer? Let's talk." },
          button: { label: "Email Priya" },
        },
      }),
    ],
  );
}

function experience() {
  return makePage(
    P.experience,
    "Experience",
    "experience",
    "Priya Raman's experience: product design roles at Harbour Health, Kitebase and Civic Design Lab, skills, education and references.",
    [
      fromPreset("hero/minimal-line@1", {
        primary: url("https://priyaraman.example/priya-raman-cv.pdf"),
        edit: {
          heading: { text: "Nine years of making complicated things clear." },
          button: { label: "Download my CV (PDF)" },
        },
      }),
      fromPreset("process/sticky-steps@1", {
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "Experience", text: "Where I've worked" },
          text: {
            content: rt.doc(
              rt.p(
                "Mostly small teams inside larger organisations, where design has to earn its seat by shipping.",
              ),
            ),
          },
          button: { label: "References on request" },
          timeline: {
            items: [
              {
                date: "2023 – now",
                title: "Lead product designer, Harbour Health",
                text: "Leading a team of four designing clinical dashboards for 40 hospitals.",
              },
              {
                date: "2020 – 2023",
                title: "Senior designer, Kitebase",
                text: "Analytics product for logistics companies; redesigned reporting end to end.",
              },
              {
                date: "2017 – 2020",
                title: "Designer, Civic Design Lab",
                text: "Budget, transit and housing tools for three city governments.",
              },
              {
                date: "2015 – 2017",
                title: "Junior designer, Orchard Pay",
                text: "Onboarding and payments flows for a small fintech.",
              },
            ],
          },
        },
      }),
      fromPreset("features/split-list@1", {
        theme: "light-accent",
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "Skills", text: "What I'm good at" },
          text: {
            content: rt.doc(
              rt.p(
                "I'm happiest between research and engineering: understanding what people need, then prototyping until the data makes sense.",
              ),
            ),
          },
          button: { label: "Talk about a role" },
          "icon-list": {
            items: [
              {
                icon: "chart-bar",
                title: "Data visualisation",
                text: "Charts, maps and dashboards.",
              },
              { icon: "users", title: "Research", text: "Interviews, diary studies, testing." },
              { icon: "layers", title: "Design systems", text: "Built and maintained two." },
              { icon: "code", title: "Prototyping", text: "HTML, CSS and a little D3." },
              { icon: "accessibility", title: "Accessibility", text: "WCAG audits and fixes." },
              { icon: "target", title: "Leading teams", text: "Hiring, critique and mentoring." },
            ],
          },
        },
      }),
      fromPreset("about/recognition@1", {
        edit: {
          heading: { eyebrow: "Education & awards", text: "Background" },
          text: {
            content: rt.doc(rt.p("Trained in information design; still learning every day.")),
          },
          "icon-list": {
            items: [
              {
                icon: "graduation-cap",
                title: "MDes, Information Design",
                text: "Carnegie Mellon University, 2015.",
              },
              {
                icon: "award",
                title: "Civic Design Award, 2024",
                text: "For the Lakewood open budget.",
              },
              {
                icon: "mic",
                title: "Speaker, Open Field 2025",
                text: "Dashboards people can trust.",
              },
            ],
          },
        },
      }),
      fromPreset("testimonials/dark-trio@1", {
        edit: {
          heading: { eyebrow: "References", text: "People I've worked with" },
          "testimonial:1": {
            quote: body(
              "Priya turned a wall of numbers into something our nurses check every shift.",
            ),
            name: "Maya Chen",
            role: "Chief nursing officer, Harbour Health",
            photo: photo("portraitMaya", 80, "1:1"),
          },
          "testimonial:2": {
            quote: body("The best designer I've hired, and a generous mentor to the team."),
            name: "Owen Price",
            role: "VP Product, Kitebase",
            photo: photo("portraitOwen", 80, "1:1"),
          },
          "testimonial:3": {
            quote: body("She made a city budget readable. Residents noticed."),
            name: "Clara Moss",
            role: "Director, Civic Design Lab",
            photo: photo("portraitClara", 80, "1:1"),
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
    "About Priya Raman: how she works, what she believes about designing with data, and what she does when she isn't at a screen.",
    [
      fromPreset("hero/split-image@1", {
        primary: page(P.experience),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "About",
            text: "Designer, chart nerd, slow runner",
            subheading:
              "I grew up in Chennai, studied in Pittsburgh and stayed for the rivers. I design tools for people whose jobs are too important for confusing software.",
          },
          button: {
            label: "My experience",
            secondaryLabel: "Say hello",
            note: "Usually replies within a day.",
          },
          image: {
            image: photo("deskSetup", 620, "4:5", "Priya's desk with a monitor and headphones"),
          },
        },
      }),
      fromPreset("about/beliefs@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "How I work", text: "Principles I design by" },
          columns: {
            items: [
              {
                heading: "Start with the decision",
                body: body("Every chart exists to help someone decide something. Find out what."),
              },
              {
                heading: "Fewer, truer numbers",
                body: body("One honest number beats ten impressive ones."),
              },
              {
                heading: "Test with real data",
                body: body("Tidy sample charts lie. Prototype with the messy real thing."),
              },
              {
                heading: "Design is a team sport",
                body: body("The best ideas usually come from engineers and users."),
              },
            ],
          },
        },
      }),
      fromPreset("gallery/staggered-three@1", {
        edit: {
          "image:1": {
            image: photo("forest", 520, "original", "Morning light through tall forest trees"),
          },
          "image:2": { image: photo("readingCafe", 420, "original", "Reading at a cafe table") },
          "image:3": { image: photo("bookshelf", 520, "original", "A colourful wall of books") },
          text: {
            content: rt.doc(
              rt.h(2, "Away from the screen", "h3"),
              rt.p("Trail running, too many library books and a weekly cafe sketchbook habit."),
            ),
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
    "Contact product designer Priya Raman about senior and lead design roles, freelance projects or speaking. Email or use the form.",
    [
      fromPreset("contact/simple-centered@1", {
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Say hello" },
          text: {
            content: rt.doc(
              rt.p([rt.link(EMAIL, `mailto:${EMAIL}`)], "lead"),
              rt.p("Open to senior and lead product design roles from January."),
            ),
          },
        },
      }),
      fromPreset("contact/appointment@1", {
        drop: ["hours"],
        edit: {
          heading: { eyebrow: "Roles & projects", text: "Tell me about the work" },
          text: {
            content: rt.doc(
              rt.p(
                "A few lines about the team and the problem is plenty. I'll reply within two working days.",
              ),
            ),
          },
          form: {
            form: {
              id: formId(),
              name: "Role or project",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                { type: "email", name: "email", label: "Email", required: true, width: "half" },
                { type: "text", name: "company", label: "Company", required: false, width: "full" },
                {
                  type: "radio",
                  name: "kind",
                  label: "It's about",
                  required: false,
                  options: ["A full-time role", "A freelance project", "Speaking"],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "The team and the problem",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send",
              success: { type: "message", message: "Thanks — I'll reply within two working days." },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

export const folio: TemplateSpec = {
  id: T,
  name: "Folio",
  description:
    "A personal site and résumé: a friendly introduction, selected projects, experience as a timeline, skills, references, writing and a contact form.",
  persona: "Personal sites, résumés & freelancers",
  mood: "Friendly, clear, personal",
  tags: ["personal", "resume", "cv", "portfolio", "freelancer", "writing"],
  sample: { name: NAME, tagline: "Product designer making data feel obvious." },
  thumbnail: P.home,
  looks: [
    {
      id: "studio",
      name: "Studio",
      description: "Off-white, a cobalt accent and Inter with Space Grotesk headings.",
      choices: {
        palette: {
          brand: "oklch(0.5 0.18 260)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "space-grotesk-inter",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "sketchbook",
      name: "Sketchbook",
      description: "A warm coral accent, DM Serif headings and round, friendly shapes.",
      choices: {
        palette: {
          brand: "oklch(0.62 0.15 30)",
          neutral: "warm",
          contrast: "standard",
          source: "curated",
        },
        pairing: "dm-serif-dm-sans",
        density: "airy",
        shape: "round",
        buttons: "pill-outline",
        motion: "subtle",
        imageTreatment: "circle",
      },
    },
    {
      id: "monospace",
      name: "Monospace",
      description: "IBM Plex Mono headings, a green accent and sharp corners for engineers.",
      choices: {
        palette: {
          brand: "oklch(0.52 0.13 150)",
          neutral: "pure",
          contrast: "standard",
          source: "brand",
        },
        pairing: "plex-mono-plex-sans",
        density: "compact",
        shape: "sharp",
        buttons: "outline",
        motion: "none",
        imageTreatment: "none",
      },
    },
  ],
  build() {
    return {
      site: {
        title: NAME,
        tagline: "Product designer making data feel obvious.",
        nav: [
          { type: "collection", collection: PROJECTS, label: "Projects" },
          { type: "page", page: P.experience, label: "Experience" },
          { type: "collection", collection: WRITING, label: "Writing" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
        ],
        header: headerFrom("header/sticky-minimal@1"),
        footer: fromPreset("footer/legal-row@1", {
          edit: {
            "text:1": {
              content: rt.doc(rt.p("© 2026 Priya Raman. Designed in Pittsburgh.", "small")),
            },
            "text:2": {
              content: rt.doc(
                rt.p(
                  [
                    rt.link("Experience", href("experience")),
                    " · ",
                    rt.link("Writing", collectionPath(WRITING)),
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
          { network: "linkedin", url: "https://linkedin.com/in/priyaraman-example" },
          { network: "github", url: "https://github.com/priyaraman-example" },
        ],
        seo: {
          titleTemplate: "%s · Priya Raman",
          description:
            "Product designer making data tools clear for nurses, planners and scientists.",
          image: photoUrl("portraitFounder", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), experience(), about(), contact()],
      collectionConfigs: {
        [PROJECTS]: {
          kind: "portfolio",
          label: "Projects",
          itemLabel: "Project",
          list: { layout: "grid", pageSize: 24, sort: "date-desc" },
          itemPage: { layout: "wide" },
        },
        [WRITING]: {
          kind: "blog",
          label: "Writing",
          itemLabel: "Note",
          list: { layout: "list", pageSize: 20, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: false, showRelated: true },
        },
      },
      collections: {
        [PROJECTS]: projects.map((p) =>
          project(
            p.slug,
            {
              title: p.title,
              date: `${p.year}-04-01`,
              year: p.year,
              client: p.client,
              role: "Product design",
              excerpt: p.excerpt,
              image: photoUrl(p.cover, 1600),
              imageAlt: `${p.title}, project cover`,
              gallery: p.gallery.map((k) => photo(k, 1200)),
            },
            `${p.excerpt}\n\nI led research and design with a small team of engineers, testing every version with the people who would use it.\n`,
          ),
        ),
        [WRITING]: [
          post(
            "2026-10-12-one-honest-number",
            {
              title: "One honest number",
              date: "2026-10-12",
              author: NAME,
              excerpt:
                "Why the best dashboards I've designed lead with a single figure, and how to choose it.",
            },
            "Ask what decision the screen supports. Then find the one number that would change that decision, and make it the biggest thing on the page.\n",
          ),
          post(
            "2026-09-20-testing-with-real-data",
            {
              title: "Prototype with the messy data",
              date: "2026-09-20",
              author: NAME,
              excerpt:
                "Placeholder charts flatter every design. Real data finds the problems early.",
            },
            "Real data has gaps, outliers and labels that are far too long. Designing with it from week one saves months later.\n",
          ),
          post(
            "2026-08-30-designing-for-night-shifts",
            {
              title: "Designing for the night shift",
              date: "2026-08-30",
              author: NAME,
              excerpt: "What I learned shadowing nurses between midnight and 7am.",
            },
            "Dark rooms, tired eyes and constant interruptions. Every design decision changed once I'd seen a ward at 3am.\n",
          ),
        ],
      },
    };
  },
};
