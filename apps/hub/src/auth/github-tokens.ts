import { getUserRow, type UserRow } from "../db/users";
import type { HubConfig } from "../env";
import type { FetchLike } from "../github/http";
import { refreshUserToken, type UserTokens } from "../github/oauth";
import { GitHubApiError } from "../github/types";
import { decryptSecret, encryptSecret } from "../lib/crypto";

/**
 * Short-lived GitHub user tokens (arch §6.1, PRD §7.4).
 *
 * - The refresh token is stored AES-GCM encrypted (AAD = user id). GitHub rotates it on every
 *   refresh, so refreshes are serialized with a conditional UPDATE on the old ciphertext; a
 *   request that loses the race re-reads the row and uses the winner's access token.
 * - The minted 8-hour access token is cached encrypted (AAD = `<user id>:access`) with its expiry
 *   and reused until 5 minutes before it expires, so concurrent requests don't refresh at all.
 * - A refresh GitHub rejects (revoked / expired / bad refresh token) clears the stored tokens and
 *   yields `null`; callers turn that into 401 `github_reauth_required`.
 */
export const ACCESS_TOKEN_MARGIN_MS = 5 * 60 * 1000;
const RACE_POLLS = 5;
const RACE_POLL_MS = 100;

export interface TokenDeps {
  db: D1Database;
  config: HubConfig;
  fetch: FetchLike;
  now: () => number;
}

export interface MintedToken {
  token: string;
  expiresAt: number | null;
}

const accessAad = (userId: string) => `${userId}:access`;

async function cachedAccess(deps: TokenDeps, row: UserRow): Promise<MintedToken | null> {
  const key = deps.config.tokenEncKey;
  if (!key || !row.access_token_enc) return null;
  const exp = row.access_token_expires_at;
  if (exp !== null && exp - ACCESS_TOKEN_MARGIN_MS <= deps.now()) return null;
  try {
    return {
      token: await decryptSecret(key, row.access_token_enc, accessAad(row.id)),
      expiresAt: exp,
    };
  } catch {
    return null;
  }
}

/** Persist freshly issued tokens (after the OAuth code exchange). */
export async function storeUserTokens(
  deps: Pick<TokenDeps, "db" | "config" | "now">,
  userId: string,
  tokens: UserTokens,
): Promise<void> {
  const key = deps.config.tokenEncKey;
  if (!key) throw new Error("TOKEN_ENC_KEY is not set");
  await deps.db
    .prepare(
      `UPDATE users SET refresh_token_enc = ?, refresh_token_expires_at = ?, access_token_enc = ?,
        access_token_expires_at = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      tokens.refreshToken ? await encryptSecret(key, tokens.refreshToken, userId) : null,
      tokens.refreshTokenExpiresAt,
      await encryptSecret(key, tokens.accessToken, accessAad(userId)),
      tokens.accessTokenExpiresAt,
      deps.now(),
      userId,
    )
    .run();
}

async function clearTokens(deps: TokenDeps, userId: string, expectedRefresh: string) {
  await deps.db
    .prepare(
      `UPDATE users SET refresh_token_enc = NULL, refresh_token_expires_at = NULL,
        access_token_enc = NULL, access_token_expires_at = NULL WHERE id = ? AND refresh_token_enc = ?`,
    )
    .bind(userId, expectedRefresh)
    .run();
}

export async function mintUserAccessToken(
  deps: TokenDeps,
  userId: string,
): Promise<MintedToken | null> {
  const { config, db } = deps;
  if (!config.github || !config.tokenEncKey) return null;
  const row = await getUserRow(db, userId);
  if (!row) return null;
  const cached = await cachedAccess(deps, row);
  if (cached) return cached;
  const sealedRefresh = row.refresh_token_enc;
  if (!sealedRefresh) return null;
  if (row.refresh_token_expires_at !== null && row.refresh_token_expires_at <= deps.now())
    return null;

  let refresh: string;
  try {
    refresh = await decryptSecret(config.tokenEncKey, sealedRefresh, userId);
  } catch {
    return null; // key rotated or data corrupted: the person must sign in again
  }

  let tokens: UserTokens;
  try {
    tokens = await refreshUserToken(config.github, refresh, deps.fetch, deps.now());
  } catch (err) {
    // Lost a refresh race? GitHub rejects the old refresh token as soon as the winner used it,
    // possibly before the winner has stored the rotated one — give it a moment.
    for (let i = 0; i < RACE_POLLS; i++) {
      const latest = await getUserRow(db, userId);
      if (latest && latest.refresh_token_enc !== sealedRefresh) {
        const winner = await cachedAccess(deps, latest);
        if (winner) return winner;
        break;
      }
      if (!(err instanceof GitHubApiError) || err.status >= 500) break;
      await new Promise((r) => setTimeout(r, RACE_POLL_MS));
    }
    if (err instanceof GitHubApiError && err.status < 500) {
      await clearTokens(deps, userId, sealedRefresh);
      return null;
    }
    throw err;
  }

  // Serialize: only store if nobody rotated the refresh token meanwhile.
  const key = config.tokenEncKey;
  const res = await db
    .prepare(
      `UPDATE users SET refresh_token_enc = ?, refresh_token_expires_at = ?, access_token_enc = ?,
        access_token_expires_at = ?, updated_at = ? WHERE id = ? AND refresh_token_enc = ?`,
    )
    .bind(
      tokens.refreshToken ? await encryptSecret(key, tokens.refreshToken, userId) : sealedRefresh,
      tokens.refreshToken ? tokens.refreshTokenExpiresAt : row.refresh_token_expires_at,
      await encryptSecret(key, tokens.accessToken, accessAad(userId)),
      tokens.accessTokenExpiresAt,
      deps.now(),
      userId,
      sealedRefresh,
    )
    .run();
  if (res.meta.changes !== 1) {
    const latest = await getUserRow(db, userId);
    const winner = latest ? await cachedAccess(deps, latest) : null;
    if (winner) return winner;
  }
  return { token: tokens.accessToken, expiresAt: tokens.accessTokenExpiresAt };
}
