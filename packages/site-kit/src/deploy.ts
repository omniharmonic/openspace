import type { SiteConfig } from "@omniharmonic/openspace-schema";

export interface DeployLocation {
  /** Astro `site`: the origin the site is served from (no path). */
  site: string;
  /** Astro `base`: `/` at a domain root, `/repo` on a GitHub project site. */
  base: string;
  /** Renderer base path: `""` at a root, `/repo` otherwise. */
  basePath: string;
  /** Absolute site URL including the base path, ending in `/`. */
  siteUrl: string;
}

/**
 * Derive Astro's `site` and `base` from `openspace.json` (arch §2.2). A custom domain always
 * serves from `/`; otherwise the path of `deploy.url` is the base (`https://maya.github.io/
 * maya-yoga` → `/maya-yoga`), which removes the most common GitHub Pages breakage.
 */
export function deployLocation(config: Pick<SiteConfig, "deploy">): DeployLocation {
  const { customDomain, url } = config.deploy;
  if (customDomain) {
    const site = `https://${customDomain}`;
    return { site, base: "/", basePath: "", siteUrl: `${site}/` };
  }
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "");
  return {
    site: u.origin,
    base: path || "/",
    basePath: path,
    siteUrl: `${u.origin}${path}/`,
  };
}
