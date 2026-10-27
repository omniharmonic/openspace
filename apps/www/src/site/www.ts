/**
 * openspace.host — the OpenSpace marketing site and template gallery, authored as an OpenSpace
 * site document (dogfooding): blocks and section presets from @omniharmonic/openspace-blocks,
 * written with the templates' authoring kit, Site Styles tokens, and the launch templates' own
 * metadata and renders. The three interactive demos on the home page are ordinary Code blocks
 * (`demos/*.html`, sandboxed like any site's code), and `custom.css` is the site's Custom CSS.
 * `generate.ts` writes it all to `content/` and site-kit builds it like any other site.
 */
import { readFileSync } from "node:fs";
import type {
  Block,
  GridRect,
  ImageValue,
  MediaMeta,
  SectionLayout,
  SiteDocument,
} from "@omniharmonic/openspace-schema";
import { type TemplateSpec, templateSpecs } from "@omniharmonic/openspace-templates";
import { buildTemplate, type Licenses } from "../../../../templates/lib/define";
import {
  block,
  body,
  button,
  definePages,
  fromPreset,
  gridRows,
  headerFrom,
  heading,
  linkColumn,
  makePage,
  page,
  r,
  rt,
  section,
  text,
  url,
} from "../../../../templates/lib/kit";

export const SITE_URL = "https://openspace.host";
export const STUDIO = "https://studio.openspace.host";
export const HUB = "https://hub.openspace.host";
export const GITHUB = "https://github.com/omniharmonic/openspace";
/** The documentation, read on GitHub until apps/docs has a public address. */
export const DOCS = "https://docs.openspace.host";
const doc = (path: string) => `${DOCS}/${path.replace(/\.md$/, "")}/`;
export const CLI = "npx @omniharmonic/openspace-cli new meadow my-site";
export const PLUGIN = "/plugin marketplace add omniharmonic/openspace";
export const MCP_ADD = `claude mcp add --transport http openspace ${HUB}/mcp`;

const START = url(`${STUDIO}/templates`);
const REPO = url(GITHUB);
const startWith = (id: string) => url(`${STUDIO}/new/${id}`);

const PAGES = definePages("www", {
  home: "",
  templates: "templates",
  pricing: "pricing",
  about: "about",
});
const P = PAGES.id;
const href = PAGES.href;

/** Inline code in rich text. */
const code = (t: string) => ({
  type: "text" as const,
  text: t,
  marks: [{ type: "code" as const }],
});

// --- the demos (Code blocks) --------------------------------------------------------------------

const demoFile = (name: string) =>
  readFileSync(new URL(`./demos/${name}.html`, import.meta.url), "utf8")
    .replace(/\n\s*/g, "\n")
    .trim();

/** A sandboxed Code block holding one of the interactive demos. */
const demo = (name: string, title: string, height: number, col?: number): Block =>
  block(
    "embed",
    { embed: { type: "code", code: demoFile(name) }, title, aspect: "auto", height },
    { variant: "plain", ...(col !== undefined ? { col } : {}) },
  );

// --- media --------------------------------------------------------------------------------------

/** Screenshot of a template's home page in its three looks, side by side (from the visual QA pass). */
export const SHOT = { width: 1400, height: 478 } as const;
export const shotPath = (id: string) => `media/templates/${id}-looks.png`;
/** A first-screen render of each template's demo home page at 1280 × 800 (its first look). */
export const RENDER = { width: 1280, height: 800 } as const;
export const renderPath = (id: string) => `media/showcase/${id}.jpg`;
/** Share image and tab icon. */
export const OG = { path: "media/brand/og.png", width: 1200, height: 630 } as const;
export const FAVICON = "media/brand/favicon.svg";

const spec = (id: string): TemplateSpec => {
  const s = templateSpecs.find((t) => t.id === id);
  if (!s) throw new Error(`Unknown template ${id}`);
  return s;
};

const lookNames = (s: TemplateSpec) => s.looks.map((l) => l.name).join(", ");
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function shot(id: string): ImageValue {
  const s = spec(id);
  return {
    src: shotPath(id),
    alt: `The ${s.name} template's home page in its three looks: ${s.looks.map((l) => l.name).join(", ")}`,
    width: SHOT.width,
    height: SHOT.height,
  };
}

function rendered(id: string): ImageValue {
  const s = spec(id);
  return {
    src: renderPath(id),
    alt: `The first screen of the ${s.name} template's demo home page, in its ${s.looks[0].name} look`,
    width: RENDER.width,
    height: RENDER.height,
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

/** Stable media ids: `med_www0000000`, `med_www0000001`, … */
const mediaId = (n: number) => `med_www${String(n).padStart(7, "0")}` as MediaMeta["id"];

const CREDIT = { author: "OpenSpace contributors", source: "OpenSpace templates" };

/** Media library entries (content/media.json). */
export function templateMedia(bytes: (path: string) => number): Record<string, MediaMeta> {
  const out: Record<string, MediaMeta> = {};
  let n = 0;
  const add = (path: string, mime: string, width: number, height: number, alt: string) => {
    out[path] = {
      id: mediaId(n++),
      path: path as MediaMeta["path"],
      kind: "image",
      mime,
      bytes: bytes(path),
      width,
      height,
      alt,
      credit: CREDIT,
      license: "CC-BY-4.0",
      createdAt: "2026-10-27T12:00:00Z",
    };
  };
  add(OG.path, "image/png", OG.width, OG.height, "OpenSpace: a website you own, free to host");
  add(FAVICON, "image/svg+xml", 64, 64, "The OpenSpace mark");
  for (const s of templateSpecs) {
    add(shotPath(s.id), "image/png", SHOT.width, SHOT.height, shot(s.id).alt);
    add(renderPath(s.id), "image/jpeg", RENDER.width, RENDER.height, rendered(s.id).alt);
  }
  return out;
}

// --- home ---------------------------------------------------------------------------------------

/** A grid section with desktop, tablet and phone rectangles for each block. */
function gridSection(
  placed: [Block, { d: GridRect; t?: GridRect; m: GridRect }][],
  o: Parameters<typeof section>[2],
) {
  const items: Record<string, { d: GridRect; t?: GridRect; m: GridRect }> = {};
  for (const [b, rects] of placed) items[b.id] = rects;
  const layout = { mode: "grid", rows: gridRows(items), items, width: "wide" } as SectionLayout;
  return section({ layout, blocks: placed.map(([b]) => b) }, layout, o);
}

function hero() {
  const h1 = heading("A professional website that's yours to keep", {
    level: 1,
    size: "display",
  });
  const lead = text([
    rt.p(
      "Start from a designer template, shape it in a visual editor or with Claude, and publish it free on GitHub Pages. Every page is a plain file in your own GitHub repository.",
    ),
  ]);
  const cta = button("Start free", START, {
    size: "large",
    second: ["See it on GitHub", REPO],
    note: "Open source and in pre-release. You need a free GitHub account.",
  });
  const looks = demo("looks", "Demo: the Studio editor switching a site between three looks", 560);
  return gridSection(
    [
      [h1, { d: r(1, 1, 19, 1), t: r(1, 1, 24, 1), m: r(1, 1, 8, 1) }],
      [lead, { d: r(1, 2, 11, 1), t: r(1, 2, 18, 1), m: r(1, 2, 8, 1) }],
      [cta, { d: r(14, 2, 11, 1), t: r(1, 3, 24, 1), m: r(1, 3, 8, 1) }],
      [looks, { d: r(1, 3, 24, 1), t: r(1, 4, 24, 1), m: r(1, 4, 8, 1) }],
    ],
    { theme: "brand", anchor: "hero", label: "Hero", padding: { d: "xl", m: "lg" } },
  );
}

function numbers() {
  return section(
    [
      block(
        "stats",
        {
          items: [
            {
              value: "$0",
              label: "to host on GitHub Pages",
              detail: "Or on your own Cloudflare account. A domain is optional.",
            },
            {
              value: "12 × 3",
              label: "templates and looks",
              detail: "Plus a library of designed sections, and growing.",
            },
            {
              value: "99–100",
              label: "Lighthouse performance",
              detail: "Every template's home page on mobile, in our own tests.",
            },
            {
              value: "< 6 KB",
              label: "of JavaScript per page",
              detail: "Template home pages ship 1.6 to 5.2 KB. The rest is static HTML.",
            },
          ],
        },
        { variant: "row" },
      ),
    ],
    { width: "wide" },
    { theme: "light", anchor: "numbers", label: "Numbers", padding: { d: "lg", m: "md" } },
  );
}

function how() {
  return section(
    [
      heading("Three steps, then it's yours", {
        sub: "No servers to rent and nothing to install. Studio runs in your browser, on a computer or a phone.",
      }),
      block(
        "columns",
        {
          items: [
            {
              heading: "Pick a template",
              body: body(
                "Twelve designs for practices, restaurants, nonprofits, artists, shops and more, each in three looks. Your name and tagline go in as you start.",
              ),
            },
            {
              heading: "Edit visually, or ask Claude",
              body: body(
                "Click any words to change them. Drag blocks on a 24-column grid, restyle every page from Site Styles, or describe the change to Claude.",
              ),
            },
            {
              heading: "Publish to your GitHub Pages",
              body: body(
                "Publishing builds your site and puts it online at your own address. Roll back to any earlier version in one click.",
              ),
            },
          ],
          columns: "3",
          aspect: "original",
        },
        { variant: "steps" },
      ),
      demo("files", "Demo: editing a section and watching its JSON file change", 500),
      text([
        rt.p([
          "Your site is a normal repository: ",
          code("openspace.json"),
          ", a ",
          code("content/"),
          " folder of JSON and a ",
          code("media/"),
          " folder. Astro builds it and GitHub Pages serves it. Prefer a terminal? ",
          code(CLI),
          " starts the same site locally.",
        ]),
      ]),
    ],
    { width: "wide" },
    { theme: "light-accent", anchor: "how", label: "How it works" },
  );
}

/** Published prices, US dollars, billed annually, as read on 27 October 2026 (see the notes). */
export const PRICES = {
  squarespaceBasic: 19,
  squarespaceCore: 29,
  wixLight: 17,
  wixCore: 29,
  webflowBasic: 15,
  webflowEcomPlus: 74,
} as const;
const threeYears = (monthly: number) => monthly * 36;

function cost() {
  const chart = (title: string, description: string, rows: [string, number][]) =>
    block(
      "chart",
      {
        title,
        description,
        rows: rows.map(([label, value]) => ({ label, value })),
        prefix: "$",
        showValues: true,
        showTable: true,
      },
      { variant: "bar", col: 1 },
    );
  return section(
    [
      heading("What renting a website costs", {
        sub: "Website builders charge every month for hosting that is now free. Here is three years on each builder's cheapest plan that does the job, at their published annual prices.",
        col: 0,
      }),
      text(
        [
          rt.p(
            "What OpenSpace costs you: nothing for hosting on GitHub Pages, or on your own Cloudflare account, which has a free plan. A domain name costs the same wherever you buy it (builders include the first year with an annual plan). Card payments go through your own Stripe account at Stripe's usual rates, as they would anywhere, and OpenSpace adds no fee on top.",
          ),
        ],
        { col: 0 },
      ),
      chart(
        "Three years of website plans, in US dollars",
        "The cheapest plan with a custom domain, and the cheapest that sells with no platform fee, at published annual prices.",
        [
          ["Squarespace Basic", threeYears(PRICES.squarespaceBasic)],
          ["Wix Light", threeYears(PRICES.wixLight)],
          ["Webflow Basic", threeYears(PRICES.webflowBasic)],
          ["Squarespace Core, to sell", threeYears(PRICES.squarespaceCore)],
          ["Wix Core, to sell", threeYears(PRICES.wixCore)],
          ["Webflow Ecommerce Plus, to sell", threeYears(PRICES.webflowEcomPlus)],
          ["OpenSpace, either way", 0],
        ],
      ),
    ],
    { cols: [5, 7], t: [12], gap: "2xl", width: "wide" },
    { theme: "light", anchor: "cost", label: "Cost" },
  );
}

function lockin() {
  return section(
    [
      heading("And what you can take with you", {
        sub: "Price isn't the only cost. If you leave a builder, here is what comes along, according to each one's own help pages.",
      }),
      block(
        "columns",
        {
          items: [
            {
              heading: "Squarespace",
              body: body(
                "Exports some pages and one blog as a WordPress file. Styles, custom CSS, store pages and most blocks stay behind.",
              ),
            },
            {
              heading: "Wix",
              body: body(
                "A Wix site can't be moved to another host or backed up outside Wix. Blog posts can't be exported.",
              ),
            },
            {
              heading: "Webflow",
              body: body(
                "Code export needs a paid Workspace plan, and leaves out CMS, ecommerce and user content. Forms and search stop working.",
              ),
            },
            {
              heading: "OpenSpace",
              body: body(
                "Everything. Your site is already a repository in your account, and form entries, subscribers and orders export as spreadsheets.",
              ),
            },
          ],
          columns: "4",
          aspect: "original",
        },
        { variant: "plain" },
      ),
      text([
        rt.p(
          [
            "Prices are in US dollars per month billed annually, before tax, read from each company's pricing page on 27 October 2026; monthly billing costs more on every builder. Squarespace Basic adds a 2% fee on store sales and Webflow's Standard ecommerce plan ($29) adds 2%, which is why the selling comparison uses the next plan up. Sources: ",
            rt.link("Squarespace pricing", "https://www.squarespace.com/pricing"),
            ", ",
            rt.link("Wix plans", "https://www.wix.com/plans"),
            " (US prices as listed by ",
            rt.link(
              "Website Builder Expert, September 2026",
              "https://www.websitebuilderexpert.com/website-builders/wix-pricing/",
            ),
            "; Wix shows regional prices), ",
            rt.link("Webflow pricing", "https://webflow.com/pricing"),
            ", ",
            rt.link(
              "Squarespace: exporting your site",
              "https://support.squarespace.com/hc/en-us/articles/206566687-Exporting-your-site",
            ),
            ", ",
            rt.link(
              "Wix: exporting or embedding your site",
              "https://support.wix.com/en/article/exporting-or-embedding-your-wix-site-elsewhere",
            ),
            ", ",
            rt.link(
              "Webflow: code export",
              "https://help.webflow.com/hc/en-us/articles/33961386739347",
            ),
            ".",
          ],
          "small",
        ),
      ]),
    ],
    { width: "wide" },
    { theme: "light", anchor: "lockin", label: "Lock-in", padding: { d: "lg", m: "md" } },
  );
}

function claude() {
  return section(
    [
      heading("Work on your site with Claude", {
        sub: "Claude doesn't write HTML for you to maintain. It edits your site through the same typed operations as Studio, checks its work and keeps it reversible.",
        col: 0,
      }),
      block(
        "icon-list",
        {
          items: [
            {
              icon: "shield-check",
              title: "Validated edits only",
              text: "Every change is a typed operation. An invalid edit is refused with the reason, and nothing changes.",
            },
            {
              icon: "clock",
              title: "Undo everything",
              text: "A snapshot is taken before Claude's first edit, and edits land in a draft until you publish.",
            },
            {
              icon: "target",
              title: "Design check and screenshots",
              text: "Claude checks contrast, headings and layout, applies one-click fixes and looks at the page at 1440, 834 and 390 px.",
            },
            {
              icon: "users",
              title: "Your Claude, your account",
              text: "OpenSpace never runs or meters an AI model. Claude uses your own Claude plan.",
            },
          ],
          columns: "1",
        },
        { variant: "list", col: 0 },
      ),
      text(
        [
          rt.p([
            rt.bold("Claude Code: "),
            code(PLUGIN),
            ", then ",
            code("/plugin install openspace"),
          ]),
          rt.p([rt.bold("A site in Studio: "), code(MCP_ADD)]),
        ],
        { col: 0 },
      ),
      demo("claude", "Demo: three example prompts and the tool calls Claude makes", 540, 1),
    ],
    { cols: [5, 7], t: [12], align: "center", gap: "2xl", width: "wide" },
    { theme: "dark", anchor: "claude", label: "Claude" },
  );
}

function features() {
  const item = (icon: string, title: string, t: string) => ({ icon, title, text: t });
  return section(
    [
      heading("Everything a website needs", {
        sub: "Squarespace-class features, built as open source. The store, member areas and password pages need your site on your own Cloudflare account, and selling needs a Stripe account.",
      }),
      block(
        "icon-list",
        {
          items: [
            item(
              "palette",
              "Visual editor",
              "Click to edit, drag and resize on a 24-column grid, layer blocks, and arrange the phone layout separately.",
            ),
            item(
              "sparkles",
              "Templates and sections",
              "Twenty templates in three looks, and 277 designed section presets that take on your site's style.",
            ),
            item(
              "brush",
              "Site Styles",
              "Palettes, 33 font pairings, buttons, spacing and corners. A contrast solver keeps every color pair readable.",
            ),
            item(
              "check",
              "Design check",
              "Finds weak contrast, skipped headings, missing alt text and crowded layouts, with one-click fixes.",
            ),
            item(
              "users",
              "Collaboration",
              "Edit together in real time. Invite owners, designers, editors and contributors, and lock sections.",
            ),
            item(
              "phone",
              "Edit from your phone",
              "Change words and photos, add sections and publish from Studio on a phone.",
            ),
            item(
              "clock",
              "History and scheduling",
              "Roll back to any published version, and schedule a publish or a blog post for later.",
            ),
            item(
              "mail",
              "Forms and inbox",
              "Contact and sign-up forms with spam protection, email notifications and CSV export.",
            ),
            item(
              "message-circle",
              "Newsletter and campaigns",
              "Double opt-in sign-ups, then email campaigns built from your site's own blocks.",
            ),
            item(
              "target",
              "Private analytics",
              "Visits and sources without cookies or tracking. Counts are aggregated and anonymous.",
            ),
            item(
              "shopping-bag",
              "Store and donations",
              "Products, variants, inventory, shipping and donations through Stripe Checkout. Cloudflare only.",
            ),
            item(
              "lock",
              "Members and passwords",
              "Members-only areas with free or paid tiers, and password pages. Cloudflare only.",
            ),
            item(
              "globe",
              "Your own domain",
              "A wizard finds your registrar, shows the exact DNS records and checks them until HTTPS is on.",
            ),
            item(
              "book-open",
              "Blog, events and more",
              "Posts with RSS, events with calendar files, portfolios and podcast feeds.",
            ),
            item(
              "rocket",
              "Fast and findable",
              "Static pages with sitemaps, structured data and share images. Templates score 99 to 100 on Lighthouse.",
            ),
            item(
              "accessibility",
              "Accessible by default",
              "Every template's home page passes automated WCAG checks in every look, with no serious issues.",
            ),
          ],
          columns: "4",
        },
        { variant: "tiles" },
      ),
    ],
    { width: "wide" },
    { theme: "light-accent", anchor: "features", label: "Features" },
  );
}

/** Showcase order: a spread of subjects and moods. */
const SHOWCASE = [
  "meadow",
  "signal",
  "hearth",
  "atelier",
  "harbor",
  "encore",
  "kiln",
  "ledger",
  "commons",
  "field-notes",
  "vow",
  "link",
];

function showcase() {
  return section(
    [
      heading("Twenty templates, three looks each", {
        sub: "Each one arrives finished, with real-feeling pages and a type pairing chosen for its subject. Switch looks any time without touching your content.",
      }),
      block(
        "gallery",
        {
          images: SHOWCASE.map((id) => {
            const s = spec(id);
            return {
              image: rendered(id),
              caption: `${s.name}, for ${lowerFirst(s.persona)}`,
              link: page(P.templates),
            };
          }),
          aspect: "16:9",
          lightbox: false,
          showCaptions: true,
        },
        { variant: "carousel" },
      ),
      button("Browse all twelve", page(P.templates), {
        role: "secondary",
        second: ["Start free", START],
      }),
    ],
    { width: "wide" },
    { theme: "light", anchor: "templates", label: "Templates" },
  );
}

function ownership() {
  return section(
    [
      heading("If OpenSpace disappeared tomorrow, your site would keep working", {
        sub: "That's the test we design for. Nothing about your site lives only with us.",
        col: 0,
      }),
      block(
        "icon-list",
        {
          items: [
            {
              icon: "home",
              title: "Files in your own GitHub account",
              text: "Plain JSON content, your media and an Astro site kit, under your name.",
            },
            {
              icon: "globe",
              title: "Hosted by GitHub Pages or your Cloudflare",
              text: "Your accounts, your free plans. Nobody can switch your site off for not paying.",
            },
            {
              icon: "wrench",
              title: "Built by standard tools",
              text: "Any Node setup can build it, with or without Studio or the Hub.",
            },
            {
              icon: "heart-handshake",
              title: "Open source, top to bottom",
              text: "MIT for templates and packages, AGPL for Studio and the Hub, CC BY for docs and designs. Anyone can run their own Hub.",
            },
          ],
          columns: "2",
        },
        { variant: "list", col: 1 },
      ),
      button("Read the source", REPO, {
        col: 1,
        role: "secondary",
        second: ["How it's built", url(doc("architecture.md"))],
      }),
    ],
    { cols: [5, 7], gap: "2xl", width: "wide" },
    { theme: "dark-accent", anchor: "own", label: "Ownership" },
  );
}

function faq() {
  const qa = (question: string, ...answer: string[]) => ({ question, answer: body(...answer) });
  return section(
    [
      heading("Straight answers", { col: 0 }),
      text([rt.p("Something else? Ask on GitHub, where the whole project happens in the open.")], {
        col: 0,
      }),
      button("Open an issue", url(`${GITHUB}/issues`), { col: 0, role: "secondary" }),
      block(
        "accordion",
        {
          items: [
            qa(
              "Is it ready?",
              "Not quite: OpenSpace is pre-release. Studio, the templates, the CLI and the Claude plugin work today. The connections to GitHub, Cloudflare, Stripe and email providers are built and tested against stand-ins, and some haven't yet run against the live services, so treat a business-critical site as an early adopter would.",
            ),
            qa(
              "Is it really free?",
              "Hosting is, because your site runs on GitHub Pages or your own Cloudflare account. The shared Hub, which handles forms, newsletters and analytics, is free with fair-use limits, such as 1,000 form entries a month per site. Anyone can run their own Hub.",
            ),
            qa(
              "Do I need to know code or GitHub?",
              "No. You need a free GitHub account, and Studio walks you through making one. After that you edit visually; words like repository and commit stay in Settings, under Advanced.",
            ),
            qa(
              "What does Claude cost?",
              "Nothing extra from OpenSpace. Claude works on your site with your own Claude account. OpenSpace never runs an AI model, so it has nothing to meter.",
            ),
            qa(
              "Can I sell things or run a members area?",
              "Yes, with your site on your own Cloudflare account and payments through your own Stripe account. OpenSpace takes no cut; Stripe charges its usual card fees.",
            ),
            qa(
              "Can I use my own domain?",
              "Yes. Buy one from any registrar, and the domain wizard shows the exact records to add and checks them until HTTPS is on.",
            ),
            qa(
              "Can I leave?",
              "Any time, and you take it all. Your site is already a repository in your account that standard tools build, and your form entries, subscribers and orders export as CSV.",
            ),
          ],
          exclusive: false,
          openFirst: true,
          faqSchema: true,
        },
        { variant: "lines", col: 1 },
      ),
    ],
    { cols: [4, 8], gap: "2xl", width: "wide" },
    { theme: "light", anchor: "faq", label: "Questions" },
  );
}

function finalCta() {
  return section(
    [
      heading("Make a website you'll never have to rent", {
        size: "display",
        sub: "Pick a template and publish today. It's free, and it's yours.",
      }),
      button("Start free", START, { size: "large", second: ["See it on GitHub", REPO] }),
    ],
    { width: "wide" },
    { theme: "brand", anchor: "start", label: "Start", padding: { d: "2xl", m: "xl" } },
  );
}

function home() {
  return makePage(
    P.home,
    "Home",
    "",
    "OpenSpace is an open-source website builder: designer templates, a visual editor and Claude, on a site you own and host free on GitHub Pages.",
    [
      hero(),
      numbers(),
      how(),
      cost(),
      lockin(),
      claude(),
      features(),
      showcase(),
      ownership(),
      faq(),
      finalCta(),
    ],
    { seoTitle: "A professional website you own, free to host" },
  );
}

// --- other pages ----------------------------------------------------------------------------------

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
        theme: "brand",
        edit: {
          heading: {
            eyebrow: "Template gallery",
            text: "Twenty templates, three looks each",
            subheading:
              "Every template arrives finished: real-feeling pages, photography and a type pairing chosen for its purpose. Switch looks any time without touching your content.",
          },
          button: {
            label: "Start free",
            link: START,
            secondaryLabel: "How looks work",
            secondaryLink: url(doc("templates.md")),
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
            link: url(`${GITHUB}/tree/main/apps/docs/src/content/docs/contributing`),
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
    "OpenSpace is free by architecture: your site runs on free accounts you own, and you bring your own AI. No plans and no transaction fees.",
    [
      fromPreset("hero/centered@1", {
        theme: "brand",
        edit: {
          heading: {
            eyebrow: "Pricing",
            text: "Free, forever — by architecture",
            subheading:
              "There's no plan to upgrade to. Hosting, builds and storage run on free accounts you own, so one more site costs the project almost nothing.",
          },
          button: {
            label: "Start free",
            link: START,
            secondaryLabel: "Compare the cost",
            secondaryLink: page(P.home, "cost"),
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
              { icon: "check", title: "All twenty templates and every section preset" },
              { icon: "check", title: "Forms, newsletter, campaigns and analytics" },
              { icon: "check", title: "Blog, events, portfolio and podcast" },
              { icon: "check", title: "Store and members on your own Cloudflare" },
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
                buttonLabel: "Start free",
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
                text: "GitHub Pages serves content sites free; stores use your own Cloudflare account.",
              },
              {
                icon: "rocket",
                title: "Publishing",
                text: "GitHub Actions builds public sites free, in about a minute.",
              },
              {
                icon: "message-circle",
                title: "AI",
                text: "You bring your own Claude, so there is no metered model to pay for.",
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
                  "Fair-use limits on the public Hub keep it free, such as 1,000 form entries a month and 5,000 subscribers per site. Self-hosted Hubs set their own.",
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
            label: "Start free",
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
        theme: "brand",
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
            link: REPO,
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
                "The result is a website builder that costs the project almost nothing per site, which is what makes free a property of the design rather than a promotion.",
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
            label: "Start free",
            link: START,
            secondaryLabel: "Star on GitHub",
            secondaryLink: REPO,
          },
        },
      }),
    ],
  );
}

// --- the site -----------------------------------------------------------------------------------

const CUSTOM_CSS = readFileSync(new URL("./custom.css", import.meta.url), "utf8").trim();

const cobalt = {
  palette: {
    brand: "oklch(0.47 0.23 268)",
    neutral: "cool",
    contrast: "standard",
    source: "brand",
  },
  pairing: "unbounded-figtree",
  density: "comfortable",
  shape: "soft",
  buttons: "pill-solid",
  motion: "subtle",
  imageTreatment: "rounded",
} as const;

export const wwwSpec: TemplateSpec = {
  id: "openspace-www",
  name: "OpenSpace",
  description: "The OpenSpace marketing site and template gallery.",
  persona: "Open-source project",
  mood: "Open, exact, confident",
  tags: ["marketing", "open-source"],
  sample: { name: "OpenSpace", tagline: "A professional website that's yours to keep." },
  thumbnail: P.home,
  looks: [
    {
      id: "cobalt",
      name: "Cobalt",
      description: "A cobalt field on cool paper, with wide Unbounded headings and Figtree.",
      choices: { ...cobalt, palette: { ...cobalt.palette } },
    },
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
      features: { forms: false, newsletter: false, analytics: false },
      site: {
        title: "OpenSpace",
        tagline: "A professional website that's yours to keep.",
        favicon: FAVICON,
        nav: [
          { type: "page", page: P.templates, label: "Templates" },
          { type: "page", page: P.pricing, label: "Pricing" },
          { type: "page", page: P.about, label: "About" },
          { type: "link", label: "Docs", href: DOCS },
          { type: "link", label: "GitHub", href: GITHUB },
          { type: "button", label: "Start free", link: START, style: "primary" },
        ],
        header: headerFrom("header/classic@1", { sticky: true }),
        footer: fromPreset("footer/columns@1", {
          theme: "dark",
          edit: {
            "text:1": {
              content: rt.doc(
                rt.p("OpenSpace", "lead"),
                rt.p(
                  "A professional website you own, free to host. Built in the open, and in pre-release.",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Product", [
                  ["Templates", href("templates")],
                  ["Pricing", href("pricing")],
                  ["Studio", `${STUDIO}/`],
                  ["Claude Code plugin", `${GITHUB}/tree/main/plugin`],
                ]),
              ),
            },
            "text:3": {
              content: rt.doc(
                ...linkColumn("Learn", [
                  ["Documentation", DOCS],
                  ["Getting started", `${DOCS}/getting-started/`],
                  ["Connect your AI", `${DOCS}/connect-your-ai/`],
                  ["Move from Squarespace", `${DOCS}/guides/migrate-from-squarespace/`],
                  ["Templates", `${DOCS}/templates/`],
                  ["Self-hosting", `${DOCS}/self-hosting/`],
                  ["What works today", `${GITHUB}/blob/main/docs/PARITY.md`],
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
          description:
            "An open-source website builder: designer templates, a visual editor and Claude, on a site you own and host free.",
          image: OG.path,
        },
        locale: "en-US",
        integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
        customCss: CUSTOM_CSS,
      },
      pages: [home(), templates(), pricing(), about()],
    };
  },
};

export interface BuiltWww {
  doc: SiteDocument;
  licenses: Licenses;
}

/** The complete site document for openspace.host. */
export function buildWww(bytes: (path: string) => number): BuiltWww {
  const { doc, licenses } = buildTemplate(wwwSpec);
  doc.config = {
    ...doc.config,
    template: { id: "openspace-www", version: "2.0.0" },
    hub: HUB,
    deploy: { target: "github-pages", url: SITE_URL, customDomain: "openspace.host" },
  };
  doc.media = templateMedia(bytes);
  licenses.$comment =
    "Licenses for the media on openspace.host. Template screenshots and renders are OpenSpace template designs (CC BY 4.0).";
  return { doc, licenses };
}
