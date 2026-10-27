/**
 * `FileSiteStore`: the MCP tools against a local site checkout. Reads and writes go through
 * site-kit's content loader/writer (formatting-stable), every edit is validated `@omniharmonic/openspace-ops`
 * operations, and with git:
 * - the draft is the working tree, the published version is HEAD;
 * - `publish` commits `content/` and `media/` on the current branch (push to deploy);
 * - snapshots (one at the start of each agent session) are `os/snap/<name>` tags on commits
 *   made from a temporary index, so the person's index and branch are untouched;
 * - discard/rollback snapshot the working tree first.
 * Without git the baseline is the content as it was when the server started.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  type AgentSession,
  type ApplyContext,
  type ApplyResult,
  type DraftDiff,
  type ImageResizer,
  type ImageUploadInput,
  type PublishResult,
  prepareImage,
  type Screenshot,
  type ScreenshotRequest,
  type SiteStore,
  type SiteSummary,
  type StoreCapabilities,
  type TemplateCatalog,
  ToolError,
  type VersionInfo,
} from "@omniharmonic/openspace-mcp-tools";
import { diff, type Op, summarize, validateAll } from "@omniharmonic/openspace-ops";
import type { BlockRegistry, MediaMeta, SiteDocument } from "@omniharmonic/openspace-schema";
import { loadSiteDocument, writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { Git } from "./git";
import { type PreviewServer, startPreviewServer } from "./preview-server";
import type { Screenshotter } from "./screenshot";

/** What snapshots capture (read-only), relative to the site folder. */
const TRACKED = ["content", "media", "openspace.json"];
/** What agents may change, stage and commit: never `openspace.json`, `src/` or workflows. */
const WRITABLE = ["content", "media"];
const CONFIG_FILE = "openspace.json";
/** A rollback target: a commit sha (7–40 hex) or a snapshot tag. */
const VERSION_RE = /^(?:[0-9a-f]{7,40}|os\/snap\/[a-z0-9][a-z0-9-]{0,80})$/;

export interface FileSiteStoreOptions {
  registry?: BlockRegistry;
  /** Optional screenshot provider (Playwright). */
  screenshotter?: Screenshotter;
  resize?: ImageResizer;
  templates?: TemplateCatalog;
  previewPort?: number;
  now?: () => Date;
}

export class FileSiteStore implements SiteStore {
  capabilities: StoreCapabilities = { canPublish: false, canScreenshot: false, canRollback: false };
  readonly templates?: TemplateCatalog;
  private readonly git: Git;
  private readonly registry: BlockRegistry;
  private hasGit = false;
  private siteId = "";
  private baseline: SiteDocument | undefined;
  private preview: Promise<PreviewServer> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private sessionSeq = 0;

  private constructor(
    readonly root: string,
    private readonly options: FileSiteStoreOptions,
  ) {
    this.git = new Git(root);
    this.registry = options.registry ?? blocksRegistry();
    this.templates = options.templates;
  }

  /** Open a site folder (validates the content up front, with file-named errors). */
  static async open(root: string, options: FileSiteStoreOptions = {}): Promise<FileSiteStore> {
    const store = new FileSiteStore(root, options);
    const doc = await loadSiteDocument(root);
    store.siteId = doc.config.siteId;
    store.baseline = doc;
    store.hasGit = await store.git.available();
    store.capabilities = {
      canPublish: store.hasGit,
      canRollback: store.hasGit,
      canScreenshot: Boolean(options.screenshotter),
      publishNote: store.hasGit
        ? "Local site in git: publishing commits content/ and media/ on the current branch; push it to deploy."
        : "Local site without git: edits are saved to the files; there is no publish step.",
    };
    return store;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Run store mutations one at a time. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private check(siteId: string) {
    if (siteId !== this.siteId) throw new ToolError(`Unknown site "${siteId}".`, "not_found");
  }

  async listSites(): Promise<SiteSummary[]> {
    const doc = await loadSiteDocument(this.root);
    return [
      {
        id: this.siteId,
        title: doc.site.title,
        url: doc.config.deploy.customDomain
          ? `https://${doc.config.deploy.customDomain}`
          : (doc.config.deploy.url ?? null),
      },
    ];
  }

  async getDocument(siteId: string): Promise<SiteDocument> {
    this.check(siteId);
    return loadSiteDocument(this.root);
  }

  applyOps(siteId: string, ops: Op[], _ctx: ApplyContext): Promise<ApplyResult> {
    this.check(siteId);
    return this.serial(async () => {
      const doc = await loadSiteDocument(this.root);
      const r = validateAll(doc, ops, { registry: this.registry });
      if (!r.ok) return { ok: false, index: r.index, errors: r.errors, code: "invalid" };
      await this.writeContent(r.doc);
      return { ok: true, doc: r.doc, warnings: r.warnings };
    });
  }

  /**
   * Write content (and media.json) only. `openspace.json` is never written from agent paths
   * (arch §10.3): the document carries the config as it is on disk, and the file's bytes are
   * put back if the writer would have reformatted it.
   */
  private async writeContent(doc: SiteDocument): Promise<void> {
    const configPath = join(this.root, CONFIG_FILE);
    const original = await readFile(configPath, "utf8");
    const current = (await loadSiteDocument(this.root, { validate: false }).catch(() => null))
      ?.config;
    await writeSiteDocument(this.root, { ...doc, config: current ?? doc.config });
    if ((await readFile(configPath, "utf8")) !== original) await writeFile(configPath, original);
  }

  /**
   * Restore the content of `target` through ops (Global Constraint 5): `diff(current, target)`
   * validated in sequence, then written. `config` is ignored by `diff`, so it stays untouched.
   */
  private async restoreThroughOps(target: SiteDocument, actor: string): Promise<number> {
    const current = await loadSiteDocument(this.root);
    const ops = diff(current, target, { actor, ts: this.now().getTime(), idPrefix: "restore_" });
    if (!ops.length) return 0;
    const r = validateAll(current, ops, { registry: this.registry });
    if (!r.ok) {
      const op = ops[r.index];
      throw new ToolError(
        `Restoring failed at step ${r.index + 1} of ${ops.length} (${op?.op}):\n${r.errors
          .map((e) => `- ${e.path.join(".") || "(root)"}: ${e.message}`)
          .join("\n")}`,
        "restore_failed",
        r.errors,
        "Nothing was changed. The saved version may not match the current schema; restore it by hand from git.",
      );
    }
    await this.writeContent(r.doc);
    return ops.length;
  }

  /** The published document: HEAD with git, else the content as loaded at start. */
  private async publishedDoc(rev = "HEAD"): Promise<SiteDocument | null> {
    if (!this.hasGit) return this.baseline ?? null;
    if (rev === "HEAD" && !(await this.git.head())) return null;
    const dir = await mkdtemp(join(tmpdir(), "os-pub-"));
    try {
      await this.git.extract(rev, TRACKED, dir);
      if (!existsSync(join(dir, "openspace.json"))) return null;
      return await loadSiteDocument(dir);
    } catch {
      return null;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async getDraftDiff(siteId: string): Promise<DraftDiff> {
    this.check(siteId);
    const draft = await loadSiteDocument(this.root);
    const published = await this.publishedDoc();
    const files = this.hasGit ? await this.git.status(this.git.existing(TRACKED)) : [];
    if (!published)
      return {
        hasChanges: true,
        summary: "Nothing published yet: the whole site is new.",
        changes: files,
      };
    const ops = diff(published, draft, { actor: "diff" });
    if (!ops.length && !files.length)
      return { hasChanges: false, summary: "No unpublished changes." };
    return {
      hasChanges: true,
      summary: ops.length ? summarize(ops, published) : "Changed files",
      ...(files.length ? { changes: files.map((l) => l.trim()) } : {}),
    };
  }

  publish(siteId: string, opts: { message?: string; actor: string }): Promise<PublishResult> {
    this.check(siteId);
    if (!this.hasGit)
      throw new ToolError(
        "This site folder isn't in git, so there's nothing to publish to.",
        "unsupported",
      );
    return this.serial(async () => {
      const d = await this.getDraftDiff(siteId);
      const paths = this.git.existing(WRITABLE);
      if (!d.hasChanges || !(await this.git.status(paths)).length)
        return { status: "no_changes" as const, summary: "No unpublished changes." };
      const subject =
        (opts.message?.trim() || d.summary).split("\n")[0]?.slice(0, 200) ?? "Update content";
      await this.git.run(["add", "-A", "--", ...paths]);
      const env = await this.git.identityEnv();
      await this.git.run(
        [
          "commit",
          "-q",
          "-m",
          subject,
          "-m",
          `Agent: ${opts.actor} via openspace mcp`,
          "--",
          ...paths,
        ],
        { env },
      );
      const version = await this.git.out(["rev-parse", "HEAD"]);
      return {
        status: "published" as const,
        version,
        summary: subject,
        note: "Committed on the current branch. Push it (git push) and the publish workflow updates the live site.",
      };
    });
  }

  discardDraft(siteId: string, ctx: ApplyContext): Promise<DraftDiff> {
    this.check(siteId);
    return this.serial(async () => {
      const d = await this.getDraftDiff(siteId);
      if (!d.hasChanges) return d;
      if (this.hasGit) {
        const published = await this.publishedDoc();
        if (!published)
          throw new ToolError(
            "Nothing has been published yet, so there's no version to go back to.",
            "unsupported",
          );
        const tag = await this.git.snapshot(`before-discard-${this.now().getTime()}`, TRACKED);
        await this.restoreThroughOps(published, ctx.actor);
        await this.restoreMedia("HEAD");
        return { ...d, summary: `${d.summary} (saved as ${tag})` };
      }
      if (this.baseline) await this.restoreThroughOps(this.baseline, ctx.actor);
      return d;
    });
  }

  /** Put media files back as they are in `rev` (binary files; their metadata goes through ops). */
  private async restoreMedia(rev: string): Promise<void> {
    if (!existsSync(join(this.root, "media")) && !(await this.git.head())) return;
    await this.git.run(["checkout", "--end-of-options", rev, "--", "media"]).catch(() => undefined);
    await this.git.run(["clean", "-fdq", "--", "media"]).catch(() => undefined);
  }

  rollback(siteId: string, version: string, ctx: ApplyContext): Promise<PublishResult> {
    this.check(siteId);
    if (!this.hasGit) throw new ToolError("Rolling back needs git.", "unsupported");
    if (!VERSION_RE.test(version))
      throw new ToolError(
        `"${version}" is not a version id: use a commit id from list_versions (7–40 hex characters) or an os/snap/… tag.`,
        "invalid_arguments",
      );
    return this.serial(async () => {
      let sha: string;
      try {
        sha = await this.git.out([
          "rev-parse",
          "--verify",
          "--end-of-options",
          `${version}^{commit}`,
        ]);
      } catch {
        throw new ToolError(`No version "${version}". Call list_versions.`, "not_found");
      }
      const target = await this.publishedDoc(sha);
      if (!target) throw new ToolError(`Version ${version} has no site content.`, "not_found");
      const tag = await this.git.snapshot(`before-rollback-${this.now().getTime()}`, TRACKED);
      await this.restoreThroughOps(target, ctx.actor);
      await this.restoreMedia(sha);
      const paths = this.git.existing(WRITABLE);
      if (!(await this.git.status(paths)).length)
        return { status: "no_changes" as const, summary: "That version is what's already there." };
      await this.git.run(["add", "-A", "--", ...paths]);
      const subject = `Roll back content to ${sha.slice(0, 9)}`;
      await this.git.run(
        [
          "commit",
          "-q",
          "-m",
          subject,
          "-m",
          `Agent: ${ctx.actor} via openspace mcp\nUnpublished work saved as ${tag}`,
          "--",
          ...paths,
        ],
        { env: await this.git.identityEnv() },
      );
      return {
        status: "published" as const,
        version: await this.git.out(["rev-parse", "HEAD"]),
        summary: subject,
        note: `Earlier unpublished work is saved as ${tag}. Push to update the live site.`,
      };
    });
  }

  async listVersions(siteId: string, opts: { limit?: number } = {}): Promise<VersionInfo[]> {
    this.check(siteId);
    if (!this.hasGit || !(await this.git.head())) return [];
    const out = await this.git.out([
      "log",
      `-n${opts.limit ?? 20}`,
      "--format=%H%x1f%s%x1f%aI%x1f%an",
      "--",
      ...WRITABLE,
    ]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        const [version = "", summary = "", date = "", author = ""] = line.split("\u001f");
        return { version, summary, date, author, current: i === 0 };
      });
  }

  private previewServer(): Promise<PreviewServer> {
    this.preview ??= startPreviewServer(this.root, () => loadSiteDocument(this.root), {
      port: this.options.previewPort,
    });
    return this.preview;
  }

  async previewUrl(siteId: string, pagePath = "/"): Promise<string | null> {
    this.check(siteId);
    const { url } = await this.previewServer();
    return `${url}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;
  }

  async uploadImage(
    siteId: string,
    input: ImageUploadInput,
    ctx: ApplyContext,
  ): Promise<MediaMeta> {
    this.check(siteId);
    const prepared = await prepareImage(input, { resize: this.options.resize, now: this.now() });
    const abs = join(this.root, prepared.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, prepared.bytes);
    const op: Op = {
      op: "media.add",
      id: `media_${prepared.meta.id}`,
      actor: ctx.actor,
      ts: this.now().getTime(),
      path: prepared.meta.path,
      meta: prepared.meta,
    };
    const r = await this.applyOps(siteId, [op], ctx);
    if (!r.ok) {
      await rm(abs, { force: true });
      throw new ToolError(
        `The image could not be added: ${r.errors.map((e) => e.message).join("; ")}`,
      );
    }
    return prepared.meta;
  }

  async snapshot(siteId: string, name: string): Promise<string | null> {
    this.check(siteId);
    if (!this.hasGit) return null;
    return this.serial(() => this.git.snapshot(name, TRACKED));
  }

  async startSession(siteId: string, opts: { label: string }): Promise<AgentSession> {
    this.check(siteId);
    this.sessionSeq += 1;
    const sessionId = `local-${this.now().getTime().toString(36)}-${this.sessionSeq}`;
    let snapshot: string | null = null;
    if (this.hasGit) {
      // A failed snapshot must not block editing; the session just has no undo point.
      snapshot = await this.snapshot(siteId, `agent-${this.now().getTime()}`).catch(() => null);
    }
    return {
      sessionId,
      actor: `agent:${opts.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      snapshot,
    };
  }

  async endSession(): Promise<void> {}

  async screenshot(siteId: string, request: ScreenshotRequest): Promise<Screenshot> {
    this.check(siteId);
    if (!this.options.screenshotter)
      throw new ToolError("Screenshots are not available.", "unsupported");
    const doc = await loadSiteDocument(this.root);
    const page = doc.pages[request.pageId as never] as { slug: string } | undefined;
    const url = await this.previewUrl(siteId, page?.slug ? `/${page.slug}/` : "/");
    return this.options.screenshotter.capture(url as string, request);
  }

  async agentsMd(): Promise<string | null> {
    try {
      return await readFile(join(this.root, "AGENTS.md"), "utf8");
    } catch {
      return null;
    }
  }

  /** Stop the preview server and browser. */
  async close(): Promise<void> {
    await this.options.screenshotter?.close();
    if (this.preview) await (await this.preview).close();
    this.preview = undefined;
  }
}
