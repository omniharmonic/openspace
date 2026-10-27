// Build the docs with Astro's programmatic API (the `astro` CLI refuses Node < 22.23.4; the API
// does not). Usage: node scripts/build.mjs [outDir]
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import { buildSkillZips } from "./skills.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, process.argv[2] ?? "dist");
// Claude app skills, served at /skills/<name>.zip (generated, not committed).
await buildSkillZips(resolve(root, "public", "skills"));
await build({ root, outDir, logLevel: process.env.ASTRO_LOG ?? "warn", telemetry: false });
