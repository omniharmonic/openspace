/**
 * The GitHub App install step: before a site's repository can be created (or its setup
 * retried), the App must be installed on the account that owns the repository, with access to
 * all repositories. Sites waiting for that carry `sites.github_access` and a plain-language
 * `status_detail`; Studio shows "Connect GitHub" for them.
 */
import type { User } from "../db/users";
import type { AppInstallation } from "../github/installations";
import type { Logger } from "../lib/log";
import type { Services } from "./index";

export type GitHubAccessNeed = "install" | "repo_access" | "requested";
export type GitHubAccessState = "ok" | GitHubAccessNeed;

export const GITHUB_ACCESS_NEEDS: readonly GitHubAccessNeed[] = [
  "install",
  "repo_access",
  "requested",
];

/** What the dashboard and editor say while a site waits for GitHub. */
export const GITHUB_ACCESS_DETAIL: Record<GitHubAccessNeed, string> = {
  install:
    "One more step: let OpenSpace create your site’s repository on GitHub. Choose Connect GitHub to finish.",
  repo_access:
    "OpenSpace can only reach some of your GitHub repositories. Choose Connect GitHub and allow “All repositories” so it can create your site’s repository.",
  requested:
    "Waiting for your GitHub organization’s owners to approve OpenSpace. Once they do, choose Try again.",
};

/** The same, for a site that was working until GitHub access was removed. */
export const GITHUB_RECONNECT_DETAIL =
  "OpenSpace lost access to this site on GitHub (the app was removed or its access changed). Choose Reconnect GitHub to fix it.";

export function asAccessNeed(value: string | null | undefined): GitHubAccessNeed | null {
  return GITHUB_ACCESS_NEEDS.includes(value as GitHubAccessNeed)
    ? (value as GitHubAccessNeed)
    : null;
}

export type InstallationCheck =
  | { ok: true; installation: AppInstallation }
  | { ok: false; need: "install" | "repo_access"; installation: AppInstallation | null };

/**
 * Is the App installed on `owner` (a user or organization login), covering new repositories?
 * Asked with `user`'s own GitHub token, so it also proves the installation is one they can use.
 * When GitHub can't be asked, the answer is "install" (the retry asks again).
 */
export async function checkInstallation(
  services: Services,
  user: User,
  owner: string,
  log?: Logger,
): Promise<InstallationCheck> {
  let list: AppInstallation[];
  try {
    list = await services.installations(user).list();
  } catch (err) {
    log?.warn("listing GitHub App installations failed", { userId: user.id, err });
    return { ok: false, need: "install", installation: null };
  }
  const installation =
    list.find((i) => i.account.login.toLowerCase() === owner.toLowerCase()) ?? null;
  if (!installation) return { ok: false, need: "install", installation: null };
  if (installation.repositorySelection !== "all")
    return { ok: false, need: "repo_access", installation };
  return { ok: true, installation };
}

/** Studio's "Connect GitHub" button: a Hub page that sends the person on to GitHub. */
export function connectGitHubUrl(hubUrl: string, siteId?: string): string {
  return siteId
    ? `${hubUrl}/auth/github/install?site=${encodeURIComponent(siteId)}`
    : `${hubUrl}/auth/github/install`;
}
