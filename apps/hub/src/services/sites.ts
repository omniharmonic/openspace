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
  getSite,
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
} from "../github/types";
import { base64ToBytes, bytesToBase64 } from "../lib/crypto";
import { forbidden, HttpError, notFound } from "../lib/errors";
import { type DecodedImage, decodeImageDataUrl } from "../lib/image";
import type { Logger } from "../lib/log";
import type { Services } from "./index";
import { personalizeDocument } from "./personalize";
import { CONFIG_PATH, isDocumentPath, loadSiteDocument, siteDocumentToFiles } from "./site-files";
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
  /** An ownership transfer waiting for the recipient to accept it on GitHub. */
  transfer: { to: string; requestedAt: string; status: "pending" } | null;
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
    transfer: row.transfer_to
      ? {
          to: row.transfer_to,
          requestedAt: new Date(row.transfer_requested_at ?? row.updated_at).toISOString(),
          status: "pending",
        }
      : null,
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
  let site = await siteForUser(services, id, user);
  if (site.transfer_to && (await refreshTransfer(services, site, log)))
    site = await siteForUser(services, id, user);
  site = await refreshStatus(services, site, log);
  return toSiteView(site, await services.templates.list());
}

/**
 * Everything needed to (re)build a site's first content: kept in `sites.setup_json` so a failed
 * setup can be retried from any stage. The logo bytes live in R2 at `logoKey`.
 */
export interface SiteSetup {
  template: string;
  look: string;
  tagline: string | null;
  brandColor: string | null;
  deployUrl: string;
  createdAt: number;
  logo: {
    path: string;
    mediaId: MediaId;
    mime: string;
    bytes: number;
    width: number;
    height: number;
    key: string;
  } | null;
}

const setupKey = (siteId: string) => `site-setup/${siteId}/logo`;

/** The new site's repo files: template shell + personalized document (+ logo). Deterministic. */
async function buildSiteFiles(
  services: Services,
  site: { id: string; name: string },
  setup: SiteSetup,
  actor: string,
  logoBase64?: string,
): Promise<Record<string, string | FileContent>> {
  const template = await services.templates.load(setup.template);
  if (!template) throw new HttpError(404, "template_not_found", "That template doesn't exist.");
  const look = template.meta.looks.find((l) => l.id === setup.look);
  if (!look)
    throw new HttpError(400, "look_not_found", "That look doesn't exist for this template.");
  let doc: SiteDocument;
  try {
    doc = personalizeDocument(loadSiteDocument(template.files), {
      ...(setup.logo
        ? {
            logo: {
              path: setup.logo.path,
              mediaId: setup.logo.mediaId,
              mime: setup.logo.mime,
              bytes: setup.logo.bytes,
              width: setup.logo.width,
              height: setup.logo.height,
            },
          }
        : {}),
      siteId: site.id as SiteId,
      name: site.name,
      tagline: setup.tagline ?? undefined,
      look,
      brandColor: setup.brandColor ?? undefined,
      hubUrl: services.config.hubUrl,
      deployUrl: setup.deployUrl,
      template: template.meta,
      actor,
      now: setup.createdAt,
    });
  } catch (err) {
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
  if (setup.logo) {
    let b64 = logoBase64;
    if (b64 === undefined) {
      const obj = await services.uploads.get(setup.logo.key);
      if (!obj) throw new Error(`Logo for ${site.id} is missing from storage`);
      b64 = bytesToBase64(new Uint8Array(await obj.arrayBuffer()));
    }
    files[setup.logo.path] = { content: b64, encoding: "base64" };
  }
  return files;
}

function parseSetup(row: Pick<SiteRow, "setup_json">): SiteSetup | null {
  try {
    return row.setup_json ? (JSON.parse(row.setup_json) as SiteSetup) : null;
  } catch {
    return null;
  }
}

/**
 * Bring a site's repository to "set up and published", skipping stages already done:
 * create the repo (if missing) → commit the personalized files (if main lacks `openspace.json`)
 * → draft branch → Pages → publish dispatch. Safe to run again after a failure at any stage.
 */
async function runSetup(
  services: Services,
  site: SiteRow,
  user: User,
  opts: { log?: Logger; files?: Record<string, string | FileContent> } = {},
): Promise<{ status: SiteStatus; detail: string | null; url: string | null }> {
  const gh = services.github({ user, site });
  const repo = parseRepo(site.repo);
  const setup = parseSetup(site);
  const files = async () => {
    if (opts.files) return opts.files;
    if (!setup) throw new Error(`Site ${site.id} has no setup record`);
    return buildSiteFiles(services, site, setup, user.id);
  };
  let stage = "repo";
  try {
    let head: string | null;
    if (!(await gh.getRepo(repo))) {
      const created = await gh.createRepoFromTemplate({
        owner: repo.owner,
        name: repo.name,
        description: `${site.name} — made with OpenSpace`,
        files: await files(),
        message: `Create ${site.name}`,
        author: { name: user.name ?? user.login },
      });
      head = created.head;
    } else {
      stage = "content";
      head = await gh.getRef(repo, MAIN_BRANCH);
      if (!head) throw new Error("The site's repository has no main branch");
      if ((await gh.readFile(repo, CONFIG_PATH, head)) === null) {
        const commit = await gh.commitFiles(repo, {
          branch: MAIN_BRANCH,
          expectedHead: head,
          message: `Set up ${site.name}`,
          author: { name: user.name ?? user.login },
          files: Object.entries(await files()).map(([path, v]) =>
            typeof v === "string"
              ? { path, content: v }
              : { path, content: v.content, encoding: v.encoding ?? "utf-8" },
          ),
        });
        head = commit.sha;
      }
    }
    stage = "draft";
    if (!(await gh.getRef(repo, DRAFT_BRANCH))) await gh.createBranch(repo, DRAFT_BRANCH, head);
    stage = "pages";
    const url = (await gh.enablePages(repo)).url || site.url;
    stage = "publish";
    await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    const run = await gh.workflowStatus(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    const status: SiteStatus =
      run.state === "success" ? "live" : run.state === "failure" ? "failed" : "building";
    return {
      status,
      detail:
        status === "failed" ? "The first publish didn't finish. Try again in a moment." : null,
      url,
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    opts.log?.error("site setup failed", { siteId: site.id, repo: site.repo, stage, err });
    return {
      status: "failed",
      detail: "We couldn't finish setting up your site. Try again in a moment.",
      url: site.url,
    };
  }
}

/**
 * Create a site from a template (FR-2, arch §6.2): personalize the template's document, create
 * the repo with the files, open the draft branch, enable Pages and dispatch the first publish.
 * GitHub failures leave a `failed` site record (shown on the dashboard); `POST …/publish`
 * resumes setup from where it stopped.
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
  const name = input.name.trim();
  const gh = services.github({ user, installationId: opts.installationId ?? null });
  const owner = user.login;

  let logo: DecodedImage | undefined;
  let logoMeta: SiteSetup["logo"] = null;
  if (input.logo) {
    try {
      logo = decodeImageDataUrl(input.logo, MAX_LOGO_BYTES);
    } catch (err) {
      throw new HttpError(400, "invalid_logo", (err as Error).message);
    }
    const d = new Date(now);
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const mediaId = newId("med") as MediaId;
    logoMeta = {
      path: `media/${d.getUTCFullYear()}/${month}/logo-${mediaId.slice(4, 10)}.${logo.ext}`,
      mediaId,
      mime: logo.mime,
      bytes: logo.bytes,
      width: logo.width,
      height: logo.height,
      key: setupKey(siteId),
    };
  }

  // Pick a free repo name and claim it with the site row; a concurrent create that wins the
  // same name (unique index on sites.repo) makes us retry with the next suffix.
  let row: SiteRow | null = null;
  let files: Record<string, string | FileContent> | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const repoName = await uniqueRepoName(services, gh, owner, slugifyRepoName(name));
    const setup: SiteSetup = {
      template: template.meta.id,
      look: look.id,
      tagline: input.tagline?.trim() || null,
      brandColor: input.brandColor ?? null,
      deployUrl:
        gh.kind === "dev"
          ? previewUrl(services.config.hubUrl, siteId)
          : githubPagesUrl(owner, repoName),
      createdAt: now,
      logo: logoMeta,
    };
    // Validates personalization and scans for secrets before anything is stored.
    files = await buildSiteFiles(services, { id: siteId, name }, setup, user.id, logo?.base64);
    const candidate = {
      id: siteId,
      owner_id: user.id,
      name,
      tagline: setup.tagline,
      repo: `${owner}/${repoName}`,
      installation_id: opts.installationId ?? null,
      deploy_target: "github-pages",
      domain: null,
      url: setup.deployUrl,
      template_id: template.meta.id,
      template_version: template.meta.version,
      look: look.id,
      status: "building" as const,
      setup_json: JSON.stringify(setup),
      created_at: now,
      updated_at: now,
    };
    try {
      await insertSite(services.db, candidate);
      row = (await getSite(services.db, siteId)) as SiteRow;
    } catch (err) {
      if (!/UNIQUE constraint failed/i.test(String((err as Error).message))) throw err;
    }
  }
  if (!row)
    throw new HttpError(409, "name_taken", "That name was just taken. Try again or pick another.");
  if (logo && logoMeta)
    await services.uploads.put(logoMeta.key, base64ToBytes(logo.base64), {
      httpMetadata: { contentType: logo.mime },
    });

  const result = await runSetup(services, row, user, {
    log: opts.log,
    ...(files ? { files } : {}),
  });
  await updateSite(
    services.db,
    siteId,
    { status: result.status, status_detail: result.detail, url: result.url },
    services.now(),
  );
  await audit(services.db, {
    siteId,
    actor: user.id,
    action: "site.create",
    meta: { template: template.meta.id, look: look.id, repo: row.repo, status: result.status },
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
 * Publish. In this task it (re)runs setup idempotently — finishing a site whose creation failed at
 * any stage — and re-dispatches the publish workflow. Task 15 extends it into the full
 * flush + squash-publish of the draft.
 */
export async function publishSite(
  services: Services,
  id: string,
  user: User,
  log?: Logger,
): Promise<SiteView> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "designer");
  const result = await runSetup(services, site, user, log ? { log } : {});
  await updateSite(
    services.db,
    id,
    { status: result.status, status_detail: result.detail, url: result.url },
    services.now(),
  );
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "site.publish",
    meta: { status: result.status },
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

/**
 * Finish an ownership transfer once the repository lives at `newFullName`: the recipient becomes
 * owner, the previous owner stays as designer. Called directly in dev mode, and by the status poll
 * (or Task 15's `repository` webhook) once GitHub reports the transfer accepted.
 */
export async function completeTransfer(
  services: Services,
  site: Pick<SiteRow, "id" | "owner_id" | "repo">,
  newOwner: User,
  newFullName: string,
): Promise<void> {
  const now = services.now();
  await updateSite(
    services.db,
    site.id,
    { repo: newFullName, owner_id: newOwner.id, transfer_to: null, transfer_requested_at: null },
    now,
  );
  await setRole(services.db, site.id, newOwner.id, "owner", now);
  if (site.owner_id !== newOwner.id)
    await setRole(services.db, site.id, site.owner_id, "designer", now);
  await audit(services.db, {
    siteId: site.id,
    actor: "system",
    action: "site.transfer.complete",
    meta: { from: site.repo, to: newFullName, newOwner: newOwner.id },
  });
}

/** Poll a pending transfer: complete it when the repository appears under the recipient. */
export async function refreshTransfer(
  services: Services,
  site: SiteWithRole,
  log?: Logger,
): Promise<boolean> {
  if (!site.transfer_to) return false;
  try {
    const target = await getUserByLogin(services.db, site.transfer_to);
    if (!target) return false;
    const gh = services.github({ site });
    const moved = await gh.getRepo({ owner: target.login, name: parseRepo(site.repo).name });
    if (!moved || moved.owner.toLowerCase() !== target.login.toLowerCase()) return false;
    await completeTransfer(services, site, target, moved.fullName);
    return true;
  } catch (err) {
    log?.warn("transfer poll failed", { siteId: site.id, err });
    return false;
  }
}

/**
 * Transfer ownership (Site Gardener handoff). With real GitHub the recipient must accept the
 * repository transfer, so the result is `pending` and roles/repo stay as they are until it is
 * confirmed; the dev emulation transfers at once (`complete`).
 */
export async function transferSite(
  services: Services,
  id: string,
  user: User,
  to: string,
): Promise<{ site: SiteView; status: "complete" | "pending" }> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "owner");
  if (site.transfer_to)
    throw new HttpError(409, "transfer_pending", "A transfer of this site is already waiting.");
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
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "site.transfer.request",
    meta: { from: site.repo, to: target.login },
  });
  if (gh.kind === "dev") {
    await completeTransfer(services, site, target, moved.fullName);
    return { site: await getSiteView(services, id, user), status: "complete" };
  }
  await updateSite(
    services.db,
    id,
    { transfer_to: target.login, transfer_requested_at: services.now() },
    services.now(),
  );
  return { site: await getSiteView(services, id, user), status: "pending" };
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
