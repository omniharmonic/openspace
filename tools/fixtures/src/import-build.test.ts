/**
 * End-to-end: import the recorded fixtures (Juniper Ceramics on Squarespace, Fernhill Bakery on
 * WordPress, Tidewater Studio as any HTML site), assemble each with the starter shell and run a real
 * `astro build` — an imported site must build like any other.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { importSite, importSquarespace, writeImport } from "@omniharmonic/openspace-import";
import {
  FERNHILL_EXPORT,
  FERNHILL_URL,
  fernhillFetch,
  JUNIPER_URL,
  juniperFetch,
  TIDEWATER_URL,
  tidewaterFetch,
} from "@omniharmonic/openspace-import/testing";
import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..");
const STARTER = join(FIXTURES, "..", "..", "templates", "starter", "site");

async function files(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(abs, base)));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out.sort();
}

describe("astro build of an imported Squarespace site", () => {
  let out = "";
  let all: string[] = [];

  beforeAll(async () => {
    const root = join(FIXTURES, ".build", "juniper-import");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const result = await importSquarespace({
      url: JUNIPER_URL,
      fetch: juniperFetch(),
      delayMs: 0,
      now: new Date("2026-10-27T12:00:00Z"),
      config: {
        siteId: "st_jvn1per000",
        schemaVersion: 1,
        template: { id: "starter", version: "1.0.0" },
        hub: "https://hub.openspace.dev",
        deploy: {
          target: "github-pages",
          url: "https://juniperceramics.example",
          customDomain: "juniperceramics.example",
        },
        features: { forms: true, newsletter: false, analytics: false, search: true },
      },
    });
    await writeImport(root, result);
    await cp(join(STARTER, "astro.config.mjs"), join(root, "astro.config.mjs"));
    await cp(join(STARTER, "src"), join(root, "src"), { recursive: true });
    out = join(root, "dist");
    await run(process.execPath, [join(FIXTURES, "scripts", "build-site.mjs"), root, out], {
      env: {
        ...process.env,
        OPENSPACE_BUILD_TIME: "2026-10-27T12:00:00Z",
        ASTRO_TELEMETRY_DISABLED: "1",
        OPENSPACE_GOOGLE_FONTS: "link",
      },
      maxBuffer: 64 * 1024 * 1024,
    });
    all = await files(out);
  }, 240_000);

  it("emits every imported page, collection list and item", () => {
    for (const f of [
      "index.html",
      "about-us/index.html",
      "workshops/index.html",
      "contact/index.html",
      "journal/index.html",
      "journal/first-firing-of-spring/index.html",
      "journal/glaze-notes/index.html",
      "shop/speckled-mug/index.html",
      "events/open-studio-day/index.html",
    ])
      expect(all, f).toContain(f);
  });

  it("writes redirects for the old Squarespace addresses", async () => {
    expect(await readFile(join(out, "home/index.html"), "utf8")).toContain('url=/"');
    expect(await readFile(join(out, "shop/p/speckled-mug/index.html"), "utf8")).toContain(
      'url=/shop/speckled-mug/"',
    );
    expect(all).toContain("journal/2025/3/14/first-firing-of-spring/index.html");
  });

  it("renders the imported content with the site's design tokens", async () => {
    const home = await readFile(join(out, "index.html"), "utf8");
    expect(home).toContain("Stoneware made slowly, by hand");
    expect(home).toContain("Book a class");
    expect(home).toContain("Kiln notes, monthly");
    expect(home).toMatch(/Fraunces/);
    expect(home).not.toMatch(/squarespace-cdn\.com/);
    const post = await readFile(join(out, "journal/first-firing-of-spring/index.html"), "utf8");
    expect(post).toContain("What we changed");
    expect(post).toMatch(/href="\/journal\/glaze-notes\/?"/);
  });
});

/** Import with `importSite`, assemble with the starter shell and build. */
async function buildImport(
  name: string,
  opts: Omit<Parameters<typeof importSite>[0], "config">,
): Promise<{ out: string; all: string[] }> {
  const root = join(FIXTURES, ".build", name);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const result = await importSite({
    ...opts,
    delayMs: 0,
    now: new Date("2026-10-27T12:00:00Z"),
    config: {
      siteId: "st_jvn1per000",
      schemaVersion: 1,
      template: { id: "starter", version: "1.0.0" },
      hub: "https://hub.openspace.dev",
      deploy: { target: "github-pages", url: `https://${name}.example`, customDomain: null },
      features: { forms: true, newsletter: false, analytics: false, search: true },
    },
  });
  await writeImport(root, result);
  await cp(join(STARTER, "astro.config.mjs"), join(root, "astro.config.mjs"));
  await cp(join(STARTER, "src"), join(root, "src"), { recursive: true });
  const out = join(root, "dist");
  await run(process.execPath, [join(FIXTURES, "scripts", "build-site.mjs"), root, out], {
    env: {
      ...process.env,
      OPENSPACE_BUILD_TIME: "2026-10-27T12:00:00Z",
      ASTRO_TELEMETRY_DISABLED: "1",
      OPENSPACE_GOOGLE_FONTS: "link",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { out, all: await files(out) };
}

describe("astro build of an imported WordPress site", () => {
  let b: { out: string; all: string[] };
  beforeAll(async () => {
    b = await buildImport("fernhill-import", {
      url: FERNHILL_URL,
      fetch: fernhillFetch(),
      wxr: await readFile(FERNHILL_EXPORT, "utf8"),
    });
  }, 240_000);

  it("emits pages, the journal and permalink/archive redirects", async () => {
    for (const f of [
      "index.html",
      "about/index.html",
      "about/team/index.html",
      "classes/index.html",
      "contact/index.html",
      "news/index.html",
      "news/our-first-loaf/index.html",
      "2025/03/our-first-loaf/index.html",
      "category/baking/index.html",
    ])
      expect(b.all, f).toContain(f);
    expect(b.all).not.toContain("news/winter-menu/index.html");
    const home = await readFile(join(b.out, "index.html"), "utf8");
    expect(home).toContain("Slow bread from a small oven");
    expect(home).toMatch(/Playfair\+Display/);
    expect(home).not.toMatch(/wp-content\/uploads/);
  });
});

describe("astro build of an imported Webflow-style site (generic importer)", () => {
  let b: { out: string; all: string[] };
  beforeAll(async () => {
    b = await buildImport("tidewater-import", { url: TIDEWATER_URL, fetch: tidewaterFetch() });
  }, 240_000);

  it("emits every page and post with the recreated sections", async () => {
    for (const f of [
      "index.html",
      "about/index.html",
      "services/index.html",
      "services/brand-identity/index.html",
      "contact/index.html",
      "journal/index.html",
      "journal/tide-tables/index.html",
    ])
      expect(b.all, f).toContain(f);
    const home = await readFile(join(b.out, "index.html"), "utf8");
    expect(home).toContain("Design for businesses by the sea");
    expect(home).toContain("Morwenna Pascoe");
    expect(home).not.toMatch(/website-files\.com/);
  });
});
