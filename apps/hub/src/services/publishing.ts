import { z } from "zod";
import { audit } from "../db/audit";
import { listPublishes } from "../db/publishes";
import type { SiteWithRole } from "../db/sites";
import type { User } from "../db/users";
import type { HubBindings } from "../env";
import { DRAFT_BRANCH, MAIN_BRANCH, parseRepo } from "../github/types";
import { randomId } from "../lib/crypto";
import { HttpError, notFound } from "../lib/errors";
import { roomStub } from "../room";
import type { PublishResult } from "../room/draft-room";
import { buildErrorByCode } from "./build-errors";
import type { Services } from "./index";
import { loadSiteDocument } from "./site-files";

/** Who may do what with publishing (PRD §4.5). */
export const PUBLISH_ROLE = "editor" as const;
export const ROLLBACK_ROLE = "designer" as const;

// --- versions (history) ----------------------------------------------------------------------

export interface VersionView {
  sha: string;
  /** First line of the message: the publish summary ("Edited Home; added 2 images"). */
  summary: string;
  author: string;
  date: string;
  kind: "publish" | "rollback" | "revert" | "setup";
  status: "queued" | "in_progress" | "success" | "failure" | null;
  error: { code: string; title: string; message: string; fix: string | null } | null;
  /** The version the live site is on. */
  current: boolean;
}

/** Every commit on main is a published version (arch §5.4), newest first. */
export async function listVersions(
  services: Services,
  site: SiteWithRole,
  owner: User | null,
  limit = 50,
): Promise<VersionView[]> {
  const gh = services.github({ site, user: owner });
  const [commits, publishes] = await Promise.all([
    gh.listCommits(parseRepo(site.repo), { ref: MAIN_BRANCH, limit }),
    listPublishes(services.db, site.id, 200),
  ]);
  const bySha = new Map(publishes.map((p) => [p.sha, p]));
  return commits.map((c, i) => {
    const p = bySha.get(c.sha);
    return {
      sha: c.sha,
      summary: c.message.split("\n")[0] ?? "",
      author: c.author.name,
      date: c.date,
      kind: p?.kind ?? (i === commits.length - 1 ? "setup" : "publish"),
      status: p?.status ?? null,
      error: p?.status === "failure" ? buildErrorByCode(p.error_code) : null,
      current: i === 0,
    };
  });
}

// --- snapshots -------------------------------------------------------------------------------

export const SNAPSHOT_PREFIX = "os/snap/";

export const SnapshotNameSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .transform((s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .refine((s) => s.length > 0, "Give the snapshot a name"),
});

export interface SnapshotView {
  name: string;
  tag: string;
  sha: string;
  /** Made automatically (agent sessions, before a rollback) rather than by a person. */
  automatic: boolean;
  date: string | null;
}

export async function listSnapshots(
  services: Services,
  site: SiteWithRole,
  owner: User | null,
): Promise<SnapshotView[]> {
  const gh = services.github({ site, user: owner });
  const repo = parseRepo(site.repo);
  const tags = await gh.listTags(repo, SNAPSHOT_PREFIX);
  const out: SnapshotView[] = [];
  for (const t of tags) {
    const name = t.name.slice(SNAPSHOT_PREFIX.length);
    const stamp = /(?:agent|before-rollback)-(\d{12,})/.exec(name)?.[1];
    out.push({
      name,
      tag: t.name,
      sha: t.sha,
      automatic: /^(agent|before-rollback)-/.test(name),
      date: stamp ? new Date(Number(stamp)).toISOString() : null,
    });
  }
  return out.sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name),
  );
}

/** Restore a snapshot into the draft — as ops through the room (Global Constraint 5). */
export async function restoreSnapshot(
  env: HubBindings,
  services: Services,
  site: SiteWithRole,
  owner: User | null,
  user: User,
  name: string,
): Promise<{ applied: number; failed: number; seq: number }> {
  const gh = services.github({ site, user: owner });
  const repo = parseRepo(site.repo);
  const tag = `${SNAPSHOT_PREFIX}${name}`;
  const sha = await gh.getRef(repo, `tags/${tag}`);
  if (!sha) throw notFound("We couldn't find that snapshot.");
  const files = await gh.readFiles(repo, sha, { textOnly: true });
  const doc = loadSiteDocument(files);
  const result = await roomStub(env, site.id).restoreDocument(site.id, user.id, doc);
  await audit(services.db, {
    siteId: site.id,
    actor: user.id,
    action: "snapshot.restore",
    meta: { tag, ...result },
  });
  return result;
}

// --- scheduled publish ------------------------------------------------------------------------

export const ScheduleSchema = z.strictObject({
  /** ISO date-time (with offset) or epoch ms; at least a minute from now, within a year. */
  at: z.union([z.iso.datetime({ offset: true }), z.number().int()]),
});

export interface ScheduleView {
  id: string;
  kind: string;
  runAt: string;
  status: string;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface ScheduleRow {
  id: string;
  site_id: string;
  kind: string;
  run_at: number;
  payload: string | null;
  status: string;
  created_by: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  error: string | null;
}

const toScheduleView = (r: ScheduleRow): ScheduleView => ({
  id: r.id,
  kind: r.kind,
  runAt: new Date(r.run_at).toISOString(),
  status: r.status,
  error: r.error,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function schedulePublish(
  services: Services,
  site: SiteWithRole,
  user: User,
  at: string | number,
): Promise<ScheduleView> {
  const runAt = typeof at === "number" ? at : Date.parse(at);
  const now = services.now();
  if (!Number.isFinite(runAt) || runAt < now + 30_000)
    throw new HttpError(400, "invalid_time", "Pick a time at least a minute from now.");
  if (runAt > now + 366 * 24 * 3600_000)
    throw new HttpError(400, "invalid_time", "Pick a time within the next year.");
  const id = randomId("sch");
  await services.db
    .prepare(
      "INSERT INTO schedules (id, site_id, kind, run_at, payload, status, created_by, created_at) VALUES (?, ?, 'publish', ?, NULL, 'pending', ?, ?)",
    )
    .bind(id, site.id, runAt, user.id, now)
    .run();
  await audit(services.db, {
    siteId: site.id,
    actor: user.id,
    action: "schedule.create",
    meta: { id, runAt },
  });
  const row = (await services.db
    .prepare("SELECT * FROM schedules WHERE id = ?")
    .bind(id)
    .first<ScheduleRow>()) as ScheduleRow;
  return toScheduleView(row);
}

export async function listSchedules(services: Services, siteId: string): Promise<ScheduleView[]> {
  const r = await services.db
    .prepare(
      "SELECT * FROM schedules WHERE site_id = ? AND kind = 'publish' ORDER BY run_at DESC LIMIT 50",
    )
    .bind(siteId)
    .all<ScheduleRow>();
  return r.results.map(toScheduleView);
}

export async function cancelSchedule(
  services: Services,
  siteId: string,
  id: string,
  user: User,
): Promise<void> {
  const res = await services.db
    .prepare(
      "UPDATE schedules SET status = 'cancelled', finished_at = ? WHERE id = ? AND site_id = ? AND status = 'pending'",
    )
    .bind(services.now(), id, siteId)
    .run();
  if (res.meta.changes !== 1) throw notFound("That scheduled publish isn't waiting any more.");
  await audit(services.db, { siteId, actor: user.id, action: "schedule.cancel", meta: { id } });
}

/**
 * Cron (every minute): claim due publish schedules and run the same publish routine through the
 * site's room. A claim is an atomic `pending → running` update, so overlapping cron runs never
 * publish twice.
 */
export async function runDueSchedules(
  env: HubBindings,
  services: Services,
  now: number,
): Promise<{ ran: number; failed: number }> {
  const due = await services.db
    .prepare(
      "SELECT * FROM schedules WHERE status = 'pending' AND kind = 'publish' AND run_at <= ? ORDER BY run_at LIMIT 25",
    )
    .bind(now)
    .all<ScheduleRow>();
  let ran = 0;
  let failed = 0;
  for (const s of due.results) {
    const claim = await services.db
      .prepare(
        "UPDATE schedules SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(now, s.id)
      .run();
    if (claim.meta.changes !== 1) continue;
    try {
      const site = await services.db
        .prepare("SELECT archived_at FROM sites WHERE id = ?")
        .bind(s.site_id)
        .first<{ archived_at: number | null }>();
      if (!site || site.archived_at) throw new Error("Site no longer exists");
      const result: PublishResult = await roomStub(env, s.site_id).publish(s.site_id, {
        userId: s.created_by,
        actor: `schedule:${s.id}`,
      });
      await services.db
        .prepare("UPDATE schedules SET status = 'done', finished_at = ?, payload = ? WHERE id = ?")
        .bind(services.now(), JSON.stringify(result), s.id)
        .run();
      ran++;
    } catch (err) {
      failed++;
      await services.db
        .prepare("UPDATE schedules SET status = 'failed', finished_at = ?, error = ? WHERE id = ?")
        .bind(services.now(), (err as Error).message.slice(0, 500), s.id)
        .run();
    }
  }
  return { ran, failed };
}

/** The draft branch exists — i.e. setup finished and the room can take over publishing. */
export async function draftReady(services: Services, site: SiteWithRole, owner: User | null) {
  const gh = services.github({ site, user: owner });
  const repo = parseRepo(site.repo);
  if (!(await gh.getRepo(repo))) return false;
  if (!(await gh.getRef(repo, DRAFT_BRANCH))) return false;
  return (await gh.readFile(repo, "openspace.json", MAIN_BRANCH)) !== null;
}
