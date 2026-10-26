-- Task 16: Hub public services — forms, newsletter, analytics, email, domains, quotas.
-- Additive only: new tables plus columns on tables created by 0001_init.sql.
-- Times are milliseconds since the Unix epoch. JSON columns end in _json.

-- Per-site service settings (notifications, retention, analytics, digests).
CREATE TABLE service_settings (
  site_id       TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at    INTEGER NOT NULL
);

-- Quota usage counters: one row per site, resource and period ("2026-10" or "2026-10-26").
CREATE TABLE quota_usage (
  site_id  TEXT NOT NULL,
  resource TEXT NOT NULL,
  period   TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, resource, period)
);

-- Daily-rotating analytics salts. Old salts are deleted, so visitor hashes can't be reversed.
CREATE TABLE analytics_salts (
  day  TEXT PRIMARY KEY,                                -- YYYY-MM-DD (UTC)
  salt TEXT NOT NULL
);

-- Forms manifest cache: the published form definitions (from /_os/forms.json or the document).
ALTER TABLE forms ADD COLUMN name TEXT;
ALTER TABLE forms ADD COLUMN schema_json TEXT;
ALTER TABLE forms ADD COLUMN source_ref TEXT;           -- manifest hash or document head SHA
ALTER TABLE forms ADD COLUMN updated_at INTEGER;

ALTER TABLE submissions ADD COLUMN source TEXT;          -- page path the entry was sent from
ALTER TABLE submissions ADD COLUMN notified_at INTEGER;  -- owner notified (instantly or by digest)
CREATE INDEX submissions_form ON submissions(site_id, form_id, created_at);
CREATE INDEX submissions_purge ON submissions(purge_at) WHERE purge_at IS NOT NULL;
CREATE INDEX submissions_digest ON submissions(site_id, notified_at) WHERE notified_at IS NULL;

ALTER TABLE subscribers ADD COLUMN first_name TEXT;
ALTER TABLE subscribers ADD COLUMN confirm_token_hash TEXT;
ALTER TABLE subscribers ADD COLUMN confirm_expires_at INTEGER;
ALTER TABLE subscribers ADD COLUMN unsubscribed_at INTEGER;
ALTER TABLE subscribers ADD COLUMN updated_at INTEGER;
ALTER TABLE subscribers ADD COLUMN confirm_sent_at INTEGER;      -- last confirmation email
ALTER TABLE subscribers ADD COLUMN confirm_send_day TEXT;        -- UTC day of confirm_send_count
ALTER TABLE subscribers ADD COLUMN confirm_send_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX subscribers_confirm ON subscribers(confirm_token_hash);
CREATE INDEX subscribers_site_status ON subscribers(site_id, status);
CREATE INDEX subscribers_email_day ON subscribers(email, confirm_send_day);

ALTER TABLE analytics_events ADD COLUMN visitor TEXT;     -- salted daily hash, never the raw IP
ALTER TABLE analytics_events ADD COLUMN utm_source TEXT;
ALTER TABLE analytics_events ADD COLUMN weight INTEGER NOT NULL DEFAULT 1;  -- >1 when sampled

ALTER TABLE outbox ADD COLUMN reply_to TEXT;
ALTER TABLE outbox ADD COLUMN headers_json TEXT;
ALTER TABLE outbox ADD COLUMN provider TEXT;

ALTER TABLE domains ADD COLUMN registrar TEXT;
ALTER TABLE domains ADD COLUMN checked_at INTEGER;

-- Dev GitHub emulation: Pages "Enforce HTTPS" flag.
ALTER TABLE dev_repos ADD COLUMN pages_https INTEGER NOT NULL DEFAULT 0;
