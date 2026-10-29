import type { Role } from "@omniharmonic/openspace-ops";
import {
  CssColorSchema,
  type MediaId,
  newId,
  type Page,
  type SiteDocument,
  type SiteId,
  scanValueForSecrets,
} from "@omniharmonic/openspace-schema";
import { z } from "zod";
import { audit } from "../db/audit";
import { latestImport } from "../db/imports";
import { insertPublish, latestPublish, publishBySha } from "../db/publishes";
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
import { getUserByLogin, getUserRow, toUser, type User } from "../db/users";
import type { HubBindings } from "../env";
import {
  DRAFT_BRANCH,
  type FileContent,
  type GitHubAccess,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  parseRepo,
  type WorkflowRun,
} from "../github/types";
import { base64ToBytes, bytesToBase64 } from "../lib/crypto";
import { forbidden, HttpError, notFound } from "../lib/errors";
import { type DecodedImage, decodeImageDataUrl } from "../lib/image";
import type { Logger } from "../lib/log";
import { roomStub, unwrapRoom } from "../room";
import type { PublishResult } from "../room/draft-room";
import type { ImportRequest } from "../templates/import-workflow";
import {
  gatedContext as gatedContextFor,
  readOpenedDocumentFiles,
  sealFiles,
} from "./gated-content";
import {
  asAccessNeed,
  checkInstallation,
  connectGitHubUrl,
  GITHUB_ACCESS_DETAIL,
  GITHUB_RECONNECT_DETAIL,
  type GitHubAccessNeed,
  type GitHubAccessState,
} from "./github-install";
import { newImportFiles } from "./import-site";
import type { Services } from "./index";
import { personalizeDocument } from "./personalize";
import { draftReady } from "./publishing";
import { refreshRepoIdentity, syncTurnstileVariable } from "./site-automation";
import { CONFIG_PATH, isDocumentPath, loadSiteDocument, siteDocumentToFiles } from "./site-files";
import { applyStart, type StartSetup, startHtmlFiles } from "./start-with-claude";
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
  /**
   * GitHub App access: "ok", or what the owner has to do on GitHub first — `connectUrl` (a Hub
   * page that sends them to GitHub's install page and back) is set when something is needed.
   */
  github: { access: GitHubAccessState; connectUrl: string | null };
  /** The site was moved in from another address ("Move my site"): its newest import. */
  import: { id: string; state: string; kind: string } | null;
  /**
   * The newest version OpenSpace put on the live branch (a commit sha), or null before the first.
   * Changes with every publish, rollback or revert — a content key for site thumbnails.
   */
  publishedVersion: string | null;
}

export const CreateSiteSchema = z.strictObject({
  template: z.string().min(1).max(64),
  look: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Give your site a name").max(80),
  tagline: z.string().trim().max(200).optional(),
  brandColor: CssColorSchema.optional().nullable(),
  /** Optional logo as a `data:image/…;base64,` URL (PNG, JPEG, WebP or GIF; ≤ 1 MB). */
  logo: z.string().max(1_500_000).optional().nullable(),
  /**
   * GitHub account (the person's own login, or an organization they belong to) that will own
   * the site's repository. Default: the person's own account.
   */
  owner: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "That isn't a GitHub account name")
    .optional(),
});
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;

export const PatchSiteSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
});

/** `POST /api/sites/:id/publish` body (optional). */
export const PublishSiteSchema = z.strictObject({
  /** Replace a live site that changed since the draft was started (see `LiveStatus`). */
  overwriteLive: z.boolean().optional(),
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

export function toSiteView(
  row: SiteWithRole,
  templates: readonly TemplateMeta[] = [],
  hubUrl = "",
): SiteView {
  const tpl = templates.find((t) => t.id === row.template_id);
  const need = asAccessNeed(row.github_access);
  // A site made by a move isn't "live" until the move finishes: until then only a "being set up"
  // page is online, and a move that failed needs attention (Try again retries the move).
  const moving = row.import_id && row.import_state && row.import_kind !== "convert";
  const status: SiteView["status"] =
    moving && row.import_state === "failed"
      ? "failed"
      : moving && row.import_state !== "ready" && row.status !== "failed"
        ? "building"
        : row.status;
  const statusDetail =
    moving && row.import_state === "failed"
      ? "The move didn't finish. Open it to try again — your current site is untouched."
      : row.status_detail;
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    repo: row.repo,
    owner: row.owner_login,
    ownerName: row.owner_name,
    status,
    statusDetail,
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
    github: {
      access: need ?? "ok",
      connectUrl: need ? connectGitHubUrl(hubUrl, row.id) : null,
    },
    import:
      row.import_id && row.import_state
        ? { id: row.import_id, state: row.import_state, kind: row.import_kind ?? "url" }
        : null,
    publishedVersion: row.published_sha ?? null,
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

export async function uniqueRepoName(
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

export function githubPagesUrl(owner: string, name: string): string {
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
  return rows.map((r) => toSiteView(r, templates, services.config.hubUrl));
}

/** Refresh a building site's status from its publish workflow. */
/** How long a status refresh waits for GitHub before answering with the stored status. */
export const STATUS_REFRESH_TIMEOUT_MS = 5000;

function withinMs<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`GitHub took longer than ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function refreshStatus(
  services: Services,
  site: SiteWithRole,
  log?: Logger,
  timeoutMs = STATUS_REFRESH_TIMEOUT_MS,
): Promise<SiteWithRole> {
  if (site.status !== "building") return site;
  try {
    const gh = services.github({ site });
    // Studio polls this while a site is set up: a slow GitHub must not hold the answer up
    // (the stored status is returned and the next poll looks again).
    const run = await withinMs(
      gh.workflowStatus(parseRepo(site.repo), { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH }),
      timeoutMs,
    );
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
  return toSiteView(site, await services.templates.list(), services.config.hubUrl);
}

/**
 * Everything needed to (re)build a site's first content: kept in `sites.setup_json` so a failed
 * setup can be retried from any stage. The logo bytes live in R2 at `logoKey`.
 */
export interface SiteSetup {
  /** A hosted import ("Move my site"): the first files are the shell, a placeholder and the import. */
  import?: { request: ImportRequest; sourceLabel: string };
  /** Start with Claude: the brief, brand material (uploads in R2) and/or a page they made. */
  start?: StartSetup;
  template: string;
  look: string;
  tagline: string | null;
  /** Start with Claude: the hero's supporting line (what they said the site is for). */
  intro?: string | null;
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

/** Delete a site's setup uploads (the logo) from R2 — after setup succeeded, and on purge. */
export async function deleteSetupAssets(
  services: Pick<Services, "uploads">,
  siteId: string,
  log?: Logger,
): Promise<void> {
  try {
    const listed = await services.uploads.list({ prefix: `site-setup/${siteId}/` });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length) await services.uploads.delete(keys);
  } catch (err) {
    log?.warn("setup asset cleanup failed", { siteId, err });
  }
}

/** The new site's repo files: template shell + personalized document (+ logo). Deterministic. */
async function buildSiteFiles(
  services: Services,
  site: { id: string; name: string; repo?: string },
  setup: SiteSetup,
  actor: string,
  logoBase64?: string,
): Promise<Record<string, string | FileContent>> {
  if (setup.import) {
    const repoName = site.repo ? parseRepo(site.repo).name : site.name;
    return newImportFiles({
      siteId: site.id,
      name: site.name,
      repoName,
      hubUrl: services.config.hubUrl,
      deployUrl: setup.deployUrl,
      sourceLabel: setup.import.sourceLabel,
      request: setup.import.request,
    });
  }
  if (setup.start?.html)
    return startHtmlFiles(services, site, setup as SiteSetup & { start: StartSetup });
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
      ...(setup.intro !== undefined ? { intro: setup.intro ?? "" } : {}),
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
  // Start with Claude: the template wears the person's brand, photos and brief.
  let startFiles: Record<string, string | FileContent> = {};
  if (setup.start) {
    const r = await applyStart(services, setup as SiteSetup & { start: StartSetup }, {
      doc,
      templateName: template.meta.name,
    });
    doc = r.doc;
    startFiles = r.files;
  }
  // The public Turnstile key also lives in openspace.json (site-kit's fallback when the
  // repository variable is missing).
  const turnstileSiteKey = services.pub.config.turnstile.siteKey;
  if (turnstileSiteKey)
    doc = {
      ...doc,
      config: { ...doc.config, integrations: { ...doc.config.integrations, turnstileSiteKey } },
    };
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
  // Templates may ship members-only / password pages: their content stays in the Hub.
  Object.assign(
    files,
    await sealFiles(gatedContextFor(services, site.id), siteDocumentToFiles(doc)),
  );
  if (setup.logo) {
    let b64 = logoBase64;
    if (b64 === undefined) {
      const obj = await services.uploads.get(setup.logo.key);
      if (!obj) throw new Error(`Logo for ${site.id} is missing from storage`);
      b64 = bytesToBase64(new Uint8Array(await obj.arrayBuffer()));
    }
    files[setup.logo.path] = { content: b64, encoding: "base64" };
  }
  Object.assign(files, startFiles);
  return files;
}

/** A Start-with-Claude site's first files (built at create time and on resume). */
export function buildStartFiles(
  services: Services,
  site: { id: string; name: string; repo?: string },
  setup: SiteSetup,
  actor: string,
): Promise<Record<string, string | FileContent>> {
  return buildSiteFiles(services, site, setup, actor);
}

function parseSetup(row: Pick<SiteRow, "setup_json">): SiteSetup | null {
  try {
    return row.setup_json ? (JSON.parse(row.setup_json) as SiteSetup) : null;
  } catch {
    return null;
  }
}

/**
 * The state of the publish this setup started, from the newest run on main. A run for another
 * commit, or one that had already finished before our dispatch, belongs to an earlier publish:
 * ours is still queued (webhooks and the status poll take it from there).
 */
export function currentRunState(
  run: WorkflowRun,
  head: string,
  dispatchedAt: number | null,
): WorkflowRun["state"] {
  if (run.state === "none") return "none";
  if (run.sha && run.sha !== head) return "queued";
  const finished = run.state === "success" || run.state === "failure";
  const updated = run.updatedAt ? Date.parse(run.updatedAt) : Number.NaN;
  // GitHub timestamps have second resolution: allow a little slack.
  if (finished && dispatchedAt !== null && updated < dispatchedAt - 2000) return "queued";
  return run.state;
}

/**
 * Bring a site's repository to "set up and published", skipping stages already done:
 * create the repo (if missing) → commit the personalized files (if main lacks `openspace.json`)
 * → draft branch → Pages → publish dispatch. Safe to run again after a failure at any stage.
 */
export async function runSetup(
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
  // A commit to main in this run starts the publish workflow on its own (`on: push`).
  let pushed = false;
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
      pushed = true;
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
        pushed = true;
      }
    }
    // The content is on main: the setup logo in R2 is no longer needed.
    await deleteSetupAssets(services, site.id, opts.log);
    stage = "variables";
    // The repository's ids bind the publish workflow's identity token to this site.
    try {
      await refreshRepoIdentity(services, site, gh);
    } catch (err) {
      opts.log?.warn("repository ids not recorded", { siteId: site.id, err });
    }
    // Forms, sign-up and sign-in on the built site load Turnstile with the Hub's public key.
    try {
      await syncTurnstileVariable(services, site, gh);
    } catch (err) {
      // The minute cron backfills it; a missing variable must not block the first publish.
      opts.log?.warn("turnstile variable not set", { siteId: site.id, err });
    }
    stage = "draft";
    if (!(await gh.getRef(repo, DRAFT_BRANCH))) await gh.createBranch(repo, DRAFT_BRANCH, head);
    stage = "pages";
    const url = (await gh.enablePages(repo)).url || site.url;
    stage = "publish";
    const dispatchedAt = services.now();
    let dispatched = true;
    try {
      await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    } catch (err) {
      // GitHub often refuses to dispatch a workflow file it indexed seconds ago. The commit we
      // just pushed already started the same workflow, so the site is building, not failed.
      if (!pushed) throw err;
      dispatched = false;
      opts.log?.warn("publish dispatch failed; the push run publishes", { siteId: site.id, err });
    }
    let run: WorkflowRun = { state: "none" };
    try {
      run = await gh.workflowStatus(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    } catch (err) {
      opts.log?.warn("publish run lookup failed", { siteId: site.id, err });
    }
    const state = currentRunState(run, head, dispatched ? dispatchedAt : null);
    const status: SiteStatus =
      state === "success" ? "live" : state === "failure" ? "failed" : "building";
    // The first version is a publish too: "Fix it for me" and history can go back to it.
    if (!(await publishBySha(services.db, site.id, head)))
      await insertPublish(
        services.db,
        {
          site_id: site.id,
          kind: "setup",
          sha: head,
          prev_sha: null,
          summary: `Create ${site.name}`,
          actor: user.id,
          status: state === "none" ? "queued" : state,
        },
        services.now(),
      );
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
  opts: {
    log?: Logger;
    installationId?: number | null;
    /** Statements committed together with the site row (an AI app's grant to the new site). */
    alsoInsert?: (siteId: string) => D1PreparedStatement[];
  } = {},
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
  const owner = input.owner ?? user.login;
  // The install step: GitHub only lets OpenSpace create the repository once its App is
  // installed on the owning account (with access to all repositories). Without it the site is
  // recorded as waiting for GitHub, and setup resumes when the App's Setup URL is called.
  let installationId = opts.installationId ?? null;
  let need: GitHubAccessNeed | null = null;
  if (!installationId) {
    const check = await checkInstallation(services, user, owner, opts.log);
    if (check.ok) installationId = check.installation.id;
    else need = check.need;
  }
  const gh = services.github({ user, installationId });

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
      installation_id: installationId,
      deploy_target: "github-pages",
      domain: null,
      url: setup.deployUrl,
      template_id: template.meta.id,
      template_version: template.meta.version,
      look: look.id,
      status: need ? ("failed" as const) : ("building" as const),
      status_detail: need ? GITHUB_ACCESS_DETAIL[need] : null,
      github_access: need,
      setup_json: JSON.stringify(setup),
      created_at: now,
      updated_at: now,
    };
    try {
      await insertSite(services.db, candidate, opts.alsoInsert?.(siteId) ?? []);
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

  if (need) {
    await audit(services.db, {
      siteId,
      actor: user.id,
      action: "site.create",
      meta: { template: template.meta.id, look: look.id, repo: row.repo, githubAccess: need },
    });
    return getSiteView(services, siteId, user, opts.log);
  }
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
 * Publish (`POST /api/sites/:id/publish`). A site whose setup never finished (no repo, no
 * content, no draft — or a failed first publish) resumes setup idempotently; otherwise the
 * site's DraftRoom flushes and squash-publishes the draft (arch §5.4).
 */
export async function publishSite(
  services: Services,
  env: HubBindings,
  id: string,
  user: User,
  log?: Logger,
  options: { overwriteLive?: boolean } = {},
): Promise<SiteView & { publish: PublishResult | null }> {
  let site: SiteRow = await siteForUser(services, id, user);
  requireRole(site as SiteWithRole, "editor");
  // A repository being converted in place publishes once its owner merges the change.
  const moving = await latestImport(services.db, id);
  if (moving?.kind === "convert" && moving.state !== "ready" && moving.state !== "failed")
    throw new HttpError(
      409,
      "convert_pending",
      "This site switches over once you approve the change on GitHub. Open the move's progress to continue.",
    );
  const owner = (await ownerOf(services, site)) ?? user;
  const published = await latestPublish(services.db, id);
  const setupUnfinished = site.status === "failed" && (!published || published.kind === "setup");
  // Waiting for GitHub (or never told which installation to use): ask GitHub again first —
  // never retry with a stale "no installation".
  if (site.github_access || (setupUnfinished && site.installation_id === null)) {
    const access = await refreshGitHubAccess(services, site, owner, log);
    if (!access.ok) {
      if (!setupUnfinished && site.status !== "failed")
        throw new HttpError(409, "github_access_needed", GITHUB_RECONNECT_DETAIL);
      await updateSite(
        services.db,
        id,
        {
          status: site.status === "live" ? "live" : "failed",
          status_detail: githubAccessDetail(site, access.need),
        },
        services.now(),
      );
      return { ...(await getSiteView(services, id, user, log)), publish: null };
    }
    site = access.site;
  }
  if (setupUnfinished || !(await draftReady(services, site, owner))) {
    await finishSetup(services, site, owner, user, log);
    return { ...(await getSiteView(services, id, user, log)), publish: null };
  }
  const result = await unwrapRoom(
    roomStub(env, id).publish(id, {
      userId: user.id,
      ...(options.overwriteLive ? { overwriteLive: true } : {}),
    }),
  );
  return { ...(await getSiteView(services, id, user, log)), publish: result };
}

/** Plain words for a site waiting on GitHub (a site that was already working "reconnects"). */
function githubAccessDetail(site: Pick<SiteRow, "status">, need: GitHubAccessNeed): string {
  return site.status === "live" && need !== "requested"
    ? GITHUB_RECONNECT_DETAIL
    : GITHUB_ACCESS_DETAIL[need];
}

/**
 * Re-read a site's GitHub App access from its owner's installations (never trusting a stored
 * "none") and record the answer: the installation id when it's fine, or what's needed.
 */
export async function refreshGitHubAccess(
  services: Services,
  site: SiteRow,
  owner: User,
  log?: Logger,
): Promise<{ ok: true; site: SiteRow } | { ok: false; site: SiteRow; need: GitHubAccessNeed }> {
  const check = await checkInstallation(services, owner, parseRepo(site.repo).owner, log);
  if (check.ok) {
    const fixed = {
      ...site,
      installation_id: check.installation.id,
      github_access: null,
      status_detail: asAccessNeed(site.github_access) ? null : site.status_detail,
    };
    if (site.installation_id !== fixed.installation_id || site.github_access !== null)
      await updateSite(
        services.db,
        site.id,
        {
          installation_id: fixed.installation_id,
          github_access: null,
          status_detail: fixed.status_detail,
        },
        services.now(),
      );
    return { ok: true, site: fixed };
  }
  // An organization install waiting for approval doesn't show up yet: still "requested".
  const need: GitHubAccessNeed =
    site.github_access === "requested" && check.need === "install" ? "requested" : check.need;
  if (site.github_access !== need)
    await updateSite(services.db, site.id, { github_access: need }, services.now());
  return { ok: false, site: { ...site, github_access: need }, need };
}

/** Mark a site as waiting for an organization's owners to approve the App. */
export async function markGitHubRequested(services: Services, site: SiteRow): Promise<void> {
  await updateSite(
    services.db,
    site.id,
    {
      github_access: "requested",
      status_detail: GITHUB_ACCESS_DETAIL.requested,
      ...(site.status === "live" ? {} : { status: "failed" as const }),
    },
    services.now(),
  );
}

/** Run (or resume) a site's setup and record the outcome. */
async function finishSetup(
  services: Services,
  site: SiteRow,
  owner: User,
  actor: User,
  log?: Logger,
): Promise<void> {
  const result = await runSetup(services, site, owner, log ? { log } : {});
  await updateSite(
    services.db,
    site.id,
    { status: result.status, status_detail: result.detail, url: result.url },
    services.now(),
  );
  await audit(services.db, {
    siteId: site.id,
    actor: actor.id,
    action: "site.setup.retry",
    meta: { status: result.status },
  });
}

/**
 * After the App was installed (or its access changed) on GitHub: re-read access and, when it's
 * fine and the site was never set up, finish setting it up. Returns whether access is fine now.
 */
export async function resumeAfterInstall(
  services: Services,
  site: SiteRow,
  actor: User,
  log?: Logger,
): Promise<boolean> {
  const owner = (await ownerOf(services, site)) ?? actor;
  const access = await refreshGitHubAccess(services, site, owner, log);
  if (!access.ok) {
    await updateSite(
      services.db,
      site.id,
      { status_detail: githubAccessDetail(site, access.need) },
      services.now(),
    );
    return false;
  }
  const published = await latestPublish(services.db, site.id);
  const setupUnfinished =
    site.status !== "live" &&
    (!published || published.kind === "setup") &&
    site.status !== "building";
  if (setupUnfinished) await finishSetup(services, access.site, owner, actor, log);
  return true;
}

/** The site owner's account (server-side GitHub work falls back to their token). */
export async function ownerOf(
  services: Services,
  site: Pick<SiteRow, "owner_id">,
): Promise<User | null> {
  const row = await getUserRow(services.db, site.owner_id);
  return row ? toUser(row) : null;
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
    const gh = services.github({ user, site });
    const repo = parseRepo(site.repo);
    // A site whose setup never created its repository has nothing to archive.
    if (await gh.getRepo(repo)) await gh.archiveRepo(repo);
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

/** Pending ownership transfers lapse after this long (GitHub's own invitations expire too). */
export const TRANSFER_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Drop a pending transfer (cancelled by the owner, or expired). Roles and repo are unchanged. */
export async function clearTransfer(
  services: Services,
  site: Pick<SiteRow, "id" | "transfer_to">,
  actor: string,
  reason: "cancelled" | "expired",
): Promise<void> {
  await updateSite(
    services.db,
    site.id,
    { transfer_to: null, transfer_requested_at: null },
    services.now(),
  );
  await audit(services.db, {
    siteId: site.id,
    actor,
    action: `site.transfer.${reason}`,
    meta: { to: site.transfer_to },
  });
}

/** `DELETE /api/sites/:id/transfer` — the owner withdraws a pending transfer. */
export async function cancelTransfer(
  services: Services,
  id: string,
  user: User,
): Promise<SiteView> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "owner");
  if (!site.transfer_to)
    throw new HttpError(409, "no_transfer", "There's no transfer waiting for this site.");
  await clearTransfer(services, site, user.id, "cancelled");
  return getSiteView(services, id, user);
}

/** Expire every pending transfer older than `TRANSFER_TTL_MS` (cron). */
/** A site still "building" this long after it was created, with nothing ever published, stalled. */
export const STALLED_SETUP_MS = 10 * 60_000;
export const STALLED_SETUP_DETAIL =
  "Setting up this site didn't finish. Try again, or delete it if you don't need it.";

/**
 * Sites whose creation died part-way (e.g. the Hub was cut off before the repository or the
 * first publish existed) would say "Setting up" forever: after `STALLED_SETUP_MS` with no
 * publish recorded they become `failed`, so Studio offers "Try again" (which resumes setup
 * from the stored details) and deleting them works.
 */
export async function failStalledSetups(services: Services, now: number): Promise<number> {
  const res = await services.db
    .prepare(
      `UPDATE sites SET status = 'failed', status_detail = ?, updated_at = ?
       WHERE status = 'building' AND archived_at IS NULL AND created_at < ?
         AND NOT EXISTS (SELECT 1 FROM publishes p WHERE p.site_id = sites.id)
         AND NOT EXISTS (SELECT 1 FROM site_imports i WHERE i.site_id = sites.id
           AND i.state NOT IN ('ready', 'failed'))`,
    )
    .bind(STALLED_SETUP_DETAIL, now, now - STALLED_SETUP_MS)
    .run();
  return res.meta.changes ?? 0;
}

export async function expireTransfers(services: Services, now: number): Promise<number> {
  const rows = await services.db
    .prepare(
      "SELECT id, transfer_to FROM sites WHERE transfer_to IS NOT NULL AND transfer_requested_at < ?",
    )
    .bind(now - TRANSFER_TTL_MS)
    .all<Pick<SiteRow, "id" | "transfer_to">>();
  for (const r of rows.results) await clearTransfer(services, r, "system", "expired");
  return rows.results.length;
}

/**
 * Poll a pending transfer: complete it when the repository appears under the recipient, expire
 * it after `TRANSFER_TTL_MS`. (The `repository.transferred` webhook completes it sooner.)
 */
export async function refreshTransfer(
  services: Services,
  site: SiteWithRole,
  log?: Logger,
): Promise<boolean> {
  if (!site.transfer_to) return false;
  if ((site.transfer_requested_at ?? 0) + TRANSFER_TTL_MS < services.now()) {
    await clearTransfer(services, site, "system", "expired");
    return true;
  }
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
  const files = await readOpenedDocumentFiles(gatedContextFor(services, site.id), gh, repo, head);
  return { doc: loadSiteDocument(files), head, branch };
}

/** Find the page for a URL path below the site root ("" = home). */
export function findPageBySlug(doc: SiteDocument, path: string): Page | null {
  const slug = path.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$|^index\.html$/, "");
  return Object.values(doc.pages).find((p) => p.slug === slug) ?? null;
}
