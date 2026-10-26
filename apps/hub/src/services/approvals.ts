import type { Op } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { z } from "zod";
import { audit } from "../db/audit";
import type { User } from "../db/users";
import type { HubBindings } from "../env";
import { HttpError, notFound } from "../lib/errors";
import { roomStub, type SubmitResult } from "../room";
import type { Services } from "./index";
import { requireRole, siteForUser } from "./sites";

/**
 * Contributor approval queue (PRD §4.5): Contributors may only save collection items as drafts;
 * the DraftRoom records each in `approvals`. Editors and above approve (the item is published
 * through an ordinary `collection.upsert` op) or reject (with an optional note).
 */

export interface ApprovalView {
  id: string;
  collection: string;
  slug: string;
  title: string | null;
  submittedBy: { userId: string; login: string; name: string | null };
  status: "pending" | "approved" | "rejected";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
}

interface ApprovalRow {
  id: string;
  site_id: string;
  collection: string;
  slug: string;
  title: string | null;
  submitted_by: string;
  status: ApprovalView["status"];
  note: string | null;
  created_at: number;
  updated_at: number;
  decided_at: number | null;
  login: string;
  name: string | null;
}

const toView = (r: ApprovalRow): ApprovalView => ({
  id: r.id,
  collection: r.collection,
  slug: r.slug,
  title: r.title,
  submittedBy: { userId: r.submitted_by, login: r.login, name: r.name },
  status: r.status,
  note: r.note,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
});

export const RejectSchema = z.strictObject({ note: z.string().trim().max(1000).optional() });

const SELECT = `SELECT a.*, u.login, u.name FROM approvals a JOIN users u ON u.id = a.submitted_by`;

/** Editors+ see the whole queue; Contributors see their own submissions. */
export async function listApprovals(
  services: Services,
  id: string,
  user: User,
  status: string | undefined,
): Promise<ApprovalView[]> {
  const site = await siteForUser(services, id, user);
  const mine = site.role === "contributor";
  const filter = status && ["pending", "approved", "rejected"].includes(status) ? status : null;
  const r = await services.db
    .prepare(
      `${SELECT} WHERE a.site_id = ? ${mine ? "AND a.submitted_by = ?" : "AND ? IS NOT NULL"}
       ${filter ? "AND a.status = ?" : "AND ? IS NULL"} ORDER BY a.updated_at DESC LIMIT 200`,
    )
    .bind(id, mine ? user.id : "all", filter)
    .all<ApprovalRow>();
  return r.results.map(toView);
}

async function pending(
  services: Services,
  siteId: string,
  approvalId: string,
): Promise<ApprovalRow> {
  const row = await services.db
    .prepare(`${SELECT} WHERE a.id = ? AND a.site_id = ?`)
    .bind(approvalId, siteId)
    .first<ApprovalRow>();
  if (!row) throw notFound("We couldn't find that submission.");
  if (row.status !== "pending")
    throw new HttpError(409, "already_decided", `This submission was already ${row.status}.`);
  return row;
}

/** Approve: publish the draft item (status → published) as the approver. */
export async function approveSubmission(
  env: HubBindings,
  services: Services,
  id: string,
  user: User,
  approvalId: string,
): Promise<ApprovalView> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "editor");
  const row = await pending(services, id, approvalId);
  const room = roomStub(env, id);
  const { doc, seq } = await room.getDocument(id);
  const item = (doc as SiteDocument).collections[row.collection]?.[row.slug];
  if (!item) throw new HttpError(409, "item_missing", "That item was deleted from the draft.");
  const op = {
    op: "collection.upsert",
    collection: row.collection,
    item: { ...item, frontmatter: { ...item.frontmatter, status: "published" } },
    id: `approve-${approvalId}-${services.now().toString(36)}`,
    actor: user.login,
    ts: services.now(),
  } as unknown as Op;
  const { results } = await room.submit(id, {
    ops: [op],
    baseSeq: seq,
    actor: { userId: user.id, kind: "human" },
  });
  const r = results[0] as SubmitResult | undefined;
  if (r?.status !== "accepted")
    throw new HttpError(
      422,
      "approve_failed",
      r && r.status === "rejected" ? r.message : "That item couldn't be published.",
    );
  // The room marks the approval when it sees the published save; make sure it's recorded.
  const now = services.now();
  await services.db
    .prepare(
      "UPDATE approvals SET status = 'approved', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    )
    .bind(user.id, now, now, approvalId)
    .run();
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "approval.approve",
    meta: { approvalId },
  });
  return toView({
    ...((await services.db
      .prepare(`${SELECT} WHERE a.id = ?`)
      .bind(approvalId)
      .first<ApprovalRow>()) as ApprovalRow),
  });
}

/** Reject: the item stays a draft the Contributor can revise; the note tells them why. */
export async function rejectSubmission(
  services: Services,
  id: string,
  user: User,
  approvalId: string,
  note: string | undefined,
): Promise<ApprovalView> {
  const site = await siteForUser(services, id, user);
  requireRole(site, "editor");
  await pending(services, id, approvalId);
  const now = services.now();
  await services.db
    .prepare(
      "UPDATE approvals SET status = 'rejected', note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(note ?? null, user.id, now, now, approvalId)
    .run();
  await audit(services.db, {
    siteId: id,
    actor: user.id,
    action: "approval.reject",
    meta: { approvalId },
  });
  return toView(
    (await services.db
      .prepare(`${SELECT} WHERE a.id = ?`)
      .bind(approvalId)
      .first<ApprovalRow>()) as ApprovalRow,
  );
}
