-- Budget alerts (PRD §7.6): one row per resource and month once Hub usage reaches 80% of the
-- operator's plan allowance; `emailed_at` is set when ALERT_EMAIL was notified.
CREATE TABLE budget_alerts (
  resource   TEXT NOT NULL,      -- requests | analyticsEvents | emails | storageBytes
  period     TEXT NOT NULL,      -- YYYY-MM (UTC)
  used       INTEGER NOT NULL,
  allowance  INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  emailed_at INTEGER,
  PRIMARY KEY (resource, period)
);
CREATE INDEX campaign_recipients_sent ON campaign_recipients(site_id, sent_at);
