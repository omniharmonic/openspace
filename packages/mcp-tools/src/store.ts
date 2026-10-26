/**
 * The `SiteStore` boundary: everything the MCP tools need from wherever a site lives.
 *
 * - `MemorySiteStore` (this package) keeps documents in memory — tests and demos.
 * - `FileSiteStore` (`@openspace/cli`) edits a local checkout through site-kit's content
 *   loader/writer; publishing is a git commit, snapshots are `os/snap/*` tags.
 * - `HubSiteStore` (Hub, Task 17) maps every call onto the DraftRoom RPC: `getDocument`,
 *   `submit` (as an agent session actor), `startAgentSession`/`endAgentSession`, `publish`,
 *   `rollback`, `snapshot`, plus the versions/preview endpoints.
 *
 * Every mutation goes through `applyOps` with validated `@openspace/ops` operations (Global
 * Constraint 5); stores never take raw page JSON.
 */
import type { Op, OpIssue } from "@openspace/ops";
import type { MediaMeta, SiteDocument, StyleChoices } from "@openspace/schema";

/** What a connected agent may do. Hub grants are per site and revocable (arch §10.1). */
export interface Grant {
  /** Sites this grant covers; `"*"` = every site the store lists (local CLI). */
  sites: readonly string[] | "*";
  /** May publish (`publish` still needs `confirm: true`). */
  publish: boolean;
  /**
   * The person's role on the site. When set, ops go through `transformForRole` and
   * `discard_draft` needs designer or owner. **Leave it undefined only for a local, single-owner
   * store** (the CLI on the person's own checkout): undefined means "owner, trusted locally".
   * Every Hub grant must set it.
   */
  role?: "owner" | "designer" | "editor" | "contributor";
  /**
   * Per-site roles (a Hub grant spanning sites where the person has different roles). A site
   * listed here uses its own role instead of `role`.
   */
  roles?: Readonly<Record<string, "owner" | "designer" | "editor" | "contributor">>;
  /** Person the agent works for (Hub user id); recorded on sessions. */
  userId?: string;
  /** Agent label shown in Studio ("Claude"). */
  label?: string;
}

export interface StoreCapabilities {
  /** The store can publish at all (a git commit locally, a squash-merge on the Hub). */
  canPublish: boolean;
  /** `screenshot()` is implemented and configured (Playwright locally, Browser Rendering on the Hub). */
  canScreenshot: boolean;
  /** Versions can be listed and rolled back to. */
  canRollback: boolean;
  /** Short note about how publishing works here, shown in `get_site` and tool results. */
  publishNote?: string;
}

export interface SiteSummary {
  id: string;
  title: string;
  /** Live site address, if known. */
  url?: string | null;
}

/** An agent session: a snapshot at its start makes "Undo all of Claude's changes" possible. */
export interface AgentSession {
  sessionId: string;
  /** Actor recorded on the session's ops (`agent:<sessionId>` on the Hub). */
  actor: string;
  /** Snapshot tag/name taken at the start of the session, when the store supports one. */
  snapshot?: string | null;
}

export interface ApplyContext {
  actor: string;
  /** Agent session the ops belong to. */
  session?: string;
}

export type ApplyResult =
  | { ok: true; doc: SiteDocument; warnings: OpIssue[] }
  | {
      ok: false;
      /** Index of the first op that failed (the ops before it were not applied either). */
      index: number;
      errors: OpIssue[];
      /** Stable code from the store (e.g. `forbidden`, `stale`, `invalid`). */
      code?: string;
    };

export interface DraftDiff {
  /** True when the draft differs from what is published. */
  hasChanges: boolean;
  /** One line, e.g. "Edited Home and About; added 2 images". */
  summary: string;
  /** Optional detail lines (one per change). */
  changes?: string[];
}

export interface PublishResult {
  status: "published" | "no_changes";
  /** Version id (commit sha on git-backed stores). */
  version?: string;
  summary: string;
  /** Plain-language note ("Your site will update in about a minute."). */
  note?: string;
}

export interface VersionInfo {
  version: string;
  summary: string;
  date: string;
  author?: string;
  current?: boolean;
}

/** Image upload input: exactly one of `url` / `base64`. */
export interface ImageUploadInput {
  url?: string;
  base64?: string;
  alt: string;
  /** Suggested file name (used for the media path). */
  filename?: string;
  credit?: { author?: string; url?: string; source?: string };
  license?: string;
}

export type Device = "desktop" | "tablet" | "mobile";

export interface ScreenshotRequest {
  /** Page id to capture. */
  pageId: string;
  /** Limit the capture to one section (by its `data-os-id`). */
  sectionId?: string;
  device: Device;
  /** Viewport width in CSS px (1440 / 834 / 390 by default). */
  width: number;
  fullPage: boolean;
  /** Rendered preview HTML (stores that render through their own preview server may ignore it). */
  html: string;
}

export interface Screenshot {
  /** PNG bytes, base64-encoded. */
  base64: string;
  mimeType: "image/png";
  width: number;
  height?: number;
}

/** A template "look": Site Styles choices that restyle existing content (doc 04 §7.2). */
export interface TemplateLook {
  id: string;
  name: string;
  description?: string;
  choices: StyleChoices;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description?: string;
  /** Who it's for. */
  persona?: string;
  mood?: string;
  tags?: string[];
  looks: TemplateLook[];
}

/** Template registry injected by a store (or found as an optional package). */
export interface TemplateCatalog {
  list(): TemplateInfo[] | Promise<TemplateInfo[]>;
}

export interface SiteStore {
  readonly capabilities: StoreCapabilities;
  /** Optional template registry (otherwise `@openspace/templates` or the built-in looks). */
  readonly templates?: TemplateCatalog;

  listSites(): Promise<SiteSummary[]>;
  /** The current draft document. */
  getDocument(siteId: string): Promise<SiteDocument>;
  /** Validate and apply ops atomically (all or nothing) to the draft. */
  applyOps(siteId: string, ops: Op[], ctx: ApplyContext): Promise<ApplyResult>;
  getDraftDiff(siteId: string): Promise<DraftDiff>;
  publish(siteId: string, opts: { message?: string; actor: string }): Promise<PublishResult>;
  /** Throw the draft away (back to the published version). */
  discardDraft(siteId: string, ctx: ApplyContext): Promise<DraftDiff>;
  rollback(siteId: string, version: string, ctx: ApplyContext): Promise<PublishResult>;
  listVersions(siteId: string, opts?: { limit?: number }): Promise<VersionInfo[]>;
  /** Preview address for the draft (a page path is appended when given), or null. */
  previewUrl(siteId: string, pagePath?: string): Promise<string | null>;
  /** Store the image (resized ≤ 2400px, metadata stripped), add it to media, return its meta. */
  uploadImage(siteId: string, input: ImageUploadInput, ctx: ApplyContext): Promise<MediaMeta>;
  /** Named snapshot of the draft; returns its tag (`os/snap/<name>`) or null when unsupported. */
  snapshot(siteId: string, name: string): Promise<string | null>;
  /** Called once per site before an agent's first edit in a connection. */
  startSession(siteId: string, opts: { label: string; userId?: string }): Promise<AgentSession>;
  /** Called when the connection closes. */
  endSession(siteId: string, sessionId: string): Promise<void>;
  /** Capture a PNG (only when `capabilities.canScreenshot`). */
  screenshot?(siteId: string, request: ScreenshotRequest): Promise<Screenshot>;
  /** Text of the site's AGENTS.md if the store has one (else it is generated). */
  agentsMd?(siteId: string): Promise<string | null>;
}
