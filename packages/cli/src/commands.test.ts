import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { siteMigrationRegistry } from "@openspace/schema";
import { loadSiteDocument } from "@openspace/site-kit/content";
import { afterAll, describe, expect, it } from "vitest";
import { ASTRO_MIN_NODE, runDev } from "./dev";
import { captureIo } from "./io";
import { runMigrate } from "./migrate";
import { compareVersions } from "./semver";
import { cleanup, cli, MEADOW, tmpDir } from "./test-helpers";

const made: string[] = [];
afterAll(async () => {
  await cleanup();
  for (const d of made) await rm(d, { recursive: true, force: true });
});

async function newSite(args: string[] = []) {
  const parent = await tmpDir();
  const r = await cli(parent, ["new", "meadow", "my-site", ...args]);
  return { parent, dir: join(parent, "my-site"), ...r };
}

describe("command list", () => {
  it("registers every command", async () => {
    const r = await cli(process.cwd(), ["--help"]);
    for (const c of ["check", "dev", "migrate", "new", "eject", "agents-md", "mcp"])
      expect(r.out).toContain(c);
  });

  it("mcp says it is coming soon", async () => {
    const r = await cli(process.cwd(), ["mcp"]);
    expect(r.err).toContain("coming soon");
    expect(r.code).toBe(1);
  });
});

describe("openspace new", () => {
  it("scaffolds a site that passes check", async () => {
    const site = await newSite(["--title", "Hello Meadow", "--repo", "maya/maya-yoga"]);
    expect(site.code, site.err).toBe(0);
    // The meadow template has no content of its own yet: the fixture stands in, and we say so.
    expect(site.out).toContain("Meadow sample site");
    for (const f of [
      "openspace.json",
      "package.json",
      "astro.config.mjs",
      "AGENTS.md",
      ".github/workflows/publish.yml",
      "src/pages/[...slug].astro",
      "content/site.json",
      "media/",
    ])
      expect(existsSync(join(site.dir, f)), f).toBe(true);

    const doc = await loadSiteDocument(site.dir);
    expect(doc.config.siteId).toMatch(/^st_/);
    expect(doc.config.siteId).not.toBe("st_meadw00001");
    expect(doc.config.schemaVersion).toBe(1);
    expect(doc.config.deploy).toEqual({
      target: "github-pages",
      url: "https://maya.github.io/maya-yoga",
      customDomain: null,
    });
    expect(doc.site.title).toBe("Hello Meadow");
    const pkg = JSON.parse(await readFile(join(site.dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("my-site");
    expect(await readFile(join(site.dir, "AGENTS.md"), "utf8")).toContain("Hello Meadow");

    const check = await cli(site.dir, ["check"]);
    expect(check.out).toMatch(/^OK:/m);
    expect(check.code).toBe(0);
  });

  it("supports the cloudflare target", async () => {
    const site = await newSite(["--target", "cloudflare"]);
    expect(site.code, site.err).toBe(0);
    expect(existsSync(join(site.dir, "wrangler.jsonc"))).toBe(true);
    expect((await loadSiteDocument(site.dir)).config.deploy.target).toBe("cloudflare");
    expect((await cli(site.dir, ["check"])).code).toBe(0);
  });

  it("refuses a non-empty folder and unknown templates", async () => {
    const site = await newSite();
    const again = await cli(site.parent, ["new", "meadow", "my-site"]);
    expect(again.code).toBe(1);
    expect(again.err).toContain("not empty");
    const unknown = await cli(site.parent, ["new", "no-such-template", "other"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain('Unknown template "no-such-template"');
    expect(existsSync(join(site.parent, "other"))).toBe(false);
  });

  it("uses a template's own content when it has some", async () => {
    const tdir = join(await tmpDir(), "templates");
    const own = join(tdir, "fancy");
    const { cp } = await import("node:fs/promises");
    await cp(MEADOW, own, { recursive: true });
    const parent = await tmpDir();
    const r = await cli(parent, ["new", "fancy", "s", "--templates-dir", tdir]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("sample site");
    expect((await loadSiteDocument(join(parent, "s"))).config.template.id).toBe("fancy");
  });
});

describe("openspace migrate", () => {
  it("is idempotent on a current site", async () => {
    const site = await newSite();
    const before = await readFile(join(site.dir, "content/site.json"), "utf8");
    const a = await cli(site.dir, ["migrate"]);
    const b = await cli(site.dir, ["migrate"]);
    expect(a.out).toContain("Already up to date");
    expect(b.out).toBe(a.out);
    expect(await readFile(join(site.dir, "content/site.json"), "utf8")).toBe(before);
  });

  it("applies migrations once, writes back, then does nothing", async () => {
    const site = await newSite();
    const migrations = siteMigrationRegistry([
      {
        from: 1,
        description: "add a tagline",
        up: (c) => ({ ...c, site: { ...(c.site as object), tagline: "Migrated" } }),
      },
    ]);
    const first = await runMigrate(site.dir, { migrations, target: 2 });
    expect(first.applied).toEqual(["1 → 2: add a tagline"]);
    expect(first.written).toContain("openspace.json");
    expect(first.written).toContain("content/site.json");
    const doc = await loadSiteDocument(site.dir);
    expect(doc.config.schemaVersion).toBe(2);
    expect(doc.site.tagline).toBe("Migrated");
    const second = await runMigrate(site.dir, { migrations, target: 2 });
    expect(second.applied).toEqual([]);
    expect(second.written).toEqual([]);
  });

  it("refuses content newer than the library", async () => {
    const site = await newSite();
    const cfg = JSON.parse(await readFile(join(site.dir, "openspace.json"), "utf8"));
    cfg.schemaVersion = 99;
    await writeFile(join(site.dir, "openspace.json"), JSON.stringify(cfg));
    const r = await cli(site.dir, ["migrate"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("newer than this library supports");
  });
});

describe("openspace agents-md", () => {
  it("regenerates AGENTS.md and is stable", async () => {
    const site = await newSite(["--title", "Agent Site"]);
    const original = await readFile(join(site.dir, "AGENTS.md"), "utf8");
    await writeFile(join(site.dir, "AGENTS.md"), "stale");
    const r = await cli(site.dir, ["agents-md"]);
    expect(r.out).toContain("Updated AGENTS.md");
    const next = await readFile(join(site.dir, "AGENTS.md"), "utf8");
    expect(next).toBe(original);
    expect(next).toContain("# AGENTS.md — Agent Site");
    expect(next).toContain("npx openspace check");
    expect(next).toMatch(/### `[a-z-]+` — /);
    expect((await cli(site.dir, ["agents-md"])).out).toContain("already up to date");
    const stdout = await cli(site.dir, ["agents-md", "--stdout"]);
    expect(stdout.out.trim()).toBe(next.trim());
  });
});

describe("openspace dev", () => {
  it("explains when Node is too old for Astro", async () => {
    const { io } = captureIo(process.cwd());
    await expect(runDev({ ...io, nodeVersion: "22.22.3" }, [])).rejects.toThrow(
      `Astro needs Node ${ASTRO_MIN_NODE} or newer, but this is Node 22.22.3`,
    );
    const r = await cli(process.cwd(), ["dev"]);
    // Whatever the host Node is, the message must be actionable.
    expect(r.code === 1 ? r.err : "").not.toBe("undefined");
  });

  it("compares versions", () => {
    expect(compareVersions("22.22.3", "22.23.4")).toBeLessThan(0);
    expect(compareVersions("22.23.4", "22.23.4")).toBe(0);
    expect(compareVersions("24.0.0", "22.23.4")).toBeGreaterThan(0);
  });

  it("asks for npm install when astro is missing, and spawns astro dev when present", async () => {
    // Outside the repo, so astro is not resolvable from a parent node_modules.
    const dir = await mkdtemp(join(tmpdir(), "os-dev-"));
    made.push(dir);
    await writeFile(join(dir, "package.json"), "{}");
    await writeFile(join(dir, "openspace.json"), "{}");
    const { io } = captureIo(dir);
    const modern = { ...io, nodeVersion: "24.0.0" };
    const never = () => {
      throw new Error("must not spawn");
    };
    await expect(runDev(modern, [], never, () => undefined)).rejects.toThrow("npm install");

    const astro = join(dir, "node_modules", "astro");
    await mkdir(astro, { recursive: true });
    await writeFile(
      join(astro, "package.json"),
      JSON.stringify({ name: "astro", bin: { astro: "astro.mjs" } }),
    );
    await writeFile(join(astro, "astro.mjs"), "");

    let spawned: { cmd: string; args: string[]; cwd: string } | undefined;
    const { EventEmitter } = await import("node:events");
    const code = await runDev(
      modern,
      ["--port", "4000"],
      (cmd, args, opts) => {
        spawned = { cmd, args, cwd: opts.cwd };
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("exit", 0, null));
        return child as never;
      },
      () => join(astro, "astro.mjs"),
    );
    expect(code).toBe(0);
    expect(spawned?.args).toEqual([join(astro, "astro.mjs"), "dev", "--port", "4000"]);
    expect(spawned?.cwd).toBe(dir);
  });
});

describe("openspace eject", () => {
  it("asks for confirmation first", async () => {
    const site = await newSite();
    const r = await cli(site.dir, ["eject"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Studio");
    expect(existsSync(join(site.dir, "src/openspace-kit"))).toBe(false);
  });

  it("copies the kit, rewrites imports and drops the dependency", async () => {
    const site = await newSite();
    const r = await cli(site.dir, ["eject", "--yes"]);
    expect(r.err).toContain("Studio");
    expect(r.code, r.err).toBe(0);
    const kit = join(site.dir, "src/openspace-kit");
    expect(existsSync(join(kit, "index.ts"))).toBe(true);
    expect(existsSync(join(kit, "runtime/route.ts"))).toBe(true);
    expect(existsSync(join(kit, "content/index.ts"))).toBe(true);
    expect(existsSync(join(kit, "content.test.ts"))).toBe(false);

    expect(await readFile(join(site.dir, "astro.config.mjs"), "utf8")).toContain(
      'from "./src/openspace-kit/index.ts"',
    );
    expect(await readFile(join(site.dir, "src/pages/[...slug].astro"), "utf8")).toContain(
      'from "../openspace-kit/runtime/route.ts"',
    );
    const integration = await readFile(join(kit, "integration.ts"), "utf8");
    expect(integration).toContain("ENTRY_PATHS");
    expect(integration).toContain("./src/openspace-kit/cloudflare/endpoints/gated.ts");

    const pkg = JSON.parse(await readFile(join(site.dir, "package.json"), "utf8"));
    expect(pkg.dependencies["@openspace/site-kit"]).toBeUndefined();
    expect(pkg.dependencies["@markdoc/markdoc"]).toBeDefined();
    expect(pkg.dependencies.astro).toBeDefined();
    expect(pkg.dependencies["@openspace/renderer"]).toMatch(/^\^/);

    const again = await cli(site.dir, ["eject", "--yes"]);
    expect(again.code).toBe(1);
    expect(again.err).toContain("already");
  });
});
