import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CliError, type Io } from "./io";
import { compareVersions } from "./semver";

/** Astro 7 refuses to start below this Node version. */
export const ASTRO_MIN_NODE = "22.23.4";

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
  if (compareVersions(io.nodeVersion, ASTRO_MIN_NODE) < 0)
    throw new CliError(
      `Astro needs Node ${ASTRO_MIN_NODE} or newer, but this is Node ${io.nodeVersion}.\nInstall a newer Node 22 (for example with nvm: "nvm install 22 && nvm use 22") and run "openspace dev" again.`,
    );
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
