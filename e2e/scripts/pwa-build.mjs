// Two production builds of Studio that differ only in their build id, as two deploys do
// (for playwright.pwa.config.ts). `E2E_PWA_REUSE_BUILDS=1` keeps builds from a previous run.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const studio = join(here, "../../apps/studio");

for (const id of ["a", "b"]) {
  const out = join(here, "../pwa/.builds", id);
  if (process.env.E2E_PWA_REUSE_BUILDS === "1" && existsSync(join(out, "sw.js"))) continue;
  execFileSync("pnpm", ["exec", "vite", "build", "--outDir", out, "--emptyOutDir"], {
    cwd: studio,
    stdio: "ignore",
    // No Hub behind it: the update needs only the app shell.
    env: {
      ...process.env,
      VITE_BUILD_ID: `pwa-build-${id}`,
      VITE_MOCK_API: "",
      VITE_HUB_URL: "http://localhost:9",
    },
  });
}
