import type { SiteDocument } from "@openspace/schema";
import type { TemplateSummary } from "./types";

/**
 * Template documents and kit updates (Task 26): what Studio needs for live template renders,
 * "Try a new look" and the "Update available" banner.
 */

/** `GET /api/templates/:id`: gallery data plus the template's complete site document. */
export interface TemplateDetail extends TemplateSummary {
  document: SiteDocument;
}

export interface ChangelogEntry {
  version: string;
  /** Plain-language notes, newest first. */
  notes: string[];
  security?: boolean;
}

export type KitUpdateStatus =
  | "pending"
  | "applying"
  | "applied"
  | "dismissed"
  | "failed"
  | "superseded";

/** The Hub's `UpdateView` (Task 18 update bot). */
export interface KitUpdate {
  id: string;
  /** Version the site is on. */
  from: string;
  /** Version on offer. */
  to: string;
  title: string;
  changelog: ChangelogEntry[];
  security: boolean;
  status: KitUpdateStatus;
  /** Advanced-only link to the change on the site's host (never shown in primary UI). */
  prUrl: string | null;
  error: string | null;
  createdAt: string;
  appliedAt: string | null;
  /**
   * A page that renders the site with the new version (arch §11.2 "versioned CDN build of the
   * renderer"), when the Hub offers one. Without it Studio shows the changelog only.
   */
  previewUrl?: string | null;
}

export interface CatalogApi {
  /** A template with its document (`GET /api/templates/:id`). Public: no account needed. */
  getTemplate(id: string): Promise<TemplateDetail>;
  /** Kit updates for a site, newest first (`GET /api/sites/:id/updates`). Editor+. */
  listUpdates(siteId: string): Promise<KitUpdate[]>;
  /** Look for a newer version now (`POST /api/sites/:id/updates/check`). Designer+. */
  checkForUpdate(siteId: string): Promise<KitUpdate | null>;
  /** Apply a pending update (`POST /api/sites/:id/updates/:uid/apply`). Designer+. */
  applyUpdate(siteId: string, updateId: string): Promise<KitUpdate>;
  /** Hide an update (`POST /api/sites/:id/updates/:uid/dismiss`). Designer+. */
  dismissUpdate(siteId: string, updateId: string): Promise<void>;
}
