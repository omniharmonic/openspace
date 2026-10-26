import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateAgentsMd } from "@openspace/site-kit";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { SITE_DIR, starterFiles, VARIANTS } from "./index";

// GitHub expression strings, built so linters don't read them as template literals.
const expr = (inner: string) => ["$", "{{ ", inner, " }}"].join("");
const TURNSTILE_VAR = expr("vars.OPENSPACE_TURNSTILE_SITE_KEY");

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  id?: string;
  env?: Record<string, string>;
};
type Workflow = {
  name: string;
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: Record<string, { "runs-on": string; needs?: string; environment?: unknown; steps: Step[] }>;
};

describe("starter site shell", () => {
  it("publish.yml follows architecture §7.1 with pinned current action majors", async () => {
    const wf = parse(
      await readFile(join(SITE_DIR, ".github/workflows/publish.yml"), "utf8"),
    ) as Workflow;
    expect(wf.name).toBe("Publish");
    expect(wf.on).toEqual({ push: { branches: ["main"] }, workflow_dispatch: null });
    expect(wf.permissions).toEqual({ contents: "read", pages: "write", "id-token": "write" });
    expect(wf.concurrency).toEqual({ group: "publish", "cancel-in-progress": true });
    const build = wf.jobs.build;
    expect(build?.["runs-on"]).toBe("ubuntu-latest");
    expect(build?.steps.map((s) => s.uses ?? s.run)).toEqual([
      "actions/checkout@v7",
      "actions/setup-node@v7",
      "actions/cache@v6",
      "if [ -f package-lock.json ]; then npm ci; else npm install; fi",
      "npx openspace check --ci",
      "npm run build",
      "actions/upload-pages-artifact@v5",
    ]);
    expect(build?.steps[1]?.with).toEqual({
      "node-version": 22,
      cache: "npm",
      "cache-dependency-path": "package.json",
    });
    expect(build?.steps[5]?.env).toEqual({
      OPENSPACE_TURNSTILE_SITE_KEY: TURNSTILE_VAR,
      // Publishing self-hosts the font pairing (downloaded from Google Fonts at build time).
      OPENSPACE_GOOGLE_FONTS: "download",
    });
    expect(build?.steps[2]?.with).toEqual({
      path: "node_modules/.astro",
      key: `os-assets-${expr("hashFiles('media/**')")}`,
      "restore-keys": "os-assets-",
    });
    expect(build?.steps[6]?.with).toEqual({ path: "dist" });
    const deploy = wf.jobs.deploy;
    expect(deploy?.needs).toBe("build");
    expect(deploy?.environment).toEqual({
      name: "github-pages",
      url: expr("steps.d.outputs.page_url"),
    });
    expect(deploy?.steps).toEqual([{ id: "d", uses: "actions/deploy-pages@v5" }]);
  });

  it("the Cloudflare variant deploys with wrangler using repo secrets", async () => {
    const wf = parse(
      await readFile(join(VARIANTS.cloudflare, ".github/workflows/publish.yml"), "utf8"),
    ) as Workflow;
    // id-token: the run's OIDC identity authorizes downloading its gated pages from the Hub.
    expect(wf.permissions).toEqual({ contents: "read", "id-token": "write" });
    const steps = wf.jobs.publish?.steps ?? [];
    expect(steps.map((s) => s.uses ?? s.run)).toContain("npx openspace check --ci");
    expect(steps.map((s) => s.uses ?? s.run)).toContain(
      "if [ -f package-lock.json ]; then npm ci; else npm install; fi",
    );
    expect(steps.find((s) => s.run === "npm run build")?.env).toEqual({
      OPENSPACE_TURNSTILE_SITE_KEY: TURNSTILE_VAR,
      // Publishing self-hosts the font pairing (downloaded from Google Fonts at build time).
      OPENSPACE_GOOGLE_FONTS: "download",
    });
    const deploy = steps.at(-1);
    expect(deploy?.run).toBe("npx wrangler deploy");
    expect(deploy?.env).toEqual({
      CLOUDFLARE_API_TOKEN: expr("secrets.CLOUDFLARE_API_TOKEN"),
      CLOUDFLARE_ACCOUNT_ID: expr("secrets.CLOUDFLARE_ACCOUNT_ID"),
    });
    const runs = steps.map((s) => s.run ?? "");
    const gated = runs.indexOf("npx openspace gated-sync");
    const secrets = steps.findIndex((s) => s.name === "Worker secrets");
    // Gated content and Worker secrets are in place before the deploy that uses them.
    expect(gated).toBeGreaterThan(runs.indexOf("npm run build"));
    expect(secrets).toBeGreaterThan(gated);
    expect(secrets).toBeLessThan(steps.length - 1);
    const secretStep = steps[secrets];
    expect(secretStep?.run).toContain("npx wrangler secret bulk");
    expect(secretStep?.env).toMatchObject({
      OS_SESSION_SECRET: expr("secrets.OS_SESSION_SECRET"),
      OS_PAGE_PASSWORDS: expr("secrets.OS_PAGE_PASSWORDS"),
      STRIPE_SECRET_KEY: expr("secrets.STRIPE_SECRET_KEY"),
    });
    const wrangler = await readFile(join(VARIANTS.cloudflare, "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain('"binding": "OS_GATED", "bucket_name": "openspace-site-gated"');
  });

  it("is a thin shell: config, one page route, package.json, AGENTS.md, workflow", async () => {
    const files = Object.keys(await starterFiles());
    expect(files).toEqual([
      ".github/workflows/publish.yml",
      ".gitignore",
      "AGENTS.md",
      "astro.config.mjs",
      "package.json",
      "src/pages/[...slug].astro",
      "tsconfig.json",
    ]);
    const cf = await starterFiles("cloudflare");
    expect(cf["wrangler.jsonc"]).toBeDefined();
    expect(cf["astro.config.mjs"]).toContain("adapter: cloudflare(CLOUDFLARE_ADAPTER_OPTIONS)");
    expect(JSON.parse(cf["package.json"] ?? "{}").dependencies).toHaveProperty(
      "@astrojs/cloudflare",
    );
    expect(cf[".github/workflows/publish.yml"]).toContain("wrangler deploy");
    const pkg = JSON.parse((await starterFiles())["package.json"] ?? "{}");
    expect(pkg.dependencies).toHaveProperty("@openspace/site-kit");
    expect(pkg.devDependencies).toHaveProperty("@openspace/cli");
    expect((await starterFiles())["astro.config.mjs"]).toContain("integrations: [openspace()]");
  });

  it("AGENTS.md is generated from the schema and block registry (UPDATE_AGENTS_MD=1 rewrites it)", async () => {
    const path = join(SITE_DIR, "AGENTS.md");
    const generated = generateAgentsMd();
    if (process.env.UPDATE_AGENTS_MD) await writeFile(path, generated);
    expect(await readFile(path, "utf8")).toBe(generated);
  });
});
