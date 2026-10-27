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
