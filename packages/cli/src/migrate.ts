import { blocksRegistry } from "@openspace/blocks";
import {
  CURRENT_SCHEMA_VERSION,
  type MigrateSiteOptions,
  migrateSite,
  type SiteContentLike,
  type SiteDocument,
} from "@openspace/schema";
import { loadSiteDocument, writeSiteDocument } from "@openspace/site-kit/content";

export interface MigrateResult {
  from: number;
  to: number;
  /** Site-level migrations applied, in order. */
  applied: string[];
  /** Blocks upgraded to their definition's current version. */
  blocksMigrated: number;
  /** Repo-relative files written. */
  written: string[];
  removed: string[];
}

/**
 * Run site-level and block-level migrations over the checkout and write the result back.
 * Idempotent: a current site changes nothing on disk.
 */
export async function runMigrate(
  root: string,
  opts: { dryRun?: boolean; migrations?: MigrateSiteOptions["migrations"]; target?: number } = {},
): Promise<MigrateResult> {
  const doc = await loadSiteDocument(root);
  const from = doc.config.schemaVersion;
  const siteResult = migrateSite(doc as unknown as SiteContentLike, {
    migrations: opts.migrations,
    target: opts.target,
  });
  let next = siteResult.content as unknown as SiteDocument;

  const registry = blocksRegistry();
  let blocksMigrated = 0;
  const migrateBlocks = <T extends { blocks: SiteDocument["site"]["footer"]["blocks"] }>(
    s: T,
  ): T => ({
    ...s,
    blocks: s.blocks.map((b) => {
      const m = registry.migrate(b);
      if (m !== b) blocksMigrated++;
      return m;
    }),
  });
  next = {
    ...next,
    site: { ...next.site, footer: migrateBlocks(next.site.footer) },
    pages: Object.fromEntries(
      Object.entries(next.pages).map(([id, page]) => [
        id,
        { ...page, sections: page.sections.map(migrateBlocks) },
      ]),
    ),
  };

  let written: string[] = [];
  let removed: string[] = [];
  if (siteResult.applied.length || blocksMigrated) {
    if (opts.dryRun) {
      written = ["(dry run: nothing written)"];
    } else {
      const r = await writeSiteDocument(root, next);
      written = r.written;
      removed = r.removed;
    }
  }
  return {
    from,
    to: siteResult.to,
    applied: siteResult.applied,
    blocksMigrated,
    written,
    removed,
  };
}

export { CURRENT_SCHEMA_VERSION };
