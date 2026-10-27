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
/** Where people who already have a site sign in. */
export const SIGN_IN = `${STUDIO}/sites`;
export const IMPORT_CMD = "/openspace:migrate https://www.example.com";
export const IMPORT_CLI = "npx @omniharmonic/openspace-cli import <url>";
export const MIGRATE_GUIDE = `${DOCS}/guides/migrate-to-openspace/`;

/**
 * Donation links: Stripe Payment Links, one per amount (US dollars). This is the ONE place they
 * live; the home page, the Support page and the savings calculator all read from here.
 * Live Stripe Payment Links (product "Gift to OpenSpace"); monthly gifts are managed at MANAGE_GIFTS.
 */
export const DONATE = {
  oneTime: {
    10: "https://donate.stripe.com/9B6eVdcEE1JE53zeWIgMw00",
    25: "https://donate.stripe.com/bJe4gz9ss8828fL7uggMw01",
    50: "https://donate.stripe.com/9B65kDbAAdsmfId29WgMw02",
    100: "https://donate.stripe.com/7sY9AT3445ZUgMhaGsgMw03",
    250: "https://donate.stripe.com/fZu00jaww8823Zvg0MgMw04",
    custom: "https://donate.stripe.com/eVqcN55cc73Y0Nj29WgMw05",
  },
  monthly: {
    3: "https://buy.stripe.com/28EbJ1eMM9c6dA58ykgMw06",
    5: "https://buy.stripe.com/bJe28r5cc4VQeE97uggMw07",
    10: "https://buy.stripe.com/dRm3cv5cccoi7bH15SgMw08",
    20: "https://buy.stripe.com/aFadR9fQQdsm9jPg0MgMw09",
  },
} as const;
/** Stripe customer portal: donors sign in with their email to change or stop a monthly gift. */
export const MANAGE_GIFTS = "https://billing.stripe.com/p/login/9B6eVdcEE1JE53zeWIgMw00";
const REPO = url(GITHUB);
const startWith = (id: string) => url(`${STUDIO}/new/${id}`);

const PAGES = definePages("www", {
  home: "",
  templates: "templates",
  pricing: "pricing",
  about: "about",
  support: "support",
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
  const h1 = heading("Stop renting your own website", {
    level: 1,
    size: "display",
  });
  const lead = text([
    rt.p(
      "OpenSpace gives everyone what developers have always had: a website made of plain files in your own account, hosted free on GitHub Pages or Cloudflare. Start from a designer template, or let Claude bring your current site home.",
    ),
  ]);
  const cta = button("Start free", START, {
    size: "large",
    second: ["Move my site", page(P.home, "move")],
    note: "Free forever and open source. In pre-release; you need a free GitHub account.",
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
              value: "20 × 3",
              label: "templates and looks",
              detail: "Plus 277 designed sections that take on your style.",
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

function move() {
  const step = (h: string, t: string) => ({ heading: h, body: body(t) });
  return section(
    [
      heading("Bring your site home", {
        sub: "Claude moves your site from wherever it lives today to a free one you own forever. It keeps your words and pictures, and checks its work against the original, page by page.",
        col: 0,
      }),
      text(
        [
          rt.p([
            rt.bold("Squarespace, WordPress, Wix, Webflow or anywhere else. "),
            "Claude recognises where your site lives and brings it across, and for platforms without a dedicated importer it rebuilds each page from what visitors see.",
          ]),
          rt.p([rt.bold("In Claude Code, install the plugin:")]),
          rt.p([code(PLUGIN)]),
          rt.p([code("/plugin install openspace@openspace")]),
          rt.p([rt.bold("Then point it at your site:")]),
          rt.p([code(IMPORT_CMD)]),
          rt.p(["Prefer a terminal? ", code(IMPORT_CLI), " does the import on its own."], "small"),
        ],
        { col: 0 },
      ),
      button("Read the moving guide", url(MIGRATE_GUIDE), { col: 0, role: "secondary" }),
      block(
        "columns",
        {
          items: [
            step(
              "Point Claude at your address",
              "Give it the address of the site you have today. It asks first that the site is yours, and the old one stays up throughout.",
            ),
            step(
              "It brings everything across",
              "Pages, blog posts, images with their alt text, SEO titles and descriptions, and a redirect for every address that changes.",
            ),
            step(
              "It compares until they match",
              "Claude screenshots the original and the new site side by side, at desktop and phone widths, and refines each page. Then it tells you plainly what still differs.",
            ),
            step(
              "You publish, free, on GitHub Pages",
              "Your new site goes online at no cost, as files in your own GitHub account.",
            ),
            step(
              "Move your domain",
              "The domain wizard shows the exact records to change and checks them until HTTPS is on. Only then do you cancel the old plan.",
            ),
          ],
          columns: "2",
          aspect: "original",
        },
        { variant: "steps", col: 1 },
      ),
    ],
    { cols: [5, 7], t: [12], gap: "2xl", width: "wide" },
    { theme: "dark", anchor: "move", label: "Move your site" },
  );
}

function why() {
  return section(
    [
      heading("Website builders rent you your own website", {
        sub: "You pay every month, forever. The price goes up when they decide. Leave, and your design, your posts and your audience stay behind. Stop paying, and the site goes dark. You do the work; they hold the deed.",
        col: 0,
      }),
      text(
        [
          rt.p(
            "Developers have never lived this way. For years they have put sites on GitHub Pages and Cloudflare for free, as plain files they own and can move anywhere. What was missing was a way in for everyone else.",
            "lead",
          ),
          rt.p(
            "OpenSpace is that way in: a designer's tools and Claude, on top of free hosting you control. It isn't a startup's free tier waiting to become a paid one. It is open-source infrastructure, made to give a piece of the web back to the commons and keep it there.",
          ),
        ],
        { col: 1 },
      ),
      block(
        "icon-list",
        {
          items: [
            {
              icon: "heart-handshake",
              title: "Free forever, by design",
              text: "Your site runs on free accounts you own, so there is no plan to upgrade to and nothing to renew.",
            },
            {
              icon: "home",
              title: "Yours to take anywhere",
              text: "Plain files in your own GitHub account. Any standard tool can build them, with or without us.",
            },
            {
              icon: "users",
              title: "Built for the commons",
              text: "Not a funnel: no paid tier behind the free one, no ads and no data to sell. Supported by the people who use it.",
            },
          ],
          columns: "1",
        },
        { variant: "list", col: 1 },
      ),
    ],
    { cols: [6, 6], t: [12], gap: "2xl", width: "wide" },
    { theme: "light", anchor: "why", label: "Why" },
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
                "Twenty designs for practices, restaurants, nonprofits, artists, shops and more, each in three looks. Your name and tagline go in as you start.",
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
            code("/plugin install openspace@openspace"),
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
      button("Browse all twenty", page(P.templates), {
        role: "secondary",
        second: ["Start free", START],
      }),
    ],
    { width: "wide" },
    { theme: "light", anchor: "templates", label: "Templates" },
  );
}

// --- giving ------------------------------------------------------------------------------------

/** The builders' plans the savings calculator offers, from the dated PRICES. */
export const PLANS = [
  { provider: "Squarespace", plan: "Basic", monthly: PRICES.squarespaceBasic },
  { provider: "Squarespace", plan: "Core", monthly: PRICES.squarespaceCore },
  { provider: "Wix", plan: "Light", monthly: PRICES.wixLight },
  { provider: "Wix", plan: "Core", monthly: PRICES.wixCore },
  { provider: "Webflow", plan: "Basic", monthly: PRICES.webflowBasic },
  { provider: "Webflow", plan: "Ecommerce Plus", monthly: PRICES.webflowEcomPlus },
] as const;
export const PRICES_READ = "27 October 2026";

const amounts = (o: Record<string, string>) =>
  Object.keys(o)
    .filter((k) => k !== "custom")
    .map(Number)
    .sort((a, b) => a - b);
/** The donation tier closest to a tenth of what someone saves (ties go to the smaller gift). */
export function suggestGift(monthlyCost: number) {
  const nearest = (tiers: number[], v: number) =>
    tiers.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  return {
    once: nearest(amounts(DONATE.oneTime), Math.max(monthlyCost * 12 * 0.1, 1)),
    monthly: nearest(amounts(DONATE.monthly), Math.max(monthlyCost * 0.1, 1)),
  };
}
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const oneTimeUrl = (n: number) => (DONATE.oneTime as Record<number, string>)[n] ?? "";
const monthlyUrl = (n: number) => (DONATE.monthly as Record<number, string>)[n] ?? "";

/** The savings calculator: a sandboxed Code block, rendered complete for the first plan so it reads without JS. */
function savings(col?: number): Block {
  const first = PLANS[0];
  const gift = suggestGift(first.monthly);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const options = PLANS.map((x, i) =>
    x.provider === first.provider
      ? `<option value="${i}">${esc(`${x.plan}, $${x.monthly} a month`)}</option>`
      : "",
  ).join("");
  const data = JSON.stringify({ plans: PLANS, once: DONATE.oneTime, monthly: DONATE.monthly });
  const fill: Record<string, string> = {
    __PLAN_OPTIONS__: options,
    __DATE__: PRICES_READ,
    __SAVE_YEAR__: usd(first.monthly * 12),
    __SAVE_3Y__: usd(first.monthly * 36),
    __ONCE_URL__: esc(oneTimeUrl(gift.once)),
    __ONCE_AMT__: `$${gift.once}`,
    __MONTH_URL__: esc(monthlyUrl(gift.monthly)),
    __MONTH_AMT__: `$${gift.monthly}`,
    __CUSTOM_URL__: esc(DONATE.oneTime.custom),
    __DATA__: data.replace(/</g, "\\u003c"),
  };
  const html = demoFile("savings").replace(/__[A-Z0-9_]+__/g, (k) => {
    const v = fill[k];
    if (v === undefined) throw new Error(`savings.html: no value for ${k}`);
    return v;
  });
  return block(
    "embed",
    {
      embed: { type: "code", code: html },
      title: "Savings calculator: what you keep by leaving a website builder, and a suggested gift",
      aspect: "auto",
      height: 460,
    },
    { variant: "plain", ...(col !== undefined ? { col } : {}) },
  );
}

/** Every way to give, as plain links: the calculator's no-JavaScript fallback, and a list for everyone. */
function giveLinks(o: { col?: number; title?: boolean } = {}) {
  const join = (links: ReturnType<typeof rt.link>[], last: string) => {
    const out: (string | ReturnType<typeof rt.link>)[] = [];
    links.forEach((l, i) => {
      if (i > 0) out.push(i === links.length - 1 ? last : ", ");
      out.push(l);
    });
    return out;
  };
  const once = amounts(DONATE.oneTime).map((n) => rt.link(`$${n}`, oneTimeUrl(n)));
  const monthly = amounts(DONATE.monthly).map((n) => rt.link(`$${n}`, monthlyUrl(n)));
  return text(
    [
      rt.p([
        rt.bold("Give once: "),
        ...join(once, ", "),
        ", or ",
        rt.link("an amount you choose", DONATE.oneTime.custom),
        ".",
      ]),
      rt.p([rt.bold("Give every month: "), ...join(monthly, " or "), " a month."]),
    ],
    o.col !== undefined ? { col: o.col } : {},
  );
}

function support() {
  return section(
    [
      heading("Free forever, kept going by the people who use it", {
        sub: "OpenSpace will never charge for your site. If leaving a builder saves you money, consider giving a little of it back: it keeps the shared Hub running and pays for the work that makes OpenSpace better.",
        col: 0,
      }),
      giveLinks({ col: 0 }),
      button("Support the commons", page(P.support), {
        col: 0,
        role: "secondary",
      }),
      savings(1),
    ],
    { cols: [5, 7], t: [12], align: "center", gap: "2xl", width: "wide" },
    { theme: "light-accent", anchor: "support", label: "Support" },
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
              "Can I move my existing site?",
              "Yes. Squarespace sites import automatically: pages, blog posts, images, SEO details and redirects. Claude then compares the old and new pages side by side until they match. Importers for more platforms are coming; meanwhile Claude can rebuild a site from WordPress, Wix, Webflow or anywhere else from its public pages.",
            ),
            qa(
              "Who pays for it?",
              "Hosting costs nothing because it runs on your own free accounts. The shared Hub and ongoing development are supported by voluntary gifts and grants. OpenSpace stays free whether or not you give.",
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
        sub: "Pick a template, or bring the site you have. It's free, and it's yours.",
      }),
      button("Start free", START, {
        size: "large",
        second: ["Move my site", page(P.home, "move")],
      }),
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
    "Stop renting your own website. OpenSpace is a free, open-source website builder: designer templates, a visual editor and Claude, on a site you own and host free on GitHub Pages.",
    [
      hero(),
      numbers(),
      move(),
      why(),
      cost(),
      lockin(),
      how(),
      claude(),
      features(),
      showcase(),
      ownership(),
      support(),
      faq(),
      finalCta(),
    ],
    { seoTitle: "Stop renting your own website, host it free" },
  );
}

// --- other pages ----------------------------------------------------------------------------------

/** The six MVP templates first, then the six that followed (doc 04 §7). */
const FIRST = ["meadow", "harbor", "atelier", "ledger", "hearth"];
const SECOND = ["signal", "orbit", "beacon", "fixwell", "keystone"];
const THIRD = ["field-notes", "encore", "kiln", "commons", "vow"];
const FOURTH = ["link", "darkroom", "gather", "inkwell", "folio"];

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
    "Twenty OpenSpace templates for practices, nonprofits, artists, restaurants, shops, products and more, each with three looks. Free to use and change.",
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
      gallery(FIRST, "light", "Practices, studios and local businesses", "Start here", "first"),
      gallery(SECOND, "light-accent", "Products, causes and professionals", "Grow", "grow"),
      gallery(THIRD, "light", "Writers, venues, makers and communities", "Create", "create"),
      gallery(FOURTH, "light-accent", "Portfolios, events and personal sites", "Show", "show"),
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
                  "A small stewarding group, funded by voluntary gifts and grants. Anyone can also run their own Hub, and anyone can chip in on the Support page.",
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

function supportPage() {
  const sum = (n: number) => usd(n * 12);
  return makePage(
    P.support,
    "Support the commons",
    "support",
    "OpenSpace is free forever. Work out what you save by leaving a website builder, and give a little back to keep the shared Hub and development going.",
    [
      fromPreset("hero/centered@1", {
        theme: "brand",
        edit: {
          heading: {
            eyebrow: "Support the commons",
            text: "Keep a piece of the web free",
            subheading:
              "OpenSpace costs nothing and always will, whether or not you give. Gifts keep the shared Hub running for every site and pay for the work that makes OpenSpace better.",
          },
          button: {
            label: "Give once",
            link: url(DONATE.oneTime.custom),
            secondaryLabel: "Work out what you save",
            secondaryLink: page(P.support, "calculator"),
          },
        },
      }),
      section(
        [
          heading("What leaving saves you", {
            sub: `Pick where your site lives today. Squarespace Basic alone is ${sum(PRICES.squarespaceBasic)} a year; on OpenSpace, hosting is $0. If OpenSpace is worth a tenth of the difference to you, the calculator suggests a gift to match.`,
            col: 0,
          }),
          giveLinks({ col: 0 }),
          text(
            [
              rt.p(
                [
                  "Prices are each builder's published annual price, read on ",
                  PRICES_READ,
                  ". ",
                  rt.link("Sources and the full comparison", href("home", "lockin")),
                  ".",
                ],
                "small",
              ),
            ],
            { col: 0 },
          ),
          savings(1),
        ],
        { cols: [5, 7], t: [12], align: "center", gap: "2xl", width: "wide" },
        { theme: "light", anchor: "calculator", label: "Calculator" },
      ),
      fromPreset("features/icon-row@1", {
        theme: "light-accent",
        edit: {
          heading: {
            eyebrow: "Where gifts go",
            text: "Into the commons, not a funnel",
            subheading:
              "There's no paid tier to grow into, so every gift goes to keeping OpenSpace free and good for everyone.",
          },
          "icon-list": {
            items: [
              {
                icon: "globe",
                title: "The shared Hub",
                text: "Forms, newsletters, private analytics and sign-in for every site that uses it.",
              },
              {
                icon: "wrench",
                title: "Development",
                text: "Studio, the templates, importers for more platforms, and fixes.",
              },
              {
                icon: "accessibility",
                title: "Quality",
                text: "Accessibility and performance testing on every template and look.",
              },
              {
                icon: "book-open",
                title: "Help",
                text: "Documentation and guides for people moving their sites home.",
              },
            ],
          },
        },
      }),
      fromPreset("faq/centered@1", {
        theme: "light",
        edit: {
          heading: { eyebrow: "Before you give", text: "Plain answers about gifts" },
          accordion: {
            items: [
              {
                question: "Do I have to give to use OpenSpace?",
                answer: body(
                  "No. Every feature is free for everyone, forever, and giving changes nothing about your site or what you can do with it.",
                ),
              },
              {
                question: "Who receives the money?",
                answer: body(
                  "The small stewarding group that runs the shared Hub and develops OpenSpace. Gifts pay for the Hub's running costs and for development.",
                ),
              },
              {
                question: "Is my gift tax-deductible?",
                answer: body("No. Gifts aren't tax-deductible unless this page says otherwise."),
              },
              {
                question: "How do I change or stop a monthly gift?",
                answer: rt.doc(
                  rt.p([
                    "Any time, in two clicks: ",
                    rt.link("manage your gift", MANAGE_GIFTS),
                    " signs you in with the email you gave at checkout, then cancel or update your card. Cancelling takes effect right away.",
                  ]),
                ),
              },
              {
                question: "How are payments handled?",
                answer: body(
                  "By Stripe, on Stripe's own checkout page. OpenSpace never sees your card details.",
                ),
              },
              {
                question: "Can I help without money?",
                answer: body(
                  "Yes: design a template, improve the docs, report a bug, or move a friend's site home. Contributions of every kind are welcome on GitHub.",
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
            text: "The best support is a site you own",
            subheading: "Start from a template, or bring the site you have.",
          },
          button: {
            label: "Start free",
            link: START,
            secondaryLabel: "Move my site",
            secondaryLink: page(P.home, "move"),
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
  sample: { name: "OpenSpace", tagline: "Stop renting your own website." },
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
        tagline: "Stop renting your own website.",
        favicon: FAVICON,
        nav: [
          { type: "page", page: P.templates, label: "Templates" },
          { type: "page", page: P.pricing, label: "Pricing" },
          { type: "page", page: P.about, label: "About" },
          { type: "page", page: P.support, label: "Support" },
          { type: "link", label: "Docs", href: DOCS },
          { type: "link", label: "GitHub", href: GITHUB },
          { type: "button", label: "Sign in", link: url(SIGN_IN), style: "tertiary" },
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
                  "A website you own, free to host forever. Built in the open for the commons, and in pre-release.",
                ),
              ),
            },
            "social-links": { profiles: [] },
            "text:2": {
              content: rt.doc(
                ...linkColumn("Product", [
                  ["Templates", href("templates")],
                  ["Pricing", href("pricing")],
                  ["Sign in to Studio", SIGN_IN],
                  ["Move your site", href("home", "move")],
                  ["Support the commons", href("support")],
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
                  ["Move your site", `${DOCS}/guides/migrate-to-openspace/`],
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
      pages: [home(), templates(), pricing(), about(), supportPage()],
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
