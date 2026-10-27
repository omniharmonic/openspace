-- Idempotency keys for POST /api/sites (`Idempotency-Key` header): a retried or double-clicked
-- "Create my site" returns the site the first request made instead of creating another one.
-- One row per (person, key), kept 24 hours. `site_id` is NULL while the first request is still
-- running; `claimed_at` lets a retry take over a claim whose request died part-way.
CREATE TABLE site_create_keys (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  site_id    TEXT,
  claimed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX site_create_keys_created ON site_create_keys(created_at);
