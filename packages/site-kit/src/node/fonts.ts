/**
 * Self-hosted web fonts (no third-party font requests on published sites): when the site has
 * the pairing's Fontsource packages installed, their CSS and font files are copied into
 * `_os/fonts/` and linked. If any family is missing the renderer's Google Fonts link is used
 * instead (and a warning names the packages to add).
 */

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { compiledStylesFor } from "@openspace/renderer";
import type { SiteDocument } from "@openspace/schema";
import { fontsourceCss, fontsourcePackages } from "@openspace/theme";
import { contentHash } from "../ids";

export interface FontPlan {
  /** Concatenated CSS (urls rewritten) and the font files it needs. */
  css: string;
  files: { from: string; name: string }[];
  /** Output path (under the build dir) of the CSS. */
  cssFile: string;
}

export interface FontResolution {
  plan?: FontPlan;
  /** Fontsource packages not installed in the site (when `plan` is undefined). */
  missing: string[];
}

export async function resolveFonts(
  rootDir: string,
  doc: SiteDocument,
  basePath: string,
): Promise<FontResolution> {
  const pairing = compiledStylesFor(doc.styles).tokens.pairing;
  const require = createRequire(join(rootDir, "package.json"));
  const missing: string[] = [];
  for (const pkg of fontsourcePackages(pairing)) {
    try {
      require.resolve(`${pkg}/package.json`);
    } catch {
      missing.push(pkg);
    }
  }
  if (missing.length) return { missing };
  const files = new Map<string, string>();
  const parts: string[] = [];
  for (const spec of fontsourceCss(pairing)) {
    let path: string;
    try {
      path = require.resolve(spec);
    } catch {
      return { missing: [spec] };
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

export async function writeFonts(plan: FontPlan, outDir: string): Promise<void> {
  const dir = join(outDir, "_os", "fonts");
  await mkdir(dir, { recursive: true });
  await Promise.all(plan.files.map((f) => copyFile(f.from, join(dir, basename(f.name)))));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(outDir, plan.cssFile), plan.css);
}
