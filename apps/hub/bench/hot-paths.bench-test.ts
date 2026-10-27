import { performance } from "node:perf_hooks";
import { test, vi } from "vitest";

/**
 * CPU cost of the Hub's hot read paths: the whole app (`createApp`, every middleware) in Node —
 * the same V8 as workerd — over a fake D1 that answers instantly, so the time is the Worker's
 * own CPU, not I/O. Reports each route's first request in a fresh module graph ("first": what a
 * new isolate pays, lazy module-scope work included) and the median of repeated requests
 * ("warm"). Run: `pnpm --filter @omniharmonic/openspace-hub bench`.
 */

const N = 50;
const NOW = Date.now();

const userRow = {
  id: "usr_1",
  github_id: null,
  login: "ada",
  name: "Ada",
  email: null,
  avatar_url: null,
  is_dev: 1,
  refresh_token_enc: null,
  refresh_token_expires_at: null,
  access_token_enc: null,
  access_token_expires_at: null,
  refresh_claim: null,
  refresh_claim_at: null,
  created_at: NOW,
  updated_at: NOW,
};
const site = (i: number) => ({
  id: `st_${i}`,
  name: `Site ${i}`,
  tagline: null,
  repo: `ada/site-${i}`,
  owner_id: "usr_1",
  owner_login: "ada",
  owner_name: "Ada",
  status: "live",
  status_detail: null,
  url: null,
  template_id: ["meadow", "harbor", "field-notes", "kiln"][i % 4],
  template_version: "1.0.0",
  look: null,
  deploy_target: "github-pages",
  domain: null,
  role: "owner",
  created_at: NOW,
  updated_at: NOW,
  inbox_count: 0,
  transfer_to: null,
  transfer_requested_at: null,
  archived_at: null,
});
const sites = Array.from({ length: 8 }, (_, i) => site(i));

/** Answers the session, user and site queries the hot routes make. */
function fakeD1() {
  const answer = (sql: string) => {
    if (/FROM sessions/.test(sql))
      return [
        {
          user_id: "usr_1",
          expires_at: NOW + 1e9,
          last_seen_at: NOW,
          session_expires_at: NOW + 1e9,
          session_last_seen_at: NOW,
          ...userRow,
        },
      ];
    if (/FROM users/.test(sql)) return [userRow];
    if (/FROM sites/.test(sql)) return /s\.id = \?/.test(sql) ? [sites[0]] : sites;
    return [];
  };
  const stmt = (sql: string) => ({
    bind: () => stmt(sql),
    first: async () => answer(sql)[0] ?? null,
    all: async () => ({ results: answer(sql), success: true, meta: {} }),
    run: async () => ({ results: [], success: true, meta: {} }),
    raw: async () => [],
  });
  return { prepare: stmt, batch: async () => [], exec: async () => ({}) };
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

test("hot paths", async () => {
  // Warm vite's transform cache so per-route fresh imports measure evaluation, not transpiling.
  const t0 = performance.now();
  await import("../src/app");
  const importMs = performance.now() - t0;
  const env = {
    HUB_DB: fakeD1(),
    HUB_URL: "https://hub.example",
    STUDIO_ORIGIN: "https://studio.example",
    DEV_MODE: "false",
    LOG_LEVEL: "silent",
  };
  const headers = { cookie: "os_session=tok", origin: "https://studio.example" };
  const routes = [
    "/api/me",
    "/api/templates",
    "/api/templates/field-notes",
    "/api/sites",
    "/api/sites/st_0",
  ];
  // biome-ignore lint/suspicious/noExplicitAny: bench
  let app: any;
  const once = async (path: string) => {
    const a = performance.now();
    const res = await app.request(path, { headers }, env);
    await res.text();
    const ms = performance.now() - a;
    if (res.status !== 200) throw new Error(`${path}: ${res.status}`);
    return ms;
  };
  const rows = [`import app module graph (vite, not representative): ${importMs.toFixed(0)} ms`];
  for (const path of routes) {
    // A fresh module graph per route: "first" is a new isolate's first request to that route.
    vi.resetModules();
    const e0 = performance.now();
    app = (await import("../src/app")).createApp();
    const evalMs = performance.now() - e0;
    const first = await once(path);
    const warm: number[] = [];
    for (let i = 0; i < N; i++) warm.push(await once(path));
    rows.push(
      `${path.padEnd(28)} module eval ${evalMs.toFixed(0).padStart(4)} ms   first ${first.toFixed(1).padStart(6)} ms   warm ${median(warm).toFixed(2).padStart(6)} ms`,
    );
  }
  console.log(`\n${rows.join("\n")}\n`);
});
