/**
 * openspace.dev — the OpenSpace marketing site and template gallery, authored as an OpenSpace
 * site document (dogfooding): section presets from @omniharmonic/openspace-blocks rewritten with the
 * templates' authoring kit, Site Styles tokens, and the launch templates' own metadata and
 * screenshots. `generate.ts` writes it to `content/` and site-kit builds it like any other site.
 */
import type { ImageValue, MediaMeta, SiteDocument } from "@omniharmonic/openspace-schema";
import { type TemplateSpec, templateSpecs } from "@omniharmonic/openspace-templates";
import { buildTemplate, type Licenses } from "../../../../templates/lib/define";
import {
  body,
  definePages,
  fromPreset,
  headerFrom,
  linkColumn,
  makePage,
  page,
  photo,
  rt,
  url,
} from "../../../../templates/lib/kit";

export const SITE_URL = "https://openspace.dev";
export const STUDIO = "https://studio.openspace.dev";
export const DOCS = "https://docs.openspace.dev";
export const GITHUB = "https://github.com/omniharmonic/openspace";
export const HUB = "https://hub.openspace.dev";

const START = url(`${STUDIO}/templates`);
const startWith = (id: string) => url(`${STUDIO}/new/${id}`);

const PAGES = definePages("www", {
  home: "",
  templates: "templates",
  pricing: "pricing",
  about: "about",
});
const P = PAGES.id;
const href = PAGES.href;

// --- template showcase -------------------------------------------------------------------------

/** Screenshot of a template's home page in its three looks, side by side (from the visual QA pass). */
export const SHOT = { width: 1400, height: 478 } as const;
export const shotPath = (id: string) => `media/templates/${id}-looks.png`;
/** The taller Meadow screenshot used in the home hero. */
export const HERO = { path: "media/hero/meadow-looks.png", width: 1400, height: 701 } as const;

const heroShot = (): ImageValue => ({
  src: HERO.path,
  alt: "The Meadow template in three looks, showing how one site can change its whole style",
  width: HERO.width,
  height: HERO.height,
});

const spec = (id: string): TemplateSpec => {
  const s = templateSpecs.find((t) => t.id === id);
  if (!s) throw new Error(`Unknown template ${id}`);
  return s;
};

const lookNames = (s: TemplateSpec) => s.looks.map((l) => l.name).join(" · ");

function shot(id: string): ImageValue {
  const s = spec(id);
  return {
    src: shotPath(id),
    alt: `The ${s.name} template's home page in its three looks: ${s.looks.map((l) => l.name).join(", ")}`,
    width: SHOT.width,
    height: SHOT.height,
  };
}

/** One gallery card: the looks screenshot, the name, who it's for and its looks. */
function card(id: string) {
  const s = spec(id);
  return {
    image: shot(id),
    heading: s.name,
    body: body(`For ${lowerFirst(s.persona)}. ${s.mood}. Looks: ${lookNames(s)}.`),
    link: startWith(id),
    linkLabel: `Start with ${s.name}`,
  };
}

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Stable media ids: `med_www0000000`, `med_www0000001`, … */
const mediaId = (n: number) => `med_www${String(n).padStart(7, "0")}` as MediaMeta["id"];

/** Media library entries for the template screenshots (content/media.json). */
export function templateMedia(bytes: (path: string) => number): Record<string, MediaMeta> {
  const hero = heroShot();
  const out: Record<string, MediaMeta> = {
    [HERO.path]: {
      id: mediaId(0),
      path: HERO.path as MediaMeta["path"],
      kind: "image",
      mime: "image/png",
      bytes: bytes(HERO.path),
      width: HERO.width,
      height: HERO.height,
      alt: hero.alt,
      credit: { author: "OpenSpace contributors", source: "OpenSpace templates" },
      license: "CC-BY-4.0",
      createdAt: "2026-10-26T12:00:00Z",
    },
  };
  for (const s of templateSpecs) {
    const path = shotPath(s.id);
    out[path] = {
      id: mediaId(templateSpecs.indexOf(s) + 1),
      path: path as MediaMeta["path"],
      kind: "image",
      mime: "image/png",
      bytes: bytes(path),
      width: SHOT.width,
      height: SHOT.height,
      alt: shot(s.id).alt,
      credit: { author: "OpenSpace contributors", source: "OpenSpace templates" },
      license: "CC-BY-4.0",
      createdAt: "2026-10-26T12:00:00Z",
    };
  }
  return out;
}

// --- pages --------------------------------------------------------------------------------------

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "OpenSpace is a free, open-source website builder: Squarespace-quality templates, a visual editor, and your own AI — on a site you own.",
    [
      fromPreset("hero/image-below@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Open source · Free forever",
            text: "Beautiful websites you actually own",
            subheading:
              "Pick a template, sign in with GitHub and your site is live in about three minutes. Edit it on any device, or ask your own AI to. No subscription, ever.",
          },
          button: {
            label: "Make your site — free",
            link: START,
            secondaryLabel: "See the templates",
            secondaryLink: page(P.templates),
          },
          image: { image: heroShot(), aspect: "original" },
        },
      }),
      fromPreset("features/icon-row@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Why OpenSpace",
            text: "Everything a website builder does, minus the rent",
            subheading:
              "The parts that used to justify a monthly fee are free today. OpenSpace puts them together with the design care they deserve.",
          },
          "icon-list": {
            items: [
              {
                icon: "home",
                title: "You own it",
                text: "Your site lives in your own GitHub account, in open formats. Leave any time with everything.",
              },
              {
                icon: "heart",
                title: "Free by design",
                text: "Hosting, builds and storage run on free accounts you control. Nothing to renew.",
              },
              {
                icon: "sparkles",
                title: "Beautiful by default",
                text: "Curated type, generated accessible palettes and designed sections make every page look intentional.",
              },
              {
                icon: "message-circle",
                title: "Your AI, if you want it",
                text: "Ask Claude to add a page or restyle the site. It edits safely, and you approve before anything goes live.",
              },
            ],
          },
        },
      }),
      fromPreset("services/steps@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Live in three minutes", text: "From template to live site" },
          columns: {
            items: [
              {
                heading: "Pick a template",
                body: body(
                  "Twelve designs for practices, restaurants, nonprofits, artists, shops and more, each in three looks.",
                ),
              },
              {
                heading: "Sign in with GitHub",
                body: body(
                  "A free account is where your site's files live. No account yet? Studio walks you through making one.",
                ),
              },
              {
                heading: "You're live",
                body: body(
                  "Your name and tagline go in, and the site is online at a free address you can swap for your own domain.",
                ),
              },
            ],
          },
          button: { label: "Make your site — free", link: START },
        },
      }),
      fromPreset("features/checklist-image@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Ownership",
            text: "Your site, your files, your audience",
            subheading:
              "OpenSpace never holds your site hostage. If the project disappeared tomorrow, your site would keep working.",
          },
          "icon-list": {
            items: [
              { icon: "check", title: "Files in your own GitHub account, under your name" },
              { icon: "check", title: "Published free by GitHub Pages, or your own Cloudflare" },
              { icon: "check", title: "Form entries and subscribers exportable any time" },
              { icon: "check", title: "Standard tools build it, with or without OpenSpace" },
            ],
          },
          button: {
            label: "Where everything lives",
            link: url(`${DOCS}/getting-started/`),
            role: "secondary",
          },
          image: {
            image: photo(
              "deskFlatlay",
              640,
              "1:1",
              "A tidy desk with a notebook, coffee and laptop, ready to work",
            ),
          },
        },
      }),
      fromPreset("features/three-cards@1", {
        theme: "dark",
        edit: {
          heading: { eyebrow: "Connect your AI", text: "Ask Claude to edit your site" },
          "card:1": {
            heading: "Claude connector",
            body: body(
              "Paste one link into Claude. It can add pages, write posts and restyle, through safe, typed edits.",
            ),
            icon: "message-circle",
          },
          "card:2": {
            heading: "Claude Code plugin",
            body: body(
              "Design checks and screenshots after every change, for fast design work on a local copy.",
            ),
            icon: "wrench",
          },
          "card:3": {
            heading: "Drafts, never surprises",
            body: body(
              "AI edits land in a draft you can watch live. Undo all of them in one click, or publish.",
            ),
            icon: "shield-check",
          },
          "card:4": {
            heading: "Free to run",
            body: body(
              "Bring your own AI. OpenSpace never pays for, or meters, the model you use.",
            ),
            icon: "zap",
          },
        },
      }),
      fromPreset("services/image-cards@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Templates",
            text: "Designed to look finished on day one",
            subheading:
              "Real-feeling copy and photography, three looks each, and an accessible color system that keeps every combination readable.",
          },
          columns: {
            items: [card("meadow"), card("atelier"), card("signal")],
            columns: "3",
            aspect: "original",
          },
        },
      }),
      fromPreset("faq/split@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "Questions", text: "Good to know" },
          text: {
            content: rt.doc(rt.p("The documentation covers everything in plain language.")),
          },
          button: { label: "Read the docs", link: url(DOCS) },
          accordion: {
            items: [
              {
                question: "Is it really free?",
                answer: body(
                  "Yes. Your site is served by GitHub Pages or your own Cloudflare account, both free. The shared service for forms and newsletters is built to cost cents per thousand sites.",
                ),
              },
              {
                question: "Do I need to know how to code?",
                answer: body(
                  "No. You edit everything visually in Studio, on a computer or a phone. Words like repository and build stay out of sight unless you go looking.",
                ),
              },
              {
                question: "What would I pay for?",
                answer: body(
                  "Only optional extras: a custom domain from any registrar, and the usual card fees if you sell through Stripe. OpenSpace takes no cut.",
                ),
              },
              {
                question: "Can I leave?",
                answer: body(
                  "Any time. Your site is a normal project in your account that standard tools can build, and your form entries and subscribers export as spreadsheets.",
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
            text: "Make your site today",
            subheading:
              "Pick a template and be live in about three minutes. It's free, and it's yours.",
          },
          button: {
            label: "Make your site — free",
            link: START,
            secondaryLabel: "Browse templates",
            secondaryLink: page(P.templates),
          },
        },
      }),
    ],
    { seoTitle: "Beautiful websites you own, free forever" },
  );
}

/** The six MVP templates first, then the six that followed (doc 04 §7). */
const FIRST = ["meadow", "harbor", "atelier", "ledger", "hearth", "signal"];
const SECOND = ["field-notes", "encore", "kiln", "commons", "vow", "link"];

function templates() {
  const gallery = (
    ids: string[],
    theme: "light" | "light-accent",
    eyebrow: string,
    title: string,
    anchor: string,
  ) =>
    fromPreset("gallery/project-cards@1", {
      theme,
      anchor,
      edit: {
        heading: { eyebrow, text: title },
        columns: { items: ids.map(card), columns: "2", aspect: "original" },
      },
    });
  return makePage(
    P.templates,
    "Templates",
    "templates",
    "Twelve OpenSpace templates for practices, nonprofits, artists, restaurants, shops and more, each with three looks. Free to use and change.",
    [
      fromPreset("hero/centered@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Template gallery",
            text: "Twelve templates, three looks each",
            subheading:
              "Every template arrives finished: real-feeling pages, photography and a type pairing chosen for its purpose. Switch looks any time without touching your content.",
          },
          button: {
            label: "Make your site — free",
            link: START,
            secondaryLabel: "How looks work",
            secondaryLink: url(`${DOCS}/templates/`),
          },
        },
      }),
      gallery(FIRST, "light", "Practices, causes and businesses", "Start here", "first"),
      gallery(
        SECOND,
        "light-accent",
        "Writers, artists, shops and occasions",
        "And six more",
        "more",
      ),
      fromPreset("cta/split@1", {
        theme: "dark",
        edit: {
          heading: { eyebrow: "Designers welcome", text: "Make a template for everyone" },
          button: {
            label: "Contributing templates",
            link: url(`${DOCS}/contributing/templates/`),
            note: "Templates are data, not code.",
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
    "OpenSpace is free forever, by architecture: your site runs on free accounts you own, and you bring your own AI. No plans, no transaction fees.",
    [
      fromPreset("hero/centered@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Pricing",
            text: "Free, forever — by architecture",
            subheading:
              "There's no plan to upgrade to. Hosting, builds and storage run on free accounts you own, so one more site costs the project almost nothing.",
          },
          button: {
            label: "Make your site — free",
            link: START,
            secondaryLabel: "Read how it works",
            secondaryLink: url(`${DOCS}/architecture/`),
          },
        },
      }),
      fromPreset("pricing/single-offer@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "One plan",
            text: "Everything, for everyone",
            subheading:
              "The same features for a yoga teacher, a food co-op or a pottery shop. No tiers, no trials, no surprises at renewal.",
          },
          "icon-list": {
            items: [
              { icon: "check", title: "All twelve templates and every section preset" },
              { icon: "check", title: "Forms, newsletter signups and analytics" },
              { icon: "check", title: "Blog, events, members and a store" },
              { icon: "check", title: "Custom domains with free HTTPS" },
            ],
          },
          pricing: {
            plans: [
              {
                name: "OpenSpace",
                price: "$0",
                period: "forever",
                description: "Every feature, on a site that belongs to you.",
                features: [
                  { text: "No transaction fees" },
                  { text: "No add-on subscriptions" },
                  { text: "Export everything, any time" },
                ],
                buttonLabel: "Make your site",
                link: START,
                featured: true,
              },
            ],
            note: "Optional costs are paid to others, never to OpenSpace: a domain name, and Stripe's card fees if you sell.",
          },
        },
      }),
      fromPreset("features/icon-row@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Where the costs go",
            text: "Why free can stay free",
            subheading:
              "Each part runs where it is already free, so no one has to pay for your site to stay online.",
          },
          "icon-list": {
            items: [
              {
                icon: "globe",
                title: "Hosting",
                text: "GitHub Pages serves content sites free; stores use your own free Cloudflare plan.",
              },
              {
                icon: "rocket",
                title: "Publishing",
                text: "GitHub Actions builds public sites free, in about a minute.",
              },
              {
                icon: "message-circle",
                title: "AI",
                text: "You bring your own AI, so there is no metered model to pay for.",
              },
              {
                icon: "users",
                title: "The shared Hub",
                text: "Forms and newsletters run on one small service built to cost cents per thousand sites.",
              },
            ],
          },
        },
      }),
      fromPreset("faq/centered@1", {
        theme: "light",
        edit: {
          heading: { eyebrow: "Fine print", text: "Honest answers about money" },
          accordion: {
            items: [
              {
                question: "Who pays for the shared Hub?",
                answer: body(
                  "A small stewarding group, funded by voluntary contributions and grants. Anyone can also run their own Hub.",
                ),
              },
              {
                question: "Do you take a cut of sales or donations?",
                answer: body(
                  "Never. Payments go to your own Stripe account with no platform fee. Stripe charges its usual card fees.",
                ),
              },
              {
                question: "What about email newsletters?",
                answer: body(
                  "Campaigns send through your own email provider, whose free tiers cover most small lists. Signups and opt-in emails are included.",
                ),
              },
              {
                question: "Are there limits?",
                answer: body(
                  "Generous fair-use limits on the public Hub keep it free, such as 1,000 form entries a month per site. Self-hosted Hubs set their own.",
                ),
              },
            ],
          },
        },
      }),
      fromPreset("cta/banner@1", {
        theme: "dark",
        edit: {
          heading: {
            text: "Keep the money you'd spend on rent",
            subheading: "Start from a template and publish today. Upgrade nothing, ever.",
          },
          button: {
            label: "Make your site — free",
            link: START,
            secondaryLabel: "See the templates",
            secondaryLink: page(P.templates),
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
    "OpenSpace is open source: MIT-licensed templates and blocks, an AGPL editor and Hub, and CC BY documentation. Anyone can run their own.",
    [
      fromPreset("hero/big-type@1", {
        theme: "light-accent",
        edit: {
          heading: { eyebrow: "About OpenSpace", text: "Websites as a commons" },
          text: {
            content: rt.doc(
              rt.p(
                "OpenSpace is an open-source website builder with the polish of Squarespace and none of the lock-in. It's built in the open, and anyone can run their own copy.",
                "lead",
              ),
            ),
          },
          button: {
            label: "View on GitHub",
            link: url(GITHUB),
            secondaryLabel: "Read the docs",
            secondaryLink: url(DOCS),
          },
        },
      }),
      fromPreset("about/two-column-text@1", {
        theme: "light",
        edit: {
          heading: {
            eyebrow: "Why we built it",
            text: "Builders charge rent on commodities",
            subheading:
              "Hosting, a CDN, an editor and AI help used to justify a monthly bill. Today they're free or open source. What was missing was the integration and the design quality.",
          },
          text: {
            content: rt.doc(
              rt.p(
                "A small nonprofit with a newsletter and a donate button can easily pay hundreds a year, indefinitely, for what is mostly static hosting and a form. Stop paying and the site disappears, along with the design work and the audience list.",
              ),
              rt.p(
                "OpenSpace takes the other path. Every site is a normal project in its owner's GitHub account, built with Astro and served free. The editor renders the same components as the published site, so what you see is what visitors get, and the shared Hub only does what static sites can't: forms, newsletters, analytics, members and checkout.",
              ),
              rt.p(
                "The result is a website builder that costs the project almost nothing per site, which is what makes free forever a property of the design rather than a promotion.",
              ),
            ),
          },
        },
      }),
      fromPreset("about/values@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Principles",
            text: "What we hold to",
            subheading: "Seven principles shape every decision; these three come up most.",
          },
          "icon-list": {
            items: [
              {
                icon: "home",
                title: "You own it",
                text: "Your site lives in your account, in open formats. Leave any time, with everything, working.",
              },
              {
                icon: "lightbulb",
                title: "As easy as Squarespace",
                text: "Someone who has never heard of Git should succeed without ever seeing the word.",
              },
              {
                icon: "heart-handshake",
                title: "Open and forkable",
                text: "All code is open source. Anyone can run the editor and Hub, so there's no single point of failure.",
              },
            ],
          },
        },
      }),
      fromPreset("faq/split@1", {
        theme: "light",
        edit: {
          heading: { eyebrow: "Open source", text: "Licenses, in plain words" },
          text: {
            content: rt.doc(
              rt.p("Contributions of code, templates and documentation are welcome."),
            ),
          },
          button: { label: "How to contribute", link: url(`${GITHUB}/blob/main/CONTRIBUTING.md`) },
          accordion: {
            items: [
              {
                question: "Templates, blocks and the site starter",
                answer: body(
                  "MIT. Sites must be freely forkable, so everything a published site depends on is under the most permissive license.",
                ),
              },
              {
                question: "The Studio editor and the Hub",
                answer: body(
                  "AGPL-3.0. If someone runs a modified copy for others, their improvements come back to the commons.",
                ),
              },
              {
                question: "Documentation and template designs",
                answer: body("CC BY 4.0. Remix them freely with attribution."),
              },
              {
                question: "Can I run my own Hub?",
                answer: body(
                  "Yes. It's one Cloudflare Workers project with a Deploy to Cloudflare button, and any site can point at it.",
                ),
              },
            ],
          },
        },
      }),
      fromPreset("cta/banner@1", {
        theme: "dark",
        edit: {
          heading: {
            text: "Build with us",
            subheading: "Make a site, design a template, or help steward the commons.",
          },
          button: {
            label: "Make your site — free",
            link: START,
            secondaryLabel: "Star on GitHub",
            secondaryLink: url(GITHUB),
          },
        },
      }),
    ],
  );
}

// --- the site -----------------------------------------------------------------------------------

export const wwwSpec: TemplateSpec = {
  id: "openspace-www",
  name: "OpenSpace",
  description: "The OpenSpace marketing site and template gallery.",
  persona: "Open-source project",
  mood: "Warm, confident, civic",
  tags: ["marketing", "open-source"],
  sample: { name: "OpenSpace", tagline: "Beautiful websites you actually own." },
  thumbnail: P.home,
  looks: [
    {
      id: "commons-green",
      name: "Commons Green",
      description: "Deep green with warm paper neutrals and Fraunces headings.",
      choices: {
        palette: {
          brand: "oklch(0.45 0.08 165)",
          neutral: "warm",
          contrast: "standard",
          source: "brand",
        },
        pairing: "fraunces-hanken",
        density: "comfortable",
        shape: "soft",
        buttons: "pill-solid",
        motion: "subtle",
        imageTreatment: "rounded",
      },
    },
    {
      id: "ink",
      name: "Ink",
      description: "Ink blue with crisp editorial type.",
      choices: {
        palette: {
          brand: "oklch(0.42 0.1 255)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "source-serif-plex",
        density: "comfortable",
        shape: "sharp",
        buttons: "solid",
        motion: "subtle",
        imageTreatment: "none",
      },
    },
    {
      id: "signal",
      name: "Signal",
      description: "Near-black with an electric accent.",
      choices: {
        palette: {
          brand: "oklch(0.55 0.25 285)",
          neutral: "cool",
          contrast: "standard",
          source: "brand",
        },
        pairing: "bricolage-geist",
        density: "comfortable",
        shape: "soft",
        buttons: "solid",
        motion: "expressive",
        imageTreatment: "none",
      },
    },
  ],
  build() {
    return {
      features: { forms: false, newsletter: false, analytics: true },
      site: {
        title: "OpenSpace",
        tagline: "Beautiful websites you actually own.",
        nav: [
          { type: "page", page: P.templates, label: "Templates" },
          { type: "page", page: P.pricing, label: "Pricing" },
          { type: "page", page: P.about, label: "About" },
          { type: "link", label: "Docs", href: DOCS },
          { type: "link", label: "GitHub", href: GITHUB },
          { type: "button", label: "Make your site — free", link: START, style: "primary" },
        ],
        header: headerFrom("header/classic@1", { sticky: true }),
        footer: fromPreset("footer/columns@1", {
          theme: "dark",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p("OpenSpace", "lead"),
                rt.p("Beautiful websites you own, free forever. Built in the open."),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Product", [
                  ["Templates", href("templates")],
                  ["Pricing", href("pricing")],
                  ["Studio", `${STUDIO}/`],
                ]),
              ),
            },
            "text:3": {
              content: rt.doc(
                ...linkColumn("Learn", [
                  ["Documentation", `${DOCS}/`],
                  ["Connect your AI", `${DOCS}/connect-your-ai/`],
                  ["Self-hosting", `${DOCS}/self-hosting/`],
                ]),
              ),
            },
            "text:4": {
              content: rt.doc(
                rt.p("Open source", "eyebrow"),
                rt.p([
                  "Code under MIT and AGPL-3.0; docs and designs under CC BY 4.0. ",
                  rt.link("About the project", href("about")),
                ]),
                rt.p("© 2026 OpenSpace contributors", "small"),
              ),
            },
          },
        }),
        social: [{ network: "github", url: GITHUB }],
        seo: {
          titleTemplate: "%s · OpenSpace",
          description: "Beautiful websites you own, free forever.",
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
      },
      pages: [home(), templates(), pricing(), about()],
    };
  },
};

export interface BuiltWww {
  doc: SiteDocument;
  licenses: Licenses;
}

/** The complete site document for openspace.dev. */
export function buildWww(bytes: (path: string) => number): BuiltWww {
  const { doc, licenses } = buildTemplate(wwwSpec);
  doc.config = {
    ...doc.config,
    template: { id: "openspace-www", version: "1.0.0" },
    hub: HUB,
    deploy: { target: "github-pages", url: SITE_URL, customDomain: "openspace.dev" },
  };
  doc.media = templateMedia(bytes);
  licenses.$comment =
    "Licenses for the media on openspace.dev. Template screenshots are OpenSpace template designs (CC BY 4.0).";
  return { doc, licenses };
}
