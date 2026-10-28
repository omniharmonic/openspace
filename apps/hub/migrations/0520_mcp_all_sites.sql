-- "Start with Claude" permissions that can't get out of sequence.
--
-- mcp_connections.all_sites: the person allowed this AI app to edit ALL their sites, including
-- ones they make later (in Studio or elsewhere). Every site-scoped tool honours it through
-- grantSites(); explicit mcp_grants rows still exist for connections without it. Publishing stays
-- the separate can_publish opt-in. Revocable from Studio → Connect your AI.
ALTER TABLE mcp_connections ADD COLUMN all_sites INTEGER NOT NULL DEFAULT 0;
