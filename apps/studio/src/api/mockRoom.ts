import { blocksRegistry } from "@openspace/blocks";
import { invert, type Op, type OpBody, parseOp, rebase, stamp, validate } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { pageOf } from "../features/sync/ops-meta";
import type {
  ActorKind,
  ConflictNotice,
  LoggedOp,
  RoomMember,
  RoomSocket,
  ServerMessage,
} from "../features/sync/protocol";

/**
 * An in-memory DraftRoom speaking the same protocol as the Hub's Durable Object (Task 15), so the
 * Studio's sync, presence, agent and publish flows work in `VITE_MOCK_API` mode and in tests.
 *
 * Mirrors the room's op pipeline: dedupe by id → stale check → server stamp (actor, clamped ts)
 * → `rebase` over the ops the sender hadn't seen → validate → gap-free seq → ack / broadcast /
 * conflict notices. Roles and locks are not enforced here.
 */

type Submitted =
  | {
      status: "accepted";
      opId: string;
      seq: number;
      op: Op;
      conflicts: ConflictNotice[];
      duplicate?: boolean;
    }
  | {
      status: "rejected";
      opId: string | null;
      code: "invalid" | "forbidden" | "stale" | "dropped";
      message: string;
      conflicts: ConflictNotice[];
    };

interface StoredOp extends LoggedOp {
  before: SiteDocument;
  after: SiteDocument;
}

interface Conn {
  client: string;
  actor: string;
  userId: string;
  name: string;
  page: string | null;
  selection: string[];
  /** Deliver a frame to the client end. */
  deliver: (data: string) => void;
  /** Close from the server side. */
  kill: (code: number, reason: string) => void;
}

export interface MockRoomPerson {
  userId: string;
  name: string;
}

export interface MockRoomOptions {
  doc: SiteDocument;
  seq?: number;
  head?: string;
  now?: () => number;
  /** Simulated one-way latency for frames (ms). 0 delivers on the next microtask. */
  latencyMs?: number;
  /** Called after every change to the document (persistence). */
  onChange?: (doc: SiteDocument, seq: number) => void;
  /** How long an agent shows as editing after its last op (ms). */
  agentPresenceMs?: number;
  /** Called for every accepted op (the mock Hub's bookkeeping, e.g. contributor approvals). */
  onAccepted?: (op: Op, actor: string) => void;
}

export interface MockAgentSession {
  sessionId: string;
  actor: string;
  /** Submit edits as the agent; returns the room's results. */
  edit: (ops: Array<OpBody | Op>) => Submitted[];
  end: () => void;
}

export interface MockCollaborator {
  actor: string;
  client: string;
  /** Submit edits as this person, based on `baseSeq` (default: the current seq). */
  edit: (ops: Array<OpBody | Op>, baseSeq?: number) => Submitted[];
  leave: () => void;
}

const registry = blocksRegistry();
let clientCounter = 0;
let idCounter = 0;

export class MockRoom {
  doc: SiteDocument;
  seq: number;
  head: string;
  /** First seq still in the log (older clients get the whole document). */
  oldestSeq: number;
  down = false;
  readonly log: StoredOp[] = [];
  private conns = new Map<string, Conn>();
  private agents = new Map<string, RoomMember & { until: number }>();
  private names = new Map<string, string>();
  private sessions = new Map<string, { actor: string; userId: string; startSeq: number }>();
  private readonly now: () => number;
  private readonly latency: number;
  private readonly agentPresenceMs: number;
  private readonly onChange?: (doc: SiteDocument, seq: number) => void;
  private readonly onAccepted?: (op: Op, actor: string) => void;
  private agentTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: MockRoomOptions) {
    this.doc = options.doc;
    this.seq = options.seq ?? 0;
    this.head = options.head ?? "mock-head";
    this.oldestSeq = this.seq + 1;
    this.now = options.now ?? Date.now;
    this.latency = options.latencyMs ?? 0;
    this.agentPresenceMs = options.agentPresenceMs ?? 30_000;
    this.onChange = options.onChange;
    this.onAccepted = options.onAccepted;
  }

  private later(fn: () => void) {
    if (this.latency > 0) setTimeout(fn, this.latency);
    else queueMicrotask(fn);
  }

  // --- connections -------------------------------------------------------------------------------

  /** Open a connection for `person` (what the Hub does on the WebSocket upgrade). */
  connect(person: MockRoomPerson, since: number | null, role = "owner"): RoomSocket {
    const sock: RoomSocket = {
      send: () => {},
      close: () => {},
      onopen: null,
      onmessage: null,
      onclose: null,
    };
    if (this.down) {
      this.later(() => sock.onclose?.(1006, "unreachable"));
      return sock;
    }
    const client = `c${++clientCounter}`;
    const actor = `user:${person.userId}`;
    this.names.set(actor, person.name);
    let open = true;
    const conn: Conn = {
      client,
      actor,
      userId: person.userId,
      name: person.name,
      page: null,
      selection: [],
      deliver: (data) => this.later(() => open && sock.onmessage?.(data)),
      kill: (code, reason) => {
        if (!open) return;
        open = false;
        this.conns.delete(client);
        this.later(() => sock.onclose?.(code, reason));
      },
    };
    sock.send = (data) => {
      if (!open) return;
      this.later(() => open && this.conns.has(client) && this.message(conn, data));
    };
    sock.close = (code = 1000, reason = "bye") => {
      if (!open) return;
      conn.kill(code, reason);
      this.broadcastPresence();
    };
    this.conns.set(client, conn);
    this.later(() => {
      if (!open) return;
      sock.onopen?.();
      const ok = since !== null && since <= this.seq && since >= this.oldestSeq - 1;
      this.send(conn, {
        type: "hello",
        you: { client, actor, role: role as "owner", name: person.name },
        seq: this.seq,
        head: this.head,
        ...(ok
          ? { ops: this.log.filter((o) => o.seq > (since as number)).map(logged) }
          : { doc: this.doc }),
        members: this.members(),
      });
      this.broadcastPresence();
    });
    return sock;
  }

  /** Simulate the Hub becoming unreachable (closes every connection) or coming back. */
  setDown(down: boolean): void {
    this.down = down;
    if (down) for (const c of [...this.conns.values()]) c.kill(1006, "unreachable");
  }

  /** Forget the op log (clients older than now must reload). */
  compact(): void {
    this.log.length = 0;
    this.oldestSeq = this.seq + 1;
  }

  get connections(): number {
    return this.conns.size;
  }

  private send(conn: Conn, msg: ServerMessage) {
    conn.deliver(JSON.stringify(msg));
  }

  broadcast(msg: ServerMessage, except?: string): void {
    for (const c of this.conns.values()) if (c.client !== except) this.send(c, msg);
  }

  private members(): RoomMember[] {
    const out: RoomMember[] = [...this.conns.values()].map((c) => ({
      client: c.client,
      actor: c.actor,
      userId: c.userId,
      name: c.name,
      kind: "human",
      role: "owner",
      page: c.page,
      selection: c.selection,
    }));
    const t = this.now();
    for (const [k, m] of this.agents) {
      if (m.until < t) this.agents.delete(k);
      else {
        const { until: _u, ...member } = m;
        out.push(member);
      }
    }
    return out;
  }

  broadcastPresence(): void {
    this.broadcast({ type: "presence", members: this.members() });
  }

  private message(conn: Conn, data: string) {
    if (data === "ping") {
      conn.deliver("pong");
      return;
    }
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      this.send(conn, { type: "error", message: "Messages must be JSON" });
      return;
    }
    if (msg.type === "presence") {
      conn.page = (msg.page as string | null | undefined) ?? null;
      conn.selection = (msg.selection as string[] | undefined) ?? [];
      this.broadcastPresence();
      return;
    }
    if (msg.type === "sync") {
      const since = (msg.since as number | undefined) ?? 0;
      if (since >= this.oldestSeq - 1)
        for (const o of this.log.filter((x) => x.seq > since))
          this.send(conn, { type: "op", ...logged(o) });
      else
        this.send(conn, {
          type: "reload",
          seq: this.seq,
          head: this.head,
          doc: this.doc,
          reason: "resync",
        });
      return;
    }
    if (msg.type === "op" || msg.type === "ops") {
      const ops = msg.type === "op" ? [msg.op] : ((msg.ops as unknown[]) ?? []);
      const baseSeq = msg.baseSeq as number | undefined;
      const results = ops.map((op) =>
        this.submitOne(op, { baseSeq, client: conn.client, actor: conn.actor, kind: "human" }),
      );
      this.deliverResults(results, conn.client, conn.actor, "human", conn);
      if (results.some((r) => r.status === "rejected" && r.code === "stale"))
        this.send(conn, {
          type: "reload",
          seq: this.seq,
          head: this.head,
          doc: this.doc,
          reason: "stale",
        });
      return;
    }
    this.send(conn, { type: "error", message: "Unknown message" });
  }

  // --- op pipeline ----------------------------------------------------------------------------------

  private docAt(seq: number): SiteDocument {
    if (seq >= this.seq) return this.doc;
    const entry = this.log.find((o) => o.seq === seq + 1);
    return entry ? entry.before : this.doc;
  }

  private submitOne(
    raw: unknown,
    input: { baseSeq?: number; client: string; actor: string; kind: ActorKind; trusted?: boolean },
  ): Submitted {
    const parsed = parseOp(raw);
    if (!parsed.ok)
      return {
        status: "rejected",
        opId: (raw as { id?: string })?.id ?? null,
        code: "invalid",
        message: parsed.errors[0]?.message ?? "That change isn't valid",
        conflicts: [],
      };
    const existing = this.log.find((o) => o.op.id === parsed.op.id);
    if (existing) {
      if (existing.client === input.client || existing.actor === input.actor)
        return {
          status: "accepted",
          opId: existing.op.id,
          seq: existing.seq,
          op: existing.op,
          conflicts: [],
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
    if (baseSeq < this.oldestSeq - 1)
      return {
        status: "rejected",
        opId: parsed.op.id,
        code: "stale",
        message: "This editor is out of date. Reloading the latest version.",
        conflicts: [],
      };
    const lower = baseSeq > 0 ? (this.log.find((o) => o.seq === baseSeq)?.op.ts ?? 0) : 0;
    let op: Op = {
      ...parsed.op,
      actor: input.actor,
      ts: Math.max(lower, Math.min(parsed.op.ts, this.now())),
    };
    const conflicts: ConflictNotice[] = [];
    const after = this.log.filter((o) => o.seq > baseSeq);
    const unseen = after.filter((o) => o.client !== input.client);
    if (unseen.length) {
      let base = this.docAt(baseSeq);
      for (const own of after.filter((o) => o.client === input.client)) {
        const r = validate(base, own.op, { registry, trusted: true });
        if (r.ok) base = r.doc;
      }
      const r = rebase(
        [op],
        unseen.map((o) => o.op),
        { base, doc: this.doc },
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
    const v = validate(this.doc, op, { registry, trusted: true });
    if (!v.ok)
      return {
        status: "rejected",
        opId: op.id,
        code: "invalid",
        message: v.errors[0]?.message ?? "That change isn't valid",
        conflicts,
      };
    const before = this.doc;
    this.seq = current + 1;
    this.doc = v.doc;
    this.log.push({
      seq: this.seq,
      op,
      client: input.client,
      actor: input.actor,
      kind: input.kind,
      before,
      after: v.doc,
    });
    this.onChange?.(this.doc, this.seq);
    this.onAccepted?.(op, input.actor);
    return { status: "accepted", opId: op.id, seq: this.seq, op, conflicts };
  }

  private notices(
    c: ReturnType<typeof rebase>["conflicts"][number],
    sender: string,
  ): ConflictNotice[] {
    const other = c.remote ? (this.names.get(c.remote.actor) ?? "Someone") : "Someone";
    const senderName = this.names.get(sender) ?? "Someone";
    const verb =
      c.reason === "deleted"
        ? `${other} deleted this`
        : c.reason === "duplicate"
          ? `${other} already added this`
          : c.reason === "invalid"
            ? c.message
            : `${other} changed this too`;
    const base = { type: "conflict" as const, reason: c.reason, paths: c.paths };
    const out: ConflictNotice[] = [
      {
        ...base,
        opId: c.local.id,
        message: verb,
        winner: c.winner === "local" ? "you" : "them",
        by: { actor: c.remote?.actor ?? "", name: other },
        ...(c.winner === "remote" && c.reason === "concurrent-edit" ? { restore: c.local } : {}),
      },
    ];
    if (c.remote && c.winner === "local" && c.reason === "concurrent-edit")
      out.push({
        ...base,
        opId: c.remote.id,
        message: `${senderName} changed this too`,
        winner: "them",
        by: { actor: sender, name: senderName },
        restore: c.remote,
      });
    return out;
  }

  private deliverResults(
    results: Submitted[],
    client: string,
    actor: string,
    kind: ActorKind,
    sender?: Conn,
  ) {
    for (const r of results) {
      const own: ConflictNotice[] = [];
      for (const n of r.conflicts) {
        const stored = n.opId === r.opId ? null : this.log.find((o) => o.op.id === n.opId);
        if (!stored) own.push(n);
        else for (const c of this.conns.values()) if (c.actor === stored.actor) this.send(c, n);
      }
      if (r.status === "accepted") {
        if (sender) this.send(sender, { type: "ack", opId: r.opId, seq: r.seq, op: r.op });
        if (!r.duplicate)
          this.broadcast({ type: "op", seq: r.seq, op: r.op, client, actor, kind }, client);
      } else if (sender)
        this.send(sender, { type: "reject", opId: r.opId, code: r.code, message: r.message });
      if (sender) for (const n of own) this.send(sender, n);
    }
  }

  /** Apply ops as `actor` outside any connection (HTTP routes, restores, undo). */
  submitAs(
    person: { actor: string; name: string; kind?: ActorKind; client?: string },
    ops: Array<OpBody | Op>,
    baseSeq?: number,
  ): Submitted[] {
    this.names.set(person.actor, person.name);
    const client = person.client ?? `server:${person.actor}`;
    const kind = person.kind ?? "human";
    const results = ops.map((body) =>
      this.submitOne(
        stamp(body as OpBody<Op>, {
          id: (body as Op).id ?? `mock-${(++idCounter).toString(36)}-${this.now().toString(36)}`,
          actor: person.actor,
          ts: (body as Op).ts ?? this.now(),
        }),
        { baseSeq, client, actor: person.actor, kind },
      ),
    );
    this.deliverResults(results, client, person.actor, kind);
    return results;
  }

  /** Replace the document for everyone (rollback, draft moved elsewhere). */
  reloadAll(doc: SiteDocument, reason: string): void {
    this.doc = doc;
    this.seq += 1;
    this.compact();
    this.onChange?.(this.doc, this.seq);
    this.broadcast({ type: "reload", seq: this.seq, head: this.head, doc, reason });
  }

  // --- simulated people and agents ---------------------------------------------------------------

  /** A collaborator editing from elsewhere (tests and demos). */
  collaborator(person: MockRoomPerson): MockCollaborator {
    const actor = `user:${person.userId}`;
    const client = `c${++clientCounter}`;
    this.names.set(actor, person.name);
    return {
      actor,
      client,
      edit: (ops, baseSeq) => this.submitAs({ actor, name: person.name, client }, ops, baseSeq),
      leave: () => {},
    };
  }

  /** An MCP agent session working for `person` ("Claude is editing Home…"). */
  startAgent(person: MockRoomPerson, label = "Claude", sessionId?: string): MockAgentSession {
    const sid = sessionId ?? `ses${(++idCounter).toString(36)}${this.now().toString(36)}`;
    const actor = `agent:${sid}`;
    const client = `agent-${sid}`;
    this.names.set(actor, label);
    this.sessions.set(sid, { actor, userId: person.userId, startSeq: this.seq });
    const end = () => {
      clearTimeout(this.agentTimers.get(actor));
      this.agents.delete(actor);
      this.broadcastPresence();
    };
    return {
      sessionId: sid,
      actor,
      edit: (ops) => {
        const results = this.submitAs({ actor, name: label, kind: "agent", client }, ops);
        const last = [...results].reverse().find((r) => r.status === "accepted");
        if (last && last.status === "accepted") {
          const pageId = pageOf(last.op);
          const title = pageId
            ? this.doc.pages[pageId as keyof SiteDocument["pages"]]?.title
            : null;
          this.agents.set(actor, {
            client,
            actor,
            userId: person.userId,
            name: label,
            kind: "agent",
            role: "owner",
            page: pageId,
            selection: [],
            activity: `${label} is editing ${title ?? "your site"}…`,
            until: this.now() + this.agentPresenceMs,
          });
          this.broadcastPresence();
          clearTimeout(this.agentTimers.get(actor));
          this.agentTimers.set(
            actor,
            setTimeout(() => {
              this.agents.delete(actor);
              this.broadcastPresence();
            }, this.agentPresenceMs),
          );
        }
        return results;
      },
      end,
    };
  }

  /**
   * "Undo all" of an agent session: revert its ops newest first, each rebased over everyone
   * else's later ops; one that would overwrite a later edit is skipped (that edit wins).
   */
  undoAgent(
    sessionId: string,
    by: { actor: string; name: string },
  ): { reverted: number; skipped: number } {
    const session = this.sessions.get(sessionId);
    if (!session) return { reverted: 0, skipped: 0 };
    const mine = this.log.filter((o) => o.actor === session.actor).reverse();
    let reverted = 0;
    let skipped = 0;
    for (const entry of mine) {
      let inv: Op;
      try {
        inv = { ...invert(entry.before, entry.op), ts: entry.op.ts };
      } catch {
        skipped++;
        continue;
      }
      const later = this.log.filter(
        (o) => o.seq > entry.seq && o.actor !== session.actor && o.actor !== by.actor,
      );
      const r = rebase(
        [inv],
        later.map((o) => o.op),
        { base: entry.after, doc: this.doc },
      );
      const next = r.ops[0];
      if (!next || r.conflicts.length) {
        skipped++;
        continue;
      }
      const [res] = this.submitAs(by, [{ ...next, ts: this.now() }]);
      if (res?.status === "accepted") reverted++;
      else skipped++;
    }
    this.sessions.delete(sessionId);
    return { reverted, skipped };
  }
}

function logged(o: StoredOp): LoggedOp {
  return { seq: o.seq, op: o.op, client: o.client, actor: o.actor, kind: o.kind };
}
