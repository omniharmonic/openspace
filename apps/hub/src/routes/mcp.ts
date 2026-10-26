/**
 * MCP endpoints (arch §8.2, §10):
 *
 * Remote MCP server (bearer auth, no cookies — CORS `*`):
 * - `POST|GET|DELETE /mcp`              Streamable HTTP; `Authorization: Bearer <OAuth token>`
 * - `POST|GET|DELETE /mcp/t/:token`     the same with a personal access token in the URL
 *
 * OAuth 2.1 authorization server (for claude.ai connectors, Claude Desktop, Claude Code):
 * - `GET  /.well-known/oauth-protected-resource[/mcp]`  RFC 9728
 * - `GET  /.well-known/oauth-authorization-server`      RFC 8414 (provider)
 * - `POST /register`                                    RFC 7591 dynamic registration (provider)
 * - `POST /token`                                       code + PKCE S256, refresh, revocation (provider)
 * - `GET  /authorize`                                   sign-in, then per-site consent
 * - `POST /authorize`                                   consent decision (allow / cancel)
 * - `POST /authorize/dev-login`                         dev sign-in on the consent flow (DEV_MODE)
 *
 * Studio (session cookie):
 * - `GET    /api/mcp/grants`                 AI apps allowed to edit your sites
 * - `PATCH  /api/mcp/grants/:id {publish}`   allow / stop publishing
 * - `DELETE /api/mcp/grants/:id`             disconnect (tokens revoked, sessions ended)
 * - `GET    /api/sites/:id/mcp/tokens`       personal connector links for a site
 * - `POST   /api/sites/:id/mcp/tokens {label, publish?}`  new link (the URL is shown once)
 * - `DELETE /api/sites/:id/mcp/tokens/:tokenId`
 */

import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { AuthorizationError, authorizationErrorRedirect } from "@cloudflare/workers-oauth-provider";
import type { Role } from "@openspace/ops";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { requireUser, setSessionCookie } from "../auth/session";
import { audit } from "../db/audit";
import { createSession } from "../db/sessions";
import { listSitesForUser } from "../db/sites";
import { getUserRow, toUser, type User, upsertDevUser } from "../db/users";
import { randomToken, sha256Hex } from "../lib/crypto";
import { HttpError, notFound } from "../lib/errors";
import { readJson } from "../lib/validate";
import {
  AGENT_ROLES,
  type ConnectionRow,
  connectionByTokenHash,
  createConnection,
  getConnection,
  grantedSiteNames,
  listConnections,
  listSiteTokens,
  revokeConnection,
  setConnectionPublish,
} from "../mcp/db";
import {
  authorizationServer,
  bearerChallenge,
  executionContext,
  MCP_SCOPE,
  type McpTokenProps,
  mcpResource,
  protectedResourceMetadata,
} from "../mcp/oauth";
import { consentPage, errorPage, PAGE_HEADERS, signInPage } from "../mcp/pages";
import { endConnectionSessions } from "../mcp/sessions";
import { handleMcp, type McpAuth } from "../mcp/transport";
import { requireRole, siteForUser } from "../services/sites";
import type { AppEnv } from "../types";
import { devLoginFor } from "./auth";

export const mcpRoutes = new Hono<AppEnv>();
export const mcpGrantRoutes = new Hono<AppEnv>();
export const mcpTokenRoutes = new Hono<AppEnv>();

const CONSENT_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = "osmcp_";

const html = (body: string, status: 200 | 400 | 403 | 404 = 200) =>
  new Response(body, { status, headers: PAGE_HEADERS });

// --- MCP endpoint --------------------------------------------------------------------------------

const mcpCors = cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Authorization",
    "Content-Type",
    "Accept",
    "Mcp-Session-Id",
    "Mcp-Protocol-Version",
    "Last-Event-ID",
  ],
  exposeHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
  maxAge: 600,
});
for (const path of [
  "/mcp",
  "/mcp/*",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/*",
])
  mcpRoutes.use(path, mcpCors);

function unauthorized(c: Context<AppEnv>, error?: "invalid_token") {
  return c.json(
    { error: error ?? "unauthorized", error_description: "Connect this app to OpenSpace first." },
    401,
    { "WWW-Authenticate": bearerChallenge(c.var.config, error) },
  );
}

async function liveConnection(
  c: Context<AppEnv>,
  conn: ConnectionRow | null,
  userId?: string,
): Promise<McpAuth | null> {
  if (!conn || conn.revoked_at || (userId && conn.user_id !== userId)) return null;
  const row = await getUserRow(c.var.services.db, conn.user_id);
  return row ? { connection: conn, user: toUser(row) } : null;
}

mcpRoutes.all("/mcp", async (c) => {
  const header = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m?.[1]) return unauthorized(c);
  const validated = await authorizationServer(c.var.config).validateToken<McpTokenProps>(
    mcpResource(c.var.config),
    m[1],
    c.env,
  );
  const auth = validated
    ? await liveConnection(
        c,
        await getConnection(c.var.services.db, validated.props.connectionId),
        validated.props.userId,
      )
    : null;
  if (!auth) return unauthorized(c, "invalid_token");
  return handleMcp(c, auth);
});

mcpRoutes.all("/mcp/t/:token", async (c) => {
  const token = c.req.param("token");
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 100)
    return c.json({ error: "invalid_token", error_description: "This link isn't valid." }, 401);
  const auth = await liveConnection(
    c,
    await connectionByTokenHash(c.var.services.db, await sha256Hex(token)),
  );
  if (!auth)
    return c.json(
      {
        error: "invalid_token",
        error_description: "This link was turned off. Make a new one in Studio → Connect your AI.",
      },
      401,
    );
  return handleMcp(c, auth);
});

// --- OAuth authorization server ------------------------------------------------------------------

const resourceMetadata = (c: Context<AppEnv>) =>
  c.json(protectedResourceMetadata(c.var.config), 200, { "Cache-Control": "public, max-age=3600" });
mcpRoutes.get("/.well-known/oauth-protected-resource", resourceMetadata);
mcpRoutes.get("/.well-known/oauth-protected-resource/mcp", resourceMetadata);

/** Discovery, registration and the token endpoint are the provider's. */
const provider = (c: Context<AppEnv>) =>
  authorizationServer(c.var.config).fetch(c.req.raw, c.env, executionContext(c));
mcpRoutes.all("/.well-known/oauth-authorization-server", provider);
mcpRoutes.all("/.well-known/oauth-authorization-server/*", provider);
mcpRoutes.all("/token", provider);
mcpRoutes.all("/register", provider);

/** Sites a person can connect an AI to (contributors can't). */
async function connectableSites(c: Context<AppEnv>, user: User) {
  const all = await listSitesForUser(c.var.services.db, user.id);
  return all
    .filter((s) => AGENT_ROLES.includes(s.role))
    .map((s) => ({ id: s.id, name: s.name, role: s.role as Role }));
}

/** Same-origin check for the consent forms (SameSite=Lax cookies + this). */
function checkFormOrigin(c: Context<AppEnv>): void {
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.var.config.hubUrl).origin)
    throw new HttpError(403, "forbidden_origin", "Requests from this origin are not allowed.");
}

mcpRoutes.get("/authorize", async (c) => {
  const helpers = authorizationServer(c.var.config).getOAuthApi(c.env);
  let authReq: AuthRequest;
  try {
    authReq = await helpers.parseAuthRequest(c.req.raw);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      if (err.redirectTo) return c.redirect(err.redirectTo, 302);
      return html(errorPage("Can't connect this app", err.description), 400);
    }
    c.var.log.warn("authorize request failed", { err });
    return html(
      errorPage("Can't connect this app", "We couldn't read this app's details. Try again."),
      400,
    );
  }
  const described = await helpers.describeConsent(authReq);
  const user = c.var.user;
  if (!user) {
    const here = `${c.var.config.hubUrl}${new URL(c.req.url).pathname}${new URL(c.req.url).search}`;
    return html(
      signInPage({
        clientName: described.clientName,
        returnTo: here,
        devMode: c.var.config.devMode,
        githubUrl: c.var.config.github
          ? `/auth/github/start?return_to=${encodeURIComponent(here)}`
          : null,
      }),
    );
  }
  const sites = await connectableSites(c, user);
  if (!sites.length)
    return html(
      errorPage(
        "No sites to connect",
        "You don't have a site you can edit yet. Create one in OpenSpace Studio, then connect again.",
      ),
    );
  const handle = randomToken(24);
  const now = c.var.services.now();
  await c.var.services.db.batch([
    c.var.services.db.prepare("DELETE FROM mcp_consents WHERE expires_at < ?").bind(now),
    c.var.services.db
      .prepare(
        "INSERT INTO mcp_consents (handle_hash, user_id, request, client_name, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        await sha256Hex(handle),
        user.id,
        JSON.stringify(authReq),
        described.clientName.slice(0, 100),
        now + CONSENT_TTL_MS,
      ),
  ]);
  return html(
    consentPage({
      handle,
      clientName: described.clientName,
      redirectHost: described.redirectHost,
      redirectIsLoopback: described.redirectIsLoopback,
      userName: user.name ?? user.login,
      sites,
    }),
  );
});

mcpRoutes.post("/authorize", async (c) => {
  checkFormOrigin(c);
  const user = c.var.user;
  if (!user) return html(errorPage("Signed out", "Sign in again and reconnect the app."), 403);
  const form = await c.req.parseBody({ all: true });
  const handle = typeof form.handle === "string" ? form.handle : "";
  const db = c.var.services.db;
  const now = c.var.services.now();
  // Single use: whoever deletes the row owns the decision.
  const row = handle
    ? await db
        .prepare(
          "DELETE FROM mcp_consents WHERE handle_hash = ? AND user_id = ? AND expires_at >= ? RETURNING request, client_name",
        )
        .bind(await sha256Hex(handle), user.id, now)
        .first<{ request: string; client_name: string }>()
    : null;
  if (!row)
    return html(
      errorPage(
        "This request expired",
        "Go back to the app and connect again. Requests last ten minutes.",
      ),
      400,
    );
  const authReq = JSON.parse(row.request) as AuthRequest;
  if (form.action !== "allow")
    return c.redirect(authorizationErrorRedirect(authReq, "access_denied"), 302);

  const picked = new Set(
    (Array.isArray(form.site) ? form.site : [form.site]).filter(
      (v): v is string => typeof v === "string",
    ),
  );
  const sites = (await connectableSites(c, user)).filter((s) => picked.has(s.id));
  if (!sites.length)
    return html(
      errorPage("Choose a site", "Pick at least one site. Go back to the app and connect again."),
      400,
    );
  const canPublish = form.publish === "1";

  // Re-connecting the same app replaces its earlier connection.
  for (const old of await listConnections(db, user.id, "oauth"))
    if (old.client_id === authReq.clientId) {
      await revokeConnection(db, old.id, now);
      await endConnectionSessions(c.env, old.id, now, c.var.log);
    }
  const connectionId = await createConnection(db, {
    userId: user.id,
    kind: "oauth",
    clientId: authReq.clientId,
    clientName: row.client_name,
    canPublish,
    sites,
    now,
  });
  const helpers = authorizationServer(c.var.config).getOAuthApi(c.env);
  const { redirectTo } = await helpers.completeAuthorization({
    request: authReq,
    userId: user.id,
    metadata: { connectionId, clientName: row.client_name },
    scope: [MCP_SCOPE],
    props: { userId: user.id, connectionId } satisfies McpTokenProps,
  });
  for (const s of sites)
    await audit(db, {
      siteId: s.id,
      actor: user.id,
      action: "mcp.connect",
      meta: { connectionId, client: row.client_name, publish: canPublish },
    });
  return c.redirect(redirectTo, 302);
});

const DevLoginForm = z.object({ name: z.string().trim().min(1).max(60), return: z.string() });

mcpRoutes.post("/authorize/dev-login", async (c) => {
  if (!c.var.config.devMode) throw notFound();
  checkFormOrigin(c);
  const parsed = DevLoginForm.safeParse(await c.req.parseBody());
  const back = `${c.var.config.hubUrl}/authorize?`;
  if (
    !parsed.success ||
    !parsed.data.return.startsWith(back) ||
    /[\r\n\\]/.test(parsed.data.return)
  )
    return html(errorPage("Can't sign in", "Go back to the app and connect again."), 400);
  let user: User;
  try {
    user = await upsertDevUser(
      c.var.services.db,
      { login: devLoginFor(parsed.data.name), name: parsed.data.name },
      c.var.services.now(),
    );
  } catch {
    return html(errorPage("That name is taken", "Go back and try another name."), 400);
  }
  const session = await createSession(c.var.services.db, user.id, {
    userAgent: c.req.header("user-agent") ?? null,
    now: c.var.services.now(),
  });
  setSessionCookie(c, session.token, session.expiresAt);
  return c.redirect(parsed.data.return, 303);
});

// --- Studio: connected apps ----------------------------------------------------------------------

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

async function grantViews(c: Context<AppEnv>, rows: ConnectionRow[]) {
  const names = await grantedSiteNames(
    c.var.services.db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    clientName: r.client_name,
    sites: names.get(r.id) ?? [],
    publish: r.can_publish === 1,
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: iso(r.last_used_at),
  }));
}

async function ownConnection(c: Context<AppEnv>, user: User): Promise<ConnectionRow> {
  const conn = await getConnection(c.var.services.db, c.req.param("id") ?? "");
  if (!conn || conn.user_id !== user.id || conn.revoked_at || conn.kind !== "oauth")
    throw notFound("That connection was already removed.");
  return conn;
}

/** Turn a connection off everywhere: D1 (immediate), its OAuth grant, its live sessions. */
async function disconnect(c: Context<AppEnv>, conn: ConnectionRow): Promise<void> {
  const now = c.var.services.now();
  await revokeConnection(c.var.services.db, conn.id, now);
  if (conn.kind === "oauth") {
    try {
      const helpers = authorizationServer(c.var.config).getOAuthApi(c.env);
      const grants = await helpers.listUserGrants(conn.user_id);
      for (const g of grants.items)
        if ((g.metadata as { connectionId?: string } | null)?.connectionId === conn.id)
          await helpers.revokeGrant(g.id, conn.user_id);
    } catch (err) {
      // D1 revocation already blocks every request; the KV grant then just expires.
      c.var.log.warn("oauth grant revocation failed", { err });
    }
  }
  await endConnectionSessions(c.env, conn.id, now, c.var.log);
}

mcpGrantRoutes.get("/grants", async (c) => {
  const user = requireUser(c);
  const rows = await listConnections(c.var.services.db, user.id, "oauth");
  return c.json({ grants: await grantViews(c, rows) });
});

mcpGrantRoutes.patch("/grants/:id", async (c) => {
  const user = requireUser(c);
  const { publish } = await readJson(c, z.strictObject({ publish: z.boolean() }));
  const conn = await ownConnection(c, user);
  await setConnectionPublish(c.var.services.db, conn.id, publish);
  const updated = (await getConnection(c.var.services.db, conn.id)) as ConnectionRow;
  const [view] = await grantViews(c, [updated]);
  for (const s of view?.sites ?? [])
    await audit(c.var.services.db, {
      siteId: s.id,
      actor: user.id,
      action: "mcp.publish",
      meta: { connectionId: conn.id, publish },
    });
  return c.json({ grant: view });
});

mcpGrantRoutes.delete("/grants/:id", async (c) => {
  const user = requireUser(c);
  const conn = await ownConnection(c, user);
  const [view] = await grantViews(c, [conn]);
  await disconnect(c, conn);
  for (const s of view?.sites ?? [])
    await audit(c.var.services.db, {
      siteId: s.id,
      actor: user.id,
      action: "mcp.disconnect",
      meta: { connectionId: conn.id },
    });
  return c.json({ ok: true });
});

// --- Studio: personal connector links ------------------------------------------------------------

const tokenView = (c: Context<AppEnv>, r: ConnectionRow, token?: string) => ({
  id: r.id,
  label: r.client_name,
  url: token
    ? `${c.var.config.hubUrl}/mcp/t/${token}`
    : `${c.var.config.hubUrl}/mcp/t/${TOKEN_PREFIX}…${r.token_hint ?? ""}`,
  createdAt: new Date(r.created_at).toISOString(),
  lastUsedAt: iso(r.last_used_at),
  publish: r.can_publish === 1,
});

const CreateTokenSchema = z.strictObject({
  label: z.string().trim().max(40).optional(),
  publish: z.boolean().optional(),
});

mcpTokenRoutes.get("/:id/mcp/tokens", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const rows = await listSiteTokens(c.var.services.db, user.id, site.id);
  return c.json({ tokens: rows.map((r) => tokenView(c, r)) });
});

mcpTokenRoutes.post("/:id/mcp/tokens", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, CreateTokenSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, "editor");
  const token = `${TOKEN_PREFIX}${randomToken(32)}`;
  const now = c.var.services.now();
  const id = await createConnection(c.var.services.db, {
    userId: user.id,
    kind: "token",
    clientName: input.label || "Claude",
    canPublish: input.publish === true,
    tokenHash: await sha256Hex(token),
    tokenHint: token.slice(-4),
    sites: [{ id: site.id, role: site.role }],
    now,
  });
  await audit(c.var.services.db, {
    siteId: site.id,
    actor: user.id,
    action: "mcp.token.create",
    meta: { connectionId: id, label: input.label || "Claude", publish: input.publish === true },
  });
  const row = (await getConnection(c.var.services.db, id)) as ConnectionRow;
  return c.json({ token: tokenView(c, row, token) }, 201);
});

mcpTokenRoutes.delete("/:id/mcp/tokens/:tokenId", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const conn = (await listSiteTokens(c.var.services.db, user.id, site.id)).find(
    (r) => r.id === c.req.param("tokenId"),
  );
  if (!conn) throw notFound("That link was already turned off.");
  await disconnect(c, conn);
  await audit(c.var.services.db, {
    siteId: site.id,
    actor: user.id,
    action: "mcp.token.revoke",
    meta: { connectionId: conn.id },
  });
  return c.json({ ok: true });
});
