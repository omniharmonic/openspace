/**
 * GitHub App installations (onboarding's install step). Creating a site's repository needs the
 * App installed on the account that will own it, with access to all repositories (a new repo
 * isn't covered by an "Only select repositories" install). Both the real App and the dev
 * emulation answer the same questions:
 *
 * - `AppInstallationDirectory` — `GET /user/installations` with the person's user token.
 * - `DevInstallationDirectory` — the `dev_installations` table; its "GitHub install page" is the
 *   Hub's own `/auth/github/dev-install`, which redirects to the Setup URL like GitHub does.
 */
import type { User } from "../db/users";
import type { HubConfig } from "../env";
import { devOwnerId } from "./dev";
import type { FetchLike } from "./http";
import {
  accountId,
  installationSettingsUrl,
  installUrl,
  listUserInstallations,
  type UserInstallation,
} from "./oauth";

export interface AppInstallation {
  id: number;
  account: { login: string; id: number | null; type: "User" | "Organization" };
  repositorySelection: "all" | "selected";
}

export interface InstallationDirectory {
  readonly kind: "dev" | "app";
  /** Installations of the App this person can see. Throws when GitHub can't be asked. */
  list(): Promise<AppInstallation[]>;
  /** Numeric id of a user or organization, to preselect it on the install page. */
  accountId(login: string): Promise<number | null>;
  /** The install page (GitHub's, or the dev stand-in). */
  installUrl(opts: { state: string; targetId?: number | null }): string;
  /** An existing installation's settings (switch to "All repositories"). */
  settingsUrl(inst: AppInstallation, state: string): string;
}

export function toAppInstallation(i: UserInstallation): AppInstallation | null {
  if (!i.account || i.suspended_at) return null;
  return {
    id: i.id,
    account: {
      login: i.account.login,
      id: typeof i.account.id === "number" ? i.account.id : null,
      type: i.account.type === "Organization" ? "Organization" : "User",
    },
    repositorySelection: i.repository_selection === "selected" ? "selected" : "all",
  };
}

export class AppInstallationDirectory implements InstallationDirectory {
  readonly kind = "app" as const;
  constructor(
    private readonly deps: {
      slug: string;
      user: User;
      userToken: () => Promise<string | null>;
      fetch: FetchLike;
    },
  ) {}

  private async token(): Promise<string> {
    const t = await this.deps.userToken();
    if (!t) throw new Error("No GitHub user token: the person has to sign in with GitHub again");
    return t;
  }

  async list(): Promise<AppInstallation[]> {
    const all = await listUserInstallations(await this.token(), this.deps.fetch);
    return all.map(toAppInstallation).filter((i): i is AppInstallation => i !== null);
  }

  async accountId(login: string): Promise<number | null> {
    if (login.toLowerCase() === this.deps.user.login.toLowerCase() && this.deps.user.githubId)
      return this.deps.user.githubId;
    try {
      return await accountId(await this.token(), login, this.deps.fetch);
    } catch {
      return null;
    }
  }

  installUrl(opts: { state: string; targetId?: number | null }): string {
    return installUrl({ slug: this.deps.slug }, opts);
  }

  settingsUrl(inst: AppInstallation): string {
    return installationSettingsUrl(inst);
  }
}

interface DevInstallationRow {
  id: number;
  account_login: string;
  account_type: string;
  repository_selection: string;
}

/** Install the dev App on an account (dev sign-in does this unless asked not to). */
export async function devInstall(
  db: D1Database,
  login: string,
  opts: { selection?: "all" | "selected"; now: number },
): Promise<number> {
  const existing = await db
    .prepare(
      "SELECT id FROM dev_installations WHERE account_login = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(login)
    .first<{ id: number }>();
  if (existing) {
    await db
      .prepare("UPDATE dev_installations SET repository_selection = ? WHERE id = ?")
      .bind(opts.selection ?? "all", existing.id)
      .run();
    return existing.id;
  }
  const row = await db
    .prepare(
      "INSERT INTO dev_installations (account_login, account_type, repository_selection, created_at) VALUES (?, 'User', ?, ?) RETURNING id",
    )
    .bind(login, opts.selection ?? "all", opts.now)
    .first<{ id: number }>();
  return row?.id as number;
}

/** Uninstall the dev App (what `installation.deleted` reports for the real one). */
export async function devUninstall(db: D1Database, id: number, now: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE dev_installations SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(now, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export class DevInstallationDirectory implements InstallationDirectory {
  readonly kind = "dev" as const;
  constructor(
    private readonly db: D1Database,
    private readonly user: User,
    private readonly hubUrl: string,
  ) {}

  async list(): Promise<AppInstallation[]> {
    // A dev person "administers" only their own account (dev has no organizations).
    const res = await this.db
      .prepare(
        "SELECT * FROM dev_installations WHERE account_login = ? AND deleted_at IS NULL ORDER BY id",
      )
      .bind(this.user.login)
      .all<DevInstallationRow>();
    return res.results.map((r) => ({
      id: r.id,
      account: {
        login: r.account_login,
        id: devOwnerId(r.account_login),
        type: r.account_type === "Organization" ? "Organization" : "User",
      },
      repositorySelection: r.repository_selection === "selected" ? "selected" : "all",
    }));
  }

  async accountId(login: string): Promise<number | null> {
    return devOwnerId(login);
  }

  installUrl(opts: { state: string; targetId?: number | null }): string {
    const u = new URL(`${this.hubUrl}/auth/github/dev-install`);
    if (opts.targetId) u.searchParams.set("suggested_target_id", String(opts.targetId));
    u.searchParams.set("state", opts.state);
    return u.toString();
  }

  settingsUrl(inst: AppInstallation, state: string): string {
    const u = new URL(`${this.hubUrl}/auth/github/dev-install`);
    u.searchParams.set("installation_id", String(inst.id));
    u.searchParams.set("state", state);
    return u.toString();
  }
}

/** Dev emulation whenever repositories are emulated (DEV_MODE, no App credentials, dev people). */
export function selectInstallationDirectory(
  deps: {
    config: HubConfig;
    db: D1Database;
    fetch: FetchLike;
    userToken: (userId: string) => Promise<string | null>;
  },
  user: User,
): InstallationDirectory {
  const { config } = deps;
  if (config.useDevGitHub || !config.github || user.isDev)
    return new DevInstallationDirectory(deps.db, user, config.hubUrl);
  let cached: Promise<string | null> | null = null;
  return new AppInstallationDirectory({
    slug: config.github.slug,
    user,
    userToken: () => {
      cached ??= deps.userToken(user.id);
      return cached;
    },
    fetch: deps.fetch,
  });
}
