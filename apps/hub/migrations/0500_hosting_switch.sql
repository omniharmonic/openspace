-- A move to (or back from) Cloudflare hosting, tracked until the new host is confirmed working.
-- The GitHub Pages version stays live the whole time; a Cloudflare publish that fails (or a
-- Worker that doesn't answer) switches the site back automatically. One row per site: the
-- latest switch. `expected_url` is the address the new host should answer on (workers.dev).
CREATE TABLE hosting_switches (
  site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  sha TEXT,
  expected_url TEXT,
  previous_url TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
