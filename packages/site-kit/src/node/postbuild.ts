/**
 * Everything the static build writes besides pages (runs in `astro:build:done`, or directly
 * from tests/CLI): stylesheets, the behavior modules pages actually use, Turnstile loader,
 * feeds, sitemap, robots.txt, redirects, Hub manifests, share images, raw media files,
 * self-hosted fonts and the Pagefind index.
 */
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { BEHAVIOR_LOADER, BEHAVIORS, behaviorsInHtml } from "@omniharmonic/openspace-renderer";
import {
  BEHAVIOR_ESBUILD,
  behaviorDistPath,
  behaviorSourcePath,
} from "@omniharmonic/openspace-renderer/node";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { build as esbuild } from "esbuild";
import * as pagefind from "pagefind";
import type { DeployLocation } from "../deploy";
import { buildFeeds, type PodcastOptions } from "../feeds";
import {
  CATALOG_MANIFEST_PATH,
  catalogManifest,
  FORMS_MANIFEST_PATH,
  formsManifest,
} from "../manifests";
import { routePage, siteStylesheets, TURNSTILE_LOADER } from "../render";
import type { SitePlan } from "../routes";
import { cloudflareRedirects, redirectFile, redirectHtml, robotsTxt, sitemapXml } from "../seo";
import { resolveFonts, writeFonts } from "./fonts";
import { writeOgImages } from "./og";

export interface PostbuildOptions {
  outDir: string;
  rootDir: string;
  plan: SitePlan;
  location: DeployLocation;
  /** Cache directory (default `<root>/node_modules/.astro/openspace`). */
  cacheDir?: string;
  ogImages?: boolean;
  search?: boolean;
  cloudflare?: boolean;
  podcast?: PodcastOptions;
  log?: (msg: string) => void;
}

export interface PostbuildResult {
  files: string[];
  behaviors: string[];
  og: { generated: number; cached: number };
  warnings: string[];
}

const RASTER = /\.(?:jpe?g|png|webp|avif|gif)$/i;

async function walkFiles(
  dir: string,
  skip: (rel: string) => boolean = () => false,
  base = dir,
): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const abs = join(dir, e.name);
    const rel = relative(base, abs).split(sep).join("/");
    if (skip(rel)) continue;
    if (e.isDirectory()) out.push(...(await walkFiles(abs, skip, base)));
    else out.push(rel);
  }
  return out;
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Media sources that must be published as raw files (not via the image pipeline). */
export function rawMediaSources(plan: SitePlan, feedCollections: string[]): Set<string> {
  const doc: SiteDocument = plan.doc;
  const out = new Set<string>();
  const add = (s: unknown) => {
    if (typeof s === "string" && s.startsWith("media/")) out.add(s);
  };
  add(doc.site.favicon);
  add(doc.site.logo?.src);
  add(doc.site.seo?.image);
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "file") add(o.src);
      if ((o.kind === "video" || o.kind === "audio") && typeof o.src === "string") add(o.src);
      if (typeof o.poster === "string") add(o.poster);
      if (o.poster && typeof o.poster === "object") add((o.poster as { src?: unknown }).src);
      for (const x of Object.values(o)) visit(x);
    }
  };
  visit(doc.pages);
  visit(doc.site.footer);
  for (const [name, items] of Object.entries(plan.items)) {
    for (const item of items) {
      if (item.kind === "podcast") {
        add(item.frontmatter.audio.src);
        add(item.frontmatter.transcript);
      }
      if (feedCollections.includes(name)) add(item.frontmatter.image);
    }
  }
  return out;
}

export async function writeSiteOutputs(opts: PostbuildOptions): Promise<PostbuildResult> {
  const { outDir, rootDir, plan, location } = opts;
  const basePath = location.basePath;
  const log = opts.log ?? (() => {});
  const written: string[] = [];
  const warnings: string[] = [];
  const root = resolve(outDir);
  const put = async (rel: string, contents: string | Uint8Array) => {
    const abs = resolve(root, rel.replace(/^\/+/, ""));
    // Never write outside the build directory (content-controlled paths: redirects, feeds).
    if (abs !== root && !abs.startsWith(`${root}${sep}`))
      throw new Error(`Refusing to write ${rel} outside the build directory`);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, contents);
    written.push(rel.replace(/^\/+/, ""));
  };

  // Stylesheets.
  const sheets = siteStylesheets(plan.doc, basePath);
  for (const [rel, css] of Object.entries(sheets.files)) await put(rel, css);

  // Behaviors used by at least one page (+ the loader), Turnstile loader if any form has a slot.
  const htmlFiles = (
    await walkFiles(outDir, (rel) => rel === "pagefind" || rel === "_astro")
  ).filter((f) => f.endsWith(".html"));
  const used = new Set<string>();
  let turnstile = false;
  for (const rel of htmlFiles) {
    const html = await readFile(join(outDir, rel), "utf8");
    for (const b of behaviorsInHtml(html)) used.add(b);
    if (html.includes(`data-os-behavior="beacon"`)) used.add("beacon");
    if (html.includes("data-os-turnstile=")) turnstile = true;
  }
  // On Cloudflare, Worker-rendered (gated) pages may use any behavior: publish them all.
  if (opts.cloudflare)
    for (const b of BEHAVIORS) if (b !== "beacon" || used.has("beacon")) used.add(b);
  const behaviors = [...used].sort();
  if (behaviors.length) {
    const names = [...behaviors, BEHAVIOR_LOADER] as Parameters<typeof behaviorDistPath>[0][];
    const missing = names.filter((n) => !behaviorDistPath(n));
    // Bundled here (static esbuild import): the config's module runner is closed by build:done.
    const bundled: Record<string, string> = {};
    for (const n of missing) {
      const r = await esbuild({
        ...BEHAVIOR_ESBUILD,
        entryPoints: [behaviorSourcePath(n)],
        minify: true,
      });
      bundled[n] = r.outputFiles?.[0]?.text ?? "";
    }
    for (const n of names) {
      const dist = behaviorDistPath(n);
      await put(`_os/behaviors/${n}.js`, dist ? await readFile(dist) : (bundled[n] ?? ""));
    }
  }
  if (turnstile) await put("_os/turnstile.js", TURNSTILE_LOADER);

  // Feeds.
  const rawUrl = (src: string) =>
    /^https?:\/\//.test(src) ? src : new URL(src.replace(/^\/+/, ""), location.siteUrl).toString();
  const feeds = buildFeeds(plan, { siteUrl: location.siteUrl, mediaUrl: rawUrl }, opts.podcast);
  for (const f of feeds) await put(f.path, f.contents);

  // Sitemap, robots (the owner's public/robots.txt wins).
  await put("sitemap.xml", sitemapXml(plan, location.siteUrl));
  if (!(await exists(join(rootDir, "public", "robots.txt"))))
    await put("robots.txt", robotsTxt(plan.doc, location.siteUrl));

  // Redirects: static HTML pages (+ `_redirects` for real 301s on Cloudflare).
  const redirects = plan.doc.site.redirects ?? [];
  const routePaths = new Set(plan.routes.map((r) => r.path));
  for (const r of redirects) {
    const file = redirectFile(r.from);
    const asPath = `/${file.replace(/index\.html$/, "")}`;
    if (routePaths.has(asPath) || (await exists(join(outDir, file)))) {
      warnings.push(`Redirect from ${r.from} skipped: a page already lives there`);
      continue;
    }
    await put(file, redirectHtml(r, basePath, location.siteUrl));
  }
  if (opts.cloudflare && redirects.length)
    await put("_redirects", cloudflareRedirects(redirects, basePath));

  // Hub manifests.
  await put(FORMS_MANIFEST_PATH, `${JSON.stringify(formsManifest(plan), null, 2)}\n`);
  await put(CATALOG_MANIFEST_PATH, `${JSON.stringify(catalogManifest(plan), null, 2)}\n`);

  // Share images.
  const cacheDir = opts.cacheDir ?? join(rootDir, "node_modules", ".astro", "openspace");
  const specs =
    opts.ogImages === false
      ? []
      : plan.routes
          .map((r) => routePage(plan, r, true).og)
          .filter((s): s is NonNullable<typeof s> => !!s);
  const og = await writeOgImages(specs, { outDir, cacheDir: join(cacheDir, "og"), rootDir });
  if (specs.length) log(`share images: ${og.generated} generated, ${og.cached} cached`);

  // Raw media files (favicon, downloads, audio, feed images, everything non-raster).
  const feedCollections = feeds.map((f) => f.path.split("/")[1] ?? "");
  const raw = rawMediaSources(plan, feedCollections);
  for (const rel of await walkFiles(join(rootDir, "media"))) {
    const src = `media/${rel}`;
    if (RASTER.test(rel) && !raw.has(src)) continue;
    const to = join(outDir, src);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(rootDir, src), to);
    written.push(src);
  }

  // Self-hosted fonts.
  const fonts = await resolveFonts(rootDir, plan.doc, basePath);
  if (fonts.plan) {
    await writeFonts(fonts.plan, outDir);
    written.push(fonts.plan.cssFile);
  }

  // Search index.
  if (opts.search) {
    const { index, errors } = await pagefind.createIndex({});
    if (!index) throw new Error(`Pagefind failed: ${errors.join(", ")}`);
    // Index the site's pages only (not redirects or the 404 page). URLs carry the base path.
    for (const r of plan.routes) {
      if (r.kind === "notFound") continue;
      const file = join(outDir, r.path === "/" ? "index.html" : `${r.path.slice(1)}index.html`);
      if (!(await exists(file))) continue;
      await index.addHTMLFile({
        url: `${basePath}${r.path}`,
        content: await readFile(file, "utf8"),
      });
    }
    await index.writeFiles({ outputPath: join(outDir, "pagefind") });
    await pagefind.close();
    written.push("pagefind/");
  }

  return { files: written, behaviors, og, warnings };
}
