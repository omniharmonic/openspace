/**
 * Real build: openspace.dev goes through site-kit's Astro integration exactly like any site
 * (programmatic `astro build`, which works on Node 22 versions the astro CLI refuses).
 */
import { execFile } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { templateSpecs } from "@omniharmonic/openspace-templates";
import { beforeAll, describe, expect, it } from "vitest";
import { WWW_ROOT } from "./site/generate";

const run = promisify(execFile);
const OUT = join(WWW_ROOT, ".build", "dist");

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(abs)));
    else out.push(relative(OUT, abs).split(sep).join("/"));
  }
  return out.sort();
}
const html = (rel: string) => readFile(join(OUT, rel), "utf8");

describe("openspace.dev build", () => {
  let all: string[] = [];
  beforeAll(async () => {
    await rm(OUT, { recursive: true, force: true });
    await run(process.execPath, [join(WWW_ROOT, "scripts", "build.mjs"), WWW_ROOT, OUT], {
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        OPENSPACE_BUILD_TIME: "2026-10-26T12:00:00Z",
        // Hermetic: link Google Fonts instead of downloading them.
        OPENSPACE_GOOGLE_FONTS: "link",
      },
      maxBuffer: 64 * 1024 * 1024,
    });
    all = await files(OUT);
  }, 240_000);

  it("emits static HTML for every page, plus 404, sitemap and robots", () => {
    for (const f of [
      "index.html",
      "templates/index.html",
      "pricing/index.html",
      "about/index.html",
      "404.html",
      "sitemap.xml",
      "robots.txt",
    ])
      expect(all).toContain(f);
  });

  it("renders the home page value proposition with the Studio call to action", async () => {
    const home = await html("index.html");
    expect(home).toContain("Beautiful websites you actually own");
    expect(home).toContain("Make your site — free");
    expect(home).toContain('href="https://studio.openspace.dev/templates"');
    expect(home).toContain('href="https://docs.openspace.dev"');
    expect(home).toContain('<link rel="canonical" href="https://openspace.dev/"');
  });

  it("renders the gallery with every template, optimised screenshots and sized images", async () => {
    const page = await html("templates/index.html");
    for (const s of templateSpecs) {
      expect(page).toContain(`>${s.name}<`);
      expect(page).toContain(`https://studio.openspace.dev/new/${s.id}`);
    }
    const imgs = page.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThanOrEqual(12);
    for (const img of imgs) {
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
    expect(page).toMatch(/type="image\/avif"/);
    expect(all.some((f) => /^_astro\/meadow-looks\..*\.webp$/.test(f))).toBe(true);
  });

  it("states the pricing promise", async () => {
    expect(await html("pricing/index.html")).toContain("Free, forever — by architecture");
  });

  it("ships no React runtime and only small behavior scripts", async () => {
    const js = all.filter((f) => f.endsWith(".js"));
    for (const f of js)
      expect(await readFile(join(OUT, f), "utf8")).not.toMatch(/react-dom|__reactFiber/);
    for (const p of ["index.html", "templates/index.html"])
      expect(await html(p)).not.toMatch(/react/i);
  });
});
