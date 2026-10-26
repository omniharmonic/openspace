import { randomToken, sha256Hex } from "../lib/crypto";
import { getUserRow, toUser, type User } from "./users";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding renewal: extend a session at most once a day. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** Create a session; returns the raw token for the cookie (only its hash is stored). */
export async function createSession(
  db: D1Database,
  userId: string,
  opts: { userAgent?: string | null; now?: number } = {},
): Promise<{ token: string; expiresAt: number }> {
  const now = opts.now ?? Date.now();
  const token = randomToken(32);
  const expiresAt = now + SESSION_TTL_MS;
  await db
    .prepare(
      "INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      await sha256Hex(token),
      userId,
      now,
      expiresAt,
      now,
      opts.userAgent?.slice(0, 300) ?? null,
    )
    .run();
  return { token, expiresAt };
}

export async function lookupSession(
  db: D1Database,
  token: string,
  now = Date.now(),
): Promise<{ user: User; expiresAt: number; renewed: boolean } | null> {
  const idHash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT user_id, expires_at, last_seen_at FROM sessions WHERE id_hash = ?")
    .bind(idHash)
    .first<{ user_id: string; expires_at: number; last_seen_at: number }>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
    return null;
  }
  const userRow = await getUserRow(db, row.user_id);
  if (!userRow) return null;
  let expiresAt = row.expires_at;
  let renewed = false;
  if (now - row.last_seen_at > RENEW_AFTER_MS) {
    expiresAt = now + SESSION_TTL_MS;
    renewed = true;
    await db
      .prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?")
      .bind(now, expiresAt, idHash)
      .run();
  }
  return { user: toUser(userRow), expiresAt, renewed };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id_hash = ?")
    .bind(await sha256Hex(token))
    .run();
}
