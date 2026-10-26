/**
 * D1 records for the MCP server (migration 0300): connections (an OAuth client or a personal
 * token), their per-site grants, MCP sessions and the daily operation counter.
 */
import type { Role } from "@openspace/ops";
import { randomId } from "../lib/crypto";

export type ConnectionKind = "oauth" | "token";

export interface ConnectionRow {
  id: string;
  user_id: string;
  kind: ConnectionKind;
  client_id: string | null;
  client_name: string;
  can_publish: number;
  token_hash: string | null;
  token_hint: string | null;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

/** A site a connection reaches, with the person's live role there. */
export interface GrantSite {
  id: string;
  name: string;
  url: string | null;
  role: Role;
}

/** Roles that may connect an AI (the room refuses agent sessions for contributors). */
export const AGENT_ROLES: readonly Role[] = ["owner", "designer", "editor"];

export async function createConnection(
  db: D1Database,
  input: {
    userId: string;
    kind: ConnectionKind;
    clientId?: string | null;
    clientName: string;
    canPublish: boolean;
    tokenHash?: string | null;
    tokenHint?: string | null;
    sites: Array<{ id: string; role: Role }>;
    now: number;
  },
): Promise<string> {
  const id = randomId("mcpc", 20);
  const stmts = [
    db
      .prepare(
        `INSERT INTO mcp_connections (id, user_id, kind, client_id, client_name, can_publish, token_hash, token_hint, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.userId,
        input.kind,
        input.clientId ?? null,
        input.clientName.slice(0, 100),
        input.canPublish ? 1 : 0,
        input.tokenHash ?? null,
        input.tokenHint ?? null,
        input.now,
      ),
    ...input.sites.map((s) =>
      db
        .prepare(
          `INSERT INTO mcp_grants (id, user_id, site_id, client_id, client_name, scopes, can_publish, created_at, connection_id, role)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          randomId("mcpg", 20),
          input.userId,
          s.id,
          input.clientId ?? input.kind,
          input.clientName.slice(0, 100),
          JSON.stringify(["mcp"]),
          input.canPublish ? 1 : 0,
          input.now,
          id,
          s.role,
        ),
    ),
  ];
  await db.batch(stmts);
  return id;
}

export async function getConnection(db: D1Database, id: string): Promise<ConnectionRow | null> {
  return db.prepare("SELECT * FROM mcp_connections WHERE id = ?").bind(id).first<ConnectionRow>();
}

export async function connectionByTokenHash(
  db: D1Database,
  hash: string,
): Promise<ConnectionRow | null> {
  return db
    .prepare("SELECT * FROM mcp_connections WHERE token_hash = ? AND kind = 'token'")
    .bind(hash)
    .first<ConnectionRow>();
}

/** Sites a connection reaches now: granted, not archived, and the person still edits there. */
export async function grantSites(db: D1Database, connectionId: string): Promise<GrantSite[]> {
  const res = await db
    .prepare(
      `SELECT s.id AS id, s.name AS name, s.url AS url, r.role AS role
       FROM mcp_grants g
       JOIN sites s ON s.id = g.site_id AND s.archived_at IS NULL
       JOIN site_roles r ON r.site_id = g.site_id AND r.user_id = g.user_id
       WHERE g.connection_id = ? AND g.revoked_at IS NULL
       ORDER BY s.name`,
    )
    .bind(connectionId)
    .all<GrantSite>();
  return res.results.filter((s) => AGENT_ROLES.includes(s.role));
}

/** Granted sites by connection (for the Studio list; ignores the live role). */
export async function grantedSiteNames(
  db: D1Database,
  connectionIds: string[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const out = new Map<string, Array<{ id: string; name: string }>>();
  if (!connectionIds.length) return out;
  const res = await db
    .prepare(
      `SELECT g.connection_id AS cid, s.id AS id, s.name AS name
       FROM mcp_grants g JOIN sites s ON s.id = g.site_id AND s.archived_at IS NULL
       WHERE g.revoked_at IS NULL AND g.connection_id IN (${connectionIds.map(() => "?").join(",")})
       ORDER BY s.name`,
    )
    .bind(...connectionIds)
    .all<{ cid: string; id: string; name: string }>();
  for (const r of res.results) {
    const list = out.get(r.cid) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.cid, list);
  }
  return out;
}

export async function listConnections(
  db: D1Database,
  userId: string,
  kind: ConnectionKind,
): Promise<ConnectionRow[]> {
  const res = await db
    .prepare(
      "SELECT * FROM mcp_connections WHERE user_id = ? AND kind = ? AND revoked_at IS NULL ORDER BY created_at DESC",
    )
    .bind(userId, kind)
    .all<ConnectionRow>();
  return res.results;
}

/** Personal tokens for one site (made by this person). */
export async function listSiteTokens(
  db: D1Database,
  userId: string,
  siteId: string,
): Promise<ConnectionRow[]> {
  const res = await db
    .prepare(
      `SELECT c.* FROM mcp_connections c
       JOIN mcp_grants g ON g.connection_id = c.id AND g.site_id = ?
       WHERE c.user_id = ? AND c.kind = 'token' AND c.revoked_at IS NULL
       ORDER BY c.created_at DESC`,
    )
    .bind(siteId, userId)
    .all<ConnectionRow>();
  return res.results;
}

export async function revokeConnection(db: D1Database, id: string, now: number): Promise<void> {
  await db.batch([
    db
      .prepare("UPDATE mcp_connections SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .bind(now, id),
    db
      .prepare(
        "UPDATE mcp_grants SET revoked_at = ? WHERE connection_id = ? AND revoked_at IS NULL",
      )
      .bind(now, id),
  ]);
}

export async function setConnectionPublish(
  db: D1Database,
  id: string,
  publish: boolean,
): Promise<void> {
  await db.batch([
    db.prepare("UPDATE mcp_connections SET can_publish = ? WHERE id = ?").bind(publish ? 1 : 0, id),
    db
      .prepare("UPDATE mcp_grants SET can_publish = ? WHERE connection_id = ?")
      .bind(publish ? 1 : 0, id),
  ]);
}

/** Record use (at most once a minute per connection, to spare D1 writes). */
export async function touchConnection(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare(
      "UPDATE mcp_connections SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
    )
    .bind(now, id, now - 60_000)
    .run();
}

export const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/**
 * Count `n` operations for a connection today if it stays within `limit`. Returns the new count,
 * or null when the limit would be exceeded (nothing is counted then).
 */
export async function consumeConnectionOps(
  db: D1Database,
  connectionId: string,
  limit: number,
  now: number,
  n = 1,
): Promise<number | null> {
  if (n > limit) return null;
  const row = await db
    .prepare(
      `INSERT INTO mcp_usage (connection_id, period, count) VALUES (?, ?, ?)
       ON CONFLICT (connection_id, period) DO UPDATE SET count = mcp_usage.count + excluded.count
       WHERE mcp_usage.count + excluded.count <= ?
       RETURNING count`,
    )
    .bind(connectionId, dayKey(now), n, limit)
    .first<{ count: number }>();
  return row ? row.count : null;
}

// --- MCP sessions ------------------------------------------------------------------------------

export interface AgentSessionRef {
  sessionId: string;
  actor: string;
  snapshot: string | null;
}

export interface McpSessionRow {
  id: string;
  connection_id: string;
  user_id: string;
  protocol_version: string | null;
  client_name: string | null;
  agent_sessions: string;
  created_at: number;
  last_seen_at: number;
  ended_at: number | null;
}

export async function createMcpSession(
  db: D1Database,
  input: {
    connectionId: string;
    userId: string;
    clientName: string | null;
    protocolVersion: string | null;
    now: number;
  },
): Promise<string> {
  // The session id is a bearer-adjacent handle: unguessable, URL/header safe (visible ASCII).
  const id = randomId("mcps", 32);
  await db
    .prepare(
      `INSERT INTO mcp_sessions (id, connection_id, user_id, protocol_version, client_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.connectionId,
      input.userId,
      input.protocolVersion,
      input.clientName?.slice(0, 100) ?? null,
      input.now,
      input.now,
    )
    .run();
  return id;
}

export async function getMcpSession(db: D1Database, id: string): Promise<McpSessionRow | null> {
  return db.prepare("SELECT * FROM mcp_sessions WHERE id = ?").bind(id).first<McpSessionRow>();
}

export async function touchMcpSession(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare("UPDATE mcp_sessions SET last_seen_at = ? WHERE id = ? AND ended_at IS NULL")
    .bind(now, id)
    .run();
}

export async function recordAgentSession(
  db: D1Database,
  mcpSessionId: string,
  siteId: string,
  ref: AgentSessionRef,
): Promise<void> {
  await db
    .prepare(
      "UPDATE mcp_sessions SET agent_sessions = json_set(agent_sessions, '$.' || json_quote(?), json(?)) WHERE id = ?",
    )
    .bind(siteId, JSON.stringify(ref), mcpSessionId)
    .run();
}

export function agentSessionsOf(
  row: Pick<McpSessionRow, "agent_sessions">,
): Record<string, AgentSessionRef> {
  try {
    const v = JSON.parse(row.agent_sessions) as unknown;
    return v && typeof v === "object" ? (v as Record<string, AgentSessionRef>) : {};
  } catch {
    return {};
  }
}

/** Mark ended; returns the row only for the caller that actually ended it (no double ends). */
export async function endMcpSession(
  db: D1Database,
  id: string,
  now: number,
): Promise<McpSessionRow | null> {
  return db
    .prepare("UPDATE mcp_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL RETURNING *")
    .bind(now, id)
    .first<McpSessionRow>();
}

export async function idleMcpSessions(
  db: D1Database,
  cutoff: number,
  limit = 50,
): Promise<string[]> {
  const res = await db
    .prepare(
      "SELECT id FROM mcp_sessions WHERE ended_at IS NULL AND last_seen_at < ? ORDER BY last_seen_at LIMIT ?",
    )
    .bind(cutoff, limit)
    .all<{ id: string }>();
  return res.results.map((r) => r.id);
}

export async function liveSessionsOfConnection(
  db: D1Database,
  connectionId: string,
): Promise<string[]> {
  const res = await db
    .prepare("SELECT id FROM mcp_sessions WHERE connection_id = ? AND ended_at IS NULL")
    .bind(connectionId)
    .all<{ id: string }>();
  return res.results.map((r) => r.id);
}

/** Live sessions of a connection beyond the newest `keep` (least recently used first). */
export async function sessionsBeyond(
  db: D1Database,
  connectionId: string,
  keep: number,
): Promise<string[]> {
  const res = await db
    .prepare(
      "SELECT id FROM mcp_sessions WHERE connection_id = ? AND ended_at IS NULL ORDER BY last_seen_at DESC LIMIT -1 OFFSET ?",
    )
    .bind(connectionId, keep)
    .all<{ id: string }>();
  return res.results.map((r) => r.id);
}
