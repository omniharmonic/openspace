/**
 * Endpoints for a site's own publish workflow (machine-to-machine, no user session):
 *
 * - `GET /ci/sites/:id/gated` with `Authorization: Bearer <GitHub Actions OIDC token>` (audience =
 *   this Hub) → `{ sha, pages: [{ id, slug, ref, page }] }`: the members-only / password page
 *   content the run's commit names, for the Cloudflare workflow to put into the Worker's private
 *   R2 bucket before deploying. Only runs of the site's repository on `main` are served; the
 *   token is minted by GitHub per run and lives minutes. 409 `gated_missing` when a version the
 *   commit names isn't stored (the deploy must not go out without it).
 */
import { Hono } from "hono";
import { getSite } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import { parseRepo } from "../github/types";
import { HttpError } from "../lib/errors";
import { OidcError, verifyActionsToken } from "../services/actions-oidc";
import { gatedBundle, gatedContext } from "../services/gated-content";
import {
  type RepoIdentity,
  recordRepoIdentity,
  refreshRepoIdentity,
  repoIdentity,
} from "../services/site-automation";
import type { AppEnv } from "../types";

export const ciRoutes = new Hono<AppEnv>();

ciRoutes.get("/sites/:id/gated", async (c) => {
  const { services, config } = c.var;
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "unauthenticated", "A workflow identity token is required.");
  let claims: Awaited<ReturnType<typeof verifyActionsToken>>;
  try {
    claims = await verifyActionsToken(token, {
      audience: config.hubUrl,
      fetch: services.fetch,
      now: services.now(),
    });
  } catch (err) {
    if (err instanceof OidcError)
      throw new HttpError(401, "invalid_token", "That workflow identity token isn't valid.");
    throw err;
  }
  const forbidden = () =>
    new HttpError(403, "forbidden", "This workflow can't read that site's private pages.");
  const site = await getSite(services.db, c.req.param("id"));
  if (
    !site ||
    site.archived_at !== null ||
    site.repo.toLowerCase() !== claims.repository.toLowerCase() ||
    claims.ref !== "refs/heads/main" ||
    // Only the site's own publish workflow on main (not another workflow file in the repo).
    String(claims.workflow_ref ?? "").toLowerCase() !==
      `${site.repo}/.github/workflows/publish.yml@refs/heads/main`.toLowerCase()
  )
    throw forbidden();
  const owner = await getUserRow(services.db, site.owner_id);
  const gh = services.github({ site, user: owner ? toUser(owner) : null });
  // Bind to GitHub's numeric ids, not the name: a deleted-and-recreated repository, or another
  // account that takes over the name, has a different repository id. Recorded at creation
  // (backfilled here for older sites). The owner id may change only through a transfer of the
  // *same* repository, which is re-read from GitHub.
  const matches = (id: RepoIdentity | null) =>
    !!id &&
    String(claims.repository_id ?? "") === id.repoId &&
    (id.ownerId === null || String(claims.repository_owner_id ?? "") === id.ownerId);
  const recorded = await repoIdentity(services.db, site.id);
  if (!matches(recorded)) {
    const live = await refreshRepoIdentity(services, site, gh);
    if (!live || (recorded && live.repoId !== recorded.repoId) || !matches(live)) {
      // Keep what was recorded: a replaced repository must not take over the binding.
      if (recorded && live && live.repoId !== recorded.repoId)
        await recordRepoIdentity(services, site.id, {
          id: Number(recorded.repoId),
          ...(recorded.ownerId ? { ownerId: Number(recorded.ownerId) } : {}),
        });
      throw forbidden();
    }
  }
  const bundle = await gatedBundle(
    gatedContext(services, site.id),
    gh,
    parseRepo(site.repo),
    claims.sha,
  );
  c.header("Cache-Control", "no-store");
  if (bundle.missing.length)
    return c.json(
      {
        error: {
          code: "gated_missing",
          message: "Some private pages of this version aren't stored in the Hub.",
          details: { pages: bundle.missing },
        },
      },
      409,
    );
  return c.json({ sha: claims.sha, pages: bundle.pages });
});
