import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureIo } from "./io";
import { run } from "./program";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLI_DIR = join(HERE, "..");
export const MEADOW = join(CLI_DIR, "..", "..", "tools", "fixtures", "meadow-site");
/** Inside the package so `@openspace/*` resolves by walking up (needed by eject). */
export const TMP_ROOT = join(CLI_DIR, ".tmp-tests");

const made: string[] = [];

export async function tmpDir(): Promise<string> {
  await mkdir(TMP_ROOT, { recursive: true });
  const d = await mkdtemp(join(TMP_ROOT, "t-"));
  made.push(d);
  return d;
}

export async function cleanup(): Promise<void> {
  for (const d of made.splice(0)) await rm(d, { recursive: true, force: true });
}

/** A fresh copy of the Meadow fixture site to mutate. */
export async function meadowCopy(): Promise<string> {
  const d = join(await tmpDir(), "site");
  await cp(MEADOW, d, { recursive: true });
  return d;
}

export async function cli(cwd: string, args: string[], env: Record<string, string> = {}) {
  const cap = captureIo(cwd, { NO_COLOR: "1", ...env });
  const code = await run(args, cap.io);
  return { code, out: cap.text(), err: cap.errText() };
}

// biome-ignore lint/suspicious/noExplicitAny: test helper edits arbitrary JSON fixtures
export async function editJson(file: string, fn: (v: any) => void): Promise<void> {
  const v = JSON.parse(await readFile(file, "utf8"));
  fn(v);
  await writeFile(file, `${JSON.stringify(v, null, 2)}\n`);
}
