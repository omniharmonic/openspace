import type { SiteRow } from "../db/sites";
import type { User } from "../db/users";
import type { HubConfig } from "../env";
import { GitHubAppAccess } from "./app";
import { DevGitHubAccess } from "./dev";
import type { FetchLike } from "./http";
import type { GitHubAccess, RepoRef } from "./types";

export { GitHubAppAccess } from "./app";
export { DevGitHubAccess } from "./dev";
export * from "./types";

export interface GitHubContext {
  user?: User | null;
  site?: Pick<SiteRow, "id" | "installation_id"> | null;
  /** Installation id known out of band (e.g. from the OAuth callback). */
  installationId?: number | null;
}

export interface GitHubDeps {
  config: HubConfig;
  db: D1Database;
  fetch: FetchLike;
  now: () => number;
  userToken: (userId: string) => Promise<string | null>;
}

/** Dev "Pages" URL: the Hub's own preview of the site that owns the repo. */
async function devPagesUrl(db: D1Database, hubUrl: string, repo: RepoRef): Promise<string> {
  const row = await db
    .prepare("SELECT id FROM sites WHERE repo = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 1")
    .bind(`${repo.owner}/${repo.name}`)
    .first<{ id: string }>();
  return row ? `${hubUrl}/s/${row.id}/` : `${hubUrl}/s/unknown/`;
}

/**
 * Global Constraint 8: DEV_MODE (or missing GitHub App credentials) selects the D1 emulation;
 * otherwise the real App with an installation token (site's installation) and the person's
 * user token as fallback/for user-only operations.
 */
export function selectGitHubAccess(deps: GitHubDeps, ctx: GitHubContext = {}): GitHubAccess {
  const { config } = deps;
  if (config.useDevGitHub || !config.github)
    return new DevGitHubAccess(deps.db, {
      now: deps.now,
      pagesUrl: (repo) => devPagesUrl(deps.db, config.hubUrl, repo),
      ...(ctx.user ? { defaultAuthor: { name: ctx.user.name ?? ctx.user.login } } : {}),
    });
  const user = ctx.user;
  let cached: Promise<string | null> | null = null;
  return new GitHubAppAccess({
    app: config.github,
    installationId: ctx.installationId ?? ctx.site?.installation_id ?? null,
    ...(user && !user.isDev
      ? {
          userToken: () => {
            cached ??= deps.userToken(user.id);
            return cached;
          },
          userLogin: user.login,
        }
      : {}),
    fetch: deps.fetch,
    now: deps.now,
  });
}
