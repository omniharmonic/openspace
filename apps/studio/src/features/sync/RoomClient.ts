import { blocksRegistry } from "@openspace/blocks";
import { apply, deepEqual, type Op, rebase, validate } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Site } from "../../api/types";
import type { DraftCache } from "./cache";
import {
  type BuildNotice,
  type ClientMessage,
  type ConflictNotice,
  type LoggedOp,
  MAX_OPS_PER_FRAME,
  type RejectCode,
  type RoomConnector,
  type RoomMember,
  type RoomSocket,
  type ServerMessage,
} from "./protocol";

/**
 * Studio's DraftRoom client (arch §5.3).
 *
 * The client keeps two documents in mind:
 * - `confirmed`: the room's document at `seq` (every op up to `seq`, in room order);
 * - the local view shown in the editor: `confirmed` + `pending`, this device's edits the room
 *   hasn't acknowledged yet.
 *
 * Local edits apply instantly (optimistic), are saved to the device (IndexedDB) and are sent
 * with `baseSeq = seq`. Someone else's op advances `confirmed`, and pending edits are rebased
 * over it with the same `@openspace/ops` `rebase` the room runs, so both sides converge; the
 * room's `ack` carries the op as stored, which replaces the local version. When the room says
 * the editor is `stale` (or the connection was away too long) the document is reloaded and the
 * pending edits are replayed on top.
 *
 * The connection reconnects with exponential backoff plus jitter (capped so a returning
 * connection syncs within ~10 s), and after `hubDownMs` without the room the UI says changes
 * are saved on this device.
 */

/** What the room client drives: the editor's document store (see `storeTarget`). */
export interface SyncTarget {
  getDoc(): SiteDocument;
  /** Every op this device applies, in order. */
  onLocalOps(listener: (ops: Op[]) => void): () => void;
  /**
   * Called before a remote change is applied (`ops`) or the whole document is replaced (`null`):
   * an inline text session commits what was typed, or ends if the change touches its block.
   */
  beforeExternalChange(ops: readonly Op[] | null): void;
  /** Show this document. `resetHistory` after a reload that invalidates local undo. */
  setDocument(doc: SiteDocument, options: { resetHistory: boolean }): void;
}

export type ConnectionStatus = "connecting" | "online" | "offline";

export interface RoomSyncState {
  status: ConnectionStatus;
  /** Local edits the room hasn't confirmed. */
  pending: number;
  seq: number;
  /** When the room last saved the draft (a `flushed` notice), or our edits were confirmed. */
  lastSavedAt: number | null;
  /** When the connection was lost; null while connected. */
  offlineSince: number | null;
  /** The room has been unreachable for longer than `hubDownMs`. */
  hubDown: boolean;
  you: { client: string; actor: string; role: string; name: string } | null;
  /** Everyone in the room, including this connection. */
  members: RoomMember[];
  /** Set when access was removed; the client stops. */
  removed: string | null;
}

export type RoomEvent =
  | { type: "conflict"; notice: ConflictNotice }
  | { type: "rejected"; opId: string | null; code: RejectCode; message: string }
  | { type: "remote"; logged: LoggedOp }
  | { type: "reload"; reason: string }
  | { type: "build"; notice: BuildNotice }
  | { type: "published"; sha: string; summary: string; kind: string };

export interface RoomClientTiming {
  /** First reconnect delay (ms). */
  reconnectBaseMs: number;
  /** Longest reconnect delay (ms); keeps "back online → synced" under ~10 s. */
  reconnectMaxMs: number;
  /** Unreachable this long → "Changes are saved on this device". */
  hubDownMs: number;
  /** No `hello` this long after connecting → try again. */
  helloTimeoutMs: number;
  /** Keep-alive ping interval; a silent connection for 2.5× this is treated as lost. */
  heartbeatMs: number;
}

export const DEFAULT_ROOM_TIMING: RoomClientTiming = {
  reconnectBaseMs: 500,
  reconnectMaxMs: 8000,
  hubDownMs: 30_000,
  helloTimeoutMs: 15_000,
  heartbeatMs: 20_000,
};

export interface RoomClientOptions {
  siteId: string;
  target: SyncTarget;
  connect: RoomConnector;
  /** Re-read the room's document (`GET /api/sites/:id/room/document`) after a `stale` reject. */
  fetchDocument: () => Promise<{ document: SiteDocument; seq: number; head?: string | null }>;
  /** Starting point: the room's document at `seq`, plus unconfirmed local edits. */
  initial: { doc: SiteDocument; seq: number; head?: string | null; pending?: Op[] };
  cache?: DraftCache;
  site?: Site;
  timing?: Partial<RoomClientTiming>;
  now?: () => number;
  random?: () => number;
  /** Listen to browser online/offline events (default: when `window` exists). */
  watchNetwork?: boolean;
}

interface PendingOp {
  op: Op;
  sent: boolean;
}

const registry = blocksRegistry();

/** Apply ops in order, keeping the ones that still apply. */
export function foldOps(doc: SiteDocument, ops: readonly Op[]): { doc: SiteDocument; kept: Op[] } {
  let cur = doc;
  const kept: Op[] = [];
  for (const op of ops) {
    const r = validate(cur, op, { registry, trusted: true });
    if (r.ok) {
      cur = r.doc;
      kept.push(op);
    }
  }
  return { doc: cur, kept };
}

/** Apply an op the room accepted. The room already validated it, so fall back to a raw apply. */
function applyConfirmed(doc: SiteDocument, op: Op): SiteDocument | null {
  const r = validate(doc, op, { registry, trusted: true });
  if (r.ok) return r.doc;
  try {
    return apply(doc, op);
  } catch {
    return null;
  }
}

const sameOp = (a: Op, b: Op) => {
  const { ts: _a, actor: _x, ...ra } = a;
  const { ts: _b, actor: _y, ...rb } = b;
  return deepEqual(ra, rb);
};

export class RoomClient {
  readonly state: StoreApi<RoomSyncState>;
  private readonly opts: RoomClientOptions;
  private readonly timing: RoomClientTiming;
  private readonly now: () => number;
  private readonly random: () => number;

  private confirmed: SiteDocument;
  private seq: number;
  private head: string | null;
  private pending: PendingOp[];
  private site: Site | undefined;

  private socket: RoomSocket | null = null;
  /** `hello` received on the current socket. */
  private ready = false;
  private stopped = true;
  private attempt = 0;
  private awaitingReload = false;
  private presence: { page: string | null; selection: string[] } | null = null;
  private lastFrameAt = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private helloTimer: ReturnType<typeof setTimeout> | undefined;
  private hubDownTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private unsubscribeLocal: (() => void) | null = null;
  private readonly listeners = new Set<(e: RoomEvent) => void>();
  private syncWaiters: Array<() => void> = [];

  private persistQueued = false;
  private persisting: Promise<void> = Promise.resolve();

  constructor(options: RoomClientOptions) {
    this.opts = options;
    this.timing = { ...DEFAULT_ROOM_TIMING, ...options.timing };
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.confirmed = options.initial.doc;
    this.seq = options.initial.seq;
    this.head = options.initial.head ?? null;
    this.pending = (options.initial.pending ?? []).map((op) => ({ op, sent: false }));
    this.site = options.site;
    this.state = createStore<RoomSyncState>(() => ({
      status: "connecting",
      pending: this.pending.length,
      seq: this.seq,
      lastSavedAt: null,
      offlineSince: null,
      hubDown: false,
      you: null,
      members: [],
      removed: null,
    }));
  }

  // --- lifecycle --------------------------------------------------------------------------------

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.unsubscribeLocal = this.opts.target.onLocalOps((ops) => this.pushLocal(ops));
    if (this.opts.watchNetwork ?? typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
    this.heartbeat = setInterval(() => this.beat(), this.timing.heartbeatMs);
    this.connect();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribeLocal?.();
    this.unsubscribeLocal = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.helloTimer);
    clearTimeout(this.hubDownTimer);
    clearInterval(this.heartbeat);
    const sock = this.socket;
    this.socket = null;
    this.ready = false;
    try {
      sock?.close(1000, "bye");
    } catch {
      /* already closed */
    }
    this.persistSoon();
  }

  /** Subscribe to room events (conflicts, rejects, remote ops, builds…). */
  on(listener: (e: RoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSite(site: Site): void {
    this.site = site;
    this.persistSoon();
  }

  /** Tell the room what this person is looking at (presence). */
  setPresence(page: string | null, selection: string[]): void {
    const next = { page, selection: selection.slice(0, 50) };
    if (this.presence && deepEqual(this.presence, next)) return;
    this.presence = next;
    if (this.ready) this.send({ type: "presence", ...next });
  }

  /** Reconnect now (e.g. the person pressed "Try again"). */
  reconnectNow(): void {
    if (this.stopped || this.socket) return;
    clearTimeout(this.reconnectTimer);
    this.connect();
  }

  /** Resolves true once every local edit is confirmed (false after `timeoutMs`). */
  whenSynced(timeoutMs = 10_000): Promise<boolean> {
    if (this.ready && this.pending.length === 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.syncWaiters = this.syncWaiters.filter((w) => w !== done);
        resolve(false);
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.syncWaiters.push(done);
    });
  }

  /** The room's document as last confirmed (tests and diagnostics). */
  get confirmedDocument(): SiteDocument {
    return this.confirmed;
  }

  get pendingOps(): Op[] {
    return this.pending.map((p) => p.op);
  }

  // --- connection ---------------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;
    this.ready = false;
    this.patch({ status: this.state.getState().offlineSince ? "offline" : "connecting" });
    let sock: RoomSocket;
    try {
      sock = this.opts.connect(this.seq);
    } catch {
      this.closed(null, 1006);
      return;
    }
    this.socket = sock;
    this.lastFrameAt = this.now();
    sock.onmessage = (data) => {
      if (sock !== this.socket) return;
      this.lastFrameAt = this.now();
      this.frame(data);
    };
    sock.onclose = (code) => this.closed(sock, code);
    clearTimeout(this.helloTimer);
    this.helloTimer = setTimeout(() => {
      if (sock === this.socket && !this.ready) this.drop(sock);
    }, this.timing.helloTimeoutMs);
  }

  /** Close a socket we consider dead and handle it as lost. */
  private drop(sock: RoomSocket): void {
    try {
      sock.close(4000, "timeout");
    } catch {
      /* ignore */
    }
    this.closed(sock, 1006);
  }

  private closed(sock: RoomSocket | null, code: number): void {
    if (sock && sock !== this.socket) return;
    this.socket = null;
    this.ready = false;
    clearTimeout(this.helloTimer);
    if (this.stopped) return;
    if (code === 4003) {
      this.patch({ status: "offline" });
      this.stop();
      return;
    }
    const s = this.state.getState();
    if (s.offlineSince === null) {
      const since = this.now();
      this.patch({ offlineSince: since, status: "offline" });
      clearTimeout(this.hubDownTimer);
      this.hubDownTimer = setTimeout(() => {
        if (this.state.getState().offlineSince !== null) this.patch({ hubDown: true });
      }, this.timing.hubDownMs);
    } else this.patch({ status: "offline" });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    const cap = Math.min(
      this.timing.reconnectMaxMs,
      this.timing.reconnectBaseMs * 2 ** Math.min(this.attempt, 16),
    );
    // "Equal jitter": half fixed, half random, so a crowd of tabs doesn't reconnect in lockstep.
    const delay = Math.round(cap / 2 + (this.random() * cap) / 2);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private onOnline = () => {
    if (this.socket || this.stopped) return;
    this.attempt = 0;
    this.reconnectNow();
  };

  private onOffline = () => {
    const sock = this.socket;
    if (sock) this.drop(sock);
  };

  private beat(): void {
    const sock = this.socket;
    if (!sock || !this.ready) return;
    if (this.now() - this.lastFrameAt > this.timing.heartbeatMs * 2.5) {
      this.drop(sock);
      return;
    }
    try {
      sock.send("ping");
    } catch {
      this.drop(sock);
    }
  }

  private send(msg: ClientMessage): boolean {
    const sock = this.socket;
    if (!sock) return false;
    try {
      sock.send(JSON.stringify(msg));
      return true;
    } catch {
      this.drop(sock);
      return false;
    }
  }

  // --- local edits --------------------------------------------------------------------------------

  private pushLocal(ops: Op[]): void {
    if (!ops.length) return;
    for (const op of ops) this.pending.push({ op, sent: false });
    this.patch({ pending: this.pending.length });
    this.persistSoon();
    this.flush();
  }

  /** Send every unsent pending op, based on the current seq. */
  private flush(): void {
    if (!this.socket || !this.ready || this.awaitingReload) return;
    const unsent = this.pending.filter((p) => !p.sent);
    for (let i = 0; i < unsent.length; i += MAX_OPS_PER_FRAME) {
      const chunk = unsent.slice(i, i + MAX_OPS_PER_FRAME);
      if (!this.send({ type: "ops", ops: chunk.map((p) => p.op), baseSeq: this.seq })) return;
      for (const p of chunk) p.sent = true;
    }
  }

  // --- room messages ------------------------------------------------------------------------------

  private frame(data: string): void {
    if (data === "pong") return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "hello":
        this.hello(msg);
        return;
      case "op":
        this.logged(msg);
        return;
      case "ack":
        this.ack(msg.opId, msg.seq, msg.op);
        return;
      case "reject":
        this.reject(msg.opId, msg.code, msg.message);
        return;
      case "conflict":
        this.emit({ type: "conflict", notice: msg });
        return;
      case "presence":
        this.patch({ members: msg.members });
        return;
      case "flushed":
        this.patch({ lastSavedAt: this.now() });
        return;
      case "reload":
        this.reload(msg.doc, msg.seq, msg.head, msg.reason);
        return;
      case "published":
        this.emit({ type: "published", sha: msg.sha, summary: msg.summary, kind: msg.kind });
        return;
      case "build":
        this.emit({ type: "build", notice: msg });
        return;
      case "removed":
        this.patch({ removed: msg.message });
        return;
      default:
        return;
    }
  }

  private hello(msg: Extract<ServerMessage, { type: "hello" }>): void {
    clearTimeout(this.helloTimer);
    clearTimeout(this.hubDownTimer);
    this.ready = true;
    this.attempt = 0;
    this.patch({
      status: "online",
      offlineSince: null,
      hubDown: false,
      you: msg.you,
      members: msg.members,
    });
    if (msg.doc) this.reload(msg.doc, msg.seq, msg.head, "hello");
    else {
      this.head = msg.head;
      for (const o of msg.ops ?? []) {
        if (!this.ready) return; // a gap triggered a resync
        this.logged(o);
      }
    }
    // Anything not confirmed by now goes again; the room dedupes by op id.
    for (const p of this.pending) p.sent = false;
    this.flush();
    if (this.presence) this.send({ type: "presence", ...this.presence });
    this.settled();
  }

  /** An op in room order: someone else's, or our own coming back (after a reconnect). */
  private logged(o: LoggedOp): void {
    if (o.seq <= this.seq) return;
    if (o.seq > this.seq + 1) {
      this.resync();
      return;
    }
    const idx = this.pending.findIndex((p) => p.op.id === o.op.id);
    if (idx >= 0) this.confirmOwn(idx, o.op, o.seq);
    else this.applyRemote(o);
  }

  private ack(opId: string, seq: number, op: Op): void {
    const idx = this.pending.findIndex((p) => p.op.id === opId);
    if (seq <= this.seq) {
      // A resend acknowledged again: it's already part of the confirmed document.
      if (idx >= 0) {
        this.pending.splice(idx, 1);
        this.afterPendingChange(true);
      }
      return;
    }
    if (seq > this.seq + 1) {
      this.resync();
      return;
    }
    if (idx >= 0) this.confirmOwn(idx, op, seq);
    else this.applyRemote({ seq, op, client: "", actor: op.actor, kind: "human" });
  }

  private confirmOwn(idx: number, stored: Op, seq: number): void {
    const local = (this.pending[idx] as PendingOp).op;
    const next = applyConfirmed(this.confirmed, stored);
    if (!next) {
      this.resync();
      return;
    }
    this.confirmed = next;
    this.seq = seq;
    this.pending.splice(idx, 1);
    // The room may have rebased or re-stamped our op: then the local view changes too.
    this.afterPendingChange(idx !== 0 || !sameOp(local, stored));
  }

  private applyRemote(o: LoggedOp): void {
    // Let an inline text session commit what was typed (or end) before the document moves.
    this.opts.target.beforeExternalChange([o.op]);
    const base = this.confirmed;
    const next = applyConfirmed(base, o.op);
    if (!next) {
      this.resync();
      return;
    }
    this.confirmed = next;
    this.seq = o.seq;
    if (this.pending.length) {
      const r = rebase(
        this.pending.map((p) => p.op),
        [o.op],
        { base, doc: next },
      );
      const byId = new Map(r.ops.map((op) => [op.id, op]));
      this.pending = this.pending
        .filter((p) => byId.has(p.op.id))
        .map((p) => ({ ...p, op: byId.get(p.op.id) as Op }));
    }
    this.afterPendingChange(true);
    this.emit({ type: "remote", logged: o });
  }

  private reject(opId: string | null, code: RejectCode, message: string): void {
    if (code === "stale") {
      // The room will send a reload; fetch the document as well in case it doesn't.
      this.awaitingReload = true;
      for (const p of this.pending) p.sent = false;
      void this.refetch();
      return;
    }
    const idx = opId ? this.pending.findIndex((p) => p.op.id === opId) : -1;
    if (idx >= 0) {
      this.pending.splice(idx, 1);
      this.afterPendingChange(true);
    }
    this.emit({ type: "rejected", opId, code, message });
  }

  private async refetch(): Promise<void> {
    try {
      const r = await this.opts.fetchDocument();
      if (this.stopped || !this.awaitingReload) return;
      this.reload(r.document, r.seq, r.head ?? this.head, "stale");
    } catch {
      // Still stale: the next connection's hello brings the document.
      if (this.awaitingReload && this.socket) this.drop(this.socket);
    }
  }

  /** Lost track of the order: ask the room for everything since our seq. */
  private resync(): void {
    if (!this.send({ type: "sync", since: this.seq })) return;
  }

  private reload(doc: SiteDocument, seq: number, head: string | null, reason: string): void {
    // A text session may commit as it ends; hold sending until the new base is in place.
    this.awaitingReload = true;
    this.opts.target.beforeExternalChange(null);
    this.confirmed = doc;
    this.seq = seq;
    this.head = head;
    this.awaitingReload = false;
    for (const p of this.pending) p.sent = false;
    const resetHistory = !["hello", "stale", "resync"].includes(reason);
    this.recompute(resetHistory);
    this.patch({ seq, pending: this.pending.length });
    this.persistSoon();
    if (reason !== "hello") {
      this.emit({ type: "reload", reason });
      this.flush();
    }
  }

  // --- local view -----------------------------------------------------------------------------------

  private afterPendingChange(viewChanged: boolean): void {
    if (viewChanged) this.recompute(false);
    this.patch({
      seq: this.seq,
      pending: this.pending.length,
      ...(this.pending.length === 0 ? { lastSavedAt: this.now() } : {}),
    });
    this.persistSoon();
    this.settled();
  }

  /** Local view = confirmed + pending (dropping edits that no longer apply). */
  private recompute(resetHistory: boolean): void {
    const { doc, kept } = foldOps(
      this.confirmed,
      this.pending.map((p) => p.op),
    );
    if (kept.length !== this.pending.length) {
      const ids = new Set(kept.map((o) => o.id));
      this.pending = this.pending.filter((p) => ids.has(p.op.id));
    }
    if (resetHistory || !deepEqual(doc, this.opts.target.getDoc()))
      this.opts.target.setDocument(doc, { resetHistory });
  }

  private settled(): void {
    if (!this.ready || this.pending.length) return;
    const waiters = this.syncWaiters;
    this.syncWaiters = [];
    for (const w of waiters) w();
  }

  // --- device cache --------------------------------------------------------------------------------

  private persistSoon(): void {
    const cache = this.opts.cache;
    if (!cache || this.persistQueued) return;
    this.persistQueued = true;
    this.persisting = this.persisting.then(async () => {
      this.persistQueued = false;
      try {
        await cache.put({
          siteId: this.opts.siteId,
          doc: this.confirmed,
          seq: this.seq,
          head: this.head,
          pending: this.pending.map((p) => p.op),
          ...(this.site ? { site: this.site } : {}),
          savedAt: this.now(),
        });
      } catch {
        // Storage blocked or full: editing continues; the room still has every sent edit.
      }
    });
  }

  /** Resolves when pending device writes are done (tests). */
  flushCache(): Promise<void> {
    return this.persisting;
  }

  // --- helpers ----------------------------------------------------------------------------------------

  private patch(p: Partial<RoomSyncState>): void {
    this.state.setState(p);
  }

  private emit(e: RoomEvent): void {
    for (const l of this.listeners) l(e);
  }
}
