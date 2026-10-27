/**
 * End-to-end: assemble the Meadow fixture site with the starter shell and run a real
 * `astro build`, then check every output the publish pipeline promises.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { BEHAVIORS, type ResolvedImage } from "@omniharmonic/openspace-renderer";
import { FormSchema } from "@omniharmonic/openspace-schema";
import {
  deployLocation,
  imageWidths,
  loadSiteDocument,
  pageImageSrcs,
  planSite,
  renderRoute,
  type SitePlan,
} from "@omniharmonic/openspace-site-kit";
import { beforeAll, describe, expect, it } from "vitest";
import { MEADOW_DIR } from "./meadow-site";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..");
const STARTER = join(FIXTURES, "..", "..", "templates", "starter", "site");
const BUILD_TIME = "2026-10-27T12:00:00Z";

async function assemble(
  name: string,
  edit?: (config: Record<string, unknown>) => void,
  variant?: string,
): Promise<string> {
  const root = join(FIXTURES, ".build", name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const entry of ["openspace.json", "content", "media"])
    await cp(join(MEADOW_DIR, entry), join(root, entry), { recursive: true });
  await cp(join(STARTER, "astro.config.mjs"), join(root, "astro.config.mjs"));
  await cp(join(STARTER, "src"), join(root, "src"), { recursive: true });
  if (variant) {
    const dir = join(STARTER, "..", "variants", variant);
    for (const f of ["astro.config.mjs", "wrangler.jsonc"]) await cp(join(dir, f), join(root, f));
  }
  if (edit) {
    const cfgPath = join(root, "openspace.json");
    const cfg = JSON.parse(await readFile(cfgPath, "utf8")) as Record<string, unknown>;
    edit(cfg);
    await writeFile(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
  }
  return root;
}

async function astroBuild(root: string): Promise<string> {
  const out = join(root, "dist");
  await run(process.execPath, [join(FIXTURES, "scripts", "build-site.mjs"), root, out], {
    // Hermetic: no Google Fonts download during tests (pages link the stylesheet instead).
    env: {
      ...process.env,
      OPENSPACE_BUILD_TIME: BUILD_TIME,
      ASTRO_TELEMETRY_DISABLED: "1",
      OPENSPACE_GOOGLE_FONTS: "link",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  return out;
}

async function files(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(abs, base)));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out.sort();
}

const read = (dir: string, rel: string) => readFile(join(dir, rel), "utf8");
const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Image URLs are content-hashed by Astro; replace them with a token for comparison. */
const normalizeImages = (html: string) =>
  html.replace(/(?:\/[a-z-]+)?\/_astro\/[A-Za-z0-9._-]+/g, "IMG");

/** An image map with the same structure site-kit builds from `getImage()`, URLs tokenised. */
function tokenImageMap(plan: SitePlan, srcs: Set<string>): Record<string, ResolvedImage> {
  const map: Record<string, ResolvedImage> = {};
  for (const [path, meta] of Object.entries(plan.doc.media)) {
    if (!srcs.has(path) || meta.kind !== "image" || !meta.width || !meta.height) continue;
    const srcset = imageWidths(meta.width)
      .map((w) => `/_astro/IMG ${w}w`)
      .join(", ");
    map[path] = {
      src: "/_astro/IMG",
      srcset,
      sources: [
        { type: "image/avif", srcset },
        { type: "image/webp", srcset },
      ],
      width: meta.width,
      height: meta.height,
      ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
    };
  }
  return map;
}

const htmlFile = (path: string) =>
  path === "/404.html" ? "404.html" : `${path.slice(1)}index.html`;

describe("astro build of the Meadow fixture (custom domain, base /)", () => {
  let out = "";
  let all: string[] = [];
  let plan: SitePlan;

  beforeAll(async () => {
    const root = await assemble("meadow");
    out = await astroBuild(root);
    all = await files(out);
    plan = planSite(await loadSiteDocument(root), { now: new Date(BUILD_TIME) });
  }, 240_000);

  it("emits every planned page", async () => {
    expect(plan.routes.length).toBeGreaterThan(15);
    for (const r of plan.routes) expect(all, r.path).toContain(htmlFile(r.path));
    expect(all).toContain("index.html");
    expect(all).toContain("journal/2026-10-26-opening-day/index.html");
    expect(all).toContain("events/autumn-retreat/index.html");
    expect(all).toContain("shop/linen-bolster/index.html");
    expect(all).toContain("podcast/slow-mornings-01/index.html");
    expect(all).toContain("journal/category/news/index.html");
    expect(all).toContain("journal/tag/boulder/index.html");
    // Drafts and not-yet-due scheduled posts are never published.
    expect(all.some((f) => f.includes("draft-retreat-notes"))).toBe(false);
    expect(all.some((f) => f.includes("winter-schedule"))).toBe(false);
  });

  it("renders page HTML identical to renderPageHtml (modulo image URLs)", async () => {
    const location = deployLocation(plan.doc.config);
    const runtimeAssets = (html: string) => ({
      site: /href="([^"]*\/_os\/site\.[a-f0-9]+\.css)"/.exec(html)?.[1] ?? "",
    });
    for (const route of plan.routes) {
      const page = plan.doc.pages[route.pageId as keyof typeof plan.doc.pages];
      const imageMap = tokenImageMap(plan, page ? pageImageSrcs(plan.doc, page) : new Set());
      const built = await read(out, htmlFile(route.path));
      const expected = renderRoute({
        plan,
        route,
        location,
        imageMap,
        assets: runtimeAssets(built),
      });
      expect(normalizeImages(built), route.path).toBe(normalizeImages(expected));
    }
  });

  it("serves local images as AVIF + WebP + fallback with dimensions", async () => {
    const home = await read(out, "index.html");
    expect(home).toMatch(
      /<source type="image\/avif" srcSet="\/_astro\/morning-light\.[^"]+ 480w, [^"]+ 960w/,
    );
    expect(home).toMatch(/<source type="image\/webp"/);
    expect(home).toMatch(
      /src="\/_astro\/morning-light\.[^"]+\.jpg"[^>]*width="2400" height="1600"/,
    );
    expect(all.some((f) => /^_astro\/morning-light\..+\.avif$/.test(f))).toBe(true);
    // No local raster image is served unoptimised (the summary block's cards included).
    for (const f of all.filter((x) => x.endsWith(".html")))
      expect(await read(out, f), f).not.toMatch(/src="\/media\/[^"]+\.(?:jpe?g|png)"/);
    // Every <img> has width and height (no layout shift).
    for (const f of all.filter((x) => x.endsWith(".html"))) {
      for (const tag of (await read(out, f)).match(/<img [^>]*>/g) ?? []) {
        expect(tag, f).toMatch(/width="\d+"/);
        expect(tag, f).toMatch(/height="\d+"/);
      }
    }
  });

  it("ships zero React runtime and only the behaviors pages use", async () => {
    const js = all.filter((f) => f.endsWith(".js") && !f.startsWith("pagefind/"));
    for (const f of js) expect(f).toMatch(/^_os\/(behaviors\/[a-z-]+|turnstile)\.js$/);
    for (const f of js) {
      const code = await read(out, f);
      expect(code).not.toMatch(
        /react-dom|react\.(?:production|development)|__SECRET_INTERNALS|jsx-runtime|\$\$typeof/i,
      );
    }
    const shipped = js.filter((f) => f.startsWith("_os/behaviors/")).map((f) => f.slice(14, -3));
    expect(shipped).toContain("os-behaviors");
    expect(shipped).toEqual(
      expect.arrayContaining(["form", "newsletter", "lightbox", "accordion", "menu"]),
    );
    // Behaviors nobody uses are not published.
    for (const b of ["carousel", "popup", "tabs", "marquee", "beacon"])
      expect(shipped).not.toContain(b);
    // GitHub Pages can't run checkout: product pages say so instead of offering add-to-cart,
    // and the cart behavior isn't published (the Cloudflare build below ships it).
    expect(shipped).not.toContain("cart");
    const product = await read(out, "shop/linen-bolster/index.html");
    expect(product).not.toContain("data-os-add");
    expect(product).toMatch(/Online ordering isn(&#x27;|')t open yet\./);
    for (const f of all.filter((x) => x.endsWith(".html")))
      expect(await read(out, f), f).not.toContain("/_os/behaviors/cart.js");
    expect(
      shipped.every((b) => b === "os-behaviors" || (BEHAVIORS as readonly string[]).includes(b)),
    ).toBe(true);
    // Per page: the form behavior only where there's a form.
    const contact = await read(out, "contact/index.html");
    const about = await read(out, "about/index.html");
    expect(contact).toContain("/_os/behaviors/form.js");
    expect(about).not.toContain("/_os/behaviors/form.js");
    expect(about).toContain("/_os/behaviors/lightbox.js");
    expect(about).not.toContain("/_os/behaviors/cart.js");
    // Budgets (GC4/GC11): ≤ 3 KB gz per behavior (cart ≤ 12 KB), and every page's JS — the
    // loader plus the behaviors it preloads — under 30 KB gz.
    const gz = new Map<string, number>();
    for (const f of js.filter((x) => x.startsWith("_os/behaviors/"))) {
      const size = gzipSync(await readFile(join(out, f)), { level: 9 }).length;
      gz.set(f.slice(14, -3), size);
      expect(size, f).toBeLessThanOrEqual(f.endsWith("/cart.js") ? 12_288 : 3_072);
    }
    for (const f of all.filter((x) => x.endsWith(".html"))) {
      const html = await read(out, f);
      const used = [...html.matchAll(/\/_os\/behaviors\/([a-z-]+)\.js/g)].map(
        (m) => m[1] as string,
      );
      const total = [...new Set(used)].reduce((sum, b) => sum + (gz.get(b) ?? 0), 0);
      expect(total, f).toBeLessThan(30_000);
      if (used.length) expect(used, f).toContain("os-behaviors");
    }
  });

  it("links one content-hashed stylesheet holding tokens, base and block library CSS", async () => {
    const home = await read(out, "index.html");
    const head = home.slice(0, home.indexOf("</head>"));
    // One of the site's own (this offline build links Google Fonts; publish builds inline them).
    expect(head.match(/<link rel="stylesheet" href="\/_os\//g)).toHaveLength(1);
    const m = /href="\/_os\/site\.([a-f0-9]{10})\.css"/.exec(home);
    expect(m).not.toBeNull();
    expect(all).toContain(`_os/site.${m?.[1]}.css`);
    const css = await read(out, `_os/site.${m?.[1]}.css`);
    expect(css).toContain("@layer os.blocks");
    expect(css).toContain("@layer os.reset");
  });

  it("writes feeds: RSS, Atom, iCal and podcast RSS", async () => {
    const rss = await read(out, "journal/rss.xml");
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain("<title>Opening day at the new studio</title>");
    expect(rss).toContain(
      "<link>https://meadowyoga.example/journal/2026-10-26-opening-day/</link>",
    );
    expect(rss).toContain("<pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate>");
    expect(rss).not.toContain("winter");
    const atom = await read(out, "journal/atom.xml");
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(atom.match(/<entry>/g)).toHaveLength(2);
    const ics = await read(out, "events/calendar.ics");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261114T160000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261101");
    expect(ics).toContain("UID:autumn-retreat@meadowyoga.example");
    const pod = await read(out, "podcast/podcast.xml");
    expect(pod).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(pod).toContain(
      '<enclosure url="https://meadowyoga.example/media/podcast/slow-mornings-01.mp3"',
    );
    expect(pod).toContain("<itunes:duration>00:25:20</itunes:duration>");
    expect(pod).toContain("<itunes:episode>1</itunes:episode>");
    expect(all).toContain("media/podcast/slow-mornings-01.mp3");
    // Feed discovery links on the collection pages.
    expect(await read(out, "journal/index.html")).toContain(
      '<link rel="alternate" type="application/rss+xml"',
    );
  });

  it("writes sitemap.xml and robots.txt", async () => {
    const sitemap = await read(out, "sitemap.xml");
    expect(sitemap).toContain("<loc>https://meadowyoga.example/</loc>");
    expect(sitemap).toContain(
      "<loc>https://meadowyoga.example/journal/2026-10-26-opening-day/</loc><lastmod>2026-10-26</lastmod>",
    );
    expect(sitemap).not.toContain("contact/thanks"); // hidden + noindex
    expect(sitemap).not.toContain("404");
    expect(await read(out, "robots.txt")).toContain(
      "Sitemap: https://meadowyoga.example/sitemap.xml",
    );
  });

  it("writes static HTML redirects and a 404 page", async () => {
    const r = await read(out, "schedule/index.html");
    expect(r).toContain('<meta http-equiv="refresh" content="0; url=/classes/">');
    expect(r).toContain('<link rel="canonical" href="https://meadowyoga.example/classes/">');
    expect(all).toContain("old/blog/index.html");
    expect(all).not.toContain("_redirects"); // Cloudflare target only
    const nf = await read(out, "404.html");
    expect(nf).toContain("find that page");
    expect(nf).toContain('<meta name="robots" content="noindex">');
  });

  it("publishes the forms manifest in the Hub's shape", async () => {
    const m = JSON.parse(await read(out, "_os/forms.json")) as {
      version: number;
      hash: string;
      forms: Record<string, Record<string, unknown>>;
      pages: Record<string, string[]>;
    };
    expect(m.version).toBe(1);
    expect(m.hash).toMatch(/^[a-f0-9]{16}$/);
    const entry = m.forms.frm_c0ntactmdw;
    expect(entry?.redirectHref).toBe("/contact/thanks/");
    const { redirectHref: _r, ...form } = entry ?? {};
    expect(FormSchema.safeParse(form).success).toBe(true);
    expect(m.pages.frm_c0ntactmdw).toEqual(["/contact/"]);
  });

  it("publishes the product catalog with authoritative prices", async () => {
    const c = JSON.parse(await read(out, "_os/catalog.json")) as {
      currency: string;
      skus: Record<string, { price: { amount: number; currency: string } }>;
      products: { slug: string }[];
    };
    expect(c.currency).toBe("USD");
    expect(c.products.map((p) => p.slug)).toEqual(["class-card", "linen-bolster"]);
    expect(c.skus["MDW-BOL-01-SAGE"]?.price).toEqual({ amount: 7200, currency: "USD" });
    expect(c.skus["MDW-BOL-01-OAT"]?.price).toEqual({ amount: 6800, currency: "USD" });
    expect(c.skus["MDW-CARD-10"]?.price.amount).toBe(15000);
  });

  it("emits structured data", async () => {
    const ld = async (f: string) =>
      [
        ...(await read(out, f)).matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g),
      ].map((m) => JSON.parse(m[1] ?? "{}") as Record<string, unknown>);
    const types = async (f: string) => (await ld(f)).map((x) => x["@type"]);
    expect(await types("index.html")).toEqual(["WebSite", "LocalBusiness"]);
    expect(await types("journal/2026-10-26-opening-day/index.html")).toEqual(["BlogPosting"]);
    expect(await types("events/autumn-retreat/index.html")).toEqual(["Event"]);
    expect(await types("podcast/slow-mornings-01/index.html")).toEqual(["PodcastEpisode"]);
    const product = (await ld("shop/linen-bolster/index.html"))[0] as {
      offers: { price: string; priceCurrency: string };
    };
    expect(product.offers).toMatchObject({ price: "68.00", priceCurrency: "USD" });
    expect(await types("classes/index.html")).toContain("FAQPage"); // from the accordion block
  });

  it("generates share images for pages without their own", async () => {
    const home = await read(out, "index.html");
    const og =
      /<meta property="og:image" content="https:\/\/meadowyoga\.example\/(_os\/og\/[a-f0-9]{12}\.png)">/.exec(
        home,
      );
    expect(og).not.toBeNull();
    const png = await readFile(join(out, og?.[1] ?? ""));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    // A page with its own SEO image uses it.
    expect(await read(out, "about/index.html")).toMatch(
      /og:image" content="https:\/\/meadowyoga\.example\/_astro\/studio-open\./,
    );
  });

  it("renders Markdoc tags as blocks in posts", async () => {
    const post = await read(out, "journal/2026-10-26-opening-day/index.html");
    expect(post).toContain("os-gallery");
    expect(post).toMatch(/<a [^>]*href="\/classes\/"[^>]*>.*See the schedule/s);
    expect(post).toContain("<strong>new space</strong>");
    expect(post).toContain("Studio news");
  });

  it("builds the Pagefind index when search is on", async () => {
    expect(all).toContain("pagefind/pagefind.js");
    expect(all.some((f) => f.startsWith("pagefind/index/"))).toBe(true);
  });

  it("caches share images between builds", async () => {
    const cache = join(FIXTURES, ".build", "meadow", "node_modules", ".astro", "openspace", "og");
    expect((await readdir(cache)).length).toBeGreaterThan(5);
  });
});

describe("astro build on a GitHub project site (base /meadow-yoga)", () => {
  let out = "";
  let all: string[] = [];

  beforeAll(async () => {
    const root = await assemble("meadow-project", (cfg) => {
      (cfg.deploy as Record<string, unknown>).customDomain = null;
      (cfg.features as Record<string, unknown>).search = false;
    });
    out = await astroBuild(root);
    all = await files(out);
  }, 240_000);

  it("prefixes every URL with the base path", async () => {
    const home = await read(out, "index.html");
    expect(home).toContain('<link rel="canonical" href="https://meadow.github.io/meadow-yoga/">');
    expect(home).toContain('href="/meadow-yoga/classes/"');
    expect(home).toContain('href="/meadow-yoga/_os/site.');
    expect(home).toMatch(/srcSet="\/meadow-yoga\/_astro\/morning-light\./);
    expect(home).toContain('src="/meadow-yoga/_os/behaviors/os-behaviors.js"');
    expect(home).toContain('data-os-base="/meadow-yoga"');
    expect(home).toMatch(/og:image" content="https:\/\/meadow\.github\.io\/meadow-yoga\/_os\/og\//);
    expect(home).not.toMatch(/href="\/classes\//);
  });

  it("writes base-aware feeds, sitemap, redirects and forms", async () => {
    expect(await read(out, "sitemap.xml")).toContain(
      "<loc>https://meadow.github.io/meadow-yoga/journal/</loc>",
    );
    expect(await read(out, "robots.txt")).toContain(
      "Sitemap: https://meadow.github.io/meadow-yoga/sitemap.xml",
    );
    expect(await read(out, "journal/rss.xml")).toContain(
      "<link>https://meadow.github.io/meadow-yoga/journal/2026-10-26-opening-day/</link>",
    );
    expect(await read(out, "schedule/index.html")).toContain('url=/meadow-yoga/classes/"');
    const contact = await read(out, "contact/index.html");
    expect(contact).toContain('name="_source" value="/meadow-yoga/contact/"');
    expect(all).not.toContain("pagefind/pagefind.js");
    expect(await exists(join(out, "_os", "forms.json"))).toBe(true);
  });
});

describe("astro build on the Cloudflare target", () => {
  let root = "";
  let out = "";

  beforeAll(async () => {
    root = await assemble(
      "meadow-cloudflare",
      (cfg) => {
        (cfg.deploy as Record<string, unknown>).target = "cloudflare";
        (cfg.features as Record<string, unknown>).search = false;
      },
      "cloudflare",
    );
    out = await astroBuild(root);
  }, 240_000);

  it("prerenders pages as static assets and adds real redirects", async () => {
    const client = join(out, "client");
    expect(await exists(join(client, "index.html"))).toBe(true);
    expect(await exists(join(client, "journal/2026-10-26-opening-day/index.html"))).toBe(true);
    expect(await read(client, "_redirects")).toBe(
      "/schedule /classes/ 301\n/old/blog /journal/ 301\n",
    );
    expect(await exists(join(client, "_os/forms.json"))).toBe(true);
  });

  it("publishes the image manifest and every behavior for Worker-rendered pages", async () => {
    const client = join(out, "client");
    const manifest = JSON.parse(await read(client, "_os/images.json")) as Record<
      string,
      { src: string; width: number; height: number; sources: { type: string }[] }
    >;
    const media = Object.keys(JSON.parse(await read(MEADOW_DIR, "content/media.json"))).filter(
      (p) => /\.(?:jpe?g|png)$/.test(p),
    );
    expect(Object.keys(manifest).sort()).toEqual(media.sort());
    for (const [path, img] of Object.entries(manifest)) {
      expect(img.src, path).toMatch(/^\/_astro\//);
      expect(await exists(join(client, img.src))).toBe(true);
      expect(img.sources.map((x) => x.type)).toEqual(["image/avif", "image/webp"]);
      expect(img.width).toBeGreaterThan(0);
    }
    const shipped = (await files(join(client, "_os", "behaviors"))).map((f) => f.slice(0, -3));
    for (const b of BEHAVIORS.filter((x) => x !== "beacon")) expect(shipped).toContain(b);
    expect(await read(client, "index.html")).toContain("/_os/site.");
  });

  it("builds a Worker for members, sign-in and password routes with the gated-content bucket", async () => {
    const wrangler = JSON.parse(await read(out, "server/wrangler.json")) as {
      r2_buckets: { binding: string }[];
      assets: { directory: string };
    };
    expect(wrangler.r2_buckets.map((b) => b.binding)).toContain("OS_GATED");
    expect(wrangler.assets.directory).toBe("../client");
    const chunks = await files(join(out, "server"));
    expect(chunks.some((f) => /chunks\/gated_.*\.mjs$/.test(f))).toBe(true);
    expect(chunks.some((f) => /chunks\/auth-callback_.*\.mjs$/.test(f))).toBe(true);
    const { stdout } = await run(
      join(FIXTURES, "node_modules", ".bin", "wrangler"),
      ["deploy", "--dry-run"],
      {
        cwd: root,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    expect(stdout).toContain("env.OS_GATED");
    expect(stdout).toContain("--dry-run: exiting now.");
  }, 120_000);
});

describe("astro dev", () => {
  it("serves pages from content/ through the same route", async () => {
    const root = await assemble("meadow-dev");
    // A clean environment: vitest's NODE_ENV=test / VITEST* would put Astro in test mode.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => !k.startsWith("VITEST") && k !== "NODE_ENV" && k !== "TEST",
      ),
    );
    const { stdout } = await run(
      process.execPath,
      [join(FIXTURES, "scripts", "dev-smoke.mjs"), root],
      { env: { ...env, ASTRO_TELEMETRY_DISABLED: "1" } },
    );
    expect(stdout).toContain("/ 200 true");
    expect(stdout).toContain("/journal/2026-10-26-opening-day/ 200 true");
    expect(stdout).toContain("/shop/ 200 true");
  }, 120_000);
});
