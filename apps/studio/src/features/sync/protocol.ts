import type { Op, OpIssue, Role } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";

/**
 * DraftRoom wire protocol as Studio speaks it. Mirrors `apps/hub/src/room/protocol.ts` (Task 15):
 * JSON text frames over `GET /api/sites/:id/room?since=<seq>`. Every accepted op gets a
 * room-wide, gap-free `seq`; the client sends the last seq it applied as `baseSeq`.
 */

export type ActorKind = "human" | "agent";

export interface RoomMember {
  /** Connection id (one per tab / agent session). */
  client: string;
  actor: string;
  userId: string;
  name: string;
  kind: ActorKind;
  role: Role;
  page: string | null;
  selection: string[];
  /** Agents: what they're doing, e.g. "Claude is editing Home…". */
  activity?: string;
}

export interface LoggedOp {
  seq: number;
  op: Op;
  client: string;
  actor: string;
  kind: ActorKind;
}

export interface ConflictNotice {
  type: "conflict";
  /** The receiver's op this notice is about. */
  opId: string;
  reason: "concurrent-edit" | "deleted" | "duplicate" | "invalid";
  /** Toast copy, e.g. "Ana changed this too". */
  message: string;
  paths: string[];
  /** Whose value was kept. */
  winner: "you" | "them";
  by: { actor: string; name: string };
  /** Re-submit (fresh id/ts) to restore the version that lost. */
  restore?: Op;
}

export type BuildState = "queued" | "in_progress" | "success" | "failure";

export interface PublishError {
  code: string;
  title: string;
  message: string;
  /** What "Fix it for me" does; null when there is no automatic fix. */
  fix: string | null;
}

export interface BuildNotice {
  type: "build";
  state: BuildState;
  sha: string;
  kind: string;
  summary?: string;
  url?: string | null;
  error?: PublishError | null;
}

export type RejectCode = "invalid" | "forbidden" | "stale" | "dropped";

export type ServerMessage =
  | {
      type: "hello";
      you: { client: string; actor: string; role: Role; name: string };
      seq: number;
      head: string;
      doc?: SiteDocument;
      ops?: LoggedOp[];
      members: RoomMember[];
    }
  | { type: "ack"; opId: string; seq: number; op: Op; warnings?: OpIssue[] }
  | { type: "reject"; opId: string | null; code: RejectCode; message: string; errors?: OpIssue[] }
  | ({ type: "op" } & LoggedOp)
  | ConflictNotice
  | { type: "presence"; members: RoomMember[] }
  | { type: "flushed"; seq: number; head: string }
  | { type: "reload"; seq: number; head: string; doc: SiteDocument; reason: string }
  | { type: "published"; sha: string; summary: string; kind: string }
  | BuildNotice
  | { type: "removed"; message: string }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "op"; op: Op; baseSeq?: number }
  | { type: "ops"; ops: Op[]; baseSeq?: number }
  | { type: "presence"; page?: string | null; selection?: string[] }
  | { type: "sync"; since?: number };

/** Most ops one `ops` frame may carry. */
export const MAX_OPS_PER_FRAME = 200;

/**
 * A WebSocket-shaped connection to a room. The HTTP Hub wraps a real `WebSocket`; the mock Hub
 * hands out an in-memory pair. Handlers are assigned by the room client.
 */
export interface RoomSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
}

/** Opens a connection; `since` is the last seq the client has (null for a fresh document). */
export type RoomConnector = (since: number | null) => RoomSocket;
