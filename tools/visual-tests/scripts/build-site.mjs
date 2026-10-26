// Run Astro's programmatic build for one assembled site (the CLI also checks the Node version;
// the API does not). Usage: node build-site.mjs <root> <outDir>
import { build } from "astro";

const [root, outDir] = process.argv.slice(2);
if (!root || !outDir) throw new Error("usage: build-site.mjs <root> <outDir>");
await build({ root, outDir, logLevel: process.env.ASTRO_LOG ?? "warn", telemetry: false });
