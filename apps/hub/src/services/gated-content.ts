/**
 * Gated page content (PRD §7.3, FR-5, arch §9.4): members-only and password pages are never
 * committed to the site's public repository.
 *
 * At the Git boundary a gated page file is *sealed*: its content goes to the Hub's R2 under
 * `gated/<siteId>/<ref>.json` and the committed file is a stub — id, title, slug, access and the
 * `contentRef` — with no sections. Reading a branch *opens* the stubs again, so the DraftRoom,
 * Studio, MCP and the dev preview always work on the full document.
 *
 * Refs are content-addressed (HMAC of site + content with the Hub key, random without one), so
 * every commit names exactly the content version it had: history, rollback, snapshots and
 * discard work unchanged, and stored versions are never overwritten. On the Cloudflare target the
 * publish workflow downloads the versions its commit names (`gatedBundle`, authorized by the
 * run's GitHub OIDC token) into the Worker's private R2 bucket before deploying.
 */
import { type Page, PageSchema } from "@openspace/schema";
import type { FileChange, FileContent, GitHubAccess, RepoRef } from "../github/types";
import { randomToken } from "../lib/crypto";
import { hmacHex } from "../lib/seal";
import { isDocumentPath, loadSiteDocument, PAGES_DIR } from "./site-files";

/** Where gated content versions live in the Hub's R2 bucket. */
export const gatedKey = (siteId: string, ref: string) => `gated/${siteId}/${ref}.json`;
export const gatedPrefix = (siteId: string) => `gated/${siteId}/`;

export interface GatedStoreContext {
  /** The Hub's R2 bucket (`UPLOADS`). */
  store: R2Bucket;
  siteId: string;
  /** HMAC key for content-addressed refs; null → random refs (still never in the repo). */
  hmacKey: string | null;
}

type PageLike = { slug?: unknown; access?: { members?: unknown; password?: unknown } | null };

/** Members-only, password-protected, or under `/members/` (members-only by definition). */
export function isGatedPage(page: PageLike): boolean {
  const slug = typeof page.slug === "string" ? page.slug : "";
  return !!(
    page.access?.members ||
    page.access?.password ||
    slug === "members" ||
    slug.startsWith("members/")
  );
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const isPageFile = (path: string) => path.startsWith(PAGES_DIR) && path.endsWith(".json");

function parse(text: string): (Record<string, unknown> & PageLike) | null {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown> & PageLike)
      : null;
  } catch {
    return null;
  }
}

/** A sealed stub: everything the public build needs to route, link and gate — no content. */
export function stubOf(page: Record<string, unknown>, ref: string): Record<string, unknown> {
  const stub: Record<string, unknown> = {};
  for (const k of ["$schema", "id", "title", "slug", "hidden", "access"] as const)
    if (page[k] !== undefined) stub[k] = page[k];
  stub.seo = { noindex: true };
  stub.contentRef = ref;
  stub.sections = [];
  return stub;
}

const isStub = (page: Record<string, unknown>) =>
  typeof page.contentRef === "string" && Array.isArray(page.sections) && page.sections.length === 0;

/** Seal one page file's text (unchanged when it isn't a gated page or is already a stub). */
export async function sealPageText(ctx: GatedStoreContext, text: string): Promise<string> {
  const page = parse(text);
  if (!page || !isGatedPage(page) || isStub(page)) return text;
  const { contentRef: _old, ...content } = page;
  const body = JSON.stringify(content);
  const ref = ctx.hmacKey
    ? (await hmacHex(ctx.hmacKey, `gated:${ctx.siteId}:${body}`)).slice(0, 40)
    : randomToken(24)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "0");
  const key = gatedKey(ctx.siteId, ref);
  if (!(await ctx.store.head(key)))
    await ctx.store.put(key, body, { httpMetadata: { contentType: "application/json" } });
  return json(stubOf(page, ref));
}

/** Seal the page files of a commit's changes (deletions and other files pass through). */
export async function sealChanges(
  ctx: GatedStoreContext,
  changes: FileChange[],
): Promise<FileChange[]> {
  const out: FileChange[] = [];
  for (const c of changes)
    out.push(
      c.content !== null && isPageFile(c.path) && (c.encoding ?? "utf-8") === "utf-8"
        ? { ...c, content: await sealPageText(ctx, c.content) }
        : c,
    );
  return out;
}

/** Seal the page files of a whole file set (site creation). */
export async function sealFiles<T extends string | FileContent>(
  ctx: GatedStoreContext,
  files: Record<string, T>,
): Promise<Record<string, T | string>> {
  const out: Record<string, T | string> = {};
  for (const [path, v] of Object.entries(files))
    out[path] = typeof v === "string" && isPageFile(path) ? await sealPageText(ctx, v) : v;
  return out;
}

/** Fetch one content version (null when it isn't stored). */
export async function readGatedContent(
  ctx: Pick<GatedStoreContext, "store" | "siteId">,
  ref: string,
): Promise<Record<string, unknown> | null> {
  if (!/^[a-z0-9]{16,64}$/.test(ref)) return null;
  const obj = await ctx.store.get(gatedKey(ctx.siteId, ref));
  return obj ? parse(await obj.text()) : null;
}

/**
 * Open sealed stubs: each stub's file becomes the stored content again (formatted exactly as
 * `siteDocumentToFiles` writes it). A stub whose content is missing stays a stub.
 */
export async function openFiles(
  ctx: Pick<GatedStoreContext, "store" | "siteId">,
  files: Record<string, string>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...files };
  for (const [path, text] of Object.entries(files)) {
    if (!isPageFile(path)) continue;
    const page = parse(text);
    if (!page || !isStub(page)) continue;
    const content = await readGatedContent(ctx, page.contentRef as string);
    if (!content || content.id !== page.id) continue;
    // Routing and gating come from the stub (what the commit says); the body from storage.
    const opened = { ...content, slug: page.slug, access: page.access };
    if (opened.access === undefined) delete opened.access;
    const parsed = PageSchema.safeParse(opened);
    if (parsed.success) out[path] = json(parsed.data);
  }
  return out;
}

/** A ref's document files (text, document paths only), with gated pages opened. */
export async function readOpenedDocumentFiles(
  ctx: Pick<GatedStoreContext, "store" | "siteId">,
  gh: GitHubAccess,
  repo: RepoRef,
  ref: string,
): Promise<Record<string, string>> {
  const all = await gh.readFiles(repo, ref, { textOnly: true });
  const files: Record<string, string> = {};
  for (const [p, c] of Object.entries(all)) if (isDocumentPath(p)) files[p] = c;
  return openFiles(ctx, files);
}

/** Open a whole repo file map (document paths opened, everything else kept). */
export async function loadOpenedDocument(
  ctx: Pick<GatedStoreContext, "store" | "siteId">,
  files: Record<string, string>,
) {
  return loadSiteDocument(await openFiles(ctx, files));
}

export interface GatedBundleEntry {
  id: string;
  slug: string;
  ref: string;
  page: Page;
}

/**
 * The gated content a commit names: one entry per sealed stub whose content is stored. What the
 * Cloudflare publish workflow uploads to the Worker's R2 bucket (`pages/<id>/<ref>.json`).
 */
export async function gatedBundle(
  ctx: Pick<GatedStoreContext, "store" | "siteId">,
  gh: GitHubAccess,
  repo: RepoRef,
  sha: string,
): Promise<{ pages: GatedBundleEntry[]; missing: string[] }> {
  const all = await gh.readFiles(repo, sha, { prefix: PAGES_DIR, textOnly: true });
  const pages: GatedBundleEntry[] = [];
  const missing: string[] = [];
  for (const [path, text] of Object.entries(all)) {
    if (!isPageFile(path)) continue;
    const stub = parse(text);
    if (!stub || !isStub(stub) || !isGatedPage(stub)) continue;
    const ref = stub.contentRef as string;
    const content = await readGatedContent(ctx, ref);
    const parsed = content ? PageSchema.safeParse(content) : null;
    if (!parsed?.success || parsed.data.id !== stub.id) {
      missing.push(String(stub.id));
      continue;
    }
    pages.push({ id: parsed.data.id, slug: String(stub.slug), ref, page: parsed.data });
  }
  return { pages, missing };
}

/** Delete every stored version of a site's gated content (archived-site purge). */
export async function purgeGatedContent(store: R2Bucket, siteId: string): Promise<void> {
  for (let cursor: string | undefined; ; ) {
    const list = await store.list({ prefix: gatedPrefix(siteId), cursor });
    if (list.objects.length) await store.delete(list.objects.map((o) => o.key));
    if (!list.truncated) break;
    cursor = list.cursor;
  }
}

/** The gated-content context for a site from the Hub's services. */
export function gatedContext(
  services: { uploads: R2Bucket; pub: { config: { hmacKey: string | null } } },
  siteId: string,
): GatedStoreContext {
  return { store: services.uploads, siteId, hmacKey: services.pub.config.hmacKey };
}

/** Gated page files whose content is still in the repository (committed before sealing). */
export function unsealedGatedPaths(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (!isPageFile(path)) continue;
    const page = parse(text);
    if (page && isGatedPage(page) && !isStub(page)) out.push(path);
  }
  return out.sort();
}
