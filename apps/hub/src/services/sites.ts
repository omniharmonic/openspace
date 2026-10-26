import type { Role } from "@openspace/ops";
import {
  CssColorSchema,
  type MediaId,
  newId,
  type Page,
  type SiteDocument,
  type SiteId,
  scanValueForSecrets,
} from "@openspace/schema";
import { z } from "zod";
import { audit } from "../db/audit";
import {
  getSiteForUser,
  insertSite,
  listSitesForUser,
  RETENTION_MS,
  repoTaken,
  type SiteRow,
  type SiteStatus,
  type SiteWithRole,
  setRole,
  updateSite,
} from "../db/sites";
import { getUserByLogin, type User } from "../db/users";
import {
  DRAFT_BRANCH,
  type FileContent,
  type GitHubAccess,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  parseRepo,
  repoFullName,
} from "../github/types";
import { forbidden, HttpError, notFound } from "../lib/errors";
import { type DecodedImage, decodeImageDataUrl } from "../lib/image";
import type { Logger } from "../lib/log";
import type { Services } from "./index";
import { personalizeDocument } from "./personalize";
import { isDocumentPath, loadSiteDocument, siteDocumentToFiles } from "./site-files";
import type { TemplateMeta } from "./templates";

// --- API shapes ----------------------------------------------------------------------------------

/** The site record Studio shows (dashboard cards, editor header). */
export interface SiteView {
  id: string;
  name: string;
  tagline: string | null;
  repo: string;
  /** Login of the owning account. */
  owner: string;
  ownerName: string | null;
  status: SiteStatus;
  statusDetail: string | null;
  url: string | null;
  template: string;
  templateVersion: string;
  look: string | null;
  deployTarget: string;
  domain: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
  inboxCount: number;
  updateAvailable: boolean;
}

export const CreateSiteSchema = z.strictObject({
  template: z.string().min(1).max(64),
  look: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Give your site a name").max(80),
  tagline: z.string().trim().max(200).optional(),
  brandColor: CssColorSchema.optional().nullable(),
  /** Optional logo as a `data:image/…;base64,` URL (PNG, JPEG, WebP or GIF; ≤ 1 MB). */
  logo: z.string().max(1_500_000).optional().nullable(),
});
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;

export const PatchSiteSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
});

export const DeleteSiteSchema = z
  .strictObject({
    /** Typed confirmation: must equal the site's name (FR-4). `confirm` is accepted as an alias. */
    confirmName: z.string().optional(),
    confirm: z.string().optional(),
  })
  .transform((v) => ({ confirm: v.confirmName ?? v.confirm ?? "" }));

export const TransferSiteSchema = z.strictObject({
  to: z.string().trim().min(1).max(39),
});

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function toSiteView(row: SiteWithRole, templates: TemplateMeta[] = []): SiteView {
  const tpl = templates.find((t) => t.id === row.template_id);
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    repo: row.repo,
    owner: row.owner_login,
    ownerName: row.owner_name,
    status: row.status,
    statusDetail: row.status_detail,
    url: row.url,
    template: row.template_id,
    templateVersion: row.template_version,
    look: row.look,
    deployTarget: row.deploy_target,
    domain: row.domain,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    inboxCount: row.inbox_count,
    updateAvailable: tpl ? compareVersions(tpl.version, row.template_version) > 0 : false,
  };
}

// --- helpers ---------------------------------------------------------------------------------------

export function slugifyRepoName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "site";
}

async function uniqueRepoName(
  services: Services,
  gh: GitHubAccess,
  owner: string,
  base: string,
): Promise<string> {
  for (let i = 1; i <= 50; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    const full = `${owner}/${name}`;
    if (await repoTaken(services.db, full)) continue;
    if (await gh.getRepo({ owner, name })) continue;
    return name;
  }
  throw new HttpError(409, "name_taken", "Too many sites with that name; try another name.");
}

export const MAX_LOGO_BYTES = 1024 * 1024;

export function previewUrl(hubUrl: string, siteId: string): string {
  return `${hubUrl}/s/${siteId}/`;
}

function githubPagesUrl(owner: string, name: string): string {
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
}

const ROLE_RANK: Record<Role, number> = { contributor: 1, editor: 2, designer: 3, owner: 4 };

export function requireRole(site: SiteWithRole, min: Role): void {
  if (ROLE_RANK[site.role] < ROLE_RANK[min])
    throw forbidden(min === "owner" ? "Only the site owner can do that." : undefined);
}

export async function siteForUser(
  services: Services,
  id: string,
  user: User,
): Promise<SiteWithRole> {
  const site = await getSiteForUser(services.db, id, user.id);
  if (!site) throw notFound("We couldn't find that site.");
  return site;
}

// --- operations --------------------------------------------------------------------------------

export async function listSites(services: Services, user: User): Promise<SiteView[]> {
  const [rows, templates] = await Promise.all([
    listSitesForUser(services.db, user.id),
    services.templates.list(),
  ]);
  return rows.map((r) => toSiteView(r, templates));
}

/** Refresh a building site's status from its publish workflow. */
export async function refreshStatus(
  services: Services,
  site: SiteWithRole,
  log?: Logger,
): Promise<SiteWithRole> {
  if (site.status !== "building") return site;
  try {
    const gh = services.github({ site });
    const run = await gh.workflowStatus(parseRepo(site.repo), {
      workflow: PUBLISH_WORKFLOW,
      ref: MAIN_BRANCH,
    });
    const status: SiteStatus | null =
      run.state === "success" ? "live" : run.state === "failure" ? "failed" : null;
    if (!status) return site;
    await updateSite(services.db, site.id, { status }, services.now());
    return { ...site, status };
  } catch (err) {
    log?.warn("status refresh failed", { siteId: site.id, err });
    return site;
  }
}

export async function getSiteView(services: Services, id: string, user: User, log?: Logger) {
  const site = await refreshStatus(services, await siteForUser(services, id, user), log);
  return toSiteView(site, await services.templates.list());
}

/**
 * Create a site from a template (FR-2, arch §6.2): personalize the template's document, create
 * the repo with the files, open the draft branch, enable Pages and dispatch the first publish.
 * GitHub failures leave a `failed` site record (shown on the dashboard) rather than vanishing.
 */
export async function createSite(
  services: Services,
  user: User,
  input: CreateSiteInput,
  opts: { log?: Logger; installationId?: number | null } = {},
): Promise<SiteView> {
  const template = await services.templates.load(input.template);
  if (!template) throw new HttpError(404, "template_not_found", "That template doesn't exist.");
  const look = input.look
    ? template.meta.looks.find((l) => l.id === input.look)
    : template.meta.looks[0];
  if (!look)
    throw new HttpError(400, "look_not_found", "That look doesn't exist for this template.");

  const now = services.now();
  const siteId = newId("st") as SiteId;
  const gh = services.github({ user, installationId: opts.installationId ?? null });
  const owner = user.login;
  const repoName = await uniqueRepoName(services, gh, owner, slugifyRepoName(input.name));
  const deployUrl =
    gh.kind === "dev"
      ? previewUrl(services.config.hubUrl, siteId)
      : githubPagesUrl(owner, repoName);

  let logo: (DecodedImage & { path: string; mediaId: MediaId }) | undefined;
  if (input.logo) {
    try {
      const img = decodeImageDataUrl(input.logo, MAX_LOGO_BYTES);
      const d = new Date(now);
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const mediaId = newId("med") as MediaId;
      const path = `media/${d.getUTCFullYear()}/${month}/logo-${mediaId.slice(4, 10)}.${img.ext}`;
      logo = { ...img, path, mediaId };
    } catch (err) {
      throw new HttpError(400, "invalid_logo", (err as Error).message);
    }
  }

  let doc: SiteDocument;
  try {
    doc = personalizeDocument(loadSiteDocument(template.files), {
      ...(logo
        ? {
            logo: {
              path: logo.path,
              mediaId: logo.mediaId,
              mime: logo.mime,
              bytes: logo.bytes,
              width: logo.width,
              height: logo.height,
            },
          }
        : {}),
      siteId,
      name: input.name,
      tagline: input.tagline,
      look,
      brandColor: input.brandColor ?? undefined,
      hubUrl: services.config.hubUrl,
      deployUrl,
      template: template.meta,
      actor: user.id,
      now,
    });
  } catch (err) {
    opts.log?.error("template personalization failed", { template: input.template, err });
    throw new HttpError(422, "template_invalid", "That template couldn't be prepared.", {
      issues: (err as { issues?: unknown }).issues,
    });
  }
  const secrets = scanValueForSecrets(doc);
  if (secrets.length)
    throw new HttpError(
      422,
      "secret_detected",
      "That looks like a password or key. Sites are public, so it can't go in your site.",
      { findings: secrets.map((s) => ({ rule: s.rule, preview: s.preview })) },
    );

  const files: Record<string, string | FileContent> = {};
  for (const [path, content] of Object.entries(template.files))
    if (!isDocumentPath(path)) files[path] = content;
  Object.assign(files, siteDocumentToFiles(doc));
  if (logo) files[logo.path] = { content: logo.base64, encoding: "base64" };

  const repo = { owner, name: repoName };
  await insertSite(services.db, {
    id: siteId,
    owner_id: user.id,
    name: input.name.trim(),
    tagline: input.tagline?.trim() || null,
    repo: repoFullName(repo),
    installation_id: opts.installationId ?? null,
    deploy_target: "github-pages",
    domain: null,
    url: deployUrl,
    template_id: template.meta.id,
    template_version: template.meta.version,
    look: look.id,
    status: "building",
    created_at: now,
    updated_at: now,
  });

  let status: SiteStatus = "building";
  let detail: string | null = null;
  let url = deployUrl;
  try {
    const created = await gh.createRepoFromTemplate({
      owner,
      name: repoName,
      description: `${input.name.trim()} — made with OpenSpace`,
      files,
      message: `Create ${input.name.trim()} from the ${template.meta.name} template`,
      author: { name: user.name ?? user.login },
    });
    await gh.createBranch(repo, DRAFT_BRANCH, created.head);
    url = (await gh.enablePages(repo)).url || deployUrl;
    await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    const run = await gh.workflowStatus(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    if (run.state === "success") status = "live";
    else if (run.state === "failure") status = "failed";
  } catch (err) {
    status = "failed";
    detail = "We couldn't finish setting up your site. Try again in a moment.";
    opts.log?.error("site creation failed", { siteId, repo: repoFullName(repo), err });
  }
  await updateSite(services.db, siteId, { status, status_detail: detail, url }, services.now());
  await audit(services.db, {
    siteId,
    actor: user.id,
    action: "site.create",
    meta: { template: template.meta.id, look: look.id, repo: repoFullName(repo), status },
  });
  return getSiteView(services, siteId, user, opts.log);
}

export async function patchSite(
  services: Services,
  id: string,
  user: User,
  patch: z.infer<typeof PatchSiteSchema>,
): Promise<SiteView> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "designer");
  if (patch.name !== undefined)
    await updateSite(services.db, id, { name: patch.name }, services.now());
  await audit(services.db, { siteId: id, actor: user.id, action: "site.update", meta: patch });
  return getSiteView(services, id, user);
}

/**
 * Publish. In this task: (re)dispatch the publish workflow for main — e.g. to retry a failed first
 * build. Task 15 extends this into the full flush + squash-publish of the draft.
 */
export async function publishSite(
  services: Services,
  id: string,
  user: User,
  log?: Logger,
): Promise<SiteView> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "designer");
  const gh = services.github({ user, site });
  const repo = parseRepo(site.repo);
  let status: SiteStatus = "building";
  let detail: string | null = null;
  try {
    if (!(await gh.getRef(repo, DRAFT_BRANCH))) {
      const head = await gh.getRef(repo, MAIN_BRANCH);
      if (head) await gh.createBranch(repo, DRAFT_BRANCH, head);
    }
    await gh.enablePages(repo);
    await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    const run = await gh.workflowStatus(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    if (run.state === "success") status = "live";
    else if (run.state === "failure") status = "failed";
  } catch (err) {
    log?.error("publish failed", { siteId: id, err });
    status = "failed";
    detail = "We couldn't publish your site. Try again in a moment.";
  }
  await updateSite(services.db, id, { status, status_detail: detail }, services.now());
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "site.publish",
    meta: { status },
  });
  return getSiteView(services, id, user, log);
}

/** Archive (FR-4): typed confirmation, repo archived, Hub data kept 30 days then purged. */
export async function archiveSite(
  services: Services,
  id: string,
  user: User,
  confirm: string,
  log?: Logger,
): Promise<{ id: string; archivedAt: string; purgeAt: string }> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "owner");
  if (confirm.trim() !== site.name.trim())
    throw new HttpError(400, "confirmation_mismatch", "Type the site's name exactly to delete it.");
  try {
    await services.github({ user, site }).archiveRepo(parseRepo(site.repo));
  } catch (err) {
    log?.warn("repo archive failed", { siteId: id, err });
    throw new HttpError(
      502,
      "archive_failed",
      "We couldn't archive the site right now. Try again soon.",
    );
  }
  const now = services.now();
  const purgeAt = now + RETENTION_MS;
  await updateSite(services.db, id, { archived_at: now, purge_at: purgeAt }, now);
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "site.archive",
    meta: { purgeAt },
  });
  return { id, archivedAt: new Date(now).toISOString(), purgeAt: new Date(purgeAt).toISOString() };
}

/** Transfer ownership (Site Gardener handoff): repo moves to `to`; the previous owner stays as designer. */
export async function transferSite(
  services: Services,
  id: string,
  user: User,
  to: string,
): Promise<{ site: SiteView; status: "complete" | "pending" }> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "owner");
  const target = await getUserByLogin(services.db, to);
  if (!target)
    throw new HttpError(
      404,
      "user_not_found",
      "We couldn't find that person. Ask them to sign in to OpenSpace once, then try again.",
    );
  if (target.id === user.id) throw new HttpError(400, "bad_request", "You already own this site.");
  const gh = services.github({ user, site });
  const moved = await gh.transferRepo(parseRepo(site.repo), target.login);
  const now = services.now();
  await updateSite(services.db, id, { repo: moved.fullName, owner_id: target.id }, now);
  await setRole(services.db, id, target.id, "owner", now);
  await setRole(services.db, id, user.id, "designer", now);
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "site.transfer",
    meta: { from: site.repo, to: moved.fullName, newOwner: target.id },
  });
  return { site: await getSiteView(services, id, user), status: "complete" };
}

// --- reading content -----------------------------------------------------------------------------

export interface SiteSnapshot {
  doc: SiteDocument;
  head: string;
  branch: string;
}

/** The site's document at a branch (draft falls back to main if the draft branch is missing). */
export async function readSiteDocument(
  services: Services,
  site: Pick<SiteRow, "id" | "repo" | "installation_id">,
  which: "draft" | "published",
  user?: User | null,
): Promise<SiteSnapshot> {
  const gh = services.github({ site, user: user ?? null });
  const repo = parseRepo(site.repo);
  let branch = which === "draft" ? DRAFT_BRANCH : MAIN_BRANCH;
  let head = await gh.getRef(repo, branch);
  if (!head && which === "draft") {
    branch = MAIN_BRANCH;
    head = await gh.getRef(repo, branch);
  }
  if (!head) throw notFound("This site has no content yet.");
  const files = await gh.readFiles(repo, head, { textOnly: true });
  return { doc: loadSiteDocument(files), head, branch };
}

/** Find the page for a URL path below the site root ("" = home). */
export function findPageBySlug(doc: SiteDocument, path: string): Page | null {
  const slug = path.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$|^index\.html$/, "");
  return Object.values(doc.pages).find((p) => p.slug === slug) ?? null;
}
