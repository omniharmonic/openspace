/**
 * Self-hosted web fonts (no third-party font requests on published sites): when the site has
 * the pairing's Fontsource packages installed, their CSS and font files are copied into
 * `_os/fonts/` and linked. Otherwise a build downloads the pairing from Google Fonts once and
 * self-hosts those files the same way (no render-blocking cross-origin stylesheet). Only if
 * that fails (offline builds, `OPENSPACE_GOOGLE_FONTS=link`) do pages link Google Fonts.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { compiledStylesFor } from "@openspace/renderer";
import type { SiteDocument } from "@openspace/schema";
import { fontsourceCss, fontsourcePackages, googleFontsUrl } from "@openspace/theme";
import { contentHash } from "../ids";

export interface FontPlan {
  /** Concatenated CSS (urls rewritten) and the font files it needs (a path, or downloaded bytes). */
  css: string;
  files: { from?: string; data?: Uint8Array; name: string }[];
  /** Output path (under the build dir) of the CSS. */
  cssFile: string;
}

export interface FontResolution {
  plan?: FontPlan;
  /** Fontsource packages not installed in the site (when `plan` is undefined). */
  missing: string[];
}

export interface ResolveFontsOptions {
  /**
   * Download from Google Fonts when Fontsource packages are missing (default: on, unless
   * `OPENSPACE_GOOGLE_FONTS=link`). Dev servers pass false and keep the Google link.
   */
  google?: boolean;
  fetch?: typeof fetch;
}

export async function resolveFonts(
  rootDir: string,
  doc: SiteDocument,
  basePath: string,
  options: ResolveFontsOptions = {},
): Promise<FontResolution> {
  const pairing = compiledStylesFor(doc.styles).tokens.pairing;
  const viaGoogle = async (missing: string[]): Promise<FontResolution> => {
    const google = options.google ?? process.env.OPENSPACE_GOOGLE_FONTS !== "link";
    if (!google) return { missing };
    const plan = await googleFontPlan(googleFontsUrl(pairing), basePath, options.fetch);
    return plan ? { missing: [], plan } : { missing };
  };
  const require = createRequire(join(rootDir, "package.json"));
  const missing: string[] = [];
  for (const pkg of fontsourcePackages(pairing)) {
    try {
      require.resolve(`${pkg}/package.json`);
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length) return viaGoogle(missing);
  const files = new Map<string, string>();
  const parts: string[] = [];
  for (const spec of fontsourceCss(pairing)) {
    let path: string;
    try {
      path = require.resolve(spec);
    } catch {
      return viaGoogle([spec]);
    }
    const css = await readFile(path, "utf8");
    const dir = dirname(path);
    parts.push(
      css.replace(/url\((['"]?)\.\/files\/([^'")]+)\1\)/g, (_m, _q, file: string) => {
        files.set(file, join(dir, "files", file));
        return `url(${basePath}/_os/fonts/${file})`;
      }),
    );
  }
  const css = parts.join("\n");
  return {
    missing: [],
    plan: {
      css,
      files: [...files].map(([name, from]) => ({ name, from })),
      cssFile: `_os/fonts/fonts.${contentHash(css, 10)}.css`,
    },
  };
}

/** A browser user agent, so Google Fonts answers with WOFF2 and unicode-range subsets. */
const MODERN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const GSTATIC = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+?\.woff2)\)/g;
const googleCache = new Map<string, Promise<FontPlan | null>>();

/**
 * Download a Google Fonts stylesheet and its WOFF2 files (memoised per build process, so the
 * config hook and the post-build step share one download). Null when anything fails.
 */
export function googleFontPlan(
  cssUrl: string,
  basePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FontPlan | null> {
  const key = `${basePath}|${cssUrl}`;
  let hit = googleCache.get(key);
  if (!hit) {
    hit = downloadGoogleFonts(cssUrl, basePath, fetchImpl).catch(() => null);
    googleCache.set(key, hit);
  }
  return hit;
}

async function downloadGoogleFonts(
  cssUrl: string,
  basePath: string,
  fetchImpl: typeof fetch,
): Promise<FontPlan | null> {
  // Two tries per request: one slow file shouldn't send every page back to Google Fonts.
  const get = async (url: string): Promise<Response> => {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetchImpl(url, {
          headers: { "user-agent": MODERN_UA },
          signal: AbortSignal.timeout(20_000),
        });
        if (r.ok || r.status < 500) return r;
        last = new Error(`HTTP ${r.status}`);
      } catch (err) {
        last = err;
      }
    }
    throw last;
  };
  const res = await get(cssUrl);
  if (!res.ok) return null;
  const source = await res.text();
  const urls = [...new Set([...source.matchAll(GSTATIC)].map((m) => m[1] as string))];
  if (!urls.length) return null;
  const files = await Promise.all(
    urls.map(async (url) => {
      const r = await get(url);
      if (!r.ok) throw new Error(`font download failed: ${url}`);
      const data = new Uint8Array(await r.arrayBuffer());
      return { url, data, name: `${contentHash(url, 12)}.woff2` };
    }),
  );
  const byUrl = new Map(files.map((f) => [f.url, f.name]));
  const css = source.replace(
    GSTATIC,
    (_m, url: string) => `url(${basePath}/_os/fonts/${byUrl.get(url)})`,
  );
  return {
    css,
    files: files.map(({ name, data }) => ({ name, data })),
    cssFile: `_os/fonts/fonts.${contentHash(css, 10)}.css`,
  };
}

/**
 * Font files worth preloading: the Latin, upright file of each family (at most two), so text
 * renders in its real font from the first paint instead of swapping in later (layout shift).
 */
export function fontPreloads(css: string, max = 2): string[] {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = m[1] ?? "";
    const family = /font-family:\s*['"]?([^;'"]+)/.exec(body)?.[1];
    const url = /url\(([^)]+\.woff2)\)/.exec(body)?.[1];
    if (!family || !url || out.has(family)) continue;
    if (!/font-style:\s*normal/.test(body)) continue;
    // Latin subset: covers U+0000-00FF (Google), or a Fontsource "-latin-" file.
    if (!/U\+0000-00FF/i.test(body) && !/-latin-\d+-normal\.woff2$/.test(url)) continue;
    out.set(family, url);
    if (out.size >= max) break;
  }
  return [...out.values()];
}

export async function writeFonts(plan: FontPlan, outDir: string): Promise<void> {
  const dir = join(outDir, "_os", "fonts");
  await mkdir(dir, { recursive: true });
  await Promise.all(
    plan.files.map((f) =>
      f.data
        ? writeFile(join(dir, basename(f.name)), f.data)
        : copyFile(f.from as string, join(dir, basename(f.name))),
    ),
  );
  await writeFile(join(outDir, plan.cssFile), plan.css);
}
