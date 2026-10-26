/**
 * Cloudflare-hosted sites: the secrets their Worker needs, kept by the Hub in the repository's
 * Actions secrets and pushed to the Worker by the publish workflow (`wrangler secret bulk`):
 *
 * - `OS_SESSION_SECRET` — signs the site's own member / page-password cookies. Generated once by
 *   the Hub when the site moves to Cloudflare (or on its next publish); nobody ever sees it.
 * - `OS_PAGE_PASSWORDS` — `{ pageId: "pbkdf2$…" }`, the hashes of shared page passwords. Rewritten
 *   on every password change (which also starts a publish so the Worker picks it up) and before
 *   each publish, dropping pages that are no longer password-protected.
 *
 * Secrets are written *before* the commit that triggers the workflow, so the run reads them.
 */
import type { SiteDocument } from "@openspace/schema";
import type { SiteRow } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import { type GitHubAccess, MAIN_BRANCH, PUBLISH_WORKFLOW, parseRepo } from "../github/types";
import { randomToken } from "../lib/crypto";
import type { Logger } from "../lib/log";
import { PAGE_PASSWORDS_SECRET_NAME, SESSION_SECRET_NAME } from "./hosting";
import type { Services } from "./index";
import { pagePasswords } from "./members";

/** A new member-session signing key: 48 random bytes, base64url (64 chars). */
export const newSessionSecret = () => randomToken(48);

async function ownerGitHub(services: Services, site: SiteRow): Promise<GitHubAccess> {
  const owner = await getUserRow(services.db, site.owner_id);
  return services.github({ site, user: owner ? toUser(owner) : null });
}

/** Password-protected page ids of a document. */
export function passwordPageIds(doc: SiteDocument): Set<string> {
  return new Set(
    Object.values(doc.pages)
      .filter((p) => p.access?.password)
      .map((p) => p.id),
  );
}

/**
 * Make sure a Cloudflare site's Worker secrets are in place: the session key exists, page
 * passwords of pages that are no longer password pages (in `doc`, when given) are deleted, and
 * `OS_PAGE_PASSWORDS` matches the Hub. No-op for other hosting targets.
 */
export async function syncWorkerSecrets(
  services: Services,
  site: SiteRow,
  opts: { gh?: GitHubAccess; doc?: SiteDocument; force?: boolean } = {},
): Promise<{ sessionCreated: boolean; removedPasswords: string[] }> {
  const removedPasswords: string[] = [];
  if (opts.doc) {
    const keep = passwordPageIds(opts.doc);
    for (const row of await pagePasswords(services.db, site.id))
      if (!keep.has(row.page_id)) removedPasswords.push(row.page_id);
    if (removedPasswords.length)
      await services.db.batch(
        removedPasswords.map((id) =>
          services.db
            .prepare("DELETE FROM page_passwords WHERE site_id = ? AND page_id = ?")
            .bind(site.id, id),
        ),
      );
  }
  if (site.deploy_target !== "cloudflare" && !opts.force)
    return { sessionCreated: false, removedPasswords };
  const gh = opts.gh ?? (await ownerGitHub(services, site));
  const repo = parseRepo(site.repo);
  const names = await gh.listSecretNames(repo);
  let sessionCreated = false;
  if (!names.includes(SESSION_SECRET_NAME)) {
    await gh.setSecret(repo, SESSION_SECRET_NAME, newSessionSecret());
    sessionCreated = true;
  }
  const rows = await pagePasswords(services.db, site.id);
  await gh.setSecret(
    repo,
    PAGE_PASSWORDS_SECRET_NAME,
    JSON.stringify(Object.fromEntries(rows.map((r) => [r.page_id, r.hash]))),
  );
  return { sessionCreated, removedPasswords };
}

/** `syncWorkerSecrets`, logged instead of thrown (publishing must not fail on it). */
export async function syncWorkerSecretsSafely(
  services: Services,
  site: SiteRow,
  log: Logger,
  opts: { gh?: GitHubAccess; doc?: SiteDocument } = {},
): Promise<void> {
  try {
    await syncWorkerSecrets(services, site, opts);
  } catch (err) {
    log.warn("worker secrets sync failed", { siteId: site.id, err });
  }
}

/** Rebuild the live site (main) so the Worker picks up changed secrets. */
export async function republish(services: Services, site: SiteRow, gh?: GitHubAccess) {
  const access = gh ?? (await ownerGitHub(services, site));
  const repo = parseRepo(site.repo);
  if (!(await access.getRef(repo, MAIN_BRANCH))) return false;
  await access.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
  return true;
}

/**
 * Password-protected pages of `doc` that have no password in the Hub (e.g. after going back to
 * a version from before the password was removed): nobody can open them until one is set.
 */
export async function pagesWithoutPassword(
  db: D1Database,
  siteId: string,
  doc: SiteDocument,
): Promise<Array<{ id: string; title: string }>> {
  const have = new Set((await pagePasswords(db, siteId)).map((r) => r.page_id));
  return Object.values(doc.pages)
    .filter((p) => p.access?.password && !have.has(p.id))
    .map((p) => ({ id: p.id, title: p.title }));
}
