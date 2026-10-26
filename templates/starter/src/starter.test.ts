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
  jobs: Record<
    string,
    {
      "runs-on": string;
      needs?: string;
      environment?: unknown;
      permissions?: Record<string, string>;
      steps: Step[];
    }
  >;
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
    // Only the dependency-free `gated` job can mint the run's OIDC identity token.
    expect(wf.permissions).toEqual({ contents: "read" });
    const gatedJob = wf.jobs.gated;
    expect(gatedJob?.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(gatedJob?.steps.map((s) => s.uses ?? s.run)).toEqual([
      "actions/checkout@v7",
      "actions/setup-node@v7",
      "node .github/openspace/gated-sync.mjs",
    ]);
    expect(wf.jobs.publish?.needs).toBe("gated");
    expect(wf.jobs.publish?.permissions).toBeUndefined();
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
    const secrets = steps.findIndex((s) => s.name === "Worker secrets");
    // Worker secrets are in place before the deploy that uses them.
    expect(secrets).toBeGreaterThan(runs.indexOf("npm run build"));
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

  describe("gated-sync.mjs (the Cloudflare workflow's gated job)", () => {
    it("uploads exactly the versions the commit names through the Cloudflare API", async () => {
      const { mkdtemp, mkdir, writeFile: wf, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const dir = await mkdtemp(join(tmpdir(), "os-gated-"));
      try {
        await wf(
          join(dir, "openspace.json"),
          JSON.stringify({ siteId: "st_meadw00001", hub: "https://hub.example/" }),
        );
        await wf(
          join(dir, "wrangler.jsonc"),
          '{\n  // c\n  "r2_buckets": [{ "binding": "OS_GATED", "bucket_name": "meadow-gated" }],\n}\n',
        );
        await mkdir(join(dir, "content/pages/members"), { recursive: true });
        await wf(
          join(dir, "content/pages/members/library.json"),
          JSON.stringify({ id: "pg_gatedpage1", contentRef: "ref01", sections: [] }),
        );
        await wf(join(dir, "content/pages/about.json"), JSON.stringify({ id: "pg_about00001" }));
        const calls: Array<{ url: string; method: string; body?: string; auth: string | null }> =
          [];
        const fetch = async (url: string, init: RequestInit = {}) => {
          calls.push({
            url,
            method: init.method ?? "GET",
            body: typeof init.body === "string" ? init.body : undefined,
            auth: new Headers(init.headers).get("authorization"),
          });
          if (url.startsWith("https://actions.example/")) return Response.json({ value: "oidc" });
          if (url === "https://hub.example/ci/sites/st_meadw00001/gated")
            return Response.json({
              pages: [{ id: "pg_gatedpage1", ref: "ref01", page: { id: "pg_gatedpage1", x: 1 } }],
            });
          if (url.endsWith("/r2/buckets")) return new Response("{}", { status: 409 });
          return new Response("{}", { status: 200 });
        };
        const script = await import(join(VARIANTS.cloudflare, ".github/openspace/gated-sync.mjs"));
        const n = await script.main({
          cwd: dir,
          fetch,
          log: () => {},
          env: {
            CLOUDFLARE_API_TOKEN: "cf",
            CLOUDFLARE_ACCOUNT_ID: "acct",
            ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example/t?v=2",
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner",
          },
        });
        expect(n).toBe(1);
        expect(calls[0]?.url).toBe(
          "https://actions.example/t?v=2&audience=https%3A%2F%2Fhub.example",
        );
        expect(calls[1]?.auth).toBe("Bearer oidc");
        const put = calls.at(-1);
        expect(put).toMatchObject({
          method: "PUT",
          url: "https://api.cloudflare.com/client/v4/accounts/acct/r2/buckets/meadow-gated/objects/pages/pg_gatedpage1/ref01.json",
          auth: "Bearer cf",
        });
        expect(JSON.parse(put?.body ?? "{}")).toEqual({ id: "pg_gatedpage1", x: 1 });
        // A version the Hub doesn't have fails the job (no deploy without it).
        const empty = async (url: string, init?: RequestInit) =>
          url.includes("/ci/sites/") ? Response.json({ pages: [] }) : fetch(url, init);
        await expect(
          script.main({
            cwd: dir,
            fetch: empty,
            log: () => {},
            env: {
              CLOUDFLARE_API_TOKEN: "cf",
              CLOUDFLARE_ACCOUNT_ID: "acct",
              ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example/t",
              ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner",
            },
          }),
        ).rejects.toThrow(/Missing private page content/);
        // The identity token and private pages only travel over https (or to a local Hub).
        await wf(
          join(dir, "openspace.json"),
          JSON.stringify({ siteId: "st_meadw00001", hub: "http://hub.example" }),
        );
        await expect(script.main({ cwd: dir, fetch, log: () => {}, env: {} })).rejects.toThrow(
          /must use https/,
        );
        // Sites without gated pages never need the Hub here.
        await rm(join(dir, "content/pages/members"), { recursive: true });
        expect(await script.main({ cwd: dir, fetch, log: () => {}, env: {} })).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
