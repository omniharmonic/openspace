import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CliError, type Io } from "./io";
import { compareVersions } from "./semver";

/** Astro 7 refuses to start below this Node version. */
export const ASTRO_MIN_NODE = "22.23.4";

/**
 * Why this Node can't preview or build a site (Astro 7 refuses below {@link ASTRO_MIN_NODE}), or
 * null when it's fine. npm only warns about `engines`, so the CLI says it plainly instead.
 */
export function astroNodeProblem(nodeVersion: string): string | null {
  if (compareVersions(nodeVersion, ASTRO_MIN_NODE) >= 0) return null;
  return `Astro needs Node ${ASTRO_MIN_NODE} or newer (Node 24 recommended), but this is Node ${nodeVersion}.\nInstall Node 24 (for example with nvm: "nvm install 24 && nvm use 24").`;
}

export type Spawner = (cmd: string, args: string[], opts: { cwd: string }) => ChildProcess;

/** Find the astro CLI entry for the site in `cwd`. */
export function findAstroBin(cwd: string): string | undefined {
  try {
    const req = createRequire(join(cwd, "package.json"));
    const pkgPath = req.resolve("astro/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const rel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.astro;
    if (!rel) return undefined;
    const bin = join(dirname(pkgPath), rel);
    return existsSync(bin) ? bin : undefined;
  } catch {
    return undefined;
  }
}

/** Run `astro dev` in the site; resolves with astro's exit code. */
export async function runDev(
  io: Io,
  args: string[],
  spawner: Spawner = (c, a, o) => spawn(c, a, { ...o, stdio: "inherit" }),
  findBin: (cwd: string) => string | undefined = findAstroBin,
): Promise<number> {
  const tooOld = astroNodeProblem(io.nodeVersion);
  if (tooOld) throw new CliError(`${tooOld}\nThen run "openspace dev" again.`);
  if (!existsSync(join(io.cwd, "openspace.json")))
    throw new CliError('No openspace.json here. Run "openspace dev" from the root of your site.');
  const bin = findBin(io.cwd);
  if (!bin)
    throw new CliError(
      'Astro is not installed in this site. Run "npm install" first, then try again.',
    );
  const child = spawner(process.execPath, [bin, "dev", ...args], { cwd: io.cwd });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
