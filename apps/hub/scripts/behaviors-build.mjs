// Bundles the renderer's behavior modules exactly as @omniharmonic/openspace-renderer's build does
// (BEHAVIOR_ESBUILD in packages/renderer/src/node.ts). Shared by embed-behaviors.mjs and the
// vitest config (which checks the embedded copy is current).
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const RENDERER_DIR = join(here, "../../../packages/renderer");
const BEHAVIORS_DIR = join(RENDERER_DIR, "src/behaviors");

/** `{ name: minified ESM }` for every behavior and the loader (not `shared`/`submit` helpers). */
export async function bundleBehaviorSources() {
  const require = createRequire(join(RENDERER_DIR, "package.json"));
  const { build } = require("esbuild");
  const manifest = readdirSync(BEHAVIORS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
    .map((f) => f.slice(0, -3))
    .filter((n) => n !== "shared" && n !== "submit")
    .sort();
  const out = {};
  for (const name of manifest) {
    const result = await build({
      bundle: true,
      format: "esm",
      target: ["es2020", "safari15"],
      platform: "browser",
      legalComments: "none",
      write: false,
      minify: true,
      entryPoints: [join(BEHAVIORS_DIR, `${name}.ts`)],
    });
    out[name] = result.outputFiles?.[0]?.text ?? "";
  }
  return out;
}
