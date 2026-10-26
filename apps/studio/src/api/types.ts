import type { SiteDocument, Styles } from "@openspace/schema";
import type { BuildState, PublishError, RoomSocket } from "../features/sync/protocol";
import type { CatalogApi } from "./catalog-types";
import type { ManageApi } from "./manage-types";

/**
 * Hub API contract as Studio consumes it (architecture §8.2).
 * The Hub (Task 14) implements these routes; until then the in-memory mock
 * in ./mock.ts implements the same `HubApi` interface.
 */

export interface User {
  id: string;
  /** GitHub login (or dev-mode handle). */
  login: string;
  name: string;
  avatarUrl: string | null;
}

/** `GET /api/me` */
export interface Session {
  user: User | null;
  /** Which sign-in methods the Hub offers. `dev` is only true when DEV_MODE is on. */
  auth: { github: boolean; dev: boolean };
}

/** Visual parameters of one template "look" — enough to sketch a preview before the renderer is wired. */
export interface LookStyles {
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    /** Ink used on top of the accent color. */
    onAccent: string;
  };
  fonts: {
    /** CSS font-family stacks; first family is the template's OFL face. */
    heading: string;
    body: string;
  };
  /** Corner radius in px for buttons and images. */
  radius: number;
  imageShape?: "rect" | "arch" | "circle";
}

export interface TemplateLook {
  id: string;
  name: string;
  styles: LookStyles;
  /** The look's complete Site Styles (`content/styles.json`), when the Hub sends them. */
  siteStyles?: Styles;
}

/** `GET /api/templates` item. */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  /** Who it's for, e.g. "Yoga, therapy, bodywork, wellness". */
  persona: string;
  mood: string;
  looks: TemplateLook[];
  /** Demo owner the template's sample content is written for. */
  sample?: { name: string; tagline: string };
  thumbnailUrl?: string | null;
  /** Live preview page; `?look=<id>` selects a look. */
  previewUrl?: string | null;
  /** Template version (semver). */
  version?: string;
}

export type SiteStatus = "building" | "live" | "failed";
export type SiteRole = "owner" | "designer" | "editor" | "contributor";

/** Site record returned by `/api/sites*`. */
export interface Site {
  id: string;
  name: string;
  tagline?: string | null;
  /** Git location ("owner/name"). Advanced-only — never shown in primary UI copy. */
  repo: string;
  status: SiteStatus;
  url: string;
  template: string;
  look?: string | null;
  createdAt: string;
  /** Unread form entries. */
  inboxCount: number;
  /** A template or kit update is waiting to be applied. */
  updateAvailable: boolean;
  /** Login of the account that owns the site. */
  owner?: string;
  /** The signed-in person's role on this site. */
  role?: SiteRole;
  /** Where the site is hosted (Hub `SiteView.deployTarget`). */
  deployTarget?: "github-pages" | "cloudflare" | string;
  /** Connected custom domain, if any. */
  domain?: string | null;
  /** Plain-language detail for the status (e.g. why the last publish failed). */
  statusDetail?: string | null;
}

/** `POST /api/sites` body. */
export interface CreateSiteInput {
  template: string;
  look: string;
  name: string;
  tagline: string;
  brandColor?: string;
  /** Optional logo as a data: URL (small images only); the Hub stores it as site media. */
  logo?: string;
}

/** `POST /api/sites/:id/transfer` result. */
export interface TransferResult {
  site: Site;
  /** "pending" until the recipient accepts, when the Hub needs that. */
  status: "pending" | "complete";
}

export interface GitHubSignInParams {
  template?: string;
  name?: string;
  /** Studio path to come back to after sign-in. */
  returnTo?: string;
}

/**
 * `ManageApi`: site-management routes (Task 24, ./manage-types.ts). `CatalogApi`: template
 * documents and kit updates (Task 26, ./catalog-types.ts).
 */
export interface HubApi extends ManageApi, CatalogApi {
  readonly kind: "http" | "mock";
  getSession(): Promise<Session>;
  devLogin(name: string): Promise<User>;
  /**
   * Starts GitHub sign-in. The HTTP client navigates the window to the Hub
   * (resolving to null as the page unloads); the mock signs in immediately.
   */
  startGitHubSignIn(params: GitHubSignInParams): Promise<User | null>;
  logout(): Promise<void>;
  listTemplates(): Promise<TemplateSummary[]>;
  listSites(): Promise<Site[]>;
  getSite(id: string): Promise<Site>;
  createSite(input: CreateSiteInput): Promise<Site>;
  transferSite(id: string, to: string): Promise<TransferResult>;
  /** Re-runs publishing for a site whose first version didn't go live (`POST /api/sites/:id/publish`). */
  retryPublish(id: string): Promise<Site>;
  /**
   * Deletes a site (FR-4): its files are archived, Hub data is kept 30 days then purged.
   * `confirmName` must equal the site's name (`DELETE /api/sites/:id`, body `{ confirm }`).
   */
  deleteSite(id: string, confirmName: string): Promise<void>;
  /**
   * The site's content (`GET /api/sites/:id/document`): the draft, or with
   * `{ ref: "published" }` what's live now.
   */
  getDocument(id: string, options?: { ref?: "draft" | "published" }): Promise<SiteDocumentResponse>;

  // --- Draft room (Task 15 contract) ---------------------------------------------------------
  /** The room's document and seq (`GET /api/sites/:id/room/document`). */
  getRoomDocument(id: string): Promise<RoomDocumentResponse>;
  /** Opens the room's WebSocket (`GET /api/sites/:id/room?since=<seq>`). */
  connectRoom(id: string, since: number | null): RoomSocket;
  /** "Undo all" of an agent session (`POST /api/sites/:id/room/agent-sessions/:sid/undo`). */
  undoAgentSession(id: string, sessionId: string): Promise<AgentUndoResult>;

  // --- Publishing and history ----------------------------------------------------------------
  /** Publish the draft (`POST /api/sites/:id/publish`). */
  publish(id: string): Promise<PublishResponse>;
  /** "Fix it for me" for the last failed publish (`POST /api/sites/:id/fix`). */
  fixLastPublish(id: string): Promise<FixResult>;
  listVersions(id: string): Promise<SiteVersion[]>;
  /** Make an earlier version live again (`POST /api/sites/:id/rollback`). Designer+. */
  rollback(id: string, sha: string): Promise<RollbackResult>;
  /** Where to look at a published version (opens in a new tab). */
  versionPreviewUrl(id: string, sha: string): string;
  listSnapshots(id: string): Promise<Snapshot[]>;
  createSnapshot(id: string, name: string): Promise<{ name: string; tag: string; sha: string }>;
  /** Make the draft match a snapshot (applied as ordinary edits). Designer+. */
  restoreSnapshot(
    id: string,
    name: string,
  ): Promise<{ applied: number; failed: number; seq: number }>;
  listSchedules(id: string): Promise<PublishSchedule[]>;
  /** Publish at a date and time (≥ 30 s ahead, ≤ 1 year). */
  schedulePublish(id: string, at: Date): Promise<PublishSchedule>;
  cancelSchedule(id: string, scheduleId: string): Promise<void>;
}

/** `GET /api/sites/:id/room/document` */
export interface RoomDocumentResponse {
  document: SiteDocument;
  seq: number;
  head: string | null;
}

export interface AgentUndoResult {
  sessionId: string;
  /** Changes undone. */
  reverted: number;
  /** Changes kept because someone edited the same thing afterwards. */
  skipped: number;
  seq: number;
}

export interface PublishOutcome {
  status: "published" | "no_changes";
  sha?: string;
  summary?: string;
  build?: BuildState;
  publishId?: string;
}

/** `POST /api/sites/:id/publish`; `publish` is null when the site's setup was resumed instead. */
export interface PublishResponse {
  site: Site;
  publish: PublishOutcome | null;
}

export interface FixResult {
  fix: "revert" | "retry" | "enable_pages";
  sha: string;
  site: Site;
}

export interface SiteVersion {
  sha: string;
  /** "Edited Home and About; added 2 images". */
  summary: string;
  author: string | null;
  date: string;
  kind: "publish" | "rollback" | "revert" | "setup";
  status: BuildState | null;
  error: PublishError | null;
  /** The version the live site is on. */
  current: boolean;
}

export interface RollbackResult {
  sha: string;
  summary: string;
  /** Snapshot holding unpublished changes saved before rolling back. */
  snapshot: string | null;
  site: Site;
}

export interface Snapshot {
  name: string;
  tag: string;
  sha: string;
  /** Made automatically (before an AI session, before a rollback). */
  automatic: boolean;
  date: string | null;
}

export interface PublishSchedule {
  id: string;
  kind: "publish";
  runAt: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  error: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** `GET /api/sites/:id/document`: the draft content (falls back to what's published). */
export interface SiteDocumentResponse {
  document: SiteDocument;
  /** Version of the draft the document was read at (opaque to Studio). */
  head?: string | null;
  branch?: string | null;
}

/** Error raised for non-2xx Hub responses. */
export class HubError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HubError";
  }
}
