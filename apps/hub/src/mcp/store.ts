/**
 * `HubSiteStore` — the MCP tools' `SiteStore` over the Hub: every edit is submitted to the site's
 * DraftRoom as the connection's agent session (the same validated-op path as Studio, arch §10.3),
 * reads come from the room, publishing / rollback / snapshots run inside the room, and images go
 * through the server-side pipeline (SSRF-guarded fetch, size cap, metadata strip) into the repo.
 */
import {
  type AgentSession,
  type ApplyContext,
  type ApplyResult,
  type DraftDiff,
  type ImageResizer,
  type ImageUploadInput,
  imageSize,
  type PublishResult,
  prepareImage,
  type Screenshot,
  type ScreenshotRequest,
  type SiteStore,
  type SiteSummary,
  type StoreCapabilities,
  ToolError,
  type VersionInfo,
} from "@omniharmonic/openspace-mcp-tools";
import { diff, type Op, summarize } from "@omniharmonic/openspace-ops";
import type { MediaMeta, SiteDocument } from "@omniharmonic/openspace-schema";
import { getSiteForUser } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import type { HubBindings } from "../env";
import { MAIN_BRANCH, parseRepo } from "../github/types";
import { base64url } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { requireHmacKey } from "../public-env";
import { roomStub, unwrapRoom } from "../room";
import type { Services } from "../services";
import { gatedContext, readOpenedDocumentFiles } from "../services/gated-content";
import { listVersions, ROLLBACK_ROLE } from "../services/publishing";
import { consumeQuota, quotaExceeded, siteQuotaLimits } from "../services/quotas";
import { loadSiteDocument } from "../services/site-files";
import { type AgentSessionRef, type GrantSite, recordAgentSession } from "./db";
import { guardedFetch } from "./ssrf";

/** Optional screenshot provider (Browser Rendering in production; none locally). */
export interface ScreenshotProvider {
  capture(request: ScreenshotRequest): Promise<Screenshot>;
}

export interface HubSiteStoreOptions {
  env: HubBindings;
  services: Services;
  userId: string;
  /** Sites this connection reaches (with the person's live role). */
  sites: GrantSite[];
  /** MCP session this store serves, and the agent sessions it already opened. */
  mcpSessionId: string;
  agentSessions: Record<string, AgentSessionRef>;
  /** Server-side image resizer (Cloudflare Images binding when configured). */
  resize?: ImageResizer;
  screenshots?: ScreenshotProvider | null;
}

/** Turn a Hub error (from the room or a service) into an error the agent can act on. */
function toToolError(err: unknown): never {
  if (err instanceof ToolError) throw err;
  if (err instanceof HttpError) {
    const code =
      err.status === 403
        ? "forbidden"
        : err.status === 404
          ? "not_found"
          : err.status === 429
            ? "rate_limited"
            : err.status === 409
              ? "conflict"
              : "rejected";
    throw new ToolError(err.message, code);
  }
  throw err;
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return toToolError(err);
  }
}

/**
 * Agent session id for (MCP session, site): stable, so a retried start never forks a session,
 * and keyed (HMAC with the Hub secret) so it can't be derived from the visible MCP session id.
 */
export async function agentSessionIdFor(
  key: string,
  mcpSessionId: string,
  siteId: string,
): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      k,
      new TextEncoder().encode(`agent|${mcpSessionId}|${siteId}`),
    ),
  );
  return `mcp-${base64url(mac).slice(0, 32)}`;
}

const ROLE_RANK = { contributor: 1, editor: 2, designer: 3, owner: 4 } as const;

const sessionOf = (actor: string): string | undefined =>
  actor.startsWith("agent:") ? actor.slice("agent:".length) : undefined;

export class HubSiteStore implements SiteStore {
  readonly capabilities: StoreCapabilities;
  private readonly o: HubSiteStoreOptions;

  constructor(options: HubSiteStoreOptions) {
    this.o = options;
    this.capabilities = {
      canPublish: true,
      canScreenshot: Boolean(options.screenshots),
      canRollback: true,
      publishNote:
        "Publishing updates the live site; it is usually visible within a minute or two. Studio shows the progress.",
    };
  }

  private room(siteId: string) {
    return roomStub(this.o.env, siteId);
  }

  private site(siteId: string): GrantSite {
    const s = this.o.sites.find((x) => x.id === siteId);
    if (!s) throw new ToolError(`This connection can't reach site "${siteId}".`, "forbidden");
    return s;
  }

  /** One operation against the site's daily MCP quota (arch §8.4). */
  private async countOperation(siteId: string): Promise<void> {
    const { services } = this.o;
    const limits = await siteQuotaLimits(services.db, siteId, services.pub.quotaOverrides);
    const used = await consumeQuota(
      services.db,
      siteId,
      "mcpOperations",
      limits.mcpOperations,
      services.now(),
    );
    if (used === null) {
      const e = quotaExceeded("daily AI edit");
      throw new ToolError(e.message, "quota_exceeded");
    }
  }

  async listSites(): Promise<SiteSummary[]> {
    return this.o.sites.map((s) => ({ id: s.id, title: s.name, url: s.url }));
  }

  async getDocument(siteId: string): Promise<SiteDocument> {
    this.site(siteId);
    return wrap(async () => (await unwrapRoom(this.room(siteId).getDocument(siteId))).doc);
  }

  async applyOps(siteId: string, ops: Op[], ctx: ApplyContext): Promise<ApplyResult> {
    this.site(siteId);
    await this.countOperation(siteId);
    return this.submitAsAgent(siteId, ops, ctx);
  }

  /** Submit ops as the connection's agent session (the caller counted the operation). */
  private async submitAsAgent(siteId: string, ops: Op[], ctx: ApplyContext): Promise<ApplyResult> {
    if (!ctx.session) throw new ToolError("Edits need an agent session.", "invalid_session");
    return wrap(async () => {
      const r = await unwrapRoom(
        this.room(siteId).submit(siteId, {
          ops,
          atomic: true,
          actor: { userId: this.o.userId, kind: "agent", session: ctx.session },
        }),
      );
      if (r.rejected)
        return {
          ok: false,
          index: r.rejected.index,
          code: r.rejected.code,
          errors: r.rejected.errors?.length
            ? r.rejected.errors
            : [{ path: [], message: r.rejected.message }],
        };
      const failed = r.results.findIndex((x) => x.status !== "accepted");
      const bad = r.results[failed];
      if (bad && bad.status === "rejected")
        // Only possible if the document changed between the check and the apply; the ops before
        // it were applied (they stay in the agent session and can be undone from Studio).
        return {
          ok: false,
          index: failed,
          code: bad.code,
          errors: bad.errors?.length ? bad.errors : [{ path: [], message: bad.message }],
        };
      const warnings = r.results.flatMap((x) => (x.status === "accepted" ? x.warnings : []));
      return { ok: true, doc: await this.getDocument(siteId), warnings };
    });
  }

  private async published(siteId: string): Promise<SiteDocument> {
    const { services } = this.o;
    const site = await getSiteForUser(services.db, siteId, this.o.userId);
    if (!site) throw new ToolError("We couldn't find that site.", "not_found");
    const owner = await getUserRow(services.db, site.owner_id);
    const gh = services.github({ site, user: owner ? toUser(owner) : null });
    const repo = parseRepo(site.repo);
    const head = await gh.getRef(repo, MAIN_BRANCH);
    if (!head) throw new ToolError("This site isn't published yet.", "not_ready");
    const files = await readOpenedDocumentFiles(gatedContext(services, siteId), gh, repo, head);
    return loadSiteDocument(files);
  }

  async getDraftDiff(siteId: string): Promise<DraftDiff> {
    this.site(siteId);
    return wrap(async () => {
      const [draft, live] = await Promise.all([this.getDocument(siteId), this.published(siteId)]);
      const ops = diff(live, draft, { actor: "diff" });
      if (!ops.length) return { hasChanges: false, summary: "No unpublished changes." };
      return { hasChanges: true, summary: summarize(ops, live) };
    });
  }

  async publish(siteId: string, opts: { message?: string; actor: string }): Promise<PublishResult> {
    this.site(siteId);
    await this.countOperation(siteId);
    return wrap(async () => {
      const agentSession = sessionOf(opts.actor);
      const r = await unwrapRoom(
        this.room(siteId).publish(siteId, {
          userId: this.o.userId,
          actor: opts.actor,
          ...(agentSession ? { agentSession } : {}),
        }),
      );
      if (r.status === "no_changes")
        return { status: "no_changes", summary: "The draft matches the live site." };
      return {
        status: "published",
        ...(r.sha ? { version: r.sha } : {}),
        summary: r.summary ?? "Published changes",
        note: "The live site updates in a minute or two; Studio shows the progress.",
      };
    });
  }

  async discardDraft(siteId: string, ctx: ApplyContext): Promise<DraftDiff> {
    this.site(siteId);
    await this.countOperation(siteId);
    return wrap(async () => {
      const before = await this.getDraftDiff(siteId);
      if (!before.hasChanges) return before;
      await unwrapRoom(
        this.room(siteId).discardDraft(siteId, {
          userId: this.o.userId,
          ...(ctx.session ? { agentSession: ctx.session } : {}),
        }),
      );
      return before;
    });
  }

  async rollback(siteId: string, version: string, ctx: ApplyContext): Promise<PublishResult> {
    const site = this.site(siteId);
    // Same rule as Studio (ROLLBACK_ROLE): putting the live site back needs a designer or owner.
    if (ROLE_RANK[site.role] < ROLE_RANK[ROLLBACK_ROLE])
      throw new ToolError(
        `Going back to an earlier version needs a designer or the owner (your role: ${site.role}).`,
        "forbidden",
      );
    await this.countOperation(siteId);
    return wrap(async () => {
      const r = await unwrapRoom(
        this.room(siteId).rollback(siteId, {
          userId: this.o.userId,
          sha: version,
          ...(ctx.session ? { agentSession: ctx.session } : {}),
        }),
      );
      return {
        status: "published",
        version: r.sha,
        summary: r.summary,
        note: r.snapshot
          ? `Unpublished changes were kept in the snapshot "${r.snapshot.replace("os/snap/", "")}".`
          : undefined,
      };
    });
  }

  async listVersions(siteId: string, opts: { limit?: number } = {}): Promise<VersionInfo[]> {
    this.site(siteId);
    return wrap(async () => {
      const { services } = this.o;
      const site = await getSiteForUser(services.db, siteId, this.o.userId);
      if (!site) throw new ToolError("We couldn't find that site.", "not_found");
      const owner = await getUserRow(services.db, site.owner_id);
      const versions = await listVersions(
        services,
        site,
        owner ? toUser(owner) : null,
        opts.limit ?? 20,
      );
      return versions.map((v) => ({
        version: v.sha,
        summary: v.summary,
        date: v.date,
        author: v.author,
        current: v.current,
      }));
    });
  }

  async previewUrl(siteId: string, pagePath?: string): Promise<string | null> {
    this.site(siteId);
    const { config } = this.o.services;
    // The Hub serves draft previews in dev (no GitHub Pages); production drafts are seen in Studio.
    if (!config.useDevGitHub) return null;
    const path = pagePath ? `/${pagePath.replace(/^\/+/, "")}` : "/";
    return `${config.hubUrl}/p/${siteId}${path}`;
  }

  async uploadImage(
    siteId: string,
    input: ImageUploadInput,
    ctx: ApplyContext,
  ): Promise<MediaMeta> {
    this.site(siteId);
    const { services } = this.o;
    // One operation for the whole upload, counted before anything is fetched or stored.
    await this.countOperation(siteId);
    const prepared = await prepareImage(input, {
      fetch: guardedFetch(services.fetch, services.pub.dns),
      ...(this.o.resize ? { resize: this.o.resize } : {}),
      now: new Date(services.now()),
    });
    await wrap(() =>
      unwrapRoom(
        this.room(siteId).storeMedia(siteId, {
          userId: this.o.userId,
          path: prepared.path,
          bytes: prepared.bytes,
        }),
      ),
    );
    const op: Op = {
      op: "media.add",
      id: `media_${prepared.meta.id}`,
      actor: ctx.actor,
      ts: services.now(),
      path: prepared.meta.path,
      meta: prepared.meta,
    } as Op;
    const r = await this.submitAsAgent(siteId, [op], ctx);
    if (!r.ok)
      throw new ToolError(
        `The image was stored but couldn't be added to the library: ${r.errors.map((e) => e.message).join("; ")}`,
        "rejected",
      );
    return prepared.meta;
  }

  async snapshot(siteId: string, name: string): Promise<string | null> {
    this.site(siteId);
    await this.countOperation(siteId);
    return wrap(async () => (await unwrapRoom(this.room(siteId).snapshot(siteId, name))).tag);
  }

  async startSession(
    siteId: string,
    opts: { label: string; userId?: string },
  ): Promise<AgentSession> {
    this.site(siteId);
    const known = this.o.agentSessions[siteId];
    if (known) return known;
    return wrap(async () => {
      const r = await unwrapRoom(
        this.room(siteId).startAgentSession(siteId, {
          userId: this.o.userId,
          label: opts.label.slice(0, 40) || "Claude",
          sessionId: await agentSessionIdFor(
            requireHmacKey(this.o.services.pub.config),
            this.o.mcpSessionId,
            siteId,
          ),
        }),
      );
      const ref: AgentSessionRef = {
        sessionId: r.sessionId,
        actor: r.actor,
        snapshot: r.tag || null,
      };
      this.o.agentSessions[siteId] = ref;
      await recordAgentSession(this.o.services.db, this.o.mcpSessionId, siteId, ref);
      return ref;
    });
  }

  async endSession(siteId: string, sessionId: string): Promise<void> {
    this.site(siteId);
    await wrap(() =>
      unwrapRoom(this.room(siteId).endAgentSession(siteId, { userId: this.o.userId, sessionId })),
    );
  }

  async screenshot(siteId: string, request: ScreenshotRequest): Promise<Screenshot> {
    this.site(siteId);
    if (!this.o.screenshots)
      throw new ToolError("Screenshots aren't available on this Hub.", "unsupported");
    return this.o.screenshots.capture(request);
  }

  async agentsMd(siteId: string): Promise<string | null> {
    this.site(siteId);
    try {
      const { services } = this.o;
      const site = await getSiteForUser(services.db, siteId, this.o.userId);
      if (!site) return null;
      const owner = await getUserRow(services.db, site.owner_id);
      const gh = services.github({ site, user: owner ? toUser(owner) : null });
      return await gh.readFile(parseRepo(site.repo), "AGENTS.md", "os/draft");
    } catch {
      return null;
    }
  }
}

/** Cloudflare Images binding as the server-side resizer (≤ 2400 px long edge), when bound. */
export function imagesResizer(env: HubBindings): ImageResizer | undefined {
  const images = (env as { IMAGES?: ImagesLike }).IMAGES;
  if (!images) return undefined;
  return async (bytes, maxEdge) => {
    const out = await images
      .input(new Blob([bytes]).stream())
      .transform({ width: maxEdge, height: maxEdge, fit: "scale-down" })
      .output({ format: "image/webp", quality: 85 });
    const resized = new Uint8Array(await out.response().arrayBuffer());
    const size = imageSize(resized);
    if (!size) throw new ToolError("Couldn't resize that image.", "unsupported_image");
    return { bytes: resized, width: size.width, height: size.height };
  };
}

/** The subset of the Images binding used here. */
interface ImagesLike {
  input(stream: ReadableStream<Uint8Array>): {
    transform(t: Record<string, unknown>): {
      output(o: Record<string, unknown>): Promise<{ response(): Response }>;
    };
  };
}
