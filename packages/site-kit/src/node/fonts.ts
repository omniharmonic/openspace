/**
 * Self-hosted web fonts (no third-party font requests on published sites): when the site has
 * the pairing's Fontsource packages installed, their CSS and font files are copied into
 * `_os/fonts/` and linked. Publishing builds (`OPENSPACE_GOOGLE_FONTS=download`, set in the
 * starter's publish workflow) download the pairing from Google Fonts once and self-host those
 * files the same way (no render-blocking cross-origin stylesheet). Otherwise — local builds,
 * tests, or a failed download — pages link Google Fonts.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { compiledStylesFor } from "@omniharmonic/openspace-renderer";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { fontsourceCss, fontsourcePackages, googleFontsUrl } from "@omniharmonic/openspace-theme";
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
  /** Why the Google Fonts download failed, when it was tried. */
  reason?: string;
}

export interface ResolveFontsOptions {
  /**
   * Download from Google Fonts when Fontsource packages are missing. Default: only when
   * `OPENSPACE_GOOGLE_FONTS=download` (publish workflows), so tests and local builds never
   * depend on the network.
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
    const google = options.google ?? process.env.OPENSPACE_GOOGLE_FONTS === "download";
    if (!google) return { missing };
    const families = [...new Set([pairing.heading.family, pairing.body.family])];
    const r = await googleFonts(googleFontsUrl(pairing), basePath, families, options.fetch);
    return r.plan
      ? { missing: [], plan: r.plan }
      : { missing, ...(r.reason ? { reason: r.reason } : {}) };
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
  // Each Fontsource package ships its family's license: it travels with the font files as
  // LICENSE-<family>.txt.
  const fileList: FontPlan["files"] = [...files].map(([name, from]) => ({ name, from }));
  for (const pkg of fontsourcePackages(pairing)) {
    const dir = dirname(require.resolve(`${pkg}/package.json`));
    const text = await readFile(join(dir, "LICENSE"), "utf8").catch(() => null);
    if (text)
      fileList.push({
        name: `LICENSE-${pkg.replace(/^@fontsource\//, "")}.txt`,
        data: new TextEncoder().encode(`${text.trim()}\n`),
      });
  }
  return {
    missing: [],
    plan: {
      css,
      files: fileList,
      cssFile: `_os/fonts/fonts.${contentHash(css, 10)}.css`,
    },
  };
}

/** A browser user agent, so Google Fonts answers with WOFF2 and unicode-range subsets. */
const MODERN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const GSTATIC = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+?\.woff2)\)/g;

export interface GoogleFontsResult {
  plan?: FontPlan;
  /** Why the download didn't happen (logged by the build). */
  reason?: string;
}
const googleCache = new Map<string, Promise<GoogleFontsResult>>();

/**
 * Download a Google Fonts stylesheet, its WOFF2 files and each family's license (memoised per
 * build process, so the config hook and the post-build step share one download).
 */
export function googleFonts(
  cssUrl: string,
  basePath: string,
  families: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleFontsResult> {
  const key = `${basePath}|${cssUrl}`;
  let hit = googleCache.get(key);
  if (!hit) {
    hit = downloadGoogleFonts(cssUrl, basePath, families, fetchImpl).catch((err: unknown) => ({
      reason: err instanceof Error ? err.message : String(err),
    }));
    googleCache.set(key, hit);
  }
  return hit;
}

/** {@link googleFonts}, plan only (null when the download failed). */
export async function googleFontPlan(
  cssUrl: string,
  basePath: string,
  fetchImpl: typeof fetch = fetch,
  families: string[] = [],
): Promise<FontPlan | null> {
  return (await googleFonts(cssUrl, basePath, families, fetchImpl)).plan ?? null;
}

/** Where google/fonts keeps a family's license, by license type. */
const LICENSE_PATHS = ["ofl/{id}/OFL.txt", "apache/{id}/LICENSE.txt", "ufl/{id}/UFL.txt"];

async function downloadGoogleFonts(
  cssUrl: string,
  basePath: string,
  families: string[],
  fetchImpl: typeof fetch,
): Promise<GoogleFontsResult> {
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
        last = new Error(`HTTP ${r.status} from ${url}`);
      } catch (err) {
        last = new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw last;
  };
  const res = await get(cssUrl);
  if (!res.ok) return { reason: `Google Fonts answered HTTP ${res.status}` };
  const source = await res.text();
  const urls = [...new Set([...source.matchAll(GSTATIC)].map((m) => m[1] as string))];
  if (!urls.length) return { reason: "the Google Fonts stylesheet listed no WOFF2 files" };
  const files = await Promise.all(
    urls.map(async (url) => {
      const r = await get(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      const data = new Uint8Array(await r.arrayBuffer());
      return { url, data, name: `${contentHash(url, 12)}.woff2` };
    }),
  );
  const byUrl = new Map(files.map((f) => [f.url, f.name]));
  const css = source.replace(
    GSTATIC,
    (_m, url: string) => `url(${basePath}/_os/fonts/${byUrl.get(url)})`,
  );
  // The fonts' licenses travel with them (SIL OFL 1.1 requires it for redistribution): one
  // file per family, LICENSE-<family>.txt, with that family's own license text (OFL, Apache or
  // UFL, as google/fonts publishes it).
  const licenses = await Promise.all(
    families.map(async (family) => {
      const id = family.toLowerCase().replace(/[^a-z0-9]/g, "");
      const name = `LICENSE-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
      for (const path of LICENSE_PATHS) {
        const url = `https://raw.githubusercontent.com/google/fonts/main/${path.replace("{id}", id)}`;
        try {
          const r = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
          if (r.ok) return { name, text: `${(await r.text()).trim()}\n` };
        } catch {
          // try the next license kind
        }
      }
      const page = `https://fonts.google.com/specimen/${family.replace(/ /g, "+")}/license`;
      return { name, text: `${family}: see ${page}\n` };
    }),
  );
  const out: FontPlan["files"] = files.map(({ name, data }) => ({ name, data }));
  for (const l of licenses) out.push({ name: l.name, data: new TextEncoder().encode(l.text) });
  return {
    plan: { css, files: out, cssFile: `_os/fonts/fonts.${contentHash(css, 10)}.css` },
  };
}

export interface FontUse {
  family: string;
  weight: number;
}

/**
 * Font files worth preloading: the Latin, upright file for each weight the page actually uses
 * first (heading and body), so text renders in its real font from the first paint instead of
 * swapping in later (layout shift). Without `uses`, the first Latin upright file per family.
 */
export function fontPreloads(css: string, uses?: FontUse[], max = 2): string[] {
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const body = m[1] ?? "";
    return {
      family: /font-family:\s*['"]?([^;'"]+)/.exec(body)?.[1]?.trim(),
      weight: /font-weight:\s*(\d+)(?:\s+(\d+))?/.exec(body),
      url: /url\(([^)]+\.woff2)\)/.exec(body)?.[1],
      upright: /font-style:\s*normal/.test(body),
      // Latin subset: covers U+0000-00FF (Google), or a Fontsource "-latin-" file.
      latin: /U\+0000-00FF/i.test(body) || /-latin-[\w-]*normal\.woff2/.test(body),
    };
  });
  const usable = faces.filter((f) => f.family && f.url && f.upright && f.latin);
  const covers = (f: (typeof usable)[number], w: number) => {
    if (!f.weight) return true;
    const lo = Number(f.weight[1]);
    const hi = f.weight[2] ? Number(f.weight[2]) : lo;
    return w >= lo && w <= hi;
  };
  const out: string[] = [];
  const add = (url: string | undefined) => {
    if (url && !out.includes(url) && out.length < max) out.push(url);
  };
  if (uses?.length)
    for (const u of uses)
      add(usable.find((f) => f.family === u.family && covers(f, u.weight))?.url);
  else {
    const seen = new Set<string>();
    for (const f of usable)
      if (!seen.has(f.family as string)) {
        seen.add(f.family as string);
        add(f.url);
      }
  }
  return out;
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
