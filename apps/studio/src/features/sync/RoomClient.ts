import { blocksRegistry } from "@openspace/blocks";
import { apply, deepEqual, type Op, rebase, validate } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Site } from "../../api/types";
import { type DraftCache, draftKey } from "./cache";
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
  /**
   * Every op this device applies, in order. `merged`: the edit continues a typing burst (the
   * client may coalesce it with the burst's unsent op before sending).
   */
  onLocalOps(listener: (ops: Op[], info?: { merged?: boolean }) => void): () => void;
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
  /** The connection keeps failing because the sign-in expired: "Sign in again". */
  authRequired: boolean;
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
  /** After this many failed connections in a row, check whether the sign-in expired. */
  authProbeAfter: number;
  /** A `sync` that hasn't filled a gap after this long falls back to a full reload. */
  resyncTimeoutMs: number;
}

export const DEFAULT_ROOM_TIMING: RoomClientTiming = {
  reconnectBaseMs: 500,
  reconnectMaxMs: 8000,
  hubDownMs: 30_000,
  helloTimeoutMs: 15_000,
  heartbeatMs: 20_000,
  authProbeAfter: 3,
  resyncTimeoutMs: 5000,
};

export interface RoomClientOptions {
  siteId: string;
  target: SyncTarget;
  connect: RoomConnector;
  /** Re-read the room's document (`GET /api/sites/:id/room/document`) after a `stale` reject. */
  fetchDocument: () => Promise<{ document: SiteDocument; seq: number; head?: string | null }>;
  /** Starting point: the room's document at `seq`, plus unconfirmed local edits. */
  initial: {
    doc: SiteDocument;
    seq: number;
    head?: string | null;
    /** Recovered edits; each was made on `pendingBase[id]` (default: `seq`). */
    pending?: Op[];
    pendingBase?: Record<string, number>;
  };
  cache?: DraftCache;
  /** Whose device record this is (records are per person and per tab). */
  owner?: { userId: string; tabId: string };
  /** Is the person still signed in? (Probed after repeated connection failures.) */
  probeAuth?: () => Promise<boolean>;
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
  /**
   * Recovered edits (from this device's saved queue, possibly merged from several tabs) keep
   * the seq they were made on and are sent with it, so the ROOM rebases them and applies its
   * last-writer-wins and delete rules. Live edits have no `base`: they are rebased here as
   * remote ops arrive and sent at the current seq.
   */
  base?: number;
  /** The room said `stale` for this recovered edit: resolve it locally after the reload. */
  stale?: boolean;
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
  /** Room ops applied while recovered edits are waiting (for resolving them after `stale`). */
  private replayed: Array<LoggedOp & { before: SiteDocument }> = [];
  /** Sent live ops removed locally; their notice is shown if the room's never arrives. */
  private awaitingNotice = new Map<string, ReturnType<typeof rebase>["conflicts"][number]>();
  /** Seqs this client has seen in order since it started (remote and own). */
  private readonly seen = new Set<number>();
  /** Actor → display name, from everyone seen in the room. */
  private readonly names = new Map<string, string>();
  /** A document fetch after `stale` is in flight (one per burst). */
  private refetching = false;
  /** The seq a `sync` was last asked from; asking again from it means sync didn't help. */
  private resyncFrom: number | null = null;
  private resyncTimer: ReturnType<typeof setTimeout> | undefined;
  /** Connections in a row that closed before `hello`. */
  private failures = 0;
  private authProbed = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private helloTimer: ReturnType<typeof setTimeout> | undefined;
  private hubDownTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private unsubscribeLocal: (() => void) | null = null;
  private coalesceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFlushAt = 0;
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
    this.pending = (options.initial.pending ?? []).map((op) => ({
      op,
      sent: false,
      // Each recovered op keeps the seq it was really made on (it may be older than this
      // record's seq after earlier sessions): never raise it, or the room would treat an old
      // value as made on a newer base and let it win.
      base: options.initial.pendingBase?.[op.id] ?? options.initial.seq,
    }));
    this.seen.add(options.initial.seq);
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
      authRequired: false,
    }));
  }

  // --- lifecycle --------------------------------------------------------------------------------

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.unsubscribeLocal = this.opts.target.onLocalOps((ops, info) =>
      this.pushLocal(ops, info?.merged === true),
    );
    if (this.opts.watchNetwork ?? typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
    // Leaving the page (or hiding the tab) sends a typing burst's tail right away.
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onLeave);
      document.addEventListener("visibilitychange", this.onLeave);
    }
    this.heartbeat = setInterval(() => this.beat(), this.timing.heartbeatMs);
    // Keep a device copy from the start, so the editor can open offline later.
    this.persistSoon();
    this.connect();
  }

  stop(): void {
    if (this.stopped) return;
    // A typing burst's tail goes out before the socket closes (not via the recovery path).
    this.flushCoalesced();
    this.stopped = true;
    this.unsubscribeLocal?.();
    this.unsubscribeLocal = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
      window.removeEventListener("pagehide", this.onLeave);
      document.removeEventListener("visibilitychange", this.onLeave);
    }
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.helloTimer);
    clearTimeout(this.hubDownTimer);
    clearTimeout(this.resyncTimer);
    this.resyncTimer = undefined;
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
    // Site polls return equal data most of the time: only rewrite the device copy on a change.
    if (this.site && deepEqual(this.site, site)) return;
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
    if (this.stopped) return;
    const sock = this.socket;
    if (sock) {
      if (this.ready) return;
      // A connection that never said hello is hung: close it and start over.
      this.socket = null;
      try {
        sock.close(4000, "retry");
      } catch {
        /* ignore */
      }
    }
    clearTimeout(this.reconnectTimer);
    this.attempt = 0;
    this.connect();
  }

  /** Resolves true once every local edit is confirmed (false after `timeoutMs`). */
  whenSynced(timeoutMs = 10_000): Promise<boolean> {
    // Don't make a waiter sit out a typing burst's coalescing pause.
    this.flushCoalesced();
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
    const hadHello = this.ready;
    this.socket = null;
    this.ready = false;
    // We can't know what reached the room: everything counts as unsent until hello says.
    for (const p of this.pending) p.sent = false;
    clearTimeout(this.helloTimer);
    if (this.stopped) return;
    if (code === 4003) {
      this.patch({ status: "offline" });
      this.stop();
      return;
    }
    // Only connections that never got as far as hello count towards the sign-in check.
    if (!hadHello) this.failures++;
    if (this.failures >= this.timing.authProbeAfter && !this.authProbed && this.opts.probeAuth) {
      this.authProbed = true;
      void this.opts
        .probeAuth()
        .then((signedIn) => {
          if (!signedIn && !this.stopped) this.patch({ authRequired: true });
        })
        .catch(() => {
          // Unreachable: that's the offline case, not a sign-in problem.
          this.authProbed = false;
        });
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

  private onLeave = (e: Event) => {
    if (e.type === "visibilitychange" && document.visibilityState !== "hidden") return;
    this.flushCoalesced();
  };

  /** Send a typing burst's waiting tail now (instead of when its pause ends). */
  private flushCoalesced(): void {
    if (!this.coalesceTimer) return;
    clearTimeout(this.coalesceTimer);
    this.coalesceTimer = undefined;
    this.flush();
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

  private pushLocal(ops: Op[], merged = false): void {
    if (!ops.length) return;
    // A typing burst: the first keystrokes go out at once; later ones replace the burst's
    // unsent update of the same fields (each carries the whole field value) and go out at
    // most every COALESCE_MS, so the room sees a few ops per burst, not one per keystroke.
    const coalesce = merged && ops.every(isFieldUpdate);
    for (const op of ops) {
      if (coalesce) {
        const older = this.pending.findIndex(
          (p) => !p.sent && p.base === undefined && !p.stale && sameFields(p.op, op),
        );
        if (older >= 0) this.pending.splice(older, 1);
      }
      this.pending.push({ op, sent: false });
    }
    this.patch({ pending: this.pending.length });
    this.persistSoon();
    if (!coalesce) {
      this.flush();
      return;
    }
    if (this.coalesceTimer) return;
    const wait = Math.max(0, this.lastFlushAt + COALESCE_MS - Date.now());
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = undefined;
      this.flush();
    }, wait);
  }

  /** Send every unsent pending op, based on the current seq. */
  private flush(): void {
    if (!this.socket || !this.ready || this.awaitingReload) return;
    this.lastFlushAt = Date.now();
    const unsent = this.pending.filter((p) => !p.sent && !p.stale);
    // Consecutive ops with the same base go in one frame (recovered ops carry their own base).
    let i = 0;
    while (i < unsent.length) {
      const baseSeq = (unsent[i] as PendingOp).base ?? this.seq;
      const chunk: PendingOp[] = [];
      while (
        i < unsent.length &&
        chunk.length < MAX_OPS_PER_FRAME &&
        ((unsent[i] as PendingOp).base ?? this.seq) === baseSeq
      )
        chunk.push(unsent[i++] as PendingOp);
      if (!this.send({ type: "ops", ops: chunk.map((p) => p.op), baseSeq })) return;
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
        this.awaitingNotice.delete(msg.opId);
        this.emit({ type: "conflict", notice: msg });
        return;
      case "presence":
        this.learnNames(msg.members);
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
    this.failures = 0;
    this.authProbed = false;
    this.learnNames(msg.members);
    // A fresh hello is a fresh base: whatever reload we were waiting for is superseded (its
    // `ops` bring us up to date, or its `doc` replaces the document below).
    this.awaitingReload = false;
    this.resyncFrom = null;
    clearTimeout(this.resyncTimer);
    this.resyncTimer = undefined;
    this.patch({
      status: "online",
      offlineSince: null,
      hubDown: false,
      authRequired: false,
      you: msg.you,
      members: msg.members,
    });
    // Notices the room owed us for ops we removed locally, lost with the last connection.
    for (const c of this.awaitingNotice.values()) this.emitConflict(c);
    this.awaitingNotice.clear();
    if (msg.doc) this.reload(msg.doc, msg.seq, msg.head, "hello");
    else {
      this.head = msg.head;
      for (const o of msg.ops ?? []) {
        if (o.seq > this.seq + 1) {
          this.resync();
          break;
        }
        this.logged(o);
      }
      // Recovered edits the room called stale, whose reload frame was lost: decide them now.
      this.resolveStaleRecovered();
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
    // The room accepted it after all: no notice owed.
    this.awaitingNotice.delete(opId);
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
    // The room may have rebased or re-stamped our op: then the local view changes too, and an
    // inline text session on that block settles first.
    const changed = idx !== 0 || !sameOp(local, stored);
    if (changed) this.opts.target.beforeExternalChange([stored]);
    const at = this.pending.findIndex((p) => p.op.id === stored.id);
    this.confirmed = next;
    this.seq = seq;
    this.seen.add(seq);
    if (at >= 0) this.pending.splice(at, 1);
    this.prune();
    this.afterPendingChange(changed);
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
    this.seen.add(o.seq);
    if (this.pending.some((p) => p.base !== undefined)) this.replayed.push({ ...o, before: base });
    this.prune();
    // Live edits are rebased here with the room's rules: one that loses (last writer wins,
    // or its target was deleted) is removed, and the person gets "X changed this too" with a
    // one-click restore that re-applies their value as a new edit. Recovered edits are left
    // to the room (sent with their own base).
    const live = this.pending.filter((p) => p.base === undefined);
    if (live.length) {
      const r = rebase(
        live.map((p) => p.op),
        [o.op],
        { base, doc: next },
      );
      const byId = new Map(r.ops.map((op) => [op.id, op]));
      // Ops already sent get the room's own notice (it rejects them as `dropped`); the room
      // never sees unsent ones, so their notice comes from here.
      const unsent = new Set(live.filter((p) => !p.sent).map((p) => p.op.id));
      this.pending = this.pending
        .filter((p) => p.base !== undefined || byId.has(p.op.id))
        .map((p) => (p.base !== undefined ? p : { ...p, op: byId.get(p.op.id) as Op }));
      for (const c of r.conflicts) {
        if (c.winner !== "remote") continue;
        // Unsent: dropped or partly stripped, the room will never know; tell the person now.
        if (unsent.has(c.local.id)) this.emitConflict(c);
        // Sent: the room's own notice is coming; keep ours in case the connection drops first.
        else this.awaitingNotice.set(c.local.id, c);
      }
    }
    this.afterPendingChange(true);
    this.emit({ type: "remote", logged: o });
  }

  private reject(opId: string | null, code: RejectCode, message: string): void {
    if (code === "stale") {
      // A recovered edit older than the room's history: resolve it here after the reload.
      const rec = opId ? this.pending.find((p) => p.op.id === opId && p.base !== undefined) : null;
      if (rec) rec.stale = true;
      // The room will send a reload; fetch the document as well in case it doesn't.
      this.awaitingReload = true;
      for (const p of this.pending) p.sent = false;
      void this.refetch();
      return;
    }
    const found = opId ? this.pending.find((p) => p.op.id === opId) : undefined;
    if (found) {
      // Rolling the edit back moves the document: settle an inline text session first.
      this.opts.target.beforeExternalChange([found.op]);
      this.pending = this.pending.filter((p) => p !== found);
      this.afterPendingChange(true);
    }
    this.emit({ type: "rejected", opId, code, message });
  }

  /** One document fetch per stale burst. */
  private async refetch(reason = "stale"): Promise<void> {
    if (this.refetching) return;
    this.refetching = true;
    try {
      const r = await this.opts.fetchDocument();
      if (this.stopped || !this.awaitingReload) return;
      this.reload(r.document, r.seq, r.head ?? this.head, reason);
    } catch {
      // Still stale: reconnect; the next hello brings the document (or the ops) and clears it.
      if (this.awaitingReload && this.socket) this.drop(this.socket);
    } finally {
      this.refetching = false;
    }
  }

  /**
   * Lost track of the order: ask the room for everything since our seq. If that already
   * didn't help (asked from the same seq again), reload the whole document instead.
   */
  private resync(): void {
    // Already asked from here: frames still in flight will gap too; wait for the answer.
    if (this.resyncTimer && this.resyncFrom === this.seq) return;
    clearTimeout(this.resyncTimer);
    this.resyncFrom = this.seq;
    if (!this.send({ type: "sync", since: this.seq })) return;
    const from = this.seq;
    this.resyncTimer = setTimeout(() => {
      this.resyncTimer = undefined;
      if (this.stopped || this.seq !== from || !this.socket) return;
      // The sync didn't fill the gap: reload the whole document instead.
      this.resyncFrom = null;
      this.awaitingReload = true;
      for (const p of this.pending) p.sent = false;
      void this.refetch("resync");
    }, this.timing.resyncTimeoutMs);
  }

  private reload(doc: SiteDocument, seq: number, head: string | null, reason: string): void {
    // A text session may commit as it ends; hold sending until the new base is in place.
    this.awaitingReload = true;
    this.opts.target.beforeExternalChange(null);
    this.confirmed = doc;
    this.seq = seq;
    this.head = head;
    this.awaitingReload = false;
    // A whole-document jump is not "seen" op by op: recovered edits older than it can't be
    // checked against what they missed.
    this.resolveStaleRecovered();
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

  /**
   * Recovered edits the room called `stale` (made before the room's history begins). Rebase
   * each one here over the room ops this client replayed since its base, with its original ts
   * and actor, so last-writer-wins and deletes still decide: a loser is removed with a conflict
   * notice (restore re-applies it as a new edit), a survivor is sent at the current seq. If this
   * client didn't see every op since the edit's base, it can't tell who wins, so the edit is set
   * aside the same way, never sent over a newer value.
   */
  private resolveStaleRecovered(): void {
    const stale = this.pending.filter((p) => p.stale && p.base !== undefined);
    if (!stale.length) return;
    for (const p of stale) {
      const from = p.base as number;
      let covered = true;
      for (let q = from + 1; q <= this.seq; q++) if (!this.seen.has(q)) covered = false;
      const after = this.replayed.filter((o) => o.seq > from);
      const remotes = after.map((o) => o.op);
      if (covered) {
        // The document the edit was made on, so a section delete reads "X deleted this".
        const baseDoc = after[0]?.before ?? this.confirmed;
        const r = rebase([p.op], remotes, { base: baseDoc, doc: this.confirmed });
        const next = r.ops[0];
        if (next) {
          p.op = next;
          p.base = undefined;
          p.stale = false;
          p.sent = false;
          continue;
        }
        for (const c of r.conflicts) this.emitConflict(c);
        if (!r.conflicts.length) this.setAside(p.op);
      } else this.setAside(p.op);
      this.pending = this.pending.filter((x) => x !== p);
    }
    this.prune();
    this.recompute(false);
    this.patch({ pending: this.pending.length });
    this.persistSoon();
    this.settled();
  }

  /** Keep `seen`/`replayed` only as far back as the oldest recovered edit still needs. */
  private prune(): void {
    let min = Number.POSITIVE_INFINITY;
    for (const p of this.pending) if (p.base !== undefined && p.base < min) min = p.base;
    if (min === Number.POSITIVE_INFINITY) {
      this.replayed = [];
      this.seen.clear();
      this.seen.add(this.seq);
      return;
    }
    this.replayed = this.replayed.filter((o) => o.seq > min);
    for (const q of this.seen) if (q <= min) this.seen.delete(q);
  }

  /** A recovered edit that can't be merged safely: offer it back instead of overwriting. */
  private setAside(op: Op): void {
    this.emit({
      type: "conflict",
      notice: {
        type: "conflict",
        opId: op.id,
        reason: "concurrent-edit",
        message: "An older change from this device couldn’t be merged",
        paths: [],
        winner: "them",
        by: { actor: "", name: "Someone" },
        restore: op,
      },
    });
  }

  private learnNames(members: RoomMember[]): void {
    for (const m of members) this.names.set(m.actor, m.name);
  }

  /** A local edit lost to a remote op: the same notice the room would send. */
  private emitConflict(c: ReturnType<typeof rebase>["conflicts"][number]): void {
    const name = c.remote ? (this.names.get(c.remote.actor) ?? "Someone") : "Someone";
    const message =
      c.reason === "deleted"
        ? `${name} deleted this`
        : c.reason === "duplicate"
          ? `${name} already added this`
          : c.reason === "invalid"
            ? "This change no longer fits"
            : `${name} changed this too`;
    this.emit({
      type: "conflict",
      notice: {
        type: "conflict",
        opId: c.local.id,
        reason: c.reason,
        message,
        paths: c.paths,
        winner: c.winner === "local" ? "you" : "them",
        by: { actor: c.remote?.actor ?? "", name },
        ...(c.winner === "remote" && c.reason === "concurrent-edit" ? { restore: c.local } : {}),
      },
    });
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

  /**
   * Local view = confirmed + pending. Edits that don't apply right now are skipped in the view
   * but stay pending (they may apply once the room's history has been replayed, e.g. edits from
   * another tab made on a newer base); they are still sent, and only the room's reject removes
   * them.
   */
  private recompute(resetHistory: boolean): void {
    const { doc } = foldOps(
      this.confirmed,
      this.pending.map((p) => p.op),
    );
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
    const owner = this.opts.owner;
    if (!cache || !owner || this.persistQueued) return;
    this.persistQueued = true;
    this.persisting = this.persisting.then(async () => {
      this.persistQueued = false;
      try {
        await cache.put({
          key: draftKey(owner.userId, this.opts.siteId, owner.tabId),
          userId: owner.userId,
          tabId: owner.tabId,
          siteId: this.opts.siteId,
          doc: this.confirmed,
          seq: this.seq,
          head: this.head,
          pending: this.pending.map((p) => p.op),
          pendingBase: Object.fromEntries(
            this.pending
              .filter((p) => p.base !== undefined)
              .map((p) => [p.op.id, p.base as number]),
          ),
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

/** Typing bursts reach the room at most this often (each send carries the latest value). */
export const COALESCE_MS = 400;

/** Envelope keys plus `set`: anything else (style, variant, unset) isn't coalesced. */
const FIELD_UPDATE_KEYS = new Set(["id", "actor", "ts", "op", "page", "block", "set"]);
function isFieldUpdate(op: Op): boolean {
  return (
    op.op === "block.update" &&
    Object.keys(op).every((k) => FIELD_UPDATE_KEYS.has(k)) &&
    Object.keys((op as { set?: object }).set ?? {}).length > 0
  );
}

/** Two block updates that set exactly the same fields of the same block (the later wins). */
function sameFields(a: Op, b: Op): boolean {
  if (!isFieldUpdate(a) || !isFieldUpdate(b)) return false;
  const x = a as Op & { page?: string; block?: string; set?: Record<string, unknown> };
  const y = b as Op & { page?: string; block?: string; set?: Record<string, unknown> };
  if (x.page !== y.page || x.block !== y.block) return false;
  const kx = Object.keys(x.set ?? {})
    .sort()
    .join("|");
  const ky = Object.keys(y.set ?? {})
    .sort()
    .join("|");
  return kx !== "" && kx === ky;
}
