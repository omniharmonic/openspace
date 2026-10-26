/**
 * `openspace()` — the Astro integration every OpenSpace site runs (arch §4.4). It reads
 * `openspace.json` + `content/**`, derives `site`/`base` from the deploy config, serves the
 * content to the page route through virtual modules, and after the build writes stylesheets,
 * behaviors, feeds, sitemap, robots.txt, redirects, Hub manifests, share images, raw media,
 * fonts and the search index. On the Cloudflare target (with `@astrojs/cloudflare` as the adapter) it adds
 * the Worker routes for members, magic-link sign-in and password pages.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { loadSiteDocument } from "./content/index";
import { type DeployLocation, deployLocation } from "./deploy";
import type { PodcastOptions } from "./feeds";
import { resolveFonts } from "./node/fonts";
import { writeSiteOutputs } from "./node/postbuild";
import { siteStylesheets } from "./render";
import { gatedPages, planSite } from "./routes";
import type { RuntimeOptions } from "./runtime-options";

export interface OpenSpaceOptions {
  /** Turnstile site key (public). Defaults to `OPENSPACE_TURNSTILE_SITE_KEY`. Forms then load Turnstile. */
  turnstileSiteKey?: string;
  /** Hub origin override (default: `hub` in openspace.json). */
  hubUrl?: string;
  /** Generated share images for pages without their own image (default true). */
  ogImages?: boolean;
  /** Run Pagefind after the build (default: `features.search`). */
  search?: boolean;
  /** Build time (default now, or `OPENSPACE_BUILD_TIME`); decides scheduled posts. */
  now?: Date | string;
  podcast?: PodcastOptions;
  /**
   * Build-time posts for the social-feed block, keyed by `feedKey(network, handle)`
   * (`instagram:meadowyoga`). Fetching needs the owner's authorization, which lives in the Hub;
   * pass the data here (or a function returning it). Without it the block shows pinned posts.
   */
  socialFeeds?: Record<string, unknown[]> | (() => Promise<Record<string, unknown[]>>);
}

/**
 * `@astrojs/cloudflare` options for the Cloudflare target: pages prerender in Node (so the
 * image pipeline, share images and Pagefind run exactly as on GitHub Pages) and images are
 * optimised at build time. Only members / sign-in / password routes run on the Worker.
 */
export const CLOUDFLARE_ADAPTER_OPTIONS = {
  prerenderEnvironment: "node",
  imageService: "compile",
} as const;

const VIRTUAL_SITE = "virtual:openspace/site";
const VIRTUAL_MEDIA = "virtual:openspace/media";
const ENTRY = (p: string) => `@openspace/site-kit/${p}`;

export function openspace(options: OpenSpaceOptions = {}): AstroIntegration {
  let rootDir = process.cwd();
  let location: DeployLocation | undefined;
  let runtime: RuntimeOptions | undefined;
  let cloudflare = false;
  let search = false;
  let now = new Date();

  const siteModule = async () => {
    const doc = await loadSiteDocument(rootDir);
    return `export const doc = JSON.parse(${JSON.stringify(JSON.stringify(doc))});\nexport const options = ${JSON.stringify(runtime)};\n`;
  };

  return {
    name: "@openspace/site-kit",
    hooks: {
      "astro:config:setup": async ({
        config,
        command,
        updateConfig,
        injectRoute,
        addWatchFile,
        logger,
      }) => {
        rootDir = fileURLToPath(config.root);
        const fixedNow = options.now ?? process.env.OPENSPACE_BUILD_TIME;
        now = fixedNow ? new Date(fixedNow) : new Date();
        const doc = await loadSiteDocument(rootDir);
        location = deployLocation(doc.config);
        cloudflare = doc.config.deploy.target === "cloudflare";
        search = options.search ?? doc.config.features.search;
        const fonts = await resolveFonts(rootDir, doc, location.basePath);
        if (!fonts.plan && command === "build")
          logger.info(
            `fonts load from Google Fonts; install ${fonts.missing.join(", ")} to self-host them`,
          );
        const turnstileSiteKey =
          options.turnstileSiteKey ?? process.env.OPENSPACE_TURNSTILE_SITE_KEY;
        runtime = {
          now: now.toISOString(),
          location,
          assets: siteStylesheets(doc, location.basePath).hrefs,
          fontStylesheets: fonts.plan ? [`${location.basePath}/${fonts.plan.cssFile}`] : undefined,
          hubUrl: options.hubUrl,
          turnstileSiteKey: turnstileSiteKey || undefined,
          ogImages: options.ogImages ?? true,
          socialFeeds:
            typeof options.socialFeeds === "function"
              ? await options.socialFeeds()
              : options.socialFeeds,
        };

        addWatchFile(join(rootDir, "openspace.json"));
        if (cloudflare) {
          if (config.adapter?.name !== "@astrojs/cloudflare")
            throw new Error(
              'openspace.json deploys to Cloudflare: set `adapter: cloudflare(CLOUDFLARE_ADAPTER_OPTIONS)` (from "@astrojs/cloudflare") in astro.config.mjs, as the starter\'s Cloudflare variant does.',
            );
          injectRoute({
            pattern: "/members/[...path]",
            entrypoint: ENTRY("cloudflare/gated"),
            prerender: false,
          });
          injectRoute({
            pattern: "/_os/auth/callback",
            entrypoint: ENTRY("cloudflare/auth-callback"),
            prerender: false,
          });
          injectRoute({
            pattern: "/_os/auth/password",
            entrypoint: ENTRY("cloudflare/password"),
            prerender: false,
          });
          for (const page of gatedPages(doc)) {
            if (page.slug === "members" || page.slug.startsWith("members/")) continue;
            injectRoute({
              pattern: `/${page.slug}`,
              entrypoint: ENTRY("cloudflare/gated"),
              prerender: false,
            });
          }
        }

        updateConfig({
          site: location.site,
          base: location.base,
          build: { format: "directory" },
          vite: {
            plugins: [
              {
                name: "openspace:content",
                resolveId(id: string) {
                  if (id === VIRTUAL_SITE || id === VIRTUAL_MEDIA) return `\0${id}`;
                  return undefined;
                },
                async load(id: string) {
                  if (id === `\0${VIRTUAL_SITE}`) return siteModule();
                  if (id === `\0${VIRTUAL_MEDIA}`)
                    return `export const mediaImports = import.meta.glob("/media/**/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP}", { import: "default" });\n`;
                  return undefined;
                },
                configureServer(server: {
                  watcher: { add(p: string): void; on(e: string, f: (p: string) => void): void };
                  moduleGraph: {
                    getModuleById(id: string): unknown;
                    invalidateModule(m: unknown): void;
                  };
                  ws: { send(p: { type: string }): void };
                }) {
                  server.watcher.add(join(rootDir, "content"));
                  server.watcher.on(
                    "all" as never,
                    ((_event: string, file: string) => {
                      if (!file.startsWith(join(rootDir, "content"))) return;
                      const mod = server.moduleGraph.getModuleById(`\0${VIRTUAL_SITE}`);
                      if (mod) server.moduleGraph.invalidateModule(mod);
                      server.ws.send({ type: "full-reload" });
                    }) as never,
                  );
                },
              },
            ],
            ssr: { noExternal: ["@openspace/site-kit"] },
          },
        });
      },

      "astro:build:done": async ({ dir, logger }) => {
        if (!location) return;
        const outDir = fileURLToPath(dir);
        const doc = await loadSiteDocument(rootDir);
        const plan = planSite(doc, { now });
        const result = await writeSiteOutputs({
          outDir,
          rootDir,
          plan,
          location,
          ogImages: options.ogImages ?? true,
          search,
          cloudflare,
          ...(options.podcast ? { podcast: options.podcast } : {}),
          log: (m) => logger.info(m),
        });
        for (const w of result.warnings) logger.warn(w);
        logger.info(
          `${plan.routes.length} pages, behaviors: ${result.behaviors.join(", ") || "none"}, ${result.files.length} extra files`,
        );
      },
    },
  };
}
