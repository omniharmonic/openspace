-- OpenSpace Hub — initial schema (architecture §8.3 plus Hub-internal tables).
-- Times are milliseconds since the Unix epoch. JSON columns end in _json.
-- Later tasks append numbered migrations (0002_…sql); never edit an applied migration.

-- ---------------------------------------------------------------------------------------------
-- Accounts and sessions
-- ---------------------------------------------------------------------------------------------

CREATE TABLE users (
  id                          TEXT PRIMARY KEY,           -- usr_<random>
  github_id                   INTEGER UNIQUE,             -- NULL for dev users
  login                       TEXT NOT NULL UNIQUE,       -- GitHub login (or dev login)
  name                        TEXT,
  email                       TEXT,
  avatar_url                  TEXT,
  is_dev                      INTEGER NOT NULL DEFAULT 0,
  refresh_token_enc           TEXT,                       -- AES-GCM "v1.<iv>.<ciphertext>"
  refresh_token_expires_at    INTEGER,
  created_at                  INTEGER NOT NULL,
  updated_at                  INTEGER NOT NULL
);

-- Session cookie value is a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  id_hash      TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- OAuth state for /auth/github/start → /auth/github/callback (10-minute lifetime).
CREATE TABLE oauth_states (
  state       TEXT PRIMARY KEY,
  intent_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Sites and roles
-- ---------------------------------------------------------------------------------------------

CREATE TABLE sites (
  id               TEXT PRIMARY KEY,                     -- st_<10 base32>
  owner_id         TEXT NOT NULL REFERENCES users(id),
  name             TEXT NOT NULL,
  tagline          TEXT,                                 -- dashboard copy; content lives in the repo
  repo             TEXT NOT NULL,                        -- owner/name
  installation_id  INTEGER,
  deploy_target    TEXT NOT NULL DEFAULT 'github-pages', -- github-pages | cloudflare
  domain           TEXT,                                 -- custom domain, if connected
  url              TEXT,                                 -- where the site is served
  template_id      TEXT NOT NULL,
  template_version TEXT NOT NULL,
  look             TEXT,
  status           TEXT NOT NULL DEFAULT 'building',     -- building | live | failed
  status_detail    TEXT,
  plan_flags       TEXT NOT NULL DEFAULT '{}',
  archived_at      INTEGER,
  purge_at         INTEGER,                              -- archived sites are purged after 30 days
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX sites_owner ON sites(owner_id);
CREATE UNIQUE INDEX sites_repo ON sites(repo) WHERE archived_at IS NULL;
CREATE INDEX sites_purge ON sites(purge_at) WHERE purge_at IS NOT NULL;

CREATE TABLE site_roles (
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,                         -- owner | designer | editor | contributor
  locked_sections TEXT,                                  -- JSON array of section ids
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (site_id, user_id)
);
CREATE INDEX site_roles_user ON site_roles(user_id);

CREATE TABLE invitations (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email        TEXT,
  github_login TEXT,
  role         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  invited_by   TEXT NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending',          -- pending | accepted | revoked | expired
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  accepted_at  INTEGER
);
CREATE INDEX invitations_site ON invitations(site_id);

CREATE TABLE schedules (
  id         TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,                              -- publish | campaign | …
  run_at     INTEGER NOT NULL,
  payload    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX schedules_due ON schedules(status, run_at);

CREATE TABLE audit_log (
  id      TEXT PRIMARY KEY,
  site_id TEXT,
  actor   TEXT NOT NULL,                                 -- user id, "agent:<grant>", "system"
  action  TEXT NOT NULL,
  meta    TEXT,
  at      INTEGER NOT NULL
);
CREATE INDEX audit_site ON audit_log(site_id, at);

CREATE TABLE domains (
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  hostname    TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending',           -- pending | verifying | active | failed
  dns_json    TEXT,
  https       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  verified_at INTEGER,
  PRIMARY KEY (site_id, hostname)
);

-- ---------------------------------------------------------------------------------------------
-- MCP
-- ---------------------------------------------------------------------------------------------

CREATE TABLE mcp_grants (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL,
  client_name TEXT,
  scopes      TEXT NOT NULL,                             -- JSON array
  can_publish INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  revoked_at  INTEGER
);
CREATE INDEX mcp_grants_user ON mcp_grants(user_id);

CREATE TABLE mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id   TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                              -- access | refresh
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX mcp_tokens_grant ON mcp_tokens(grant_id);

-- ---------------------------------------------------------------------------------------------
-- Forms and newsletter
-- ---------------------------------------------------------------------------------------------

CREATE TABLE forms (
  id          TEXT NOT NULL,
  site_id     TEXT NOT NULL,
  schema_hash TEXT,
  notify      TEXT,
  PRIMARY KEY (site_id, id)
);

CREATE TABLE submissions (
  id         TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL,
  form_id    TEXT NOT NULL,
  data_json  TEXT NOT NULL,
  files      TEXT,
  spam_score REAL,
  read_at    INTEGER,
  created_at INTEGER NOT NULL,
  purge_at   INTEGER
);
CREATE INDEX submissions_site ON submissions(site_id, created_at);

CREATE TABLE subscribers (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL,
  email        TEXT NOT NULL,
  status       TEXT NOT NULL,                            -- pending | confirmed | unsubscribed
  tags         TEXT,
  confirmed_at INTEGER,
  source       TEXT,
  created_at   INTEGER,
  UNIQUE (site_id, email)
);

CREATE TABLE campaigns (
  id         TEXT PRIMARY KEY,
  site_id    TEXT NOT NULL,
  subject    TEXT,
  body_json  TEXT,
  status     TEXT NOT NULL DEFAULT 'draft',
  send_at    INTEGER,
  stats_json TEXT,
  created_at INTEGER
);
CREATE INDEX campaigns_site ON campaigns(site_id);

-- Dev email outbox (Global Constraint 8): every email the Hub would send, when no provider is set.
CREATE TABLE outbox (
  id         TEXT PRIMARY KEY,
  site_id    TEXT,
  to_addr    TEXT NOT NULL,
  from_addr  TEXT,
  subject    TEXT NOT NULL,
  html       TEXT,
  text       TEXT,
  kind       TEXT,
  status     TEXT NOT NULL DEFAULT 'queued',
  created_at INTEGER NOT NULL,
  sent_at    INTEGER
);
CREATE INDEX outbox_created ON outbox(created_at);

-- Dev fallback for Analytics Engine datapoints.
CREATE TABLE analytics_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id  TEXT NOT NULL,
  kind     TEXT NOT NULL,                                -- pageview | event
  path     TEXT,
  referrer TEXT,
  country  TEXT,
  device   TEXT,
  name     TEXT,
  props    TEXT,
  at       INTEGER NOT NULL
);
CREATE INDEX analytics_site ON analytics_events(site_id, at);

-- ---------------------------------------------------------------------------------------------
-- Members and commerce
-- ---------------------------------------------------------------------------------------------

CREATE TABLE members (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL,
  email           TEXT NOT NULL,
  tier            TEXT,
  stripe_customer TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER,
  UNIQUE (site_id, email)
);

CREATE TABLE member_tokens (
  token_hash TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  site_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,                              -- magic | session
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE products (
  site_id    TEXT NOT NULL,
  slug       TEXT NOT NULL,
  sku        TEXT,
  title      TEXT NOT NULL,
  price      INTEGER NOT NULL,                           -- minor units
  currency   TEXT NOT NULL,
  data_json  TEXT,
  updated_at INTEGER,
  PRIMARY KEY (site_id, slug)
);

CREATE TABLE inventory (
  site_id TEXT NOT NULL,
  sku     TEXT NOT NULL,
  qty     INTEGER NOT NULL,
  PRIMARY KEY (site_id, sku)
);

CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  site_id        TEXT NOT NULL,
  stripe_session TEXT,
  status         TEXT NOT NULL,
  total          INTEGER,
  currency       TEXT,
  items_json     TEXT,
  shipping_json  TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX orders_site ON orders(site_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- Dev GitHub emulation (DevGitHubAccess). Content-addressed blobs, commits with full trees,
-- refs for branches and tags, plus Pages/workflow/secret/collaborator/PR bookkeeping.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE dev_repos (
  full_name      TEXT PRIMARY KEY,                       -- owner/name (lower-case)
  owner          TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  private        INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0,
  pages_enabled  INTEGER NOT NULL DEFAULT 0,
  pages_url      TEXT,
  pages_domain   TEXT,
  created_at     INTEGER NOT NULL
);

-- Blobs keyed by git-style SHA-1 ("blob <len>\0<content>"); shared across repos.
CREATE TABLE dev_files (
  sha      TEXT PRIMARY KEY,
  encoding TEXT NOT NULL DEFAULT 'utf-8',                -- utf-8 | base64
  content  TEXT NOT NULL,
  size     INTEGER NOT NULL
);

CREATE TABLE dev_commits (
  sha          TEXT PRIMARY KEY,
  repo         TEXT NOT NULL,
  tree_json    TEXT NOT NULL,                            -- { path: blobSha }
  parents_json TEXT NOT NULL,                            -- [sha]
  message      TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  author_email TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX dev_commits_repo ON dev_commits(repo, created_at);

CREATE TABLE dev_refs (
  repo TEXT NOT NULL,
  ref  TEXT NOT NULL,                                    -- refs/heads/<b> | refs/tags/<t>
  sha  TEXT NOT NULL,
  PRIMARY KEY (repo, ref)
);

CREATE TABLE dev_workflow_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo        TEXT NOT NULL,
  workflow    TEXT NOT NULL,
  ref         TEXT NOT NULL,
  head_sha    TEXT,
  inputs_json TEXT,
  status      TEXT NOT NULL,                             -- queued | in_progress | completed
  conclusion  TEXT,                                      -- success | failure | cancelled
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX dev_runs_repo ON dev_workflow_runs(repo, workflow, id);

CREATE TABLE dev_secrets (
  repo       TEXT NOT NULL,
  name       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,                           -- the value itself is never stored
  PRIMARY KEY (repo, name)
);

CREATE TABLE dev_collaborators (
  repo       TEXT NOT NULL,
  login      TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (repo, login)
);

CREATE TABLE dev_pull_requests (
  repo       TEXT NOT NULL,
  number     INTEGER NOT NULL,
  head       TEXT NOT NULL,
  base       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  state      TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (repo, number)
);
