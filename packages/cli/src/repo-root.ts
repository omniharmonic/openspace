import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The OpenSpace monorepo root when running from a source checkout, else undefined. */
export function monorepoRoot(from = dirname(fileURLToPath(import.meta.url))): string | undefined {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(join(dir, "templates")))
      return dir;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}
