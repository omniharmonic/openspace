/**
 * Which platform built a site, from what its home page says about itself: the generator meta tag,
 * asset hosts, platform-specific markup and response headers. Used by `openspace import <url>` to
 * route to a specialised importer (Squarespace, WordPress) or the generic HTML importer, and by the
 * report to describe what each platform keeps behind (commerce, apps, plugins).
 */
import type { Platform } from "./types";

export interface PlatformInfo {
  id: Platform;
  label: string;
  /** The specialised importer, when there is one (otherwise the generic `url` importer). */
  importer: "squarespace" | "wordpress" | "github" | "url";
  /** What the importer can't move from this platform (the report's "Not moved" list). */
  notMoved: string[];
}

const COMMON_NOT_MOVED = [
  "Form submissions, newsletter subscribers, member accounts and comments.",
  "Analytics and SEO history (search engines follow the redirects).",
];

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  squarespace: {
    id: "squarespace",
    label: "Squarespace",
    importer: "squarespace",
    notMoved: [
      "Orders, customers, inventory, discounts, gift cards, shipping and tax settings (commerce stays in Squarespace until you switch).",
      "Newsletter subscribers, form submissions, member accounts and blog comments.",
      "Scheduling (Acuity), donations, digital-download files and anything behind a login.",
      "Squarespace analytics and SEO history (search engines follow the redirects).",
    ],
  },
  wordpress: {
    id: "wordpress",
    label: "WordPress",
    importer: "wordpress",
    notMoved: [
      "Plugins and what they do: WooCommerce orders and customers, booking, membership, LMS and form plugins (their pages are imported as content; the functionality needs an OpenSpace block or a service).",
      "Comments, users and their roles, and custom post types other than pages and posts.",
      "Shortcodes and page-builder widgets without an OpenSpace equivalent (listed above).",
      "Draft and private content unless you pass the WordPress export (WXR) with `--export`.",
      ...COMMON_NOT_MOVED,
    ],
  },
  wix: {
    id: "wix",
    label: "Wix",
    importer: "url",
    notMoved: [
      "Wix apps: Stores, Bookings, Events, Members, Forum, Pricing Plans and Velo code (pages that show them are imported as content).",
      "Animations, scroll effects and strips' video backgrounds.",
      ...COMMON_NOT_MOVED,
    ],
  },
  webflow: {
    id: "webflow",
    label: "Webflow",
    importer: "url",
    notMoved: [
      "Interactions and animations, custom code embeds, and Webflow Ecommerce and Memberships.",
      "CMS collections other than blog-like posts are imported as pages (one per item).",
      ...COMMON_NOT_MOVED,
    ],
  },
  framer: {
    id: "framer",
    label: "Framer",
    importer: "url",
    notMoved: [
      "Animations, effects and code components (their text and images are imported where present in the HTML).",
      ...COMMON_NOT_MOVED,
    ],
  },
  carrd: {
    id: "carrd",
    label: "Carrd",
    importer: "url",
    notMoved: ["Carrd widgets and embeds (payments, forms' integrations).", ...COMMON_NOT_MOVED],
  },
  shopify: {
    id: "shopify",
    label: "Shopify",
    importer: "url",
    notMoved: [
      "Products, orders, customers and checkout (only the content pages and blog are imported).",
      ...COMMON_NOT_MOVED,
    ],
  },
  ghost: {
    id: "ghost",
    label: "Ghost",
    importer: "url",
    notMoved: ["Members, paid subscriptions and newsletters.", ...COMMON_NOT_MOVED],
  },
  weebly: {
    id: "weebly",
    label: "Weebly / Square Online",
    importer: "url",
    notMoved: ["Store, orders and apps.", ...COMMON_NOT_MOVED],
  },
  godaddy: {
    id: "godaddy",
    label: "GoDaddy Website Builder",
    importer: "url",
    notMoved: ["Online store, appointments and marketing tools.", ...COMMON_NOT_MOVED],
  },
  jimdo: {
    id: "jimdo",
    label: "Jimdo",
    importer: "url",
    notMoved: ["Store and apps.", ...COMMON_NOT_MOVED],
  },
  hostinger: {
    id: "hostinger",
    label: "Hostinger Website Builder",
    importer: "url",
    notMoved: ["Store, bookings and apps.", ...COMMON_NOT_MOVED],
  },
  jekyll: {
    id: "jekyll",
    label: "Jekyll (GitHub Pages)",
    importer: "github",
    notMoved: [
      "Jekyll plugins' build-time behaviour and theme code (what they put on your pages was imported).",
      "Comments (Disqus, giscus, utterances) and analytics settings.",
      "Files outside the site's pages, posts and the media they use.",
    ],
  },
  hugo: {
    id: "hugo",
    label: "Hugo",
    importer: "github",
    notMoved: [
      "Hugo shortcodes, taxonomies' extra pages and theme code (pages were read as they are published).",
      ...COMMON_NOT_MOVED,
    ],
  },
  eleventy: {
    id: "eleventy",
    label: "Eleventy",
    importer: "github",
    notMoved: [
      "Eleventy templates, filters and data files (pages were read as they are published).",
      ...COMMON_NOT_MOVED,
    ],
  },
  github: {
    id: "github",
    label: "GitHub Pages",
    importer: "github",
    notMoved: ["Scripts and anything built by JavaScript in the browser.", ...COMMON_NOT_MOVED],
  },
  generic: {
    id: "generic",
    label: "the original site",
    importer: "url",
    notMoved: [
      "Scripts, animations and anything rendered only by JavaScript (try `--render` for script-built pages).",
      "Server-side features: shops, logins, search, comments.",
      ...COMMON_NOT_MOVED,
    ],
  },
};

export function platformInfo(p: Platform | undefined): PlatformInfo {
  return PLATFORMS[p ?? "squarespace"];
}

/** "Squarespace", "WordPress", "the original site". */
export const platformLabel = (p: Platform | undefined) => platformInfo(p).label;

export interface Detection {
  platform: Platform;
  /** The generator meta tag, when there is one. */
  generator?: string;
  /** Why we think so (for the report and the CLI). */
  evidence: string[];
  /** WordPress: the REST API root advertised by the page (`<link rel="https://api.w.org/">`). */
  wpApi?: string;
}

const RULES: { platform: Platform; tests: [RegExp, string][] }[] = [
  {
    platform: "squarespace",
    tests: [
      [/<!-- This is Squarespace\. -->/i, "Squarespace comment"],
      [/static1\.squarespace\.com|images\.squarespace-cdn\.com/i, "Squarespace CDN"],
      [/Static\.SQUARESPACE_CONTEXT/, "Squarespace context script"],
    ],
  },
  {
    platform: "wordpress",
    tests: [
      [/\/wp-content\/(?:themes|plugins|uploads)\//i, "wp-content assets"],
      [/\/wp-includes\//i, "wp-includes assets"],
      [/rel=["']https:\/\/api\.w\.org\/["']/i, "WordPress REST API link"],
      [/class=["'][^"']*\bwp-block-/i, "block editor markup"],
    ],
  },
  {
    platform: "wix",
    tests: [
      [/static\.wixstatic\.com|static\.parastorage\.com/i, "Wix static hosts"],
      [/<meta[^>]+name=["']generator["'][^>]+Wix\.com/i, "Wix generator"],
      [/id=["']SITE_CONTAINER["']|wix-thunderbolt|wixui-/i, "Wix page markup"],
    ],
  },
  {
    platform: "webflow",
    tests: [
      [/data-wf-(?:page|site)=/i, "Webflow page attributes"],
      [
        /(?:assets|uploads-ssl|cdn\.prod)\.website-files\.com|assets-global\.website-files\.com/i,
        "Webflow asset host",
      ],
      [
        /<meta[^>]+content=["']Webflow["'][^>]*name=["']generator|name=["']generator["'][^>]+content=["']Webflow/i,
        "Webflow generator",
      ],
    ],
  },
  {
    platform: "framer",
    tests: [
      [/framerusercontent\.com|framer\.com\/m\//i, "Framer asset host"],
      [/<meta[^>]+name=["']generator["'][^>]+Framer/i, "Framer generator"],
      [/data-framer-(?:name|component-type|hydrate)/i, "Framer markup"],
    ],
  },
  {
    platform: "carrd",
    tests: [
      [/<meta[^>]+name=["']generator["'][^>]+Carrd/i, "Carrd generator"],
      [/carrd\.co\b/i, "Carrd markup"],
    ],
  },
  {
    platform: "shopify",
    tests: [
      [/cdn\.shopify\.com/i, "Shopify CDN"],
      [/Shopify\.theme|shopify-section/i, "Shopify theme markup"],
    ],
  },
  {
    platform: "ghost",
    tests: [[/<meta[^>]+name=["']generator["'][^>]+Ghost/i, "Ghost generator"]],
  },
  {
    platform: "weebly",
    tests: [[/editmysite\.com|weebly\.com\/(?:weebly|uploads)/i, "Weebly asset host"]],
  },
  {
    platform: "godaddy",
    tests: [
      [/img1\.wsimg\.com|<meta[^>]+Go Daddy Website Builder/i, "GoDaddy Website Builder assets"],
    ],
  },
  {
    platform: "jimdo",
    tests: [[/jimstatic\.com|jimdo(?:free|site)?\.com/i, "Jimdo assets"]],
  },
  {
    platform: "hostinger",
    tests: [
      [/zyrosite\.com|<meta[^>]+generator[^>]+Hostinger|zyro\.com/i, "Hostinger/Zyro assets"],
    ],
  },
];

/** The generator meta tag (`<meta name="generator" content="WordPress 6.6.2">`). */
export function generatorOf(html: string): string | undefined {
  const m =
    /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i.exec(html);
  return m?.[1]?.trim();
}

/** Detect the platform from a home page's HTML (and optionally its response headers). */
export function detectPlatform(html: string, headers: Record<string, string> = {}): Detection {
  const generator = generatorOf(html);
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const wpApi =
    /<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']https:\/\/api\.w\.org\/["']/i.exec(html)?.[1] ??
    /<([^>]+)>;\s*rel="https:\/\/api\.w\.org\/"/.exec(h.link ?? "")?.[1];
  const scores = new Map<Platform, string[]>();
  const add = (p: Platform, why: string) => scores.set(p, [...(scores.get(p) ?? []), why]);
  if (generator) {
    const g = generator.toLowerCase();
    const byGen: [string, Platform][] = [
      ["wordpress", "wordpress"],
      ["wix", "wix"],
      ["webflow", "webflow"],
      ["framer", "framer"],
      ["carrd", "carrd"],
      ["ghost", "ghost"],
      ["squarespace", "squarespace"],
      ["shopify", "shopify"],
      ["go daddy", "godaddy"],
      ["jimdo", "jimdo"],
      ["hostinger", "hostinger"],
      ["zyro", "hostinger"],
      ["weebly", "weebly"],
      ["jekyll", "jekyll"],
      ["hugo", "hugo"],
      ["eleventy", "eleventy"],
    ];
    for (const [needle, p] of byGen)
      if (g.includes(needle)) {
        add(p, `generator "${generator}"`);
        add(p, `generator "${generator}"`);
      }
  }
  if (wpApi) add("wordpress", "WordPress REST API link");
  if (h["x-wix-request-id"] || /wix/i.test(h.server ?? "")) add("wix", "Wix response headers");
  if (h["x-powered-by"]?.toLowerCase().includes("wordpress") || h["x-pingback"])
    add("wordpress", "WordPress response headers");
  if (/squarespace/i.test(h.server ?? "")) add("squarespace", "Squarespace server header");
  if (h["x-shopid"] || h["x-shopify-stage"]) add("shopify", "Shopify response headers");
  for (const rule of RULES)
    for (const [re, why] of rule.tests) if (re.test(html)) add(rule.platform, why);
  let best: Platform = "generic";
  let bestN = 0;
  for (const [p, why] of scores) {
    // Squarespace sites can embed WordPress-looking markup (and vice versa): most evidence wins.
    if (why.length > bestN) {
      best = p;
      bestN = why.length;
    }
  }
  return {
    platform: best,
    ...(generator ? { generator } : {}),
    evidence: [...new Set(scores.get(best) ?? [])],
    ...(wpApi ? { wpApi } : {}),
  };
}

/** Accept the user's spelling of a platform (`--platform wix`). */
export function parsePlatform(s: string): Platform | undefined {
  const k = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (k === "url" || k === "html" || k === "other" || k === "any") return "generic";
  return (Object.keys(PLATFORMS) as Platform[]).find((p) => p === k);
}
