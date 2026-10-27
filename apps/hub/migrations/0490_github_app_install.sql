-- The GitHub App installation step (onboarding): a site can't be set up until the App is
-- installed on the account that will own its repository, with access to all repositories.
--
-- sites.github_access: NULL = fine; otherwise what the owner has to do on GitHub first:
--   'install'     the App isn't installed on the account (never, or it was uninstalled later)
--   'repo_access' it is installed with "Only select repositories" (new repos aren't covered)
--   'requested'   an organization member asked the org's owners to approve the install
ALTER TABLE sites ADD COLUMN github_access TEXT;

-- Remote MCP connections may be allowed to create new sites (first run, with no sites yet).
ALTER TABLE mcp_connections ADD COLUMN can_create INTEGER NOT NULL DEFAULT 0;

-- DevGitHubAccess's model of App installations (DEV_MODE only): one row per account the App is
-- installed on. Dev sign-in installs it for the new account unless asked not to.
CREATE TABLE dev_installations (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  account_login        TEXT NOT NULL COLLATE NOCASE,
  account_type         TEXT NOT NULL DEFAULT 'User',
  repository_selection TEXT NOT NULL DEFAULT 'all',
  created_at           INTEGER NOT NULL,
  deleted_at           INTEGER
);
CREATE INDEX dev_installations_account ON dev_installations(account_login);
