import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "tsup";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../tsup.config";
import { astroNodeProblem } from "./dev";
import { CLI_DIR, MEADOW, meadowCopy, TMP_ROOT } from "./test-helpers";

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
    // On a Node too old for Astro, check also says so (content can be fine while builds can't run).
    const tooOld = astroNodeProblem(process.versions.node);
    expect(r.err).toBe(tooOld ? `Note: ${tooOld}\nThe site won't build until you do.\n` : "");
    expect(r.out).toMatch(/^OK:/m);
    expect(r.code).toBe(0);
  }, 60_000);

  it("fails with a non-zero exit code on a broken site", async () => {
    const r = await bin(["check", join(CLI_DIR, "src")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAILED");
  }, 60_000);

  it("lists commands and refuses mcp outside a site", async () => {
    const help = await bin(["--help"]);
    expect(help.out).toContain("agents-md");
    const mcp = await bin(["mcp", "--no-screenshots"]);
    expect(mcp.code).toBe(1);
    expect(mcp.err).toContain("Can't serve");
  }, 60_000);

  it("serves MCP over stdio: initialize, tools/list, an edit, a render, then exits on EOF", async () => {
    const site = await meadowCopy();
    const child = spawn(process.execPath, [BIN, "mcp", site, "--no-screenshots"], {
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    let stderr = "";
    const waiting = new Map<number, (v: Record<string, unknown>) => void>();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { id: number };
        waiting.get(msg.id)?.(msg as unknown as Record<string, unknown>);
      }
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    let id = 0;
    const rpc = (method: string, params?: unknown) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const n = ++id;
        waiting.set(n, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
      });
    const init = (await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bin-test", version: "1" },
    })) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("openspace");
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );
    const list = (await rpc("tools/list")) as { result: { tools: Array<{ name: string }> } };
    expect(list.result.tools.map((t) => t.name)).toContain("design_check");
    const edit = (await rpc("tools/call", {
      name: "update_site",
      arguments: { set: { tagline: "Edited over stdio" } },
    })) as { result: { isError?: boolean; content: Array<{ text: string }> } };
    expect(edit.result.isError, edit.result.content[0]?.text).toBeFalsy();
    const html = (await rpc("tools/call", { name: "render_page", arguments: { page: "/" } })) as {
      result: { content: Array<{ text: string }> };
    };
    expect(html.result.content[0]?.text).toContain("<main");
    const exited = new Promise<number | null>((resolve) =>
      child.on("exit", (code) => resolve(code)),
    );
    child.stdin.end();
    expect(await exited).toBe(0);
    expect(stderr).toContain("openspace mcp: serving");
    const siteJson = JSON.parse(await readFile(join(site, "content", "site.json"), "utf8"));
    expect(siteJson.tagline).toBe("Edited over stdio");
  }, 60_000);
});
