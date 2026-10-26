/**
 * Hub contract for the site-management surfaces (Task 24): media uploads, page passwords,
 * domains, "Connect your AI", collaborators, hosting and exports.
 *
 * Routes marked "planned" are not in the Hub yet; the mock implements them and the shapes here
 * are the contract the Hub should honor (see the Task 24 report).
 */

import type { SiteRole } from "./types";

// --- media -----------------------------------------------------------------------------------

/** What Studio sends with a processed file (`POST /api/sites/:id/media`, multipart; planned). */
export interface MediaUploadMeta {
  /** Where the file goes in the site, e.g. `media/2026/10/sunset-3fa9c2d1.jpg`. */
  path: string;
  mime: string;
  bytes: number;
  /** Full SHA-256 of the bytes (hex) so the Hub can verify and dedupe. */
  sha256: string;
}

export interface MediaUploadResult {
  path: string;
  bytes: number;
  /** True when the Hub already had this exact file (nothing new was stored). */
  existed?: boolean;
}

// --- page passwords (Task 18) ----------------------------------------------------------------

export interface PagePasswordEntry {
  pageId: string;
  updatedAt: string;
}

// --- domains (Task 16) -----------------------------------------------------------------------

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "TXT" | "ALIAS" | string;
  /** Host as most registrars want it typed (`@`, `www`). */
  host: string;
  /** Fully qualified name. */
  name: string;
  value: string;
  optional?: boolean;
}

export interface RegistrarGuide {
  id: string;
  name: string;
  /** Where the registrar's DNS settings live. */
  dnsUrl: string | null;
  /** How this registrar writes the main (apex) host, e.g. "@" or blank. */
  hostApex: string;
  steps: string[];
  watchOut: string[];
}

export interface DomainLookup {
  hostname: string;
  apex: string;
  registrar: string | null;
  nameservers: string[];
  /** Instructions for where the domain's DNS is managed (generic guide `other` when unknown). */
  guide: RegistrarGuide;
  records: DnsRecord[];
}

export type DomainStatus = "pending" | "verifying" | "active" | "failed";

export interface DomainCheckItem {
  id: "apex" | "www" | "subdomain" | "https" | string;
  label: string;
  ok: boolean;
  expected: string[];
  found: string[];
  hint?: string;
}

export interface DomainView {
  hostname: string;
  apex: string;
  status: DomainStatus;
  https: boolean;
  registrar: string | null;
  records: DnsRecord[];
  checklist: DomainCheckItem[];
  /** Plain-language status, e.g. "✓ www points to GitHub — waiting for the main domain". */
  message: string;
  createdAt: string;
  verifiedAt: string | null;
  checkedAt: string | null;
}

// --- Connect your AI (Task 17; planned) ------------------------------------------------------

/** A personal connector URL for one site (`/api/sites/:id/mcp/tokens`). */
export interface McpToken {
  id: string;
  label: string;
  /** The MCP server URL to paste into Claude (carries the personal token). */
  url: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** An AI app the person allowed to edit their sites (`/api/mcp/grants`). */
export interface McpGrant {
  id: string;
  /** e.g. "Claude", "Claude Code". */
  clientName: string;
  sites: Array<{ id: string; name: string }>;
  /** May the app publish (still with explicit confirmation per publish)? */
  publish: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

// --- collaborators (Task 15) -----------------------------------------------------------------

export type CollaboratorRole = Exclude<SiteRole, "owner">;

export interface Collaborator {
  userId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  role: SiteRole;
  lockedSections: string[];
  since: string;
}

export interface Invitation {
  id: string;
  email: string | null;
  login: string | null;
  role: CollaboratorRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

/** `GET /api/invitations/:token`: what an invitation link offers (no session needed). */
export interface InvitationPreview {
  siteName: string;
  role: CollaboratorRole;
  invitedBy: string;
  status: Invitation["status"];
  expiresAt: string;
}

export interface CollaboratorList {
  collaborators: Collaborator[];
  invitations: Invitation[];
}

export interface InviteInput {
  email?: string;
  login?: string;
  role: CollaboratorRole;
}

export interface Approval {
  id: string;
  collection: string;
  slug: string;
  title: string;
  submittedBy: { userId: string; login: string; name: string | null };
  status: "pending" | "approved" | "rejected";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  contentHash?: string;
}

// --- hosting (planned) -----------------------------------------------------------------------

export type HostingTarget = "github-pages" | "cloudflare";

/**
 * `GET /api/sites/:id/hosting` (planned). `actionsPublicKey` is the site's GitHub Actions
 * public key: Studio seals secrets with it in the browser, so the Hub only ever relays
 * ciphertext.
 */
export interface HostingInfo {
  target: HostingTarget;
  url: string;
  actionsPublicKey: { keyId: string; key: string } | null;
  /** Which sealed secrets are already set (names only; values are never readable). */
  secrets: string[];
  /** Progress of a switch between hosts. */
  switching: { to: HostingTarget; status: "pending" | "failed"; error?: string } | null;
}

/** One sealed secret for `PUT /api/sites/:id/hosting/secrets` (planned). */
export interface SealedSecret {
  name: string;
  /** base64 libsodium sealed box of the value, made with `actionsPublicKey`. */
  encryptedValue: string;
  keyId: string;
}

// --- exports (Task 16/18) --------------------------------------------------------------------

export type ExportKind = "data" | "submissions" | "subscribers" | "members";

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

export interface ManageApi {
  /** Rename the site in OpenSpace (`PATCH /api/sites/:id {name}`). */
  renameSite(siteId: string, name: string): Promise<void>;

  /** Upload one processed media file (`POST /api/sites/:id/media`, multipart `file` + `meta`; planned). */
  uploadMedia(siteId: string, file: Blob, meta: MediaUploadMeta): Promise<MediaUploadResult>;

  listPagePasswords(siteId: string): Promise<PagePasswordEntry[]>;
  setPagePassword(siteId: string, pageId: string, password: string): Promise<void>;
  clearPagePassword(siteId: string, pageId: string): Promise<void>;

  listRegistrars(): Promise<RegistrarGuide[]>;
  getDomain(siteId: string): Promise<DomainView | null>;
  lookupDomain(siteId: string, domain: string): Promise<DomainLookup>;
  connectDomain(siteId: string, domain: string): Promise<DomainView>;
  checkDomain(siteId: string): Promise<DomainView>;
  removeDomain(siteId: string): Promise<void>;

  listMcpTokens(siteId: string): Promise<McpToken[]>;
  createMcpToken(siteId: string, label: string): Promise<McpToken>;
  revokeMcpToken(siteId: string, tokenId: string): Promise<void>;
  listMcpGrants(): Promise<McpGrant[]>;
  revokeMcpGrant(grantId: string): Promise<void>;
  setMcpGrantPublish(grantId: string, publish: boolean): Promise<McpGrant>;

  listCollaborators(siteId: string): Promise<CollaboratorList>;
  /** The invitation behind an invitation link (`GET /api/invitations/:token`). */
  getInvitation?(token: string): Promise<InvitationPreview>;
  /** Accept an invitation link as the signed-in person (`POST /api/invitations/:token/accept`). */
  acceptInvitation?(token: string): Promise<{ siteId: string; role: CollaboratorRole }>;
  inviteCollaborator(
    siteId: string,
    input: InviteInput,
  ): Promise<{ invitation: Invitation; acceptUrl: string }>;
  updateCollaborator(
    siteId: string,
    userId: string,
    patch: { role?: CollaboratorRole; lockedSections?: string[] },
  ): Promise<Collaborator>;
  removeCollaborator(siteId: string, userId: string): Promise<void>;
  revokeInvitation(siteId: string, invitationId: string): Promise<void>;
  listApprovals(siteId: string, status?: Approval["status"]): Promise<Approval[]>;
  decideApproval(
    siteId: string,
    approvalId: string,
    decision: "approve" | "reject",
    note?: string,
    /** The version the reviewer saw; the Hub refuses with 409 `changed_since_review` if it moved on. */
    contentHash?: string,
  ): Promise<Approval>;

  getHosting(siteId: string): Promise<HostingInfo>;
  putHostingSecrets(siteId: string, secrets: SealedSecret[]): Promise<void>;
  switchHosting(siteId: string, target: HostingTarget): Promise<HostingInfo>;

  downloadExport(siteId: string, kind: ExportKind): Promise<DownloadedFile>;
}
