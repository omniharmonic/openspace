import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateAgentsMd } from "@openspace/site-kit";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { SITE_DIR, starterFiles, VARIANTS } from "./index";

type Step = {
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
      "npm ci",
      "npx openspace check --ci",
      "npm run build",
      "actions/upload-pages-artifact@v5",
    ]);
    expect(build?.steps[1]?.with).toEqual({ "node-version": 22, cache: "npm" });
    expect(build?.steps[2]?.with).toEqual({
      path: "node_modules/.astro",
      key: "os-assets-${{ hashFiles('media/**') }}",
      "restore-keys": "os-assets-",
    });
    expect(build?.steps[6]?.with).toEqual({ path: "dist" });
    const deploy = wf.jobs.deploy;
    expect(deploy?.needs).toBe("build");
    expect(deploy?.environment).toEqual({
      name: "github-pages",
      url: "${{ steps.d.outputs.page_url }}",
    });
    expect(deploy?.steps).toEqual([{ id: "d", uses: "actions/deploy-pages@v5" }]);
  });

  it("the Cloudflare variant deploys with wrangler using repo secrets", async () => {
    const wf = parse(
      await readFile(join(VARIANTS.cloudflare, ".github/workflows/publish.yml"), "utf8"),
    ) as Workflow;
    expect(wf.permissions).toEqual({ contents: "read" });
    const steps = wf.jobs.publish?.steps ?? [];
    expect(steps.map((s) => s.uses ?? s.run)).toContain("npx openspace check --ci");
    const deploy = steps.at(-1);
    expect(deploy?.run).toBe("npx wrangler deploy");
    expect(deploy?.env).toEqual({
      CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    });
    const wrangler = await readFile(join(VARIANTS.cloudflare, "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain('"binding": "OS_GATED"');
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
