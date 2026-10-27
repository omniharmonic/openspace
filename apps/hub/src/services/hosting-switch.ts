/**
 * Moving a site to Cloudflare without risk (Studio → Finish setting up → "Open your shop"):
 *
 * 1. Wow first: no site moves before it has been live on free GitHub Pages at least once
 *    (`hasBeenLive`). Imports, templates and Claude never pick Cloudflare for a new site.
 * 2. `checkCloudflareToken` reads the owner's token once (never stored, never logged): is it
 *    active, which account, can it publish Workers, is R2 storage turned on, what is the
 *    account's workers.dev address (registered automatically when missing).
 * 3. The switch commit sets `deploy.url` to the Worker's address, so links and assets work there.
 *    `hosting_switches` tracks it; the GitHub Pages version stays live meanwhile.
 * 4. `advanceSwitch` (publish webhook, or Studio polling the hosting screen) confirms the new
 *    host answers, then points the site's address at it. A failed Cloudflare publish, or a
 *    Worker that doesn't answer, switches straight back to GitHub Pages with a plain reason.
 */
import type { SiteRow, SiteWithRole } from "../db/sites";
import { updateSite } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import type { HubBindings } from "../env";
import { MAIN_BRANCH, parseRepo } from "../github/types";
import { HttpError } from "../lib/errors";
import type { Logger } from "../lib/log";
import { roomStub, unwrapRoom } from "../room";
import { workerName } from "./hosting";
import type { Services } from "./index";
import { githubPagesUrl } from "./sites";

const CF_API = "https://api.cloudflare.com/client/v4";
const PUBLISH_WORKFLOW = "publish.yml";

export type SwitchStatus = "publishing" | "verifying" | "done" | "rolled_back" | "failed";

export interface HostingSwitchRow {
  site_id: string;
  target: string;
  status: SwitchStatus;
  sha: string | null;
  expected_url: string | null;
  previous_url: string | null;
  detail: string | null;
  created_at: number;
  updated_at: number;
}

/** What Studio shows while a move is under way (and after it settled). */
export interface SwitchView {
  to: "cloudflare" | "github-pages";
  status: SwitchStatus;
  /** The new address (workers.dev) the site is moving to. */
  url: string | null;
  /** Plain-language detail for a rollback or failure. */
  error: string | null;
  startedAt: string;
}

export function switchView(row: HostingSwitchRow | null): SwitchView | null {
  if (!row) return null;
  return {
    to: row.target === "cloudflare" ? "cloudflare" : "github-pages",
    status: row.status,
    url: row.expected_url,
    error: row.detail,
    startedAt: new Date(row.created_at).toISOString(),
  };
}

export async function getSwitch(db: D1Database, siteId: string) {
  return db
    .prepare("SELECT * FROM hosting_switches WHERE site_id = ?")
    .bind(siteId)
    .first<HostingSwitchRow>();
}

export async function recordSwitch(
  db: D1Database,
  row: Omit<HostingSwitchRow, "created_at" | "updated_at">,
  now: number,
) {
  await db
    .prepare(
      `INSERT INTO hosting_switches (site_id, target, status, sha, expected_url, previous_url, detail, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET target = excluded.target, status = excluded.status,
         sha = excluded.sha, expected_url = excluded.expected_url, previous_url = excluded.previous_url,
         detail = excluded.detail, created_at = excluded.created_at, updated_at = excluded.updated_at`,
    )
    .bind(
      row.site_id,
      row.target,
      row.status,
      row.sha,
      row.expected_url,
      row.previous_url,
      row.detail,
      now,
      now,
    )
    .run();
}

async function setSwitchStatus(
  db: D1Database,
  siteId: string,
  status: SwitchStatus,
  detail: string | null,
  now: number,
) {
  await db
    .prepare("UPDATE hosting_switches SET status = ?, detail = ?, updated_at = ? WHERE site_id = ?")
    .bind(status, detail, now, siteId)
    .run();
}

/**
 * Has the site ever been live (a successful publish, or live now)? The wow-first rule: nothing
 * moves a site off GitHub Pages before its first live version there.
 */
export async function hasBeenLive(services: Services, site: SiteRow): Promise<boolean> {
  if (site.status === "live") return true;
  const row = await services.db
    .prepare("SELECT 1 AS ok FROM publishes WHERE site_id = ? AND status = 'success' LIMIT 1")
    .bind(site.id)
    .first<{ ok: number }>();
  return !!row;
}

// --- Cloudflare token check ------------------------------------------------------------------

export interface CloudflareProblem {
  code:
    | "token_invalid"
    | "token_inactive"
    | "no_account"
    | "workers_permission"
    | "r2_disabled"
    | "r2_permission"
    | "d1_permission"
    | "unreachable";
  /** One plain sentence: what's wrong and what to do. */
  message: string;
  /** Where to fix it, when that's a page in Cloudflare. */
  fixUrl?: string;
}

export interface CloudflareCheck {
  ok: boolean;
  accounts: Array<{ id: string; name: string }>;
  account: { id: string; name: string } | null;
  /** The account's workers.dev subdomain (`maya` → `*.maya.workers.dev`). */
  subdomain: string | null;
  /** Where this site will answer on Cloudflare before a custom domain moves. */
  workersUrl: string | null;
  problems: CloudflareProblem[];
}

interface CfEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
}

/** A workers.dev subdomain from an account name: letters, digits, dashes; unique-ish. */
export function subdomainFor(name: string, salt: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "site";
  return `${base}-${
    salt
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 6) || "os"
  }`;
}

/**
 * Check a Cloudflare API token for this site's publishing. The token is used for these few reads
 * (and, when the account has none yet, registering its free workers.dev address), then dropped.
 */
export async function checkCloudflareToken(
  services: Services,
  site: Pick<SiteRow, "id" | "repo">,
  input: { token: string; accountId?: string },
): Promise<CloudflareCheck> {
  const repoName = parseRepo(site.repo).name;
  if (services.config.devMode) {
    // DEV_MODE: no real Cloudflare. A token containing "bad" fails, so the wizard's error path
    // can be exercised; anything else is a working account.
    if (input.token.includes("bad"))
      return {
        ok: false,
        accounts: [],
        account: null,
        subdomain: null,
        workersUrl: null,
        problems: [
          {
            code: "token_invalid",
            message:
              "Cloudflare didn't recognise that key. Copy it again from the page Cloudflare showed after “Create token”.",
          },
        ],
      };
    const account = { id: "0123456789abcdef0123456789abcdef", name: "Your Cloudflare account" };
    return {
      ok: true,
      accounts: [account],
      account,
      subdomain: "dev-account",
      workersUrl: `https://${workerName(repoName)}.dev-account.workers.dev/`,
      problems: [],
    };
  }
  const headers = { authorization: `Bearer ${input.token}`, accept: "application/json" };
  const get = async <T>(path: string, init: RequestInit = {}) => {
    const res = await services.fetch(`${CF_API}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });
    const body = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
    return { status: res.status, body };
  };
  const fail = (problem: CloudflareProblem, extra: Partial<CloudflareCheck> = {}) => ({
    ok: false,
    accounts: [],
    account: null,
    subdomain: null,
    workersUrl: null,
    problems: [problem],
    ...extra,
  });
  let verify: Awaited<ReturnType<typeof get<{ status: string }>>>;
  try {
    verify = await get<{ status: string }>("/user/tokens/verify");
  } catch {
    return fail({
      code: "unreachable",
      message: "We couldn't reach Cloudflare just now. Wait a moment and try again.",
    });
  }
  if (!verify.body?.success)
    return fail({
      code: "token_invalid",
      message:
        "Cloudflare didn't recognise that key. Copy it again from the page Cloudflare showed after “Create token”.",
    });
  if (verify.body.result?.status !== "active")
    return fail({
      code: "token_inactive",
      message:
        "That key is switched off or expired in Cloudflare. Create a new one and paste it here.",
    });
  const accountsRes = await get<Array<{ id: string; name: string }>>("/accounts?per_page=50");
  const accounts = (accountsRes.body?.success ? accountsRes.body.result : []).map((a) => ({
    id: a.id,
    name: a.name,
  }));
  if (!accounts.length)
    return fail({
      code: "no_account",
      message:
        "This token can't see any Cloudflare account. Use the “Create token” button again — it picks the right permissions for you.",
    });
  const account =
    (input.accountId && accounts.find((a) => a.id === input.accountId)) ||
    (accounts.length === 1 ? accounts[0] : null);
  if (!account)
    return { ok: false, accounts, account: null, subdomain: null, workersUrl: null, problems: [] };

  const problems: CloudflareProblem[] = [];
  const dash = `https://dash.cloudflare.com/${account.id}`;
  // workers.dev address (needs Workers Scripts permission); register one when missing.
  let subdomain: string | null = null;
  const sub = await get<{ subdomain: string }>(`/accounts/${account.id}/workers/subdomain`);
  if (sub.body?.success && sub.body.result?.subdomain) subdomain = sub.body.result.subdomain;
  else if (sub.status === 401 || sub.status === 403)
    problems.push({
      code: "workers_permission",
      message:
        "This token can't publish websites (Workers). Use the “Create token” button again — it picks the right permissions for you.",
    });
  else {
    const wanted = subdomainFor(account.name, site.id.slice(-6));
    const put = await get<{ subdomain: string }>(`/accounts/${account.id}/workers/subdomain`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subdomain: wanted }),
    });
    if (put.body?.success) subdomain = put.body.result?.subdomain ?? wanted;
    else
      problems.push({
        code: "workers_permission",
        message:
          "Cloudflare needs you to pick your free workers.dev address once. Open Workers in Cloudflare, accept the address it suggests, then come back and check again.",
        fixUrl: `${dash}/workers-and-pages`,
      });
  }
  // R2 (private storage for members-only and password pages) must be switched on once.
  const r2 = await get<unknown>(`/accounts/${account.id}/r2/buckets?per_page=1`);
  if (!r2.body?.success) {
    const codes = (r2.body?.errors ?? []).map((e) => e.code);
    if (r2.status === 401 || r2.status === 403 || codes.includes(10000))
      problems.push({
        code: "r2_permission",
        message:
          "This token can't use Cloudflare storage (R2). Use the “Create token” button again — it picks the right permissions for you.",
      });
    else
      problems.push({
        code: "r2_disabled",
        message:
          "Turn on Cloudflare's free storage (R2) once: open R2 in Cloudflare and click “Purchase R2 Plan” — the free tier costs nothing.",
        fixUrl: `${dash}/r2/overview`,
      });
  }
  const d1 = await get<unknown>(`/accounts/${account.id}/d1/database?per_page=1`);
  if (!d1.body?.success && (d1.status === 401 || d1.status === 403))
    problems.push({
      code: "d1_permission",
      message:
        "This token can't use Cloudflare's database (D1). Use the “Create token” button again — it picks the right permissions for you.",
    });
  return {
    ok: problems.length === 0 && subdomain !== null,
    accounts,
    account,
    subdomain,
    workersUrl: subdomain ? `https://${workerName(repoName)}.${subdomain}.workers.dev/` : null,
    problems,
  };
}

/** `https://<worker>.<subdomain>.workers.dev/` for this repository's Worker, or null. */
export function validWorkersUrl(url: string | undefined, repoName: string): string | null {
  if (!url) return null;
  const m = /^https:\/\/([a-z0-9-]+)\.([a-z0-9-]+)\.workers\.dev\/?$/.exec(url);
  if (!m || m[1] !== workerName(repoName)) return null;
  return `https://${m[1]}.${m[2]}.workers.dev/`;
}

// --- moving and confirming --------------------------------------------------------------------

/**
 * Refuse a move that would make the next publish fail, with the reason in plain words. Throws
 * 409 `not_live_yet` (wow first) or `missing_secrets`.
 */
export async function assertCanMove(
  services: Services,
  site: SiteRow,
  target: "cloudflare" | "github-pages",
  have: () => Promise<string[]>,
  required: readonly string[],
) {
  if (target !== "cloudflare") return;
  if (!(await hasBeenLive(services, site)))
    throw new HttpError(
      409,
      "not_live_yet",
      "Your site needs to be live on its free hosting first. Once the first version is online, you can move it to Cloudflare from Finish setting up.",
    );
  const names = await have();
  const missing = required.filter((n) => !names.includes(n));
  if (missing.length)
    throw new HttpError(
      409,
      "missing_secrets",
      "Cloudflare isn't connected yet, so publishing there would fail. Paste your Cloudflare key in Finish setting up → Open your shop first.",
      { missing },
    );
}

async function siteRow(services: Services, siteId: string) {
  return services.db.prepare("SELECT * FROM sites WHERE id = ?").bind(siteId).first<SiteRow>();
}

/** Does the new host answer? (DEV_MODE has no real Workers: trust the dev publish.) */
async function answers(services: Services, url: string): Promise<boolean> {
  if (services.config.devMode) return true;
  try {
    const res = await services.fetch(url, { method: "GET", redirect: "manual" });
    return res.status < 400;
  } catch {
    return false;
  }
}

const ROLLBACK_PUBLISH =
  "Cloudflare couldn't publish your site, so it stayed on GitHub Pages — nothing changed for your visitors. Check your Cloudflare key in Finish setting up and try again.";
const ROLLBACK_ANSWER =
  "Your site published to Cloudflare but didn't answer there yet, so it stayed on GitHub Pages — nothing changed for your visitors. Try again in a few minutes.";

/**
 * Move a pending switch forward: from the publish webhook, or when Studio reads the hosting
 * screen. Idempotent; returns the (possibly updated) switch.
 */
export async function advanceSwitch(
  env: HubBindings,
  services: Services,
  siteId: string,
  log?: Logger,
): Promise<HostingSwitchRow | null> {
  const sw = await getSwitch(services.db, siteId);
  const pending = sw?.status === "publishing" || sw?.status === "verifying";
  if (sw?.target !== "cloudflare" || !pending) return sw;
  const site = await siteRow(services, siteId);
  if (site?.deploy_target !== "cloudflare") return sw;
  const owner = await getUserRow(services.db, site.owner_id);
  const gh = services.github({ site, user: owner ? toUser(owner) : null });
  let state: string;
  let runSha: string | undefined;
  try {
    const run = await gh.workflowStatus(parseRepo(site.repo), {
      workflow: PUBLISH_WORKFLOW,
      ref: MAIN_BRANCH,
    });
    state = run.state;
    runSha = run.sha;
  } catch (err) {
    log?.warn("switch status failed", { siteId, err });
    return sw;
  }
  // Only a run of the switch commit (or a later one) decides.
  if (sw.sha && runSha && runSha !== sw.sha) {
    const pub = await services.db
      .prepare("SELECT created_at FROM publishes WHERE site_id = ? AND sha = ?")
      .bind(siteId, runSha)
      .first<{ created_at: number }>();
    if (!pub || pub.created_at < sw.created_at) return sw;
  }
  const now = services.now();
  if (state === "failure") {
    await rollBack(env, services, site, sw, ROLLBACK_PUBLISH, log);
    return getSwitch(services.db, siteId);
  }
  if (state !== "success") return sw;
  const url = sw.expected_url;
  if (url && !(await answers(services, url))) {
    // Workers answer within seconds of a deploy; give it a few minutes before giving up.
    if (now - sw.updated_at < 5 * 60_000 || sw.status === "publishing") {
      await setSwitchStatus(services.db, siteId, "verifying", null, now);
      return getSwitch(services.db, siteId);
    }
    await rollBack(env, services, site, sw, ROLLBACK_ANSWER, log);
    return getSwitch(services.db, siteId);
  }
  // Confirmed: the site's address follows (a custom domain keeps its own address).
  if (url && !site.domain) await updateSite(services.db, siteId, { url }, now);
  await setSwitchStatus(services.db, siteId, "done", null, now);
  return getSwitch(services.db, siteId);
}

async function rollBack(
  env: HubBindings,
  services: Services,
  site: SiteRow,
  sw: HostingSwitchRow,
  reason: string,
  log?: Logger,
) {
  const now = services.now();
  const repo = parseRepo(site.repo);
  const back = sw.previous_url ?? githubPagesUrl(repo.owner, repo.name);
  try {
    await unwrapRoom(
      roomStub(env, site.id).switchHosting(site.id, {
        userId: site.owner_id,
        target: "github-pages",
        url: back,
        message: "Kept the site on GitHub Pages (Cloudflare didn't work yet)",
      }),
    );
    await setSwitchStatus(services.db, site.id, "rolled_back", reason, now);
  } catch (err) {
    log?.error("hosting rollback failed", { siteId: site.id, err });
    await setSwitchStatus(services.db, site.id, "failed", reason, now);
  }
  await updateSite(services.db, site.id, { status_detail: reason }, now);
}

export type { SiteWithRole };
