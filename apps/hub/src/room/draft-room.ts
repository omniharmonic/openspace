import { DurableObject } from "cloudflare:workers";
import { diff, type Op, type OpIssue, type Role } from "@omniharmonic/openspace-ops";
import type { DeployTarget, SiteDocument } from "@omniharmonic/openspace-schema";
import { audit } from "../db/audit";
import { insertPublish, latestPublish, type PublishRow, updatePublish } from "../db/publishes";
import { getSite, type SiteRow, type SiteStatus, updateSite } from "../db/sites";
import { getUserRow, toUser, type User } from "../db/users";
import { type HubBindings, readConfig } from "../env";
import type { InstallationTokenEntry } from "../github/app";
import {
  DRAFT_BRANCH,
  type GitHubAccess,
  GitHubConflictError,
  GitHubNotFoundError,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  parseRepo,
  type RepoRef,
  type WorkflowRun,
} from "../github/types";
import { bytesToBase64, canonicalJson, randomId, sha1Hex, sha256Hex } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { createLogger, type Logger } from "../lib/log";
import { buildErrorByCode } from "../services/build-errors";
import { readDocumentFiles } from "../services/document-files";
import {
  gatedContext,
  openFiles,
  readOpenedDocumentFiles,
  sealChanges,
  unsealedGatedPaths,
} from "../services/gated-content";
import { hostingChanges } from "../services/hosting";
import { createServices, type Services } from "../services/index";
import { assertPublishable, siteKitFiles } from "../services/publish-check";
import { recordNextScheduled } from "../services/site-automation";
import {
  CONFIG_PATH,
  diffSiteFiles,
  isContentPath,
  isPublishedPath,
  loadSiteDocument,
  SiteFilesError,
} from "../services/site-files";
import { syncWorkerSecretsSafely } from "../services/worker-secrets";
import { commitMessage, type TrailerActor, trailerEmail } from "./commit";
import {
  type BuildNotice,
  ClientMessageSchema,
  type ConflictNotice,
  type Member,
  type PublishActor,
  type ServerMessage,
  type SubmitResult,
} from "./protocol";
import { type ActorInfo, RoomState, type StoredOp } from "./state";

/** Flush to `os/draft` after this much idle time… */
export const FLUSH_IDLE_MS = 10_000;
/** …or as soon as this many ops are waiting. */
export const FLUSH_MAX_OPS = 50;
const FLUSH_RETRY_MS = 30_000;
/** How long an agent's "Claude is editing Home…" presence lasts after its last op. */
const AGENT_PRESENCE_MS = 30_000;

/** RPC result: a value, or a client-facing error (see `rpc`). */
export type RoomResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { status: number; code: string; message: string; details?: unknown } };

/** Who is submitting, as the Worker authenticated them. The room resolves names and roles. */
export interface RoomActorInput {
  userId: string;
  kind: "human" | "agent";
  /** MCP session id (agents). */
  session?: string;
  /** MCP client label, e.g. "Claude" (agents). */
  label?: string;
}

interface Attachment {
  client: string;
  userId: string;
  actor: string;
  name: string;
  /** Commit-trailer email, cached so ops don't re-read the user row. */
  email: string | null;
  role: Role;
  page: string | null;
  selection: string[];
}

/** Why an atomic batch was refused (nothing was applied). */
export interface AtomicRejection {
  index: number;
  code: "invalid" | "forbidden";
  message: string;
  errors?: OpIssue[];
}

export interface PublishResult {
  status: "published" | "no_changes";
  sha?: string;
  summary?: string;
  build?: WorkflowRun["state"];
  publishId?: string;
}

/**
 * The draft against the live site (`main`). Work can reach `main` without going through this
 * draft: Claude Code or the CLI committing and pushing, an edit on GitHub. Such a draft no longer
 * includes what's live, and publishing it as it is would quietly put the old content back.
 */
export interface LiveStatus {
  /**
   * The live site has content this draft wasn't started from, and the draft has changes of its
   * own: someone has to choose (use the live version, or keep the draft and replace it).
   */
  liveChanged: boolean;
  /** The draft differs from the live site (unpublished changes). */
  draftHasChanges: boolean;
  /** The draft had no changes of its own, so it was just moved to the live version. */
  followed: boolean;
  /** The live commit compared against. */
  liveSha: string | null;
}

/** Why `publish` refused a draft the live site changed underneath (see `LiveStatus`). */
export const LIVE_CHANGED_MESSAGE =
  "Your live site has newer changes that aren’t in this draft (they were published from somewhere else, like Claude). Publishing this draft would replace them, so it wasn’t published. To keep the live version, open the site in the OpenSpace editor and choose “Use the live version”. To replace it with this draft, choose “Publish anyway” there.";

/** Room meta: the live (`main`) commit the draft was last brought up to date with. */
const BASE_META = "base";

/**
 * What visitors see at a commit, as a comparable key: content and media files, and
 * `openspace.json` without what the Hub manages there (hosting, Hub address, service keys), so
 * a hosting switch or a custom domain committed on `main` doesn't count as new live content.
 */
export function contentKeyOf(
  tree: ReadonlyArray<{ path: string; sha: string }>,
  config: string | null,
): string {
  let settings = config ?? "";
  try {
    const parsed = JSON.parse(config ?? "null") as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object") {
      const { deploy: _d, hub: _h, integrations: _i, ...rest } = parsed;
      settings = canonicalJson(rest);
    }
  } catch {
    // Not JSON: compare the text.
  }
  const files = tree
    .filter((e) => isContentPath(e.path))
    .map((e) => `${e.path}:${e.sha}`)
    .sort()
    .join("\n");
  return `${settings}\n${files}`;
}

const ROLE_RANK: Record<Role, number> = { contributor: 1, editor: 2, designer: 3, owner: 4 };

/** Page an op works on (for "Claude is editing Home…"). */
function pageOfOp(op: Op): string | null {
  const o = op as { page?: unknown };
  if (typeof o.page === "string") return o.page;
  if (o.page && typeof o.page === "object" && "id" in o.page) return String(o.page.id);
  return null;
}

/**
 * `DraftRoom(siteId)` — the authoritative, ordered log of draft ops for one site (arch §5.3).
 *
 * Studio connects over a hibernatable WebSocket; MCP sessions call `submit`/`getDocument` over
 * RPC (or `POST /api/sites/:id/room/ops`). Accepted ops are persisted in SQLite immediately,
 * broadcast, and flushed as one commit to `os/draft` after 10 s idle or 50 ops. Publishing,
 * rollback and snapshots run here too so they are serialized with editing.
 */
export class DraftRoom extends DurableObject<HubBindings> {
  private readonly state: RoomState;
  private loading: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly agents = new Map<string, Member & { until: number }>();
  private readonly log: Logger;

  constructor(ctx: DurableObjectState, env: HubBindings) {
    super(ctx, env);
    this.state = new RoomState(ctx.storage.sql);
    this.log = createLogger(readConfig(env).logLevel, { do: "DraftRoom" });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // --- plumbing -----------------------------------------------------------------------------

  /**
   * Run an RPC method. Client-facing failures come back as values (`{ ok: false, error }`), not
   * exceptions: errors thrown across Durable Object RPC lose their class, and a thrown error
   * leaves the object in a state the test runner can't clean up. `unwrapRoom` re-throws them in
   * the Worker as `HttpError`s.
   */
  private async rpc<T>(fn: () => Promise<T>): Promise<RoomResult<T>> {
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      const http =
        err instanceof HttpError
          ? err
          : err instanceof GitHubConflictError
            ? new HttpError(
                409,
                "conflict",
                "Someone else changed this site at the same moment. Try again.",
              )
            : err instanceof GitHubNotFoundError
              ? new HttpError(404, "not_found", "We couldn't find that.")
              : null;
      if (!http) throw err;
      return {
        ok: false,
        error: {
          status: http.status,
          code: http.code,
          message: http.message,
          ...(http.details !== undefined ? { details: http.details } : {}),
        },
      };
    }
  }

  /** GitHub installation tokens, reused across this room's calls (1 hour lifetime). */
  private readonly installationTokens = new Map<number, InstallationTokenEntry>();

  private services(): Services {
    return createServices(this.env, readConfig(this.env), {
      installationTokens: this.installationTokens,
    });
  }

  private siteId(given?: string): string {
    const stored = this.state.getMeta("site_id");
    if (given) {
      if (stored && stored !== given) throw new Error("DraftRoom used for another site");
      if (!stored) this.state.setMeta("site_id", given);
      return given;
    }
    if (!stored) throw new Error("DraftRoom has no site yet");
    return stored;
  }

  private async site(services: Services, siteId: string): Promise<SiteRow> {
    const site = await getSite(services.db, siteId);
    if (!site || site.archived_at)
      throw new HttpError(404, "not_found", "We couldn't find that site.");
    return site;
  }

  /**
   * GitHub access for server-side work. Sites created through `/api/sites` have no installation
   * id (Spike S1), so the owner's user token is the fallback credential.
   */
  private async github(services: Services, site: SiteRow): Promise<GitHubAccess> {
    const ownerRow = await getUserRow(services.db, site.owner_id);
    return services.github({ site, user: ownerRow ? toUser(ownerRow) : null });
  }

  /** Serialize Git-touching work (flush, publish, rollback, snapshots). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readHead(
    gh: GitHubAccess,
    repo: RepoRef,
  ): Promise<{
    head: string;
    files: Record<string, string>;
    doc: SiteDocument;
    unsealed: string[];
  }> {
    let head = await gh.getRef(repo, DRAFT_BRANCH);
    if (!head) {
      const main = await gh.getRef(repo, MAIN_BRANCH);
      if (!main) throw new HttpError(404, "not_found", "This site has no content yet.");
      await gh.createBranch(repo, DRAFT_BRANCH, main).catch((err) => {
        if (!(err instanceof GitHubConflictError)) throw err;
      });
      head = (await gh.getRef(repo, DRAFT_BRANCH)) ?? main;
      // A new draft starts from what's live.
      if (head === main) this.state.setMeta(BASE_META, main);
    }
    // Gated pages are stubs in the repository; the room works on their full content.
    // One tree read + a GraphQL query per ~100 files, or nothing at all when this commit's
    // files are cached (a moved shop or blog has hundreds of files; see readDocumentFiles).
    const ctx = gatedContext(this.services(), this.siteId());
    const raw = await readDocumentFiles(gh, repo, head, { siteId: ctx.siteId, cache: ctx.cache });
    const files = await openFiles(ctx, raw);
    return { head, files, doc: loadSiteDocument(files), unsealed: unsealedGatedPaths(raw) };
  }

  /**
   * Gated pages committed with their content (before sealing existed, or by a direct commit):
   * remember them so the next flush seals them out of the repository, and flush soon.
   */
  private async noteUnsealed(paths: string[]): Promise<void> {
    if (!paths.length) return;
    this.state.setMeta("unsealed", JSON.stringify(paths));
    await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  private unsealed(): string[] {
    try {
      const v = JSON.parse(this.state.getMeta("unsealed") ?? "[]") as unknown;
      return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
    } catch {
      return [];
    }
  }

  private async ensureLoaded(siteId: string): Promise<void> {
    this.siteId(siteId);
    if (this.state.doc) return;
    this.loading ??= (async () => {
      if (this.state.loaded) {
        const failed = this.state.restore(loadSiteDocument(this.state.files()));
        if (failed.length)
          this.log.error("ops no longer apply after restart", { siteId, seqs: failed });
        return;
      }
      const services = this.services();
      const site = await this.site(services, siteId);
      const gh = await this.github(services, site);
      const { head, files, doc, unsealed } = await this.readHead(gh, parseRepo(site.repo));
      if (!this.state.doc) {
        this.state.rebaseOnHead(head, files, doc);
        await this.noteUnsealed(unsealed);
      }
    })().finally(() => {
      this.loading = null;
    });
    await this.loading;
  }

  private async resolveActor(services: Services, input: RoomActorInput): Promise<ActorInfo> {
    const row = await getUserRow(services.db, input.userId);
    if (!row) throw new HttpError(401, "unauthenticated", "Please sign in.");
    const user = toUser(row);
    const name = user.name ?? user.login;
    if (input.kind === "agent") {
      const session = input.session ?? "agent";
      return {
        actor: `agent:${session}`.slice(0, 128),
        userId: user.id,
        name: input.label ?? "Claude",
        email: null,
        kind: "agent",
        label: input.label ?? "Claude",
        session,
        onBehalfOf: name,
      };
    }
    return {
      actor: user.login,
      userId: user.id,
      name,
      email: trailerEmail(user),
      kind: "human",
    };
  }

  /** An agent session that `userId` started and that is still active (MCP impersonation guard). */
  private requireOwnSession(sessionId: string | undefined, userId: string) {
    const session = sessionId ? this.state.agentSession(sessionId) : null;
    if (!session || session.userId !== userId || session.endedAt || session.undoneAt)
      throw new HttpError(
        403,
        "invalid_session",
        "That AI session isn't active. Start a new one and try again.",
      );
    return session;
  }

  /** Ending or undoing a session: its owner, or an owner/designer of the site. */
  private async requireSessionControl(
    services: Services,
    siteId: string,
    sessionUserId: string,
    userId: string,
  ): Promise<Role> {
    const role = await this.roleOf(services, siteId, userId);
    if (!role || role === "contributor")
      throw new HttpError(403, "forbidden", "You don't have access to this.");
    if (sessionUserId !== userId && ROLE_RANK[role] < ROLE_RANK.designer)
      throw new HttpError(
        403,
        "forbidden",
        "Only the person who connected that AI can undo its changes.",
      );
    return role;
  }

  /** Role + personal locks from D1 (`site_roles`), mirrored into the room. */
  private async refreshRole(
    services: Services,
    siteId: string,
    userId: string,
  ): Promise<{ role: Role; locked: string[] } | null> {
    const row = await services.db
      .prepare("SELECT role, locked_sections FROM site_roles WHERE site_id = ? AND user_id = ?")
      .bind(siteId, userId)
      .first<{ role: Role; locked_sections: string | null }>();
    let locked: string[] = [];
    try {
      locked = row?.locked_sections ? (JSON.parse(row.locked_sections) as string[]) : [];
    } catch {
      locked = [];
    }
    this.state.setMember(userId, row?.role ?? null, locked);
    return row ? { role: row.role, locked } : null;
  }

  private async roleOf(services: Services, siteId: string, userId: string): Promise<Role | null> {
    return (
      this.state.member(userId)?.role ??
      (await this.refreshRole(services, siteId, userId))?.role ??
      null
    );
  }

  // --- broadcasting -------------------------------------------------------------------------

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  private attachment(ws: WebSocket): Attachment | null {
    try {
      return (ws.deserializeAttachment() as Attachment | null) ?? null;
    } catch {
      return null;
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }

  private broadcast(msg: ServerMessage, except?: string): void {
    const text = JSON.stringify(msg);
    for (const ws of this.sockets()) {
      if (except && this.attachment(ws)?.client === except) continue;
      try {
        ws.send(text);
      } catch {
        /* closed */
      }
    }
  }

  members(gone?: WebSocket): Member[] {
    const now = Date.now();
    const out: Member[] = [];
    for (const ws of this.sockets()) {
      if (ws === gone || ws.readyState === WebSocket.CLOSED) continue;
      const a = this.attachment(ws);
      if (!a) continue;
      out.push({
        client: a.client,
        actor: a.actor,
        userId: a.userId,
        name: a.name,
        kind: "human",
        role: a.role,
        page: a.page,
        selection: a.selection,
      });
    }
    for (const [key, m] of this.agents) {
      if (m.until < now) this.agents.delete(key);
      else {
        const { until: _u, ...member } = m;
        out.push(member);
      }
    }
    return out;
  }

  private broadcastPresence(gone?: WebSocket): void {
    this.broadcast({ type: "presence", members: this.members(gone) });
  }

  /** Deliver accepted ops and conflict notices; schedule the flush. */
  private async afterSubmit(
    services: Services,
    siteId: string,
    actor: ActorInfo,
    role: Role,
    client: string,
    results: SubmitResult[],
    sender?: WebSocket,
  ): Promise<void> {
    let accepted = 0;
    const saved: Op[] = [];
    for (const r of results) {
      const own: ConflictNotice[] = [];
      for (const n of r.conflicts) {
        const stored = n.opId === r.opId ? null : this.state.opById(n.opId);
        if (!stored) own.push(n);
        else for (const ws of this.ctx.getWebSockets(stored.actor)) this.send(ws, n); // the other author: "X changed this too"
      }
      if (r.status === "accepted") {
        if (sender)
          this.send(sender, {
            type: "ack",
            opId: r.opId,
            seq: r.seq,
            op: r.op,
            warnings: r.warnings,
          });
        if (!r.duplicate) {
          accepted++;
          this.broadcast(
            { type: "op", seq: r.seq, op: r.op, client, actor: actor.actor, kind: actor.kind },
            client,
          );
          saved.push(r.op);
        }
      } else if (sender)
        this.send(sender, {
          type: "reject",
          opId: r.opId,
          code: r.code,
          message: r.message,
          ...(r.errors ? { errors: r.errors } : {}),
        });
      if (sender) for (const n of own) this.send(sender, n);
    }
    if (actor.kind === "agent" && accepted) {
      const last = [...results].reverse().find((r) => r.status === "accepted");
      const pageId = last && last.status === "accepted" ? pageOfOp(last.op) : null;
      const title = pageId
        ? this.state.doc?.pages[pageId as keyof SiteDocument["pages"]]?.title
        : null;
      this.agents.set(actor.actor, {
        client,
        actor: actor.actor,
        userId: actor.userId,
        name: actor.name,
        kind: "agent",
        role,
        page: pageId,
        selection: [],
        activity: `${actor.name} is editing ${title ?? "your site"}…`,
        until: Date.now() + AGENT_PRESENCE_MS,
      });
      this.broadcastPresence();
    }
    if (accepted) await this.scheduleFlush();
    // D1 bookkeeping only after every result has been delivered.
    for (const op of saved) await this.trackApproval(services, siteId, actor, role, op);
  }

  /** Contributor approval queue: pending drafts by Contributors; resolved by editors' saves. */
  private async trackApproval(
    services: Services,
    siteId: string,
    actor: ActorInfo,
    role: Role,
    op: Op,
  ): Promise<void> {
    if (op.op !== "collection.upsert" && op.op !== "collection.delete") return;
    const now = Date.now();
    try {
      if (op.op === "collection.upsert" && role === "contributor") {
        await services.db
          .prepare(
            `INSERT INTO approvals (id, site_id, collection, slug, title, content_hash, submitted_by, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
             ON CONFLICT (site_id, collection, slug) WHERE status = 'pending'
             DO UPDATE SET title = excluded.title, content_hash = excluded.content_hash,
               submitted_by = excluded.submitted_by, updated_at = excluded.updated_at`,
          )
          .bind(
            randomId("apr"),
            siteId,
            op.collection,
            op.item.slug,
            op.item.frontmatter.title,
            await sha256Hex(canonicalJson(op.item)),
            actor.userId,
            now,
            now,
          )
          .run();
        return;
      }
      if (ROLE_RANK[role] < ROLE_RANK.editor) return;
      const slug = op.op === "collection.upsert" ? op.item.slug : op.slug;
      const status =
        op.op === "collection.delete"
          ? "rejected"
          : op.item.frontmatter.status !== "draft"
            ? "approved"
            : null;
      if (!status) return;
      await services.db
        .prepare(
          `UPDATE approvals SET status = ?, decided_by = ?, decided_at = ?, updated_at = ?
           WHERE site_id = ? AND collection = ? AND slug = ? AND status = 'pending'`,
        )
        .bind(status, actor.userId, now, now, siteId, op.collection, slug)
        .run();
    } catch (err) {
      this.log.warn("approval tracking failed", { siteId, err });
    }
  }

  private async scheduleFlush(): Promise<void> {
    const due =
      this.state.unflushedCount() >= FLUSH_MAX_OPS ? Date.now() : Date.now() + FLUSH_IDLE_MS;
    await this.ctx.storage.setAlarm(due);
  }

  // --- WebSocket ----------------------------------------------------------------------------

  /**
   * `GET /connect` — WebSocket upgrade, forwarded by the Worker after it authenticated the
   * person (`x-os-site`, `x-os-user`) and checked they have a role on the site.
   */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected a WebSocket", { status: 426 });
    const siteId = request.headers.get("x-os-site") ?? "";
    const userId = request.headers.get("x-os-user") ?? "";
    const services = this.services();
    await this.ensureLoaded(siteId);
    const access = await this.refreshRole(services, siteId, userId);
    if (!access) return new Response("Forbidden", { status: 403 });
    const actor = await this.resolveActor(services, { userId, kind: "human" });
    this.state.rememberActor(actor);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const attachment: Attachment = {
      client: randomId("cli", 12),
      userId,
      actor: actor.actor,
      name: actor.name,
      email: actor.email,
      role: access.role,
      page: null,
      selection: [],
    };
    this.ctx.acceptWebSocket(server, [userId, actor.actor]);
    server.serializeAttachment(attachment);

    const sinceRaw = new URL(request.url).searchParams.get("since");
    const since = sinceRaw === null ? null : Number(sinceRaw);
    const seq = this.state.seq;
    const canReplay =
      since !== null &&
      Number.isInteger(since) &&
      since <= seq &&
      since >= this.state.oldestSeq - 1;
    this.send(server, {
      type: "hello",
      you: { client: attachment.client, actor: actor.actor, role: access.role, name: actor.name },
      seq,
      head: this.state.head,
      ...(canReplay
        ? { ops: this.state.opsAfter(since as number).map((o) => this.state.toLogged(o)) }
        : { doc: this.state.doc as SiteDocument }),
      members: this.members(),
    });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = this.attachment(ws);
    if (!a) return ws.close(1011, "Lost session");
    let parsed: ReturnType<typeof ClientMessageSchema.safeParse>;
    try {
      parsed = ClientMessageSchema.safeParse(
        JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)),
      );
    } catch {
      return this.send(ws, { type: "error", message: "Messages must be JSON" });
    }
    if (!parsed.success) return this.send(ws, { type: "error", message: "Unknown message" });
    const msg = parsed.data;
    const siteId = this.siteId();
    const services = this.services();
    await this.ensureLoaded(siteId);

    if (msg.type === "presence") {
      a.page = msg.page ?? null;
      a.selection = msg.selection ?? [];
      ws.serializeAttachment(a);
      return this.broadcastPresence();
    }
    if (msg.type === "sync") {
      const since = msg.since ?? 0;
      if (since >= this.state.oldestSeq - 1)
        for (const o of this.state.opsAfter(since))
          this.send(ws, { type: "op", ...this.state.toLogged(o) });
      else
        this.send(ws, {
          type: "reload",
          seq: this.state.seq,
          head: this.state.head,
          doc: this.state.doc as SiteDocument,
          reason: "resync",
        });
      return;
    }

    const role = this.state.member(a.userId)?.role;
    if (!role) {
      this.send(ws, { type: "removed", message: "You no longer have access to this site." });
      return ws.close(4003, "No access");
    }
    const actor: ActorInfo = {
      actor: a.actor,
      userId: a.userId,
      name: a.name,
      email: a.email ?? null,
      kind: "human",
    };
    const ops = msg.type === "op" ? [msg.op] : msg.ops;
    const results = ops.map((op) =>
      this.state.submit({
        op,
        ...(msg.baseSeq !== undefined ? { baseSeq: msg.baseSeq } : {}),
        client: a.client,
        actor,
        role,
      }),
    );
    await this.afterSubmit(services, siteId, actor, role, a.client, results, ws);
    if (results.some((r) => r.status === "rejected" && r.code === "stale"))
      this.send(ws, {
        type: "reload",
        seq: this.state.seq,
        head: this.state.head,
        doc: this.state.doc as SiteDocument,
        reason: "stale",
      });
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
    this.broadcastPresence(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  // --- RPC: reading and submitting (Studio HTTP fallback, MCP) -------------------------------

  async getDocument(
    siteId: string,
  ): Promise<RoomResult<{ doc: SiteDocument; seq: number; head: string }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      return { doc: this.state.doc as SiteDocument, seq: this.state.seq, head: this.state.head };
    });
  }

  /**
   * Submit ops on behalf of an authenticated person or their agent. Same pipeline as the
   * WebSocket: server stamp → rebase over unseen ops → role (or own-undo) check → validate.
   * Without `baseSeq` the ops are taken as made against the current head.
   */
  async submit(
    siteId: string,
    input: {
      ops: unknown[];
      baseSeq?: number;
      client?: string;
      actor: RoomActorInput;
      /** All-or-nothing (MCP): check the whole batch first; on failure nothing is applied. */
      atomic?: boolean;
    },
  ): Promise<RoomResult<{ results: SubmitResult[]; seq: number; rejected?: AtomicRejection }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      const services = this.services();
      const role = await this.roleOf(services, siteId, input.actor.userId);
      if (!role) throw new HttpError(403, "forbidden", "You don't have access to this site.");
      let actorInput = input.actor;
      if (actorInput.kind === "agent") {
        const session = this.requireOwnSession(actorInput.session, actorInput.userId);
        actorInput = { ...actorInput, label: session.label };
      }
      const actor = await this.resolveActor(services, actorInput);
      if (input.atomic && input.baseSeq === undefined) {
        const dry = this.state.dryRun(input.ops, role, input.actor.userId);
        if (!dry.ok) return { results: [], seq: this.state.seq, rejected: dry };
      }
      const client = input.client ?? (actor.kind === "agent" ? actor.actor : `rpc:${actor.actor}`);
      const results = input.ops.map((op) =>
        this.state.submit({
          op,
          ...(input.baseSeq !== undefined ? { baseSeq: input.baseSeq } : {}),
          client,
          actor,
          role,
        }),
      );
      await this.afterSubmit(services, siteId, actor, role, client, results);
      return { results, seq: this.state.seq };
    });
  }

  /** Apply server-made ops (snapshot restore, approvals) as `userId`, skipping role checks. */
  async applyTrusted(
    siteId: string,
    userId: string,
    ops: Op[],
  ): Promise<RoomResult<{ results: SubmitResult[]; seq: number }>> {
    return this.rpc(() => this.applyTrustedOps(siteId, userId, ops));
  }

  private async applyTrustedOps(
    siteId: string,
    userId: string,
    ops: Op[],
    agentSession?: string,
  ): Promise<{ results: SubmitResult[]; seq: number }> {
    await this.ensureLoaded(siteId);
    const services = this.services();
    const role = await this.roleOf(services, siteId, userId);
    if (!role) throw new HttpError(403, "forbidden", "You don't have access to this site.");
    // Server-made ops on behalf of an AI session are that session's ops ("Undo all of Claude's").
    const session = agentSession ? this.requireOwnSession(agentSession, userId) : null;
    const actor = await this.resolveActor(
      services,
      session
        ? { userId, kind: "agent", session: session.id, label: session.label }
        : { userId, kind: "human" },
    );
    const client = session ? actor.actor : `server:${actor.actor}`;
    const results = ops.map((op) => this.state.submit({ op, client, actor, role, trusted: true }));
    await this.afterSubmit(services, siteId, actor, role, client, results);
    return { results, seq: this.state.seq };
  }

  /** Ops that turn the draft into `target` (e.g. a snapshot), applied as `userId`. */
  async restoreDocument(
    siteId: string,
    userId: string,
    target: SiteDocument,
  ): Promise<RoomResult<{ applied: number; failed: number; seq: number }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      const ops = diff(this.state.doc as SiteDocument, target, {
        actor: "restore",
        ts: Date.now(),
        idPrefix: `restore-${Date.now().toString(36)}-`,
      });
      const { results, seq } = await this.applyTrustedOps(siteId, userId, ops);
      return {
        applied: results.filter((r) => r.status === "accepted").length,
        failed: results.filter((r) => r.status !== "accepted").length,
        seq,
      };
    });
  }

  /**
   * "Discard changes": turn the draft back into what is live (main), as ordinary ops from the
   * person discarding — undoable, and broadcast like any edit. Designer or owner only.
   */
  async discardDraft(
    siteId: string,
    input: { userId: string; agentSession?: string },
  ): Promise<RoomResult<{ applied: number; failed: number; seq: number; hadChanges: boolean }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      const services = this.services();
      const role = await this.roleOf(services, siteId, input.userId);
      if (!role) throw new HttpError(403, "forbidden", "You don't have access to this site.");
      if (ROLE_RANK[role] < ROLE_RANK.designer)
        throw new HttpError(
          403,
          "forbidden",
          "Discarding everyone's unpublished changes needs a designer or the owner.",
        );
      const site = await this.site(services, siteId);
      const gh = await this.github(services, site);
      const repo = parseRepo(site.repo);
      const main = await gh.getRef(repo, MAIN_BRANCH);
      if (!main) throw new HttpError(409, "not_ready", "This site isn't published yet.");
      const files = await readOpenedDocumentFiles(gatedContext(services, siteId), gh, repo, main);
      const target = loadSiteDocument(files);
      const ops = diff(this.state.doc as SiteDocument, target, {
        actor: "discard",
        ts: Date.now(),
        idPrefix: `discard-${Date.now().toString(36)}-`,
      });
      if (!ops.length) {
        // Nothing to undo in the document, yet the draft's files can still differ from live
        // (written differently, or files the editor doesn't show): make the draft exactly live,
        // so it never stays "unpublished" with nothing to discard.
        const leveled = await this.exclusive(async () => {
          await this.flushLocked(siteId);
          if (this.state.unflushedCount() > 0) return false;
          const live = await gh.getRef(repo, MAIN_BRANCH);
          const head = this.state.head;
          if (!live || live === head) return false;
          if (!(await this.resetDraftIfAt(gh, repo, head, live))) return false;
          this.state.setMeta(BASE_META, live);
          this.state.markPublished(this.state.flushedSeq);
          await this.reloadFromHead(gh, repo, "The editor shows exactly what’s live now.");
          return true;
        });
        return { applied: 0, failed: 0, seq: this.state.seq, hadChanges: leveled };
      }
      const { results, seq } = await this.applyTrustedOps(
        siteId,
        input.userId,
        ops,
        input.agentSession,
      );
      const applied = results.filter((r) => r.status === "accepted").length;
      await audit(services.db, {
        siteId,
        actor: input.agentSession ? `agent:${input.agentSession}` : input.userId,
        action: "site.discard",
        meta: { ops: ops.length, applied },
      });
      return { applied, failed: results.length - applied, seq, hadChanges: true };
    });
  }

  /**
   * Store a media file in the site (Studio uploads, MCP `upload_image`): one commit on the draft,
   * serialized with flushes so the room's head stays exact. The document entry (`media.add`) is
   * a separate op by the uploader. `existed` when the draft already has these exact bytes there.
   */
  async storeMedia(
    siteId: string,
    input: { userId: string; path: string; bytes: Uint8Array },
  ): Promise<RoomResult<{ head: string; existed: boolean }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      if (
        !/^media\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(input.path) ||
        input.path.includes("..")
      )
        throw new HttpError(400, "bad_request", "That file name isn't allowed.");
      const services = this.services();
      const role = await this.roleOf(services, siteId, input.userId);
      if (!role || ROLE_RANK[role] < ROLE_RANK.editor)
        throw new HttpError(
          403,
          "forbidden",
          "Adding files needs an editor, designer or the owner.",
        );
      const user = await this.userFor(services, input.userId);
      return this.exclusive(async () => {
        await this.flushLocked(siteId);
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const repo = parseRepo(site.repo);
        const header = new TextEncoder().encode(`blob ${input.bytes.length}\0`);
        const blob = new Uint8Array(header.length + input.bytes.length);
        blob.set(header);
        blob.set(input.bytes, header.length);
        const blobSha = await sha1Hex(blob);
        const tree = await gh.readTree(repo, this.state.head);
        if (tree.some((e) => e.path === input.path && e.sha === blobSha))
          return { head: this.state.head, existed: true };
        const name = input.path.split("/").pop() ?? input.path;
        const commitOnce = () =>
          gh.commitFiles(repo, {
            branch: DRAFT_BRANCH,
            files: [{ path: input.path, content: bytesToBase64(input.bytes), encoding: "base64" }],
            message: `Added ${name}`,
            expectedHead: this.state.head,
            author: { name: user?.name ?? user?.login ?? "OpenSpace" },
          });
        let commit: Awaited<ReturnType<typeof commitOnce>>;
        try {
          commit = await commitOnce();
        } catch (err) {
          if (!(err instanceof GitHubConflictError)) throw err;
          await this.reloadFromHead(
            gh,
            repo,
            "The draft changed elsewhere; merged the latest version.",
          );
          await this.flushLocked(siteId);
          commit = await commitOnce();
        }
        this.state.setMeta("head", commit.sha);
        this.broadcast({ type: "flushed", seq: this.state.flushedSeq, head: commit.sha });
        return { head: commit.sha, existed: false };
      });
    });
  }

  /**
   * Switch hosting (owner): the hosting files change on the draft and on main in two commits
   * (unpublished content stays unpublished), the room reloads its config, and the live site is
   * rebuilt with the new target.
   */
  async switchHosting(
    siteId: string,
    input: { userId: string; target: DeployTarget; url?: string; message?: string },
  ): Promise<RoomResult<{ sha: string | null; changed: boolean }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      const services = this.services();
      const role = await this.roleOf(services, siteId, input.userId);
      if (role !== "owner")
        throw new HttpError(403, "forbidden", "Only the owner can change hosting.");
      return this.exclusive(async () => {
        await this.flushLocked(siteId);
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const repo = parseRepo(site.repo);
        const user = await this.userFor(services, input.userId);
        const label = input.target === "cloudflare" ? "Cloudflare" : "GitHub Pages";
        const message = input.message ?? `Switched hosting to ${label}`;
        const author = { name: user?.name ?? user?.login ?? "OpenSpace" };
        // Main first (what's live), then the draft. Each step recomputes its changes from the
        // branch's current files and retries once on a concurrent commit, so a repeated switch
        // finishes whatever an interrupted one left (the changes are idempotent).
        let sha: string | null = null;
        for (let attempt = 0; ; attempt++) {
          const mainHead = await gh.getRef(repo, MAIN_BRANCH);
          if (!mainHead) break;
          const mainChanges = await hostingChanges(
            (path) => gh.readFile(repo, path, mainHead),
            input.target,
            repo.name,
            { url: input.url },
          );
          if (!mainChanges.length) break;
          try {
            const commit = await gh.commitFiles(repo, {
              branch: MAIN_BRANCH,
              files: mainChanges,
              message,
              expectedHead: mainHead,
              author,
            });
            sha = commit.sha;
            await this.recordPublish(services, gh, site, {
              kind: "publish",
              sha,
              prev: mainHead,
              summary: message,
              actor: input.userId,
              by: this.publishActor(user),
            });
            break;
          } catch (err) {
            if (!(err instanceof GitHubConflictError) || attempt > 0) throw err;
          }
        }
        let draftChanged = false;
        for (let attempt = 0; ; attempt++) {
          const draftChanges = await hostingChanges(
            (path) => gh.readFile(repo, path, this.state.head),
            input.target,
            repo.name,
            { url: input.url },
          );
          if (!draftChanges.length) break;
          try {
            await gh.commitFiles(repo, {
              branch: DRAFT_BRANCH,
              files: draftChanges,
              message,
              expectedHead: this.state.head,
              author,
            });
            draftChanged = true;
            await this.reloadFromHead(gh, repo, "Hosting changed.");
            break;
          } catch (err) {
            if (!(err instanceof GitHubConflictError) || attempt > 0) throw err;
            await this.reloadFromHead(
              gh,
              repo,
              "The draft changed elsewhere; merged the latest version.",
            );
            await this.flushLocked(siteId);
          }
        }
        await updateSite(services.db, siteId, { deploy_target: input.target }, services.now());
        await audit(services.db, {
          siteId,
          actor: input.userId,
          action: "site.hosting",
          meta: { target: input.target, sha },
        });
        return { sha, changed: draftChanged || sha !== null };
      });
    });
  }

  /** Re-read a member's role (after invites, role changes, removal) and update live sockets. */
  async refreshMember(siteId: string, userId: string): Promise<RoomResult<void>> {
    return this.rpc(async () => {
      this.siteId(siteId);
      const access = await this.refreshRole(this.services(), siteId, userId);
      for (const ws of this.ctx.getWebSockets(userId)) {
        const a = this.attachment(ws);
        if (!a) continue;
        if (!access) {
          this.send(ws, { type: "removed", message: "You no longer have access to this site." });
          ws.close(4003, "No access");
        } else {
          a.role = access.role;
          ws.serializeAttachment(a);
        }
      }
      this.broadcastPresence();
    });
  }

  /**
   * A hosted import (or a conversion) replaced the site's content on main: the draft starts over
   * from that commit and everyone in the room reloads. Edits made to the placeholder are dropped.
   */
  async adoptImport(siteId: string, sha: string): Promise<RoomResult<{ head: string }>> {
    return this.rpc(async () => {
      this.siteId(siteId);
      return this.exclusive(async () => {
        const services = this.services();
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const repo = parseRepo(site.repo);
        await gh.resetBranch(repo, DRAFT_BRANCH, sha);
        this.state.setMeta(BASE_META, sha);
        if (this.state.doc) await this.reloadFromHead(gh, repo, "Your imported site is ready.");
        return { head: sha };
      });
    });
  }

  /** Build status (from the `workflow_run` webhook) pushed to everyone in the room. */
  async notifyBuild(siteId: string, notice: BuildNotice): Promise<void> {
    this.siteId(siteId);
    this.broadcast(notice);
  }

  // --- flushing -----------------------------------------------------------------------------

  override async alarm(): Promise<void> {
    const siteId = this.state.getMeta("site_id");
    if (!siteId) return;
    try {
      await this.ensureLoaded(siteId);
      await this.exclusive(() => this.flushLocked(siteId));
    } catch (err) {
      this.log.error("draft flush failed", { siteId, err });
      await this.ctx.storage.setAlarm(Date.now() + FLUSH_RETRY_MS);
    }
  }

  /** Commit unflushed ops to `os/draft` now. Returns the draft head. */
  async flush(
    siteId: string,
  ): Promise<RoomResult<{ head: string; seq: number; committed: boolean }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      return this.exclusive(() => this.flushLocked(siteId));
    });
  }

  private trailerActors(ops: readonly StoredOp[]): TrailerActor[] {
    const seen = new Map<string, TrailerActor>();
    for (const o of ops) {
      if (seen.has(o.actor)) continue;
      const a = this.state.actor(o.actor);
      if (!a) continue;
      seen.set(o.actor, {
        name: a.name,
        email: a.email,
        kind: a.kind,
        label: a.label,
        onBehalfOf: a.forName,
        session: o.session,
      });
    }
    return [...seen.values()];
  }

  private async flushLocked(
    siteId: string,
    attempt = 0,
  ): Promise<{ head: string; seq: number; committed: boolean }> {
    const upTo = this.state.seq;
    const from = this.state.flushedSeq;
    const unsealed = this.unsealed();
    if (from >= upTo && !unsealed.length)
      return { head: this.state.head, seq: upTo, committed: false };
    const doc = this.state.doc as SiteDocument;
    const ops = this.state.opsAfter(from).filter((o) => o.seq <= upTo);
    const changes = diffSiteFiles(this.state.files(), doc);
    // Re-commit gated pages whose content is still in the repository: sealing turns them into stubs.
    const current = this.state.files();
    for (const path of unsealed)
      if (current[path] !== undefined && !changes.some((c) => c.path === path))
        changes.push({ path, content: current[path] as string });
    if (!changes.length) {
      this.state.markFlushed(upTo);
      this.state.setMeta("unsealed", "[]");
      return { head: this.state.head, seq: upTo, committed: false };
    }
    const before = this.state.docAt(from) ?? doc;
    const actors = this.trailerActors(ops);
    const message = ops.length
      ? commitMessage(
          ops.map((o) => o.op),
          before,
          actors,
        ).message
      : "Moved members-only page content out of the site files";
    const services = this.services();
    const site = await this.site(services, siteId);
    const gh = await this.github(services, site);
    const repo = parseRepo(site.repo);
    const firstHuman = actors.find((a) => a.kind === "human");
    try {
      // Members-only / password page content never goes into the repository (PRD §7.3).
      const sealed = await sealChanges(gatedContext(services, siteId), changes);
      const commit = await gh.commitFiles(repo, {
        branch: DRAFT_BRANCH,
        files: sealed,
        message,
        expectedHead: this.state.head,
        author: { name: firstHuman?.name ?? "OpenSpace" },
      });
      this.state.applyFileChanges(changes);
      this.state.setMeta("head", commit.sha);
      this.state.setMeta("unsealed", "[]");
      this.state.markFlushed(upTo);
      this.state.prune();
      this.broadcast({ type: "flushed", seq: upTo, head: commit.sha });
      return { head: commit.sha, seq: upTo, committed: true };
    } catch (err) {
      if (
        attempt > 1 ||
        !(err instanceof GitHubConflictError || err instanceof GitHubNotFoundError)
      )
        throw err;
      // The draft moved underneath us (offline-mode commit from Studio, a push): rebase the
      // unflushed ops onto the new head and try again.
      await this.reloadFromHead(
        gh,
        repo,
        "The draft changed elsewhere; merged the latest version.",
      );
      return this.flushLocked(siteId, attempt + 1);
    }
  }

  /**
   * Make sure the room is based on the actual `os/draft` head (commits can land there directly:
   * offline-mode Studio, the CLI) and everything is flushed, before publish/rollback use it.
   */
  private async syncDraft(siteId: string, gh: GitHubAccess, repo: RepoRef): Promise<string> {
    const actual = await gh.getRef(repo, DRAFT_BRANCH);
    if (actual && actual !== this.state.head)
      await this.reloadFromHead(
        gh,
        repo,
        "The draft changed elsewhere; merged the latest version.",
      );
    await this.flushLocked(siteId);
    return this.state.head;
  }

  /** Move `os/draft` to `sha` only if it is still at `expected`; otherwise reload from it. */
  private async resetDraftIfAt(
    gh: GitHubAccess,
    repo: RepoRef,
    expected: string,
    sha: string,
  ): Promise<boolean> {
    const current = await gh.getRef(repo, DRAFT_BRANCH);
    if (current !== expected) return false;
    await gh.resetBranch(repo, DRAFT_BRANCH, sha);
    return true;
  }

  /** Re-read the draft head, replay unflushed ops on it, tell everyone to reload. */
  private async reloadFromHead(gh: GitHubAccess, repo: RepoRef, reason: string): Promise<void> {
    const { head, files, doc, unsealed } = await this.readHead(gh, repo);
    const dropped = this.state.rebaseOnHead(head, files, doc);
    await this.noteUnsealed(unsealed);
    if (dropped.length) this.log.warn("ops dropped on reload", { count: dropped.length });
    this.broadcast({
      type: "reload",
      seq: this.state.seq,
      head,
      doc: this.state.doc as SiteDocument,
      reason,
    });
  }

  // --- publishing ---------------------------------------------------------------------------

  /** Remember when the next scheduled post/event of what just went live is due (cron rebuild). */
  private async noteScheduled(services: Services, siteId: string, doc: SiteDocument) {
    try {
      await recordNextScheduled(services, siteId, doc);
    } catch (err) {
      this.log.warn("recording scheduled items failed", { siteId, err });
    }
  }

  private async sameTree(
    gh: GitHubAccess,
    repo: RepoRef,
    a: string,
    b: string,
    only: (path: string) => boolean = () => true,
  ): Promise<boolean> {
    if (a === b) return true;
    const [ta, tb] = await Promise.all([gh.readTree(repo, a), gh.readTree(repo, b)]);
    const key = (t: typeof ta) =>
      t
        .filter((e) => only(e.path))
        .map((e) => `${e.path}:${e.sha}`)
        .sort()
        .join("\n");
    return key(ta) === key(tb);
  }

  /** The `published` frame's actor: the person, or their AI session when an agent published. */
  private publishActor(user: User | null, agentSession?: string): PublishActor {
    const session = agentSession ? this.state.agentSession(agentSession) : null;
    if (session)
      return {
        userId: session.userId,
        name: session.label,
        kind: "agent",
        session: session.id,
      };
    return {
      userId: user?.id ?? null,
      name: user ? (user.name ?? user.login) : "OpenSpace",
      kind: "human",
    };
  }

  private async userFor(services: Services, userId: string | null): Promise<User | null> {
    if (!userId) return null;
    const row = await getUserRow(services.db, userId);
    return row ? toUser(row) : null;
  }

  /**
   * After a new commit on main: dispatch the workflow in dev (real GitHub runs it on push),
   * record the publish, update the site status and tell the room.
   */
  private async recordPublish(
    services: Services,
    gh: GitHubAccess,
    site: SiteRow,
    entry: {
      kind: PublishRow["kind"];
      sha: string;
      prev: string | null;
      summary: string;
      actor: string;
      by: PublishActor;
    },
  ): Promise<{ publish: PublishRow; run: WorkflowRun }> {
    const repo = parseRepo(site.repo);
    // Every commit the Hub puts on main (publish, rollback, fix, hosting) is one the draft knows
    // about: the draft was published, follows it, or deliberately keeps its changes.
    this.state.setMeta(BASE_META, entry.sha);
    if (gh.kind === "dev")
      await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
    let run: WorkflowRun = { state: "queued" };
    try {
      const latest = await gh.workflowStatus(repo, {
        workflow: PUBLISH_WORKFLOW,
        ref: MAIN_BRANCH,
      });
      if (latest.sha === entry.sha) run = latest;
    } catch (err) {
      this.log.warn("workflow status failed", { siteId: site.id, err });
    }
    const status = run.state === "none" ? "queued" : run.state;
    const now = services.now();
    const publish = await insertPublish(
      services.db,
      {
        site_id: site.id,
        kind: entry.kind,
        sha: entry.sha,
        prev_sha: entry.prev,
        summary: entry.summary,
        actor: entry.actor,
        status,
        run_url: run.url ?? null,
      },
      now,
    );
    const siteStatus: SiteStatus =
      status === "success" ? "live" : status === "failure" ? "failed" : "building";
    await updateSite(services.db, site.id, { status: siteStatus, status_detail: null }, now);
    this.broadcast({
      type: "published",
      sha: entry.sha,
      summary: entry.summary,
      kind: entry.kind,
      actor: entry.by,
    });
    this.broadcast({
      type: "build",
      state: status,
      sha: entry.sha,
      kind: entry.kind,
      summary: entry.summary,
      url: siteStatus === "live" ? site.url : null,
      error: null,
    });
    return { publish, run };
  }

  /** Content keys by commit (a commit's tree never changes). */
  private readonly contentKeys = new Map<string, string>();
  /** Whether two JSON blobs say the same thing, by `blobA:blobB` (blobs never change). */
  private readonly sameBlobs = new Map<string, boolean>();

  /**
   * Do two commits show visitors the same site? Equal content keys say so cheaply; otherwise the
   * content files that differ are compared by what they say, not how they're written — Claude
   * Code, the CLI and the Hub format the same JSON differently, and that alone is no change.
   */
  private async sameContent(gh: GitHubAccess, repo: RepoRef, a: string, b: string) {
    if (a === b) return true;
    const [ka, kb] = await Promise.all([
      this.contentKey(gh, repo, a),
      this.contentKey(gh, repo, b),
    ]);
    if (ka === kb) return true;
    const [settingsA, ...filesA] = ka.split("\n");
    const [settingsB, ...filesB] = kb.split("\n");
    if (settingsA !== settingsB || filesA.length !== filesB.length) return false;
    const blobsB = new Map(filesB.map((l) => [l.slice(0, l.lastIndexOf(":")), l]));
    const differing: Array<{ path: string; blobA: string; blobB: string }> = [];
    for (const line of filesA) {
      const path = line.slice(0, line.lastIndexOf(":"));
      const other = blobsB.get(path);
      if (other === undefined) return false;
      if (other === line) continue;
      if (!path.endsWith(".json")) return false;
      differing.push({
        path,
        blobA: line.slice(line.lastIndexOf(":") + 1),
        blobB: other.slice(other.lastIndexOf(":") + 1),
      });
    }
    // Many reads for one check: past this, call it changed rather than spend them.
    if (differing.length > 200) return false;
    const same = await Promise.all(
      differing.map(async ({ path, blobA, blobB }) => {
        const pair = `${blobA}:${blobB}`;
        const known = this.sameBlobs.get(pair);
        if (known !== undefined) return known;
        const [ta, tb] = await Promise.all([
          gh.readFile(repo, path, a),
          gh.readFile(repo, path, b),
        ]);
        let equal = false;
        try {
          equal =
            ta !== null &&
            tb !== null &&
            canonicalJson(JSON.parse(ta)) === canonicalJson(JSON.parse(tb));
        } catch {
          // Not valid JSON on one side: a real difference.
        }
        if (this.sameBlobs.size > 2048) this.sameBlobs.clear();
        this.sameBlobs.set(pair, equal);
        return equal;
      }),
    );
    return same.every(Boolean);
  }

  private async contentKey(gh: GitHubAccess, repo: RepoRef, sha: string): Promise<string> {
    const known = this.contentKeys.get(sha);
    if (known !== undefined) return known;
    const [tree, config] = await Promise.all([
      gh.readTree(repo, sha),
      gh.readFile(repo, CONFIG_PATH, sha),
    ]);
    const key = contentKeyOf(tree, config);
    if (this.contentKeys.size > 64) this.contentKeys.clear();
    this.contentKeys.set(sha, key);
    return key;
  }

  /**
   * Compare the draft with the live site (see `LiveStatus`). Call inside `exclusive`. When the
   * live site moved on and the draft has no changes of its own, the draft follows it (everyone
   * in the room reloads); when the draft does have changes, `liveChanged` is reported and
   * nothing changes.
   */
  private async checkLive(
    services: Services,
    siteId: string,
    gh: GitHubAccess,
    repo: RepoRef,
  ): Promise<LiveStatus> {
    const mainHead = await gh.getRef(repo, MAIN_BRANCH);
    const unflushed = this.state.unflushedCount() > 0;
    const quiet = { liveChanged: false, followed: false, liveSha: mainHead };
    if (!mainHead) return { ...quiet, draftHasChanges: true };
    const head = this.state.head;
    const draftIsLive = await this.sameContent(gh, repo, mainHead, head);
    if (!unflushed && draftIsLive) {
      // Same content (published, discarded, or brought up to date): the draft is current.
      this.state.setMeta(BASE_META, mainHead);
      return { ...quiet, draftHasChanges: false };
    }
    // Rooms from before the base was recorded: the last commit the Hub put on main.
    const base =
      this.state.getMeta(BASE_META) ?? (await latestPublish(services.db, siteId))?.sha ?? null;
    if (!base || base === mainHead) return { ...quiet, draftHasChanges: true };
    let baseIsLive: boolean;
    let draftIsBase: boolean;
    try {
      [baseIsLive, draftIsBase] = await Promise.all([
        this.sameContent(gh, repo, base, mainHead),
        this.sameContent(gh, repo, head, base),
      ]);
    } catch (err) {
      // The base commit is gone (main was rewritten): nothing to compare with.
      this.log.warn("draft base unreadable", { siteId, base, err });
      return { ...quiet, draftHasChanges: true };
    }
    if (baseIsLive) {
      // Main moved without changing what visitors see (hosting, domain, an update).
      this.state.setMeta(BASE_META, mainHead);
      return { ...quiet, draftHasChanges: true };
    }
    // The live site has content the draft wasn't started from.
    if (unflushed || !draftIsBase)
      return { liveChanged: true, draftHasChanges: true, followed: false, liveSha: mainHead };
    // Nothing of the draft's own to keep: follow the live site.
    if (!(await this.resetDraftIfAt(gh, repo, head, mainHead)))
      return { liveChanged: true, draftHasChanges: true, followed: false, liveSha: mainHead };
    this.state.setMeta(BASE_META, mainHead);
    this.state.markPublished(this.state.flushedSeq);
    await this.reloadFromHead(
      gh,
      repo,
      "Your live site changed (published from somewhere else), so the editor now shows the latest version.",
    );
    this.log.info("draft followed the live site", { siteId, from: base, to: mainHead });
    return { liveChanged: false, draftHasChanges: false, followed: true, liveSha: mainHead };
  }

  /** The draft against the live site, for Studio's "Your live site changed" notice. */
  async liveStatus(siteId: string): Promise<RoomResult<LiveStatus>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      return this.exclusive(async () => {
        const services = this.services();
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        return this.checkLive(services, siteId, gh, parseRepo(site.repo));
      });
    });
  }

  /**
   * Publish (arch §5.4): flush → one squash commit on `main` whose tree is the draft's tree, with
   * a summary of the ops since the last publish → reset `os/draft` to it → workflow → status.
   */
  async publish(
    siteId: string,
    input: {
      userId: string | null;
      actor?: string;
      agentSession?: string;
      /** The person saw that the live site changed and chose to replace it with this draft. */
      overwriteLive?: boolean;
    },
  ): Promise<RoomResult<PublishResult>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      return this.exclusive(async () => {
        const services = this.services();
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const repo = parseRepo(site.repo);
        await this.syncDraft(siteId, gh, repo);
        // Never put older content over newer live work by accident: a draft without changes of
        // its own follows the live site instead; one with changes needs the person's say-so.
        const live = await this.checkLive(services, siteId, gh, repo);
        if (live.followed) return { status: "no_changes" };
        if (live.liveChanged && !input.overwriteLive)
          throw new HttpError(409, "live_changed", LIVE_CHANGED_MESSAGE);
        const draftHead = this.state.head;
        const mainHead = await gh.getRef(repo, MAIN_BRANCH);
        if (!mainHead) throw new HttpError(409, "not_ready", "This site isn't set up yet.");
        if (await this.sameTree(gh, repo, mainHead, draftHead, isPublishedPath)) {
          this.state.markPublished(this.state.flushedSeq);
          return { status: "no_changes" };
        }
        // Refuse what the site's publish run would fail on (broken links, invalid content),
        // naming the page, block and link, before anything reaches main.
        // Custom components also need a site-kit that renders them (main's package files).
        const kit = await siteKitFiles(this.state.doc as SiteDocument, (path) =>
          gh.readFile(repo, path, MAIN_BRANCH),
        );
        assertPublishable(this.state.doc as SiteDocument, kit);
        const pending = this.state.unpublished().filter((o) => o.seq <= this.state.flushedSeq);
        const first = pending[0];
        const before =
          (first ? this.state.docAt(first.seq - 1) : null) ?? (this.state.doc as SiteDocument);
        const publisher = await this.userFor(services, input.userId);
        const actors = this.trailerActors(pending);
        if (
          publisher &&
          !actors.some((a) => a.kind === "human" && a.name === (publisher.name ?? publisher.login))
        )
          actors.push({
            name: publisher.name ?? publisher.login,
            email: trailerEmail(publisher),
            kind: "human",
            label: null,
          });
        const { message, summary } = commitMessage(
          pending.map((o) => o.op),
          before,
          actors,
          "Published changes",
        );
        // Cloudflare: the Worker's secrets must be in place before the commit starts the build.
        await syncWorkerSecretsSafely(services, site, this.log, {
          gh,
          doc: this.state.doc as SiteDocument,
        });
        // Only content, media and openspace.json: main's workflow, package.json and custom
        // code stay as they are there (a manual fix on main is never reverted by a publish).
        const commit = await gh.commitTree(repo, {
          branch: MAIN_BRANCH,
          treeOf: draftHead,
          expectedHead: mainHead,
          message,
          author: { name: publisher?.name ?? publisher?.login ?? "OpenSpace" },
          onlyPaths: isPublishedPath,
        });
        this.state.markPublished(this.state.flushedSeq);
        await this.noteScheduled(services, siteId, this.state.doc as SiteDocument);
        if (await this.resetDraftIfAt(gh, repo, draftHead, commit.sha))
          this.state.setMeta("head", commit.sha);
        // Someone committed to the draft while we published: keep their work.
        else await this.reloadFromHead(gh, repo, "The draft changed while publishing.");
        const { publish, run } = await this.recordPublish(services, gh, site, {
          kind: "publish",
          sha: commit.sha,
          prev: mainHead,
          summary,
          actor: input.actor ?? input.userId ?? "system",
          by: this.publishActor(publisher, input.agentSession),
        });
        await audit(services.db, {
          siteId,
          actor: input.actor ?? input.userId ?? "system",
          action: "site.publish",
          meta: { sha: commit.sha, summary, ops: pending.length },
        });
        return {
          status: "published",
          sha: commit.sha,
          summary,
          build: run.state,
          publishId: publish.id,
        };
      });
    });
  }

  /**
   * Roll back (arch §5.4): a new commit on `main` with the tree of `sha` — never a force push.
   * Unpublished draft changes are kept in a snapshot (`os/snap/before-rollback-<ts>`) and the
   * draft follows the live site.
   */
  async rollback(
    siteId: string,
    input: { userId: string; sha: string; agentSession?: string },
  ): Promise<RoomResult<{ sha: string; summary: string; snapshot: string | null }>> {
    return this.rpc(async () => {
      // A site whose files are broken (e.g. main lost openspace.json) can't load its draft; it
      // must still be able to go back to a version that works.
      let broken = false;
      try {
        await this.ensureLoaded(siteId);
      } catch (err) {
        if (!(err instanceof SiteFilesError)) throw err;
        broken = true;
        this.log.warn("rolling back a site whose files don't load", { siteId, err });
      }
      // Defense in depth (Studio and MCP check too): rolling back needs a designer or the owner.
      const role = await this.roleOf(this.services(), siteId, input.userId);
      if (!role || ROLE_RANK[role] < ROLE_RANK.designer)
        throw new HttpError(
          403,
          "forbidden",
          "Going back to an earlier version needs a designer or the owner.",
        );
      return this.exclusive(async () => {
        const services = this.services();
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const repo = parseRepo(site.repo);
        let draftHead = "";
        if (!broken)
          try {
            draftHead = await this.syncDraft(siteId, gh, repo);
          } catch (err) {
            // The draft moved to files that don't load (e.g. a README-only commit).
            if (!(err instanceof SiteFilesError)) throw err;
            broken = true;
          }
        if (broken) draftHead = (await gh.getRef(repo, DRAFT_BRANCH)) ?? "";
        const mainHead = await gh.getRef(repo, MAIN_BRANCH);
        if (!mainHead) throw new HttpError(409, "not_ready", "This site isn't set up yet.");
        const history = await gh.listCommits(repo, { ref: MAIN_BRANCH, limit: 100 });
        const wanted = input.sha.toLowerCase();
        const matches = history.filter((c) => c.sha.startsWith(wanted));
        if (matches.length > 1)
          throw new HttpError(
            400,
            "ambiguous_version",
            "That version id matches more than one version.",
          );
        const target = matches[0];
        if (!target)
          throw new HttpError(404, "version_not_found", "We couldn't find that version.");
        // Only versions that are a whole site (e.g. never the repository's empty first commit).
        if ((await gh.readFile(repo, CONFIG_PATH, target.sha)) === null)
          throw new HttpError(
            422,
            "not_a_site",
            "That version isn't a complete site, so your site can't go back to it. Pick a later version.",
          );
        // Main itself broken (no openspace.json): take the target's whole tree, workflow included.
        const mainBroken = (await gh.readFile(repo, CONFIG_PATH, mainHead)) === null;
        let snapshot: string | null = null;
        if (draftHead && !broken && !(await this.sameTree(gh, repo, mainHead, draftHead))) {
          snapshot = `os/snap/before-rollback-${Date.now()}`;
          await gh.tag(repo, snapshot, draftHead);
        }
        const user = await this.userFor(services, input.userId);
        const when = target.date.slice(0, 10);
        const summary = `Went back to the version from ${when}`;
        const firstLine = target.message.split("\n")[0] ?? "";
        await syncWorkerSecretsSafely(services, site, this.log, { gh });
        const commit = await gh.commitTree(repo, {
          branch: MAIN_BRANCH,
          treeOf: target.sha,
          expectedHead: mainHead,
          message: `${summary}: ${firstLine}\n\nRollback-of: ${target.sha}${
            user ? `\nCo-authored-by: ${user.name ?? user.login} <${trailerEmail(user)}>` : ""
          }`,
          author: { name: user?.name ?? user?.login ?? "OpenSpace" },
          // Content and media go back; today's workflow, packages and hosting stay.
          ...(mainBroken ? {} : { onlyPaths: isContentPath }),
        });
        if (broken || !draftHead) await gh.resetBranch(repo, DRAFT_BRANCH, commit.sha);
        else if (!(await this.resetDraftIfAt(gh, repo, draftHead, commit.sha))) {
          // A commit landed on the draft meanwhile: keep it in a snapshot too, then follow main.
          const moved = await gh.getRef(repo, DRAFT_BRANCH);
          if (moved) await this.tagUnique(gh, repo, `os/snap/before-rollback-${Date.now()}`, moved);
          await gh.resetBranch(repo, DRAFT_BRANCH, commit.sha);
        }
        // Ops flushed before the rollback are superseded; any that arrived meanwhile are replayed
        // on the rolled-back draft.
        this.state.markPublished(this.state.flushedSeq);
        await this.reloadFromHead(gh, repo, "The site went back to an earlier version.");
        await this.noteScheduled(services, siteId, this.state.doc as SiteDocument);
        await this.recordPublish(services, gh, site, {
          kind: "rollback",
          sha: commit.sha,
          prev: mainHead,
          summary,
          actor: input.userId,
          by: this.publishActor(user, input.agentSession),
        });
        await audit(services.db, {
          siteId,
          actor: input.userId,
          action: "site.rollback",
          meta: { to: target.sha, sha: commit.sha, snapshot },
        });
        return { sha: commit.sha, summary, snapshot };
      });
    });
  }

  /**
   * "Fix it for me" (FR-21): apply the automatic fix for the last failed publish — usually put the
   * live site back to the version before it (a new commit; the draft keeps the change so it can
   * be corrected), or retry / switch hosting on for transient failures.
   */
  async fixLastPublish(
    siteId: string,
    input: { userId: string },
  ): Promise<RoomResult<{ fix: string; sha: string | null }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      return this.exclusive(async () => {
        const services = this.services();
        const site = await this.site(services, siteId);
        const last = await latestPublish(services.db, siteId);
        if (last?.status !== "failure")
          throw new HttpError(
            409,
            "nothing_to_fix",
            "The last publish didn't fail, so there's nothing to fix.",
          );
        const gh = await this.github(services, site);
        const repo = parseRepo(site.repo);
        const fix = buildErrorByCode(last.error_code)?.fix ?? "revert";
        if (fix === "retry" || fix === "enable_pages" || fix === "update_node") {
          if (fix === "enable_pages") await gh.enablePages(repo);
          if (fix === "update_node") await updateWorkflowNode(gh, repo);
          await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
          await updatePublish(
            services.db,
            last.id,
            { status: "queued", error_code: null, error_detail: null },
            services.now(),
          );
          await updateSite(
            services.db,
            siteId,
            { status: "building", status_detail: null },
            services.now(),
          );
          this.broadcast({
            type: "build",
            state: "queued",
            sha: last.sha,
            kind: last.kind,
            error: null,
          });
          await audit(services.db, {
            siteId,
            actor: input.userId,
            action: "site.fix",
            meta: { fix, sha: last.sha },
          });
          return { fix, sha: last.sha };
        }
        // Go back to the newest version that actually went live (never to another failed one).
        const good = await services.db
          .prepare(
            "SELECT sha FROM publishes WHERE site_id = ? AND status = 'success' AND sha != ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
          )
          .bind(siteId, last.sha)
          .first<{ sha: string }>();
        if (!good)
          throw new HttpError(
            409,
            "nothing_to_fix",
            "There's no earlier version that worked to go back to.",
          );
        const mainHead = await gh.getRef(repo, MAIN_BRANCH);
        const user = await this.userFor(services, input.userId);
        const summary = "Put back the last version that worked";
        const commit = await gh.commitTree(repo, {
          branch: MAIN_BRANCH,
          treeOf: good.sha,
          ...(mainHead ? { expectedHead: mainHead } : {}),
          message: `${summary}\n\nReverts: ${last.sha}${
            user ? `\nCo-authored-by: ${user.name ?? user.login} <${trailerEmail(user)}>` : ""
          }`,
          author: { name: user?.name ?? user?.login ?? "OpenSpace" },
        });
        await this.recordPublish(services, gh, site, {
          kind: "revert",
          sha: commit.sha,
          prev: mainHead,
          summary,
          actor: input.userId,
          by: this.publishActor(user),
        });
        await audit(services.db, {
          siteId,
          actor: input.userId,
          action: "site.fix",
          meta: { fix, reverted: last.sha, sha: commit.sha },
        });
        return { fix, sha: commit.sha };
      });
    });
  }

  // --- snapshots and agent sessions ---------------------------------------------------------

  private async tagUnique(
    gh: GitHubAccess,
    repo: RepoRef,
    base: string,
    sha: string,
  ): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const name = i === 0 ? base : `${base}-${i + 1}`;
      try {
        await gh.tag(repo, name, sha);
        return name;
      } catch (err) {
        if (!(err instanceof GitHubConflictError)) throw err;
      }
    }
    throw new HttpError(409, "snapshot_exists", "A snapshot with that name already exists.");
  }

  /** Named snapshot of the draft: flush, then a lightweight tag `os/snap/<name>`. */
  async snapshot(
    siteId: string,
    name: string,
  ): Promise<RoomResult<{ name: string; tag: string; sha: string }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      return this.exclusive(async () => {
        await this.flushLocked(siteId);
        const services = this.services();
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const sha = this.state.head;
        const tag = await this.tagUnique(gh, parseRepo(site.repo), `os/snap/${name}`, sha);
        return { name: tag.slice("os/snap/".length), tag, sha };
      });
    });
  }

  /**
   * Start an agent (MCP) session: flush and tag `os/snap/agent-<ts>` so "Undo all of Claude's
   * changes" has a fixed point, and register the session's actor.
   */
  async startAgentSession(
    siteId: string,
    input: { userId: string; label?: string; sessionId?: string },
  ): Promise<RoomResult<{ sessionId: string; actor: string; tag: string; startSeq: number }>> {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      const services = this.services();
      const role = await this.roleOf(services, siteId, input.userId);
      if (!role || role === "contributor")
        throw new HttpError(403, "forbidden", "You can't connect an AI to this site.");
      const sessionId = input.sessionId ?? randomId("ags", 12);
      const existing = this.state.agentSession(sessionId);
      if (existing && existing.userId !== input.userId)
        throw new HttpError(409, "session_taken", "That session id is already in use.");
      if (existing)
        return {
          sessionId,
          actor: existing.actor,
          tag: existing.tag ?? "",
          startSeq: existing.startSeq,
        };
      return this.exclusive(async () => {
        await this.flushLocked(siteId);
        const site = await this.site(services, siteId);
        const gh = await this.github(services, site);
        const tag = await this.tagUnique(
          gh,
          parseRepo(site.repo),
          `os/snap/agent-${Date.now()}`,
          this.state.head,
        );
        const actor = await this.resolveActor(services, {
          userId: input.userId,
          kind: "agent",
          session: sessionId,
          label: input.label ?? "Claude",
        });
        this.state.rememberActor(actor);
        this.state.startAgentSession({
          id: sessionId,
          actor: actor.actor,
          userId: input.userId,
          label: actor.label ?? "Claude",
          tag,
        });
        await audit(services.db, {
          siteId,
          actor: `agent:${sessionId}`,
          action: "agent.session.start",
          meta: { tag, userId: input.userId },
        });
        return { sessionId, actor: actor.actor, tag, startSeq: this.state.seq };
      });
    });
  }

  async endAgentSession(
    siteId: string,
    input: { userId: string; sessionId: string; reason?: "ended" | "idle" | "revoked" },
  ): Promise<RoomResult<void>> {
    return this.rpc(async () => {
      this.siteId(siteId);
      const sessionId = input.sessionId;
      const session = this.state.agentSession(sessionId);
      if (!session) throw new HttpError(404, "not_found", "We couldn't find that AI session.");
      await this.requireSessionControl(this.services(), siteId, session.userId, input.userId);
      if (session.endedAt) return;
      this.state.endAgentSession(sessionId);
      this.agents.delete(session.actor);
      // Studio's "Accept / Undo all of Claude's changes" banner.
      this.broadcast({
        type: "agent_session_ended",
        sessionId,
        actor: session.actor,
        label: session.label,
        userId: session.userId,
        ops: this.state.agentSessionOpCount(sessionId),
        tag: session.tag,
        reason: input.reason ?? "ended",
      });
      this.broadcastPresence();
    });
  }

  /**
   * "Undo all of Claude's changes": revert every op of the agent session since its snapshot,
   * newest first, keeping edits people made afterwards. Defaults to the latest session.
   */
  async undoAgentSession(
    siteId: string,
    input: { userId: string; sessionId?: string },
  ): Promise<
    RoomResult<{ sessionId: string | null; reverted: number; skipped: number; seq: number }>
  > {
    return this.rpc(async () => {
      await this.ensureLoaded(siteId);
      const sessionId = input.sessionId ?? this.state.latestAgentSession();
      const session = sessionId ? this.state.agentSession(sessionId) : null;
      if (!sessionId || !session)
        throw new HttpError(404, "not_found", "There are no AI changes to undo.");
      const services = this.services();
      const role = await this.requireSessionControl(services, siteId, session.userId, input.userId);
      const actor = await this.resolveActor(services, { userId: input.userId, kind: "human" });
      const plan = this.state.agentRevertPlan(sessionId, actor);
      const client = `server:${actor.actor}`;
      const results = plan.ops.map((op) =>
        this.state.submit({ op, client, actor, role, trusted: true }),
      );
      await this.afterSubmit(services, siteId, actor, role, client, results);
      this.state.markAgentSessionUndone(sessionId);
      this.agents.delete(session.actor);
      this.broadcastPresence();
      const reverted = results.filter((r) => r.status === "accepted").length;
      await audit(services.db, {
        siteId,
        actor: input.userId,
        action: "agent.session.undo",
        meta: { sessionId, reverted, skipped: plan.skipped + results.length - reverted },
      });
      return {
        sessionId,
        reverted,
        skipped: plan.skipped + results.length - reverted,
        seq: this.state.seq,
      };
    });
  }

  /** Delete everything the room stores (archived site purged). */
  async purge(siteId: string): Promise<void> {
    this.siteId(siteId);
    for (const ws of this.sockets()) ws.close(4004, "Site deleted");
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** Test/ops hook: current room counters. */
  async info(siteId: string): Promise<{
    seq: number;
    flushedSeq: number;
    unflushed: number;
    head: string;
    members: Member[];
  }> {
    await this.ensureLoaded(siteId);
    return {
      seq: this.state.seq,
      flushedSeq: this.state.flushedSeq,
      unflushed: this.state.unflushedCount(),
      head: this.state.head,
      members: this.members(),
    };
  }
}

const WORKFLOW_PATH = `.github/workflows/${PUBLISH_WORKFLOW}`;
/** The Node.js major the starter's publish workflow uses (Astro needs a recent one). */
export const WORKFLOW_NODE = 24;

/** `node-version: 22` (or "20", '18'…) → the current major, on main then the draft. */
export function bumpWorkflowNode(text: string): string {
  return text.replace(/node-version:\s*(["']?)(\d+)(?:\.[\dx.]*)?\1/g, (m, q: string, v: string) =>
    Number(v) < WORKFLOW_NODE ? `node-version: ${q}${WORKFLOW_NODE}${q}` : m,
  );
}

async function updateWorkflowNode(gh: GitHubAccess, repo: RepoRef): Promise<void> {
  for (const branch of [MAIN_BRANCH, DRAFT_BRANCH]) {
    const head = await gh.getRef(repo, branch);
    if (!head) continue;
    const text = await gh.readFile(repo, WORKFLOW_PATH, head);
    if (!text) continue;
    const next = bumpWorkflowNode(text);
    if (next === text) continue;
    await gh.commitFiles(repo, {
      branch,
      expectedHead: head,
      message: `Build with Node ${WORKFLOW_NODE}`,
      files: [{ path: WORKFLOW_PATH, content: next }],
      author: { name: "OpenSpace" },
    });
  }
}
