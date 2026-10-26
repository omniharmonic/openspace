/**
 * In-memory `SiteStore` for tests, demos and the Hub's dev mode. Drafts, published versions,
 * snapshots and media bytes live in maps; every edit is validated with `@openspace/ops`.
 */
import { blocksRegistry } from "@openspace/blocks";
import { diff, type Op, summarize, validateAll } from "@openspace/ops";
import type { BlockRegistry, MediaMeta, SiteDocument } from "@openspace/schema";
import { ToolError } from "./errors";
import { type ImageResizer, prepareImage } from "./images";
import type {
  AgentSession,
  ApplyContext,
  ApplyResult,
  DraftDiff,
  ImageUploadInput,
  PublishResult,
  Screenshot,
  ScreenshotRequest,
  SiteStore,
  SiteSummary,
  StoreCapabilities,
  TemplateCatalog,
  VersionInfo,
} from "./store";

interface Version {
  version: string;
  doc: SiteDocument;
  summary: string;
  date: string;
  author: string;
}

interface SiteState {
  draft: SiteDocument;
  published: SiteDocument;
  versions: Version[];
  snapshots: Map<string, SiteDocument>;
  media: Map<string, Uint8Array>;
  sessions: Map<string, { actor: string; snapshot: string; ended: boolean }>;
  log: { op: Op; actor: string; session?: string }[];
}

export interface MemorySiteStoreOptions {
  sites: Array<SiteDocument | { id?: string; doc: SiteDocument }>;
  registry?: BlockRegistry;
  fetch?: typeof fetch;
  resize?: ImageResizer;
  /** When set, `previewUrl` returns `<previewBaseUrl>/<siteId>/<path>`. */
  previewBaseUrl?: string;
  /** Screenshot provider (enables `capabilities.canScreenshot`). */
  screenshot?: (siteId: string, req: ScreenshotRequest) => Promise<Screenshot>;
  templates?: TemplateCatalog;
  now?: () => Date;
}

const clone = <T>(v: T): T => structuredClone(v);

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v as object)) deepFreeze(child);
  }
  return v;
}

export class MemorySiteStore implements SiteStore {
  readonly capabilities: StoreCapabilities;
  readonly templates?: TemplateCatalog;
  private readonly sites = new Map<string, SiteState>();
  private readonly registry: BlockRegistry;
  private seq = 0;

  constructor(private readonly options: MemorySiteStoreOptions) {
    this.registry = options.registry ?? blocksRegistry();
    this.templates = options.templates;
    this.capabilities = {
      canPublish: true,
      canScreenshot: Boolean(options.screenshot),
      canRollback: true,
      publishNote: "In-memory site: publishing records a version.",
    };
    for (const entry of options.sites) {
      const { id, doc } = "doc" in entry ? entry : { id: undefined, doc: entry };
      const siteId = id ?? doc.config.siteId;
      const now = this.now().toISOString();
      this.sites.set(siteId, {
        draft: clone(doc),
        published: clone(doc),
        versions: [
          {
            version: this.nextVersion(),
            doc: clone(doc),
            summary: "Initial",
            date: now,
            author: "owner",
          },
        ],
        snapshots: new Map(),
        media: new Map(),
        sessions: new Map(),
        log: [],
      });
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private nextVersion(): string {
    this.seq += 1;
    return `v${String(this.seq).padStart(4, "0")}`;
  }

  private state(siteId: string): SiteState {
    const s = this.sites.get(siteId);
    if (!s) throw new ToolError(`Unknown site "${siteId}".`, "not_found");
    return s;
  }

  /** Ops applied so far (tests). */
  opLog(siteId: string) {
    return this.state(siteId).log;
  }

  /** Bytes of an uploaded media file (tests). */
  mediaBytes(siteId: string, path: string): Uint8Array | undefined {
    return this.state(siteId).media.get(path);
  }

  async listSites(): Promise<SiteSummary[]> {
    return [...this.sites.entries()].map(([id, s]) => ({
      id,
      title: s.draft.site.title,
      url: s.draft.config.deploy.customDomain
        ? `https://${s.draft.config.deploy.customDomain}`
        : (s.draft.config.deploy.url ?? null),
    }));
  }

  /** A frozen copy: callers can't mutate the stored draft around the op pipeline. */
  async getDocument(siteId: string): Promise<SiteDocument> {
    return deepFreeze(clone(this.state(siteId).draft));
  }

  /** Restore `target`'s content through validated ops (`diff`), leaving `config` alone. */
  private restore(s: SiteState, target: SiteDocument, actor: string): void {
    const ops = diff(s.draft, target, { actor, ts: this.now().getTime(), idPrefix: "restore_" });
    if (!ops.length) return;
    const r = validateAll(s.draft, ops, { registry: this.registry });
    if (!r.ok)
      throw new ToolError(
        `Restoring failed at step ${r.index + 1} of ${ops.length} (${ops[r.index]?.op}): ${r.errors
          .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
          .join("; ")}`,
        "restore_failed",
        r.errors,
      );
    s.draft = r.doc;
    for (const op of ops) s.log.push({ op, actor });
  }

  async applyOps(siteId: string, ops: Op[], ctx: ApplyContext): Promise<ApplyResult> {
    const s = this.state(siteId);
    const r = validateAll(s.draft, ops, { registry: this.registry });
    if (!r.ok) return { ok: false, index: r.index, errors: r.errors, code: "invalid" };
    s.draft = r.doc;
    for (const op of ops) s.log.push({ op, actor: ctx.actor, session: ctx.session });
    return { ok: true, doc: r.doc, warnings: r.warnings };
  }

  private diffOf(s: SiteState): DraftDiff {
    const ops = diff(s.published, s.draft, { actor: "diff" });
    if (!ops.length) return { hasChanges: false, summary: "No unpublished changes." };
    return { hasChanges: true, summary: summarize(ops, s.published) };
  }

  async getDraftDiff(siteId: string): Promise<DraftDiff> {
    return this.diffOf(this.state(siteId));
  }

  async publish(siteId: string, opts: { message?: string; actor: string }): Promise<PublishResult> {
    const s = this.state(siteId);
    const d = this.diffOf(s);
    if (!d.hasChanges) return { status: "no_changes", summary: d.summary };
    const version = this.nextVersion();
    const summary = opts.message?.trim() || d.summary;
    s.versions.unshift({
      version,
      doc: clone(s.draft),
      summary,
      date: this.now().toISOString(),
      author: opts.actor,
    });
    s.published = clone(s.draft);
    return { status: "published", version, summary };
  }

  async discardDraft(siteId: string, ctx: ApplyContext): Promise<DraftDiff> {
    const s = this.state(siteId);
    const d = this.diffOf(s);
    this.restore(s, s.published, ctx.actor);
    return d;
  }

  async rollback(siteId: string, version: string, ctx: ApplyContext): Promise<PublishResult> {
    const s = this.state(siteId);
    const target = s.versions.find((v) => v.version === version);
    if (!target)
      throw new ToolError(
        `No version "${version}". Call list_versions to see the available versions.`,
        "not_found",
      );
    this.restore(s, target.doc, ctx.actor);
    const v = this.nextVersion();
    const summary = `Restored the version from ${target.date} (${target.summary})`;
    s.versions.unshift({
      version: v,
      doc: clone(s.draft),
      summary,
      date: this.now().toISOString(),
      author: ctx.actor,
    });
    s.published = clone(s.draft);
    return { status: "published", version: v, summary };
  }

  async listVersions(siteId: string, opts: { limit?: number } = {}): Promise<VersionInfo[]> {
    const s = this.state(siteId);
    return s.versions.slice(0, opts.limit ?? 20).map((v, i) => ({
      version: v.version,
      summary: v.summary,
      date: v.date,
      author: v.author,
      current: i === 0,
    }));
  }

  async previewUrl(siteId: string, pagePath = ""): Promise<string | null> {
    this.state(siteId);
    if (!this.options.previewBaseUrl) return null;
    return `${this.options.previewBaseUrl.replace(/\/$/, "")}/${siteId}/${pagePath.replace(/^\//, "")}`;
  }

  async uploadImage(
    siteId: string,
    input: ImageUploadInput,
    ctx: ApplyContext,
  ): Promise<MediaMeta> {
    const s = this.state(siteId);
    const prepared = await prepareImage(input, {
      fetch: this.options.fetch,
      resize: this.options.resize,
      now: this.now(),
    });
    const op: Op = {
      op: "media.add",
      id: `media_${prepared.meta.id}`,
      actor: ctx.actor,
      ts: this.now().getTime(),
      path: prepared.meta.path,
      meta: prepared.meta,
    };
    const r = await this.applyOps(siteId, [op], ctx);
    if (!r.ok)
      throw new ToolError(
        `The image could not be added: ${r.errors.map((e) => e.message).join("; ")}`,
      );
    s.media.set(prepared.path, prepared.bytes);
    return prepared.meta;
  }

  async snapshot(siteId: string, name: string): Promise<string | null> {
    const s = this.state(siteId);
    let tag = name;
    for (let n = 2; s.snapshots.has(tag); n++) tag = `${name}-${n}`;
    s.snapshots.set(tag, clone(s.draft));
    return `os/snap/${tag}`;
  }

  /** The document saved by `snapshot` (tests). */
  snapshotDoc(siteId: string, tag: string): SiteDocument | undefined {
    return this.state(siteId).snapshots.get(tag.replace(/^os\/snap\//, ""));
  }

  async startSession(siteId: string, _opts: { label: string }): Promise<AgentSession> {
    const s = this.state(siteId);
    this.seq += 1;
    const sessionId = `s${this.seq}`;
    const snapshot = await this.snapshot(siteId, `agent-${this.now().getTime()}`);
    const actor = `agent:${sessionId}`;
    s.sessions.set(sessionId, { actor, snapshot: snapshot ?? "", ended: false });
    return { sessionId, actor, snapshot };
  }

  async endSession(siteId: string, sessionId: string): Promise<void> {
    const sess = this.state(siteId).sessions.get(sessionId);
    if (sess) sess.ended = true;
  }

  /** Session bookkeeping (tests). */
  session(siteId: string, sessionId: string) {
    return this.state(siteId).sessions.get(sessionId);
  }

  async screenshot(siteId: string, request: ScreenshotRequest): Promise<Screenshot> {
    if (!this.options.screenshot)
      throw new ToolError("Screenshots are not available here.", "unsupported");
    return this.options.screenshot(siteId, request);
  }
}
