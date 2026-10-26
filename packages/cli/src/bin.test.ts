import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "tsup";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../tsup.config";
import { CLI_DIR, MEADOW, TMP_ROOT } from "./test-helpers";

const exec = promisify(execFile);
const OUT = join(TMP_ROOT, "bin-dist");
const BIN = join(OUT, "bin.js");

async function bin(args: string[], cwd = CLI_DIR) {
  try {
    const r = await exec(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    const x = e as { code?: number; stdout?: string; stderr?: string };
    return { code: x.code ?? 1, out: x.stdout ?? "", err: x.stderr ?? "" };
  }
}

describe("built openspace binary (real process)", () => {
  beforeAll(async () => {
    const opts = Array.isArray(config) ? config[0] : config;
    await build({ ...(opts as object), dts: false, clean: false, sourcemap: false, outDir: OUT });
  }, 120_000);

  it("is a runnable file with a shebang", () => {
    expect(existsSync(BIN)).toBe(true);
    expect(readFileSync(BIN, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("checks the Meadow fixture", async () => {
    const r = await bin(["check", MEADOW]);
    expect(r.err).toBe("");
    expect(r.out).toMatch(/^OK:/m);
    expect(r.code).toBe(0);
  }, 60_000);

  it("fails with a non-zero exit code on a broken site", async () => {
    const r = await bin(["check", join(CLI_DIR, "src")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAILED");
  }, 60_000);

  it("lists commands and says mcp is coming soon", async () => {
    const help = await bin(["--help"]);
    expect(help.out).toContain("agents-md");
    const mcp = await bin(["mcp"]);
    expect(mcp.code).toBe(1);
    expect(mcp.err).toContain("coming soon");
  }, 60_000);
});
