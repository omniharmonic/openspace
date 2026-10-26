-- Task 15: draft room, publishing, history, build status, collaborators.

-- Every publish (squash commit on main), rollback and automatic revert. Build status from the
-- `workflow_run` webhook is matched to a row by `sha`.
CREATE TABLE publishes (
  id          TEXT PRIMARY KEY,                          -- pub_<random>
  site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                             -- publish | rollback | revert | setup
  sha         TEXT NOT NULL,                             -- the commit on main
  prev_sha    TEXT,                                      -- main before this publish
  summary     TEXT NOT NULL,
  actor       TEXT NOT NULL,                             -- user id | "schedule:<id>" | "system"
  status      TEXT NOT NULL DEFAULT 'queued',            -- queued | in_progress | success | failure
  error_code  TEXT,                                      -- translated failure (see build-errors.ts)
  run_url     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX publishes_site ON publishes(site_id, created_at);
CREATE INDEX publishes_sha ON publishes(sha);

-- Contributor approval queue: draft collection items saved by Contributors.
CREATE TABLE approvals (
  id           TEXT PRIMARY KEY,                         -- apr_<random>
  site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  collection   TEXT NOT NULL,
  slug         TEXT NOT NULL,
  title        TEXT,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'pending',          -- pending | approved | rejected
  note         TEXT,
  decided_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  decided_at   INTEGER
);
CREATE UNIQUE INDEX approvals_item ON approvals(site_id, collection, slug) WHERE status = 'pending';
CREATE INDEX approvals_site ON approvals(site_id, status);

-- Schedules: outcome bookkeeping for the cron runner.
ALTER TABLE schedules ADD COLUMN started_at INTEGER;
ALTER TABLE schedules ADD COLUMN finished_at INTEGER;
ALTER TABLE schedules ADD COLUMN error TEXT;

-- Invitations: who accepted.
ALTER TABLE invitations ADD COLUMN accepted_by TEXT;
CREATE INDEX invitations_expiry ON invitations(status, expires_at);

-- Token refresh claim: only the request holding the claim spends the refresh token, so a
-- rejection it gets is the first one and it may clear the stored tokens (Task 14 review).
ALTER TABLE users ADD COLUMN refresh_claim TEXT;
ALTER TABLE users ADD COLUMN refresh_claim_at INTEGER;

CREATE INDEX sites_transfer ON sites(transfer_requested_at) WHERE transfer_to IS NOT NULL;
