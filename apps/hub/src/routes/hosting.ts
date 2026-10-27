/**
 * Hosting (Studio Settings → Hosting; owner for changes):
 *
 * - `GET  /api/sites/:id/hosting` → `{ hosting: { target, url, actionsPublicKey, secrets, switching } }`
 * - `PUT  /api/sites/:id/hosting/secrets { secrets: [{ name, encryptedValue, keyId }] }` — values
 *   are sealed in the browser with the repo's Actions public key and only relayed; the Hub never
 *   sees them. 409 `stale_key` when the key changed.
 * - `POST /api/sites/:id/hosting/cloudflare/check { token, accountId? }` → `{ check }`: is the
 *   token usable for publishing (account, Workers, R2, D1, workers.dev address)? The token is read
 *   for these checks only — never stored or logged.
 * - `POST /api/sites/:id/hosting { target, url? }` — switch. Refused with a plain reason when the
 *   next publish would fail: 409 `not_live_yet` (the site hasn't been live on GitHub Pages yet —
 *   wow first) or `missing_secrets`. `url` is the Worker's workers.dev address from the check.
 *   The GitHub Pages version stays live until Cloudflare is confirmed; a failed Cloudflare publish
 *   switches back automatically (services/hosting-switch.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { type SiteWithRole, updateSite } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import { type GitHubAccess, parseRepo } from "../github/types";
import { HttpError } from "../lib/errors";
import { readJson } from "../lib/validate";
import { roomStub, unwrapRoom } from "../room";
import type { Services } from "../services";
import { CLOUDFLARE_SECRETS } from "../services/hosting";
import {
  advanceSwitch,
  assertCanMove,
  checkCloudflareToken,
  getSwitch,
  hasBeenLive,
  recordSwitch,
  switchView,
  validWorkersUrl,
} from "../services/hosting-switch";
import { CONFIG_PATH } from "../services/site-files";
import { githubPagesUrl, requireRole, siteForUser } from "../services/sites";
import { syncWorkerSecrets } from "../services/worker-secrets";
import type { AppEnv } from "../types";

export const hostingRoutes = new Hono<AppEnv>();

async function githubFor(services: Services, site: SiteWithRole): Promise<GitHubAccess> {
  const owner = await getUserRow(services.db, site.owner_id);
  return services.github({ site, user: owner ? toUser(owner) : null });
}

async function hostingView(services: Services, site: SiteWithRole) {
  const sw = await getSwitch(services.db, site.id);
  const gh = await githubFor(services, site);
  const repo = parseRepo(site.repo);
  let actionsPublicKey: { keyId: string; key: string } | null = null;
  let secrets: string[] = [];
  try {
    actionsPublicKey = await gh.secretsPublicKey(repo);
    secrets = (await gh.listSecretNames(repo)).filter((n) =>
      (CLOUDFLARE_SECRETS as readonly string[]).includes(n),
    );
  } catch {
    // The repo may not be reachable right now; Studio shows the target and retries later.
  }
  return {
    target: site.deploy_target === "cloudflare" ? "cloudflare" : "github-pages",
    url: site.url ?? "",
    actionsPublicKey,
    secrets,
    switching: switchView(sw),
    /** Wow first: has the site been live on GitHub Pages yet (needed before any move)? */
    everLive: await hasBeenLive(services, site),
  };
}

hostingRoutes.get("/:id/hosting", async (c) => {
  const user = requireUser(c);
  let site = await siteForUser(c.var.services, c.req.param("id"), user);
  const sw = await getSwitch(c.var.services.db, site.id);
  if (sw && (sw.status === "publishing" || sw.status === "verifying")) {
    await advanceSwitch(c.env, c.var.services, site.id, c.var.log);
    site = await siteForUser(c.var.services, site.id, user);
  }
  return c.json({ hosting: await hostingView(c.var.services, site) });
});

hostingRoutes.post("/:id/hosting/cloudflare/check", async (c) => {
  const user = requireUser(c);
  const { token, accountId } = await readJson(
    c,
    z.strictObject({
      token: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_-]{20,200}$/, "That doesn't look like a Cloudflare token."),
      accountId: z
        .string()
        .regex(/^[0-9a-f]{32}$/)
        .optional(),
    }),
  );
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, "owner");
  const check = await checkCloudflareToken(c.var.services, site, { token, accountId });
  return c.json({ check });
});

/** The `deploy.url` main publishes with now (to restore on the way back). */
async function currentDeployUrl(gh: GitHubAccess, site: SiteWithRole): Promise<string | null> {
  try {
    const text = await gh.readFile(parseRepo(site.repo), CONFIG_PATH, "main");
    const url = text ? (JSON.parse(text) as { deploy?: { url?: string } }).deploy?.url : null;
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

const SecretsSchema = z.strictObject({
  secrets: z
    .array(
      z.strictObject({
        name: z.enum(CLOUDFLARE_SECRETS),
        encryptedValue: z
          .string()
          .min(1)
          .max(8192)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Secrets must be sealed before sending."),
        keyId: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(CLOUDFLARE_SECRETS.length),
});

hostingRoutes.put("/:id/hosting/secrets", async (c) => {
  const user = requireUser(c);
  const { secrets } = await readJson(c, SecretsSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, "owner");
  const gh = await githubFor(c.var.services, site);
  const repo = parseRepo(site.repo);
  const key = await gh.secretsPublicKey(repo);
  if (secrets.some((s) => s.keyId !== key.keyId))
    throw new HttpError(409, "stale_key", "The encryption key changed. Try again.");
  for (const s of secrets) await gh.putSealedSecret(repo, s.name, s.encryptedValue, s.keyId);
  return c.json({ hosting: await hostingView(c.var.services, site) });
});

hostingRoutes.post("/:id/hosting", async (c) => {
  const user = requireUser(c);
  const { target, url: rawUrl } = await readJson(
    c,
    z.strictObject({
      target: z.enum(["github-pages", "cloudflare"]),
      url: z.string().max(300).optional(),
    }),
  );
  const services = c.var.services;
  const site = await siteForUser(services, c.req.param("id"), user);
  requireRole(site, "owner");
  const repo = parseRepo(site.repo);
  const gh = await githubFor(services, site);
  await assertCanMove(services, site, target, () => gh.listSecretNames(repo), CLOUDFLARE_SECRETS);
  const previousUrl = await currentDeployUrl(gh, site);
  const prior = await getSwitch(services.db, site.id);
  let url: string | undefined;
  if (target === "cloudflare") {
    if (rawUrl !== undefined) {
      const ok = validWorkersUrl(rawUrl, repo.name);
      if (!ok)
        throw new HttpError(400, "invalid_url", "That Cloudflare address doesn't match this site.");
      url = ok;
    }
    // The Worker's own secrets (member session key, page password hashes) before the switch
    // commit starts the first Cloudflare build.
    await syncWorkerSecrets(services, site, { force: true });
  } else if (site.deploy_target === "cloudflare") {
    url = prior?.previous_url ?? githubPagesUrl(repo.owner, repo.name);
  }
  const result = await unwrapRoom(
    roomStub(c.env, site.id).switchHosting(site.id, { userId: user.id, target, url }),
  );
  if (target === "cloudflare")
    await recordSwitch(
      services.db,
      {
        site_id: site.id,
        target,
        status: "publishing",
        sha: result.sha,
        expected_url: url ?? null,
        previous_url: previousUrl,
        detail: null,
      },
      services.now(),
    );
  else {
    if (url && !site.domain) await updateSite(services.db, site.id, { url }, services.now());
    if (prior)
      await recordSwitch(
        services.db,
        {
          site_id: site.id,
          target,
          status: "done",
          sha: result.sha,
          expected_url: url ?? null,
          previous_url: previousUrl,
          detail: null,
        },
        services.now(),
      );
  }
  const fresh = await siteForUser(services, site.id, user);
  return c.json({ hosting: await hostingView(services, fresh) });
});
