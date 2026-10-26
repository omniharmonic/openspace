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

import { doc, options } from "virtual:openspace/site";
import type { ImageMap } from "@openspace/renderer";
import { renderRoute } from "../render";
import { planSite, type SitePlan, type SiteRoute } from "../routes";
import { resolveImages } from "./astro-images";
import { pageImageSrcs } from "./images";

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

/** Resolve every local media image a route's page (and the site chrome) uses. */
export async function imageMapFor(route: SiteRoute): Promise<ImageMap> {
  const p = sitePlan();
  const page = p.doc.pages[route.pageId as keyof typeof p.doc.pages];
  return resolveImages(page ? pageImageSrcs(p.doc, page) : []);
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
    ...(options.fontPreloads ? { fontPreloads: options.fontPreloads } : {}),
    ...(options.hubUrl ? { hubUrl: options.hubUrl } : {}),
    ...(options.turnstileSiteKey ? { turnstileSiteKey: options.turnstileSiteKey } : {}),
    ogImages: options.ogImages,
    ...(options.socialFeeds ? { socialFeeds: options.socialFeeds } : {}),
  });
}
