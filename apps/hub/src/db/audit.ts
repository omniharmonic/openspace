import { randomId } from "../lib/crypto";

export async function audit(
  db: D1Database,
  entry: { siteId?: string | null; actor: string; action: string; meta?: unknown },
  now = Date.now(),
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_log (id, site_id, actor, action, meta, at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      randomId("aud"),
      entry.siteId ?? null,
      entry.actor,
      entry.action,
      entry.meta === undefined ? null : JSON.stringify(entry.meta),
      now,
    )
    .run();
}
