// Build template demo sites exactly as owners publish them: each template's openspace.json,
// content/ and media/ in the starter shell, through `astro build` with the site-kit integration.
//   node scripts/build-templates.mjs [outRoot] [--only=meadow,harbor]
// Writes <outRoot>/<id>/dist (default outRoot: tools/visual-tests/.build). The demo is built for
// a custom domain at the root (base "/") so it can be served from any static server.
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const REPO = join(PKG, "..", "..");
const TEMPLATES = join(REPO, "templates");
const STARTER = join(TEMPLATES, "starter", "site");

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "1"] = a.slice(2).split("=");
      return [k, v];
    }),
);
const OUT = args.find((a) => !a.startsWith("--")) ?? join(PKG, ".build");
const exists = (p) =>
  stat(p).then(
    () => true,
    () => false,
  );

export async function templateIds() {
  const ids = [];
  for (const e of await readdir(TEMPLATES, { withFileTypes: true }))
    if (e.isDirectory() && (await exists(join(TEMPLATES, e.name, "openspace.json"))))
      ids.push(e.name);
  return ids.sort();
}

/** Copy a template into a buildable site folder. `edit` may rewrite the site document files. */
export async function assemble(id, root, edit) {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const entry of ["openspace.json", "content", "media"])
    if (await exists(join(TEMPLATES, id, entry)))
      await cp(join(TEMPLATES, id, entry), join(root, entry), { recursive: true });
  await cp(join(STARTER, "astro.config.mjs"), join(root, "astro.config.mjs"));
  await cp(join(STARTER, "src"), join(root, "src"), { recursive: true });
  if (await exists(join(STARTER, "public")))
    await cp(join(STARTER, "public"), join(root, "public"), { recursive: true });
  const cfgPath = join(root, "openspace.json");
  const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
  cfg.deploy = {
    ...cfg.deploy,
    url: `https://${id}.example.com`,
    customDomain: `${id}.example.com`,
  };
  await writeFile(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
  if (edit) await edit(root);
  return root;
}

export async function astroBuild(root) {
  const out = join(root, "dist");
  await run(process.execPath, [join(HERE, "build-site.mjs"), root, out], {
    cwd: root,
    env: {
      ...process.env,
      OPENSPACE_BUILD_TIME: "2026-10-26T12:00:00Z",
      ASTRO_TELEMETRY_DISABLED: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = flags.only?.split(",");
  for (const id of (await templateIds()).filter((t) => !only || only.includes(t))) {
    const started = Date.now();
    const root = await assemble(id, join(OUT, id));
    try {
      await astroBuild(root);
      console.log(`${id}: built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (e) {
      console.error(`${id}: build failed\n${e.stderr ?? e.message}`);
      process.exitCode = 1;
    }
  }
}
