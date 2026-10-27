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
 * Orbit — SaaS and product launches. A crisp product site: screenshot hero, bento features,
 * a review wall, plans with a monthly/yearly switch and a full comparison table, a changelog.
 *
 * Demo owner: Relay, a shared inbox and help centre for small support teams.
 */

const T = "orbit";
const PAGES = definePages(T, {
  home: "",
  features: "features",
  pricing: "pricing",
  about: "about",
  contact: "contact",
});
const P = PAGES.id;
const href = PAGES.href;

const NAME = "Relay";
const SIGNUP = "https://app.relay.example/signup";
const LOG = "changelog";

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "for 2 seats",
    altPrice: "$0",
    altPeriod: "for 2 seats",
    description: "For founders answering their own email.",
    features: [{ text: "Shared inbox" }, { text: "Saved replies" }, { text: "Email and chat" }],
    buttonLabel: "Start free",
    link: url(SIGNUP),
    featured: false,
  },
  {
    name: "Team",
    price: "$15",
    period: "per seat / month",
    altPrice: "$12",
    altPeriod: "per seat / month, yearly",
    description: "For support teams of three to thirty.",
    features: [
      { text: "Everything in Starter" },
      { text: "Help centre on your domain" },
      { text: "Rules, tags and SLAs" },
      { text: "Reports" },
    ],
    buttonLabel: "Try Team free",
    link: url(SIGNUP),
    featured: true,
    badge: "Most teams",
  },
  {
    name: "Business",
    price: "$29",
    period: "per seat / month",
    altPrice: "$24",
    altPeriod: "per seat / month, yearly",
    description: "For larger teams with security reviews.",
    features: [
      { text: "Everything in Team" },
      { text: "SSO and audit log" },
      { text: "Named success manager" },
    ],
    buttonLabel: "Talk to sales",
    link: url(href("contact")),
    featured: false,
  },
];

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "Relay is the shared inbox and help centre for small support teams. Answer every customer from one calm place. Free for two seats.",
    [
      fromPreset("hero/product-screenshot@1", {
        primary: url(SIGNUP),
        secondary: page(P.pricing),
        edit: {
          heading: {
            eyebrow: "Customer support for small teams",
            text: "Every customer, one calm inbox",
            subheading:
              "Relay brings email, chat and your help centre together, so nothing slips and nobody answers the same question twice.",
          },
          button: {
            label: "Start free",
            secondaryLabel: "See pricing",
            note: "Free for two seats. No card needed.",
          },
          image: {
            image: photo(
              "dashboardLight",
              900,
              "original",
              "The Relay inbox showing conversations and charts",
            ),
          },
        },
      }),
      fromPreset("logos/split-heading@1", {
        edit: {
          heading: { eyebrow: "Customers", text: "Support teams who reply in minutes" },
          "logo-strip": {
            logos: [
              { name: "Parcelly" },
              { name: "Fieldhouse Coffee" },
              { name: "Kinfold" },
              { name: "Orchard Pay" },
              { name: "Saltmarsh Press" },
              { name: "Tandem" },
            ],
          },
        },
      }),
      fromPreset("features/bento-stats@1", {
        edit: {
          text: {
            content: rt.doc(
              rt.p("Why teams switch", "eyebrow"),
              rt.h(2, "Less tab-switching, faster answers", "h2"),
              rt.p("Everything a customer has ever asked, in one thread with their order history."),
            ),
          },
          image: {
            image: photo(
              "teamScreens",
              560,
              "original",
              "A support team laughing over a shared screen",
            ),
          },
          "card:1": {
            heading: "Assign without asking",
            body: body("Rules route billing, bugs and VIPs to the right person automatically."),
            icon: "workflow",
          },
          "card:2": {
            heading: "Answers that write themselves",
            body: body("Saved replies and help articles suggested as you type."),
            icon: "sparkles",
          },
          stats: { items: [{ value: "4 min", label: "Median first reply on Relay" }] },
        },
      }),
      fromPreset("features/alternating-rows@1", {
        edit: {
          heading: { eyebrow: "Product", text: "Built for the way support really works" },
          "image:1": {
            image: photo(
              "developer",
              640,
              "original",
              "A support engineer working across two monitors",
            ),
          },
          "text:1": {
            content: rt.doc(
              rt.p("Inbox", "eyebrow"),
              rt.h(3, "One queue for email and chat", "h3"),
              rt.p(
                "Collision alerts stop two people answering the same customer, and snoozes bring threads back exactly when you need them.",
              ),
            ),
          },
          "image:2": {
            image: photo("analytics", 640, "original", "Charts of response times on a laptop"),
          },
          "text:2": {
            content: rt.doc(
              rt.p("Reports", "eyebrow"),
              rt.h(3, "Know what customers ask most", "h3"),
              rt.p(
                "Weekly reports show busy hours, slow replies and the questions that deserve a help article.",
              ),
            ),
          },
          "image:3": {
            image: photo("deskMinimal", 640, "original", "A tidy desk with a laptop and a plant"),
          },
          "text:3": {
            content: rt.doc(
              rt.p("Help centre", "eyebrow"),
              rt.h(3, "Customers help themselves", "h3"),
              rt.p(
                "Publish answers to a help centre on your own domain, searchable and readable on any phone.",
              ),
            ),
          },
        },
      }),
      fromPreset("testimonials/wall@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Reviews", text: "Loved by small support teams" },
          "testimonial:1": {
            quote: body(
              "We moved from three tools to Relay in an afternoon and never looked back.",
            ),
            name: "Jo M.",
            role: "Head of support, Parcelly",
          },
          "testimonial:2": {
            quote: body("Collision alerts alone saved us from so many double replies."),
            name: "Ravi P.",
            role: "Support lead",
          },
          "testimonial:3": {
            quote: body("Our first reply time went from four hours to eleven minutes."),
            name: "Emma L.",
            role: "Founder, Kinfold",
          },
          "testimonial:4": {
            quote: body("Calm, fast and the pricing is honest."),
            name: "Sam K.",
            role: "Operations",
          },
          "testimonial:5": {
            quote: body("The help centre cut our ticket volume by a third in a month."),
            name: "Noor A.",
            role: "Customer success",
          },
          "testimonial:6": {
            quote: body("Feels like it was built by people who've done support."),
            name: "Will T.",
            role: "Support engineer",
          },
        },
      }),
      fromPreset("pricing/billing-toggle@1", {
        edit: {
          heading: {
            eyebrow: "Pricing",
            text: "Pay per seat, nothing else",
            subheading:
              "Unlimited conversations and customers on every plan. Change or cancel whenever you like.",
          },
          pricing: { plans, periodLabel: "Monthly", altPeriodLabel: "Yearly", altNote: "Save 20%" },
        },
      }),
      fromPreset("cta/card-centered@1", {
        primary: url(SIGNUP),
        secondary: page(P.contact),
        edit: {
          text: {
            content: rt.doc(
              rt.h(2, "Your inbox, calmer by Friday", "h2"),
              rt.p(
                "Connect your support address in five minutes. We'll import your history for free.",
              ),
            ),
          },
          button: { label: "Start free", secondaryLabel: "Book a demo" },
        },
      }),
    ],
  );
}

function features() {
  return makePage(
    P.features,
    "Features",
    "features",
    "Shared inbox, live chat, rules, saved replies, reports and a help centre on your own domain. Everything in Relay, feature by feature.",
    [
      fromPreset("hero/video-feature@1", {
        primary: url(SIGNUP),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Features",
            text: "Everything a small support team needs",
            subheading: "Watch a two-minute tour, or start a free workspace and invite your team.",
          },
          button: {
            label: "Start free",
            secondaryLabel: "Book a demo",
            note: "Set up in about five minutes.",
          },
          video: {
            title: "Relay product tour (sample video: Big Buck Bunny by the Blender Foundation)",
            caption: "A sample video stands in here until you add your own product tour.",
            poster: photo(
              "teamOffice",
              1200,
              "16:9",
              "People working on laptops in a bright office",
            ),
          },
        },
      }),
      fromPreset("features/tabbed@1", {
        edit: {
          heading: {
            eyebrow: "Workflow",
            text: "From first message to solved",
            subheading:
              "Relay keeps every conversation moving without anyone babysitting the queue.",
          },
          tabs: {
            label: "Workflow features",
            items: [
              {
                label: "Routing",
                content: rt.doc(
                  rt.h(3, "The right person, automatically", "h4"),
                  rt.p(
                    "Route by keyword, customer plan or time of day, and balance load across the team.",
                  ),
                ),
              },
              {
                label: "Replies",
                content: rt.doc(
                  rt.h(3, "Saved replies that sound like you", "h4"),
                  rt.p("Personalise templates with the customer's name, order and last message."),
                ),
              },
              {
                label: "SLAs",
                content: rt.doc(
                  rt.h(3, "Never miss a promise", "h4"),
                  rt.p(
                    "Set reply targets per plan and get nudged before a conversation runs late.",
                  ),
                ),
              },
            ],
          },
        },
      }),
      fromPreset("features/tile-grid@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Included",
            text: "And all the small things",
            subheading: "The details that make a support tool pleasant to use every single day.",
          },
          "icon-list": {
            items: [
              { icon: "mail", title: "Shared email inbox" },
              { icon: "message-circle", title: "Live chat widget" },
              { icon: "book-open", title: "Help centre" },
              { icon: "users", title: "Internal notes" },
              { icon: "clock", title: "Snooze and reminders" },
              { icon: "search", title: "Instant search" },
              { icon: "chart-bar", title: "Weekly reports" },
              { icon: "lock", title: "Two-factor sign-in" },
            ],
          },
        },
      }),
      fromPreset("features/integrations@1", {
        primary: page(P.contact),
        edit: {
          heading: { eyebrow: "Integrations", text: "Plays well with your stack" },
          text: {
            content: rt.doc(
              rt.p("See orders, subscriptions and bug reports right beside each conversation."),
            ),
          },
          button: { label: "Ask about an integration" },
          "logo-strip": {
            logos: [
              { name: "Your store" },
              { name: "Billing" },
              { name: "Issue tracker" },
              { name: "Team chat" },
              { name: "CRM" },
              { name: "Webhooks" },
            ],
          },
        },
      }),
      fromPreset("features/comparison-table@1", {
        edit: {
          heading: {
            eyebrow: "Compare",
            text: "Relay, or a shared mailbox?",
            subheading: "What changes when a team moves support out of a shared email account.",
          },
          table: {
            caption: "A shared mailbox compared with Relay",
            columns: [
              { label: "Shared mailbox", highlight: false },
              { label: "Relay", detail: "From $0", highlight: true },
            ],
            rows: [
              {
                label: "See who's replying",
                group: false,
                cells: [{ value: "no" }, { value: "yes" }],
              },
              {
                label: "Assign conversations",
                group: false,
                cells: [{ value: "Forwarding" }, { value: "One click" }],
              },
              {
                label: "Reply time reports",
                group: false,
                cells: [{ value: "no" }, { value: "yes" }],
              },
              { label: "Help centre", group: false, cells: [{ value: "no" }, { value: "yes" }] },
              {
                label: "Customer history in one place",
                group: false,
                cells: [{ value: "no" }, { value: "yes" }],
              },
            ],
          },
        },
      }),
      fromPreset("cta/big-type@1", {
        primary: url(SIGNUP),
        edit: {
          heading: { text: "Try it with your own inbox today." },
          button: { label: "Start free" },
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
    "Relay pricing: free for two seats, then $15 or $29 per seat a month. Compare every plan feature by feature and save 20% yearly.",
    [
      fromPreset("hero/centered@1", {
        primary: url(SIGNUP),
        secondary: page(P.contact),
        edit: {
          heading: {
            eyebrow: "Pricing",
            text: "Pay for seats, not conversations",
            subheading:
              "Free for two seats, forever. Paid plans add a help centre, rules and reports — with 20% off when you pay yearly.",
          },
          button: { label: "Start free", secondaryLabel: "Talk to sales" },
        },
      }),
      fromPreset("pricing/full-comparison@1", {
        edit: {
          heading: {
            eyebrow: "Plans",
            text: "Simple, per-seat pricing",
            subheading: "Every plan includes unlimited conversations, customers and help articles.",
          },
          pricing: { plans: plans.map(({ altPrice: _a, altPeriod: _b, ...p }) => p) },
          table: {
            caption: "What's included in each Relay plan",
            corner: "Features",
            columns: [
              { label: "Starter", detail: "$0", highlight: false },
              { label: "Team", detail: "$15", highlight: true },
              { label: "Business", detail: "$29", highlight: false },
            ],
            rows: [
              { label: "Inbox", group: true, cells: [] },
              {
                label: "Shared inbox",
                group: false,
                cells: [{ value: "yes" }, { value: "yes" }, { value: "yes" }],
              },
              {
                label: "Live chat",
                group: false,
                cells: [{ value: "yes" }, { value: "yes" }, { value: "yes" }],
              },
              {
                label: "Rules and SLAs",
                group: false,
                cells: [{ value: "no" }, { value: "yes" }, { value: "yes" }],
              },
              { label: "Help centre", group: true, cells: [] },
              {
                label: "Articles",
                group: false,
                cells: [{ value: "25" }, { value: "Unlimited" }, { value: "Unlimited" }],
              },
              {
                label: "Custom domain",
                group: false,
                cells: [{ value: "no" }, { value: "yes" }, { value: "yes" }],
              },
              { label: "Security", group: true, cells: [] },
              {
                label: "SSO",
                group: false,
                cells: [{ value: "no" }, { value: "no" }, { value: "yes" }],
              },
              {
                label: "Audit log",
                group: false,
                cells: [{ value: "no" }, { value: "no" }, { value: "yes" }],
              },
            ],
          },
        },
      }),
      fromPreset("faq/two-column@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "FAQ", text: "Questions about billing" },
          "accordion:1": {
            items: [
              {
                question: "What counts as a seat?",
                answer: body("Anyone who replies to customers. Read-only teammates are free."),
              },
              {
                question: "Can I switch plans later?",
                answer: body("Yes, any time. We prorate the difference on your next invoice."),
              },
            ],
          },
          "accordion:2": {
            items: [
              {
                question: "Do you offer nonprofit discounts?",
                answer: body("Registered nonprofits get 50% off Team and Business."),
              },
              {
                question: "How does the free trial work?",
                answer: body(
                  "Team features free for 14 days, then you choose a plan or stay on Starter.",
                ),
              },
            ],
          },
        },
      }),
      fromPreset("cta/with-testimonial@1", {
        primary: url(SIGNUP),
        edit: {
          heading: {
            text: "Start free, upgrade when it helps",
            subheading: "Most teams move to Team in their second month.",
          },
          button: { label: "Create a workspace" },
          testimonial: {
            quote: body(
              "We trialled four tools. Relay was the one the whole team actually liked using.",
            ),
            name: "Marta Oyelaran",
            role: "Support lead, Orchard Pay",
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
    "Relay is a small, independent company building calm software for support teams. Meet the team and see where we're hiring.",
    [
      fromPreset("about/statement@1", {
        edit: {
          heading: {
            eyebrow: "Our mission",
            level: "h1",
            text: "We think good support is the best marketing a company can do.",
          },
          text: {
            content: rt.doc(rt.p("So we build tools that make it easier, and nothing else.")),
          },
        },
      }),
      fromPreset("about/team-photo-wide@1", {
        edit: {
          heading: {
            eyebrow: "Who we are",
            text: "Eleven people, fully remote, still small on purpose",
          },
          image: {
            image: photo(
              "teamOffice",
              1440,
              "21:9",
              "The Relay team working together at a meet-up",
            ),
          },
          columns: {
            items: [
              {
                heading: "Profitable",
                body: body("Funded by customers, not investors, since our second year."),
              },
              {
                heading: "Support first",
                body: body("Everyone, including engineers, answers customers each week."),
              },
              {
                heading: "Calm hours",
                body: body("No on-call heroics; we ship carefully and sleep well."),
              },
            ],
          },
        },
      }),
      fromPreset("team/four-up@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Team",
            text: "The founders and first hires",
            subheading: "Former support agents, engineers and one librarian.",
          },
          team: {
            people: [
              {
                name: "Lena Brandt",
                role: "Co-founder, product",
                photo: photo("portraitLena", 360, "4:5"),
              },
              {
                name: "Jonah Ellis",
                role: "Co-founder, engineering",
                photo: photo("portraitJonah", 360, "4:5"),
              },
              {
                name: "Maya Chen",
                role: "Head of support",
                photo: photo("portraitMaya", 360, "4:5"),
              },
              { name: "Rafael Costa", role: "Design", photo: photo("portraitRaf", 360, "4:5") },
            ],
          },
        },
      }),
      fromPreset("stats/brand-band@1", {
        edit: {
          stats: {
            items: [
              { value: "3,200", label: "Teams on Relay" },
              { value: "4 min", label: "Median first reply" },
              { value: "11", label: "People on the team" },
              { value: "2019", label: "Founded" },
            ],
          },
        },
      }),
      fromPreset("cta/split-photo@1", {
        primary: page(P.contact),
        edit: {
          heading: {
            text: "We're hiring a support engineer",
            subheading: "Remote within three hours of UTC. Four-day weeks, good tea budget.",
          },
          button: { label: "Ask about the role" },
          image: { image: photo("meetup", 640, "3:2", "Two colleagues talking at a team meet-up") },
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
    "Talk to the Relay team about demos, migrations, security reviews or anything else. We reply to every message within one working day.",
    [
      fromPreset("contact/quote-request@1", {
        edit: {
          heading: { eyebrow: "Contact", level: "h1", text: "Talk to a human" },
          "icon-list": {
            items: [
              {
                icon: "message-circle",
                title: "Replies within a working day",
                text: "Usually much faster.",
              },
              {
                icon: "repeat",
                title: "Free migration help",
                text: "From any helpdesk or mailbox.",
              },
              {
                icon: "shield-check",
                title: "Security reviews welcome",
                text: "Questionnaires answered in a week.",
              },
            ],
          },
          form: {
            form: {
              id: formId(),
              name: "Sales and support",
              fields: [
                { type: "text", name: "name", label: "Your name", required: true, width: "half" },
                {
                  type: "email",
                  name: "email",
                  label: "Work email",
                  required: true,
                  width: "half",
                },
                {
                  type: "select",
                  name: "topic",
                  label: "What's it about?",
                  required: true,
                  width: "full",
                  options: [
                    "A demo",
                    "Moving from another tool",
                    "Security and billing",
                    "Something else",
                  ],
                },
                {
                  type: "textarea",
                  name: "message",
                  label: "How can we help?",
                  required: true,
                  maxLength: 3000,
                },
              ],
              submitLabel: "Send message",
              success: {
                type: "message",
                message: "Thanks — a real person will reply within one working day.",
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
            heading: "Support",
            phone: undefined,
            email: "help@relay.example",
            note: "For customers, any time",
          },
          "contact-info:2": {
            headingLevel: "h2",
            heading: "Sales",
            email: "hello@relay.example",
            phone: undefined,
            note: "Demos and pricing",
          },
          "contact-info:3": {
            headingLevel: "h2",
            heading: "Company",
            address: "Relay Software Ltd\n12 Wharf Road, London N1 7GR",
            note: "Registered office only",
          },
        },
      }),
    ],
  );
}

export const orbit: TemplateSpec = {
  id: T,
  name: "Orbit",
  description:
    "A crisp launch site for software products, with a screenshot hero, bento features, plans with a yearly switch, a full comparison and a changelog.",
  persona: "SaaS, apps & product launches",
  mood: "Crisp, confident, modern",
  tags: ["saas", "startup", "product", "pricing", "changelog", "launch"],
  sample: { name: NAME, tagline: "The shared inbox for small support teams." },
  thumbnail: P.home,
  looks: [
    {
      id: "indigo",
      name: "Indigo",
      description: "Clean white, an indigo accent and Plus Jakarta Sans throughout.",
      choices: {
        palette: {
          brand: "oklch(0.52 0.2 275)",
          neutral: "cool",
          contrast: "standard",
          source: "curated",
        },
        pairing: "plus-jakarta",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "aurora",
      name: "Aurora",
      description: "A teal accent, Sora headings and round, pill-shaped buttons.",
      choices: {
        palette: {
          brand: "oklch(0.6 0.13 185)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "sora-inter",
        density: "comfortable",
        shape: "round",
        buttons: "pill-solid",
        motion: "expressive",
        imageTreatment: "rounded",
      },
    },
    {
      id: "blueprint",
      name: "Blueprint",
      description: "Sharp corners, Space Grotesk and a signal-orange accent on cool greys.",
      choices: {
        palette: {
          brand: "oklch(0.64 0.18 45)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "space-grotesk-inter",
        density: "compact",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
  ],
  build() {
    return {
      features: { newsletter: true },
      site: {
        title: NAME,
        tagline: "The shared inbox for small support teams.",
        nav: [
          { type: "page", page: P.features, label: "Features" },
          { type: "page", page: P.pricing, label: "Pricing" },
          { type: "collection", collection: LOG, label: "Changelog" },
          { type: "page", page: P.about, label: "About" },
          { type: "link", label: "Sign in", href: "https://app.relay.example/login" },
          { type: "button", label: "Start free", link: url(SIGNUP), style: "primary" },
        ],
        header: headerFrom("header/classic@1", { sticky: true }),
        footer: fromPreset("footer/sitemap@1", {
          drop: ["text:5"],
          theme: "dark",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p(NAME, "lead"),
                rt.p("The shared inbox and help centre for small support teams."),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Product", [
                  ["Features", href("features")],
                  ["Pricing", href("pricing")],
                  ["Changelog", collectionPath(LOG)],
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
                ...linkColumn("Help", [
                  ["Status", "https://status.relay.example"],
                  ["Help centre", "https://help.relay.example"],
                ]),
              ),
            },
            "text:6": {
              content: rt.doc(rt.p("© 2026 Relay Software Ltd. Made in five countries.", "small")),
            },
          },
        }),
        social: [
          { network: "linkedin", url: "https://linkedin.com/company/relay-example" },
          { network: "bluesky", url: "https://bsky.app/profile/relay.example" },
        ],
        seo: {
          titleTemplate: "%s · Relay",
          description: "The shared inbox and help centre for small support teams.",
          image: photoUrl("dashboardLight", 1200),
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), features(), pricing(), about(), contact()],
      collectionConfigs: {
        [LOG]: {
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
          feed: { enabled: true, title: "Relay changelog", description: "What's new in Relay." },
        },
      },
      collections: {
        [LOG]: [
          post(
            "2026-10-19-help-centre-search",
            {
              title: "Help centre search that understands typos",
              date: "2026-10-19",
              author: "Jonah Ellis",
              categories: ["new"],
              excerpt:
                "Customers now find the right article even when they misspell what they're looking for.",
            },
            "Help centre search now tolerates typos and plurals, and shows the best paragraph from each article in the results.\n\nIt's on for every help centre — nothing to switch on.\n",
          ),
          post(
            "2026-10-05-snooze-until-reply",
            {
              title: "Snooze until the customer replies",
              date: "2026-10-05",
              author: "Maya Chen",
              categories: ["improved"],
              excerpt:
                "A new snooze option keeps waiting conversations out of your queue until there's news.",
            },
            "Waiting on a customer? Snooze a conversation *until they reply* and it leaves your queue. If they haven't answered in a week, Relay brings it back with a gentle nudge.\n",
          ),
          post(
            "2026-09-21-faster-attachments",
            {
              title: "Faster attachments on slow connections",
              date: "2026-09-21",
              author: "Rafael Costa",
              categories: ["fixed"],
              excerpt: "Large screenshots now upload in the background, so you can keep typing.",
            },
            "Attachments now upload in the background while you write. On slow connections, replies send about twice as fast.\n",
          ),
        ],
      },
    };
  },
};
