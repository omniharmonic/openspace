import type { GitHubAppConfig } from "../env";
import { type FetchLike, GITHUB_API, GITHUB_WEB, githubRequest } from "./http";
import { GitHubApiError } from "./types";

/**
 * GitHub App user-to-server tokens (arch §6.1): access tokens expire after 8 hours and are
 * renewed with refresh tokens (which rotate on every refresh and expire after ~6 months).
 */

export interface UserTokens {
  accessToken: string;
  /** ms since epoch. */
  accessTokenExpiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function authorizeUrl(
  app: GitHubAppConfig,
  opts: { state: string; redirectUri: string },
): string {
  const u = new URL(`${GITHUB_WEB}/login/oauth/authorize`);
  u.searchParams.set("client_id", app.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

/** Where a person installs the App (optionally pre-filtered to an account). */
export function installUrl(app: GitHubAppConfig, state?: string): string {
  const u = new URL(`${GITHUB_WEB}/apps/${app.slug}/installations/new`);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  fetchFn: FetchLike,
  params: Record<string, string>,
  now: number,
): Promise<UserTokens> {
  const res = await fetchFn(`${GITHUB_WEB}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "openspace-hub",
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error || !data.access_token)
    throw new GitHubApiError(
      data.error_description ?? data.error ?? `Token request failed (${res.status})`,
      res.ok ? 401 : res.status,
      data,
    );
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: data.expires_in ? now + data.expires_in * 1000 : null,
    refreshToken: data.refresh_token ?? null,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? now + data.refresh_token_expires_in * 1000
      : null,
  };
}

export function exchangeCode(
  app: GitHubAppConfig,
  code: string,
  redirectUri: string,
  fetchFn: FetchLike = fetch,
  now = Date.now(),
): Promise<UserTokens> {
  return tokenRequest(
    fetchFn,
    {
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    now,
  );
}

export function refreshUserToken(
  app: GitHubAppConfig,
  refreshToken: string,
  fetchFn: FetchLike = fetch,
  now = Date.now(),
): Promise<UserTokens> {
  return tokenRequest(
    fetchFn,
    {
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    now,
  );
}

export async function getAuthenticatedUser(
  token: string,
  fetchFn: FetchLike = fetch,
): Promise<GitHubUser> {
  const user = await githubRequest<GitHubUser>(fetchFn, GITHUB_API, "/user", { token });
  if (!user) throw new GitHubApiError("GitHub returned no user", 502);
  return user;
}

export async function listUserInstallations(
  token: string,
  fetchFn: FetchLike = fetch,
): Promise<Array<{ id: number; account: { login: string } | null }>> {
  const data = await githubRequest<{
    installations: Array<{ id: number; account: { login: string } | null }>;
  }>(fetchFn, GITHUB_API, "/user/installations?per_page=100", { token });
  return data?.installations ?? [];
}
