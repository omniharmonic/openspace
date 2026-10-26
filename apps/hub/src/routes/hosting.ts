/**
 * Hosting (Studio Settings → Hosting; owner for changes):
 *
 * - `GET  /api/sites/:id/hosting` → `{ hosting: { target, url, actionsPublicKey, secrets, switching } }`
 * - `PUT  /api/sites/:id/hosting/secrets { secrets: [{ name, encryptedValue, keyId }] }` — values
 *   are sealed in the browser with the repo's Actions public key and only relayed; the Hub never
 *   sees them. 409 `stale_key` when the key changed.
 * - `POST /api/sites/:id/hosting { target }` — switch (409 `missing_secrets` for Cloudflare
 *   without both secrets).
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import type { SiteWithRole } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import { type GitHubAccess, parseRepo } from "../github/types";
import { HttpError } from "../lib/errors";
import { readJson } from "../lib/validate";
import { roomStub, unwrapRoom } from "../room";
import type { Services } from "../services";
import { CLOUDFLARE_SECRETS } from "../services/hosting";
import { requireRole, siteForUser } from "../services/sites";
import { syncWorkerSecrets } from "../services/worker-secrets";
import type { AppEnv } from "../types";

export const hostingRoutes = new Hono<AppEnv>();

async function githubFor(services: Services, site: SiteWithRole): Promise<GitHubAccess> {
  const owner = await getUserRow(services.db, site.owner_id);
  return services.github({ site, user: owner ? toUser(owner) : null });
}

async function hostingView(services: Services, site: SiteWithRole) {
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
    switching: null,
  };
}

hostingRoutes.get("/:id/hosting", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  return c.json({ hosting: await hostingView(c.var.services, site) });
});

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
  const { target } = await readJson(
    c,
    z.strictObject({ target: z.enum(["github-pages", "cloudflare"]) }),
  );
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, "owner");
  if (target === "cloudflare") {
    const have = await (await githubFor(c.var.services, site)).listSecretNames(
      parseRepo(site.repo),
    );
    if (!CLOUDFLARE_SECRETS.every((n) => have.includes(n)))
      throw new HttpError(
        409,
        "missing_secrets",
        "Add your Cloudflare token and account ID first.",
      );
    // The Worker's own secrets (member session key, page password hashes) before the switch
    // commit starts the first Cloudflare build.
    await syncWorkerSecrets(c.var.services, site, { force: true });
  }
  await unwrapRoom(roomStub(c.env, site.id).switchHosting(site.id, { userId: user.id, target }));
  const fresh = await siteForUser(c.var.services, site.id, user);
  return c.json({ hosting: await hostingView(c.var.services, fresh) });
});
