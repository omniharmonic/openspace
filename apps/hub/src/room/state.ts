import {
  apply,
  deepEqual,
  invert,
  isInverseOf,
  type Op,
  type OpIssue,
  parseOp,
  type Role,
  rebase,
  transformForRole,
  validate,
} from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { blockRegistry, presetSection, registryForValidate } from "../blocks";
import type { ActorKind, ConflictNotice, LoggedOp, SubmitResult } from "./protocol";

/**
 * The DraftRoom's state machine, over the Durable Object's SQLite storage. Synchronous by
 * design: accepting an op never awaits, so ops are ordered exactly as they are processed.
 *
 * Tables:
 * - `meta`     key/value: `site_id`, `head` (draft commit the files cache matches), `flushed_seq`.
 * - `ops`      the ordered log: op, its inverse (for undo and for rewinding), who/where it came
 *              from, and whether it has been flushed to `os/draft` / published to `main`.
 * - `files`    text files of the document at `head` (no GitHub re-reads per flush).
 * - `actors`   display name and commit trailer identity per actor.
 * - `members`  role + personally locked sections per user (mirrors D1 `site_roles`).
 * - `agent_sessions` MCP sessions with the snapshot tag taken when they started.
 */
export const ROOM_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ops (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  op TEXT NOT NULL,
  inverse TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client TEXT NOT NULL,
  session TEXT,
  ts INTEGER NOT NULL,
  flushed INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ops_actor ON ops(actor, seq);
CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actors (
  actor TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT,
  kind TEXT NOT NULL, label TEXT, for_name TEXT
);
CREATE TABLE IF NOT EXISTS members (user_id TEXT PRIMARY KEY, role TEXT NOT NULL, locked TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, user_id TEXT NOT NULL, label TEXT NOT NULL,
  tag TEXT, start_seq INTEGER NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
  undone_at INTEGER
);
`;

/** Ops kept in the log after they are flushed and published (undo, agent revert, rebasing). */
export const LOG_RETENTION = 2000;
/** How far back an Editor's undo is matched against their own earlier ops. */
const UNDO_LOOKBACK = 100;

export interface ActorInfo {
  actor: string;
  userId: string;
  name: string;
  email: string | null;
  kind: ActorKind;
  /** Agents: the MCP client label ("Claude"), session id and the person it works for. */
  label?: string;
  session?: string;
  onBehalfOf?: string;
}

export interface SubmitInput {
  op: unknown;
  baseSeq?: number;
  client: string;
  actor: ActorInfo;
  role: Role;
  /** Server-trusted ops (snapshot restore, agent revert, approvals) skip role checks. */
  trusted?: boolean;
}

interface OpRow {
  seq: number;
  id: string;
  op: string;
  inverse: string;
  actor: string;
  kind: string;
  user_id: string;
  client: string;
  session: string | null;
  ts: number;
  flushed: number;
  published: number;
  [key: string]: SqlStorageValue;
}

export interface StoredOp {
  seq: number;
  op: Op;
  inverse: Op;
  actor: string;
  kind: ActorKind;
  userId: string;
  client: string;
  session: string | null;
  flushed: boolean;
  published: boolean;
}

const toStored = (r: OpRow): StoredOp => ({
  seq: r.seq,
  op: JSON.parse(r.op) as Op,
  inverse: JSON.parse(r.inverse) as Op,
  actor: r.actor,
  kind: r.kind as ActorKind,
  userId: r.user_id,
  client: r.client,
  session: r.session,
  flushed: r.flushed === 1,
  published: r.published === 1,
});

const itemAuthorKey = (collection: string, slug: string) => `item-author:${collection}/${slug}`;

export class RoomState {
  /** The current draft document (head + every op after it). */
  doc: SiteDocument | null = null;

  constructor(
    private readonly sql: SqlStorage,
    private readonly now: () => number = Date.now,
  ) {
    for (const stmt of ROOM_SCHEMA.split(";").map((s) => s.trim())) if (stmt) this.sql.exec(stmt);
  }

  // --- meta ---------------------------------------------------------------------------------

  getMeta(key: string): string | null {
    const rows = this.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)
      .toArray();
    return rows[0]?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  get head(): string {
    return this.getMeta("head") ?? "";
  }

  get seq(): number {
    const r = this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM ops").toArray();
    // `seq_floor` keeps numbering monotonic when every op has been pruned.
    return Math.max(r[0]?.s ?? 0, Number(this.getMeta("seq_floor") ?? 0));
  }

  get flushedSeq(): number {
    return Number(this.getMeta("flushed_seq") ?? 0);
  }

  /** Lowest seq still in the log (ops at or below `oldestSeq - 1` were pruned). */
  get oldestSeq(): number {
    const r = this.sql.exec<{ s: number | null }>("SELECT MIN(seq) AS s FROM ops").toArray();
    return r[0]?.s ?? this.seq + 1;
  }

  // --- files cache --------------------------------------------------------------------------

  files(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.sql
      .exec<{ path: string; content: string }>("SELECT path, content FROM files")
      .toArray())
      out[r.path] = r.content;
    return out;
  }

  replaceFiles(files: Record<string, string>): void {
    this.sql.exec("DELETE FROM files");
    for (const [path, content] of Object.entries(files))
      this.sql.exec("INSERT INTO files (path, content) VALUES (?, ?)", path, content);
  }

  applyFileChanges(changes: Array<{ path: string; content: string | null }>): void {
    for (const c of changes) {
      if (c.content === null) this.sql.exec("DELETE FROM files WHERE path = ?", c.path);
      else
        this.sql.exec(
          "INSERT INTO files (path, content) VALUES (?, ?) ON CONFLICT (path) DO UPDATE SET content = excluded.content",
          c.path,
          c.content,
        );
    }
  }

  get loaded(): boolean {
    return this.getMeta("head") !== null;
  }

  /**
   * (Re)base the room on a freshly read draft head: files cache, head, and the document at
   * head. Ops after `flushed_seq` are replayed on top (dropping any that no longer apply);
   * returns the ops dropped.
   */
  rebaseOnHead(head: string, files: Record<string, string>, docAtHead: SiteDocument): StoredOp[] {
    // Seqs are never reused, even if the newest ops are dropped below.
    this.setMeta("seq_floor", String(this.seq));
    // Ops at or below the flushed seq were made against the old base: their inverses can't
    // rewind the new one. Nothing may rebase onto, rewind past or revert them any more.
    this.setMeta("fence_seq", String(this.flushedSeq));
    this.replaceFiles(files);
    this.setMeta("head", head);
    let doc = docAtHead;
    const dropped: StoredOp[] = [];
    for (const o of this.opsAfter(this.flushedSeq)) {
      const r = validate(doc, o.op, { trusted: true });
      if (r.ok) {
        // The inverse must match the new base.
        this.sql.exec(
          "UPDATE ops SET inverse = ? WHERE seq = ?",
          JSON.stringify(invert(doc, o.op)),
          o.seq,
        );
        doc = r.doc;
      } else {
        this.sql.exec("DELETE FROM ops WHERE seq = ?", o.seq);
        dropped.push(o);
      }
    }
    this.doc = doc;
    return dropped;
  }

  /** Rebuild the in-memory document after a restart: document at head + unflushed ops. */
  restore(docAtHead: SiteDocument): number[] {
    let doc = docAtHead;
    const failed: number[] = [];
    for (const o of this.opsAfter(this.flushedSeq)) {
      try {
        doc = apply(doc, o.op);
      } catch {
        // Ops were validated on accept; a failure means the files cache moved underneath.
        failed.push(o.seq);
      }
    }
    this.doc = doc;
    return failed;
  }

  /** Ops at or below this seq predate the last rebase onto a new head (see `rebaseOnHead`). */
  get fenceSeq(): number {
    return Number(this.getMeta("fence_seq") ?? 0);
  }

  // --- log ----------------------------------------------------------------------------------

  opsAfter(seq: number, limit = 100_000): StoredOp[] {
    return this.sql
      .exec<OpRow>("SELECT * FROM ops WHERE seq > ? ORDER BY seq LIMIT ?", seq, limit)
      .toArray()
      .map(toStored);
  }

  opById(id: string): StoredOp | null {
    const r = this.sql.exec<OpRow>("SELECT * FROM ops WHERE id = ?", id).toArray()[0];
    return r ? toStored(r) : null;
  }

  opAt(seq: number): StoredOp | null {
    const r = this.sql.exec<OpRow>("SELECT * FROM ops WHERE seq = ?", seq).toArray()[0];
    return r ? toStored(r) : null;
  }

  unflushedCount(): number {
    return (
      this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM ops WHERE flushed = 0").toArray()[0]
        ?.n ?? 0
    );
  }

  unpublished(): StoredOp[] {
    return this.sql
      .exec<OpRow>("SELECT * FROM ops WHERE published = 0 ORDER BY seq")
      .toArray()
      .map(toStored);
  }

  markFlushed(upTo: number): void {
    this.sql.exec("UPDATE ops SET flushed = 1 WHERE seq <= ?", upTo);
    this.setMeta("flushed_seq", String(upTo));
  }

  markPublished(upTo: number): void {
    this.sql.exec("UPDATE ops SET published = 1 WHERE seq <= ?", upTo);
  }

  /** Keep the log bounded; never prune past an active agent session's snapshot. */
  prune(): void {
    const keepFrom = this.seq - LOG_RETENTION;
    const active = this.sql
      .exec<{ s: number | null }>(
        "SELECT MIN(start_seq) AS s FROM agent_sessions WHERE undone_at IS NULL AND (ended_at IS NULL OR ended_at > ?)",
        this.now() - 7 * 24 * 3600_000,
      )
      .toArray()[0]?.s;
    const floor = Math.min(keepFrom, active ?? Number.POSITIVE_INFINITY);
    if (floor > 0) {
      this.setMeta("seq_floor", String(this.seq));
      this.sql.exec("DELETE FROM ops WHERE seq <= ? AND flushed = 1 AND published = 1", floor);
    }
  }

  /**
   * The document as it was right after op `seq` (`seq = this.seq` → current). Walks back from the
   * current document applying stored inverses. Null if those ops were pruned.
   */
  docAt(seq: number): SiteDocument | null {
    if (!this.doc) return null;
    if (seq >= this.seq) return this.doc;
    if (seq < this.oldestSeq - 1 || seq < this.fenceSeq) return null;
    let doc = this.doc;
    const later = this.opsAfter(seq).reverse();
    for (const o of later) {
      try {
        doc = apply(doc, o.inverse);
      } catch {
        return null;
      }
    }
    return doc;
  }

  // --- actors and members -------------------------------------------------------------------

  rememberActor(a: ActorInfo): void {
    this.sql.exec(
      `INSERT INTO actors (actor, user_id, name, email, kind, label, for_name) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (actor) DO UPDATE SET name = excluded.name, email = excluded.email,
         label = excluded.label, for_name = excluded.for_name`,
      a.actor,
      a.userId,
      a.name,
      a.email,
      a.kind,
      a.label ?? null,
      a.onBehalfOf ?? null,
    );
  }

  actor(actor: string): {
    actor: string;
    userId: string;
    name: string;
    email: string | null;
    kind: ActorKind;
    label: string | null;
    forName: string | null;
  } | null {
    const r = this.sql
      .exec<{
        actor: string;
        user_id: string;
        name: string;
        email: string | null;
        kind: string;
        label: string | null;
        for_name: string | null;
      }>("SELECT * FROM actors WHERE actor = ?", actor)
      .toArray()[0];
    return r
      ? {
          actor: r.actor,
          userId: r.user_id,
          name: r.name,
          email: r.email,
          kind: r.kind as ActorKind,
          label: r.label,
          forName: r.for_name,
        }
      : null;
  }

  actorName(actor: string): string {
    return this.actor(actor)?.name ?? actor;
  }

  setMember(userId: string, role: Role | null, locked: string[] = []): void {
    if (!role) this.sql.exec("DELETE FROM members WHERE user_id = ?", userId);
    else
      this.sql.exec(
        "INSERT INTO members (user_id, role, locked) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, locked = excluded.locked",
        userId,
        role,
        JSON.stringify(locked),
      );
  }

  member(userId: string): { role: Role; locked: string[] } | null {
    const r = this.sql
      .exec<{ role: string; locked: string }>(
        "SELECT role, locked FROM members WHERE user_id = ?",
        userId,
      )
      .toArray()[0];
    return r ? { role: r.role as Role, locked: JSON.parse(r.locked) as string[] } : null;
  }

  // --- accepting ops ------------------------------------------------------------------------

  /** Ids of locked sections for this user: locked in the document plus personally locked ones. */
  lockedFor(userId: string): Set<string> {
    const out = new Set(this.member(userId)?.locked ?? []);
    const doc = this.doc;
    if (doc) {
      if (doc.site.footer.locked) out.add(doc.site.footer.id);
      for (const page of Object.values(doc.pages))
        for (const s of page.sections) if (s.locked) out.add(s.id);
    }
    return out;
  }

  /**
   * Check a batch against the current document without changing anything, as `submit` would
   * accept it at the current head (MCP edits are all-or-nothing): parse, role filter, validate,
   * apply in order on a scratch copy. Ops already in the log (resends) are skipped.
   */
  dryRun(
    ops: readonly unknown[],
    role: Role,
    userId: string,
  ):
    | { ok: true }
    | {
        ok: false;
        index: number;
        code: "invalid" | "forbidden";
        message: string;
        errors?: OpIssue[];
      } {
    let doc = this.doc;
    if (!doc) throw new Error("Room not loaded");
    const registry = registryForValidate();
    const locked = this.lockedFor(userId);
    for (let index = 0; index < ops.length; index++) {
      const parsed = parseOp(ops[index]);
      if (!parsed.ok)
        return {
          ok: false,
          index,
          code: "invalid",
          message: parsed.errors[0]?.message ?? "That change isn't valid",
          errors: parsed.errors,
        };
      if (this.opById(parsed.op.id)) continue;
      let op = parsed.op;
      if (role !== "owner" && role !== "designer") {
        const d = transformForRole(op, role, locked, {
          doc,
          registry: blockRegistry(),
          userId,
          itemAuthor: this.itemAuthor,
          presetSection,
        });
        if (!d.allowed) return { ok: false, index, code: "forbidden", message: d.reason };
        op = d.op;
      }
      const v = validate(doc, op, registry ? { registry } : {});
      if (!v.ok)
        return {
          ok: false,
          index,
          code: "invalid",
          message: v.errors[0]?.message ?? "That change isn't valid",
          errors: v.errors,
        };
      try {
        doc = apply(doc, op);
      } catch (err) {
        return {
          ok: false,
          index,
          code: "invalid",
          message: err instanceof Error ? err.message : "That change isn't valid",
        };
      }
    }
    return { ok: true };
  }

  /** Who started a collection item (user id), recorded when its first upsert was accepted. */
  readonly itemAuthor = (collection: string, slug: string): string | undefined =>
    this.getMeta(itemAuthorKey(collection, slug)) ?? undefined;

  /** Ops an agent session made that are still in the log. */
  agentSessionOpCount(sessionId: string): number {
    return (
      this.sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM ops WHERE session = ? AND kind = 'agent'",
          sessionId,
        )
        .toArray()[0]?.n ?? 0
    );
  }

  /**
   * Accept one op: parse, dedupe, server-stamp, rebase over what the sender hadn't seen, check
   * the role (or authorize as an undo of the sender's own op), validate, assign a seq, persist.
   */
  submit(input: SubmitInput): SubmitResult {
    const doc = this.doc;
    if (!doc) throw new Error("Room not loaded");
    const parsed = parseOp(input.op);
    const rawId =
      typeof (input.op as { id?: unknown })?.id === "string"
        ? ((input.op as { id: string }).id as string)
        : null;
    if (!parsed.ok)
      return {
        status: "rejected",
        opId: rawId,
        code: "invalid",
        message: parsed.errors[0]?.message ?? "That change isn't valid",
        errors: parsed.errors,
        conflicts: [],
      };
    const existing = this.opById(parsed.op.id);
    if (existing) {
      if (existing.client === input.client || existing.actor === input.actor.actor)
        return {
          status: "accepted",
          opId: existing.op.id,
          seq: existing.seq,
          op: existing.op,
          conflicts: [],
          warnings: [],
          duplicate: true,
        };
      return {
        status: "rejected",
        opId: parsed.op.id,
        code: "invalid",
        message: "An op with that id already exists",
        conflicts: [],
      };
    }

    const current = this.seq;
    const baseSeq = Math.min(input.baseSeq ?? current, current);
    if (baseSeq < this.oldestSeq - 1 || baseSeq < this.fenceSeq)
      return {
        status: "rejected",
        opId: parsed.op.id,
        code: "stale",
        message: "This editor is out of date. Reloading the latest version.",
        conflicts: [],
      };

    // Server-stamp: actor is who we authenticated; ts is clamped to [based-on op's ts, now].
    const now = this.now();
    const lower = baseSeq > 0 ? (this.opAt(baseSeq)?.op.ts ?? 0) : 0;
    let op: Op = {
      ...parsed.op,
      actor: input.actor.actor,
      ts: Math.max(lower, Math.min(parsed.op.ts, now)),
    };

    // Rebase over the ops the sender had not seen (its own later ops it had applied locally).
    const conflicts: ConflictNotice[] = [];
    const after = this.opsAfter(baseSeq);
    const unseen = after.filter((o) => o.client !== input.client);
    if (unseen.length) {
      let base = this.docAt(baseSeq) ?? doc;
      for (const own of after.filter((o) => o.client === input.client)) {
        try {
          base = apply(base, own.op);
        } catch {
          /* best effort: the base only locates blocks for footprints */
        }
      }
      const r = rebase(
        [op],
        unseen.map((o) => o.op),
        { base, doc },
      );
      for (const c of r.conflicts) conflicts.push(...this.notices(c, input.actor));
      const next = r.ops[0];
      if (!next)
        return {
          status: "rejected",
          opId: op.id,
          code: "dropped",
          message: conflicts[0]?.message ?? "This change no longer applies",
          conflicts,
        };
      op = next;
    }

    if (!input.trusted && input.role !== "owner" && input.role !== "designer") {
      const undo = this.isOwnUndo(op, input.actor.actor);
      if (!undo) {
        const decision = transformForRole(op, input.role, this.lockedFor(input.actor.userId), {
          doc,
          registry: blockRegistry(),
          userId: input.actor.userId,
          itemAuthor: this.itemAuthor,
          presetSection,
        });
        if (!decision.allowed)
          return {
            status: "rejected",
            opId: op.id,
            code: "forbidden",
            message: decision.reason,
            conflicts,
          };
      }
    }

    const registry = registryForValidate();
    const v = validate(doc, op, registry ? { registry } : {});
    if (!v.ok)
      return {
        status: "rejected",
        opId: op.id,
        code: "invalid",
        message: v.errors[0]?.message ?? "That change isn't valid",
        errors: v.errors,
        conflicts,
      };

    const inverse = invert(doc, op);
    const seq = current + 1;
    this.rememberActor(input.actor);
    this.sql.exec(
      `INSERT INTO ops (seq, id, op, inverse, actor, kind, user_id, client, session, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      seq,
      op.id,
      JSON.stringify(op),
      JSON.stringify(inverse),
      input.actor.actor,
      input.actor.kind,
      input.actor.userId,
      input.client,
      input.actor.session ?? null,
      op.ts,
    );
    if (op.op === "collection.upsert" && !doc.collections[op.collection]?.[op.item.slug])
      this.setMeta(itemAuthorKey(op.collection, op.item.slug), input.actor.userId);
    this.doc = v.doc;
    return {
      status: "accepted",
      opId: op.id,
      seq,
      op,
      conflicts,
      warnings: v.warnings as OpIssue[],
    };
  }

  /**
   * An Editor's undo/redo: `op` is exactly the inverse of one of the same actor's recent ops, and
   * nobody has touched those locations since (rebasing it over the later ops changes nothing).
   */
  private isOwnUndo(op: Op, actor: string): boolean {
    const own = this.sql
      .exec<OpRow>(
        "SELECT * FROM ops WHERE actor = ? AND client NOT LIKE 'server:%' AND seq > ? ORDER BY seq DESC LIMIT ?",
        actor,
        this.fenceSeq,
        UNDO_LOOKBACK,
      )
      .toArray()
      .map(toStored);
    for (const prior of own) {
      const expected = prior.inverse;
      if (expected.op !== op.op) continue;
      const before = this.docAt(prior.seq - 1);
      if (!before || !isInverseOf(op, prior.op, before)) continue;
      const later = this.opsAfter(prior.seq).filter((o) => o.actor !== actor);
      if (!later.length) return true;
      const after = this.docAt(prior.seq);
      if (!after) return false;
      const r = rebase(
        [op],
        later.map((o) => o.op),
        { base: after },
      );
      return r.conflicts.length === 0 && r.ops.length === 1 && deepEqual(r.ops[0], op);
    }
    return false;
  }

  /** Conflict notices for the sender (and the other author, when the sender's version won). */
  private notices(
    c: ReturnType<typeof rebase>["conflicts"][number],
    sender: ActorInfo,
  ): ConflictNotice[] {
    const other = c.remote ? this.actorName(c.remote.actor) : "Someone";
    const out: ConflictNotice[] = [];
    const base = { type: "conflict" as const, reason: c.reason, paths: c.paths };
    const verb =
      c.reason === "deleted"
        ? `${other} deleted this`
        : c.reason === "duplicate"
          ? `${other} already added this`
          : c.reason === "invalid"
            ? c.message
            : `${other} changed this too`;
    out.push({
      ...base,
      opId: c.local.id,
      message: verb,
      winner: c.winner === "local" ? "you" : "them",
      by: { actor: c.remote?.actor ?? "", name: other },
      ...(c.winner === "remote" && c.reason === "concurrent-edit" ? { restore: c.local } : {}),
    });
    if (c.remote && c.winner === "local" && c.reason === "concurrent-edit")
      out.push({
        ...base,
        opId: c.remote.id,
        message: `${sender.name} changed this too`,
        winner: "them",
        by: { actor: sender.actor, name: sender.name },
        restore: c.remote,
      });
    return out;
  }

  toLogged(o: StoredOp): LoggedOp {
    return { seq: o.seq, op: o.op, client: o.client, actor: o.actor, kind: o.kind };
  }

  // --- agent sessions -----------------------------------------------------------------------

  startAgentSession(s: {
    id: string;
    actor: string;
    userId: string;
    label: string;
    tag: string | null;
  }): void {
    this.sql.exec(
      `INSERT INTO agent_sessions (id, actor, user_id, label, tag, start_seq, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      s.id,
      s.actor,
      s.userId,
      s.label,
      s.tag,
      this.seq,
      this.now(),
    );
  }

  agentSession(id: string): {
    id: string;
    actor: string;
    userId: string;
    label: string;
    tag: string | null;
    startSeq: number;
    startedAt: number;
    endedAt: number | null;
    undoneAt: number | null;
  } | null {
    const r = this.sql
      .exec<{
        id: string;
        actor: string;
        user_id: string;
        label: string;
        tag: string | null;
        start_seq: number;
        started_at: number;
        ended_at: number | null;
        undone_at: number | null;
      }>("SELECT * FROM agent_sessions WHERE id = ?", id)
      .toArray()[0];
    return r
      ? {
          id: r.id,
          actor: r.actor,
          userId: r.user_id,
          label: r.label,
          tag: r.tag,
          startSeq: r.start_seq,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          undoneAt: r.undone_at,
        }
      : null;
  }

  latestAgentSession(): string | null {
    return (
      this.sql
        .exec<{ id: string }>(
          "SELECT id FROM agent_sessions WHERE undone_at IS NULL ORDER BY started_at DESC LIMIT 1",
        )
        .toArray()[0]?.id ?? null
    );
  }

  endAgentSession(id: string): void {
    this.sql.exec(
      "UPDATE agent_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
      this.now(),
      id,
    );
  }

  markAgentSessionUndone(id: string): void {
    this.sql.exec("UPDATE agent_sessions SET undone_at = ? WHERE id = ?", this.now(), id);
  }

  /**
   * Inverses that revert an agent session's ops, newest first, each rebased over the ops other
   * people made after it — so a human edit made later on the same field is kept (the inverse
   * carries the agent op's `ts` and loses last-writer-wins to anything newer).
   */
  agentRevertPlan(sessionId: string, actor: ActorInfo): { ops: Op[]; skipped: number } {
    const session = this.agentSession(sessionId);
    if (!session || !this.doc) return { ops: [], skipped: 0 };
    const all = this.opsAfter(session.startSeq);
    const own = (o: StoredOp) => o.session === sessionId && o.kind === "agent";
    // Ops before the fence (the draft was rebased onto a new head since, e.g. a rollback) can't
    // be reverted: they count as skipped.
    const fenced = all.filter((o) => own(o) && o.seq <= this.fenceSeq).length;
    const log = all.filter((o) => o.seq > this.fenceSeq);
    const target = log.filter(own);
    if (!target.length) return { ops: [], skipped: fenced };
    // Documents right after each target op, rewinding from the current document.
    const after = new Map<number, SiteDocument>();
    let doc: SiteDocument | null = this.doc;
    const wanted = new Set(target.map((t) => t.seq));
    for (const o of [...log].reverse()) {
      if (!doc) break;
      if (wanted.has(o.seq)) after.set(o.seq, doc);
      try {
        doc = apply(doc, o.inverse);
      } catch {
        doc = null; // can't rewind further; earlier targets rebase without a base
      }
    }
    const ops: Op[] = [];
    let skipped = fenced;
    let n = 0;
    for (const t of [...target].reverse()) {
      const others = log.filter((o) => o.seq > t.seq && o.session !== sessionId);
      const inv: Op = {
        ...t.inverse,
        id: `${t.op.id}:revert:${this.now().toString(36)}:${n++}`,
        actor: actor.actor,
        ts: t.op.ts,
      };
      const base = after.get(t.seq);
      let kept: Op | undefined;
      try {
        kept = others.length
          ? rebase(
              [inv],
              others.map((o) => o.op),
              base ? { base } : {},
            ).ops[0]
          : inv;
      } catch {
        kept = undefined;
      }
      if (kept) ops.push(kept);
      else skipped++;
    }
    return { ops, skipped };
  }
}
