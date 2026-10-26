-- Task 17: Hub MCP server (architecture §10).
--
-- A *connection* is one AI app the person allowed: an OAuth client (claude.ai custom connector,
-- Claude Desktop, Claude Code…) or a personal access token URL made in Studio. Each connection
-- covers one or more sites through `mcp_grants` rows (0001), which now point at their connection.
-- The OAuth tokens themselves live in the OAUTH_KV namespace (@cloudflare/workers-oauth-provider:
-- hashed tokens, encrypted props); revoking a connection here takes effect on the next request.

CREATE TABLE mcp_connections (
  id           TEXT PRIMARY KEY,                            -- mcpc_…
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                               -- oauth | token
  client_id    TEXT,                                        -- OAuth client id (kind = oauth)
  client_name  TEXT NOT NULL,                               -- "Claude", or the token's label
  can_publish  INTEGER NOT NULL DEFAULT 0,                  -- off by default (arch §12)
  token_hash   TEXT UNIQUE,                                 -- SHA-256 of a personal token (kind = token)
  token_hint   TEXT,                                        -- last 4 characters, for display
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER
);
CREATE INDEX mcp_connections_user ON mcp_connections(user_id, revoked_at);

ALTER TABLE mcp_grants ADD COLUMN connection_id TEXT REFERENCES mcp_connections(id) ON DELETE CASCADE;
-- The person's site role when they consented (the live role from site_roles is what applies).
ALTER TABLE mcp_grants ADD COLUMN role TEXT;
CREATE INDEX mcp_grants_connection ON mcp_grants(connection_id);

-- Consent screens in progress: the validated OAuth request, bound to the signed-in person.
CREATE TABLE mcp_consents (
  handle_hash TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request     TEXT NOT NULL,                                -- JSON AuthRequest
  client_name TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- MCP sessions (Streamable HTTP `Mcp-Session-Id`): one per client connection, with the agent
-- session (and its start snapshot) it opened in each site's DraftRoom.
CREATE TABLE mcp_sessions (
  id               TEXT PRIMARY KEY,
  connection_id    TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  protocol_version TEXT,
  client_name      TEXT,
  agent_sessions   TEXT NOT NULL DEFAULT '{}',              -- JSON { siteId: {sessionId, actor, snapshot} }
  created_at       INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL,
  ended_at         INTEGER
);
CREATE INDEX mcp_sessions_idle ON mcp_sessions(ended_at, last_seen_at);
CREATE INDEX mcp_sessions_connection ON mcp_sessions(connection_id);

-- Daily operation counter per connection (2,000 / day, arch §8.4). The per-site total also counts
-- in quota_usage (`mcpOperations`).
CREATE TABLE mcp_usage (
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,                              -- UTC day, YYYY-MM-DD
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (connection_id, period)
);
