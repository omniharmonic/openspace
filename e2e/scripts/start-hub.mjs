#!/usr/bin/env node
// Starts the real Hub (`wrangler dev`, DEV_MODE) for the e2e suite:
//  1. a fresh local persistence dir per run and Hub port (D1, DOs, KV, R2),
//  2. deterministic secrets written to an env file at start (derived from a fixed seed — no
//     secret-shaped literals in the repo),
//  3. D1 migrations applied into that dir,
//  4. `wrangler dev` on the e2e port with HUB_URL / STUDIO_ORIGIN pointing at the e2e servers and
//     `--test-scheduled` so specs can fire the cron (`/__scheduled?cron=...`).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(here, "..");
const hubDir = resolve(e2eDir, "../apps/hub");
const HUB_PORT = Number(process.env.E2E_HUB_PORT ?? 8877);
const STUDIO_PORT = Number(process.env.E2E_STUDIO_PORT ?? 5277);
// One state dir per Hub port: a second suite on other ports (another checkout's run, or a single
// spec run alongside) must not wipe the D1/DO files of a Hub that is still running.
const stateDir = resolve(e2eDir, ".state", String(HUB_PORT));
const persistDir = join(stateDir, "hub");
const envFile = join(stateDir, "hub.env");

const derive = (label, encoding = "base64") =>
  createHash("sha256").update(`openspace-e2e:${label}`).digest(encoding);

rmSync(persistDir, { recursive: true, force: true });
mkdirSync(persistDir, { recursive: true });
writeFileSync(
  envFile,
  [
    `TOKEN_ENC_KEY=${derive("token-enc-key")}`,
    `HUB_SECRET=${derive("hub-secret", "hex")}`,
    `GITHUB_WEBHOOK_SECRET=${derive("github-webhook", "hex")}`,
    "",
  ].join("\n"),
);

const wrangler = join(hubDir, "node_modules/.bin/wrangler");
const migrate = spawnSync(
  wrangler,
  ["d1", "migrations", "apply", "openspace-hub", "--local", "--persist-to", persistDir],
  { cwd: hubDir, stdio: "inherit", env: { ...process.env, CI: "1" } },
);
if (migrate.status !== 0) {
  console.error("[e2e] D1 migrations failed");
  process.exit(migrate.status ?? 1);
}

const child = spawn(
  wrangler,
  [
    "dev",
    "--port",
    String(HUB_PORT),
    "--inspector-port",
    String(HUB_PORT + 1000),
    "--persist-to",
    persistDir,
    "--env-file",
    envFile,
    "--var",
    `HUB_URL:http://localhost:${HUB_PORT}`,
    "--var",
    `STUDIO_ORIGIN:http://localhost:${STUDIO_PORT}`,
    "--var",
    `LOG_LEVEL:${process.env.E2E_HUB_LOG_LEVEL ?? "warn"}`,
    "--test-scheduled",
    "--show-interactive-dev-session=false",
  ],
  {
    cwd: hubDir,
    stdio: process.env.E2E_HUB_LOG_FILE ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, CI: "1" },
  },
);
// E2E_HUB_LOG_FILE=path keeps the Hub's output (wrangler + Worker logs) for diagnosing a run.
if (process.env.E2E_HUB_LOG_FILE) {
  const out = createWriteStream(process.env.E2E_HUB_LOG_FILE);
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  child.stderr?.pipe(process.stderr);
}

const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
