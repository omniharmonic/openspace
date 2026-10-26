import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { mintUserAccessToken } from "../auth/github-tokens";
import { clearSessionCookie, requireUser, SESSION_COOKIE, setSessionCookie } from "../auth/session";
import { createSession, deleteSession } from "../db/sessions";
import { type User, upsertDevUser, upsertGitHubUser } from "../db/users";
import {
  authorizeUrl,
  exchangeCode,
  getAuthenticatedUser,
  listUserInstallations,
} from "../github/oauth";
import { encryptSecret, randomToken } from "../lib/crypto";
import { HttpError, notFound } from "../lib/errors";
import { readJson } from "../lib/validate";
import { CreateSiteSchema, createSite } from "../services/sites";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const DevLoginSchema = z.strictObject({ name: z.string().trim().min(1, "Enter a name").max(60) });

/** A GitHub-shaped login from a display name ("Maya Lin" → "maya-lin"). */
export function devLoginFor(name: string): string {
  const login = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39)
    .replace(/-+$/, "");
  return login || "dev-user";
}

export function publicUser(user: User) {
  return {
    id: user.id,
    login: user.login,
    name: user.name ?? user.login,
    email: user.email,
    avatarUrl: user.avatarUrl,
    isDev: user.isDev,
  };
}

/** POST /auth/dev/login { name } — DEV_MODE only (Global Constraint 8). */
authRoutes.post("/dev/login", async (c) => {
  if (!c.var.config.devMode) throw notFound();
  const { name } = await readJson(c, DevLoginSchema);
  let user: User;
  try {
    user = await upsertDevUser(
      c.var.services.db,
      { login: devLoginFor(name), name },
      c.var.services.now(),
    );
  } catch {
    throw new HttpError(409, "login_taken", "That name is taken. Try another one.");
  }
  const session = await createSession(c.var.services.db, user.id, {
    userAgent: c.req.header("user-agent") ?? null,
    now: c.var.services.now(),
  });
  setSessionCookie(c, session.token, session.expiresAt);
  c.var.log.info("dev login", { userId: user.id });
  return c.json({ user: publicUser(user) });
});

interface OAuthIntent {
  template?: string;
  look?: string;
  name?: string;
  tagline?: string;
  brandColor?: string;
  returnTo?: string;
}

/** GET /auth/github/start?template=&name=&look=&tagline=&brandColor=&return_to= */
authRoutes.get("/github/start", async (c) => {
  const { config, services } = c.var;
  if (!config.github)
    throw new HttpError(
      409,
      "github_not_configured",
      config.devMode
        ? "GitHub sign-in isn't set up on this Hub. Use the dev sign-in instead."
        : "GitHub sign-in isn't set up on this Hub.",
    );
  const q = c.req.query();
  const intent: OAuthIntent = {};
  for (const key of ["template", "look", "name", "tagline", "brandColor"] as const)
    if (q[key]) intent[key] = q[key].slice(0, 200);
  const returnTo = q.return_to ?? q.returnTo;
  if (returnTo?.startsWith(`${config.studioOrigin}/`)) intent.returnTo = returnTo;
  const state = randomToken(24);
  const now = services.now();
  await services.db
    .prepare(
      "INSERT INTO oauth_states (state, intent_json, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(state, JSON.stringify(intent), now, now + OAUTH_STATE_TTL_MS)
    .run();
  return c.redirect(
    authorizeUrl(config.github, { state, redirectUri: `${config.hubUrl}/auth/github/callback` }),
    302,
  );
});

/** GET /auth/github/callback?code=&state=[&installation_id=] */
authRoutes.get("/github/callback", async (c) => {
  const { config, services, log } = c.var;
  const studio = config.studioOrigin;
  const fail = (reason: string) =>
    c.redirect(`${studio}/?signin=failed&reason=${encodeURIComponent(reason)}`, 302);
  if (!config.github) return fail("not_configured");
  if (!config.tokenEncKey) {
    log.error("TOKEN_ENC_KEY is not set; refusing to store GitHub tokens");
    return fail("not_configured");
  }
  const { code, state, installation_id } = c.req.query();
  if (!code || !state) return fail("missing_code");
  const row = await services.db
    .prepare("DELETE FROM oauth_states WHERE state = ? RETURNING intent_json, expires_at")
    .bind(state)
    .first<{ intent_json: string; expires_at: number }>();
  if (!row || row.expires_at < services.now()) return fail("expired");
  const intent = JSON.parse(row.intent_json) as OAuthIntent;

  let user: User;
  let accessToken: string;
  try {
    const tokens = await exchangeCode(
      config.github,
      code,
      `${config.hubUrl}/auth/github/callback`,
      services.fetch,
      services.now(),
    );
    accessToken = tokens.accessToken;
    const gh = await getAuthenticatedUser(tokens.accessToken, services.fetch);
    // Encrypt with the user id as AAD; the id is only known after upsert, so upsert first.
    user = await upsertGitHubUser(services.db, {
      githubId: gh.id,
      login: gh.login,
      name: gh.name,
      email: gh.email,
      avatarUrl: gh.avatar_url,
      refreshTokenEnc: null,
      refreshTokenExpiresAt: null,
    });
    if (tokens.refreshToken)
      await services.db
        .prepare(
          "UPDATE users SET refresh_token_enc = ?, refresh_token_expires_at = ? WHERE id = ?",
        )
        .bind(
          await encryptSecret(config.tokenEncKey, tokens.refreshToken, user.id),
          tokens.refreshTokenExpiresAt,
          user.id,
        )
        .run();
  } catch (err) {
    log.warn("github oauth failed", { err });
    return fail("github");
  }

  const session = await createSession(services.db, user.id, {
    userAgent: c.req.header("user-agent") ?? null,
    now: services.now(),
  });
  setSessionCookie(c, session.token, session.expiresAt);
  log.info("github login", { userId: user.id });

  if (intent.template && intent.name) {
    let installationId = installation_id ? Number(installation_id) || null : null;
    if (!installationId) {
      try {
        const installs = await listUserInstallations(accessToken, services.fetch);
        installationId =
          installs.find((i) => i.account?.login.toLowerCase() === user.login.toLowerCase())?.id ??
          null;
      } catch (err) {
        log.warn("listing installations failed", { err });
      }
    }
    const parsed = CreateSiteSchema.safeParse({
      template: intent.template,
      name: intent.name,
      ...(intent.look ? { look: intent.look } : {}),
      ...(intent.tagline ? { tagline: intent.tagline } : {}),
      ...(intent.brandColor ? { brandColor: intent.brandColor } : {}),
    });
    if (parsed.success) {
      try {
        const site = await createSite(services, user, parsed.data, { log, installationId });
        return c.redirect(`${studio}/sites/${site.id}?welcome=1`, 302);
      } catch (err) {
        log.error("site creation after sign-in failed", { err });
        return c.redirect(`${studio}/sites?create=failed`, 302);
      }
    }
  }
  return c.redirect(intent.returnTo ?? `${studio}/sites`, 302);
});

/** POST /auth/token — a short-lived GitHub user token for Studio (kept in memory only). */
authRoutes.post("/token", async (c) => {
  const user = requireUser(c);
  const { config, services } = c.var;
  if (user.isDev || config.useDevGitHub)
    return c.json({ mode: "dev", token: null, expiresAt: null });
  const minted = await mintUserAccessToken(
    { db: services.db, config, fetch: services.fetch, now: services.now },
    user.id,
  );
  if (!minted)
    throw new HttpError(401, "github_reauth_required", "Please sign in with GitHub again.");
  return c.json({
    mode: "github",
    token: minted.token,
    expiresAt: minted.expiresAt ? new Date(minted.expiresAt).toISOString() : null,
  });
});

/** POST /auth/logout */
authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.var.services.db, token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
