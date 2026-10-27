/**
 * The docs build for real (Starlight through Astro's programmatic API), every page the product
 * promises exists, every internal link resolves, and the docs stay accurate to the code: tool
 * names, templates, the Hub's secrets, and the links the plugin and marketing site point at.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ALL_TOOLS, PROMPTS } from "@omniharmonic/openspace-mcp-tools";
import { templateSpecs } from "@omniharmonic/openspace-templates";
import { beforeAll, describe, expect, it } from "vitest";

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..", "..");
const CONTENT = join(ROOT, "src", "content", "docs");
const OUT = join(ROOT, ".build", "dist");

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs, base)));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out.sort();
}

const REQUIRED = [
  "getting-started",
  "guides/editing",
  "guides/site-styles",
  "guides/pages-and-navigation",
  "guides/media",
  "guides/publishing",
  "guides/domains",
  "guides/migrate-to-openspace",
  "guides/start-with-claude",
  "guides/migrate-from-squarespace",
  "connect-your-ai",
  "connect-your-ai/claude",
  "connect-your-ai/claude-app",
  "connect-your-ai/claude-code",
  "connect-your-ai/tools",
  "grow/forms-and-newsletter",
  "grow/campaigns",
  "grow/members",
  "grow/store",
  "grow/analytics",
  "grow/collaborators",
  "templates",
  "self-hosting",
  "operators/budget-and-abuse",
  "architecture",
  "developers/block-development",
  "developers/cli",
  "contributing/templates",
  "faq",
  "privacy",
];

const source = async (slug: string) => {
  for (const f of [`${slug}.md`, `${slug}.mdx`, `${slug}/index.md`, `${slug}/index.mdx`])
    if (existsSync(join(CONTENT, f))) return readFile(join(CONTENT, f), "utf8");
  throw new Error(`no source for ${slug}`);
};

describe("docs content", () => {
  it("has every page the product needs, each with a title and description", async () => {
    for (const slug of REQUIRED) {
      const text = await source(slug);
      expect(text, slug).toMatch(/^---\ntitle: .+\ndescription: .+/);
    }
  });

  it("names only real MCP tools and prompts", async () => {
    // Tools that reach the web: the local stdio server adds them, and the Hub serves its own
    // `screenshot_url` (and `import_site`) — they aren't part of the shared tool set.
    const local = ["import_site", "import_squarespace", "screenshot_url"];
    const cliMcp = ["import-tool.ts", "reference-tool.ts"]
      .map((f) => join(REPO, "packages", "cli", "src", "mcp", f))
      .map((p) => (existsSync(p) ? p : ""));
    const localSource = (
      await Promise.all(cliMcp.filter(Boolean).map((p) => readFile(p, "utf8")))
    ).join("\n");
    for (const t of local) expect(localSource, t).toContain(`name: "${t}"`);
    // Hub-only account tools (apps/hub/src/mcp/tools/account.ts).
    const hubOnly = ["create_site", "import_status", "start_site"];
    const tools = new Set([...ALL_TOOLS.map((t) => t.name), ...local, ...hubOnly]);
    const prompts = new Set(PROMPTS.map((p) => p.name));
    const unknown: string[] = [];
    for (const f of await walk(CONTENT)) {
      const text = await readFile(join(CONTENT, f), "utf8");
      for (const m of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
        const name = m[1] as string;
        if (!tools.has(name) && !/^(?:[A-Z_]+)$/.test(name)) unknown.push(`${f}: ${name}`);
      }
    }
    expect(unknown).toEqual([]);
    const ref = await source("connect-your-ai/tools");
    for (const t of tools) expect(ref, t).toContain(`\`${t}\``);
    for (const p of prompts) expect(ref, p).toContain(`\`${p}\``);
  });

  it("lists every template", async () => {
    const text = await source("templates");
    expect(templateSpecs).toHaveLength(20);
    for (const s of templateSpecs) expect(text).toContain(`**${s.name}**`);
  });

  it("documents every Hub secret and the DEV_MODE warning", async () => {
    const text = await source("self-hosting");
    const example = await readFile(join(REPO, "apps", "hub", ".dev.vars.example"), "utf8");
    const secrets = [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1] as string);
    expect(secrets.length).toBeGreaterThan(10);
    const ignored = new Set(["SITE_KIT_LATEST", "SITE_KIT_CHANGELOG", "NPM_REGISTRY"]);
    for (const s of secrets) if (!ignored.has(s)) expect(text, s).toContain(s);
    expect(text).toContain("DEV_MODE");
    expect(text).toContain("ALLOW_DEV_MODE");
    expect(text).toMatch(/Deploy to Cloudflare/);
  });

  it("documents the import for every platform with the CLI's real options", async () => {
    const text = await source("guides/migrate-to-openspace");
    const program = await readFile(join(REPO, "packages", "cli", "src", "program.ts"), "utf8");
    for (const flag of [
      "--owner",
      "--export",
      "--render",
      "--platform",
      "--into-existing",
      "--max-pages",
      "--delay",
      "--no-media",
    ]) {
      expect(text, flag).toContain(flag);
      expect(program, flag).toContain(flag);
    }
    // Imports never choose hosting (they always go live on GitHub Pages first).
    expect(text).not.toContain("--target cloudflare");
    for (const heading of [
      "### Sites on GitHub Pages",
      "### Squarespace",
      "### WordPress",
      "### Wix",
      "### Webflow",
      "### Anything else",
    ])
      expect(text, heading).toContain(heading);
    for (const cmd of [
      "npx -y @omniharmonic/openspace-cli import https://",
      "npx -y @omniharmonic/openspace-cli import squarespace",
      "npx -y @omniharmonic/openspace-cli import wordpress",
      "npx -y @omniharmonic/openspace-cli import url",
    ])
      expect(text, cmd).toContain(cmd);
    expect(text).toContain("/openspace:migrate");
    expect(await source("guides/migrate-from-squarespace")).toContain(
      "/guides/migrate-to-openspace/",
    );
    const cli = await source("developers/cli");
    for (const c of [
      "openspace import <url>",
      "openspace import squarespace",
      "openspace import wordpress",
      "openspace import url",
    ])
      expect(cli, c).toContain(c);
  });

  it("gives the plugin install commands", async () => {
    const text = await source("connect-your-ai/claude-code");
    expect(text).toContain("/plugin marketplace add omniharmonic/openspace");
    expect(text).toContain("/plugin install openspace@openspace");
    expect(text).toContain("claude plugin install openspace@openspace");
    expect(text).toContain("npx -y @omniharmonic/openspace-cli mcp");
  });
});

describe("docs build", () => {
  let files: string[] = [];
  beforeAll(async () => {
    await rm(OUT, { recursive: true, force: true });
    await run(process.execPath, [join(ROOT, "scripts", "build.mjs"), OUT], {
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
      maxBuffer: 64 * 1024 * 1024,
    });
    files = await walk(OUT);
  }, 240_000);

  it("renders every page to static HTML", () => {
    expect(files).toContain("index.html");
    // Claude app skills, generated at build time and linked from the docs and Studio.
    for (const name of [
      "openspace-design-from-scratch",
      "openspace-migrate",
      "openspace-web-design",
      "openspace-content",
      "openspace-site-setup",
    ])
      expect(files, name).toContain(`skills/${name}.zip`);
    expect(files).toContain("404.html");
    for (const slug of REQUIRED) expect(files, slug).toContain(`${slug}/index.html`);
  });

  it("has no broken internal links", async () => {
    const broken: string[] = [];
    for (const f of files.filter((x) => x.endsWith(".html"))) {
      const html = await readFile(join(OUT, f), "utf8");
      for (const m of html.matchAll(/href="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
        const path = decodeURIComponent(m[1] as string);
        if (path.startsWith("/_astro/") || path.startsWith("/pagefind/")) continue;
        const target = path.endsWith("/") ? `${path}index.html` : path;
        if (!existsSync(join(OUT, target)) && !existsSync(join(OUT, `${path}/index.html`)))
          broken.push(`${f} → ${path}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("serves every docs page the plugin and the marketing site link to", async () => {
    const sources = [
      await readFile(join(REPO, "apps", "www", "src", "site", "www.ts"), "utf8"),
      await readFile(join(REPO, "plugin", ".claude-plugin", "plugin.json"), "utf8"),
      await readFile(join(REPO, ".claude-plugin", "marketplace.json"), "utf8"),
    ].join("\n");
    const paths = [...sources.matchAll(/(?:\$\{DOCS\}|docs\.openspace\.host)(\/[a-z0-9/-]*)/g)].map(
      (m) => m[1] as string,
    );
    expect(paths.length).toBeGreaterThan(5);
    for (const p of paths) {
      const target = p === "/" ? "index.html" : `${p.replace(/^\/|\/$/g, "")}/index.html`;
      expect(files, p).toContain(target);
    }
  });
});
