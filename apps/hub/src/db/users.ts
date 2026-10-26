import { randomId } from "../lib/crypto";

export interface User {
  id: string;
  githubId: number | null;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  isDev: boolean;
  createdAt: number;
}

export interface UserRow {
  id: string;
  github_id: number | null;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_dev: number;
  refresh_token_enc: string | null;
  refresh_token_expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    isDev: row.is_dev === 1,
    createdAt: row.created_at,
  };
}

export async function getUserRow(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export async function getUserByLogin(db: D1Database, login: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE login = ? COLLATE NOCASE")
    .bind(login)
    .first<UserRow>();
  return row ? toUser(row) : null;
}

/** Dev users: one per login, reused on every dev sign-in with the same name. */
export async function upsertDevUser(
  db: D1Database,
  input: { login: string; name: string },
  now = Date.now(),
): Promise<User> {
  const existing = await db
    .prepare("SELECT * FROM users WHERE login = ? COLLATE NOCASE")
    .bind(input.login)
    .first<UserRow>();
  if (existing) {
    if (existing.is_dev !== 1) throw new Error("That name belongs to a GitHub account");
    return toUser(existing);
  }
  const id = randomId("usr");
  await db
    .prepare(
      "INSERT INTO users (id, login, name, is_dev, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    )
    .bind(id, input.login, input.name, now, now)
    .run();
  return toUser((await getUserRow(db, id)) as UserRow);
}

export async function upsertGitHubUser(
  db: D1Database,
  input: {
    githubId: number;
    login: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    refreshTokenEnc: string | null;
    refreshTokenExpiresAt: number | null;
  },
  now = Date.now(),
): Promise<User> {
  const existing = await db
    .prepare("SELECT * FROM users WHERE github_id = ?")
    .bind(input.githubId)
    .first<UserRow>();
  if (existing) {
    await db
      .prepare(
        "UPDATE users SET login = ?, name = ?, email = COALESCE(?, email), avatar_url = ?, refresh_token_enc = ?, refresh_token_expires_at = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        input.login,
        input.name,
        input.email,
        input.avatarUrl,
        input.refreshTokenEnc,
        input.refreshTokenExpiresAt,
        now,
        existing.id,
      )
      .run();
    return toUser((await getUserRow(db, existing.id)) as UserRow);
  }
  const id = randomId("usr");
  await db
    .prepare(
      "INSERT INTO users (id, github_id, login, name, email, avatar_url, is_dev, refresh_token_enc, refresh_token_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.githubId,
      input.login,
      input.name,
      input.email,
      input.avatarUrl,
      input.refreshTokenEnc,
      input.refreshTokenExpiresAt,
      now,
      now,
    )
    .run();
  return toUser((await getUserRow(db, id)) as UserRow);
}

export async function storeRefreshToken(
  db: D1Database,
  userId: string,
  enc: string | null,
  expiresAt: number | null,
  now = Date.now(),
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET refresh_token_enc = ?, refresh_token_expires_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(enc, expiresAt, now, userId)
    .run();
}
