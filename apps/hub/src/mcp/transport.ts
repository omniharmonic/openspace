/**
 * MCP Streamable HTTP (protocol 2025-06-18) at `POST /mcp` and `/mcp/t/<token>`:
 *
 * - POST carries one JSON-RPC message (a batch only for 2025-03-26 sessions). Requests get a JSON
 *   response, or a one-event SSE stream when the client accepts only `text/event-stream`;
 *   notifications/responses get 202.
 * - `initialize` opens a session and returns `Mcp-Session-Id`; every later request must carry
 *   it (400 without, 404 once it is unknown, ended or idle — the client then re-initializes).
 * - GET (server-initiated stream) is 405; DELETE ends the session.
 *
 * One logical MCP server per session: the session row keeps the negotiated protocol version and
 * the agent session (with its start snapshot) opened in each site, so every request continues
 * the same agent session — never one per message. Grants are re-read on every request, so
 * revoking or changing them takes effect immediately.
 */
import { createMcpServer } from "@omniharmonic/openspace-mcp-tools";
import type { Role } from "@omniharmonic/openspace-ops";
import type { Context } from "hono";
import type { User } from "../db/users";
import type { HubConfig } from "../env";
import type { AppEnv } from "../types";
import { explainUnreachable } from "./access";
import {
  agentSessionsOf,
  type ConnectionRow,
  consumeConnectionOps,
  createMcpSession,
  getMcpSession,
  grantSites,
  sessionsBeyond,
  touchConnection,
  touchMcpSession,
} from "./db";
import { hubTools } from "./hub-tools";
import { FINISH_MOVE_PROMPT } from "./move-guide";
import { draftScreenshots } from "./screenshots";
import { endSession, MCP_IDLE_MS } from "./sessions";
import { HUB_INSTRUCTIONS, START_PROMPT } from "./start-guide";
import { HubSiteStore, imagesResizer } from "./store";

/** Operations (tool calls) per connection per day (arch §8.4). */
export const MCP_DAILY_OPS = 2_000;
/** Burst limit per connection (RateLimiter DO). */
export const MCP_BURST = { name: "mcp-burst", limit: 120, windowSec: 60 };
/** New sessions per connection (RateLimiter DO) and live sessions kept per connection. */
export const MCP_INIT_RATE = { name: "mcp-init", limit: 30, windowSec: 600 };
export const MCP_MAX_SESSIONS = 20;

/** Origins a browser-based MCP client may call from (bearer auth; no cookies are used). */
function allowedOrigin(origin: string, config: HubConfig, extra: string | undefined): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  const allow = new Set([
    new URL(config.hubUrl).origin,
    config.studioOrigin,
    "https://claude.ai",
    ...(extra ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  ]);
  return allow.has(u.origin) || (loopback && (u.protocol === "http:" || u.protocol === "https:"));
}

/** The request body as text, or null when it is larger than `max` bytes. */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const ch of chunks) {
    all.set(ch, at);
    at += ch.length;
  }
  return new TextDecoder().decode(all);
}

/** Request body cap: base64 image uploads (15 MB) plus JSON. */
const MAX_BODY_BYTES = 24 * 1024 * 1024;

const BATCH_VERSION = "2025-03-26";

export interface McpAuth {
  connection: ConnectionRow;
  user: User;
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0",
  id: typeof id === "string" || typeof id === "number" ? id : null,
  error: { code, message },
});

/** A tool error result (limits surface to the agent as tool errors it can explain). */
const toolError = (id: unknown, code: string, message: string) => ({
  jsonrpc: "2.0",
  id,
  result: {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: { code, message } },
  },
});

function respond(
  c: Context<AppEnv>,
  payload: unknown,
  status: 200 | 400 | 404,
  headers: Record<string, string> = {},
): Response {
  const accept = c.req.header("accept") ?? "";
  const sse = accept.includes("text/event-stream") && !accept.includes("application/json");
  const h = new Headers({ "Cache-Control": "no-store", ...headers });
  if (sse && status === 200) {
    h.set("Content-Type", "text/event-stream");
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
      status,
      headers: h,
    });
  }
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(payload), { status, headers: h });
}

/** The agent label shown in Studio ("Claude"), from the connection's client name. */
export function agentLabel(clientName: string | null | undefined): string {
  const n = (clientName ?? "").trim();
  if (!n) return "Claude";
  if (/claude/i.test(n)) return "Claude";
  return n.slice(0, 40);
}

const ROLE_ORDER: Role[] = ["contributor", "editor", "designer", "owner"];

export async function handleMcp(c: Context<AppEnv>, auth: McpAuth): Promise<Response> {
  const { services, log } = c.var;
  const db = services.db;
  const now = services.now();
  const sid = c.req.header("mcp-session-id") ?? null;

  // MCP transport security: a browser-sent Origin must be one we expect (DNS-rebinding defence).
  const origin = c.req.header("origin");
  if (origin && !allowedOrigin(origin, c.var.config, c.env.MCP_ALLOWED_ORIGINS))
    return c.json(rpcError(null, -32000, "Requests from this origin are not allowed."), 403);

  if (c.req.method === "GET")
    return c.json(
      rpcError(null, -32000, "This server doesn't open a server-to-client stream."),
      405,
      {
        Allow: "POST, DELETE",
      },
    );

  if (c.req.method === "DELETE") {
    if (!sid) return respond(c, rpcError(null, -32000, "Mcp-Session-Id header required"), 400);
    const row = await getMcpSession(db, sid);
    if (!row || row.connection_id !== auth.connection.id || row.ended_at)
      return respond(c, rpcError(null, -32001, "Session not found"), 404);
    await endSession(c.env, sid, "ended", now, log);
    return new Response(null, { status: 204 });
  }

  if (c.req.method !== "POST")
    return c.json(rpcError(null, -32000, "Method not allowed"), 405, { Allow: "POST, DELETE" });

  const version = c.req.header("mcp-protocol-version");
  if (version && !/^\d{4}-\d{2}-\d{2}$/.test(version))
    return respond(c, rpcError(null, -32000, `Unsupported MCP-Protocol-Version: ${version}`), 400);
  if (!(c.req.header("content-type") ?? "").toLowerCase().includes("application/json"))
    return c.json(rpcError(null, -32700, "Content-Type must be application/json"), 415);
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return c.json(rpcError(null, -32600, "Request too large"), 413);
  // Read with a cap whatever Content-Length says (chunked bodies have none).
  const text = await readCapped(c.req.raw, MAX_BODY_BYTES);
  if (text === null) return c.json(rpcError(null, -32600, "Request too large"), 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return respond(c, rpcError(null, -32700, "Parse error"), 400);
  }

  const messages = Array.isArray(body) ? body : [body];
  const init = messages.find((m) => isRecord(m) && m.method === "initialize") as Json | undefined;

  // --- session ------------------------------------------------------------------------------
  let sessionId: string;
  let protocolVersion: string | null;
  let clientName: string | null;
  let agentSessions: ReturnType<typeof agentSessionsOf>;
  const headers: Record<string, string> = {};
  if (init) {
    if (Array.isArray(body))
      return respond(c, rpcError(null, -32600, "initialize can't be batched"), 400);
    // New sessions are cheap for a client but not for us: limit their rate per connection.
    const initRate = await services.pub.rateLimit.hit(
      `mcp-init|${auth.connection.id}`,
      MCP_INIT_RATE,
    );
    if (!initRate.ok)
      return c.json(rpcError(init.id, -32000, "Too many new sessions; try again shortly."), 429, {
        "Retry-After": String(initRate.retryAfter),
      });
    // At most MCP_MAX_SESSIONS live sessions per connection: the least recently used one ends.
    for (const old of await sessionsBeyond(db, auth.connection.id, MCP_MAX_SESSIONS - 1))
      await endSession(c.env, old, "ended", now, log);
    const params = isRecord(init.params) ? init.params : {};
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : null;
    const info = isRecord(params.clientInfo) ? params.clientInfo : {};
    clientName = typeof info.name === "string" ? info.name : null;
    protocolVersion = requested;
    sessionId = await createMcpSession(db, {
      connectionId: auth.connection.id,
      userId: auth.user.id,
      clientName,
      protocolVersion,
      now,
    });
    agentSessions = {};
    headers["Mcp-Session-Id"] = sessionId;
  } else {
    if (!sid)
      return respond(
        c,
        rpcError(null, -32000, "Bad Request: Mcp-Session-Id header is required"),
        400,
      );
    const row = await getMcpSession(db, sid);
    if (!row || row.connection_id !== auth.connection.id || row.ended_at)
      return respond(c, rpcError(null, -32001, "Session not found"), 404);
    if (row.last_seen_at < now - MCP_IDLE_MS) {
      await endSession(c.env, sid, "idle", now, log);
      return respond(c, rpcError(null, -32001, "Session expired"), 404);
    }
    // After initialize, the client must keep using the version that was negotiated.
    if (version && row.protocol_version && version !== row.protocol_version)
      return respond(
        c,
        rpcError(
          null,
          -32000,
          `MCP-Protocol-Version ${version} doesn't match this session (${row.protocol_version})`,
        ),
        400,
      );
    await touchMcpSession(db, sid, now);
    sessionId = row.id;
    protocolVersion = row.protocol_version;
    clientName = row.client_name;
    agentSessions = agentSessionsOf(row);
  }
  await touchConnection(db, auth.connection.id, now);

  if (Array.isArray(body) && protocolVersion !== BATCH_VERSION)
    return respond(
      c,
      rpcError(null, -32600, "JSON-RPC batches are not supported in this protocol version"),
      400,
      headers,
    );

  // --- grant (re-read every request) --------------------------------------------------------
  const sites = await grantSites(db, auth.connection);
  const roles: Record<string, Role> = {};
  for (const s of sites) roles[s.id] = s.role;
  const lowest = sites.reduce<Role | undefined>(
    (acc, s) => (!acc || ROLE_ORDER.indexOf(s.role) < ROLE_ORDER.indexOf(acc) ? s.role : acc),
    undefined,
  );
  const label = agentLabel(auth.connection.client_name || clientName);
  const store = new HubSiteStore({
    env: c.env,
    services,
    userId: auth.user.id,
    sites,
    mcpSessionId: sessionId,
    agentSessions,
    resize: imagesResizer(c.env),
    screenshots: services.screenshots
      ? draftScreenshots(services.screenshots, services, auth.user.id)
      : null,
    explain: (ref) => explainUnreachable(services, auth.connection, sites, ref, label),
  });
  const server = createMcpServer(
    store,
    {
      sites: sites.map((s) => s.id),
      publish: auth.connection.can_publish === 1,
      // Every Hub grant sets a role (the safest across sites) plus the exact role per site.
      role: lowest ?? "editor",
      roles,
      userId: auth.user.id,
      label,
    },
    {
      label,
      // Hub-only tools (create_site, list_templates, screenshot_url…; see hub-tools.ts).
      tools: hubTools({
        env: c.env,
        services,
        user: auth.user,
        connection: auth.connection,
        sites,
        log,
      }),
      instructions: HUB_INSTRUCTIONS,
      prompts: [START_PROMPT, FINISH_MOVE_PROMPT],
      assumeInitialized: !init,
      onError: (err, where) => log.error("mcp tool failed", { where, err }),
    },
  );

  // --- dispatch -----------------------------------------------------------------------------
  const out: unknown[] = [];
  for (const m of messages) {
    if (isRecord(m) && m.method === "tools/call" && m.id !== undefined) {
      const burst = await services.pub.rateLimit.hit(`mcp|${auth.connection.id}`, MCP_BURST);
      if (!burst.ok) {
        out.push(
          toolError(
            m.id,
            "rate_limited",
            `Too many requests in a short time. Wait about ${burst.retryAfter} seconds, then continue.`,
          ),
        );
        continue;
      }
      const used = await consumeConnectionOps(db, auth.connection.id, MCP_DAILY_OPS, now);
      if (used === null) {
        out.push(
          toolError(
            m.id,
            "quota_exceeded",
            `This connection has used its ${MCP_DAILY_OPS.toLocaleString("en-US")} AI operations for today. It resets at midnight UTC.`,
          ),
        );
        continue;
      }
    }
    const r = await server.handle(m);
    if (r) out.push(...(Array.isArray(r) ? r : [r]));
  }
  if (init) {
    // Keep the version the server negotiated (it decides whether batches are allowed).
    const negotiated = out.find(
      (r): r is { result: { protocolVersion: string } } =>
        isRecord(r) && isRecord(r.result) && typeof r.result.protocolVersion === "string",
    );
    if (negotiated && negotiated.result.protocolVersion !== protocolVersion)
      await db
        .prepare("UPDATE mcp_sessions SET protocol_version = ? WHERE id = ?")
        .bind(negotiated.result.protocolVersion, sessionId)
        .run();
  }
  if (!out.length) return new Response(null, { status: 202, headers });
  return respond(c, Array.isArray(body) ? out : out[0], 200, headers);
}
