// Module-init cost of the built Worker bundle: evaluates `<outdir>/index.js` (from
// `wrangler deploy --dry-run --outdir <outdir>`) in Node with `cloudflare:workers` stubbed, in a
// fresh process per run, and prints the median top-level evaluation time.
// Usage: node bench/module-eval.mjs <outdir> [runs]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "dist");
const runs = Number(process.argv[3] ?? 7);
const stub = join(dir, "cf-stub.mjs");
writeFileSync(
  stub,
  "export class DurableObject {}\nexport class WorkerEntrypoint {}\nexport const env = {};\n",
);
const src = readFileSync(join(dir, "index.js"), "utf8").replaceAll(
  '"cloudflare:workers"',
  '"./cf-stub.mjs"',
);
writeFileSync(join(dir, "index.node.mjs"), src);
const probe = `const t=performance.now();await import(${JSON.stringify(join(dir, "index.node.mjs"))});console.log(performance.now()-t)`;
const times = [];
for (let i = 0; i < runs; i++)
  times.push(
    Number(execFileSync(process.execPath, ["--input-type=module", "-e", probe]).toString()),
  );
times.sort((a, b) => a - b);
console.log(
  `bundle ${(src.length / 1e6).toFixed(2)} MB, module eval median ${times[Math.floor(runs / 2)].toFixed(1)} ms (${runs} runs)`,
);
