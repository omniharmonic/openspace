/**
 * The GitHub App install step (onboarding):
 *
 * - `GET /auth/github/install[?site=<id>][&owner=<login>][&return_to=<studio path>]`
 *   Signed in. Sends the person to the App's install page for the account that owns the site's
 *   repository (preselected with `suggested_target_id`, carrying a single-use `state`), or to the
 *   installation's settings when it is limited to selected repositories.
 * - `GET /auth/github/installed?installation_id=&setup_action=&state=`
 *   The App's **Setup URL** (GitHub redirects here after an install, an update when "Redirect on
 *   update" is on, or an organization install request). Verifies the installation is one the
 *   signed-in person can access (their token's `/user/installations`), then resumes the pending
 *   site setup and returns to Studio with `?github=connected|repo_access|requested|cancelled|…`.
 * - `GET /auth/github/dev-install[...]` and `/auth/github/dev-install/confirm` — DEV_MODE's
 *   stand-in for GitHub's install page (DevGitHubAccess), so e2e covers the same redirects.
 * - `POST /dev/github/uninstall` — DEV_MODE: uninstall the dev App (runs the same code as the
 *   `installation.deleted` webhook).
 */
import { Hono } from "hono";
import { getSiteForUser, type SiteRow } from "../db/sites";
import { devInstall, devUninstall } from "../github/installations";
import { parseRepo } from "../github/types";
import { randomToken } from "../lib/crypto";
import { errorBody, notFound, unauthenticated } from "../lib/errors";
import { page, pageHeaders } from "../mcp/pages";
import { escapeHtml as esc } from "../services/renderer";
import { markGitHubRequested, resumeAfterInstall } from "../services/sites";
import { handleGitHubEvent } from "../services/webhooks";
import type { AppEnv } from "../types";
import { safeReturnTo } from "./auth";

export const githubInstallRoutes = new Hono<AppEnv>();
export const devGitHubRoutes = new Hono<AppEnv>();

/** Installs can wait on an organization owner; the state outlives a normal sign-in. */
const INSTALL_STATE_TTL_MS = 60 * 60 * 1000;
const STATE_PREFIX = "inst_";
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

interface InstallIntent {
  kind: "install";
  userId: string;
  siteId?: string;
  owner: string;
  returnTo?: string;
}

async function saveIntent(db: D1Database, intent: InstallIntent, now: number): Promise<string> {
  const state = `${STATE_PREFIX}${randomToken(24)}`;
  await db
    .prepare(
      "INSERT INTO oauth_states (state, intent_json, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(state, JSON.stringify(intent), now, now + INSTALL_STATE_TTL_MS)
    .run();
  return state;
}

/** Single use: whoever deletes the row owns it. Only install states, only unexpired ones. */
async function takeIntent(
  db: D1Database,
  state: string | undefined,
  now: number,
): Promise<InstallIntent | null> {
  if (!state?.startsWith(STATE_PREFIX) || state.length > 100) return null;
  const row = await db
    .prepare("DELETE FROM oauth_states WHERE state = ? RETURNING intent_json, expires_at")
    .bind(state)
    .first<{ intent_json: string; expires_at: number }>();
  if (!row || row.expires_at < now) return null;
  try {
    const intent = JSON.parse(row.intent_json) as InstallIntent;
    return intent.kind === "install" ? intent : null;
  } catch {
    return null;
  }
}

async function peekIntent(db: D1Database, state: string | undefined, now: number) {
  if (!state?.startsWith(STATE_PREFIX) || state.length > 100) return null;
  const row = await db
    .prepare("SELECT intent_json, expires_at FROM oauth_states WHERE state = ?")
    .bind(state)
    .first<{ intent_json: string; expires_at: number }>();
  if (!row || row.expires_at < now) return null;
  return JSON.parse(row.intent_json) as InstallIntent;
}

githubInstallRoutes.get("/github/install", async (c) => {
  const { config, services, log } = c.var;
  const studio = config.studioOrigin;
  const user = c.var.user;
  const siteId = c.req.query("site");
  if (!user)
    return c.redirect(
      `${studio}/signin?next=${encodeURIComponent(siteId ? `/sites/${siteId}` : "/sites")}`,
      302,
    );
  let owner = user.login;
  if (siteId) {
    const site = await getSiteForUser(services.db, siteId, user.id);
    if (!site) return c.redirect(`${studio}/sites?github=not_found`, 302);
    if (site.role !== "owner")
      return c.redirect(`${studio}/sites/${encodeURIComponent(siteId)}?github=owner_only`, 302);
    owner = parseRepo(site.repo).owner;
  } else {
    const asked = c.req.query("owner");
    if (asked && LOGIN_RE.test(asked)) owner = asked;
  }
  const returnTo = safeReturnTo(c.req.query("return_to"), studio);
  const now = services.now();
  const state = await saveIntent(
    services.db,
    {
      kind: "install",
      userId: user.id,
      owner,
      ...(siteId ? { siteId } : {}),
      ...(returnTo ? { returnTo } : {}),
    },
    now,
  );
  const dir = services.installations(user);
  try {
    const existing = (await dir.list()).find(
      (i) => i.account.login.toLowerCase() === owner.toLowerCase(),
    );
    // Installed, but only for selected repositories: change that on its settings page.
    if (existing?.repositorySelection === "selected")
      return c.redirect(dir.settingsUrl(existing, state), 302);
    // Already installed for everything (e.g. in another tab): carry straight on.
    if (existing)
      return c.redirect(
        `${config.hubUrl}/auth/github/installed?installation_id=${existing.id}&setup_action=install&state=${state}`,
        302,
      );
  } catch (err) {
    log.warn("listing installations before install failed", { err });
  }
  return c.redirect(dir.installUrl({ state, targetId: await dir.accountId(owner) }), 302);
});

githubInstallRoutes.get("/github/installed", async (c) => {
  const { config, services, log } = c.var;
  const studio = config.studioOrigin;
  const q = c.req.query();
  const now = services.now();
  const user = c.var.user;
  // Signed out (another browser, expired session): keep the state for after sign-in is not
  // possible across GitHub, but "Try again" re-reads the installation, so nothing is lost.
  if (!user) {
    const intent = await peekIntent(services.db, q.state, now);
    const next = intent?.siteId ? `/sites/${intent.siteId}` : "/sites";
    return c.redirect(`${studio}/signin?next=${encodeURIComponent(next)}`, 302);
  }
  let intent = await takeIntent(services.db, q.state, now);
  // Someone else's state (a forwarded link): ignore it.
  if (intent && intent.userId !== user.id) intent = null;
  const site = intent?.siteId ? await getSiteForUser(services.db, intent.siteId, user.id) : null;
  const dest = (outcome: string, welcome = false) => {
    const u = new URL(intent?.returnTo ?? `${studio}${site ? `/sites/${site.id}` : "/sites"}`);
    u.searchParams.set("github", outcome);
    if (welcome) u.searchParams.set("welcome", "1");
    return c.redirect(u.toString(), 302);
  };

  if (q.setup_action === "request") {
    // An organization member asked the org's owners to approve the App.
    if (site && site.role === "owner") await markGitHubRequested(services, site);
    return dest("requested");
  }
  const installationId = Number(q.installation_id);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return dest("cancelled");

  let installs: Awaited<ReturnType<ReturnType<typeof services.installations>["list"]>>;
  try {
    installs = await services.installations(user).list();
  } catch (err) {
    log.warn("verifying the installation failed", { err });
    return dest("error");
  }
  // The installation must be one this person can access — never trust the query string alone.
  const inst = installs.find((i) => i.id === installationId);
  if (!inst) {
    log.warn("installation not visible to the signed-in user", { userId: user.id, installationId });
    return dest("not_yours");
  }

  // Sites waiting for this account: the one in the state, else every site of theirs waiting.
  const account = inst.account.login.toLowerCase();
  const targets: SiteRow[] = [];
  if (site) {
    if (site.role === "owner" && parseRepo(site.repo).owner.toLowerCase() === account)
      targets.push(site);
  } else {
    const res = await services.db
      .prepare(
        `SELECT s.* FROM sites s JOIN site_roles r ON r.site_id = s.id AND r.user_id = ?
         WHERE r.role = 'owner' AND s.archived_at IS NULL
           AND (s.github_access IS NOT NULL OR (s.status = 'failed' AND s.installation_id IS NULL))
         ORDER BY s.created_at DESC LIMIT 20`,
      )
      .bind(user.id)
      .all<SiteRow>();
    targets.push(...res.results.filter((s) => parseRepo(s.repo).owner.toLowerCase() === account));
  }
  let allOk = true;
  for (const target of targets) {
    try {
      allOk = (await resumeAfterInstall(services, target, user, log)) && allOk;
    } catch (err) {
      log.error("resuming setup after install failed", { siteId: target.id, err });
      allOk = false;
    }
  }
  if (inst.repositorySelection === "selected") return dest("repo_access");
  return dest(allOk ? "connected" : "incomplete", Boolean(site) && allOk);
});

// --- DEV_MODE: the install page stand-in -----------------------------------------------------

const devOnly = (c: { var: AppEnv["Variables"] }) =>
  c.var.config.devMode && (c.var.config.useDevGitHub || !c.var.config.github);

githubInstallRoutes.get("/github/dev-install", async (c) => {
  if (!devOnly(c)) throw notFound();
  const user = c.var.user;
  if (!user) throw unauthenticated();
  const state = c.req.query("state") ?? "";
  const configuring = c.req.query("installation_id");
  const confirm = (selection: string) =>
    `/auth/github/dev-install/confirm?${new URLSearchParams({ state, selection, ...(configuring ? { installation_id: configuring } : {}) })}`;
  const cancel = `/auth/github/dev-install/confirm?${new URLSearchParams({ state, action: "cancel" })}`;
  const body = `<p class="muted">GitHub (dev emulation)</p>
    <h1>${configuring ? "Configure" : "Install"} OpenSpace</h1>
    <p>on your personal account <strong>${esc(user.login)}</strong></p>
    <p class="muted">OpenSpace will be able to read and write code, workflows, Pages and settings of the repositories you choose.</p>
    <div class="actions"><a class="button primary" href="${esc(confirm("all"))}">${configuring ? "Save" : "Install"} for all repositories</a></div>
    <div class="actions"><a class="button" href="${esc(confirm("selected"))}">Only select repositories</a></div>
    <div class="actions"><a class="button" href="${esc(cancel)}">Cancel</a></div>`;
  return new Response(page("Install OpenSpace", body), { headers: pageHeaders() });
});

githubInstallRoutes.get("/github/dev-install/confirm", async (c) => {
  if (!devOnly(c)) throw notFound();
  const { config, services } = c.var;
  const user = c.var.user;
  if (!user) throw unauthenticated();
  const q = c.req.query();
  const state = q.state ?? "";
  if (q.action === "cancel") {
    // GitHub doesn't redirect on cancel; people find their way back to Studio themselves.
    const intent = await peekIntent(services.db, state, services.now());
    const back = intent?.siteId ? `/sites/${intent.siteId}` : "/sites";
    return c.redirect(`${config.studioOrigin}${back}`, 302);
  }
  const selection = q.selection === "selected" ? "selected" : "all";
  const id = await devInstall(services.db, user.login, { selection, now: services.now() });
  const action = q.installation_id ? "update" : "install";
  return c.redirect(
    `${config.hubUrl}/auth/github/installed?${new URLSearchParams({ installation_id: String(id), setup_action: action, ...(state ? { state } : {}) })}`,
    302,
  );
});

/**
 * Dev only (e2e): commit text files straight to a branch of a site's emulated repository, the
 * way Claude Code or the CLI pushes to `main` without going through the draft. Owner only.
 * `{ siteId, branch?: "main", message?, edits: [{ path, find, replace }] }`: each file is read
 * from the branch and every `find` replaced.
 */
devGitHubRoutes.post("/dev/github/commit", async (c) => {
  if (!devOnly(c)) throw notFound();
  const user = c.var.user;
  if (!user) throw unauthenticated();
  const { services } = c.var;
  const body = (await c.req.json().catch(() => ({}))) as {
    siteId?: unknown;
    branch?: unknown;
    message?: unknown;
    edits?: unknown;
  };
  const site =
    typeof body.siteId === "string"
      ? await getSiteForUser(services.db, body.siteId, user.id)
      : null;
  if (site?.role !== "owner") throw notFound();
  const edits = Array.isArray(body.edits)
    ? body.edits.filter(
        (e): e is { path: string; find: string; replace: string } =>
          typeof e?.path === "string" &&
          typeof e?.find === "string" &&
          e.find.length > 0 &&
          typeof e?.replace === "string",
      )
    : [];
  if (!edits.length) return c.json(errorBody("invalid_request", "Nothing to commit."), 400);
  const gh = services.github({ site, user });
  const repo = parseRepo(site.repo);
  const branch = typeof body.branch === "string" ? body.branch : "main";
  const files: Array<{ path: string; content: string }> = [];
  for (const e of edits) {
    const text = await gh.readFile(repo, e.path, branch);
    if (text === null || !text.includes(e.find))
      return c.json(errorBody("invalid_request", `"${e.find}" isn't in ${e.path}.`), 400);
    files.push({ path: e.path, content: text.split(e.find).join(e.replace) });
  }
  const commit = await gh.commitFiles(repo, {
    branch,
    message: typeof body.message === "string" ? body.message : "Edit from outside OpenSpace",
    files,
  });
  return c.json({ sha: commit.sha });
});

devGitHubRoutes.post("/dev/github/uninstall", async (c) => {
  if (!devOnly(c)) throw notFound();
  const user = c.var.user;
  if (!user) throw unauthenticated();
  const { services } = c.var;
  const rows = await services.db
    .prepare("SELECT id FROM dev_installations WHERE account_login = ? AND deleted_at IS NULL")
    .bind(user.login)
    .all<{ id: number }>();
  for (const r of rows.results) {
    await devUninstall(services.db, r.id, services.now());
    await handleGitHubEvent(
      c.env,
      services,
      "installation",
      { action: "deleted", installation: { id: r.id, account: { login: user.login } } },
      c.var.log,
    );
  }
  return c.json({ ok: true, uninstalled: rows.results.map((r) => r.id) });
});
