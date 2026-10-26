import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  // The starter shell, so a test can check the Hub's embedded copy (src/templates/starter-files.ts).
  const starter = path.join(__dirname, "../../templates/starter");
  const walk = (dir: string, base = dir): string[] =>
    readdirSync(dir).flatMap((name) => {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) return walk(abs, base);
      return name === ".gitkeep" ? [] : [path.relative(base, abs).split(path.sep).join("/")];
    });
  const files: Record<string, string> = {};
  for (const dir of ["site", "variants/cloudflare"])
    for (const rel of walk(path.join(starter, dir)))
      files[`${dir}/${rel}`] = readFileSync(path.join(starter, dir, rel), "utf8");
  const STARTER_FILES = JSON.stringify(files);
  // The renderer's behaviors, bundled now, to check the embedded copy is current.
  const { bundleBehaviorSources } = await import("./scripts/behaviors-build.mjs");
  const BEHAVIOR_BUNDLES = JSON.stringify(await bundleBehaviorSources());
  return {
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      // Each file's first test pays the Worker's cold start (blocks, presets, renderer); under a
      // parallel \`pnpm -w test\` that alone has neared vitest's 5 s default.
      testTimeout: 15_000,
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              STARTER_FILES,
              BEHAVIOR_BUNDLES,
              DEV_MODE: "true",
              LOG_LEVEL: "silent",
            },
          },
        },
      },
    },
  };
});
