import { getUserRow, storeRefreshToken } from "../db/users";
import type { HubConfig } from "../env";
import type { FetchLike } from "../github/http";
import { refreshUserToken } from "../github/oauth";
import { decryptSecret, encryptSecret } from "../lib/crypto";

/**
 * Short-lived GitHub user tokens (arch §6.1, PRD §7.4). The Hub keeps only the encrypted
 * refresh token; every refresh rotates it, so the new one is re-encrypted and stored.
 * Access tokens are handed out (to Studio via /auth/token, or to GitHubAppAccess) and never stored.
 */
export async function mintUserAccessToken(
  deps: { db: D1Database; config: HubConfig; fetch: FetchLike; now: () => number },
  userId: string,
): Promise<{ token: string; expiresAt: number | null } | null> {
  const { config, db } = deps;
  if (!config.github || !config.tokenEncKey) return null;
  const row = await getUserRow(db, userId);
  if (!row?.refresh_token_enc) return null;
  if (row.refresh_token_expires_at !== null && row.refresh_token_expires_at <= deps.now())
    return null;
  const refresh = await decryptSecret(config.tokenEncKey, row.refresh_token_enc, userId);
  const tokens = await refreshUserToken(config.github, refresh, deps.fetch, deps.now());
  if (tokens.refreshToken)
    await storeRefreshToken(
      db,
      userId,
      await encryptSecret(config.tokenEncKey, tokens.refreshToken, userId),
      tokens.refreshTokenExpiresAt,
      deps.now(),
    );
  return { token: tokens.accessToken, expiresAt: tokens.accessTokenExpiresAt };
}
