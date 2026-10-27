/**
 * `Idempotency-Key` for POST /api/sites. Studio sends one key per "Create my site" attempt and
 * reuses it on every retry, so a flaky network, a double click or a platform error that killed
 * the first request never makes a second site. Keys are per person and kept for 24 hours.
 */

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A claim with no site after this long belongs to a request that died; a retry may take over. */
export const CLAIM_STALE_MS = 2 * 60 * 1000;

const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

export const isValidIdempotencyKey = (key: string): boolean => KEY_RE.test(key);

export type CreateClaim =
  /** First time this key is seen (or a stale claim was taken over): create the site. */
  | { kind: "new" }
  /** The key already made a site: answer with it. */
  | { kind: "replay"; siteId: string }
  /** Another request with this key is still running. */
  | { kind: "busy" };

interface ClaimRow {
  site_id: string | null;
  claimed_at: number;
}

export async function claimCreateKey(
  db: D1Database,
  userId: string,
  key: string,
  name: string,
  now: number,
): Promise<CreateClaim> {
  await db
    .prepare("DELETE FROM site_create_keys WHERE user_id = ? AND created_at < ?")
    .bind(userId, now - IDEMPOTENCY_TTL_MS)
    .run();
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO site_create_keys (user_id, key, site_id, claimed_at, created_at)
       VALUES (?, ?, NULL, ?, ?)`,
    )
    .bind(userId, key, now, now)
    .run();
  if (inserted.meta.changes > 0) return { kind: "new" };

  const row = await db
    .prepare("SELECT site_id, claimed_at FROM site_create_keys WHERE user_id = ? AND key = ?")
    .bind(userId, key)
    .first<ClaimRow>();
  if (!row) return { kind: "busy" };
  if (row.site_id) return { kind: "replay", siteId: row.site_id };
  if (now - row.claimed_at < CLAIM_STALE_MS) return { kind: "busy" };

  // The first request died part-way. If it got as far as storing the site, that's the answer.
  const orphan = await db
    .prepare(
      `SELECT id FROM sites WHERE owner_id = ? AND name = ? AND created_at >= ?
         AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
    )
    .bind(userId, name, row.claimed_at)
    .first<{ id: string }>();
  if (orphan) {
    await settleCreateKey(db, userId, key, orphan.id);
    return { kind: "replay", siteId: orphan.id };
  }
  const took = await db
    .prepare(
      `UPDATE site_create_keys SET claimed_at = ?
       WHERE user_id = ? AND key = ? AND claimed_at = ? AND site_id IS NULL`,
    )
    .bind(now, userId, key, row.claimed_at)
    .run();
  return took.meta.changes > 0 ? { kind: "new" } : { kind: "busy" };
}

/** Remember which site the key made. */
export async function settleCreateKey(
  db: D1Database,
  userId: string,
  key: string,
  siteId: string,
): Promise<void> {
  await db
    .prepare("UPDATE site_create_keys SET site_id = ? WHERE user_id = ? AND key = ?")
    .bind(siteId, userId, key)
    .run();
}

/** The create was refused (bad input, no template): free the key so a corrected retry works. */
export async function releaseCreateKey(db: D1Database, userId: string, key: string): Promise<void> {
  await db
    .prepare("DELETE FROM site_create_keys WHERE user_id = ? AND key = ? AND site_id IS NULL")
    .bind(userId, key)
    .run();
}
