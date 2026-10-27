-- Hosted imports ("Move my site"): the import runs as a one-off GitHub Actions workflow in the
-- site's own repository; this row tracks it for Studio's progress screen and the remote MCP.
--
-- kind:  'url'      a new site filled from an address (any platform, or a GitHub Pages site)
--        'convert'  an existing GitHub Pages repository made editable in place (a pull request)
-- state: 'waiting'    the GitHub App install step comes first
--        'queued'     the workflow is about to start
--        'running'    phase says where it is: reading | importing | checking | saving
--        'review'     (convert) the pull request is open, waiting for the owner to merge it
--        'publishing' the imported site is being published
--        'ready'      live — the report and the setup checklist are filled in
--        'failed'     error says why (plain language)
CREATE TABLE site_imports (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  source        TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'auto',
  options_json  TEXT NOT NULL DEFAULT '{}',
  branch        TEXT NOT NULL DEFAULT 'main',
  state         TEXT NOT NULL,
  phase         TEXT,
  counts_json   TEXT,
  report        TEXT,
  checklist_json TEXT,
  error         TEXT,
  run_url       TEXT,
  pr_number     INTEGER,
  pr_url        TEXT,
  head_sha      TEXT,
  attempt       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX site_imports_site ON site_imports(site_id, created_at);
CREATE INDEX site_imports_open ON site_imports(state) WHERE state NOT IN ('ready', 'failed');
