import type { Page, SiteDocument } from "@omniharmonic/openspace-schema";
import {
  chosenCustomFont,
  customFontFaces,
  customFontPreloads,
  googleFontsUrl,
} from "@omniharmonic/openspace-theme";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BEHAVIOR_LOADER, type BehaviorName, behaviorsInHtml } from "./behaviors-manifest";
import {
  absolute,
  compiledStylesFor,
  escapeHtml,
  jsonForScript,
  ogImageUrl,
  pageDescription,
  pageTitle,
  safeCss,
  siteUrlFor,
} from "./html-meta";
import type { ImageMap } from "./image-map";
import { mediaUrl, normalizeBasePath, pagePath } from "./link";
import { PageView, resolvePage } from "./page";
import { BASE_CSS } from "./styles/base-css";

export interface RenderPageHtmlOptions {
  doc: SiteDocument;
  /** Page id, or a page object (collection item pages, unsaved drafts). */
  pageId: string | Page;
  mode?: "production" | "preview";
  /** Site base path (`/maya-yoga` on a GitHub project site); `""` at a domain root. */
  basePath?: string;
  imageMap?: ImageMap;
  /** Hub origin for forms/newsletter/analytics/cart (default: `config.hub`). */
  hubUrl?: string;
  /** Where behavior modules are served (default `<basePath>/_os/behaviors`). */
  behaviorsUrl?: string;
  /**
   * Absolute site URL including the base path, for canonical and Open Graph URLs (default:
   * `https://<customDomain>` or `config.deploy.url`).
   */
  siteUrl?: string;
  /** Structured data emitted as `<script type="application/ld+json">`. */
  jsonLd?: object | object[];
  /**
   * Font stylesheet URLs. Default: the pairing's Google Fonts URL (previews). Published sites
   * pass self-hosted Fontsource CSS; `[]` disables web fonts.
   */
  fontStylesheets?: string[];
  /** Link the stylesheets instead of inlining them (site-kit serves them as cacheable files). */
  stylesheets?: { base?: string; tokens?: string };
  /** Extra trusted markup appended to `<head>` (site-kit feed links etc.). */
  extraHead?: string;
}

/**
 * Until the owner uploads a browser-tab icon: the site's initial on its brand color, as an
 * inline SVG (no request, and no 404 for `/favicon.ico` in the console).
 */
export function monogramIcon(
  title: string,
  brand: { background?: string; heading?: string } | undefined,
): string {
  const letter = escapeHtml((title.trim().match(/\p{L}|\p{N}/u)?.[0] ?? "•").toUpperCase());
  const bg = brand?.background ?? "#222222";
  const fg = brand?.heading ?? "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="43" font-family="system-ui,sans-serif" font-size="34" font-weight="600" text-anchor="middle" fill="${fg}">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Share of a phone screen an image's `sizes` gives it (its last, unconditional length). */
function phoneShare(sizes: string | undefined): number {
  const last = (sizes ?? "100vw").split(",").pop()?.trim() ?? "100vw";
  const vw = /^(\d+(?:\.\d+)?)vw$/.exec(last);
  if (vw) return Number(vw[1]) / 100;
  const times = /\*\s*(\d+(?:\.\d+)?)\s*\)$/.exec(last);
  if (times) return Number(times[1]);
  return /^calc\(100vw/.test(last) ? 1 : 0.5;
}

/**
 * `<link rel="preload" as="image">` for the page's likely LCP image. Of the images the renderer
 * marked `fetchpriority="high"` (the first section's lead images), it picks the one that covers
 * most of a phone screen (from its `sizes` and aspect ratio), since mobile LCP is what's
 * measured. With `imagesrcset`/`imagesizes` the browser fetches exactly the candidate the `<img>`
 * will use, before stylesheets and fonts compete for the connection. When its `<picture>` offers
 * modern formats, the preload names the first `<source>` (with its `type`, so browsers without
 * that format skip it). Attribute values are taken from the already-escaped markup.
 */
export function lcpImagePreload(body: string): string {
  const imgs = [...body.matchAll(/<img\b[^>]*\bfetchpriority="high"[^>]*>/gi)].slice(0, 4);
  let best: { m: RegExpMatchArray; score: number } | null = null;
  for (const m of imgs) {
    const share = phoneShare(attr(m[0], "sizes"));
    const w = Number(attr(m[0], "width")) || 1;
    const h = Number(attr(m[0], "height")) || w;
    const score = share * share * (h / w);
    if (!best || score > best.score) best = { m, score };
  }
  if (!best || best.m.index === undefined) return "";
  const img = best.m;
  const at = best.m.index;
  const pictureStart = body.lastIndexOf("<picture", at);
  const between = pictureStart >= 0 ? body.slice(pictureStart, at) : "";
  const source =
    pictureStart >= 0 && !between.includes("</picture>")
      ? /<source\b[^>]*>/i.exec(between)?.[0]
      : undefined;
  const tag = source ?? img[0];
  const srcset = attr(tag, "srcset") ?? attr(tag, "srcSet");
  const sizes = attr(tag, "sizes");
  const src = attr(img[0], "src");
  const type = source ? attr(source, "type") : undefined;
  if (!srcset && !src) return "";
  return `<link rel="preload" as="image"${srcset ? ` imagesrcset="${srcset}"` : ` href="${src}"`}${srcset && sizes ? ` imagesizes="${sizes}"` : ""}${type ? ` type="${type}"` : ""} fetchpriority="high">`;
}

/**
 * Render a complete HTML document for a page: head (title, meta, Open Graph, canonical, JSON-LD,
 * fonts, token CSS, base CSS, custom CSS, head injection), the rendered body, and behavior
 * scripts only for behaviors the page actually uses. No React runtime ships.
 */
export function renderPageHtml(opts: RenderPageHtmlOptions): string {
  const { doc } = opts;
  const mode = opts.mode ?? "production";
  const page = resolvePage(doc, opts.pageId);
  const basePath = normalizeBasePath(opts.basePath);
  const hubUrl = (opts.hubUrl ?? doc.config.hub).replace(/\/+$/, "");
  const behaviorsUrl = (opts.behaviorsUrl ?? `${basePath}/_os/behaviors`).replace(/\/+$/, "");
  const siteUrl = siteUrlFor(doc, opts.siteUrl);
  const site = doc.site;
  const styles = compiledStylesFor(doc.styles);

  const body = renderToStaticMarkup(
    createElement(PageView, {
      doc,
      page,
      mode,
      basePath,
      imageMap: opts.imageMap ?? {},
      hubUrl,
    }),
  );

  const analytics =
    mode === "production" &&
    doc.config.features.analytics &&
    site.integrations?.analytics !== false;
  const behaviors = behaviorsInHtml(body);
  if (analytics) behaviors.push("beacon");

  const title = pageTitle(doc, page);
  const description = pageDescription(doc, page);
  const canonical = page.seo?.canonical ?? absolute(siteUrl, pagePath(page));
  const noindex = mode === "preview" || page.seo?.noindex || site.seo?.noindex;
  const ogImageSrc = page.seo?.image ?? site.seo?.image;
  const ogImage = ogImageSrc ? ogImageUrl(ogImageSrc, siteUrl, opts.imageMap) : undefined;
  // Uploaded fonts (PRD §5.1) publish with the site; when they replace both the heading and the
  // body family, the pairing's web fonts aren't loaded at all.
  const customHeading = chosenCustomFont(doc.styles, doc.styles.choices.headingFont);
  const customBody = chosenCustomFont(doc.styles, doc.styles.choices.bodyFont);
  const fonts =
    customHeading && customBody
      ? []
      : (opts.fontStylesheets ?? [googleFontsUrl(styles.tokens.pairing)]);
  const fontFaces = customFontFaces(doc.styles, (src) => mediaUrl(src, basePath));
  const fontPreloads = customFontPreloads(doc.styles, {
    heading: styles.tokens.pairing.headingWeight,
    body: styles.tokens.pairing.bodyWeight,
  });
  const usesGoogle = fonts.some((f) => f.startsWith("https://fonts.googleapis.com/"));

  const meta = (name: string, content: string | undefined, attr = "name") =>
    content ? `<meta ${attr}="${name}" content="${escapeHtml(content)}">` : "";
  const head: string[] = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    // The LCP image first: discovered before the stylesheets and fonts below.
    lcpImagePreload(body),
    meta("description", description),
    noindex ? '<meta name="robots" content="noindex">' : "",
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    meta("og:type", "website", "property"),
    meta("og:site_name", site.title, "property"),
    meta("og:title", page.seo?.title ?? page.title, "property"),
    meta("og:description", description, "property"),
    meta("og:url", canonical, "property"),
    meta("og:image", ogImage, "property"),
    meta("og:locale", site.locale.replace("-", "_"), "property"),
    meta("twitter:card", ogImage ? "summary_large_image" : "summary"),
    `<link rel="icon" href="${escapeHtml(site.favicon ? mediaUrl(site.favicon, basePath) : monogramIcon(site.title, styles.tokens.themes.brand))}">`,
    '<meta name="generator" content="OpenSpace">',
    "<script>document.documentElement.classList.add('os-js')</script>",
    usesGoogle
      ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      : "",
    ...fontPreloads.map(
      (src) =>
        `<link rel="preload" as="font" type="font/woff2" href="${escapeHtml(mediaUrl(src, basePath))}" crossorigin>`,
    ),
    ...fonts.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`),
    fontFaces ? `<style data-os="fonts">${safeCss(fontFaces)}</style>` : "",
    opts.stylesheets?.tokens
      ? `<link rel="stylesheet" href="${escapeHtml(opts.stylesheets.tokens)}">`
      : `<style data-os="tokens">${styles.css}</style>`,
    opts.stylesheets?.base
      ? `<link rel="stylesheet" href="${escapeHtml(opts.stylesheets.base)}">`
      : `<style data-os="base">${BASE_CSS}</style>`,
    site.customCss ? `<style data-os="custom">${safeCss(site.customCss)}</style>` : "",
    ...[opts.jsonLd ?? []]
      .flat()
      .map((ld) => `<script type="application/ld+json">${jsonForScript(ld)}</script>`),
    ...behaviors.map(
      (b) => `<link rel="modulepreload" href="${escapeHtml(`${behaviorsUrl}/${b}.js`)}">`,
    ),
    opts.extraHead ?? "",
    site.headInjection ?? "",
    page.headInjection ?? "",
  ];

  const bodyAttrs = [
    `class="os-body"`,
    `data-os-site="${escapeHtml(doc.config.siteId)}"`,
    `data-os-hub="${escapeHtml(hubUrl)}"`,
    `data-os-base="${escapeHtml(basePath)}"`,
    `data-os-mode="${mode}"`,
    analytics ? `data-os-behavior="beacon"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const scripts = behaviors.length
    ? `<script type="module" src="${escapeHtml(`${behaviorsUrl}/${BEHAVIOR_LOADER}.js`)}"></script>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(site.locale)}">
<head>
${head.filter(Boolean).join("\n")}
</head>
<body ${bodyAttrs}>
${body}
${scripts}${site.footerInjection ?? ""}${page.footerInjection ?? ""}
</body>
</html>
`;
}

/**
 * Behaviors a page needs: pass rendered HTML, or render options (the page is rendered first).
 * Includes `beacon` for production renders with analytics on.
 */
export function behaviorsForPage(input: string | RenderPageHtmlOptions): BehaviorName[] {
  if (typeof input === "string") return behaviorsInHtml(input);
  return behaviorsInHtml(renderPageHtml(input));
}

export {
  compiledStylesFor,
  escapeHtml,
  jsonForScript,
  ogImageUrl,
  pageDescription,
  pageTitle,
  siteUrlFor,
} from "./html-meta";
