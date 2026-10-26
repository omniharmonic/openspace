/**
 * Social share images (PRD §5.4 "auto social share images"): Satori lays out an SVG from the
 * page title and site style, resvg rasterises it. Files are named by a content hash of their
 * inputs and cached between builds (`node_modules/.astro/openspace/og`, inside the Actions
 * cache path), so unchanged pages cost nothing.
 */

import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import type { OgSpec } from "../render";
import { OG_HEIGHT, OG_WIDTH } from "../render";

export interface OgFont {
  name: string;
  data: ArrayBuffer | Buffer;
  weight: 400 | 700;
  style: "normal";
}

const req = createRequire(import.meta.url);

function fontsourceFile(resolveFrom: string, id: string, weight: number): string | undefined {
  try {
    const r = createRequire(join(resolveFrom, "package.json"));
    const pkg = r.resolve(`@fontsource/${id}/package.json`);
    return join(dirname(pkg), "files", `${id}-latin-${weight}-normal.woff`);
  } catch {
    return undefined;
  }
}

async function readIfExists(path: string | undefined): Promise<Buffer | undefined> {
  if (!path) return undefined;
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

/**
 * Fonts for share images: the pairing's heading family when its Fontsource package is
 * installed in the site, else Hanken Grotesk (bundled with site-kit). Satori needs WOFF/TTF.
 */
export async function loadOgFonts(rootDir: string, headingFamily: string): Promise<OgFont[]> {
  const id = headingFamily
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fallbackDir = dirname(req.resolve("@fontsource/hanken-grotesk/package.json"));
  const fallback = (w: number) =>
    join(fallbackDir, "files", `hanken-grotesk-latin-${w}-normal.woff`);
  const heading =
    (await readIfExists(fontsourceFile(rootDir, id, 700))) ??
    (await readIfExists(fontsourceFile(rootDir, id, 600)));
  const body400 = await readIfExists(fallback(400));
  const body700 = await readIfExists(fallback(700));
  const fonts: OgFont[] = [];
  if (heading) fonts.push({ name: "Heading", data: heading, weight: 700, style: "normal" });
  else if (body700) fonts.push({ name: "Heading", data: body700, weight: 700, style: "normal" });
  if (body400) fonts.push({ name: "Body", data: body400, weight: 400, style: "normal" });
  return fonts;
}

type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): El => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }) },
});

/** The share image layout: site name, a large title, an accent rule. */
export function ogElement(spec: OgSpec): El {
  const len = spec.title.length;
  const size = len > 80 ? 52 : len > 50 ? 64 : 76;
  return h(
    "div",
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "72px 80px",
      backgroundColor: spec.colors.background,
      color: spec.colors.text,
      fontFamily: "Body",
    },
    [
      h("div", { display: "flex", alignItems: "center", gap: 18 }, [
        h("div", { width: 18, height: 18, borderRadius: 9, backgroundColor: spec.colors.accent }),
        h("div", { fontSize: 30, color: spec.colors.muted }, spec.siteTitle),
      ]),
      h(
        "div",
        {
          display: "flex",
          fontFamily: "Heading",
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.08,
          letterSpacing: -1,
        },
        spec.title,
      ),
      h("div", { width: 120, height: 8, borderRadius: 4, backgroundColor: spec.colors.accent }),
    ],
  );
}

export async function renderOgPng(spec: OgSpec, fonts: OgFont[]): Promise<Uint8Array> {
  const svg = await satori(ogElement(spec) as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: fonts.map((f) => ({ ...f, data: f.data as ArrayBuffer })),
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng();
}

export interface OgResult {
  generated: number;
  cached: number;
}

/** Write each spec's PNG to `outDir/_os/og/<hash>.png`, reusing the cache when possible. */
export async function writeOgImages(
  specs: OgSpec[],
  opts: { outDir: string; cacheDir: string; rootDir: string },
): Promise<OgResult> {
  const unique = new Map(specs.map((s) => [s.hash, s]));
  if (!unique.size) return { generated: 0, cached: 0 };
  await mkdir(join(opts.outDir, "_os", "og"), { recursive: true });
  await mkdir(opts.cacheDir, { recursive: true });
  let fonts: OgFont[] | undefined;
  const result: OgResult = { generated: 0, cached: 0 };
  for (const spec of unique.values()) {
    const cached = join(opts.cacheDir, `${spec.hash}.png`);
    const out = join(opts.outDir, "_os", "og", `${spec.hash}.png`);
    const hit = await stat(cached).then(
      (s) => s.size > 0,
      () => false,
    );
    if (hit) {
      await copyFile(cached, out);
      result.cached++;
      continue;
    }
    fonts ??= await loadOgFonts(opts.rootDir, spec.heading);
    const png = await renderOgPng(spec, fonts);
    await writeFile(cached, png);
    await writeFile(out, png);
    result.generated++;
  }
  return result;
}
