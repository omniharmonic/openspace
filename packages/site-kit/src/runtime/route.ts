/**
 * The page route used by the site's `src/pages/[...slug].astro`. Runs inside Astro (needs
 * `astro:assets` for `getImage()` and the integration's virtual modules), so it is only
 * imported from Astro pages.
 *
 * ```astro
 * ---
 * import { renderPage, staticPaths } from "@openspace/site-kit/route";
 * export const getStaticPaths = staticPaths;
 * const html = await renderPage(Astro.props);
 * ---
 * <Fragment set:html={html} />
 * ```
 */
/// <reference path="../virtual.d.ts" />

import { getImage } from "astro:assets";
import { mediaImports } from "virtual:openspace/media";
import { doc, options } from "virtual:openspace/site";
import { collectImageSrcs, type ImageMap, type ResolvedImage } from "@openspace/renderer";
import { renderRoute } from "../render";
import { planSite, type SitePlan, type SiteRoute } from "../routes";
import {
  fallbackFormat,
  fallbackWidth,
  imageWidths,
  localImageSrcs,
  resolvedImage,
} from "./images";

let plan: SitePlan | undefined;
function sitePlan(): SitePlan {
  plan ??= planSite(doc, { now: new Date(options.now) });
  return plan;
}

export interface PageProps {
  pageId: string;
}

/** `getStaticPaths` for `[...slug].astro`: one entry per planned route. */
export function staticPaths() {
  return sitePlan().routes.map((r) => ({
    params: { slug: r.param },
    props: { pageId: r.pageId } satisfies PageProps,
  }));
}

const cache = new Map<string, Promise<ResolvedImage | undefined>>();

interface ImageMeta {
  src: string;
  width: number;
  height: number;
  format: string;
}

async function resolveOne(src: string): Promise<ResolvedImage | undefined> {
  const load = mediaImports[`/${src}`];
  if (!load) return undefined;
  const meta = (await load()) as ImageMeta;
  if (meta.format === "svg") return undefined;
  const widths = imageWidths(meta.width);
  const transform = async (format: "avif" | "webp" | "jpg" | "png") => {
    const r = await getImage({ src: meta, width: fallbackWidth(meta.width), widths, format });
    return { src: r.src, srcset: r.srcSet.attribute };
  };
  const [avif, webp, fallback] = await Promise.all([
    transform("avif"),
    transform("webp"),
    transform(fallbackFormat(meta.format)),
  ]);
  return resolvedImage(meta, { avif, webp, fallback }, doc.media[src]?.placeholder);
}

/** Resolve every local media image a route's page (and the site chrome) uses. */
export async function imageMapFor(route: SiteRoute): Promise<ImageMap> {
  const p = sitePlan();
  const page = p.doc.pages[route.pageId as keyof typeof p.doc.pages];
  const srcs = collectImageSrcs(page);
  collectImageSrcs(p.doc.site, srcs);
  const map: Record<string, ResolvedImage> = {};
  await Promise.all(
    localImageSrcs(srcs).map(async (src) => {
      let pending = cache.get(src);
      if (!pending) {
        pending = resolveOne(src);
        cache.set(src, pending);
      }
      const resolved = await pending;
      if (resolved) map[src] = resolved;
    }),
  );
  return map;
}

/** Render the page for `Astro.props` to a full HTML document. */
export async function renderPage(props: PageProps): Promise<string> {
  const p = sitePlan();
  const route = p.routes.find((r) => r.pageId === props.pageId);
  if (!route) throw new Error(`OpenSpace: no route for page ${props.pageId}`);
  const imageMap = await imageMapFor(route);
  return renderRoute({
    plan: p,
    route,
    location: options.location,
    imageMap,
    assets: options.assets,
    ...(options.fontStylesheets ? { fontStylesheets: options.fontStylesheets } : {}),
    ...(options.hubUrl ? { hubUrl: options.hubUrl } : {}),
    ...(options.turnstileSiteKey ? { turnstileSiteKey: options.turnstileSiteKey } : {}),
    ogImages: options.ogImages,
  });
}
