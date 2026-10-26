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
import { compiledStylesFor, type SocialFeedPost } from "@openspace/renderer";
import type { AstroIntegration } from "astro";
import { loadSiteDocument } from "./content/index";
import { type DeployLocation, deployLocation } from "./deploy";
import { ENTRYPOINTS, type EntrypointName } from "./entrypoints";
import type { PodcastOptions } from "./feeds";
import { fontPreloads, resolveFonts } from "./node/fonts";
import { writeSiteOutputs } from "./node/postbuild";
import { siteStylesheets } from "./render";
import { gatedPages, planSite, withoutGatedContent } from "./routes";
import type { RuntimeOptions } from "./runtime-options";

export interface OpenSpaceOptions {
  /**
   * Turnstile site key (public). Defaults to `OPENSPACE_TURNSTILE_SITE_KEY`, then
   * `integrations.turnstileSiteKey` in openspace.json. Forms then load Turnstile.
   */
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
  socialFeeds?:
    | Record<string, SocialFeedPost[]>
    | (() => Promise<Record<string, SocialFeedPost[]>>);
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
const ENTRY = (p: EntrypointName) => ENTRYPOINTS[p];

export function openspace(options: OpenSpaceOptions = {}): AstroIntegration {
  let rootDir = process.cwd();
  let location: DeployLocation | undefined;
  let runtime: RuntimeOptions | undefined;
  let cloudflare = false;
  let search = false;
  let now = new Date();

  let building = false;
  const siteModule = async () => {
    const loaded = await loadSiteDocument(rootDir);
    // The Worker bundle never carries gated page content: deployed Workers read it from R2.
    const doc = building ? withoutGatedContent(loaded) : loaded;
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
        building = command === "build";
        const fixedNow = options.now ?? process.env.OPENSPACE_BUILD_TIME;
        now = fixedNow ? new Date(fixedNow) : new Date();
        const doc = await loadSiteDocument(rootDir);
        location = deployLocation(doc.config);
        cloudflare = doc.config.deploy.target === "cloudflare";
        search = options.search ?? doc.config.features.search;
        // Builds self-host the fonts: Fontsource packages, else (publish workflows set
        // OPENSPACE_GOOGLE_FONTS=download) a one-time Google download. Dev never downloads.
        const fonts = await resolveFonts(rootDir, doc, location.basePath, {
          google: command === "build" && process.env.OPENSPACE_GOOGLE_FONTS === "download",
        });
        if (!fonts.plan && command === "build")
          logger.info(
            fonts.reason
              ? `fonts load from Google Fonts: the download failed (${fonts.reason})`
              : `fonts load from Google Fonts; install ${fonts.missing.join(", ")} or set OPENSPACE_GOOGLE_FONTS=download to self-host them`,
          );
        const pairing = compiledStylesFor(doc.styles).tokens.pairing;
        // Option, then the repository variable the Hub sets, then the key in openspace.json.
        const turnstileSiteKey =
          options.turnstileSiteKey ||
          process.env.OPENSPACE_TURNSTILE_SITE_KEY ||
          doc.config.integrations?.turnstileSiteKey;
        runtime = {
          now: now.toISOString(),
          location,
          assets: siteStylesheets(doc, location.basePath).hrefs,
          fontStylesheets: fonts.plan ? [`${location.basePath}/${fonts.plan.cssFile}`] : undefined,
          fontPreloads: fonts.plan
            ? fontPreloads(fonts.plan.css, [
                { family: pairing.heading.family, weight: pairing.headingWeight },
                { family: pairing.body.family, weight: pairing.bodyWeight },
              ])
            : undefined,
          hubUrl: options.hubUrl,
          turnstileSiteKey: turnstileSiteKey || undefined,
          ogImages: options.ogImages ?? true,
          dev: command === "dev",
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
          // Build-time image map for Worker-rendered (gated) pages.
          injectRoute({
            pattern: "/_os/images.json",
            entrypoint: ENTRY("images-manifest"),
            prerender: true,
          });
          for (const page of gatedPages(doc)) {
            if (page.slug === "")
              throw new Error(
                "The home page can't be members-only or password-protected; gate another page instead.",
              );
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
            // The route imports virtual modules; OpenSpace packages are always bundled (workspace
            // checkouts ship TypeScript sources).
            ssr: { noExternal: [/^@openspace\//] },
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
