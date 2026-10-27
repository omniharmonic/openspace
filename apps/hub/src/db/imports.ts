/** `site_imports` (migration 0510): hosted imports and conversions. */

export type ImportKind = "url" | "convert";
export type ImportState =
  | "waiting"
  | "queued"
  | "running"
  | "review"
  | "publishing"
  | "ready"
  | "failed";
export type ImportPhase =
  | "reading"
  | "importing"
  | "imported"
  | "checking"
  | "saving"
  | "saved"
  | "publishing"
  | "failed";

export interface ImportRow {
  id: string;
  site_id: string;
  kind: ImportKind;
  source: string;
  platform: string;
  options_json: string;
  branch: string;
  state: ImportState;
  phase: ImportPhase | null;
  counts_json: string | null;
  report: string | null;
  checklist_json: string | null;
  error: string | null;
  run_url: string | null;
  pr_number: number | null;
  pr_url: string | null;
  head_sha: string | null;
  attempt: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export async function insertImport(
  db: D1Database,
  row: Omit<
    ImportRow,
    | "phase"
    | "counts_json"
    | "report"
    | "checklist_json"
    | "error"
    | "run_url"
    | "pr_number"
    | "pr_url"
    | "head_sha"
    | "finished_at"
    | "attempt"
  >,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO site_imports (id, site_id, kind, source, platform, options_json, branch, state,
        created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.site_id,
      row.kind,
      row.source,
      row.platform,
      row.options_json,
      row.branch,
      row.state,
      row.created_by,
      row.created_at,
      row.updated_at,
    )
    .run();
}

export async function getImport(db: D1Database, id: string): Promise<ImportRow | null> {
  return db.prepare("SELECT * FROM site_imports WHERE id = ?").bind(id).first<ImportRow>();
}

/** The newest import of a site. */
export async function latestImport(db: D1Database, siteId: string): Promise<ImportRow | null> {
  return db
    .prepare(
      "SELECT * FROM site_imports WHERE site_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
    )
    .bind(siteId)
    .first<ImportRow>();
}

/** Imports still on their way (the cron keeps them moving when nobody is watching). */
export async function openImports(db: D1Database, limit = 20): Promise<ImportRow[]> {
  const res = await db
    .prepare(
      "SELECT * FROM site_imports WHERE state NOT IN ('ready', 'failed', 'waiting') ORDER BY updated_at LIMIT ?",
    )
    .bind(limit)
    .all<ImportRow>();
  return res.results;
}

type Patch = Partial<
  Pick<
    ImportRow,
    | "state"
    | "phase"
    | "counts_json"
    | "report"
    | "checklist_json"
    | "error"
    | "run_url"
    | "pr_number"
    | "pr_url"
    | "head_sha"
    | "finished_at"
    | "attempt"
    | "options_json"
  >
>;

export async function updateImport(
  db: D1Database,
  id: string,
  patch: Patch,
  now: number,
): Promise<void> {
  const keys = Object.keys(patch) as (keyof Patch)[];
  if (!keys.length) return;
  await db
    .prepare(
      `UPDATE site_imports SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    )
    .bind(...keys.map((k) => patch[k] ?? null), now, id)
    .run();
}
