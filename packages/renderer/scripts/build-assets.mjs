// Builds dist/behaviors/*.js (minified ESM) and dist/os.css after tsup.
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "behaviors");
const out = join(root, "dist", "behaviors");
await mkdir(out, { recursive: true });

const entries = (await readdir(src))
  .filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "shared.ts" && f !== "submit.ts",
  )
  .map((f) => join(src, f));
await build({
  entryPoints: entries,
  outdir: out,
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020", "safari15"],
  platform: "browser",
  legalComments: "none",
});

// os.css: bundle the stylesheet module (it reads the theme's variable contract) and evaluate it.
const tmp = join(root, "dist", ".css-entry.mjs");
await build({
  stdin: {
    contents: 'export { BASE_CSS } from "./src/styles/base-css.ts";',
    resolveDir: root,
    loader: "ts",
  },
  outfile: tmp,
  bundle: true,
  format: "esm",
  platform: "node",
});
const { BASE_CSS } = await import(pathToFileURL(tmp).href);
await writeFile(join(root, "dist", "os.css"), BASE_CSS);
await rm(tmp);
console.log(`built ${entries.length} behavior modules and os.css`);
