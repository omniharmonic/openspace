/**
 * The OpenSpace starter: the thin Astro shell every site repository gets (arch §2.1). The Hub
 * and CLI copy `site/` into a new repository together with a template's content, add
 * `AGENTS.md` (`generateAgentsMd` from site-kit) and, for the Cloudflare target, overlay
 * `variants/cloudflare/`.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "@omniharmonic/openspace-template-starter";

export const STARTER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SITE_DIR = join(STARTER_DIR, "site");
export const VARIANTS = { cloudflare: join(STARTER_DIR, "variants", "cloudflare") } as const;
export type StarterVariant = "github-pages" | keyof typeof VARIANTS;

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs, base)));
    else if (e.name !== ".gitkeep") out.push(relative(base, abs).split(sep).join("/"));
  }
  return out.sort();
}

/** The shell's files (repo path → contents) for a deploy target. */
export async function starterFiles(
  variant: StarterVariant = "github-pages",
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const rel of await walk(SITE_DIR)) files[rel] = await readFile(join(SITE_DIR, rel), "utf8");
  if (variant !== "github-pages") {
    const dir = VARIANTS[variant];
    for (const rel of await walk(dir)) files[rel] = await readFile(join(dir, rel), "utf8");
  }
  return files;
}
