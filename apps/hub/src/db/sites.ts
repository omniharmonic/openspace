import type { Role } from "@omniharmonic/openspace-ops";

export type SiteStatus = "building" | "live" | "failed";

export interface SiteRow {
  id: string;
  owner_id: string;
  name: string;
  tagline: string | null;
  repo: string;
  installation_id: number | null;
  deploy_target: string;
  domain: string | null;
  url: string | null;
  template_id: string;
  template_version: string;
  look: string | null;
  status: SiteStatus;
  status_detail: string | null;
  plan_flags: string;
  setup_json: string | null;
  transfer_to: string | null;
  transfer_requested_at: number | null;
  archived_at: number | null;
  purge_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface SiteWithRole extends SiteRow {
  role: Role;
  inbox_count: number;
  owner_login: string;
  owner_name: string | null;
}

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const WITH_ROLE = `SELECT s.*, r.role AS role, o.login AS owner_login, o.name AS owner_name,
  (SELECT COUNT(*) FROM submissions sub WHERE sub.site_id = s.id AND sub.read_at IS NULL) AS inbox_count
  FROM sites s JOIN site_roles r ON r.site_id = s.id JOIN users o ON o.id = s.owner_id`;

export async function insertSite(
  db: D1Database,
  site: Omit<
    SiteRow,
    | "archived_at"
    | "purge_at"
    | "status_detail"
    | "plan_flags"
    | "setup_json"
    | "transfer_to"
    | "transfer_requested_at"
  > & {
    plan_flags?: string;
    setup_json?: string | null;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO sites (id, owner_id, name, tagline, repo, installation_id, deploy_target, domain,
          url, template_id, template_version, look, status, plan_flags, setup_json, created_at,
          updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        site.id,
        site.owner_id,
        site.name,
        site.tagline,
        site.repo,
        site.installation_id,
        site.deploy_target,
        site.domain,
        site.url,
        site.template_id,
        site.template_version,
        site.look,
        site.status,
        site.plan_flags ?? "{}",
        site.setup_json ?? null,
        site.created_at,
        site.updated_at,
      ),
    db
      .prepare(
        "INSERT INTO site_roles (site_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
      )
      .bind(site.id, site.owner_id, site.created_at),
  ]);
}

export async function getSite(db: D1Database, id: string): Promise<SiteRow | null> {
  return db.prepare("SELECT * FROM sites WHERE id = ?").bind(id).first<SiteRow>();
}

/** A site with the user's role on it, or null when the user has no role (or it is archived). */
export async function getSiteForUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<SiteWithRole | null> {
  return db
    .prepare(`${WITH_ROLE} WHERE s.id = ? AND r.user_id = ? AND s.archived_at IS NULL`)
    .bind(id, userId)
    .first<SiteWithRole>();
}

/** Sites the user owns or collaborates on (FR-3), newest first. */
export async function listSitesForUser(db: D1Database, userId: string): Promise<SiteWithRole[]> {
  const res = await db
    .prepare(
      `${WITH_ROLE} WHERE r.user_id = ? AND s.archived_at IS NULL ORDER BY s.created_at DESC`,
    )
    .bind(userId)
    .all<SiteWithRole>();
  return res.results;
}

export async function repoTaken(db: D1Database, repo: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM sites WHERE repo = ? COLLATE NOCASE AND archived_at IS NULL")
    .bind(repo)
    .first();
  return row !== null;
}

type Patch = Partial<
  Pick<
    SiteRow,
    | "name"
    | "tagline"
    | "repo"
    | "url"
    | "status"
    | "status_detail"
    | "installation_id"
    | "domain"
    | "owner_id"
    | "archived_at"
    | "purge_at"
    | "transfer_to"
    | "transfer_requested_at"
    | "deploy_target"
  >
>;

export async function updateSite(db: D1Database, id: string, patch: Patch, now = Date.now()) {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  await db
    .prepare(`UPDATE sites SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), now, id)
    .run();
}

export async function setRole(
  db: D1Database,
  siteId: string,
  userId: string,
  role: Role,
  now = Date.now(),
) {
  await db
    .prepare(
      "INSERT INTO site_roles (site_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (site_id, user_id) DO UPDATE SET role = excluded.role",
    )
    .bind(siteId, userId, role, now)
    .run();
}
