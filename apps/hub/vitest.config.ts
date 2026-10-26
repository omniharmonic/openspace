import { readFileSync } from "node:fs";
import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  // The starter's hosting files, so a test can check the Hub's embedded copies still match.
  const starter = path.join(__dirname, "../../templates/starter");
  const read = (p: string) => readFileSync(path.join(starter, p), "utf8");
  const STARTER_FILES = JSON.stringify({
    "site/.github/workflows/publish.yml": read("site/.github/workflows/publish.yml"),
    "site/astro.config.mjs": read("site/astro.config.mjs"),
    "site/package.json": read("site/package.json"),
    "variants/cloudflare/.github/workflows/publish.yml": read(
      "variants/cloudflare/.github/workflows/publish.yml",
    ),
    "variants/cloudflare/astro.config.mjs": read("variants/cloudflare/astro.config.mjs"),
    "variants/cloudflare/wrangler.jsonc": read("variants/cloudflare/wrangler.jsonc"),
    "variants/cloudflare/package.json": read("variants/cloudflare/package.json"),
  });
  return {
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              STARTER_FILES,
              DEV_MODE: "true",
              LOG_LEVEL: "silent",
            },
          },
        },
      },
    },
  };
});
