// Build openspace.dev with Astro's programmatic API (the `astro` CLI refuses Node < 22.23.4;
// the API does not). Usage: node scripts/build.mjs <root> <outDir> (both relative to the
// current directory, so `node apps/www/scripts/build.mjs apps/www apps/www/dist` works from the repo).
import { resolve } from "node:path";
import { build } from "astro";

const [root = ".", outDir = "dist"] = process.argv.slice(2);
await build({
  root: resolve(root),
  outDir: resolve(outDir),
  logLevel: process.env.ASTRO_LOG ?? "warn",
  telemetry: false,
});
