import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { siteMigrationRegistry } from "@omniharmonic/openspace-schema";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { afterAll, describe, expect, it } from "vitest";
import { ASTRO_MIN_NODE, astroNodeProblem, runDev } from "./dev";
import { captureIo } from "./io";
import { runMigrate } from "./migrate";
import { run } from "./program";
import { compareVersions } from "./semver";
import { CLI_DIR, cleanup, cli, MEADOW, tmpDir } from "./test-helpers";

const made: string[] = [];
const exec = promisify(execFile);
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
    for (const c of ["check", "dev", "migrate", "new", "import", "eject", "agents-md", "mcp"])
      expect(r.out).toContain(c);
  });

  it("mcp refuses a folder that is not a site, naming the problem", async () => {
    const r = await cli(process.cwd(), ["mcp", "--no-screenshots"]);
    expect(r.err).toContain("Can't serve");
    expect(r.err).toContain("openspace.json");
    expect(r.code).toBe(1);
  });
});

describe("openspace new", () => {
  it("scaffolds a site that passes check", async () => {
    const site = await newSite(["--title", "Hello Meadow", "--repo", "maya/maya-yoga"]);
    expect(site.code, site.err).toBe(0);
    // templates/meadow ships its own content now: no fixture stand-in.
    expect(site.out).not.toContain("sample site");
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
    // The footer's brand follows the new title (it kept the template's sample brand before).
    expect(JSON.stringify(doc.site.footer)).not.toContain("Fernwood Yoga & Bodywork");
    expect(JSON.stringify(doc.site.footer)).toContain("Hello Meadow");
    const pkg = JSON.parse(await readFile(join(site.dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("my-site");
    expect(await readFile(join(site.dir, "AGENTS.md"), "utf8")).toContain("Hello Meadow");

    const check = await cli(site.dir, ["check"]);
    expect(check.out).toMatch(/^OK:/m);
    expect(check.code).toBe(0);
  });

  it("starts every site on GitHub Pages (wow first): --target cloudflare is refused kindly", async () => {
    const site = await newSite(["--target", "cloudflare"]);
    expect(site.code).toBe(1);
    expect(site.err).toContain("always start on free GitHub Pages");
    expect(site.err).toContain("Finish setting up");
    expect(existsSync(join(site.dir, "wrangler.jsonc"))).toBe(false);
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

  it("lists only real templates (folders with template.json) for an unknown id", async () => {
    const tdir = join(await tmpDir(), "templates");
    for (const d of ["lib", "test", "node_modules", "real"])
      await mkdir(join(tdir, d), { recursive: true });
    await writeFile(join(tdir, "real", "template.json"), "{}");
    const parent = await tmpDir();
    const r = await cli(parent, ["new", "lib", "x", "--templates-dir", tdir]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Unknown template "lib". Available: ');
    const listed = (r.err.split("Available: ")[1] ?? "").replace(/\.\s*$/, "").split(", ");
    expect(listed).toContain("real");
    for (const helper of ["lib", "test", "node_modules"]) expect(listed).not.toContain(helper);
  });

  it("rejects template ids that could escape the templates folder", async () => {
    const parent = await tmpDir();
    for (const id of ["../meadow", "a/b", "..", "Meadow"]) {
      const r = await cli(parent, ["new", id, "x"]);
      expect(r.code, id).toBe(1);
      expect(r.err).toContain("Invalid template id");
    }
    expect(existsSync(join(parent, "x"))).toBe(false);
  });

  it("removes parent folders it created when scaffolding fails", async () => {
    const tdir = join(await tmpDir(), "templates");
    await mkdir(join(tdir, "bad", "content"), { recursive: true });
    await writeFile(join(tdir, "bad", "openspace.json"), "{}");
    await writeFile(join(tdir, "bad", "content", "site.json"), "{ nope");
    const parent = await tmpDir();
    await mkdir(join(parent, "existing"));
    const r = await cli(parent, ["new", "bad", "existing/deep/site", "--templates-dir", tdir]);
    expect(r.code).toBe(1);
    expect(existsSync(join(parent, "existing"))).toBe(true);
    expect(existsSync(join(parent, "existing/deep"))).toBe(false);
  });

  it("removes a half-scaffolded folder when the template is broken", async () => {
    const tdir = join(await tmpDir(), "templates");
    await mkdir(join(tdir, "bad", "content"), { recursive: true });
    await writeFile(join(tdir, "bad", "openspace.json"), "{}");
    await writeFile(join(tdir, "bad", "content", "site.json"), "{ nope");
    const parent = await tmpDir();
    const r = await cli(parent, ["new", "bad", "site", "--templates-dir", tdir]);
    expect(r.code).toBe(1);
    expect(existsSync(join(parent, "site"))).toBe(false);
    // An existing empty folder survives, emptied.
    await mkdir(join(parent, "keep"));
    const again = await cli(parent, ["new", "bad", "keep", "--templates-dir", tdir]);
    expect(again.code).toBe(1);
    expect(existsSync(join(parent, "keep"))).toBe(true);
    expect(await readdir(join(parent, "keep"))).toEqual([]);
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

  it("--dry-run lists the files it would write and writes nothing", async () => {
    const site = await newSite();
    const migrations = siteMigrationRegistry([
      {
        from: 1,
        description: "add a tagline",
        up: (c) => ({ ...c, site: { ...(c.site as object), tagline: "Dry" } }),
      },
    ]);
    const before = await readFile(join(site.dir, "openspace.json"), "utf8");
    const r = await runMigrate(site.dir, { migrations, target: 2, dryRun: true });
    expect(r.written).toEqual(expect.arrayContaining(["openspace.json", "content/site.json"]));
    expect(await readFile(join(site.dir, "openspace.json"), "utf8")).toBe(before);
    const out = await cli(site.dir, ["migrate", "--dry-run"]);
    expect(out.out).toContain("Already up to date");
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
      `Astro needs Node ${ASTRO_MIN_NODE} or newer (Node 24 recommended), but this is Node 22.22.3`,
    );
  });

  it("warns on new/check (not just at build) when Node is too old", () => {
    expect(astroNodeProblem("22.22.3")).toContain("nvm install 24");
    expect(astroNodeProblem(ASTRO_MIN_NODE)).toBeNull();
    expect(astroNodeProblem("24.1.0")).toBeNull();
  });

  it("runs astro dev with extra args through the command line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "os-dev-"));
    made.push(dir);
    await writeFile(join(dir, "openspace.json"), "{}");
    const { EventEmitter } = await import("node:events");
    let args: string[] = [];
    const cap = captureIo(dir);
    const io = { ...cap.io, nodeVersion: "24.0.0" };
    const code = await run(["dev", "--port", "4000"], io, {
      findBin: () => "/fake/astro.mjs",
      spawner: (_cmd, a) => {
        args = a;
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("exit", 3, null));
        return child as never;
      },
    });
    expect(args).toEqual(["/fake/astro.mjs", "dev", "--port", "4000"]);
    expect(code).toBe(3);
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
    const entrypoints = await readFile(join(kit, "entrypoints.ts"), "utf8");
    expect(entrypoints).toContain('"./src/openspace-kit/cloudflare/endpoints/gated.ts"');
    expect(entrypoints).not.toMatch(/["']@omniharmonic\/openspace-site-kit/);
    expect(await readFile(join(kit, "integration.ts"), "utf8")).toContain("ENTRYPOINTS[p]");

    const pkg = JSON.parse(await readFile(join(site.dir, "package.json"), "utf8"));
    expect(pkg.dependencies["@omniharmonic/openspace-site-kit"]).toBeUndefined();
    expect(pkg.dependencies["@markdoc/markdoc"]).toBeDefined();
    expect(pkg.dependencies.astro).toBeDefined();
    expect(pkg.dependencies["@omniharmonic/openspace-renderer"]).toMatch(/^\^/);

    const again = await cli(site.dir, ["eject", "--yes"]);
    expect(again.code).toBe(1);
    expect(again.err).toContain("already");
  });
});

describe("openspace eject safety", () => {
  async function fakeSite(kitFiles: Record<string, string>) {
    const dir = await mkdtemp(join(tmpdir(), "os-eject-"));
    made.push(dir);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "s", dependencies: { "@omniharmonic/openspace-site-kit": "^0.1.0" } }),
    );
    await mkdir(join(dir, "src/pages"), { recursive: true });
    await writeFile(
      join(dir, "astro.config.mjs"),
      'import o from "@omniharmonic/openspace-site-kit";\n',
    );
    const kit = join(dir, "node_modules/@omniharmonic/openspace-site-kit");
    for (const [rel, text] of Object.entries(kitFiles)) {
      await mkdir(join(kit, rel, ".."), { recursive: true });
      await writeFile(join(kit, rel), text);
    }
    return dir;
  }
  const pkg = (extra = {}) =>
    JSON.stringify({
      name: "@omniharmonic/openspace-site-kit",
      version: "0.1.0",
      type: "module",
      exports: { ".": { default: "./src/index.ts" }, "./route": { default: "./src/route.ts" } },
      ...extra,
    });

  it("refuses when only dist is shipped and changes nothing", async () => {
    const dir = await fakeSite({
      "package.json": pkg({ exports: { ".": { default: "./dist/index.js" } } }),
      "dist/index.js": "export {};\n",
    });
    const before = await readFile(join(dir, "package.json"), "utf8");
    const r = await cli(dir, ["eject", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("ships only built output");
    expect(existsSync(join(dir, "src/openspace-kit"))).toBe(false);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(before);
  });

  it("fails loudly and changes nothing when the entrypoint table cannot be rewritten", async () => {
    const dir = await fakeSite({
      "package.json": pkg(),
      "src/index.ts": "export {};\n",
      "src/route.ts": "export {};\n",
      // Unrecognisable shape: no kit specifiers at all.
      "src/entrypoints.ts": "export const ENTRYPOINTS = makeEntries();\n",
    });
    const before = await readFile(join(dir, "package.json"), "utf8");
    const config = await readFile(join(dir, "astro.config.mjs"), "utf8");
    const r = await cli(dir, ["eject", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("not in the expected shape");
    expect(existsSync(join(dir, "src/openspace-kit"))).toBe(false);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(before);
    expect(await readFile(join(dir, "astro.config.mjs"), "utf8")).toBe(config);

    // A specifier the kit does not export is also fatal.
    await writeFile(
      join(dir, "node_modules/@omniharmonic/openspace-site-kit/src/entrypoints.ts"),
      'export const E = { a: "@omniharmonic/openspace-site-kit/nope" };\n',
    );
    const r2 = await cli(dir, ["eject", "--yes"]);
    expect(r2.code).toBe(1);
    expect(r2.err).toContain("not in the kit's exports");
    expect(existsSync(join(dir, "src/openspace-kit"))).toBe(false);
  });

  const ENTRIES = `export const ENTRYPOINTS = {\n  a: "@omniharmonic/openspace-site-kit/route",\n} as const;\n`;
  const packedPkg = () =>
    pkg({
      exports: {
        ".": { default: "./dist/index.js" },
        "./route": { default: "./dist/runtime/route.js" },
      },
    });

  it("ejects a packed layout (exports point at dist, src ships alongside)", async () => {
    const dir = await fakeSite({
      "package.json": packedPkg(),
      "dist/index.js": "export {};\n",
      "src/index.ts": "export {};\n",
      "src/runtime/route.ts": "export {};\n",
      "src/entrypoints.ts": ENTRIES,
    });
    await writeFile(
      join(dir, "src/pages/[...slug].astro"),
      'import { x } from "@omniharmonic/openspace-site-kit/route";\n',
    );
    const r = await cli(dir, ["eject", "--yes"]);
    expect(r.code, r.err).toBe(0);
    expect(await readFile(join(dir, "astro.config.mjs"), "utf8")).toContain(
      '"./src/openspace-kit/index.ts"',
    );
    expect(await readFile(join(dir, "src/pages/[...slug].astro"), "utf8")).toContain(
      '"../openspace-kit/runtime/route.ts"',
    );
    expect(await readFile(join(dir, "src/openspace-kit/entrypoints.ts"), "utf8")).toContain(
      '"./src/openspace-kit/runtime/route.ts"',
    );
    // Every rewritten target exists.
    expect(existsSync(join(dir, "src/openspace-kit/runtime/route.ts"))).toBe(true);
  });

  it("fails before writing when an exported file has no source", async () => {
    const dir = await fakeSite({
      "package.json": packedPkg(),
      "src/index.ts": "export {};\n",
      "src/entrypoints.ts": ENTRIES, // src/runtime/route.ts is missing
    });
    const before = await readFile(join(dir, "package.json"), "utf8");
    const r = await cli(dir, ["eject", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("source file src/runtime/route.ts is not in the package");
    expect(existsSync(join(dir, "src/openspace-kit"))).toBe(false);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(before);
  });

  it("rolls everything back if applying the changes fails midway", async () => {
    const dir = await fakeSite({
      "package.json": pkg(),
      "src/index.ts": "export {};\n",
      "src/route.ts": "export {};\n",
      "src/entrypoints.ts": ENTRIES.replace("/route", "/route"),
    });
    const config = await readFile(join(dir, "astro.config.mjs"), "utf8");
    await chmod(join(dir, "package.json"), 0o444); // the last write will fail
    const r = await cli(dir, ["eject", "--yes"]);
    await chmod(join(dir, "package.json"), 0o644);
    expect(r.code, r.err).toBe(1);
    expect(existsSync(join(dir, "src/openspace-kit"))).toBe(false);
    expect(await readFile(join(dir, "astro.config.mjs"), "utf8")).toBe(config);
  });

  it("ejects a real `pnpm pack` of site-kit", async () => {
    const out = await mkdtemp(join(tmpdir(), "os-pack-"));
    made.push(out);
    const kitDir = join(CLI_DIR, "..", "site-kit");
    await exec("pnpm", ["pack", "--pack-destination", out], { cwd: kitDir });
    const tgz = (await readdir(out)).find((f) => f.endsWith(".tgz")) as string;
    const dir = await fakeSite({});
    const kit = join(dir, "node_modules/@omniharmonic/openspace-site-kit");
    await mkdir(kit, { recursive: true });
    await exec("tar", ["-xzf", join(out, tgz), "-C", kit, "--strip-components=1"]);
    const packed = JSON.parse(await readFile(join(kit, "package.json"), "utf8"));
    expect(packed.exports["."].default ?? packed.exports["."]).toMatch(/dist/);
    await writeFile(
      join(dir, "src/pages/[...slug].astro"),
      'import { renderPage } from "@omniharmonic/openspace-site-kit/route";\n',
    );
    const r = await cli(dir, ["eject", "--yes"]);
    expect(r.code, r.err).toBe(0);
    const ep = await readFile(join(dir, "src/openspace-kit/entrypoints.ts"), "utf8");
    const targets = [...ep.matchAll(/"(\.\/src\/openspace-kit\/[^"]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(targets.length).toBeGreaterThanOrEqual(4);
    for (const t of targets) expect(existsSync(join(dir, t)), t).toBe(true);
    const route = await readFile(join(dir, "src/pages/[...slug].astro"), "utf8");
    expect(existsSync(join(dir, "src/pages", route.match(/"(\.\.[^"]+)"/)?.[1] ?? "nope"))).toBe(
      true,
    );
  }, 120_000);

  it("fails when the kit has no entrypoints table", async () => {
    const dir = await fakeSite({
      "package.json": pkg(),
      "src/index.ts": "export {};\n",
      "src/route.ts": "export {};\n",
    });
    const r = await cli(dir, ["eject", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("no src/entrypoints.ts");
  });
});
