/**
 * Turning a planned route into the published HTML document. Shared by the Astro route (with
 * the image map from Astro's `getImage()`), the Cloudflare Worker (gated pages) and tests.
 * Every page goes through `renderPageHtml` — the one renderer (ADR-3).
 */
import { BLOCKS_CSS, FormSecurityContext, registerAll } from "@openspace/blocks";
import {
  BASE_CSS,
  BEHAVIOR_LOADER,
  behaviorsInHtml,
  CollectionsContext,
  type CollectionsValue,
  compiledStylesFor,
  type ImageMap,
  PageView,
  type PageViewProps,
  type ResolvedImage,
  renderPageHtml,
  type SocialFeedPost,
} from "@openspace/renderer";
import type { Page, SiteDocument } from "@openspace/schema";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DeployLocation } from "./deploy";
import { feedLinks } from "./feeds";
import { contentHash } from "./ids";
import type { SitePlan, SiteRoute } from "./routes";
import { jsonLdFor } from "./seo";

let registered = false;
/** Register the block library with the renderer (idempotent). */
export function ensureBlocks(): void {
  if (registered) return;
  registerAll();
  registered = true;
}

export interface SiteAssets {
  /** Hrefs (with base path) of the linked stylesheets. */
  base: string;
  tokens: string;
  blocks: string;
}

export interface AssetFiles {
  /** Path under the output dir → contents. */
  files: Record<string, string>;
  hrefs: SiteAssets;
}

/** Content-hashed stylesheet files (base, tokens, blocks) and their hrefs. */
export function siteStylesheets(doc: SiteDocument, basePath: string): AssetFiles {
  const tokens = compiledStylesFor(doc.styles).css;
  const name = (stem: string, css: string) => `_os/${stem}.${contentHash(css, 10)}.css`;
  const baseFile = name("os", BASE_CSS);
  const tokensFile = name("tokens", tokens);
  const blocksFile = name("blocks", BLOCKS_CSS);
  return {
    files: { [baseFile]: BASE_CSS, [tokensFile]: tokens, [blocksFile]: BLOCKS_CSS },
    hrefs: {
      base: `${basePath}/${baseFile}`,
      tokens: `${basePath}/${tokensFile}`,
      blocks: `${basePath}/${blocksFile}`,
    },
  };
}

// --- share images -------------------------------------------------------------------------------

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** Pseudo media path under which a generated share image is passed to the renderer. */
export const OG_MEDIA_PREFIX = "media/_os-og/";

export interface OgSpec {
  hash: string;
  title: string;
  siteTitle: string;
  eyebrow?: string;
  colors: { background: string; text: string; accent: string; muted: string };
  heading: string;
}

/** What a page's generated share image shows; its hash names the file (content-hash cache). */
export function ogSpec(doc: SiteDocument, page: Page): OgSpec {
  const styles = compiledStylesFor(doc.styles);
  const theme = styles.tokens.themes["light-accent"] ?? styles.tokens.themes.light;
  const colors = {
    background: theme.background,
    text: theme.heading,
    accent: theme.accent,
    muted: theme["text-muted"],
  };
  const title =
    page.seo?.title ?? (page.slug === "" ? (doc.site.tagline ?? doc.site.title) : page.title);
  const spec = {
    title,
    siteTitle: doc.site.title,
    colors,
    heading: styles.tokens.pairing.heading.family,
    v: 1,
  };
  return { ...spec, hash: contentHash(JSON.stringify(spec), 12) };
}

export const ogFile = (hash: string) => `_os/og/${hash}.png`;

// --- rendering ----------------------------------------------------------------------------------

export interface RenderRouteOptions {
  plan: SitePlan;
  route: SiteRoute;
  location: DeployLocation;
  /** Resolved images (Astro `getImage()` in builds). */
  imageMap?: ImageMap;
  /** Linked stylesheets; inline `<style>` when omitted (previews, tests). */
  assets?: SiteAssets;
  /** Self-hosted font CSS hrefs; the pairing's Google Fonts URL when omitted. */
  fontStylesheets?: string[];
  hubUrl?: string;
  /** Turnstile site key: adds the widget slot to forms and loads Turnstile on those pages. */
  turnstileSiteKey?: string;
  /** Generated share images for pages without their own (default true). */
  ogImages?: boolean;
  /** Build-time social feed posts for the social-feed block, keyed by `feedKey(network, handle)`. */
  socialFeeds?: Record<string, SocialFeedPost[]>;
  mode?: "production" | "preview";
}

/** The page a route renders, with its generated share image applied (if any). */
export function routePage(
  plan: SitePlan,
  route: SiteRoute,
  ogImages = true,
): { page: Page; og?: OgSpec } {
  const page = plan.doc.pages[route.pageId as Page["id"]];
  if (!page) throw new Error(`Route ${route.path} has no page ${route.pageId}`);
  if (!ogImages || page.seo?.image || route.kind === "notFound") return { page };
  const og = ogSpec(plan.doc, page);
  return { page: { ...page, seo: { ...page.seo, image: `${OG_MEDIA_PREFIX}${og.hash}.png` } }, og };
}

/**
 * Contexts site-kit provides around every page: build-time collection data for list blocks
 * (`CollectionsContext`: live items, `now` = build time, social feeds) and the Turnstile site
 * key for form/newsletter blocks (`FormSecurityContext`).
 *
 * `renderPageHtml` has no wrapper hook, so site-kit renders the page body with the same props
 * twice — plain (byte-identical to the body inside `renderPageHtml`'s document) and wrapped —
 * and swaps the wrapped body in. When the contexts change nothing, the output is exactly
 * `renderPageHtml`'s.
 */
export interface PageContexts {
  collections?: CollectionsContextValue;
  turnstileSiteKey?: string;
}

/** The renderer's `CollectionsContext` value (blocks B). */
export type CollectionsContextValue = CollectionsValue;

function wrapContexts(node: ReactNode, contexts: PageContexts): ReactNode {
  let out = node;
  if (contexts.turnstileSiteKey)
    out = createElement(
      FormSecurityContext.Provider,
      { value: { turnstileSiteKey: contexts.turnstileSiteKey } },
      out,
    );
  if (contexts.collections)
    out = createElement(CollectionsContext.Provider, { value: contexts.collections }, out);
  return out;
}

function withContexts(
  html: string,
  props: PageViewProps,
  contexts: PageContexts,
  behaviorsUrl: string,
): string {
  const plainBody = renderToStaticMarkup(createElement(PageView, props));
  const wrappedBody = renderToStaticMarkup(
    wrapContexts(createElement(PageView, props), contexts) as ReactElement,
  );
  if (plainBody === wrappedBody) return html;
  const at = html.indexOf(plainBody);
  if (at < 0) throw new Error("site-kit: page body not found in the rendered document");
  let out = html.slice(0, at) + wrappedBody + html.slice(at + plainBody.length);
  // Behaviors the context-dependent markup adds (rare): preload them and make sure the loader runs.
  const added = behaviorsInHtml(wrappedBody).filter(
    (b) => !behaviorsInHtml(plainBody).includes(b) && !out.includes(`${behaviorsUrl}/${b}.js`),
  );
  if (added.length) {
    out = out.replace(
      "</head>",
      `${added.map((b) => `<link rel="modulepreload" href="${behaviorsUrl}/${b}.js">`).join("\n")}\n</head>`,
    );
    const loader = `<script type="module" src="${behaviorsUrl}/${BEHAVIOR_LOADER}.js"></script>`;
    if (!out.includes(loader)) out = out.replace("\n</body>", `\n${loader}\n</body>`);
  }
  return out;
}

/** Load Turnstile only on pages whose forms have a widget slot. */
export function addTurnstileLoader(html: string, loaderHref: string): string {
  if (!html.includes("data-os-turnstile=")) return html;
  return html.replace("</head>", `<script type="module" src="${loaderHref}"></script>\n</head>`);
}

/** Collection data for list blocks: live items only, `now` = build time. */
export function collectionsContextValue(
  plan: SitePlan,
  feeds: Record<string, SocialFeedPost[]> = {},
): CollectionsContextValue {
  return {
    collections: plan.doc.collections,
    configs: plan.doc.collectionConfigs ?? {},
    now: plan.now,
    includeDrafts: false,
    feeds,
  };
}

/** Render a planned route to a complete HTML document. */
export function renderRoute(opts: RenderRouteOptions): string {
  ensureBlocks();
  const { plan, route, location } = opts;
  const basePath = location.basePath;
  const { page, og } = routePage(plan, route, opts.ogImages ?? true);
  const imageMap: Record<string, ResolvedImage> = { ...(opts.imageMap ?? {}) };
  if (og) {
    imageMap[`${OG_MEDIA_PREFIX}${og.hash}.png`] = {
      src: `${basePath}/${ogFile(og.hash)}`,
      width: OG_WIDTH,
      height: OG_HEIGHT,
    };
  }
  const head: string[] = [];
  if (opts.assets) head.push(`<link rel="stylesheet" href="${opts.assets.blocks}">`);
  else head.push(`<style data-os="blocks">${BLOCKS_CSS}</style>`);
  const collection = route.collection;
  if (collection) head.push(feedLinks(plan, collection, basePath));
  const html = renderPageHtml({
    doc: plan.doc,
    pageId: page,
    mode: opts.mode ?? "production",
    basePath,
    imageMap,
    siteUrl: location.siteUrl,
    jsonLd: jsonLdFor(plan, route, {
      siteUrl: location.siteUrl,
      mediaUrl: (src) => mediaAbsolute(src, location, imageMap),
    }),
    ...(opts.hubUrl ? { hubUrl: opts.hubUrl } : {}),
    ...(opts.fontStylesheets ? { fontStylesheets: opts.fontStylesheets } : {}),
    ...(opts.assets ? { stylesheets: { base: opts.assets.base, tokens: opts.assets.tokens } } : {}),
    extraHead: head.filter(Boolean).join("\n"),
  });
  const mode = opts.mode ?? "production";
  const behaviorsUrl = `${basePath}/_os/behaviors`;
  const wrapped = withContexts(
    html,
    {
      doc: plan.doc,
      page,
      mode,
      basePath,
      imageMap,
      hubUrl: (opts.hubUrl ?? plan.doc.config.hub).replace(/\/+$/, ""),
    },
    {
      collections: collectionsContextValue(plan, opts.socialFeeds),
      ...(opts.turnstileSiteKey ? { turnstileSiteKey: opts.turnstileSiteKey } : {}),
    },
    behaviorsUrl,
  );
  return opts.turnstileSiteKey
    ? addTurnstileLoader(wrapped, `${basePath}/_os/turnstile.js`)
    : wrapped;
}

/** Absolute URL of a media source: an image-map URL if resolved, else the raw published file. */
export function mediaAbsolute(src: string, location: DeployLocation, imageMap?: ImageMap): string {
  if (/^https?:\/\//.test(src)) return src;
  const mapped = imageMap?.[src]?.src;
  if (mapped) return new URL(mapped, location.siteUrl).toString();
  return new URL(src.replace(/^\/+/, ""), location.siteUrl).toString();
}

/** The Turnstile loader served at `/_os/turnstile.js` (only requested on pages with forms). */
export const TURNSTILE_LOADER = `const els=[...document.querySelectorAll("[data-os-turnstile]")];
if(els.length){window.__osTurnstile=()=>{for(const el of els){if(el.dataset.osRendered)continue;el.dataset.osRendered="1";window.turnstile.render(el,{sitekey:el.dataset.osTurnstile,appearance:el.dataset.appearance||"interaction-only",theme:"auto"})}};
const s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__osTurnstile";s.async=true;s.defer=true;document.head.append(s)}
`;
