import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { blockRegistry } from "../blocks";
import { audit } from "../db/audit";
import { latestPublish, publishBySha, updatePublish } from "../db/publishes";
import { type SiteRow, type SiteStatus, updateSite } from "../db/sites";
import { getUserByLogin } from "../db/users";
import type { HubBindings } from "../env";
import { MAIN_BRANCH, PUBLISH_WORKFLOW, parseRepo } from "../github/types";
import { toHex } from "../lib/crypto";
import type { Logger } from "../lib/log";
import { roomStub, unwrapRoom } from "../room";
import type { BuildState } from "../room/protocol";
import { buildErrorDetail, type SiteNames, translateBuildError } from "./build-errors";
import { advanceSwitch } from "./hosting-switch";
import type { Services } from "./index";
import { completeTransfer, ownerOf } from "./sites";

/** Verify GitHub's `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
export async function verifyGitHubSignature(
  secret: string,
  body: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const given = header.slice(7).toLowerCase();
  if (given.length !== mac.length) return false;
  const a = new TextEncoder().encode(mac);
  const b = new TextEncoder().encode(given);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function siteByRepo(services: Services, fullName: string): Promise<SiteRow | null> {
  return services.db
    .prepare("SELECT * FROM sites WHERE repo = ? COLLATE NOCASE AND archived_at IS NULL")
    .bind(fullName)
    .first<SiteRow>();
}

interface WorkflowRunPayload {
  action: string;
  repository: { full_name: string };
  workflow_run: {
    id: number;
    name?: string;
    path?: string;
    head_sha: string;
    head_branch: string | null;
    status: string;
    conclusion: string | null;
    html_url?: string;
    display_title?: string;
    created_at?: string;
  };
}

/**
 * Page titles and block labels from the room's document, so a failed check names "A button on
 * Home" rather than a file path. Best effort: the copy falls back to file names without it.
 */
async function siteNames(env: HubBindings, siteId: string, log?: Logger): Promise<SiteNames> {
  let doc: SiteDocument;
  try {
    doc = (await unwrapRoom(roomStub(env, siteId).getDocument(siteId))).doc;
  } catch (err) {
    log?.warn("room document for build error failed", { siteId, err });
    return {};
  }
  const pageOf = (file: string) => {
    const m = /^content\/pages\/(.+)\.json$/.exec(file);
    if (!m) return undefined;
    const slug = m[1] === "home" ? "" : m[1];
    return Object.values(doc.pages).find((p) => p.slug === slug);
  };
  return {
    pageTitle: (file) => pageOf(file)?.title,
    blockLabel: (file, path) => {
      const m = /^sections\.(\d+)\.blocks\.(\d+)(?:\.|$)/.exec(path);
      const page = pageOf(file);
      if (!m || !page) return undefined;
      const block = page.sections[Number(m[1])]?.blocks[Number(m[2])];
      return block ? blockRegistry().get(block.type)?.meta.label : undefined;
    },
  };
}

/** `workflow_run` → publish status → site status → pushed to the room (arch §5.5). */
async function onWorkflowRun(
  env: HubBindings,
  services: Services,
  p: WorkflowRunPayload,
  log?: Logger,
): Promise<string> {
  const run = p.workflow_run;
  const isPublish =
    (run.path ?? "").endsWith(`/${PUBLISH_WORKFLOW}`) ||
    run.path === PUBLISH_WORKFLOW ||
    run.name === "Publish";
  if (!isPublish || (run.head_branch && run.head_branch !== MAIN_BRANCH)) return "ignored";
  const site = await siteByRepo(services, p.repository.full_name);
  if (!site) return "unknown_site";
  // A run cancelled because a newer publish superseded it isn't a failure.
  if (
    run.status === "completed" &&
    (run.conclusion === "cancelled" || run.conclusion === "skipped")
  )
    return "superseded";
  const state: BuildState =
    run.status === "completed"
      ? run.conclusion === "success"
        ? "success"
        : "failure"
      : run.status === "in_progress"
        ? "in_progress"
        : "queued";
  let error = null;
  if (state === "failure") {
    let steps: string[] = [];
    let logText = "";
    try {
      const owner = await ownerOf(services, site);
      const failed = await services
        .github({ site, user: owner })
        .failedRun(parseRepo(site.repo), run.id);
      steps = failed.steps;
      logText = failed.log;
    } catch (err) {
      log?.warn("failed run lookup failed", { siteId: site.id, err });
    }
    error = translateBuildError({
      conclusion: run.conclusion,
      steps,
      log: logText,
      text: run.display_title ?? null,
      names: await siteNames(env, site.id, log),
    });
  }
  const now = services.now();
  const publish = await publishBySha(services.db, site.id, run.head_sha);
  // Webhooks arrive out of order: a finished publish never goes back to queued/in progress.
  const terminal = (s: string | undefined) => s === "success" || s === "failure";
  if (publish && terminal(publish.status) && !terminal(state)) return "stale";
  if (publish)
    await updatePublish(
      services.db,
      publish.id,
      {
        status: state,
        error_code: error?.code ?? null,
        error_detail: buildErrorDetail(error),
        run_url: run.html_url ?? null,
      },
      now,
    );
  // Only the newest publish decides the site's status.
  const latest = await latestPublish(services.db, site.id);
  // A successful run of a commit the Hub didn't publish (a fix pushed to main, a re-run after a
  // failed setup) started after the newest publish means the site is live again.
  const runStarted = run.created_at ? Date.parse(run.created_at) : Number.NaN;
  const recoversFailure =
    state === "success" &&
    !publish &&
    site.status === "failed" &&
    (!latest || !(runStarted < latest.created_at));
  if (!latest || latest.sha === run.head_sha || recoversFailure) {
    const status: SiteStatus =
      state === "success" ? "live" : state === "failure" ? "failed" : "building";
    await updateSite(services.db, site.id, { status, status_detail: error?.title ?? null }, now);
  }
  try {
    await roomStub(env, site.id).notifyBuild(site.id, {
      type: "build",
      state,
      sha: run.head_sha,
      kind: publish?.kind ?? "publish",
      ...(publish ? { summary: publish.summary } : {}),
      url: state === "success" ? site.url : null,
      error,
    });
  } catch (err) {
    log?.warn("room build notice failed", { siteId: site.id, err });
  }
  // A move to Cloudflare waits for this run: confirm it, or switch back to GitHub Pages.
  if (state === "success" || state === "failure") {
    try {
      await advanceSwitch(env, services, site.id, log);
    } catch (err) {
      log?.warn("hosting switch follow-up failed", { siteId: site.id, err });
    }
  }
  return state;
}

/** `repository.transferred`: finish a pending ownership transfer as soon as GitHub reports it. */
async function onRepository(
  services: Services,
  p: {
    action: string;
    repository: { name: string; full_name: string; owner: { login: string } };
    changes?: { owner?: { from?: { user?: { login: string }; organization?: { login: string } } } };
  },
): Promise<string> {
  if (p.action !== "transferred") return "ignored";
  const from = p.changes?.owner?.from?.user?.login ?? p.changes?.owner?.from?.organization?.login;
  if (!from) return "ignored";
  const site = await siteByRepo(services, `${from}/${p.repository.name}`);
  if (
    !site?.transfer_to ||
    site.transfer_to.toLowerCase() !== p.repository.owner.login.toLowerCase()
  )
    return "ignored";
  const target = await getUserByLogin(services.db, site.transfer_to);
  if (!target) return "ignored";
  await completeTransfer(services, site, target, p.repository.full_name);
  return "transferred";
}

/** Installation changes keep `sites.installation_id` current (Spike S1: per-repo installs). */
async function onInstallation(
  services: Services,
  event: string,
  p: {
    action: string;
    installation: { id: number };
    repositories?: Array<{ full_name: string }>;
    repositories_added?: Array<{ full_name: string }>;
    repositories_removed?: Array<{ full_name: string }>;
  },
): Promise<string> {
  const added =
    event === "installation"
      ? p.action === "created"
        ? p.repositories
        : []
      : p.repositories_added;
  const removed = event === "installation_repositories" ? p.repositories_removed : [];
  for (const r of added ?? [])
    await services.db
      .prepare("UPDATE sites SET installation_id = ? WHERE repo = ? COLLATE NOCASE")
      .bind(p.installation.id, r.full_name)
      .run();
  for (const r of removed ?? [])
    await services.db
      .prepare(
        "UPDATE sites SET installation_id = NULL WHERE repo = ? COLLATE NOCASE AND installation_id = ?",
      )
      .bind(r.full_name, p.installation.id)
      .run();
  if (event === "installation" && (p.action === "deleted" || p.action === "suspend"))
    await services.db
      .prepare("UPDATE sites SET installation_id = NULL WHERE installation_id = ?")
      .bind(p.installation.id)
      .run();
  return "ok";
}

export async function handleGitHubEvent(
  env: HubBindings,
  services: Services,
  event: string,
  payload: unknown,
  log?: Logger,
): Promise<string> {
  switch (event) {
    case "ping":
      return "pong";
    case "workflow_run":
      return onWorkflowRun(env, services, payload as WorkflowRunPayload, log);
    case "repository": {
      const result = await onRepository(services, payload as Parameters<typeof onRepository>[1]);
      if (result === "transferred")
        await audit(services.db, { actor: "github", action: "webhook.repository.transferred" });
      return result;
    }
    case "installation":
    case "installation_repositories":
      return onInstallation(services, event, payload as Parameters<typeof onInstallation>[2]);
    default:
      return "ignored";
  }
}
