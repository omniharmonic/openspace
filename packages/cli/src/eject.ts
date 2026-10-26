import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, sep } from "node:path";
import { CliError, type Io } from "./io";

export const KIT_PACKAGE = "@openspace/site-kit";
export const EJECT_DIR = "src/openspace-kit";

export interface EjectResult {
  copiedFrom: string;
  files: number;
  rewritten: string[];
  addedDependencies: string[];
}

interface KitPackage {
  root: string;
  json: {
    version?: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    exports?: Record<string, { default?: string } | string>;
  };
  sourceDir: string;
}

function locateKit(cwd: string): KitPackage {
  // Find node_modules/@openspace/site-kit by walking up; resolving the entry would fail for a
  // published layout whose exports point at dist files that are not installed.
  let pkgRoot: string | undefined;
  for (let dir = cwd; ; ) {
    const candidate = join(dir, "node_modules", "@openspace", "site-kit");
    if (existsSync(join(candidate, "package.json"))) {
      pkgRoot = candidate;
      break;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (!pkgRoot)
    throw new CliError(
      `${KIT_PACKAGE} is not installed in this site, so there is nothing to eject.`,
    );
  const json = JSON.parse(
    readFileSync(join(pkgRoot, "package.json"), "utf8"),
  ) as KitPackage["json"];
  const sourceDir = join(pkgRoot, "src");
  if (!existsSync(join(sourceDir, "index.ts")))
    throw new CliError(
      `The installed ${KIT_PACKAGE}${json.version ? ` ${json.version}` : ""} ships only built output (dist/), and ejecting built JavaScript would give you code nobody can maintain.\nInstall a version that ships its source (${KIT_PACKAGE} with a src/ folder) and run "openspace eject" again. Nothing was changed.`,
    );
  return { root: pkgRoot, json, sourceDir };
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs)));
    else out.push(abs);
  }
  return out;
}

/**
 * Source file (relative to the kit's `src/`) behind an export target. A published package's
 * exports point at `./dist/x.js` while `src/x.ts` ships alongside; the workspace's point at
 * `./src/x.ts` directly.
 */
export function sourceFor(target: string): string | undefined {
  const t = target.replace(/^\.\//, "");
  if (t.startsWith("src/")) return t.slice(4);
  if (t.startsWith("dist/")) return t.slice(5).replace(/\.(?:m?js|d\.ts)$/, ".ts");
  return undefined;
}

/**
 * Map each `@openspace/site-kit[/sub]` specifier to the ejected file it will resolve to.
 * Every mapped file must exist in the kit's source; otherwise eject fails before writing.
 */
function specifierMap(kit: KitPackage): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(kit.json.exports ?? {})) {
    const target = typeof value === "string" ? value : value.default;
    if (!target) continue;
    const spec = key === "." ? KIT_PACKAGE : `${KIT_PACKAGE}/${key.slice(2)}`;
    const inSrc = sourceFor(target);
    if (!inSrc || !existsSync(join(kit.sourceDir, inSrc)))
      throw new CliError(
        `Cannot eject: ${spec} is exported as ${target}, but its source file${inSrc ? ` src/${inSrc}` : ""} is not in the package. Nothing was changed.`,
      );
    map.set(spec, `${EJECT_DIR}/${inSrc}`);
  }
  return map;
}

/**
 * Rewrite the integration's entrypoint table (src/entrypoints.ts) to project-relative paths.
 * Throws if the table is missing, has no kit specifiers, or any is left unresolved.
 */
export function rewriteEntrypoints(source: string, specs: Map<string, string>): string {
  let count = 0;
  const out = source.replace(/(["'])(@openspace\/site-kit(?:\/[\w./-]+)?)\1/g, (_m, q, spec) => {
    const target = specs.get(spec);
    if (!target)
      throw new CliError(`Cannot eject: entrypoint ${spec} is not in the kit's exports.`);
    count++;
    return `${q}./${target}${q}`;
  });
  if (count === 0 || /["']@openspace\/site-kit/.test(out))
    throw new CliError(
      "Cannot eject: src/entrypoints.ts in this site-kit version is not in the expected shape. Nothing was changed.",
    );
  return out;
}

/** `./a/b` style relative specifier from file `from` to repo path `to`. */
function relSpec(from: string, to: string): string {
  const r = posix.relative(posix.dirname(from), to);
  return r.startsWith(".") ? r : `./${r}`;
}

/**
 * Copy the kit's source into `src/openspace-kit/`, point the site's imports at it and drop the
 * npm dependency. Studio edits only un-ejected sites, so callers must confirm first.
 */
export async function runEject(io: Io): Promise<EjectResult> {
  const root = io.cwd;
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath))
    throw new CliError("No package.json here. Run this from your site's root.");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (existsSync(join(root, EJECT_DIR)))
    throw new CliError(`${EJECT_DIR} already exists; this site looks ejected already.`);
  if (!pkg.dependencies?.[KIT_PACKAGE] && !pkg.devDependencies?.[KIT_PACKAGE])
    throw new CliError(`${KIT_PACKAGE} is not a dependency of this site; nothing to eject.`);

  const kit = locateKit(root);
  const specs = specifierMap(kit);
  const entrypointsFile = join(kit.sourceDir, "entrypoints.ts");
  if (!existsSync(entrypointsFile))
    throw new CliError(
      "Cannot eject: this site-kit version has no src/entrypoints.ts. Update @openspace/site-kit first. Nothing was changed.",
    );
  // Everything that can fail is computed before the first write.
  const patchedEntrypoints = rewriteEntrypoints(await readFile(entrypointsFile, "utf8"), specs);

  const dest = join(root, EJECT_DIR);
  // Rewrite the site's own imports.
  const rewritten: string[] = [];
  const edits: { abs: string; next: string }[] = [];
  const candidates = [
    ...(await readdir(root)).filter((f) => /^astro\.config\.[mc]?[jt]s$/.test(f)),
    ...(existsSync(join(root, "src"))
      ? (await walk(join(root, "src")))
          .filter((f) => !f.startsWith(dest) && /\.(?:astro|[mc]?[jt]sx?)$/.test(f))
          .map((f) => relative(root, f).split(sep).join("/"))
      : []),
  ];
  for (const rel of candidates) {
    const abs = join(root, rel);
    const text = await readFile(abs, "utf8");
    const next = text.replace(/(["'])(@openspace\/site-kit(?:\/[\w./-]+)?)\1/g, (m, q, spec) => {
      const target = specs.get(spec);
      return target ? `${q}${relSpec(rel, target)}${q}` : m;
    });
    if (next !== text) edits.push({ abs, next });
    if (next !== text) rewritten.push(rel);
  }

  // The kit's own dependencies become the site's.
  const deps = { ...(pkg.dependencies ?? {}) };
  const dev = { ...(pkg.devDependencies ?? {}) };
  delete deps[KIT_PACKAGE];
  delete dev[KIT_PACKAGE];
  const added: string[] = [];
  const kitDeps = { ...kit.json.dependencies };
  for (const [name, range] of Object.entries(kitDeps)) {
    if (deps[name] || dev[name]) continue;
    // Published packages carry real ranges; a workspace range is meaningless outside the monorepo.
    deps[name] = range.startsWith("workspace:") ? `^${kit.json.version ?? "0.1.0"}` : range;
    added.push(name);
  }
  const out = { ...pkg, dependencies: sortKeys(deps) } as Record<string, unknown>;
  if (Object.keys(dev).length) out.devDependencies = sortKeys(dev);
  else delete out.devDependencies;
  const pkgText = `${JSON.stringify(out, null, 2)}\n`;

  // Apply: copy, rewrite, then update the site. Any failure rolls everything back.
  const originals = new Map<string, string>();
  let files: number;
  try {
    await mkdir(dest, { recursive: true });
    await cp(kit.sourceDir, dest, {
      recursive: true,
      filter: (src) => !/\.(?:test|spec)\.[tj]sx?$/.test(src) && !src.endsWith(".map"),
    });
    await writeFile(join(dest, "entrypoints.ts"), patchedEntrypoints);
    files = (await walk(dest)).length;
    for (const e of [...edits, { abs: pkgPath, next: pkgText }]) {
      const original = await readFile(e.abs, "utf8");
      await writeFile(e.abs, e.next);
      originals.set(e.abs, original); // only files actually changed are restored
    }
  } catch (e) {
    try {
      for (const [abs, text] of originals) await writeFile(abs, text);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
    throw e;
  }

  return { copiedFrom: kit.sourceDir, files, rewritten, addedDependencies: added.sort() };
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

export const EJECT_WARNING =
  "Ejecting copies the OpenSpace site kit into src/openspace-kit and removes it as a dependency.\n" +
  "OpenSpace Studio and automatic updates stop working for this site: you own the code from now on.\n" +
  "This cannot be undone automatically.";
