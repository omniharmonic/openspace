/**
 * A recorded Squarespace site for tests: "Juniper Ceramics", hand-written sample content laid out
 * in Squarespace 7.1's real markup (page sections, Fluid Engine and classic-editor layouts, form
 * context JSON, collection item pages with JSON-LD) plus its `?format=json` responses, robots.txt,
 * sitemap, site.css and a WordPress export. `juniperFetch()` serves it like the live site would,
 * generating images at the size each `?format=<w>w` request asks for.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import type { FetchFn } from "./fetch";

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "juniper");
export const JUNIPER_URL = "https://www.juniperceramics.example";
export const JUNIPER_EXPORT = join(FIXTURE_DIR, "export.xml");
const SITE_CSS = "https://static1.squarespace.com/static/versioned-site-css/64jun1per/12/site.css";

/** Original sizes of the fixture's CDN images. */
const IMAGES: Record<string, [number, number]> = {
  "logo-juniper.png": [600, 180],
  "hero-kiln.jpg": [2400, 1600],
  "wheel-hands.jpg": [1600, 1200],
  "mugs-row.jpg": [1200, 1200],
  "glaze-tests.jpg": [1200, 1200],
  "kiln-shelf.jpg": [1200, 1200],
  "tall-vase.jpg": [800, 2000],
  "taster.jpg": [1000, 1250],
  "six-week.jpg": [1000, 1250],
  "open-studio.jpg": [1000, 1250],
  "ana-theo.jpg": [1500, 1000],
};

/** A valid, tiny (flat color) PNG of the given size. */
export function pngBytes(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const row = Buffer.alloc(width + 1, 0x99);
  row[0] = 0;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * (width + 1));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const read = (rel: string) => readFileSync(join(FIXTURE_DIR, rel), "utf8");
const tryRead = (rel: string) => {
  try {
    return read(rel);
  } catch {
    return undefined;
  }
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Wrap a page body (first-line comment = metadata) in the site's head, header and footer. */
export function composePage(file: string): string {
  const src = read(file);
  const m = /^<!--([\s\S]*?)-->\n?/.exec(src);
  const meta: Record<string, string> = {};
  for (const part of (m?.[1] ?? "").split(" | ")) {
    const i = part.indexOf(": ");
    if (i > 0) meta[part.slice(0, i).trim()] = part.slice(i + 2).trim();
  }
  const body = m ? src.slice(m[0].length) : src;
  const head = [
    `<title>${esc(meta.title ?? "Juniper Ceramics")}</title>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    meta.description ? `<meta name="description" content="${esc(meta.description)}" />` : "",
    `<meta property="og:site_name" content="Juniper Ceramics"/>`,
    `<meta property="og:title" content="${esc(meta.title ?? "")}"/>`,
    meta.description ? `<meta property="og:description" content="${esc(meta.description)}"/>` : "",
    meta["og:image"] ? `<meta property="og:image" content="${esc(meta["og:image"])}"/>` : "",
    meta.author ? `<meta itemprop="author" content="${esc(meta.author)}"/>` : "",
    meta.datePublished
      ? `<meta itemprop="datePublished" content="${esc(meta.datePublished)}"/>`
      : "",
    `<link rel="icon" type="image/x-icon" href="https://images.squarespace-cdn.com/content/v1/64jun1per/favicon.ico?format=100w"/>`,
    `<script type="application/ld+json">{"url":"${JUNIPER_URL}","name":"Juniper Ceramics","@context":"http://schema.org","@type":"WebSite"}</script>`,
    meta.ld ? `<script type="application/ld+json">${meta.ld}</script>` : "",
    `<!-- This is Squarespace. --><!-- juniper-ceramics -->`,
    `<link rel="stylesheet" type="text/css" href="//assets.squarespace.com/universal/styles-compressed/commerce-min.en-US.css">`,
    `<link rel="stylesheet" type="text/css" href="${SITE_CSS.replace("https:", "")}?nocustom=true"/>`,
    `<!-- End of Squarespace Headers -->`,
    `<script>window.studioAnalytics = { id: "JC-1" };</script>`,
  ].join("\n");
  const bodyClasses = `tweak-fixed-header primary-button-style-solid primary-button-shape-rounded form-field-style-outline ${meta.body ?? "collection-type-page"}`;
  return `<!doctype html>\n<html xmlns:og="http://opengraphprotocol.org/schema/" lang="en-US">\n<head>\n${head}\n</head>\n<body id="collection-64f0" class="${bodyClasses}">\n<div class="site-wrapper">\n${read("_header.html")}\n<main id="page" class="container" role="main"><article class="sections" id="sections" data-page-sections>\n${body}\n</article></main>\n${read("_footer.html")}\n</div>\n</body>\n</html>\n`;
}

const PAGES: Record<string, string> = {
  "/": "home.html",
  "/home": "home.html",
  "/about-us": "about-us.html",
  "/workshops": "workshops.html",
  "/contact": "contact.html",
  "/journal": "journal.html",
  "/journal/2025/3/14/first-firing-of-spring": "first-firing-of-spring.html",
  "/journal/glaze-notes": "glaze-notes.html",
  "/shop": "shop.html",
  "/shop/p/speckled-mug": "speckled-mug.html",
  "/events": "events.html",
  "/events/open-studio-day": "open-studio-day.html",
  "/members-corner": "members-corner.html",
};

const JSON_PAGES: Record<string, string> = {
  "/": "json/home.json",
  "/about-us": "json/about-us.json",
  "/journal": "json/journal.json",
  "/shop": "json/shop.json",
  "/events": "json/events.json",
};

export interface FixtureFetchLog {
  urls: string[];
}

/** A `fetch` that serves the Juniper fixture site (and its CDN). */
export function juniperFetch(log: FixtureFetchLog = { urls: [] }): FetchFn {
  return async (input) => {
    const url = new URL(String(input));
    log.urls.push(url.toString());
    const ok = (body: BodyInit, type: string) =>
      new Response(body, { status: 200, headers: { "content-type": type } });
    const notFound = () => new Response("Not found", { status: 404 });
    if (url.host === "images.squarespace-cdn.com") {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const size = IMAGES[name];
      if (!size) return notFound();
      const fmt = /^(\d+)w$/.exec(url.searchParams.get("format") ?? "");
      const [w0, h0] = size;
      const w = fmt ? Math.min(w0, Number(fmt[1])) : w0;
      const h = Math.round((h0 * w) / w0);
      return ok(pngBytes(w, h) as unknown as BodyInit, "image/png");
    }
    if (url.toString().startsWith(SITE_CSS)) return ok(read("site.css"), "text/css");
    if (url.host !== new URL(JUNIPER_URL).host) return notFound();
    const path = decodeURI(url.pathname).replace(/\/+$/, "") || "/";
    if (path === "/robots.txt") return ok(read("robots.txt"), "text/plain");
    if (path === "/sitemap.xml") return ok(read("sitemap.xml"), "application/xml");
    if (path === "/s/juniper-price-list.pdf")
      return ok(
        new TextEncoder().encode("%PDF-1.4\n% Juniper price list\n%%EOF\n") as unknown as BodyInit,
        "application/pdf",
      );
    if (url.searchParams.get("format") === "json") {
      const file =
        path === "/journal" && url.searchParams.has("offset")
          ? "json/journal-page2.json"
          : JSON_PAGES[path];
      const text = file ? tryRead(file) : undefined;
      return text ? ok(text, "application/json") : notFound();
    }
    const page = PAGES[path];
    return page ? ok(composePage(page), "text/html; charset=utf-8") : notFound();
  };
}

// --- WordPress: "Fernhill Bakery" ------------------------------------------------------------------

export const FERNHILL_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "fernhill",
);
export const FERNHILL_URL = "https://fernhill.example";
export const FERNHILL_EXPORT = join(FERNHILL_DIR, "export.xml");
const fern = (rel: string) => readFileSync(join(FERNHILL_DIR, rel), "utf8");

/** Images and files any fixture site links to: PNGs sized from the URL (`-1024x683`), or 1600×1000. */
function fixtureAsset(url: URL): Response | undefined {
  const ok = (body: BodyInit, type: string) =>
    new Response(body, { status: 200, headers: { "content-type": type } });
  if (/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) {
    const m = /-(\d+)x(\d+)\.[a-z]+$/i.exec(url.pathname);
    const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1600, 1000];
    return ok(pngBytes(Math.min(w, 2400), Math.min(h, 2400)) as unknown as BodyInit, "image/png");
  }
  if (/\.pdf$/i.test(url.pathname))
    return ok(
      new TextEncoder().encode("%PDF-1.4\n%%EOF\n") as unknown as BodyInit,
      "application/pdf",
    );
  return undefined;
}

/**
 * A `fetch` serving the Fernhill WordPress fixture: the home page HTML, the REST API (index,
 * pages, posts with `_embed`, categories, tags; `restApi: false` makes it 404 like a locked-down
 * site) and uploads.
 */
export function fernhillFetch(opts: { restApi?: boolean; log?: FixtureFetchLog } = {}): FetchFn {
  const log = opts.log ?? { urls: [] };
  return async (input) => {
    const url = new URL(String(input));
    log.urls.push(url.toString());
    const json = (v: unknown) =>
      new Response(JSON.stringify(v), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const notFound = () => new Response("Not found", { status: 404 });
    if (url.host !== "fernhill.example") return notFound();
    const asset = url.pathname.startsWith("/wp-content/uploads/") ? fixtureAsset(url) : undefined;
    if (asset) return asset;
    const path = url.pathname;
    if (path === "/robots.txt") return new Response(fern("robots.txt"), { status: 200 });
    if (path === "/wp-content/themes/fernhill/style.css")
      return new Response(fern("style.css"), {
        status: 200,
        headers: { "content-type": "text/css" },
      });
    if (path === "/" || path === "")
      return new Response(fern("home.html"), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    if (path.startsWith("/wp-json/")) {
      if (opts.restApi === false) return new Response('{"code":"rest_disabled"}', { status: 401 });
      const route = path.slice("/wp-json/".length).replace(/\/+$/, "");
      const page = Number(url.searchParams.get("page") ?? "1");
      const per = Number(url.searchParams.get("per_page") ?? "10");
      const list = (file: string) => {
        const all = JSON.parse(fern(file)) as unknown[];
        const slice = all.slice((page - 1) * per, page * per);
        return slice.length || page === 1
          ? json(slice)
          : new Response('{"code":"rest_post_invalid_page_number"}', { status: 400 });
      };
      if (route === "") return json(JSON.parse(fern("index.json")));
      if (route === "wp/v2/pages") return list("pages.json");
      if (route === "wp/v2/posts") return list("posts.json");
      if (route === "wp/v2/categories") return list("categories.json");
      if (route === "wp/v2/tags") return list("tags.json");
      return notFound();
    }
    return notFound();
  };
}

// --- Any site (Webflow-style markup): "Tidewater Studio" --------------------------------------------

export const TIDEWATER_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "tidewater",
);
export const TIDEWATER_URL = "https://www.tidewater.example";
const tide = (rel: string) => readFileSync(join(TIDEWATER_DIR, rel), "utf8");

const TIDE_PAGES: Record<string, string> = {
  "/": "index.html",
  "/about": "about.html",
  "/services": "services.html",
  "/services/brand-identity": "brand-identity.html",
  "/contact": "contact.html",
  "/journal": "journal.html",
  "/journal/new-sign-for-quay-cafe": "post-1.html",
  "/journal/tide-tables": "post-2.html",
  "/private-draft": "about.html",
};

/** A page body (first-line comment = `title | description | head`) in the site layout. */
export function composeTidewater(file: string): string {
  const src = tide(file);
  const m = /^<!--([\s\S]*?)-->\n?/.exec(src);
  const meta: Record<string, string> = {};
  for (const part of (m?.[1] ?? "").split(" | ")) {
    const i = part.indexOf(": ");
    if (i > 0) meta[part.slice(0, i).trim()] = part.slice(i + 2).trim();
  }
  return tide("_layout.html")
    .replace(/\{\{title\}\}/g, esc(meta.title ?? "Tidewater Studio"))
    .replace("{{description}}", esc(meta.description ?? ""))
    .replace("{{head}}", meta.head ?? "")
    .replace("{{body}}", m ? src.slice(m[0].length) : src);
}

/** A `fetch` serving the Tidewater fixture (and its CDN), with or without a sitemap. */
export function tidewaterFetch(opts: { sitemap?: boolean; log?: FixtureFetchLog } = {}): FetchFn {
  const log = opts.log ?? { urls: [] };
  return async (input) => {
    const url = new URL(String(input));
    log.urls.push(url.toString());
    const notFound = () => new Response("Not found", { status: 404 });
    if (url.host === "cdn.prod.website-files.com") {
      if (url.pathname.endsWith("tidewater.webflow.css"))
        return new Response(tide("tidewater.webflow.css"), {
          status: 200,
          headers: { "content-type": "text/css" },
        });
      return fixtureAsset(url) ?? notFound();
    }
    if (url.host !== "www.tidewater.example") return notFound();
    const path = decodeURI(url.pathname).replace(/\/+$/, "") || "/";
    if (path === "/robots.txt")
      return new Response(
        opts.sitemap === false ? "User-agent: *\nDisallow: /private-draft\n" : tide("robots.txt"),
        { status: 200 },
      );
    if (path === "/sitemap.xml")
      return opts.sitemap === false
        ? notFound()
        : new Response(tide("sitemap.xml"), {
            status: 200,
            headers: { "content-type": "application/xml" },
          });
    const file = TIDE_PAGES[path];
    return file
      ? new Response(composeTidewater(file), {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      : notFound();
  };
}
