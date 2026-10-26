/**
 * Node-only helpers (site-kit builds, the Hub dev preview, the CLI): behavior bundles and the
 * base stylesheet as files. Kept out of the main entry so the renderer stays browser-safe.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BEHAVIOR_LOADER, BEHAVIORS, type BehaviorName } from "./behaviors-manifest";
import { BASE_CSS } from "./styles/base-css";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export type BehaviorFile = BehaviorName | typeof BEHAVIOR_LOADER;
/** Every file served from the behaviors directory (behaviors + loader). */
export const BEHAVIOR_FILES: readonly BehaviorFile[] = [...BEHAVIORS, BEHAVIOR_LOADER];

/** TypeScript source of a behavior (present in the monorepo / source checkouts). */
export function behaviorSourcePath(name: BehaviorFile): string {
  return join(PKG_ROOT, "src", "behaviors", `${name}.ts`);
}

/** Prebuilt, minified module in `dist/behaviors/` (after `pnpm build`), if present. */
export function behaviorDistPath(name: BehaviorFile): string | undefined {
  const p = join(PKG_ROOT, "dist", "behaviors", `${name}.js`);
  return existsSync(p) ? p : undefined;
}

/** Path of the built `os.css` (after `pnpm build`). Prefer {@link BASE_CSS} in code. */
export const BASE_CSS_PATH = join(PKG_ROOT, "dist", "os.css");

export interface BundleOptions {
  minify?: boolean;
  names?: readonly BehaviorFile[];
}

/** esbuild options shared by the package build and runtime bundling. */
export const BEHAVIOR_ESBUILD = {
  bundle: true,
  format: "esm" as const,
  target: ["es2020", "safari15"],
  platform: "browser" as const,
  legalComments: "none" as const,
  write: false as const,
};

/** Bundle behaviors from source with esbuild: `{ name: code }`. */
export async function bundleBehaviors(opts: BundleOptions = {}): Promise<Record<string, string>> {
  const { build } = await import("esbuild");
  const names = opts.names ?? BEHAVIOR_FILES;
  const out: Record<string, string> = {};
  await Promise.all(
    names.map(async (name) => {
      const result = await build({
        ...BEHAVIOR_ESBUILD,
        entryPoints: [behaviorSourcePath(name)],
        minify: opts.minify ?? true,
      });
      out[name] = result.outputFiles?.[0]?.text ?? "";
    }),
  );
  return out;
}

/** Write `os.css` and every behavior module into `outdir` (e.g. `dist/_os`). */
export async function writeAssets(
  outdir: string,
  opts: { cssDir?: string } = {},
): Promise<string[]> {
  const behaviorsDir = join(outdir, "behaviors");
  await mkdir(behaviorsDir, { recursive: true });
  const code = await bundleBehaviors();
  const written: string[] = [];
  for (const [name, js] of Object.entries(code)) {
    const p = join(behaviorsDir, `${name}.js`);
    await writeFile(p, js);
    written.push(p);
  }
  const cssDir = opts.cssDir ?? outdir;
  await mkdir(cssDir, { recursive: true });
  const cssPath = join(cssDir, "os.css");
  await writeFile(cssPath, BASE_CSS);
  written.push(cssPath);
  return written;
}

/** A behavior's `init(el)` (the module's default export). */
export type BehaviorInit = (el: HTMLElement) => void;

/**
 * Import a behavior module and return its `init`. Loads the TypeScript source when present
 * (monorepo, vitest) and the built `dist/` module otherwise — for tests that run behaviors in a
 * DOM environment such as happy-dom. The same modules are importable by specifier as
 * `@openspace/renderer/behavior-source/<name>`.
 */
export async function importBehavior(name: BehaviorFile): Promise<BehaviorInit> {
  const src = behaviorSourcePath(name);
  const path = existsSync(src) ? src : behaviorDistPath(name);
  if (!path) throw new Error(`behavior "${name}" not found (build @openspace/renderer first)`);
  const mod = (await import(pathToFileURL(path).href)) as { default: BehaviorInit };
  return mod.default;
}

export { BASE_CSS };
