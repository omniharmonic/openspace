/**
 * Per-site automation the Hub runs on its minute cron:
 *
 * - **Scheduled collection items** (posts/events with `status: scheduled` + `publishAt`) are
 *   baked in at build time, so they only appear when the site is rebuilt. Every publish records
 *   the next future `publishAt`; when it is due the cron starts the publish workflow on `main`
 *   (in dev mode the emulated run is the rebuild) and records the next one.
 * - **Turnstile**: the public site key reaches site builds as the repository variable
 *   `OPENSPACE_TURNSTILE_SITE_KEY` (and in `openspace.json` for new sites). New sites get it at
 *   creation; existing sites are backfilled here, a few per minute, whenever the Hub's key
 *   changes.
 */
import type { SiteDocument } from "@openspace/schema";
import type { SiteRow } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import { type GitHubAccess, MAIN_BRANCH, PUBLISH_WORKFLOW, parseRepo } from "../github/types";
import type { Logger } from "../lib/log";
import type { Services } from "./index";
import { readSiteDocument } from "./sites";

export const TURNSTILE_VARIABLE = "OPENSPACE_TURNSTILE_SITE_KEY";
const PER_RUN = 20;

/** The earliest `publishAt` after `now` among scheduled collection items, or null. */
export function nextScheduledAt(doc: SiteDocument, now: number): number | null {
  let next: number | null = null;
  for (const items of Object.values(doc.collections))
    for (const item of Object.values(items)) {
      const fm = item.frontmatter as { status?: unknown; publishAt?: unknown };
      if (fm.status !== "scheduled" || typeof fm.publishAt !== "string") continue;
      const at = Date.parse(fm.publishAt);
      if (Number.isFinite(at) && at > now && (next === null || at < next)) next = at;
    }
  return next;
}

async function upsert(
  db: D1Database,
  siteId: string,
  patch: { next_publish_at?: number | null; turnstile_key?: string | null },
  now: number,
) {
  await db
    .prepare(
      `INSERT INTO site_automation (site_id, next_publish_at, turnstile_key, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (site_id) DO UPDATE SET
         next_publish_at = CASE WHEN ?5 THEN excluded.next_publish_at ELSE next_publish_at END,
         turnstile_key = CASE WHEN ?6 THEN excluded.turnstile_key ELSE turnstile_key END,
         updated_at = excluded.updated_at`,
    )
    .bind(
      siteId,
      patch.next_publish_at ?? null,
      patch.turnstile_key ?? null,
      now,
      "next_publish_at" in patch ? 1 : 0,
      "turnstile_key" in patch ? 1 : 0,
    )
    .run();
}

/** Remember when the published document's next scheduled item goes live. */
export async function recordNextScheduled(
  services: Pick<Services, "db" | "now">,
  siteId: string,
  doc: SiteDocument,
): Promise<number | null> {
  const next = nextScheduledAt(doc, services.now());
  await upsert(services.db, siteId, { next_publish_at: next }, services.now());
  return next;
}

async function ownerGitHub(services: Services, site: SiteRow): Promise<GitHubAccess> {
  const owner = await getUserRow(services.db, site.owner_id);
  return services.github({ site, user: owner ? toUser(owner) : null });
}

/** Rebuild sites whose next scheduled item is due; returns the site ids rebuilt. */
export async function runDueScheduledItems(
  services: Services,
  log: Logger,
  now = services.now(),
): Promise<string[]> {
  const due = await services.db
    .prepare(
      `SELECT s.* FROM site_automation a JOIN sites s ON s.id = a.site_id
       WHERE a.next_publish_at IS NOT NULL AND a.next_publish_at <= ? AND s.archived_at IS NULL
       ORDER BY a.next_publish_at LIMIT ?`,
    )
    .bind(now, PER_RUN)
    .all<SiteRow>();
  const done: string[] = [];
  for (const site of due.results) {
    try {
      const gh = await ownerGitHub(services, site);
      const repo = parseRepo(site.repo);
      if (await gh.getRef(repo, MAIN_BRANCH))
        await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
      const { doc } = await readSiteDocument(services, site, "published");
      await recordNextScheduled(services, site.id, doc);
      done.push(site.id);
    } catch (err) {
      log.warn("scheduled item rebuild failed", { siteId: site.id, err });
      // Try again in five minutes rather than every minute.
      await upsert(services.db, site.id, { next_publish_at: now + 5 * 60_000 }, now);
    }
  }
  return done;
}

/** Set the Turnstile site key as the repository variable (and remember it). */
export async function syncTurnstileVariable(
  services: Services,
  site: SiteRow,
  gh?: GitHubAccess,
): Promise<boolean> {
  const key = services.pub.config.turnstile.siteKey;
  if (!key) return false;
  const access = gh ?? (await ownerGitHub(services, site));
  await access.setVariable(parseRepo(site.repo), TURNSTILE_VARIABLE, key);
  await upsert(services.db, site.id, { turnstile_key: key }, services.now());
  return true;
}

/** Backfill the Turnstile variable on sites that don't have the Hub's current key yet. */
export async function backfillTurnstileVariables(services: Services, log: Logger): Promise<number> {
  const key = services.pub.config.turnstile.siteKey;
  if (!key) return 0;
  const rows = await services.db
    .prepare(
      `SELECT s.* FROM sites s LEFT JOIN site_automation a ON a.site_id = s.id
       WHERE s.archived_at IS NULL
         AND (a.turnstile_key IS NULL
              OR (a.turnstile_key != ?1 AND (a.turnstile_key != 'failed' OR a.updated_at < ?2)))
       ORDER BY s.created_at LIMIT ?3`,
    )
    .bind(key, services.now() - 60 * 60_000, PER_RUN)
    .all<SiteRow>();
  let n = 0;
  for (const site of rows.results) {
    try {
      if (await syncTurnstileVariable(services, site)) n++;
    } catch (err) {
      log.warn("turnstile variable backfill failed", { siteId: site.id, err });
      // Don't retry a broken repository every minute: again in an hour.
      await upsert(services.db, site.id, { turnstile_key: "failed" }, services.now());
    }
  }
  return n;
}

// ---- repository identity (binds the publish workflow's OIDC token to this site's repository) ----

export interface RepoIdentity {
  repoId: string;
  ownerId: string | null;
}

/** Record the repository's numeric ids (GitHub's, stable across renames). */
export async function recordRepoIdentity(
  services: Pick<Services, "db" | "now">,
  siteId: string,
  info: { id?: number; ownerId?: number } | null,
): Promise<RepoIdentity | null> {
  if (!info || typeof info.id !== "number") return null;
  const identity = {
    repoId: String(info.id),
    ownerId: typeof info.ownerId === "number" ? String(info.ownerId) : null,
  };
  await services.db
    .prepare(
      `INSERT INTO site_automation (site_id, repo_id, repo_owner_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET repo_id = excluded.repo_id,
         repo_owner_id = excluded.repo_owner_id, updated_at = excluded.updated_at`,
    )
    .bind(siteId, identity.repoId, identity.ownerId, services.now())
    .run();
  return identity;
}

export async function repoIdentity(db: D1Database, siteId: string): Promise<RepoIdentity | null> {
  const row = await db
    .prepare("SELECT repo_id, repo_owner_id FROM site_automation WHERE site_id = ?")
    .bind(siteId)
    .first<{ repo_id: string | null; repo_owner_id: string | null }>();
  return row?.repo_id ? { repoId: row.repo_id, ownerId: row.repo_owner_id } : null;
}

/** The repository's current ids from GitHub (nothing is written). */
export async function liveRepoIdentity(
  services: Services,
  site: SiteRow,
  gh?: GitHubAccess,
): Promise<RepoIdentity | null> {
  const access = gh ?? (await ownerGitHub(services, site));
  const info = await access.getRepo(parseRepo(site.repo));
  if (!info || typeof info.id !== "number") return null;
  return {
    repoId: String(info.id),
    ownerId: typeof info.ownerId === "number" ? String(info.ownerId) : null,
  };
}

/**
 * Record `live` only where it can't replace a binding: when nothing is recorded yet, or for the
 * same repository id (a transfer changes only the owner id). Conditional in SQL, so concurrent
 * requests can't interleave a different repository's ids. Returns what is recorded afterwards.
 */
export async function adoptRepoIdentity(
  services: Pick<Services, "db" | "now">,
  siteId: string,
  live: RepoIdentity,
): Promise<RepoIdentity | null> {
  const now = services.now();
  await services.db.batch([
    services.db
      .prepare(
        `INSERT INTO site_automation (site_id, repo_id, repo_owner_id, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (site_id) DO UPDATE SET repo_id = excluded.repo_id,
           repo_owner_id = excluded.repo_owner_id, updated_at = excluded.updated_at
         WHERE site_automation.repo_id IS NULL OR site_automation.repo_id = excluded.repo_id`,
      )
      .bind(siteId, live.repoId, live.ownerId, now),
  ]);
  return repoIdentity(services.db, siteId);
}

/** Fetch the repository's ids from GitHub and record them if allowed (setup, backfill). */
export async function refreshRepoIdentity(
  services: Services,
  site: SiteRow,
  gh?: GitHubAccess,
): Promise<RepoIdentity | null> {
  const live = await liveRepoIdentity(services, site, gh);
  return live ? adoptRepoIdentity(services, site.id, live) : null;
}
