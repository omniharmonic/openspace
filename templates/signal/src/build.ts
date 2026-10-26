import type { TemplateSpec } from "../../lib/define";
import { post } from "../../lib/define";
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
 * Signal — products, startups and launches (doc 04 §7). Bold, modern, technical: Bricolage
 * Grotesque / Geist on near-black chrome with an electric accent; feature grids, a logo strip,
 * pricing, FAQ and a changelog.
 *
 * Demo owner: Tidewire, an incident-response tool for small engineering teams.
 */

const T = "signal";
const PAGES = definePages(T, {
  home: "",
  pricing: "pricing",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Tidewire";
const SIGNUP = "https://app.tidewire.example/signup";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "up to 5 responders",
    description: "For side projects and the first on-call rota.",
    features: [
      { text: "Alerts by push, SMS and Slack" },
      { text: "One on-call schedule" },
      { text: "Public status page" },
    ],
    buttonLabel: "Start free",
    link: url(SIGNUP),
    featured: false,
  },
  {
    name: "Team",
    price: "$19",
    period: "per responder / month",
    description: "For engineering teams who share the pager every week.",
    features: [
      { text: "Unlimited schedules and escalations" },
      { text: "Incident timelines and postmortems" },
      { text: "Phone-call alerts in 40 countries" },
    ],
    buttonLabel: "Try Team free for 14 days",
    link: url(SIGNUP),
    featured: true,
    badge: "Most teams",
  },
  {
    name: "Scale",
    price: "$39",
    period: "per responder / month",
    description: "For companies with several teams and audit needs.",
    features: [
      { text: "SSO and SCIM provisioning" },
      { text: "Audit log and data residency" },
      { text: "A named support engineer" },
    ],
    buttonLabel: "Talk to us",
    link: url(href("contact")),
    featured: false,
  },
];

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Tidewire routes alerts, runs on-call schedules and writes the postmortem for you. Incident response for small engineering teams.",
    [
      fromPreset("hero/marquee-launch@1", {
        theme: "dark",
        edit: {
          heading: {
            eyebrow: "New · Status pages that update themselves",
            text: "Incident response for small engineering teams",
            subheading:
              "Tidewire routes alerts to the right person, runs your on-call rota and drafts the postmortem while you fix the problem. Set up in an afternoon, not a quarter.",
          },
          button: {
            label: "Start free",
            link: url(SIGNUP),
            secondaryLabel: "See pricing",
            secondaryLink: page(P.pricing),
          },
          marquee: {
            items: [
              { text: "Alerts in under 3 seconds" },
              { text: "Slack-native incidents" },
              { text: "99.99% uptime SLA" },
              { text: "SOC 2 Type II" },
              { text: "Free for 5 responders" },
            ],
          },
        },
      }),
      fromPreset("logos/row@1", {
        theme: "dark",
        edit: {
          "logo-strip": {
            label: "On call with Tidewire",
            logos: [
              { name: "Parcelly" },
              { name: "Northwind Health" },
              { name: "Kitebase" },
              { name: "Orchard Pay" },
              { name: "Ludo Labs" },
            ],
          },
        },
      }),
      fromPreset("features/bento@1", {
        theme: "dark-accent",
        edit: {
          heading: { eyebrow: "Product", text: "Everything between the alert and the fix" },
          "card:1": {
            heading: "Alerts that find the right person",
            body: body(
              "Route by service, severity and time of day. Escalate automatically if nobody acknowledges in five minutes.",
            ),
            icon: "zap",
            style: { colorTheme: "brand" },
          },
          image: {
            image: photo(
              "analytics",
              640,
              "original",
              "A dashboard of service health charts on a monitor",
            ),
          },
          "card:2": {
            heading: "On-call that's fair",
            body: body(
              "Rotas, overrides and swaps in two clicks, with a weekly report on who got woken up.",
            ),
            icon: "calendar",
            style: { colorTheme: "dark" },
          },
          "card:3": {
            heading: "Postmortems drafted for you",
            body: body(
              "Tidewire turns the incident timeline into a first draft you can edit and share.",
            ),
            icon: "book-open",
            style: { colorTheme: "dark" },
          },
        },
      }),
      fromPreset("features/screenshot-callout@1", {
        theme: "dark",
        edit: {
          image: {
            image: photo(
              "officeDesks",
              700,
              "original",
              "Standing desks by tall windows where the team works",
            ),
          },
          stats: {
            style: { colorTheme: "brand" },
            items: [
              { value: "3 s", label: "Median alert delivery" },
              { value: "41%", label: "Faster resolution" },
            ],
          },
          heading: { eyebrow: "Insights", text: "Know which services wake you up" },
          text: {
            content: rt.doc(
              rt.p(
                "Weekly reports show noisy alerts, slow acknowledgements and the services behind most incidents, so you can fix the causes instead of the symptoms.",
              ),
            ),
          },
          button: { label: "Book a demo", link: page(P.contact) },
        },
      }),
      fromPreset("testimonials/three-cards@1", {
        theme: "dark",
        edit: {
          heading: { eyebrow: "Customers", text: "Quieter nights, faster fixes" },
          "testimonial:1": {
            quote: rt.doc(
              rt.p(
                "We replaced three tools and a spreadsheet. Our median time to acknowledge dropped from nine minutes to under two.",
              ),
            ),
            name: "Maya Okonkwo",
            role: "Head of platform, Parcelly",
            photo: photo("portraitIris", 120, "1:1", "Portrait of Maya Okonkwo"),
            rating: 5,
          },
          "testimonial:2": {
            quote: rt.doc(
              rt.p(
                "The postmortem drafts are uncanny. Our incident reviews now take twenty minutes instead of an afternoon.",
              ),
            ),
            name: "Felix Andersson",
            role: "CTO, Kitebase",
            photo: photo("portraitTheo", 120, "1:1", "Portrait of Felix Andersson"),
            rating: 5,
          },
          "testimonial:3": {
            quote: rt.doc(
              rt.p(
                "Set up on a Friday afternoon, paged us correctly on Saturday night. That's the whole review.",
              ),
            ),
            name: "Rosa Lindgren",
            role: "Staff engineer, Orchard Pay",
            photo: photo("portraitClara", 120, "1:1", "Portrait of Rosa Lindgren"),
            rating: 5,
          },
        },
      }),
      fromPreset("pricing/three-plans@1", {
        theme: "dark-accent",
        edit: {
          heading: {
            eyebrow: "Pricing",
            text: "Pay per responder, not per alert",
            subheading:
              "Free for small teams. Every paid plan starts with a 14-day trial, no card needed.",
          },
          pricing: {
            plans,
            note: "Prices in USD, billed monthly. Save two months with annual billing.",
          },
        },
      }),
      fromPreset("faq/split@1", {
        theme: "dark",
        edit: {
          heading: { eyebrow: "FAQ", text: "Questions engineers ask" },
          text: {
            content: rt.doc(
              rt.p("Can't find your answer? Our engineers answer support, not a script."),
            ),
          },
          button: { label: "Contact support", link: page(P.contact) },
          accordion: {
            items: [
              {
                question: "Which monitoring tools does Tidewire connect to?",
                answer: body(
                  "Over 60, including Datadog, Grafana, Prometheus, Sentry, CloudWatch and any tool that can send a webhook.",
                ),
              },
              {
                question: "Can we migrate our existing schedules?",
                answer: body(
                  "Yes. Import rotas from a CSV or from most on-call tools in a few minutes, overrides included.",
                ),
              },
              {
                question: "Where is our data stored?",
                answer: body(
                  "In the US by default, or in the EU on the Scale plan. Everything is encrypted at rest and in transit.",
                ),
              },
              {
                question: "What happens if Tidewire itself goes down?",
                answer: body(
                  "Alerting runs in three regions with automatic failover. Our own status page is hosted independently.",
                ),
              },
            ],
          },
        },
      }),
      fromPreset("cta/banner@1", {
        theme: "brand",
        edit: {
          heading: {
            text: "Sleep through the night again",
            subheading:
              "Free for up to five responders. Connect your first alert source in under ten minutes.",
          },
          button: {
            label: "Start free",
            link: url(SIGNUP),
            secondaryLabel: "Book a demo",
            secondaryLink: page(P.contact),
          },
        },
      }),
    ],
  );
}

function pricing() {
  return makePage(
    P.pricing,
    "Pricing",
    "pricing",
    "Tidewire pricing: free for up to five responders, then $19 or $39 per responder each month. Fourteen-day trial, no card needed.",
    [
      fromPreset("hero/centered@1", {
        theme: "dark",
        edit: {
          heading: {
            eyebrow: "Pricing",
            text: "Simple pricing that grows with your team",
            subheading:
              "Pay for the people who carry the pager, not for alerts, integrations or status page subscribers. Change plans whenever you like.",
          },
          button: {
            label: "Start free",
            link: url(SIGNUP),
            secondaryLabel: "Talk to sales",
            secondaryLink: page(P.contact),
          },
        },
      }),
      fromPreset("pricing/three-plans@1", {
        theme: "dark-accent",
        edit: {
          heading: {
            eyebrow: "Plans",
            text: "Choose a plan",
            subheading:
              "All plans include unlimited alerts, integrations and status page subscribers.",
          },
          pricing: { plans, note: "Non-profits and open-source projects get Team free. Ask us." },
        },
      }),
      fromPreset("features/icon-row@1", {
        theme: "dark",
        edit: {
          heading: {
            eyebrow: "Every plan",
            text: "Included, whatever you pay",
            subheading: "The basics of a good incident process shouldn't be an upsell.",
          },
          "icon-list": {
            items: [
              {
                icon: "zap",
                title: "Unlimited alerts",
                text: "No per-alert or per-integration fees, ever.",
              },
              {
                icon: "globe",
                title: "Status page",
                text: "A public page on your own domain, updated from Slack.",
              },
              {
                icon: "shield-check",
                title: "SOC 2 Type II",
                text: "Audited yearly, with the report available on request.",
              },
              {
                icon: "message-circle",
                title: "Human support",
                text: "Engineers answer email within four business hours.",
              },
            ],
          },
        },
      }),
      fromPreset("faq/by-topic@1", {
        theme: "dark-accent",
        edit: {
          heading: { eyebrow: "FAQ", text: "Billing questions" },
          tabs: {
            label: "Question topics",
            items: [
              {
                label: "Billing",
                content: rt.doc(
                  rt.h(3, "Who counts as a responder?", "h4"),
                  rt.p(
                    "Anyone who can be paged. Stakeholders who only read incidents and status pages are free.",
                  ),
                  rt.h(3, "Can I pay annually?", "h4"),
                  rt.p("Yes. Annual plans get two months free and can be paid by invoice."),
                ),
              },
              {
                label: "Trials",
                content: rt.doc(
                  rt.h(3, "Do I need a card to start a trial?", "h4"),
                  rt.p("No. You'll move to the Starter plan automatically if you don't upgrade."),
                  rt.h(3, "Can I extend my trial?", "h4"),
                  rt.p("Just ask. Most migrations finish within the first week anyway."),
                ),
              },
              {
                label: "Security",
                content: rt.doc(
                  rt.h(3, "Do you support single sign-on?", "h4"),
                  rt.p(
                    "SAML and OIDC single sign-on with SCIM provisioning are included on the Scale plan.",
                  ),
                  rt.h(3, "Can we sign a DPA?", "h4"),
                  rt.p("Yes, on every paid plan. Download it from your account settings."),
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
    "Tidewire is a small, remote company of engineers who have carried the pager for twenty years. Meet the team and what we believe.",
    [
      fromPreset("about/story-split@1", {
        theme: "dark",
        edit: {
          image: {
            image: photo(
              "coworking",
              520,
              "4:5",
              "A Tidewire engineer walking the team through an incident review",
            ),
          },
          heading: {
            eyebrow: "About",
            text: "Built by people who carried the pager",
            level: "h1",
            size: "h1",
          },
          text: {
            content: rt.doc(
              rt.p(
                "We spent a decade on call at startups and big companies alike, and the tools always felt built for someone else: enterprise dashboards, per-alert pricing and setup projects that took a quarter. Small teams just needed the right person woken up and a calm way to fix things together.",
              ),
              rt.p(
                "We started Tidewire in 2023 to build that tool. Today we're 18 people across nine time zones, profitable, and we still take turns on call for our own product every week.",
              ),
            ),
          },
          button: { label: "We're hiring", link: page(P.contact), role: "secondary" },
        },
      }),
      fromPreset("about/values@1", {
        theme: "dark-accent",
        edit: {
          heading: {
            eyebrow: "How we work",
            text: "What we believe",
            subheading: "Three principles that shape every feature we ship.",
          },
          "icon-list": {
            items: [
              {
                icon: "moon",
                title: "Protect sleep",
                text: "Every alert that wakes someone up should be worth it. We help you remove the rest.",
              },
              {
                icon: "users",
                title: "Blameless by default",
                text: "Incidents are system failures, so our tools describe what happened, not who did it.",
              },
              {
                icon: "zap",
                title: "Fast to set up",
                text: "If it takes longer than an afternoon to get value, we've built it wrong.",
              },
            ],
          },
        },
      }),
      fromPreset("team/grid@1", {
        theme: "dark",
        edit: {
          heading: {
            eyebrow: "Team",
            text: "The founders",
            subheading: "Three engineers and a designer who met on an incident bridge at 3am.",
          },
          team: {
            people: [
              {
                name: "Iris Nakamura",
                role: "CEO",
                photo: photo("portraitNina", 300, "4:5", "Portrait of Iris Nakamura"),
              },
              {
                name: "Daniel Okafor",
                role: "CTO",
                photo: photo("portraitDaniel", 300, "4:5", "Portrait of Daniel Okafor"),
              },
              {
                name: "Clara Weiss",
                role: "Head of design",
                photo: photo("portraitAna", 300, "4:5", "Portrait of Clara Weiss"),
              },
              {
                name: "Sam Ortega",
                role: "Head of reliability",
                photo: photo("portraitSam", 300, "4:5", "Portrait of Sam Ortega"),
              },
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
    "Talk to the Tidewire team about a demo, migrating from another tool, security reviews or a plan for a larger organization.",
    [
      fromPreset("contact/form-split@1", {
        theme: "dark",
        edit: {
          heading: {
            eyebrow: "Contact",
            text: "Talk to an engineer, not a script",
            level: "h1",
            subheading:
              "Demos, migrations, security questionnaires or pricing for larger teams. We reply within one business day.",
          },
          "contact-info": {
            name: "Tidewire, Inc.",
            address: "Remote · incorporated in Delaware",
            phone: undefined,
            email: "hello@tidewire.example",
          },
          form: {
            form: {
              id: formId(),
              name: "Sales enquiry",
              fields: [
                { type: "text", name: "name", label: "Name", required: true, width: "half" },
                {
                  type: "email",
                  name: "email",
                  label: "Work email",
                  required: true,
                  width: "half",
                },
                { type: "text", name: "company", label: "Company", width: "half" },
                {
                  type: "select",
                  name: "responders",
                  label: "Responders",
                  width: "half",
                  options: ["1 – 5", "6 – 25", "26 – 100", "More than 100"],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "How can we help?",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send",
              success: {
                type: "message",
                message: "Thanks! An engineer will reply within one business day.",
              },
              notifyOwner: true,
            },
          },
        },
      }),
    ],
  );
}

export const signal: TemplateSpec = {
  id: T,
  name: "Signal",
  description:
    "A bold, technical site for products, startups and launches, with feature grids, a logo strip, pricing, FAQ and a changelog.",
  persona: "Products, startups, launches",
  mood: "Bold, modern, technical",
  tags: ["startup", "saas", "product", "launch", "pricing", "changelog"],
  sample: { name: NAME, tagline: "Incident response for small engineering teams." },
  thumbnail: P.home,
  looks: [
    {
      id: "electric",
      name: "Electric",
      description:
        "Near-black chrome with an electric violet accent and Bricolage Grotesque headings.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.25 285)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "bricolage-geist",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "expressive",
        imageTreatment: "none",
      },
    },
    {
      id: "terminal",
      name: "Terminal",
      description:
        "Near-black with a phosphor-green accent and IBM Plex Mono headings, for developer tools.",
      choices: {
        palette: {
          brand: "oklch(0.6 0.17 150)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "plex-mono-plex-sans",
        density: "compact",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "volt",
      name: "Volt",
      description:
        "Near-black with an electric cyan accent, Space Grotesk headings and pill buttons.",
      choices: {
        palette: {
          brand: "oklch(0.62 0.14 215)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "space-grotesk-inter",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
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
        tagline: "Incident response for small engineering teams.",
        nav: [
          { type: "page", page: P.pricing, label: "Pricing" },
          { type: "collection", collection: "changelog", label: "Changelog" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.contact, label: "Contact" },
          { type: "link", label: "Sign in", href: "https://app.tidewire.example/login" },
          { type: "button", label: "Start free", link: url(SIGNUP), style: "primary" },
        ],
        header: headerFrom("header/centered-nav@1", { sticky: true, colorTheme: "dark" }),
        footer: fromPreset("footer/columns@1", {
          theme: "dark",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p(
                  "Incident response for small engineering teams. Made remotely, in nine time zones.",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Product", [
                  ["Pricing", href("pricing")],
                  ["Changelog", collectionPath("changelog")],
                  ["Status", "https://status.tidewire.example"],
                ]),
              ),
            },
            "text:3": {
              content: rt.doc(
                ...linkColumn("Company", [
                  ["About", href("about")],
                  ["Contact", href("contact")],
                ]),
              ),
            },
            "text:4": {
              content: rt.doc(
                rt.p("Product updates", "eyebrow"),
                rt.p([
                  "New features every two weeks, written by the engineers who built them. ",
                  rt.link("Read the changelog", collectionPath("changelog")),
                ]),
                rt.p("© 2026 Tidewire, Inc.", "small"),
              ),
            },
          },
        }),
        social: [
          { network: "github", url: "https://github.com/tidewire-example" },
          { network: "bluesky", url: "https://bsky.app/profile/tidewire.example" },
          { network: "linkedin", url: "https://linkedin.com/company/tidewire-example" },
        ],
        seo: {
          titleTemplate: "%s · Tidewire",
          description: "Incident response for small engineering teams.",
          image: photoUrl("analytics", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), pricing(), about(), contact()],
      collectionConfigs: {
        changelog: {
          kind: "blog",
          label: "Changelog",
          itemLabel: "Release",
          slugPattern: "{date}-{title}",
          list: { layout: "list", pageSize: 20, sort: "date-desc" },
          itemPage: { layout: "article", showDate: true, showAuthor: true, showRelated: false },
          taxonomies: {
            categories: [
              { slug: "new", label: "New" },
              { slug: "improved", label: "Improved" },
              { slug: "fixed", label: "Fixed" },
            ],
            tags: false,
          },
          feed: {
            enabled: true,
            title: "Tidewire changelog",
            description: "What's new in Tidewire.",
          },
        },
      },
      collections: {
        changelog: [
          post(
            "2026-10-20-status-pages-that-update-themselves",
            {
              title: "Status pages that update themselves",
              date: "2026-10-20",
              author: "Clara Weiss",
              categories: ["new"],
              excerpt:
                "Declare an incident in Slack and your public status page updates within seconds.",
            },
            `Status pages now follow your incidents automatically.

- **Linked components.** Map services to status page components once; Tidewire updates them when an incident starts and resolves.
- **Drafted updates.** Tidewire suggests customer-facing wording from the incident timeline. Edit it, or publish as is.
- **Custom domains** on every plan, with HTTPS handled for you.

Turn it on under *Settings → Status page*.
`,
          ),
          post(
            "2026-10-06-quiet-hours",
            {
              title: "Quiet hours for low-severity alerts",
              date: "2026-10-06",
              author: "Sam Ortega",
              categories: ["improved"],
              excerpt: "Low-severity alerts now wait until morning unless they escalate.",
            },
            `Not every alert deserves a 3am phone call. Set quiet hours per schedule, and alerts below the severity you choose are held until the start of the next working day.

If a held alert escalates, or fires more than five times, Tidewire pages immediately as usual.
`,
          ),
          post(
            "2026-09-22-postmortem-drafts",
            {
              title: "Postmortem drafts, now with action items",
              date: "2026-09-22",
              author: "Daniel Okafor",
              categories: ["improved"],
              excerpt: "Drafts now suggest follow-up tasks and send them to Linear or Jira.",
            },
            `The postmortem draft now ends with suggested action items based on the incident timeline and chat. Accept them with one click to create tickets in Linear or Jira, linked back to the incident.
`,
          ),
          post(
            "2026-09-08-faster-sms",
            {
              title: "Faster SMS delivery in Europe",
              date: "2026-09-08",
              author: "Sam Ortega",
              categories: ["fixed"],
              excerpt: "Median SMS delivery in the EU dropped from 9 seconds to 3.",
            },
            "We added a second SMS provider in Frankfurt and now race both. Median delivery time across the EU dropped from 9 seconds to 3.\n",
          ),
        ],
      },
    };
  },
};
