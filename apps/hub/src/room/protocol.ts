import type { Op, OpIssue, Role } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { z } from "zod";

/**
 * DraftRoom wire protocol (arch §5.3). JSON text frames over the WebSocket at
 * `GET /api/sites/:id/room?since=<seq>`; the same result shapes come back from the HTTP RPC
 * used by MCP (`POST /api/sites/:id/room/ops`).
 *
 * Every accepted op gets a room-wide, gap-free `seq`. A client remembers the last `seq` it has
 * applied and sends it as `baseSeq` with each op, so the room can rebase the op over whatever the
 * sender had not seen yet.
 */

// --- client → room ----------------------------------------------------------------------------

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("op"),
    /** An `Op` (validated by the room with `parseOp`). */
    op: z.unknown(),
    /** Last seq the client had applied when it made the op. */
    baseSeq: z.int().min(0).optional(),
  }),
  z.object({
    type: z.literal("ops"),
    ops: z.array(z.unknown()).min(1).max(200),
    baseSeq: z.int().min(0).optional(),
  }),
  z.object({
    type: z.literal("presence"),
    page: z.string().max(64).nullable().optional(),
    selection: z.array(z.string().max(64)).max(50).optional(),
  }),
  /** Ask for everything since `since` again (after a `resync` notice or a gap). */
  z.object({ type: z.literal("sync"), since: z.int().min(0).optional() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- room → client ----------------------------------------------------------------------------

export type ActorKind = "human" | "agent";

export interface Member {
  /** Connection id (one per tab / MCP session). */
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
  /** The op this notice is about (the receiver's own op). */
  opId: string;
  reason: "concurrent-edit" | "deleted" | "duplicate" | "invalid";
  /** Toast copy, e.g. "Ana changed this too". */
  message: string;
  paths: string[];
  /** Whose value was kept. */
  winner: "you" | "them";
  by: { actor: string; name: string };
  /**
   * Re-submit this op (with a fresh id/ts) to restore the version that lost — "restore the
   * other version".
   */
  restore?: Op;
}

export type BuildState = "queued" | "in_progress" | "success" | "failure";

export interface BuildNotice {
  type: "build";
  state: BuildState;
  sha: string;
  kind: string;
  summary?: string;
  url?: string | null;
  /** Failure in plain language (build-errors.ts). */
  error?: { code: string; title: string; message: string; fix: string | null } | null;
}

export type ServerMessage =
  | {
      type: "hello";
      you: { client: string; actor: string; role: Role; name: string };
      seq: number;
      /** Draft head the document was loaded from / last flushed to. */
      head: string;
      /** Full document when the client's `since` is missing or too old; else omitted. */
      doc?: SiteDocument;
      /** Ops after `since` (when `doc` is omitted). */
      ops?: LoggedOp[];
      members: Member[];
    }
  | { type: "ack"; opId: string; seq: number; op: Op; warnings?: OpIssue[] }
  | {
      type: "reject";
      opId: string | null;
      code: "invalid" | "forbidden" | "stale" | "dropped";
      message: string;
      errors?: OpIssue[];
    }
  | ({ type: "op" } & LoggedOp)
  | ConflictNotice
  | { type: "presence"; members: Member[] }
  | { type: "flushed"; seq: number; head: string }
  | { type: "reload"; seq: number; head: string; doc: SiteDocument; reason: string }
  | { type: "published"; sha: string; summary: string; kind: string }
  | BuildNotice
  | { type: "removed"; message: string }
  | { type: "error"; message: string };

/** Result of submitting one op (WebSocket ack/reject, HTTP RPC item). */
export type SubmitResult =
  | {
      status: "accepted";
      opId: string;
      seq: number;
      op: Op;
      conflicts: ConflictNotice[];
      warnings: OpIssue[];
      duplicate?: boolean;
    }
  | {
      status: "rejected";
      opId: string | null;
      code: "invalid" | "forbidden" | "stale" | "dropped";
      message: string;
      errors?: OpIssue[];
      conflicts: ConflictNotice[];
    };
