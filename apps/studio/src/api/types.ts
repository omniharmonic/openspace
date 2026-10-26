import type { SiteDocument } from "@openspace/schema";

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

export interface HubApi {
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
  /** The site's editable content (`GET /api/sites/:id/document`). */
  getDocument(id: string): Promise<SiteDocumentResponse>;
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
