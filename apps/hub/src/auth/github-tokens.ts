import { getUserRow, type UserRow } from "../db/users";
import type { HubConfig } from "../env";
import type { FetchLike } from "../github/http";
import { refreshUserToken, type UserTokens } from "../github/oauth";
import { GitHubApiError } from "../github/types";
import { decryptSecret, encryptSecret, randomToken } from "../lib/crypto";
import { HttpError } from "../lib/errors";

/**
 * Short-lived GitHub user tokens (arch §6.1, PRD §7.4).
 *
 * - The refresh token is stored AES-GCM encrypted (AAD = user id). GitHub rotates it on every
 *   refresh, so a request first claims the refresh (`users.refresh_claim`, conditional on the
 *   current ciphertext); others wait for the claim holder's rotated tokens instead of spending
 *   the same refresh token and getting it rejected.
 * - The minted 8-hour access token is cached encrypted (AAD = `<user id>:access`) with its expiry
 *   and reused until 5 minutes before it expires, so concurrent requests don't refresh at all.
 * - A refresh GitHub rejects (revoked / expired / bad refresh token) — seen only by the claim
 *   holder, so never a lost race — clears the stored tokens and yields `null`; callers turn that
 *   into 401 `github_reauth_required`.
 */
export const ACCESS_TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** A refresh claim older than this is considered abandoned (the holder crashed). */
const CLAIM_TTL_MS = 30_000;
const WAIT_POLLS = 40;
const WAIT_POLL_MS = 100;

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

/** Clear stored tokens — only while holding the refresh claim on the unchanged refresh token. */
async function clearTokens(
  deps: TokenDeps,
  userId: string,
  expectedRefresh: string,
  claim: string,
) {
  await deps.db
    .prepare(
      `UPDATE users SET refresh_token_enc = NULL, refresh_token_expires_at = NULL,
        access_token_enc = NULL, access_token_expires_at = NULL, refresh_claim = NULL,
        refresh_claim_at = NULL WHERE id = ? AND refresh_token_enc = ? AND refresh_claim = ?`,
    )
    .bind(userId, expectedRefresh, claim)
    .run();
}

async function releaseClaim(deps: TokenDeps, userId: string, claim: string) {
  await deps.db
    .prepare(
      "UPDATE users SET refresh_claim = NULL, refresh_claim_at = NULL WHERE id = ? AND refresh_claim = ?",
    )
    .bind(userId, claim)
    .run();
}

/**
 * Another request holds the refresh claim: wait for it to store the rotated tokens and use its
 * access token. If it gave up without rotating (GitHub 5xx), try to take the claim ourselves.
 */
async function waitForWinner(
  deps: TokenDeps,
  userId: string,
  sealedRefresh: string,
  attempt: number,
): Promise<MintedToken | null> {
  for (let i = 0; i < WAIT_POLLS; i++) {
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    const latest = await getUserRow(deps.db, userId);
    if (!latest) return null;
    if (latest.refresh_token_enc !== sealedRefresh) return cachedAccess(deps, latest);
    if (latest.refresh_claim === null)
      return attempt < 2 ? mintUserAccessToken(deps, userId, attempt + 1) : null;
  }
  throw new HttpError(
    503,
    "github_busy",
    "GitHub is taking a while to answer. Try again in a moment.",
  );
}

export async function mintUserAccessToken(
  deps: TokenDeps,
  userId: string,
  attempt = 0,
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

  // Claim the refresh: GitHub rotates refresh tokens, so only the claim holder spends this one.
  // Everyone else waits for the holder's result. Because the holder is the only request that
  // used the token, a rejection it gets is genuine (not a race lost to a concurrent refresh) and
  // it alone may clear the stored tokens.
  const claim = randomToken(12);
  const claimed = await db
    .prepare(
      `UPDATE users SET refresh_claim = ?, refresh_claim_at = ? WHERE id = ? AND refresh_token_enc = ?
        AND (refresh_claim IS NULL OR refresh_claim_at < ?)`,
    )
    .bind(claim, deps.now(), userId, sealedRefresh, deps.now() - CLAIM_TTL_MS)
    .run();
  if (claimed.meta.changes !== 1) return waitForWinner(deps, userId, sealedRefresh, attempt);

  let tokens: UserTokens;
  try {
    tokens = await refreshUserToken(config.github, refresh, deps.fetch, deps.now());
  } catch (err) {
    if (err instanceof GitHubApiError && err.status < 500) {
      await clearTokens(deps, userId, sealedRefresh, claim);
      return null;
    }
    await releaseClaim(deps, userId, claim);
    throw err;
  }

  // Serialize: only store if nobody rotated the refresh token meanwhile.
  const key = config.tokenEncKey;
  const res = await db
    .prepare(
      `UPDATE users SET refresh_token_enc = ?, refresh_token_expires_at = ?, access_token_enc = ?,
        access_token_expires_at = ?, refresh_claim = NULL, refresh_claim_at = NULL, updated_at = ?
        WHERE id = ? AND refresh_token_enc = ? AND refresh_claim = ?`,
    )
    .bind(
      tokens.refreshToken ? await encryptSecret(key, tokens.refreshToken, userId) : sealedRefresh,
      tokens.refreshToken ? tokens.refreshTokenExpiresAt : row.refresh_token_expires_at,
      await encryptSecret(key, tokens.accessToken, accessAad(userId)),
      tokens.accessTokenExpiresAt,
      deps.now(),
      userId,
      sealedRefresh,
      claim,
    )
    .run();
  if (res.meta.changes !== 1) {
    const latest = await getUserRow(db, userId);
    const winner = latest ? await cachedAccess(deps, latest) : null;
    if (winner) return winner;
  }
  return { token: tokens.accessToken, expiresAt: tokens.accessTokenExpiresAt };
}
