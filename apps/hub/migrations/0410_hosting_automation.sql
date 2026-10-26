-- Final fix wave A: Actions variables (dev emulation), and per-site automation state —
-- the next scheduled collection item to go live (minute cron rebuilds then) and the Turnstile
-- site key last written to the repository's variables.
CREATE TABLE dev_variables (
  repo       TEXT NOT NULL,
  name       TEXT NOT NULL,
  value      TEXT NOT NULL,                              -- variables are not secret
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (repo, name)
);

CREATE TABLE site_automation (
  site_id         TEXT PRIMARY KEY,
  next_publish_at INTEGER,                               -- ms; NULL = nothing scheduled
  turnstile_key   TEXT,                                  -- public site key set as a repo variable
  updated_at      INTEGER NOT NULL
);
CREATE INDEX site_automation_due ON site_automation(next_publish_at);
