/**
 * Update bot (arch §11.2). Daily, each site's `@omniharmonic/openspace-site-kit` version (from `package.json`
 * on main) is compared with the latest compatible release. A newer one becomes an update branch
 * `os/update-<version>` with the version bump, a pull request with the plain-language changelog,
 * and a `site_updates` record Studio shows as "Update available". Applying squash-merges the PR
 * (re-generated on the current main first, so it never reverts newer content), carries the bump
 * to the draft, and republishes. Security releases are merged automatically unless the owner
 * opted out.
 */

import { audit } from "../db/audit";
import type { SiteRow } from "../db/sites";
import type { User } from "../db/users";
import {
  DRAFT_BRANCH,
  type GitHubAccess,
  GitHubConflictError,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  parseRepo,
  type RepoRef,
} from "../github/types";
import { randomId } from "../lib/crypto";
import { conflict, notFound } from "../lib/errors";
import type { Logger } from "../lib/log";
import { growthSettings } from "./commerce";
import type { Services } from "./index";
import { compareSemver, parseVersion, type Release } from "./updates-source";

export const KIT_PACKAGE = "@omniharmonic/openspace-site-kit";
/** Packages released in lock-step with site-kit; bumped together. */
const LOCKSTEP = /^@omniharmonic\/openspace-(site-kit|cli|blocks|renderer|theme|schema)$/;

export type UpdateStatus =
  | "pending"
  | "applying"
  | "applied"
  | "dismissed"
  | "failed"
  | "superseded";

interface UpdateRow {
  id: string;
  site_id: string;
  from_version: string;
  to_version: string;
  changelog_json: string;
  security: number;
  status: UpdateStatus;
  branch: string | null;
  pr_number: number | null;
  pr_url: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  applied_at: number | null;
}

export interface UpdateView {
  id: string;
  from: string;
  to: string;
  title: string;
  changelog: Release["changelog"];
  security: boolean;
  status: UpdateStatus;
  prUrl: string | null;
  error: string | null;
  createdAt: string;
  appliedAt: string | null;
}

function title(r: { to_version: string; changelog_json: string }): string {
  const log = JSON.parse(r.changelog_json) as Release["changelog"];
  const notes = log.flatMap((e) => e.notes).slice(0, 2);
  return `OpenSpace update ${r.to_version}${notes.length ? `: ${notes.join(", ").toLowerCase()}` : ""}`.slice(
    0,
    120,
  );
}

const view = (r: UpdateRow): UpdateView => ({
  id: r.id,
  from: r.from_version,
  to: r.to_version,
  title: title(r),
  changelog: JSON.parse(r.changelog_json) as Release["changelog"],
  security: !!r.security,
  status: r.status,
  prUrl: r.pr_url,
  error: r.error,
  createdAt: new Date(r.created_at).toISOString(),
  appliedAt: r.applied_at ? new Date(r.applied_at).toISOString() : null,
});

export async function listUpdates(db: D1Database, siteId: string): Promise<UpdateView[]> {
  const rows = await db
    .prepare("SELECT * FROM site_updates WHERE site_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(siteId)
    .all<UpdateRow>();
  return rows.results.map(view);
}

/** The kit version a `package.json` depends on (range prefix stripped), or null. */
export function kitVersion(pkgJson: string | null): string | null {
  if (!pkgJson) return null;
  try {
    const pkg = JSON.parse(pkgJson) as { dependencies?: Record<string, string> };
    const v = pkg.dependencies?.[KIT_PACKAGE]?.replace(/^[\^~=v]+/, "") ?? null;
    return v && parseVersion(v) ? v : null;
  } catch {
    return null;
  }
}

/** `package.json` with the kit (and lock-step packages) at `^version`; formatting kept. */
export function bumpPackageJson(pkgJson: string, version: string): string {
  const pkg = JSON.parse(pkgJson) as Record<string, unknown>;
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const name of Object.keys(deps)) if (LOCKSTEP.test(name)) deps[name] = `^${version}`;
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

const branchFor = (version: string) => `os/update-${version}`;

function prBody(release: Release, from: string): string {
  const lines = [
    `This update moves your site from OpenSpace ${from} to ${release.version}.`,
    "",
    ...release.changelog.flatMap((e) => [
      `### ${e.version}${e.security ? " (security)" : ""}`,
      ...e.notes.map((n) => `- ${n}`),
      "",
    ]),
    "Open Studio to preview and apply it. Applying it can be undone like any other change.",
  ];
  return lines.join("\n");
}

/** Put `package.json` with the bump on the update branch, freshly based on `base`. */
async function writeBranch(
  gh: GitHubAccess,
  repo: RepoRef,
  version: string,
  base: string,
  pkgJson: string,
): Promise<string> {
  const branch = branchFor(version);
  await gh.resetBranch(repo, branch, base);
  const commit = await gh.commitFiles(repo, {
    branch,
    expectedHead: base,
    message: `OpenSpace update ${version}`,
    files: [{ path: "package.json", content: bumpPackageJson(pkgJson, version) }],
    author: { name: "OpenSpace" },
  });
  return commit.sha;
}

/**
 * Check one site; creates (at most) one pending update for the newest release. Idempotent:
 * an existing record for that version is returned as is.
 */
export async function checkSiteUpdate(
  services: Services,
  site: SiteRow,
  log?: Logger,
): Promise<UpdateView | null> {
  const gh = services.github({ site });
  const repo = parseRepo(site.repo);
  const main = await gh.getRef(repo, MAIN_BRANCH);
  if (!main) return null;
  const pkg = await gh.readFile(repo, "package.json", main);
  const current = kitVersion(pkg);
  if (!current || !pkg) return null;
  const release = await services.growth.updates.latest(current);
  if (!release) return null;
  const existing = await services.db
    .prepare("SELECT * FROM site_updates WHERE site_id = ? AND to_version = ?")
    .bind(site.id, release.version)
    .first<UpdateRow>();
  if (existing) return view(existing);
  const now = services.now();
  // Older pending updates are replaced by the newer one.
  await services.db
    .prepare(
      "UPDATE site_updates SET status = 'superseded', updated_at = ? WHERE site_id = ? AND status = 'pending'",
    )
    .bind(now, site.id)
    .run();
  const id = randomId("upd", 10);
  const changelog = JSON.stringify(release.changelog);
  const ins = await services.db
    .prepare(
      `INSERT INTO site_updates (id, site_id, from_version, to_version, changelog_json, security, status,
         branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
       ON CONFLICT (site_id, to_version) DO NOTHING`,
    )
    .bind(
      id,
      site.id,
      current,
      release.version,
      changelog,
      release.security ? 1 : 0,
      branchFor(release.version),
      now,
      now,
    )
    .run();
  if ((ins.meta.changes ?? 0) !== 1) {
    const row = await services.db
      .prepare("SELECT * FROM site_updates WHERE site_id = ? AND to_version = ?")
      .bind(site.id, release.version)
      .first<UpdateRow>();
    return row ? view(row) : null;
  }
  try {
    await writeBranch(gh, repo, release.version, main, pkg);
    const pr = await gh.openPullRequest(repo, {
      head: branchFor(release.version),
      base: MAIN_BRANCH,
      title: title({ to_version: release.version, changelog_json: changelog }),
      body: prBody(release, current),
    });
    await services.db
      .prepare("UPDATE site_updates SET pr_number = ?, pr_url = ?, updated_at = ? WHERE id = ?")
      .bind(pr.number, pr.url, services.now(), id)
      .run();
  } catch (err) {
    log?.warn("update PR could not be opened", { siteId: site.id, err });
    await services.db
      .prepare("UPDATE site_updates SET error = ?, updated_at = ? WHERE id = ?")
      .bind(err instanceof Error ? err.message.slice(0, 300) : "failed", services.now(), id)
      .run();
  }
  if (release.security && (await growthSettings(services.db, site.id)).autoMergeSecurity) {
    try {
      return await applyUpdate(services, site, null, id, log);
    } catch (err) {
      log?.warn("security update auto-merge failed", { siteId: site.id, err });
    }
  }
  const row = await services.db
    .prepare("SELECT * FROM site_updates WHERE id = ?")
    .bind(id)
    .first<UpdateRow>();
  return row ? view(row) : null;
}

/** Merge an update (Studio "Update" button, or auto-merge for security releases). */
export async function applyUpdate(
  services: Services,
  site: SiteRow,
  user: User | null,
  updateId: string,
  log?: Logger,
): Promise<UpdateView> {
  const db = services.db;
  const claim = await db
    .prepare(
      "UPDATE site_updates SET status = 'applying', updated_at = ? WHERE id = ? AND site_id = ? AND status IN ('pending', 'failed')",
    )
    .bind(services.now(), updateId, site.id)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) {
    const exists = await db
      .prepare("SELECT status FROM site_updates WHERE id = ? AND site_id = ?")
      .bind(updateId, site.id)
      .first<{ status: string }>();
    if (!exists) throw notFound("We couldn't find that update.");
    throw conflict("update_not_pending", "This update was already handled.");
  }
  const u = (await db
    .prepare("SELECT * FROM site_updates WHERE id = ?")
    .bind(updateId)
    .first<UpdateRow>()) as UpdateRow;
  const gh = services.github({ site, user });
  const repo = parseRepo(site.repo);
  try {
    const main = await gh.getRef(repo, MAIN_BRANCH);
    const pkg = main ? await gh.readFile(repo, "package.json", main) : null;
    if (!main || !pkg) throw new Error("The site has no package.json");
    const now = kitVersion(pkg);
    // Already merged (e.g. a retry after the post-merge step failed): skip straight to the draft.
    const merged = !!now && compareSemver(now, u.to_version) >= 0;
    if (!merged) await mergeUpdate(gh, repo, u, main, pkg, db);
    await carryToDraft(gh, repo, u.to_version);
    // Dev emulation only builds on dispatch; real GitHub builds on the push to main.
    if (gh.kind === "dev" && !merged)
      await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    await markApplied(services, u.id);
    await audit(
      db,
      {
        siteId: site.id,
        actor: user?.id ?? "system",
        action: "update.apply",
        meta: { to: u.to_version },
      },
      services.now(),
    );
  } catch (err) {
    log?.warn("update apply failed", { siteId: site.id, err });
    await db
      .prepare("UPDATE site_updates SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .bind(err instanceof Error ? err.message.slice(0, 300) : "failed", services.now(), u.id)
      .run();
    throw conflict("update_failed", "The update couldn't be applied. Please try again.");
  }
  return view(
    (await db
      .prepare("SELECT * FROM site_updates WHERE id = ?")
      .bind(u.id)
      .first<UpdateRow>()) as UpdateRow,
  );
}

/** Re-generate the update branch on the current main and squash-merge its PR. */
async function mergeUpdate(
  gh: GitHubAccess,
  repo: RepoRef,
  u: UpdateRow,
  main: string,
  pkg: string,
  db: D1Database,
) {
  // Re-generate on the current main so merging never reverts newer content.
  const head = await writeBranch(gh, repo, u.to_version, main, pkg);
  let number = u.pr_number;
  if (!number) {
    const pr = await gh.openPullRequest(repo, {
      head: branchFor(u.to_version),
      base: MAIN_BRANCH,
      title: title(u),
      body: prBody(
        { version: u.to_version, changelog: JSON.parse(u.changelog_json), security: !!u.security },
        u.from_version,
      ),
    });
    number = pr.number;
    await db
      .prepare("UPDATE site_updates SET pr_number = ?, pr_url = ? WHERE id = ?")
      .bind(pr.number, pr.url, u.id)
      .run();
  }
  await gh.mergePullRequest(repo, number, { title: title(u), sha: head });
}

/** Carry the bump to the draft too, or the next publish (draft tree → main) would undo it. */
async function carryToDraft(gh: GitHubAccess, repo: RepoRef, version: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const draft = await gh.getRef(repo, DRAFT_BRANCH);
    if (!draft) return;
    const dpkg = await gh.readFile(repo, "package.json", draft);
    const at = kitVersion(dpkg);
    if (!dpkg || (at && compareSemver(at, version) >= 0)) return;
    try {
      await gh.commitFiles(repo, {
        branch: DRAFT_BRANCH,
        expectedHead: draft,
        message: `OpenSpace update ${version}`,
        files: [{ path: "package.json", content: bumpPackageJson(dpkg, version) }],
        author: { name: "OpenSpace" },
      });
      return;
    } catch (err) {
      if (!(err instanceof GitHubConflictError) || attempt === 2) throw err;
    }
  }
}

async function markApplied(services: Services, id: string) {
  const now = services.now();
  await services.db
    .prepare(
      "UPDATE site_updates SET status = 'applied', applied_at = ?, error = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(now, now, id)
    .run();
}

export async function dismissUpdate(services: Services, siteId: string, id: string): Promise<void> {
  const res = await services.db
    .prepare(
      "UPDATE site_updates SET status = 'dismissed', updated_at = ? WHERE id = ? AND site_id = ? AND status IN ('pending', 'failed')",
    )
    .bind(services.now(), id, siteId)
    .run();
  if ((res.meta.changes ?? 0) !== 1) throw notFound("That update isn't waiting.");
}

/** Daily cron: check every active site (bounded per run). */
export async function runUpdateChecks(services: Services, log?: Logger, limit = 500) {
  const sites = await services.db
    .prepare(
      "SELECT * FROM sites WHERE archived_at IS NULL AND status = 'live' ORDER BY id LIMIT ?",
    )
    .bind(limit)
    .all<SiteRow>();
  let created = 0;
  let failed = 0;
  for (const site of sites.results) {
    try {
      const u = await checkSiteUpdate(services, site, log);
      if (u && Date.parse(u.createdAt) >= services.now() - 60_000) created++;
    } catch (err) {
      failed++;
      log?.warn("update check failed", { siteId: site.id, err });
    }
  }
  return { checked: sites.results.length, created, failed };
}
