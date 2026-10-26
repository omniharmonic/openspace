/**
 * Newsletter subscribers with double opt-in (architecture §9.2, PRD FR-33).
 *
 * - Confirmation tokens are random, stored as SHA-256 only, single use, valid 7 days.
 * - Unsubscribe tokens are stateless HMACs of the subscriber id (`unsubscribeToken`) so every
 *   email — including Task 18's campaigns — can carry a stable RFC 8058 one-click link.
 */
import { confirmSubscriptionEmail, unsubscribeHeaders } from "@openspace/email-render";
import { z } from "zod";
import type { SiteRow } from "../db/sites";
import { base64url, randomId, randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { badRequest, HttpError } from "../lib/errors";
import { emailSite, sendTransactional, siteBaseUrl } from "./email";
import type { Services } from "./index";
import { quotaExceeded, siteQuotaLimits } from "./quotas";

export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed";

export interface SubscriberRow {
  id: string;
  site_id: string;
  email: string;
  status: SubscriberStatus;
  tags: string | null;
  confirmed_at: number | null;
  source: string | null;
  created_at: number | null;
  first_name: string | null;
  confirm_token_hash: string | null;
  confirm_expires_at: number | null;
  unsubscribed_at: number | null;
  updated_at: number | null;
}

export interface SubscriberView {
  id: string;
  email: string;
  firstName: string | null;
  status: SubscriberStatus;
  tags: string[];
  source: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export function parseTags(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function toSubscriberView(r: SubscriberRow): SubscriberView {
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    status: r.status,
    tags: parseTags(r.tags),
    source: r.source,
    createdAt: iso(r.created_at),
    confirmedAt: iso(r.confirmed_at),
    unsubscribedAt: iso(r.unsubscribed_at),
  };
}

export const TagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} _.-]+$/u, { message: "Tags may use letters, numbers, spaces, - _ ." });

export function normalizeEmail(raw: string): string {
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) throw badRequest("Please enter a valid email address.");
  return e;
}

// ---- tokens -----------------------------------------------------------------------------------------

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return base64url(new Uint8Array(sig)).slice(0, 32);
}

/** Stable one-click unsubscribe token for a subscriber (`<id>.<hmac>`). */
export async function unsubscribeToken(key: string, subscriberId: string): Promise<string> {
  return `${subscriberId}.${await hmac(key, `unsubscribe:${subscriberId}`)}`;
}

export async function verifyUnsubscribeToken(key: string, token: string): Promise<string | null> {
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^sub_[0-9a-z]+$/.test(id)) return null;
  return (await timingSafeEqual(sig, await hmac(key, `unsubscribe:${id}`))) ? id : null;
}

export async function unsubscribeUrl(services: Services, subscriberId: string): Promise<string> {
  return `${services.config.hubUrl}/n/unsubscribe/${await unsubscribeToken(services.pub.config.hmacKey, subscriberId)}`;
}

/** RFC 8058 headers when the Hub is on https (the standard requires an https URL). */
export function listUnsubscribeHeaders(url: string): Record<string, string> | undefined {
  return url.startsWith("https://") ? unsubscribeHeaders(url) : undefined;
}

// ---- subscribe / confirm / unsubscribe -------------------------------------------------------------

export async function getSubscriberByEmail(db: D1Database, siteId: string, email: string) {
  return db
    .prepare("SELECT * FROM subscribers WHERE site_id = ? AND email = ?")
    .bind(siteId, email)
    .first<SubscriberRow>();
}

export async function activeSubscriberCount(db: D1Database, siteId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM subscribers WHERE site_id = ? AND status != 'unsubscribed'")
    .bind(siteId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export interface SubscribeInput {
  email: string;
  firstName?: string | null;
  source?: string | null;
  tags?: string[];
}

export type SubscribeOutcome = "pending" | "already_confirmed";

/** Create or refresh a pending subscriber and send the confirmation email. */
export async function subscribe(
  services: Services,
  site: SiteRow,
  input: SubscribeInput,
): Promise<SubscribeOutcome> {
  const { db } = services;
  const now = services.now();
  const email = normalizeEmail(input.email);
  const firstName = input.firstName?.trim().slice(0, 80) || null;
  const existing = await getSubscriberByEmail(db, site.id, email);
  if (existing?.status === "confirmed") return "already_confirmed";
  if (!existing || existing.status === "unsubscribed") {
    const limits = await siteQuotaLimits(db, site.id, services.pub.quotaOverrides);
    if ((await activeSubscriberCount(db, site.id)) >= limits.subscribers)
      throw quotaExceeded("subscriber");
  }
  const token = randomToken(24);
  const tokenHash = await sha256Hex(token);
  const id = existing?.id ?? randomId("sub");
  const tags = JSON.stringify([
    ...new Set([...parseTags(existing?.tags ?? null), ...(input.tags ?? [])]),
  ]);
  await db
    .prepare(
      `INSERT INTO subscribers (id, site_id, email, status, tags, source, created_at, first_name,
         confirm_token_hash, confirm_expires_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id, email) DO UPDATE SET status = 'pending', tags = excluded.tags,
         first_name = COALESCE(excluded.first_name, subscribers.first_name),
         confirm_token_hash = excluded.confirm_token_hash, confirm_expires_at = excluded.confirm_expires_at,
         unsubscribed_at = NULL, updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      site.id,
      email,
      tags,
      input.source?.slice(0, 300) ?? "form",
      now,
      firstName,
      tokenHash,
      now + CONFIRM_TTL_MS,
      now,
    )
    .run();
  const confirmUrl = `${services.config.hubUrl}/n/confirm/${token}`;
  const mail = confirmSubscriptionEmail({
    site: emailSite(site),
    baseUrl: siteBaseUrl(site, services.config.hubUrl),
    confirmUrl,
  });
  await sendTransactional(services, {
    siteId: site.id,
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    kind: "newsletter-confirm",
    fromName: site.name,
  });
  return "pending";
}

export async function confirmSubscription(
  services: Services,
  token: string,
): Promise<{ subscriber: SubscriberRow; site: SiteRow } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { db } = services;
  const now = services.now();
  const row = await db
    .prepare("SELECT * FROM subscribers WHERE confirm_token_hash = ?")
    .bind(await sha256Hex(token))
    .first<SubscriberRow>();
  if (!row || (row.confirm_expires_at ?? 0) < now) return null;
  await db
    .prepare(
      `UPDATE subscribers SET status = 'confirmed', confirmed_at = ?, confirm_token_hash = NULL,
         confirm_expires_at = NULL, unsubscribed_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .bind(now, now, row.id)
    .run();
  const site = await db
    .prepare("SELECT * FROM sites WHERE id = ?")
    .bind(row.site_id)
    .first<SiteRow>();
  if (!site) return null;
  return { subscriber: { ...row, status: "confirmed", confirmed_at: now }, site };
}

export async function unsubscribeByToken(
  services: Services,
  token: string,
  apply: boolean,
): Promise<{ subscriber: SubscriberRow; site: SiteRow | null } | null> {
  const id = await verifyUnsubscribeToken(services.pub.config.hmacKey, token);
  if (!id) return null;
  const { db } = services;
  const row = await db
    .prepare("SELECT * FROM subscribers WHERE id = ?")
    .bind(id)
    .first<SubscriberRow>();
  if (!row) return null;
  const site = await db
    .prepare("SELECT * FROM sites WHERE id = ?")
    .bind(row.site_id)
    .first<SiteRow>();
  if (apply && row.status !== "unsubscribed") {
    const now = services.now();
    await db
      .prepare(
        `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?, confirm_token_hash = NULL,
           updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, id)
      .run();
    return { subscriber: { ...row, status: "unsubscribed", unsubscribed_at: now }, site };
  }
  return { subscriber: row, site };
}

// ---- Studio API -------------------------------------------------------------------------------------

export interface SubscriberQuery {
  status?: SubscriberStatus;
  tag?: string;
  q?: string;
  limit: number;
  cursor?: string;
}

export async function listSubscribers(db: D1Database, siteId: string, q: SubscriberQuery) {
  const where = ["site_id = ?"];
  const args: unknown[] = [siteId];
  if (q.status) {
    where.push("status = ?");
    args.push(q.status);
  }
  if (q.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(subscribers.tags) WHERE json_each.value = ?)");
    args.push(q.tag);
  }
  if (q.q) {
    where.push("(email LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\')");
    const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like, like);
  }
  const base = [...where];
  const baseArgs = [...args];
  if (q.cursor) {
    const [at, id] = q.cursor.split("|");
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    args.push(Number(at), Number(at), id ?? "");
  }
  const rows = await db
    .prepare(
      `SELECT * FROM subscribers WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...args, q.limit + 1)
    .all<SubscriberRow>();
  const page = rows.results.slice(0, q.limit);
  const last = page[page.length - 1];
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) AS unsubscribed
       FROM subscribers WHERE ${base.join(" AND ")}`,
    )
    .bind(...baseArgs)
    .first<{
      total: number;
      confirmed: number | null;
      pending: number | null;
      unsubscribed: number | null;
    }>();
  return {
    subscribers: page.map(toSubscriberView),
    nextCursor: rows.results.length > q.limit && last ? `${last.created_at}|${last.id}` : null,
    counts: {
      total: counts?.total ?? 0,
      confirmed: counts?.confirmed ?? 0,
      pending: counts?.pending ?? 0,
      unsubscribed: counts?.unsubscribed ?? 0,
    },
  };
}

export async function getSubscriber(db: D1Database, siteId: string, id: string) {
  return db
    .prepare("SELECT * FROM subscribers WHERE site_id = ? AND id = ?")
    .bind(siteId, id)
    .first<SubscriberRow>();
}

export async function setSubscriberTags(
  db: D1Database,
  siteId: string,
  ids: string[],
  add: string[],
  remove: string[],
  now: number,
): Promise<number> {
  let changed = 0;
  for (const id of ids) {
    const row = await getSubscriber(db, siteId, id);
    if (!row) continue;
    const tags = new Set(parseTags(row.tags));
    for (const t of add) tags.add(t);
    for (const t of remove) tags.delete(t);
    await db
      .prepare("UPDATE subscribers SET tags = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify([...tags]), now, id)
      .run();
    changed++;
  }
  return changed;
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: Array<{ row: number; email: string; reason: string }>;
}

/**
 * Import subscribers from CSV (header row with an `email` column; optional `first_name`/`name`
 * and `tags` separated by `;` or `|`). The owner attests the people consented (`consent: true`),
 * so imported rows are confirmed; existing unsubscribed people are never re-subscribed.
 */
export async function importSubscribers(
  services: Services,
  siteId: string,
  rows: string[][],
  extraTags: string[],
): Promise<ImportResult> {
  const { db } = services;
  const now = services.now();
  const [header, ...body] = rows;
  if (!header) throw badRequest("The file is empty.");
  const cols = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const emailCol = cols.findIndex((c) => c === "email" || c === "email_address" || c === "e-mail");
  if (emailCol < 0) throw badRequest("The file needs a column named “email”.");
  const nameCol = cols.findIndex((c) => c === "first_name" || c === "name" || c === "firstname");
  const tagsCol = cols.findIndex((c) => c === "tags" || c === "tag");
  if (body.length > 10_000)
    throw new HttpError(413, "too_large", "Import at most 10,000 people at a time.");
  const limits = await siteQuotaLimits(db, siteId, services.pub.quotaOverrides);
  let active = await activeSubscriberCount(db, siteId);
  const result: ImportResult = { added: 0, updated: 0, skipped: [] };
  const stmts: D1PreparedStatement[] = [];
  const seen = new Set<string>();
  for (const [i, r] of body.entries()) {
    const raw = (r[emailCol] ?? "").trim();
    let email: string;
    try {
      email = normalizeEmail(raw);
    } catch {
      result.skipped.push({ row: i + 2, email: raw, reason: "invalid email" });
      continue;
    }
    if (seen.has(email)) {
      result.skipped.push({ row: i + 2, email, reason: "duplicate in file" });
      continue;
    }
    seen.add(email);
    const tags = [
      ...extraTags,
      ...(tagsCol >= 0 ? (r[tagsCol] ?? "").split(/[;|]/) : [])
        .map((t) => t.trim())
        .filter((t) => TagSchema.safeParse(t).success),
    ];
    const existing = await getSubscriberByEmail(db, siteId, email);
    if (existing?.status === "unsubscribed") {
      result.skipped.push({ row: i + 2, email, reason: "unsubscribed" });
      continue;
    }
    if (existing) {
      const merged = [...new Set([...parseTags(existing.tags), ...tags])];
      stmts.push(
        db
          .prepare(
            "UPDATE subscribers SET tags = ?, first_name = COALESCE(first_name, ?), updated_at = ? WHERE id = ?",
          )
          .bind(
            JSON.stringify(merged),
            nameCol >= 0 ? r[nameCol]?.trim() || null : null,
            now,
            existing.id,
          ),
      );
      result.updated++;
      continue;
    }
    if (active >= limits.subscribers) {
      result.skipped.push({ row: i + 2, email, reason: "subscriber limit reached" });
      continue;
    }
    active++;
    stmts.push(
      db
        .prepare(
          `INSERT INTO subscribers (id, site_id, email, status, tags, confirmed_at, source, created_at,
             first_name, updated_at) VALUES (?, ?, ?, 'confirmed', ?, ?, 'import', ?, ?, ?)`,
        )
        .bind(
          randomId("sub"),
          siteId,
          email,
          JSON.stringify([...new Set(tags)]),
          now,
          now,
          nameCol >= 0 ? r[nameCol]?.trim().slice(0, 80) || null : null,
          now,
        ),
    );
    result.added++;
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return result;
}

export async function allSubscribers(db: D1Database, siteId: string): Promise<SubscriberRow[]> {
  return (
    await db
      .prepare("SELECT * FROM subscribers WHERE site_id = ? ORDER BY created_at")
      .bind(siteId)
      .all<SubscriberRow>()
  ).results;
}
