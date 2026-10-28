/**
 * Hosted imports — "Move my site" with nothing to install (FR: zero local installs):
 *
 * - `createImportSite`: a new site exactly like a template site (same install step, repository,
 *   draft branch, Pages), whose first commit is the starter shell, a placeholder page and the
 *   import workflow with its request. The push starts the workflow, which runs the published
 *   CLI (`openspace import … --into-existing`), checks, commits and starts the publish.
 * - `convertRepo`: an existing GitHub Pages repository made editable in place — a branch with
 *   the OpenSpace shell, the same workflow converting the old site's own files, then a pull
 *   request the owner merges (history kept; one Revert undoes it).
 * - `refreshImport`: the state machine, driven by Studio's polling, the `workflow_run` webhook,
 *   progress reports from the run itself (`/ci/sites/:id/import`) and the minute cron.
 */

import { newId, type SiteId } from "@omniharmonic/openspace-schema";
import { z } from "zod";
import { audit } from "../db/audit";
import {
  getImport,
  type ImportPhase,
  type ImportRow,
  type ImportState,
  insertImport,
  latestImport,
  openImports,
  updateImport,
} from "../db/imports";
import { insertPublish, latestPublish, publishBySha } from "../db/publishes";
import { getSite, insertSite, repoTaken, type SiteRow, updateSite } from "../db/sites";
import type { User } from "../db/users";
import type { HubBindings } from "../env";
import {
  DRAFT_BRANCH,
  type GitHubAccess,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  parseRepo,
  type RepoRef,
} from "../github/types";
import { HttpError } from "../lib/errors";
import type { Logger } from "../lib/log";
import { roomStub, unwrapRoom } from "../room";
import {
  CONVERT_BRANCH,
  IMPORT_FIDELITY_DIR,
  IMPORT_REQUEST_PATH,
  IMPORT_WORKFLOW,
  type ImportRequest,
  importFiles,
} from "../templates/import-workflow";
import {
  checkInstallation,
  connectGitHubUrl,
  GITHUB_ACCESS_DETAIL,
  type GitHubAccessNeed,
} from "./github-install";
import {
  guessSiteName,
  type ImportSource,
  ImportSourceError,
  parseImportSource,
  placeholderDocument,
  shellFiles,
} from "./import-site";
import { plainWords } from "./import-words";
import type { Services } from "./index";
import {
  getSiteView,
  githubPagesUrl,
  ownerOf,
  previewUrl,
  runSetup,
  type SiteSetup,
  type SiteView,
  siteForUser,
  slugifyRepoName,
  uniqueRepoName,
} from "./sites";

// --- inputs ------------------------------------------------------------------------------------

export const IMPORT_PLATFORMS = [
  "auto",
  "squarespace",
  "wordpress",
  "wix",
  "webflow",
  "framer",
  "carrd",
  "github",
  "url",
] as const;

const GitHubAccount = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "That isn't a GitHub account name");

export const ImportInputSchema = z.strictObject({
  /** The site's address, a github.io address or a GitHub repository. */
  url: z.string().trim().min(3, "Paste your site's address").max(500),
  name: z.string().trim().min(1).max(80).optional(),
  platform: z.enum(IMPORT_PLATFORMS).optional(),
  /** Read pages in a browser (sites built with JavaScript, e.g. some Wix sites). */
  render: z.boolean().optional(),
  /**
   * "This is my site (or I'm moving it for its owner)". Required: only sites the person owns
   * are moved, and it lets the importer read owner-only data (Squarespace `?format=json`).
   */
  confirmOwnership: z.literal(true, {
    error: "Confirm that this is your site (or that you're moving it for its owner).",
  }),
  /** GitHub account (an organization) to own the new site; default the person's own. */
  owner: GitHubAccount.optional(),
});
export type ImportInput = z.infer<typeof ImportInputSchema>;

export const ConvertInputSchema = z.strictObject({
  /** `owner/name` or the repository's / site's address. */
  repo: z.string().trim().min(3).max(300),
  confirmOwnership: z.literal(true, {
    error: "Confirm that this is your site's repository.",
  }),
});

// --- views -------------------------------------------------------------------------------------

export interface ImportStep {
  id: "read" | "pages" | "check" | "approve" | "publish";
  label: string;
  detail?: string;
  state: "todo" | "active" | "done" | "failed";
}

export interface ImportCounts {
  pages: number;
  items: number;
  media: number;
  redirects: number;
  /** The run's fidelity comparison (`.openspace/fidelity/fidelity-summary.json`), when it ran. */
  fidelity?: ImportFidelity;
}

/**
 * How far the importer is while it runs, from the lines it prints (the workflow reports it at
 * most every 10 s): pages read, pages made, pages compared with the old site (per tuning round).
 */
export interface ImportLive {
  stage: "reading" | "mapping" | "comparing";
  done: number;
  total?: number;
  round?: number;
  /** When it was reported (ms). */
  at: number;
}

/** The finished run's counts (null while it runs: the row then only holds its live progress). */
function countsOf(row: Pick<ImportRow, "counts_json">): ImportCounts | null {
  const c = parseJson<ImportCounts & { live?: unknown }>(row.counts_json);
  return c && typeof c.pages === "number" ? c : null;
}

function liveOf(row: Pick<ImportRow, "counts_json">): ImportLive | null {
  const c = parseJson<{ live?: ImportLive }>(row.counts_json);
  return c?.live && typeof c.live.done === "number" ? c.live : null;
}

/** Validate a live report from the workflow. */
export function parseLive(raw: unknown, now: number): ImportLive | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0
      ? Math.min(10_000, Math.round(v))
      : undefined;
  const stage = r.stage;
  const done = n(r.done);
  if ((stage !== "reading" && stage !== "mapping" && stage !== "comparing") || done === undefined)
    return undefined;
  const total = n(r.total);
  const round = n(r.round);
  return {
    stage,
    done,
    ...(total !== undefined && total >= done ? { total } : {}),
    ...(round ? { round } : {}),
    at: now,
  };
}

/** Plain words for the live progress of "Bringing pages across". */
export function liveWords(live: ImportLive): string {
  const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  switch (live.stage) {
    case "reading":
      return `${pl(live.done, "page")} read so far`;
    case "mapping":
      return live.total
        ? `Making page ${Math.max(1, live.done)} of ${live.total}`
        : `${pl(live.done, "page")} made so far`;
    case "comparing":
      return `${(live.round ?? 1) > 1 ? "Fine-tuning" : "Comparing with your old site"}: page ${Math.max(1, live.done)}${live.total ? ` of ${live.total}` : ""}${(live.round ?? 1) > 1 ? ` (pass ${live.round})` : ""}`;
  }
}

/** How closely the moved site matches the original, page by page (saved by the workflow). */
export interface ImportFidelity {
  /** 0–100 after auto-tuning, and before it. */
  score: number;
  before?: number;
  pages: Array<{
    path: string;
    device: "desktop" | "phone";
    score: number;
    before?: number;
    /** Thumbnail file in the fidelity folder (original left, new site right). */
    image?: string;
    /** The biggest differences still there. */
    differs?: string[];
  }>;
  /** What auto-tuning changed. */
  changes?: string[];
  /** The score before sections were recreated as custom components, and with them. */
  withoutComponents?: number;
  withComponents?: number;
}

/** The fidelity comparison as Studio shows it (thumbnails served by the Hub). */
export interface ImportFidelityView extends Omit<ImportFidelity, "pages"> {
  pages: Array<Omit<ImportFidelity["pages"][number], "image"> & { image: string | null }>;
}

const THUMB_FILE = /^thumb-[a-z0-9-]{1,80}\.jpg$/;
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(100, Math.round(v)))
    : undefined;

/** `fidelity-summary.json` as written by the CLI → a bounded, checked `ImportFidelity`. */
export function parseFidelitySummary(text: string | null): ImportFidelity | undefined {
  if (!text) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const score = num(r.score);
  if (score === undefined || !Array.isArray(r.pages)) return undefined;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const pages: ImportFidelity["pages"] = [];
  for (const p of r.pages.slice(0, 24)) {
    if (!p || typeof p !== "object") continue;
    const q = p as Record<string, unknown>;
    const path = str(q.path, 200);
    const pageScore = num(q.score);
    if (!path?.startsWith("/") || pageScore === undefined) continue;
    const before = num(q.before);
    const image = str(q.image, 100);
    const differs = Array.isArray(q.differs)
      ? differsWords(q.differs.map((d) => str(d, 80)).filter((d): d is string => !!d))
      : [];
    pages.push({
      path,
      device: q.device === "phone" ? "phone" : "desktop",
      score: pageScore,
      ...(before !== undefined ? { before } : {}),
      ...(image && THUMB_FILE.test(image) ? { image } : {}),
      ...(differs.length ? { differs } : {}),
    });
  }
  const before = num(r.before);
  const changes = Array.isArray(r.changes)
    ? r.changes
        .map((c) => str(c, 160))
        .filter((c): c is string => !!c)
        .slice(0, 20)
    : [];
  const without = num(r.withoutComponents);
  const withC = num(r.withComponents);
  return {
    score,
    ...(before !== undefined ? { before } : {}),
    pages,
    ...(changes.length ? { changes } : {}),
    ...(without !== undefined ? { withoutComponents: without } : {}),
    ...(withC !== undefined ? { withComponents: withC } : {}),
  };
}

/** Is this a thumbnail the import's fidelity summary names? */
export function isFidelityThumb(counts: ImportCounts | null, file: string): boolean {
  return THUMB_FILE.test(file) && !!counts?.fidelity?.pages.some((p) => p.image === file);
}

export interface AttentionGroup {
  title: string;
  items: string[];
}

export interface ImportView {
  id: string;
  siteId: string;
  kind: "url" | "convert";
  source: string;
  state: ImportState;
  phase: ImportPhase | null;
  /** Plain-language status line ("Bringing pages across…"). */
  headline: string;
  steps: ImportStep[];
  counts: ImportCounts | null;
  /** IMPORT-REPORT.md's "Needs attention", grouped (Studio's "What needs your attention"). */
  attention: AttentionGroup[];
  /** "Finish setting up" items (content/setup-checklist.json). */
  checklist: Array<{ id: string; kind: string; title: string; detail: string }>;
  /** How closely the new site matches the old one (before → after auto-tuning), when measured. */
  fidelity: ImportFidelityView | null;
  report: string | null;
  error: string | null;
  pullRequest: { number: number; url: string } | null;
  /** Where the site is live (once ready). */
  siteUrl: string | null;
  studioUrl: string;
  /** GitHub needs a click first (the install step): where to send the person. */
  connectUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const parseJson = <T>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** IMPORT-REPORT.md → "What needs your attention" (groups of plain sentences). */
export function attentionFromReport(report: string | null): AttentionGroup[] {
  if (!report) return [];
  const start = report.indexOf("\n## Needs attention");
  if (start < 0) return [];
  const rest = report.slice(start + 1);
  const end = rest.slice(3).search(/\n## /);
  const section = end >= 0 ? rest.slice(0, end + 3) : rest;
  const groups: AttentionGroup[] = [];
  let current: AttentionGroup | null = null;
  const clean = (s: string) =>
    s
      .replace(/\s*_\(([^)]*)\)_\s*$/, (_m, where: string) =>
        where === "site" ? "" : ` (${where})`,
      )
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();
  const friendly = (s: string) => {
    // Keep where it happened ("(/shop)") after the translated sentence.
    const m = /^(.*?)( \([^()]*\))?$/.exec(s);
    const where = m?.[2] && !/\(s\)$/.test(m[2]) ? m[2] : "";
    return `${plainWords(where ? (m?.[1] ?? s) : s)}${where}`;
  };
  for (const line of section.split("\n")) {
    const h = /^### (.+)$/.exec(line);
    if (h) {
      current = { title: (h[1] as string).trim(), items: [] };
      groups.push(current);
      continue;
    }
    const b = /^- (.+)$/.exec(line);
    if (b && current && current.items.length < 20)
      current.items.push(friendly(clean(b[1] as string)));
  }
  return groups.filter((g) => g.items.length);
}

function stepsFor(row: ImportRow, counts: ImportCounts | null): ImportStep[] {
  const live = liveOf(row);
  const convert = row.kind === "convert";
  const order: ImportStep["id"][] = convert
    ? ["read", "pages", "check", "approve", "publish"]
    : ["read", "pages", "check", "publish"];
  const labels: Record<ImportStep["id"], string> = {
    read: convert ? "Reading your site's files" : "Reading your site",
    pages: "Bringing pages across",
    check: "Checking everything",
    approve: "Waiting for you to approve the change on GitHub",
    publish: "Publishing your new site",
  };
  let active: ImportStep["id"] | "all" | "none";
  switch (row.state) {
    case "waiting":
      active = "none";
      break;
    case "queued":
      active = "read";
      break;
    case "running":
      active =
        row.phase === "importing"
          ? "pages"
          : row.phase === "imported" || row.phase === "checking"
            ? "check"
            : row.phase === "saving" || row.phase === "saved" || row.phase === "publishing"
              ? convert
                ? "check"
                : "publish"
              : "read";
      break;
    case "review":
      active = "approve";
      break;
    case "publishing":
      active = "publish";
      break;
    case "ready":
      active = "all";
      break;
    default:
      active = failedStep(row);
  }
  const at = active === "all" ? order.length : active === "none" ? -1 : order.indexOf(active);
  return order.map((id, i) => ({
    id,
    label: labels[id],
    ...(id === "pages" && !counts && live && i === at && row.state === "running"
      ? { detail: liveWords(live) }
      : {}),
    ...(id === "pages" && counts
      ? {
          // "items": blog posts, products, events… (a shop's products aren't posts).
          detail: `${counts.pages} page${counts.pages === 1 ? "" : "s"}${counts.items ? `, ${counts.items} item${counts.items === 1 ? "" : "s"}` : ""}, ${counts.media} image${counts.media === 1 ? "" : "s"}`,
        }
      : {}),
    state:
      row.state === "failed" && i === at
        ? "failed"
        : i < at
          ? "done"
          : i === at && row.state !== "failed"
            ? "active"
            : "todo",
  }));
}

function failedStep(row: ImportRow): ImportStep["id"] {
  switch (row.phase) {
    case "importing":
      return "pages";
    case "imported":
    case "checking":
      return "check";
    case "saving":
    case "saved":
    case "publishing":
      return "publish";
    default:
      return row.head_sha && row.state === "failed" && row.report ? "publish" : "read";
  }
}

function headlineFor(row: ImportRow, counts: ImportCounts | null, siteName: string): string {
  switch (row.state) {
    case "waiting":
      return "One more step: connect GitHub so OpenSpace can save your site.";
    case "queued":
      return "Getting ready…";
    case "running":
      return row.phase === "importing"
        ? "Bringing pages across…"
        : row.phase === "imported" || row.phase === "checking"
          ? counts
            ? `${counts.pages} pages and ${counts.media} images came across. Checking everything…`
            : "Checking everything…"
          : // One wording per step, in order (wave 4: "Saving" came twice, in a different order).
            row.phase === "saving" || row.phase === "saved"
            ? "Saving your pages and pictures in your own GitHub account…"
            : row.phase === "publishing"
              ? "Publishing your new site…"
              : "Reading your site…";
    case "review":
      return "Your site is ready to switch over. Approve the change on GitHub to finish.";
    case "publishing":
      return "Publishing your new site…";
    case "ready":
      return `${siteName} is live. Ready to review.`;
    default:
      return row.error ?? "The move didn't finish.";
  }
}

/** The comparison's check names → what an owner understands (wave 4: "Present, Present"). */
const DIFFERS_WORDS: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/^present$/i, "a section that didn’t come across"],
  [/^(.+?): present$/i, (m) => `${lower(m[1] as string)} style`],
  [/^height$/i, "section heights"],
  [/^columns$/i, "columns"],
  [/^italic lines$/i, "italic text"],
  [/^text$/i, "wording"],
  [/^(.+?) letter spacing and case$/i, (m) => `${lower(m[1] as string)} lettering`],
  [/^buttons size$/i, "button size"],
  [/^buttons\b/i, (m) => `button${(m.input ?? "").slice(7).toLowerCase()}`],
];

const lower = (s: string) =>
  s.replace(/^Buttons\b/, "button").replace(/^\w/, (c) => c.toLowerCase());

/**
 * "Still differs" for one page: plain words, each said once, at most three, sentence-cased
 * ("Height, Height, Height" → "Section heights").
 */
export function differsWords(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const d of raw) {
    let w = d.trim();
    for (const [re, to] of DIFFERS_WORDS) {
      const m = w.match(re);
      if (m) {
        w = typeof to === "string" ? to : to(m);
        break;
      }
    }
    w = w.toLowerCase().replace(/\bh(\d)\b/g, "heading $1");
    if (w && !out.includes(w)) out.push(w);
  }
  return out.slice(0, 3).map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w));
}

export function toImportView(
  services: Services,
  row: ImportRow,
  site: Pick<SiteRow, "id" | "name" | "url" | "github_access">,
): ImportView {
  const counts = countsOf(row);
  const checklist =
    parseJson<{ items?: ImportView["checklist"] }>(row.checklist_json)?.items?.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: plainWords(i.title),
      detail: plainWords(i.detail),
    })) ?? [];
  return {
    id: row.id,
    siteId: row.site_id,
    kind: row.kind,
    source: row.source,
    state: row.state,
    phase: row.phase,
    headline: headlineFor(row, counts, site.name),
    steps: stepsFor(row, counts),
    counts,
    attention: attentionFromReport(row.report),
    checklist,
    fidelity: counts?.fidelity
      ? {
          ...counts.fidelity,
          pages: counts.fidelity.pages.map((p) => ({
            ...p,
            image: p.image
              ? `${services.config.hubUrl}/api/imports/${row.id}/fidelity/${p.image}`
              : null,
          })),
        }
      : null,
    report: row.report,
    error: row.state === "failed" ? row.error : null,
    pullRequest: row.pr_number && row.pr_url ? { number: row.pr_number, url: row.pr_url } : null,
    siteUrl: row.state === "ready" ? site.url : null,
    studioUrl: `${services.config.studioOrigin}/sites/${site.id}`,
    connectUrl: site.github_access ? connectGitHubUrl(services.config.hubUrl, site.id) : null,
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  };
}

// --- creating ----------------------------------------------------------------------------------

function sourceOf(input: { url: string; platform?: string }): ImportSource {
  try {
    return parseImportSource(input.url);
  } catch (err) {
    if (err instanceof ImportSourceError) throw new HttpError(400, "invalid_url", err.message);
    throw err;
  }
}

/** Dev mode has no push triggers: run the emulated workflow right away. */
async function startDevRun(gh: GitHubAccess, repo: RepoRef, branch: string): Promise<void> {
  if (gh.kind !== "dev") return;
  await gh.dispatchWorkflow(repo, { workflow: IMPORT_WORKFLOW, ref: branch });
}

/**
 * "Move my site": create a new site whose content comes from `input.url` (FR: hosted import).
 * Same install step and setup as a template site; the import runs in the repository's Actions.
 */
export async function createImportSite(
  services: Services,
  env: HubBindings,
  user: User,
  input: ImportInput,
  opts: {
    log?: Logger;
    /** Statements committed together with the site row (an AI app's grant to the new site). */
    alsoInsert?: (siteId: string) => D1PreparedStatement[];
  } = {},
): Promise<{ site: SiteView; import: ImportView }> {
  const src = sourceOf(input);
  const platform =
    input.platform && input.platform !== "auto"
      ? input.platform
      : src.kind === "github" || src.github
        ? "github"
        : "auto";
  const now = services.now();
  const siteId = newId("st") as SiteId;
  const importId = `imp_${newId("st").slice(3)}`;
  const name = (input.name?.trim() || guessSiteName(src)).slice(0, 80);
  const owner = input.owner ?? user.login;
  let installationId: number | null = null;
  let need: GitHubAccessNeed | null = null;
  const check = await checkInstallation(services, user, owner, opts.log);
  if (check.ok) installationId = check.installation.id;
  else need = check.need;
  const gh = services.github({ user, installationId });

  const request: ImportRequest = {
    version: 1,
    id: importId,
    siteId,
    hub: services.config.hubUrl,
    mode: "url",
    source: src.kind === "github" ? src.source : (src.github?.pagesUrl ?? src.source),
    platform,
    owner: input.confirmOwnership === true,
    render: input.render === true,
    attempt: 1,
  };
  let row: SiteRow | null = null;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const repoName = await uniqueRepoName(services, gh, owner, slugifyRepoName(name));
    const deployUrl =
      gh.kind === "dev"
        ? previewUrl(services.config.hubUrl, siteId)
        : githubPagesUrl(owner, repoName);
    const setup: SiteSetup = {
      import: { request, sourceLabel: src.label },
      template: "import",
      look: "",
      tagline: null,
      brandColor: null,
      deployUrl,
      createdAt: now,
      logo: null,
    };
    try {
      await insertSite(
        services.db,
        {
          id: siteId,
          owner_id: user.id,
          name,
          tagline: null,
          repo: `${owner}/${repoName}`,
          installation_id: installationId,
          deploy_target: "github-pages",
          domain: null,
          url: deployUrl,
          template_id: "import",
          template_version: "1.0.0",
          look: null,
          status: need ? "failed" : "building",
          status_detail: need ? GITHUB_ACCESS_DETAIL[need] : null,
          github_access: need,
          setup_json: JSON.stringify(setup),
          created_at: now,
          updated_at: now,
        },
        opts.alsoInsert?.(siteId) ?? [],
      );
      row = await getSite(services.db, siteId);
    } catch (err) {
      if (!/UNIQUE constraint failed/i.test(String((err as Error).message))) throw err;
    }
  }
  if (!row) throw new HttpError(409, "name_taken", "That name was just taken. Try another.");
  await insertImport(services.db, {
    id: importId,
    site_id: siteId,
    kind: "url",
    source: request.source,
    platform,
    options_json: JSON.stringify({ owner: request.owner, render: request.render }),
    branch: MAIN_BRANCH,
    state: need ? "waiting" : "queued",
    created_by: user.id,
    created_at: now,
    updated_at: now,
  });
  await audit(services.db, {
    siteId,
    actor: user.id,
    action: "site.import",
    meta: { source: request.source, platform, repo: row.repo, githubAccess: need },
  });
  if (!need) await startImportSetup(services, row, user, opts.log);
  return {
    site: await getSiteView(services, siteId, user, opts.log),
    import: await importViewFor(services, env, importId, user, opts.log),
  };
}

/** Create the repository with the shell, placeholder and request (the push starts the run). */
async function startImportSetup(
  services: Services,
  site: SiteRow,
  user: User,
  log?: Logger,
): Promise<void> {
  const result = await runSetup(services, site, user, log ? { log } : {});
  await updateSite(
    services.db,
    site.id,
    { status: result.status, status_detail: result.detail, url: result.url },
    services.now(),
  );
  const imp = await latestImport(services.db, site.id);
  if (!imp) return;
  const gh = services.github({ site: (await getSite(services.db, site.id)) ?? site, user });
  const repo = parseRepo(site.repo);
  if (result.status === "failed" && !(await gh.getRepo(repo))) {
    await updateImport(
      services.db,
      imp.id,
      {
        state: "failed",
        error: "We couldn't create your site on GitHub. Try again in a moment.",
        finished_at: services.now(),
      },
      services.now(),
    );
    return;
  }
  // The commit holding the request is the one the run builds.
  const head = await gh.getRef(repo, MAIN_BRANCH).catch(() => null);
  await updateImport(services.db, imp.id, { state: "queued", head_sha: head }, services.now());
  await startDevRun(gh, repo, MAIN_BRANCH);
}

/** After the GitHub App install step: the setup ran, so the import's run has started. */
export async function resumeImportAfterSetup(services: Services, siteId: string): Promise<void> {
  const imp = await latestImport(services.db, siteId);
  if (imp?.state !== "waiting") return;
  const site = await getSite(services.db, siteId);
  if (!site || site.github_access) return;
  const owner = (await ownerOf(services, site)) ?? undefined;
  const gh = services.github({ site, user: owner ?? null });
  const repo = parseRepo(site.repo);
  if (!(await gh.getRepo(repo))) return;
  const head = await gh.getRef(repo, imp.branch).catch(() => null);
  await updateImport(services.db, imp.id, { state: "queued", head_sha: head }, services.now());
  await startDevRun(gh, repo, imp.branch);
}

// --- converting an existing repository in place ---------------------------------------------------

/** Workflows that publish GitHub Pages some other way: removed in the conversion branch. */
const OTHER_PAGES_DEPLOY =
  /actions\/deploy-pages|jekyll-build-pages|peaceiris\/actions-gh-pages|JamesIves\/github-pages-deploy-action|actions\/jekyll-build-pages/;

function convertPrBody(input: {
  repo: string;
  url: string;
  domain: string | null;
  removedWorkflows: string[];
  cms: boolean;
  serverFunctions: boolean;
}): string {
  return [
    "## Make this site editable in OpenSpace",
    "",
    `This change turns **${input.repo}** into an OpenSpace site, so you can edit every page visually in OpenSpace Studio (and with Claude). It was prepared automatically from your site's own files.`,
    "",
    "### What changes",
    "",
    "- Your pages, posts and images were rebuilt as OpenSpace content (`content/` and `media/`). `IMPORT-REPORT.md` lists everything that came across and what needs a look.",
    "- The old site's files are removed in this branch. **Nothing is lost:** they stay in this repository's history.",
    input.cms
      ? "- The content editor at `/admin` (Decap/Sveltia CMS) goes away: OpenSpace Studio replaces it."
      : "",
    input.serverFunctions
      ? "- The server functions in `api/` (sign-ups) don't run on GitHub Pages; sign-up forms now use OpenSpace's own (connect your email list from Finish setting up)."
      : "",
    input.removedWorkflows.length
      ? `- The workflow${input.removedWorkflows.length > 1 ? "s" : ""} that published the old site (${input.removedWorkflows.map((w) => `\`${w}\``).join(", ")}) ${input.removedWorkflows.length > 1 ? "are" : "is"} replaced by OpenSpace's \`publish.yml\`.`
      : "",
    "- When you merge, GitHub Pages switches to publishing with GitHub Actions and your new site goes live in a few minutes.",
    `- Your web address stays the same: ${input.domain ? `**${input.domain}**` : input.url}.`,
    "",
    "### Approve it",
    "",
    "Choose **Merge pull request** below. OpenSpace notices, publishes the site and opens it in Studio.",
    "",
    "### Undo it",
    "",
    "After merging, the **Revert** button on this page brings the old site back exactly as it was. Then, in **Settings → Pages**, set the source back to **Deploy from a branch**.",
    "",
    "_Prepared by OpenSpace._",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

/** "Make this repo editable in place" (owner): a conversion branch and, when it's ready, a PR. */
export async function convertRepo(
  services: Services,
  env: HubBindings,
  user: User,
  input: z.infer<typeof ConvertInputSchema>,
  opts: {
    log?: Logger;
    /** Statements committed together with the site row (an AI app's grant to the new site). */
    alsoInsert?: (siteId: string) => D1PreparedStatement[];
  } = {},
): Promise<{ site: SiteView; import: ImportView }> {
  const src = sourceOf({ url: input.repo });
  if (!src.github)
    throw new HttpError(
      400,
      "not_github",
      "That isn't a GitHub repository or GitHub Pages site. Use “Move an existing site” instead.",
    );
  const { owner, repo: repoName } = src.github;
  const fullName = `${owner}/${repoName}`;
  if (await repoTaken(services.db, fullName))
    throw new HttpError(409, "already_site", "That repository is already an OpenSpace site.");
  const check = await checkInstallation(services, user, owner, opts.log);
  if (!check.ok)
    throw new HttpError(409, "github_access_needed", GITHUB_ACCESS_DETAIL[check.need], {
      connectUrl: connectGitHubUrl(services.config.hubUrl),
    });
  const gh = services.github({ user, installationId: check.installation.id });
  const ref: RepoRef = { owner, name: repoName };
  const info = await gh.getRepo(ref);
  if (!info)
    throw new HttpError(
      404,
      "repo_not_found",
      "We couldn't open that repository. Check the address, and that OpenSpace has access to it on GitHub.",
    );
  if (info.archived)
    throw new HttpError(
      409,
      "repo_archived",
      "That repository is archived. Unarchive it on GitHub first.",
    );
  const ref0 = info.defaultBranch;
  const base = await gh.getRef(ref, ref0);
  if (!base) throw new HttpError(409, "repo_empty", "That repository is empty.");
  const tree = await gh.readTree(ref, base);
  const paths = tree.map((e) => e.path);
  const rootSite = paths.some((p) =>
    /^(?:_config\.ya?ml|index\.(?:html?|md|markdown)|package\.json|hugo\.toml|config\.toml|README\.md)$/i.test(
      p,
    ),
  );
  if (!rootSite && paths.some((p) => p.startsWith("docs/")))
    throw new HttpError(
      409,
      "docs_folder",
      "This site is published from the docs folder of a larger project, so it can't be converted in place. Use “Move an existing site” to make a new site from it instead.",
    );

  const pages = await gh.getPages(ref).catch(() => null);
  const domain = pages?.cname ?? null;
  const siteId = newId("st") as SiteId;
  const importId = `imp_${newId("st").slice(3)}`;
  const now = services.now();
  const deployUrl =
    gh.kind === "dev"
      ? previewUrl(services.config.hubUrl, siteId)
      : domain
        ? `https://${domain}/`
        : (pages?.url ?? githubPagesUrl(owner, repoName));
  const name = guessSiteName(src);

  // The OpenSpace shell, its identity (openspace.json) and the import, on the conversion branch.
  const doc = placeholderDocument({
    siteId,
    name,
    hubUrl: services.config.hubUrl,
    deployUrl,
    sourceLabel: fullName,
  });
  doc.config.deploy.customDomain = domain;
  const shell = shellFiles(repoName);
  const files: Record<string, string> = {
    ...shell,
    "openspace.json": `${JSON.stringify(doc.config, null, 2)}\n`,
  };
  const keep = [...Object.keys(files), IMPORT_REQUEST_PATH];
  const request: ImportRequest = {
    version: 1,
    id: importId,
    siteId,
    hub: services.config.hubUrl,
    mode: "convert",
    source: fullName,
    platform: "github",
    owner: true,
    render: false,
    base,
    keep: [...keep, ".github/openspace/import.mjs", ".github/workflows/openspace-import.yml"],
    attempt: 1,
  };
  Object.assign(files, importFiles(request));
  const removedWorkflows: string[] = [];
  // Every other workflow in one batched read (not one request per file).
  const workflows = await gh.readFiles(ref, base, {
    textOnly: true,
    filter: (p) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p) &&
      p !== ".github/workflows/publish.yml" &&
      !p.endsWith(`/${IMPORT_WORKFLOW}`),
  });
  for (const [p, text] of Object.entries(workflows))
    if (OTHER_PAGES_DEPLOY.test(text)) removedWorkflows.push(p);
  if (await gh.getRef(ref, CONVERT_BRANCH)) await gh.resetBranch(ref, CONVERT_BRANCH, base);
  else await gh.createBranch(ref, CONVERT_BRANCH, base);
  const commit = await gh.commitFiles(ref, {
    branch: CONVERT_BRANCH,
    expectedHead: base,
    message: "Prepare this site for OpenSpace",
    author: { name: user.name ?? user.login },
    files: [
      ...Object.entries(files).map(([path, content]) => ({ path, content })),
      ...removedWorkflows.map((path) => ({ path, content: null })),
    ],
  });

  const setup: SiteSetup = {
    import: { request, sourceLabel: fullName },
    template: "import",
    look: "",
    tagline: null,
    brandColor: null,
    deployUrl,
    createdAt: now,
    logo: null,
  };
  await insertSite(
    services.db,
    {
      id: siteId,
      owner_id: user.id,
      name,
      tagline: null,
      repo: fullName,
      installation_id: check.installation.id,
      deploy_target: "github-pages",
      domain,
      url: deployUrl,
      template_id: "import",
      template_version: "1.0.0",
      look: null,
      status: "building",
      status_detail: null,
      github_access: null,
      setup_json: JSON.stringify(setup),
      created_at: now,
      updated_at: now,
    },
    opts.alsoInsert?.(siteId) ?? [],
  );
  await insertImport(services.db, {
    id: importId,
    site_id: siteId,
    kind: "convert",
    source: fullName,
    platform: "github",
    options_json: JSON.stringify({
      domain,
      removedWorkflows,
      cms: paths.some((p) => /(?:^|\/)admin\/config\.ya?ml$/.test(p)),
      serverFunctions: paths.some((p) => /^api\/.+\.(?:js|ts)$/.test(p)),
      defaultBranch: ref0,
    }),
    branch: CONVERT_BRANCH,
    state: "queued",
    created_by: user.id,
    created_at: now,
    updated_at: now,
  });
  await updateImport(services.db, importId, { head_sha: commit.sha }, now);
  await audit(services.db, {
    siteId,
    actor: user.id,
    action: "site.convert",
    meta: { repo: fullName, base, removedWorkflows },
  });
  await startDevRun(gh, ref, CONVERT_BRANCH);
  return {
    site: await getSiteView(services, siteId, user, opts.log),
    import: await importViewFor(services, env, importId, user, opts.log),
  };
}

// --- progress ------------------------------------------------------------------------------------

const PHASES: ImportPhase[] = [
  "reading",
  "importing",
  "imported",
  "checking",
  "saving",
  "saved",
  "publishing",
  "failed",
];

/** A progress report from the run itself (`POST /ci/sites/:id/import`, or the dev emulation). */
export async function recordProgress(
  services: Services,
  importId: string,
  report: { phase: string; counts?: Record<string, unknown>; sha?: string; live?: ImportLive },
): Promise<ImportRow | null> {
  const row = await getImport(services.db, importId);
  if (!row || row.state === "ready" || row.state === "failed") return row;
  const phase = PHASES.includes(report.phase as ImportPhase) ? (report.phase as ImportPhase) : null;
  // "failed" is the run's last word, not a step: keep the step it stopped at (so the failure
  // screen marks the right one), and the run's own result decides the state. A late report
  // never moves the progress backwards either.
  if (!phase || phase === "failed") return row;
  if (row.phase && PHASES.indexOf(phase) < PHASES.indexOf(row.phase)) return row;
  const counts = report.counts
    ? {
        pages: Number(report.counts.pages) || 0,
        items: Number(report.counts.items) || 0,
        media: Number(report.counts.media) || 0,
        redirects: Number(report.counts.redirects) || 0,
      }
    : undefined;
  await updateImport(
    services.db,
    importId,
    {
      ...(row.state === "queued" || row.state === "running" ? { state: "running" as const } : {}),
      phase,
      ...(counts
        ? { counts_json: JSON.stringify(counts) }
        : report.live && phase === "importing" && !countsOf(row)
          ? { counts_json: JSON.stringify({ live: report.live }) }
          : {}),
    },
    services.now(),
  );
  return getImport(services.db, importId);
}

// --- the state machine ---------------------------------------------------------------------------

/**
 * Plain words for a failed run, from the step that failed and its log. Never blames the person's
 * site for a problem on our side (a CLI option or package problem is ours to fix).
 */
export function failureMessage(row: ImportRow, steps: string[], log: string): string {
  const step = steps.join(" ").toLowerCase();
  const what = row.kind === "convert" ? "your repository" : "your site";
  if (
    /unknown (?:option|command|argument)|too many arguments|ETARGET|No matching version|npm (?:ERR|error)|ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|SyntaxError/i.test(
      log,
    )
  )
    return "Something went wrong on our side while moving your site — it isn't a problem with your site. Choose Try again in a little while; if it happens again, we'll need to fix it.";
  const said = /(?:^|\n)(?:Error:\s*|.*?CliError:\s*)([^\n]{10,300})/.exec(log)?.[1]?.trim();
  const unreachable =
    /\b(?:401|403|404|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|certificate|robots\.txt|password[- ]protected|not found)\b/i.test(
      `${said ?? ""}\n${log}`,
    );
  if (/reading/.test(step))
    return `We couldn't start reading ${what}. Choose Try again; if it happens again, check that the address opens in a browser.`;
  if (/bringing pages/.test(step) || /import/.test(step)) {
    if (unreachable)
      return row.kind === "convert"
        ? "We couldn't read your repository. Check that OpenSpace still has access to it on GitHub, then choose Try again."
        : "We couldn't open your site's pages. Check that the address opens in a private browser window (not behind a password or “coming soon” page), then choose Try again.";
    return said && !/[{}<>`$]|\bat \S+:\d+/.test(said)
      ? `The move stopped while bringing pages across: ${said} Choose Try again.`
      : "The move stopped while bringing pages across. This is usually temporary — choose Try again.";
  }
  if (/checking/.test(step))
    return "The pages came across, but the new site didn't pass its final checks, so nothing was published. Choose Try again, or ask Claude to look at IMPORT-REPORT.md.";
  if (/saving/.test(step)) return "The pages came across but couldn't be saved. Choose Try again.";
  return "The move didn't finish. Choose Try again in a moment.";
}

async function countsFromTree(gh: GitHubAccess, repo: RepoRef, sha: string): Promise<ImportCounts> {
  const tree = await gh.readTree(repo, sha);
  return {
    pages: tree.filter((e) => /^content\/pages\/.+\.json$/.test(e.path)).length,
    items: tree.filter((e) => /^content\/collections\/[^/]+\/[^/]+\.mdoc$/.test(e.path)).length,
    media: tree.filter((e) => /^media\/.+\.(?:png|jpe?g|gif|webp|avif)$/i.test(e.path)).length,
    redirects: 0,
  };
}

async function finishedContent(
  _services: Services,
  gh: GitHubAccess,
  repo: RepoRef,
  row: ImportRow,
  head: string,
): Promise<Partial<ImportRow>> {
  const [report, checklist, fidelity] = await Promise.all([
    gh.readFile(repo, "IMPORT-REPORT.md", head).catch(() => null),
    gh.readFile(repo, "content/setup-checklist.json", head).catch(() => null),
    gh.readFile(repo, `${IMPORT_FIDELITY_DIR}/fidelity-summary.json`, head).catch(() => null),
  ]);
  const counts: ImportCounts = countsOf(row) ?? (await countsFromTree(gh, repo, head));
  const measured = parseFidelitySummary(fidelity);
  if (measured) counts.fidelity = measured;
  return {
    head_sha: head,
    report: report ? report.slice(0, 200_000) : null,
    checklist_json: checklist,
    counts_json: JSON.stringify(counts),
  };
}

/** Make the imported content the site's draft and published version, and publish it. */
async function adoptAndPublish(
  services: Services,
  env: HubBindings,
  site: SiteRow,
  owner: User,
  gh: GitHubAccess,
  head: string,
  summary: string,
  log?: Logger,
): Promise<void> {
  const repo = parseRepo(site.repo);
  try {
    await unwrapRoom(roomStub(env, site.id).adoptImport(site.id, head));
  } catch (err) {
    log?.warn("room adopt failed; resetting the draft directly", { siteId: site.id, err });
    await gh.resetBranch(repo, DRAFT_BRANCH, head);
  }
  if (!(await publishBySha(services.db, site.id, head)))
    await insertPublish(
      services.db,
      {
        site_id: site.id,
        kind: "setup",
        sha: head,
        prev_sha: null,
        summary,
        actor: owner.id,
        status: "queued",
      },
      services.now(),
    );
  // The workflow started the publish itself; start one if it didn't (or GitHub lost it).
  const run = await gh
    .workflowStatus(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH })
    .catch(() => ({ state: "none" as const, sha: undefined }));
  if (run.state === "none" || (run.sha && run.sha !== head))
    await gh
      .dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH })
      .catch((err) => log?.warn("publish dispatch failed", { siteId: site.id, err }));
  const after = await gh
    .workflowStatus(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH })
    .catch(() => ({ state: "none" as const, sha: undefined }));
  const live = after.state === "success" && after.sha === head;
  await updateSite(
    services.db,
    site.id,
    { status: live ? "live" : "building", status_detail: null },
    services.now(),
  );
  if (live) {
    const p = await publishBySha(services.db, site.id, head);
    if (p)
      await services.db
        .prepare("UPDATE publishes SET status = 'success', updated_at = ? WHERE id = ?")
        .bind(services.now(), p.id)
        .run();
  }
}

/** Run timeout: a request GitHub never started (Actions disabled, a lost push event). */
const NO_RUN_MS = 15 * 60_000;

/**
 * Move an import along: look at its run, and finish what comes after (adopt the content,
 * publish; or open the pull request, then publish once it's merged). Idempotent.
 */
export async function refreshImport(
  services: Services,
  env: HubBindings,
  importId: string,
  log?: Logger,
): Promise<ImportRow | null> {
  let row = await getImport(services.db, importId);
  if (!row || row.state === "ready" || row.state === "failed") return row;
  const site = await getSite(services.db, row.site_id);
  if (!site || site.archived_at) return row;
  const owner = await ownerOf(services, site);
  if (!owner) return row;
  const now = services.now();
  const fail = async (error: string) => {
    await updateImport(services.db, importId, { state: "failed", error, finished_at: now }, now);
    return getImport(services.db, importId);
  };
  if (row.state === "waiting") {
    if (site.github_access) return row;
    await resumeImportAfterSetup(services, site.id);
    row = (await getImport(services.db, importId)) as ImportRow;
    if (row.state === "waiting") return row;
  }
  const gh = services.github({ site, user: owner });
  const repo = parseRepo(site.repo);
  try {
    if (row.state === "queued" || row.state === "running") {
      const run = await gh.workflowStatus(repo, { workflow: IMPORT_WORKFLOW, ref: row.branch });
      const ours = run.state !== "none" && (!row.head_sha || !run.sha || run.sha === row.head_sha);
      if (!ours) {
        if (now - row.updated_at > NO_RUN_MS && row.state === "queued")
          return fail(
            "GitHub didn't start moving your site. Choose Try again; if it happens again, check that GitHub Actions is turned on for the site's repository.",
          );
        return row;
      }
      if (run.url && run.url !== row.run_url)
        await updateImport(services.db, importId, { run_url: run.url }, now);
      if (run.state === "queued" || run.state === "in_progress") {
        if (row.state === "queued")
          await updateImport(
            services.db,
            importId,
            { state: "running", phase: row.phase ?? "reading" },
            now,
          );
        return getImport(services.db, importId);
      }
      if (run.state === "failure") {
        let steps: string[] = [];
        let text = "";
        if (typeof run.id === "number")
          try {
            const f = await gh.failedRun(repo, run.id);
            steps = f.steps;
            text = f.log;
          } catch (err) {
            log?.warn("import run details failed", { importId, err });
          }
        return fail(failureMessage(row, steps, text));
      }
      // Success: the content is committed on the import's branch.
      const head = await gh.getRef(repo, row.branch);
      if (!head) return fail("The imported site couldn't be found. Choose Try again.");
      const content = await finishedContent(services, gh, repo, row, head);
      if (row.kind === "convert") {
        const opts = parseJson<{
          domain: string | null;
          removedWorkflows: string[];
          cms: boolean;
          serverFunctions: boolean;
          defaultBranch: string;
        }>(row.options_json);
        let pr = row.pr_number && row.pr_url ? { number: row.pr_number, url: row.pr_url } : null;
        pr ??= await gh.openPullRequest(repo, {
          head: CONVERT_BRANCH,
          base: opts?.defaultBranch ?? MAIN_BRANCH,
          title: "Make this site editable in OpenSpace",
          body: convertPrBody({
            repo: site.repo,
            url: site.url ?? "",
            domain: opts?.domain ?? null,
            removedWorkflows: opts?.removedWorkflows ?? [],
            cms: opts?.cms ?? false,
            serverFunctions: opts?.serverFunctions ?? false,
          }),
        });
        await updateImport(
          services.db,
          importId,
          { ...content, state: "review", phase: "saved", pr_number: pr.number, pr_url: pr.url },
          now,
        );
        return getImport(services.db, importId);
      }
      await updateImport(
        services.db,
        importId,
        { ...content, state: "publishing", phase: "publishing" },
        now,
      );
      await adoptAndPublish(services, env, site, owner, gh, head, `Moved ${row.source}`, log);
      row = (await getImport(services.db, importId)) as ImportRow;
    }
    if (row.state === "review") {
      // Merged when the default branch has the OpenSpace site.
      const opts = parseJson<{ defaultBranch?: string }>(row.options_json);
      const branch = opts?.defaultBranch ?? MAIN_BRANCH;
      const head = await gh.getRef(repo, branch);
      if (!head || (await gh.readFile(repo, "openspace.json", head)) === null) return row;
      await gh.enablePages(repo);
      await updateImport(
        services.db,
        importId,
        { state: "publishing", phase: "publishing", head_sha: head },
        now,
      );
      if (!(await gh.getRef(repo, DRAFT_BRANCH))) await gh.createBranch(repo, DRAFT_BRANCH, head);
      await adoptAndPublish(
        services,
        env,
        site,
        owner,
        gh,
        head,
        "Made editable in OpenSpace",
        log,
      );
      row = (await getImport(services.db, importId)) as ImportRow;
    }
    if (row.state === "publishing") {
      const fresh = (await getSite(services.db, site.id)) ?? site;
      const latest = await latestPublish(services.db, site.id);
      const ok = fresh.status === "live" && (!row.head_sha || latest?.sha === row.head_sha);
      if (ok) {
        await updateImport(services.db, importId, { state: "ready", finished_at: now }, now);
        await audit(services.db, { siteId: site.id, actor: "system", action: "site.import.ready" });
      } else if (
        fresh.status === "failed" &&
        latest?.sha === row.head_sha &&
        latest.status === "failure"
      )
        return fail(
          "Your site came across, but publishing it didn't finish. Open it and choose Try again — your imported content is saved.",
        );
      return getImport(services.db, importId);
    }
  } catch (err) {
    log?.error("import refresh failed", { importId, err });
  }
  return getImport(services.db, importId);
}

export async function importViewFor(
  services: Services,
  env: HubBindings,
  importId: string,
  user: User,
  log?: Logger,
): Promise<ImportView> {
  const row = await getImport(services.db, importId);
  if (!row) throw new HttpError(404, "not_found", "We couldn't find that move.");
  const site = await siteForUser(services, row.site_id, user);
  const fresh = (await refreshImport(services, env, importId, log)) ?? row;
  const s = (await getSite(services.db, site.id)) ?? site;
  return toImportView(services, fresh, s);
}

/** A fidelity thumbnail of an import (original | new site), read from the site's repository. */
export async function importFidelityImage(
  services: Services,
  importId: string,
  file: string,
  user: User,
): Promise<Uint8Array> {
  const row = await getImport(services.db, importId);
  if (!row) throw new HttpError(404, "not_found", "We couldn't find that move.");
  const site = await siteForUser(services, row.site_id, user);
  const counts = countsOf(row);
  if (!row.head_sha || !isFidelityThumb(counts, file))
    throw new HttpError(404, "not_found", "That picture isn't part of this move.");
  const gh = services.github({ site, user });
  const bytes = await gh
    .readFileBytes(parseRepo(site.repo), `${IMPORT_FIDELITY_DIR}/${file}`, row.head_sha)
    .catch(() => null);
  if (!bytes) throw new HttpError(404, "not_found", "That picture isn't there any more.");
  return bytes;
}

/** The newest import of a site (Studio's progress screen). */
export async function siteImportView(
  services: Services,
  env: HubBindings,
  siteId: string,
  user: User,
  log?: Logger,
): Promise<ImportView | null> {
  await siteForUser(services, siteId, user);
  const row = await latestImport(services.db, siteId);
  return row ? importViewFor(services, env, row.id, user, log) : null;
}

/** "Try again": run the import once more (the request file changes, so the workflow runs). */
export async function retryImport(
  services: Services,
  env: HubBindings,
  importId: string,
  user: User,
  log?: Logger,
): Promise<ImportView> {
  const row = await getImport(services.db, importId);
  if (!row) throw new HttpError(404, "not_found", "We couldn't find that move.");
  const site = await siteForUser(services, row.site_id, user);
  if (site.role !== "owner" && site.role !== "designer")
    throw new HttpError(403, "forbidden", "Only the site's owner can move it again.");
  if (row.state !== "failed" && row.state !== "queued")
    return importViewFor(services, env, importId, user, log);
  const owner = (await ownerOf(services, site)) ?? user;
  const gh = services.github({ site, user: owner });
  const repo = parseRepo(site.repo);
  const now = services.now();
  // A move whose content landed but didn't publish just publishes again.
  if (row.report && row.kind === "url" && row.head_sha) {
    await updateImport(
      services.db,
      importId,
      { state: "publishing", error: null, finished_at: null },
      now,
    );
    await adoptAndPublish(services, env, site, owner, gh, row.head_sha, `Moved ${row.source}`, log);
    return importViewFor(services, env, importId, user, log);
  }
  const setup = parseJson<SiteSetup>(site.setup_json);
  if (!setup?.import) throw new HttpError(409, "not_import", "This site wasn't moved in.");
  const request: ImportRequest = { ...setup.import.request, attempt: row.attempt + 1 };
  const head = await gh.getRef(repo, row.branch);
  if (!head)
    throw new HttpError(
      409,
      "not_ready",
      "The site isn't set up yet. Choose Try again on it first.",
    );
  const commit = await gh.commitFiles(repo, {
    branch: row.branch,
    expectedHead: head,
    message: "Move the site in again",
    author: { name: user.name ?? user.login },
    files: Object.entries(importFiles(request)).map(([path, content]) => ({ path, content })),
  });
  await updateImport(
    services.db,
    importId,
    {
      state: "queued",
      phase: null,
      error: null,
      finished_at: null,
      head_sha: commit.sha,
      attempt: row.attempt + 1,
    },
    now,
  );
  await startDevRun(gh, repo, row.branch);
  return importViewFor(services, env, importId, user, log);
}

/** Cron: keep imports moving when nobody is watching (lost webhooks, closed tabs). */
export async function refreshOpenImports(
  services: Services,
  env: HubBindings,
  log?: Logger,
): Promise<number> {
  const rows = await openImports(services.db);
  for (const r of rows) await refreshImport(services, env, r.id, log);
  return rows.length;
}

/** The import a webhook or progress report concerns: the newest open one of a repository's site. */
export async function openImportForSite(
  services: Services,
  siteId: string,
): Promise<ImportRow | null> {
  const row = await latestImport(services.db, siteId);
  return row && row.state !== "ready" && row.state !== "failed" ? row : null;
}
