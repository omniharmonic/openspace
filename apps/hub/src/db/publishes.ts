import { randomId } from "../lib/crypto";

export type PublishKind = "publish" | "rollback" | "revert" | "setup";
export type PublishStatus = "queued" | "in_progress" | "success" | "failure";

export interface PublishRow {
  id: string;
  site_id: string;
  kind: PublishKind;
  sha: string;
  prev_sha: string | null;
  summary: string;
  actor: string;
  status: PublishStatus;
  error_code: string | null;
  /** Specific failure copy (JSON `{ title, message }`) from the run's log, when there was any. */
  error_detail?: string | null;
  run_url: string | null;
  created_at: number;
  updated_at: number;
}

export async function insertPublish(
  db: D1Database,
  row: Omit<PublishRow, "id" | "created_at" | "updated_at" | "error_code" | "run_url"> & {
    run_url?: string | null;
  },
  now: number,
): Promise<PublishRow> {
  const full: PublishRow = {
    id: randomId("pub"),
    error_code: null,
    run_url: row.run_url ?? null,
    created_at: now,
    updated_at: now,
    ...row,
  } as PublishRow;
  await db
    .prepare(
      `INSERT INTO publishes (id, site_id, kind, sha, prev_sha, summary, actor, status, error_code,
        run_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      full.id,
      full.site_id,
      full.kind,
      full.sha,
      full.prev_sha,
      full.summary,
      full.actor,
      full.status,
      full.error_code,
      full.run_url,
      full.created_at,
      full.updated_at,
    )
    .run();
  return full;
}

export async function publishBySha(
  db: D1Database,
  siteId: string,
  sha: string,
): Promise<PublishRow | null> {
  return db
    .prepare("SELECT * FROM publishes WHERE site_id = ? AND sha = ? ORDER BY created_at DESC")
    .bind(siteId, sha)
    .first<PublishRow>();
}

export async function latestPublish(db: D1Database, siteId: string): Promise<PublishRow | null> {
  return db
    .prepare("SELECT * FROM publishes WHERE site_id = ? ORDER BY created_at DESC, rowid DESC")
    .bind(siteId)
    .first<PublishRow>();
}

export async function listPublishes(
  db: D1Database,
  siteId: string,
  limit = 100,
): Promise<PublishRow[]> {
  const r = await db
    .prepare("SELECT * FROM publishes WHERE site_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(siteId, limit)
    .all<PublishRow>();
  return r.results;
}

export async function updatePublish(
  db: D1Database,
  id: string,
  patch: Partial<Pick<PublishRow, "status" | "error_code" | "error_detail" | "run_url">>,
  now: number,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  await db
    .prepare(
      `UPDATE publishes SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    )
    .bind(...entries.map(([, v]) => v), now, id)
    .run();
}
