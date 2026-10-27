/**
 * Members (arch §9.4): passwordless sign-in, the member directory, tiers, Stripe-driven tier
 * changes, page passwords and the dev preview's member session.
 *
 * Magic links: 32 random bytes, stored as SHA-256 only, single use (claimed with a conditional
 * UPDATE), valid 15 minutes. Using one issues a Hub-signed ES256 JWT (5 minutes) and redirects
 * to the site's `/_os/auth/callback?token=…&return=…`, where the site Worker verifies it against
 * the JWKS and sets its own session cookie.
 */
import { magicLinkEmail } from "@omniharmonic/openspace-email-render";
import { z } from "zod";
import type { SiteRow } from "../db/sites";
import type { User } from "../db/users";
import { randomId, randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { conflict, HttpError, notFound } from "../lib/errors";
import { hmacB64 } from "../lib/seal";
import { requireHmacKey } from "../public-env";
import type { TierRow } from "./checkout";
import { growthSettings } from "./commerce";
import { emailSite, sendTransactional, siteBaseUrl } from "./email";
import type { Services } from "./index";
import { hubIssuer, newJti, signJwt } from "./member-keys";
import { normalizeEmail } from "./newsletter";
import { republish, syncWorkerSecrets } from "./worker-secrets";

export const MAGIC_TTL_MS = 15 * 60 * 1000;
export const MEMBER_TOKEN_TTL_SEC = 5 * 60;
/** Sign-in emails per member per hour (beyond that the same answer, no email). */
export const MAGIC_PER_HOUR = 5;

export type MemberStatus = "active" | "blocked";

export interface MemberRow {
  id: string;
  site_id: string;
  email: string;
  tier: string | null;
  stripe_customer: string | null;
  status: MemberStatus;
  created_at: number | null;
  name: string | null;
  subscription_id: string | null;
  source: string | null;
  last_login_at: number | null;
  updated_at: number | null;
}

export interface MemberView {
  id: string;
  email: string;
  name: string | null;
  tier: string | null;
  status: MemberStatus;
  source: string | null;
  paid: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export function toMemberView(m: MemberRow): MemberView {
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
  return {
    id: m.id,
    email: m.email,
    name: m.name,
    tier: m.tier,
    status: m.status,
    source: m.source,
    paid: !!m.subscription_id,
    createdAt: iso(m.created_at),
    lastLoginAt: iso(m.last_login_at),
  };
}

async function memberByEmail(db: D1Database, siteId: string, email: string) {
  return db
    .prepare("SELECT * FROM members WHERE site_id = ? AND email = ?")
    .bind(siteId, email)
    .first<MemberRow>();
}

export async function getMember(db: D1Database, siteId: string, id: string) {
  return db
    .prepare("SELECT * FROM members WHERE site_id = ? AND id = ?")
    .bind(siteId, id)
    .first<MemberRow>();
}

/** Insert a member if missing (race-safe on UNIQUE (site_id, email)); returns the row. */
async function upsertMember(
  services: Services,
  siteId: string,
  email: string,
  init: { name?: string | null; tier?: string | null; source: string },
): Promise<MemberRow> {
  const now = services.now();
  await services.db
    .prepare(
      `INSERT INTO members (id, site_id, email, tier, status, created_at, name, source, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?) ON CONFLICT (site_id, email) DO NOTHING`,
    )
    .bind(
      randomId("mem"),
      siteId,
      email,
      init.tier ?? null,
      now,
      init.name ?? null,
      init.source,
      now,
    )
    .run();
  return (await memberByEmail(services.db, siteId, email)) as MemberRow;
}

/** A path on the site to land on after sign-in (always relative; base path kept). */
export function memberReturnPath(baseUrl: string, raw: string | null | undefined): string {
  const base = new URL(baseUrl);
  const fallback = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control characters
  const v = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!v) return fallback;
  let u: URL;
  try {
    if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) u = new URL(v, base.origin);
    else if (/^https?:\/\//i.test(v)) u = new URL(v);
    else return fallback;
  } catch {
    return fallback;
  }
  if (u.origin !== base.origin) return fallback;
  const basePath = fallback.replace(/\/$/, "");
  const path =
    basePath && !(u.pathname === basePath || u.pathname.startsWith(`${basePath}/`))
      ? `${basePath}${u.pathname}`
      : u.pathname;
  return `${path}${u.search}`.slice(0, 500);
}

export type LoginOutcome = "sent" | "throttled" | "not_member" | "blocked";

/**
 * Email a sign-in link. The visitor always sees the same answer (no member enumeration);
 * invite-only sites only email existing members. No member row is created here: on open sites
 * the member is created when the link is used (`consumeMagicLink`), so typing an address into a
 * form never adds anyone to the directory.
 */
export async function requestMagicLink(
  services: Services,
  site: SiteRow,
  input: { email: string; returnTo?: string | null },
): Promise<LoginOutcome> {
  const email = normalizeEmail(input.email);
  const settings = await growthSettings(services.db, site.id);
  const member = await memberByEmail(services.db, site.id, email);
  if (!member && settings.membersSignup === "invite") return "not_member";
  if (member?.status === "blocked") return "blocked";
  const now = services.now();
  const recent = await services.db
    .prepare(
      "SELECT COUNT(*) AS n FROM member_links WHERE site_id = ? AND email = ? AND created_at > ?",
    )
    .bind(site.id, email, now - 60 * 60 * 1000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAGIC_PER_HOUR) return "throttled";
  const base = siteBaseUrl(site, services.config.hubUrl);
  const token = randomToken(32);
  await services.db
    .prepare(
      `INSERT INTO member_links (token_hash, site_id, email, return_to, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      await sha256Hex(token),
      site.id,
      email,
      memberReturnPath(base, input.returnTo),
      now,
      now + MAGIC_TTL_MS,
    )
    .run();
  const mail = magicLinkEmail({
    site: emailSite(site),
    baseUrl: base,
    url: `${services.config.hubUrl}/m/${site.id}/verify/${token}`,
    expiresInMinutes: MAGIC_TTL_MS / 60_000,
  });
  await sendTransactional(services, {
    siteId: site.id,
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    kind: "member-magic-link",
    fromName: site.name,
  });
  return "sent";
}

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

/** Whether a link is still usable (GET shows a button; it never uses the link up). */
export async function peekMagicLink(services: Services, siteId: string, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return services.db
    .prepare(
      `SELECT l.email FROM member_links l
       WHERE l.token_hash = ? AND l.site_id = ? AND l.used_at IS NULL AND l.expires_at > ?
         AND NOT EXISTS (SELECT 1 FROM members m WHERE m.site_id = l.site_id AND m.email = l.email
                         AND m.status = 'blocked')`,
    )
    .bind(await sha256Hex(token), siteId, services.now())
    .first<{ email: string }>();
}

/**
 * Use a sign-in link (once) and build the site callback URL carrying a Hub-signed token.
 * Creates the member on open sites. Returns null for unknown, expired, used or blocked links.
 */
export async function consumeMagicLink(
  services: Services,
  site: SiteRow,
  token: string,
): Promise<{ redirect: string; member: MemberRow } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const now = services.now();
  const hash = await sha256Hex(token);
  const claimed = await services.db
    .prepare(
      `UPDATE member_links SET used_at = ? WHERE token_hash = ? AND site_id = ?
         AND used_at IS NULL AND expires_at > ? RETURNING email, return_to`,
    )
    .bind(now, hash, site.id, now)
    .all<{ email: string; return_to: string | null }>();
  const row = claimed.results[0];
  if (!row) return null;
  let member = await memberByEmail(services.db, site.id, row.email);
  if (!member) {
    // Invite-only sites only ever email existing members; re-check in case the policy changed.
    if ((await growthSettings(services.db, site.id)).membersSignup === "invite") return null;
    member = await upsertMember(services, site.id, row.email, { source: "signup", tier: null });
  }
  if (member.status !== "active") return null;
  await services.db
    .prepare("UPDATE members SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, member.id)
    .run();
  return { redirect: await memberCallbackUrl(services, site, member, row.return_to), member };
}

/** The site's `/_os/auth/callback?token=…&return=…` with a fresh Hub-signed member token. */
export async function memberCallbackUrl(
  services: Services,
  site: SiteRow,
  member: MemberRow,
  returnTo: string | null | undefined,
): Promise<string> {
  const jwt = await memberToken(services, site, member);
  const base = siteBaseUrl(site, services.config.hubUrl);
  const callback = new URL("_os/auth/callback", base);
  callback.searchParams.set("token", jwt);
  callback.searchParams.set("return", memberReturnPath(base, returnTo));
  return callback.toString();
}

// ---- silent re-sign-in (Hub cookie) ---------------------------------------------------------------

/**
 * Site sessions are short (a day, see site-kit's `MEMBER_SESSION_TTL`). After a sign-in link was
 * used, the Hub remembers the member on its own domain (this cookie, scoped to the site's `/m/`
 * paths) so the site can send them back through `/m/:siteId/login` and get a fresh token —
 * carrying their *current* tier — without another email. Blocked or deleted members don't.
 */
export const HUB_MEMBER_COOKIE = "os_hub_member";
export const HUB_MEMBER_TTL_SEC = 60 * 60 * 24 * 30;

export async function hubMemberCookieValue(services: Services, siteId: string, memberId: string) {
  return signPreviewValue(
    services,
    siteId,
    { kind: "hub-member", sub: memberId },
    HUB_MEMBER_TTL_SEC,
  );
}

/** The member a Hub re-sign-in cookie names, if it is valid and they are still active. */
export async function rememberedMember(
  services: Services,
  siteId: string,
  raw: string | undefined,
): Promise<MemberRow | null> {
  const v = await readPreviewValue(services, siteId, raw);
  if (v?.kind !== "hub-member" || typeof v.sub !== "string") return null;
  const m = await getMember(services.db, siteId, v.sub);
  if (m?.status !== "active") return null;
  await services.db
    .prepare("UPDATE members SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(services.now(), services.now(), m.id)
    .run();
  return m;
}

/** The Hub-signed member token (claims match site-kit's `HubClaims`). */
export async function memberToken(
  services: Services,
  site: SiteRow,
  m: MemberRow,
): Promise<string> {
  const iat = Math.floor(services.now() / 1000);
  return signJwt(services, {
    iss: hubIssuer(services),
    aud: site.id,
    sub: m.id,
    email: m.email,
    ...(m.tier ? { tier: m.tier } : {}),
    iat,
    exp: iat + MEMBER_TOKEN_TTL_SEC,
    jti: newJti(),
  });
}

// ---- directory -----------------------------------------------------------------------------------

export async function listMembers(
  db: D1Database,
  siteId: string,
  q: { tier?: string; status?: MemberStatus; q?: string; limit: number; cursor?: string },
) {
  const where = ["site_id = ?"];
  const args: unknown[] = [siteId];
  if (q.tier) {
    if (q.tier === "free") where.push("tier IS NULL");
    else {
      where.push("tier = ?");
      args.push(q.tier);
    }
  }
  if (q.status) {
    where.push("status = ?");
    args.push(q.status);
  }
  if (q.q) {
    where.push("(email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')");
    const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like, like);
  }
  const total = await db
    .prepare(`SELECT COUNT(*) AS n FROM members WHERE ${where.join(" AND ")}`)
    .bind(...args)
    .first<{ n: number }>();
  if (q.cursor) {
    const [at, id] = q.cursor.split("|");
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    args.push(Number(at), Number(at), id ?? "");
  }
  const rows = await db
    .prepare(
      `SELECT * FROM members WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...args, q.limit + 1)
    .all<MemberRow>();
  const page = rows.results.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    members: page.map(toMemberView),
    total: total?.n ?? 0,
    nextCursor: rows.results.length > q.limit && last ? `${last.created_at}|${last.id}` : null,
  };
}

export const AddMemberSchema = z.strictObject({
  email: z.string().max(254),
  name: z.string().trim().max(120).optional(),
  tier: z.string().max(40).nullable().optional(),
  /** Email them a sign-in link now. */
  invite: z.boolean().optional(),
});

export async function addMember(
  services: Services,
  site: SiteRow,
  input: z.infer<typeof AddMemberSchema>,
): Promise<{ member: MemberView; invited: boolean }> {
  const email = normalizeEmail(input.email);
  if (input.tier) await requireTier(services.db, site.id, input.tier);
  if (await memberByEmail(services.db, site.id, email))
    throw conflict("member_exists", "That person is already a member.");
  const m = await upsertMember(services, site.id, email, {
    name: input.name ?? null,
    tier: input.tier ?? null,
    source: "invite",
  });
  const invited = input.invite
    ? (await requestMagicLink(services, site, { email })) === "sent"
    : false;
  return { member: toMemberView(m), invited };
}

export const PatchMemberSchema = z.strictObject({
  name: z.string().trim().max(120).nullable().optional(),
  tier: z.string().max(40).nullable().optional(),
  status: z.enum(["active", "blocked"]).optional(),
});

export async function patchMember(
  services: Services,
  siteId: string,
  id: string,
  patch: z.infer<typeof PatchMemberSchema>,
): Promise<MemberView> {
  const m = await getMember(services.db, siteId, id);
  if (!m) throw notFound("We couldn't find that member.");
  if (patch.tier) await requireTier(services.db, siteId, patch.tier);
  const now = services.now();
  await services.db
    .prepare(`UPDATE members SET name = ?, tier = ?, status = ?, updated_at = ? WHERE id = ?`)
    .bind(
      patch.name !== undefined ? patch.name : m.name,
      patch.tier !== undefined ? patch.tier : m.tier,
      patch.status ?? m.status,
      now,
      id,
    )
    .run();
  if (patch.status === "blocked")
    // Outstanding sign-in links stop working at once.
    await services.db
      .prepare(
        "UPDATE member_links SET used_at = ? WHERE site_id = ? AND email = ? AND used_at IS NULL",
      )
      .bind(now, siteId, m.email)
      .run();
  return toMemberView((await getMember(services.db, siteId, id)) as MemberRow);
}

export async function deleteMember(db: D1Database, siteId: string, id: string): Promise<number> {
  const res = await db.batch([
    db.prepare("DELETE FROM member_tokens WHERE member_id = ? AND site_id = ?").bind(id, siteId),
    db.prepare("DELETE FROM members WHERE id = ? AND site_id = ?").bind(id, siteId),
  ]);
  return res[1]?.meta.changes ?? 0;
}

// ---- tiers --------------------------------------------------------------------------------------

export const TierInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  /** Minor units; omit / null for a free tier. */
  price: z
    .strictObject({
      amount: z.number().int().min(50).max(100_000_000),
      currency: z.string().regex(/^[A-Z]{3}$/),
      interval: z.enum(["month", "year"]),
    })
    .nullable()
    .optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(1000).optional(),
});

export interface TierView {
  id: string;
  name: string;
  description: string | null;
  price: { amount: number; currency: string; interval: "month" | "year" } | null;
  active: boolean;
  position: number;
  members: number;
}

export async function listTiers(db: D1Database, siteId: string): Promise<TierView[]> {
  const rows = await db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM members m WHERE m.site_id = t.site_id AND m.tier = t.id) AS n
       FROM member_tiers t WHERE t.site_id = ? ORDER BY t.position, t.created_at`,
    )
    .bind(siteId)
    .all<TierRow & { n: number }>();
  return rows.results.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    price:
      t.price_amount && t.currency && t.interval
        ? { amount: t.price_amount, currency: t.currency, interval: t.interval }
        : null,
    active: !!t.active,
    position: t.position,
    members: t.n,
  }));
}

async function requireTier(db: D1Database, siteId: string, id: string) {
  const t = await db
    .prepare("SELECT id FROM member_tiers WHERE id = ? AND site_id = ?")
    .bind(id, siteId)
    .first();
  if (!t) throw new HttpError(422, "invalid_tier", "That membership tier doesn't exist.");
}

export async function saveTier(
  services: Services,
  siteId: string,
  id: string | null,
  input: z.infer<typeof TierInputSchema>,
): Promise<TierView> {
  const now = services.now();
  const tierId = id ?? randomId("tier", 10);
  if (id) {
    const res = await services.db
      .prepare(
        `UPDATE member_tiers SET name = ?, description = COALESCE(?, description),
           price_amount = CASE WHEN ? THEN ? ELSE price_amount END,
           currency = CASE WHEN ? THEN ? ELSE currency END,
           interval = CASE WHEN ? THEN ? ELSE interval END,
           active = COALESCE(?, active), position = COALESCE(?, position), updated_at = ?
         WHERE id = ? AND site_id = ?`,
      )
      .bind(
        input.name,
        input.description ?? null,
        input.price !== undefined ? 1 : 0,
        input.price?.amount ?? null,
        input.price !== undefined ? 1 : 0,
        input.price?.currency ?? null,
        input.price !== undefined ? 1 : 0,
        input.price?.interval ?? null,
        input.active === undefined ? null : input.active ? 1 : 0,
        input.position ?? null,
        now,
        id,
        siteId,
      )
      .run();
    if ((res.meta.changes ?? 0) !== 1) throw notFound("We couldn't find that tier.");
  } else {
    await services.db
      .prepare(
        `INSERT INTO member_tiers (id, site_id, name, description, price_amount, currency, interval,
           active, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        tierId,
        siteId,
        input.name,
        input.description ?? null,
        input.price?.amount ?? null,
        input.price?.currency ?? null,
        input.price?.interval ?? null,
        input.active === false ? 0 : 1,
        input.position ?? 0,
        now,
        now,
      )
      .run();
  }
  const tier = (await listTiers(services.db, siteId)).find((t) => t.id === tierId);
  if (!tier) throw notFound();
  return tier;
}

export async function deleteTier(db: D1Database, siteId: string, id: string): Promise<void> {
  const used = await db
    .prepare("SELECT COUNT(*) AS n FROM members WHERE site_id = ? AND tier = ?")
    .bind(siteId, id)
    .first<{ n: number }>();
  if ((used?.n ?? 0) > 0)
    throw conflict(
      "tier_in_use",
      "Members are on this tier. Move them or turn the tier off instead of deleting it.",
    );
  await db.prepare("DELETE FROM member_tiers WHERE id = ? AND site_id = ?").bind(id, siteId).run();
}

// ---- Stripe → tiers -----------------------------------------------------------------------------

export async function applyMembershipPayment(
  services: Services,
  site: SiteRow,
  p: {
    email: string;
    name: string | null;
    tier: string | null;
    customer: string | null;
    subscription: string | null;
  },
): Promise<string> {
  const email = normalizeEmail(p.email);
  const m = await upsertMember(services, site.id, email, {
    name: p.name,
    tier: p.tier,
    source: "checkout",
  });
  await services.db
    .prepare(
      `UPDATE members SET tier = ?, stripe_customer = COALESCE(?, stripe_customer),
         subscription_id = COALESCE(?, subscription_id), name = COALESCE(name, ?), updated_at = ?
       WHERE id = ?`,
    )
    .bind(p.tier, p.customer, p.subscription, p.name, services.now(), m.id)
    .run();
  return m.id;
}

/** Subscription status → tier: active/trialing keep (or restore) the tier; others drop it. */
export async function applySubscriptionChange(
  services: Services,
  siteId: string,
  sub: { id: string; status: string; tier: string | null; order?: string | null },
): Promise<string | null> {
  if (!sub.id) return null;
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  if (ended)
    // Remember it on the order too: if its follow-ups haven't run yet (events out of order), the
    // tier must not be granted afterwards.
    await services.db
      .prepare(
        `UPDATE orders SET meta_json = json_set(COALESCE(meta_json, '{}'), '$.subscriptionEnded', json('true'))
         WHERE site_id = ? AND (subscription_id = ? OR id = ?)`,
      )
      .bind(siteId, sub.id, sub.order ?? "")
      .run();
  const m = await services.db
    .prepare("SELECT * FROM members WHERE site_id = ? AND subscription_id = ?")
    .bind(siteId, sub.id)
    .first<MemberRow>();
  if (!m) return null;
  const keep = sub.status === "active" || sub.status === "trialing";
  await services.db
    .prepare(
      "UPDATE members SET tier = ?, subscription_id = CASE WHEN ? THEN NULL ELSE subscription_id END, updated_at = ? WHERE id = ?",
    )
    .bind(keep ? (sub.tier ?? m.tier) : null, ended ? 1 : 0, services.now(), m.id)
    .run();
  return m.id;
}

// ---- page passwords -----------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const b64u = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) =>
    c.charCodeAt(0),
  );
};

/** `pbkdf2$<iterations>$<salt>$<hash>` — byte-compatible with site-kit's `hashPagePassword`. */
export async function hashPagePassword(
  password: string,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${b64u(salt)}$${b64u(new Uint8Array(bits))}`;
}

export async function checkPagePassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const candidate = await hashPagePassword(password, fromB64u(salt), Number(iter));
  return timingSafeEqual(candidate, stored);
}

export async function pagePasswords(db: D1Database, siteId: string) {
  return (
    await db
      .prepare("SELECT page_id, hash, updated_at FROM page_passwords WHERE site_id = ?")
      .bind(siteId)
      .all<{ page_id: string; hash: string; updated_at: number }>()
  ).results;
}

/**
 * Set or clear a page's shared password. The hash is kept in the Hub (dev preview gating) and,
 * for the Cloudflare target, written to the Worker's `OS_PAGE_PASSWORDS` secret through the
 * repository's deploy secrets. The password itself is never stored or committed.
 */
export async function setPagePassword(
  services: Services,
  site: SiteRow,
  user: User,
  pageId: string,
  password: string | null,
): Promise<{ pages: string[] }> {
  const now = services.now();
  if (password === null)
    await services.db
      .prepare("DELETE FROM page_passwords WHERE site_id = ? AND page_id = ?")
      .bind(site.id, pageId)
      .run();
  else {
    if (password.length < 4 || password.length > 200)
      throw new HttpError(422, "invalid_password", "Use a password of 4 to 200 characters.");
    await services.db
      .prepare(
        `INSERT INTO page_passwords (site_id, page_id, hash, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (site_id, page_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
      )
      .bind(site.id, pageId, await hashPagePassword(password), now)
      .run();
  }
  const all = await pagePasswords(services.db, site.id);
  if (site.deploy_target === "cloudflare") {
    // The Worker reads the hashes from its own secret: update it and rebuild the live site so
    // the change (or removal) takes effect now, not at the next publish.
    const gh = services.github({ site, user });
    await syncWorkerSecrets(services, site, { gh });
    await republish(services, site, gh);
  }
  return { pages: all.map((r) => r.page_id) };
}

// ---- dev preview sessions (Hub-hosted `/s/:siteId/…`) ------------------------------------------

export const PREVIEW_MEMBER_COOKIE = "os_member";
export const PREVIEW_PASSWORD_COOKIE = "os_pw";
export const PREVIEW_SESSION_TTL_SEC = 60 * 60 * 24 * 7;

/** `payload.sig` cookie value signed with the Hub HMAC key (bound to the site). */
export async function signPreviewValue(
  services: Services,
  siteId: string,
  value: Record<string, unknown>,
  ttlSec = PREVIEW_SESSION_TTL_SEC,
): Promise<string> {
  const key = requireHmacKey(services.pub.config);
  const payload = b64u(
    new TextEncoder().encode(
      JSON.stringify({ ...value, site: siteId, exp: Math.floor(services.now() / 1000) + ttlSec }),
    ),
  );
  return `${payload}.${await hmacB64(key, `preview:${siteId}:${payload}`)}`;
}

export async function readPreviewValue(
  services: Services,
  siteId: string,
  raw: string | undefined,
): Promise<Record<string, unknown> | null> {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const key = requireHmacKey(services.pub.config);
  if (!(await timingSafeEqual(sig, await hmacB64(key, `preview:${siteId}:${payload}`))))
    return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromB64u(payload))) as Record<string, unknown>;
    if (v.site !== siteId || typeof v.exp !== "number" || v.exp < Math.floor(services.now() / 1000))
      return null;
    return v;
  } catch {
    return null;
  }
}
