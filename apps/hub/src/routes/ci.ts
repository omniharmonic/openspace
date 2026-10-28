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
import { openImportForSite, parseLive, recordProgress, refreshImport } from "../services/imports";
import {
  adoptRepoIdentity,
  liveRepoIdentity,
  type RepoIdentity,
  repoIdentity,
} from "../services/site-automation";
import { CONVERT_BRANCH, IMPORT_WORKFLOW_PATH } from "../templates/import-workflow";
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
    // Read GitHub without writing; adopt only for a first record or the same repository id.
    const live = await liveRepoIdentity(services, site, gh);
    if (!live || (recorded && live.repoId !== recorded.repoId) || !matches(live)) throw forbidden();
    if (!matches(await adoptRepoIdentity(services, site.id, live))) throw forbidden();
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

/**
 * `POST /ci/sites/:id/import` with the import workflow's OIDC token: progress of a hosted import
 * (`{ id, phase, counts?, sha? }`) for Studio's "Reading your site… Bringing pages across…".
 * Only the site's own `openspace-import.yml` run (on main or the conversion branch) may report.
 */
ciRoutes.post("/sites/:id/import", async (c) => {
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
    new HttpError(403, "forbidden", "This workflow can't report for that site.");
  const site = await getSite(services.db, c.req.param("id"));
  const workflowRef = String(claims.workflow_ref ?? "").toLowerCase();
  if (
    !site ||
    site.archived_at !== null ||
    site.repo.toLowerCase() !== claims.repository.toLowerCase() ||
    !(
      workflowRef === `${site.repo}/${IMPORT_WORKFLOW_PATH}@refs/heads/main`.toLowerCase() ||
      workflowRef ===
        `${site.repo}/${IMPORT_WORKFLOW_PATH}@refs/heads/${CONVERT_BRANCH}`.toLowerCase()
    )
  )
    throw forbidden();
  const recorded = await repoIdentity(services.db, site.id);
  if (recorded && String(claims.repository_id ?? "") !== recorded.repoId) throw forbidden();
  const body = (await c.req.json().catch(() => ({}))) as {
    id?: unknown;
    phase?: unknown;
    counts?: unknown;
    live?: unknown;
  };
  const open = await openImportForSite(services, site.id);
  if (!open || (typeof body.id === "string" && body.id !== open.id))
    return c.json({ ok: true, ignored: true });
  const counts =
    body.counts && typeof body.counts === "object"
      ? (body.counts as Record<string, unknown>)
      : undefined;
  const live = parseLive(body.live, services.now());
  await recordProgress(services, open.id, {
    phase: typeof body.phase === "string" ? body.phase : "",
    ...(counts ? { counts } : {}),
    ...(live ? { live } : {}),
  });
  if (body.phase === "failed" || body.phase === "publishing")
    await refreshImport(services, c.env, open.id, c.var.log);
  return c.json({ ok: true });
});
