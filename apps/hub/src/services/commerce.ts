/**
 * Commerce settings, Stripe account resolution (Connect / sovereign / dev) and inventory
 * (arch §9.5, PRD §5.6). Checkout lives in `checkout.ts`; webhooks and orders in `orders.ts`.
 */

import { renderEmail } from "@omniharmonic/openspace-email-render";
import { z } from "zod";
import type { SiteRow } from "../db/sites";
import type { User } from "../db/users";
import { parseRepo } from "../github/types";
import { notConfigured } from "../growth-env";
import { conflict, HttpError } from "../lib/errors";
import { openSecret, sealSecret } from "../lib/seal";
import { emailSite, sendTransactional, siteBaseUrl } from "./email";
import type { StripeTarget } from "./growth";
import type { Services } from "./index";
import { getSettings } from "./settings";
import type { StripeApi } from "./stripe";

// ---- settings -------------------------------------------------------------------------------------

export const ShippingOptionSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  label: z.string().trim().min(1).max(60),
  /** Minor units of the shop currency. */
  amount: z.number().int().min(0).max(10_000_000),
  minDays: z.number().int().min(0).max(90).optional(),
  maxDays: z.number().int().min(0).max(120).optional(),
  /** Free when the order subtotal is at least this (minor units). */
  freeOver: z.number().int().min(0).optional(),
  /**
   * Weight-tiered rate (PRD §5.6): the price of the first tier the parcel's weight fits in
   * (`amount` is then ignored). Heavier parcels than the last tier can't use this option.
   */
  byWeight: z
    .array(
      z.strictObject({
        /** Parcel weight in grams up to and including this. */
        upToGrams: z.number().int().min(1).max(1_000_000),
        amount: z.number().int().min(0).max(10_000_000),
      }),
    )
    .min(1)
    .max(10)
    .refine((t) => t.every((x, i) => i === 0 || x.upToGrams > (t[i - 1]?.upToGrams ?? 0)), {
      message: "Weight tiers must go up",
    })
    .optional(),
});
export type ShippingOption = z.infer<typeof ShippingOptionSchema>;

export interface ShippingRate {
  label: string;
  amount: number;
  minDays?: number;
  maxDays?: number;
}

/**
 * The shipping rates a parcel can use, computed server-side from the catalog's weights and the
 * priced subtotal (never from anything the browser sends): flat rates, weight tiers (an option
 * whose tiers the parcel exceeds is left out), and free-over thresholds.
 */
export function shippingRatesFor(
  options: readonly ShippingOption[],
  parcel: { subtotal: number; weightGrams: number },
): ShippingRate[] {
  const out: ShippingRate[] = [];
  for (const o of options) {
    let amount = o.amount;
    if (o.byWeight) {
      const tier = o.byWeight.find((t) => parcel.weightGrams <= t.upToGrams);
      if (!tier) continue;
      amount = tier.amount;
    }
    if (o.freeOver !== undefined && parcel.subtotal >= o.freeOver) amount = 0;
    out.push({
      label: o.label,
      amount,
      ...(o.minDays !== undefined ? { minDays: o.minDays } : {}),
      ...(o.maxDays !== undefined ? { maxDays: o.maxDays } : {}),
    });
  }
  return out;
}

export const GrowthSettingsSchema = z.object({
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  shippingOptions: z.array(ShippingOptionSchema).max(5).default([]),
  shippingCountries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(100)
    .default(["US"]),
  taxEnabled: z.boolean().default(false),
  allowPromotionCodes: z.boolean().default(true),
  /** Donation limits in major units of the donation's currency. */
  donationMin: z.number().min(0.5).max(1_000_000).default(1),
  donationMax: z.number().min(1).max(10_000_000).default(10_000),
  lowStockThreshold: z.number().int().min(0).max(10_000).default(3),
  /** Who gets low-stock alerts (null: the notification address / owner). */
  alertEmail: z.string().email().max(254).nullable().default(null),
  /** Member sign-up: anyone with an email ("open") or only people you add ("invite"). */
  membersSignup: z.enum(["open", "invite"]).default("open"),
  /** Update bot: merge security updates automatically. */
  autoMergeSecurity: z.boolean().default(true),
});
export type GrowthSettings = z.infer<typeof GrowthSettingsSchema>;

export const PatchGrowthSettingsSchema = z
  .strictObject({
    currency: z.string().regex(/^[A-Z]{3}$/),
    shippingOptions: z.array(ShippingOptionSchema).max(5),
    shippingCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(100),
    taxEnabled: z.boolean(),
    allowPromotionCodes: z.boolean(),
    donationMin: z.number().min(0.5).max(1_000_000),
    donationMax: z.number().min(1).max(10_000_000),
    lowStockThreshold: z.number().int().min(0).max(10_000),
    alertEmail: z.string().email().max(254).nullable(),
    membersSignup: z.enum(["open", "invite"]),
    autoMergeSecurity: z.boolean(),
  })
  .partial();

export interface CommerceRow {
  site_id: string;
  settings_json: string;
  mode: "connect" | "sovereign";
  stripe_account: string | null;
  charges_enabled: number;
  details_submitted: number;
  sovereign_key_enc: string | null;
  sovereign_webhook_enc: string | null;
  updated_at: number;
}

export async function commerceRow(db: D1Database, siteId: string): Promise<CommerceRow | null> {
  return db
    .prepare("SELECT * FROM commerce_settings WHERE site_id = ?")
    .bind(siteId)
    .first<CommerceRow>();
}

function parseSettings(json: string | null | undefined): GrowthSettings {
  let raw: unknown = {};
  try {
    raw = json ? JSON.parse(json) : {};
  } catch {
    raw = {};
  }
  const parsed = GrowthSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : GrowthSettingsSchema.parse({});
}

export async function growthSettings(db: D1Database, siteId: string): Promise<GrowthSettings> {
  return parseSettings((await commerceRow(db, siteId))?.settings_json);
}

async function ensureRow(db: D1Database, siteId: string, now: number) {
  await db
    .prepare(
      "INSERT INTO commerce_settings (site_id, settings_json, updated_at) VALUES (?, '{}', ?) ON CONFLICT (site_id) DO NOTHING",
    )
    .bind(siteId, now)
    .run();
}

export async function patchGrowthSettings(
  db: D1Database,
  siteId: string,
  patch: z.infer<typeof PatchGrowthSettingsSchema>,
  now: number,
): Promise<GrowthSettings> {
  await ensureRow(db, siteId, now);
  const next = GrowthSettingsSchema.parse({ ...(await growthSettings(db, siteId)), ...patch });
  if (next.donationMin > next.donationMax)
    throw new HttpError(
      422,
      "invalid_settings",
      "The smallest donation must be below the largest.",
    );
  await db
    .prepare("UPDATE commerce_settings SET settings_json = ?, updated_at = ? WHERE site_id = ?")
    .bind(JSON.stringify(next), now, siteId)
    .run();
  return next;
}

// ---- payments: Connect / sovereign ------------------------------------------------------------

export interface PaymentsView {
  mode: "connect" | "sovereign";
  provider: "stripe" | "dev";
  account: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** Checkout can take payments right now. */
  ready: boolean;
  /** Sovereign mode: the owner's key is stored (never returned). */
  hasSovereignKey: boolean;
  webhookUrl: string;
}

export function paymentsView(
  services: Services,
  siteId: string,
  row: CommerceRow | null,
): PaymentsView {
  const mode = row?.mode ?? "connect";
  const dev = services.growth.config.stripeDev;
  const charges = !!row?.charges_enabled;
  return {
    mode,
    provider: dev ? "dev" : "stripe",
    account: row?.stripe_account ?? null,
    chargesEnabled: charges,
    detailsSubmitted: !!row?.details_submitted,
    ready:
      mode === "sovereign" ? !!row?.sovereign_key_enc : dev || (!!row?.stripe_account && charges),
    hasSovereignKey: !!row?.sovereign_key_enc,
    webhookUrl:
      mode === "sovereign"
        ? `${services.config.hubUrl}/c/stripe/webhook/${siteId}`
        : `${services.config.hubUrl}/c/stripe/webhook`,
  };
}

const aadKey = (siteId: string) => `stripe-key:${siteId}`;
const aadHook = (siteId: string) => `stripe-webhook:${siteId}`;

/** The Stripe client checkout/refunds use for a site, or a 409 when payments aren't set up. */
export async function stripeForSite(
  services: Services,
  siteId: string,
): Promise<{ api: StripeApi; mode: "connect" | "sovereign" | "dev"; account: string | null }> {
  const row = await commerceRow(services.db, siteId);
  const notReady = () =>
    new HttpError(
      409,
      "payments_not_set_up",
      "This shop can't take payments yet. Please try again later.",
    );
  if (row?.mode === "sovereign") {
    if (!row.sovereign_key_enc) throw notReady();
    const key = await openSecret(services.config, row.sovereign_key_enc, aadKey(siteId));
    const target: StripeTarget = { mode: "sovereign", secretKey: key, account: null };
    return {
      api: services.growth.stripe(target),
      mode: services.growth.config.stripeDev ? "dev" : "sovereign",
      account: null,
    };
  }
  // A production Hub without a platform key can't take Connect payments at all.
  if (!services.growth.config.stripeDev && !services.growth.config.stripeSecretKey)
    throw notConfigured("Payments (STRIPE_SECRET_KEY)");
  if (services.growth.config.stripeDev) {
    // Dev: works with or without a (fake) connected account so checkout demos need no setup.
    const account = row?.stripe_account ?? null;
    return { api: services.growth.stripe({ mode: "connect", account }), mode: "dev", account };
  }
  if (!row?.stripe_account || !row.charges_enabled) throw notReady();
  return {
    api: services.growth.stripe({ mode: "connect", account: row.stripe_account }),
    mode: "connect",
    account: row.stripe_account,
  };
}

/** The sovereign endpoint's webhook secret (null when not configured). */
export async function sovereignWebhookSecret(
  services: Services,
  siteId: string,
): Promise<string | null> {
  const row = await commerceRow(services.db, siteId);
  if (row?.mode !== "sovereign" || !row.sovereign_webhook_enc) return null;
  return openSecret(services.config, row.sovereign_webhook_enc, aadHook(siteId));
}

/** Start (or resume) Stripe Connect onboarding: a Standard account and its onboarding link. */
export async function connectOnboarding(
  services: Services,
  site: SiteRow,
  user: User,
  studioReturn: string,
): Promise<{ url: string; account: string }> {
  const now = services.now();
  await ensureRow(services.db, site.id, now);
  const platform = services.growth.stripe({ mode: "connect", account: null });
  let row = await commerceRow(services.db, site.id);
  let account = row?.stripe_account ?? null;
  if (!account) {
    account = (await platform.createAccount({ email: user.email })).id;
    // Only the first concurrent request stores its account (the other is simply unused).
    await services.db
      .prepare(
        "UPDATE commerce_settings SET stripe_account = ?, updated_at = ? WHERE site_id = ? AND stripe_account IS NULL",
      )
      .bind(account, now, site.id)
      .run();
    row = await commerceRow(services.db, site.id);
    account = row?.stripe_account ?? account;
  }
  const link = await platform.createAccountLink({
    account,
    refreshUrl: studioReturn,
    returnUrl: studioReturn,
  });
  return { url: link.url, account };
}

/** Refresh charges/details flags from Stripe (Studio polls this after onboarding). */
export async function refreshConnectStatus(services: Services, siteId: string) {
  const row = await commerceRow(services.db, siteId);
  if (!row?.stripe_account) return paymentsView(services, siteId, row);
  const status = await services.growth
    .stripe({ mode: "connect", account: null })
    .retrieveAccount(row.stripe_account);
  await services.db
    .prepare(
      "UPDATE commerce_settings SET charges_enabled = ?, details_submitted = ?, updated_at = ? WHERE site_id = ?",
    )
    .bind(status.chargesEnabled ? 1 : 0, status.detailsSubmitted ? 1 : 0, services.now(), siteId)
    .run();
  return paymentsView(services, siteId, await commerceRow(services.db, siteId));
}

const SECRET_KEY_RE = /^(sk|rk)_(live|test)_[A-Za-z0-9]{10,200}$/;
const WEBHOOK_SECRET_RE = /^whsec_[A-Za-z0-9+/=]{10,200}$/;

/**
 * Sovereign mode (arch §9.5): the owner's own restricted key (sealed at rest, never returned).
 * For the Cloudflare target it is also written to the repository's deploy secrets so the site
 * Worker can run checkout and webhooks entirely in the owner's account.
 */
export async function setSovereign(
  services: Services,
  site: SiteRow,
  user: User,
  input: { secretKey: string; webhookSecret: string },
): Promise<PaymentsView> {
  if (!SECRET_KEY_RE.test(input.secretKey))
    throw new HttpError(
      422,
      "invalid_key",
      "That doesn't look like a Stripe secret or restricted key.",
    );
  if (!WEBHOOK_SECRET_RE.test(input.webhookSecret))
    throw new HttpError(
      422,
      "invalid_key",
      "That doesn't look like a Stripe webhook signing secret.",
    );
  const now = services.now();
  await ensureRow(services.db, site.id, now);
  const key = await sealSecret(services.config, input.secretKey, aadKey(site.id));
  const hook = await sealSecret(services.config, input.webhookSecret, aadHook(site.id));
  await services.db
    .prepare(
      `UPDATE commerce_settings SET mode = 'sovereign', sovereign_key_enc = ?, sovereign_webhook_enc = ?,
         updated_at = ? WHERE site_id = ?`,
    )
    .bind(key, hook, now, site.id)
    .run();
  if (site.deploy_target === "cloudflare") {
    const gh = services.github({ site, user });
    await gh.setSecret(parseRepo(site.repo), "OS_STRIPE_SECRET_KEY", input.secretKey);
    await gh.setSecret(parseRepo(site.repo), "OS_STRIPE_WEBHOOK_SECRET", input.webhookSecret);
  }
  return paymentsView(services, site.id, await commerceRow(services.db, site.id));
}

export async function clearSovereign(services: Services, siteId: string): Promise<PaymentsView> {
  await services.db
    .prepare(
      `UPDATE commerce_settings SET mode = 'connect', sovereign_key_enc = NULL, sovereign_webhook_enc = NULL,
         updated_at = ? WHERE site_id = ?`,
    )
    .bind(services.now(), siteId)
    .run();
  return paymentsView(services, siteId, await commerceRow(services.db, siteId));
}

/** The site whose connected account an event came from. */
export async function siteForAccount(db: D1Database, account: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT site_id FROM commerce_settings WHERE stripe_account = ?")
    .bind(account)
    .first<{ site_id: string }>();
  return row?.site_id ?? null;
}

// ---- inventory --------------------------------------------------------------------------------

export interface InventoryRow {
  site_id: string;
  sku: string;
  qty: number;
  low_stock: number | null;
  alerted_at: number | null;
  updated_at: number | null;
}

export async function inventoryFor(
  db: D1Database,
  siteId: string,
  skus: string[],
): Promise<Map<string, InventoryRow>> {
  const out = new Map<string, InventoryRow>();
  for (let i = 0; i < skus.length; i += 50) {
    const chunk = skus.slice(i, i + 50);
    const rows = await db
      .prepare(
        `SELECT * FROM inventory WHERE site_id = ? AND sku IN (${chunk.map(() => "?").join(",")})`,
      )
      .bind(siteId, ...chunk)
      .all<InventoryRow>();
    for (const r of rows.results) out.set(r.sku, r);
  }
  return out;
}

export async function allInventory(db: D1Database, siteId: string): Promise<InventoryRow[]> {
  return (
    await db
      .prepare("SELECT * FROM inventory WHERE site_id = ? ORDER BY sku")
      .bind(siteId)
      .all<InventoryRow>()
  ).results;
}

/** Set (or stop tracking with `qty: null`) a SKU's stock. */
export async function setStock(
  db: D1Database,
  siteId: string,
  sku: string,
  input: { qty: number | null; lowStock?: number | null },
  now: number,
): Promise<InventoryRow | null> {
  if (input.qty === null) {
    await db.prepare("DELETE FROM inventory WHERE site_id = ? AND sku = ?").bind(siteId, sku).run();
    return null;
  }
  await db
    .prepare(
      `INSERT INTO inventory (site_id, sku, qty, low_stock, updated_at, alerted_at) VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT (site_id, sku) DO UPDATE SET qty = excluded.qty,
         low_stock = CASE WHEN ? THEN excluded.low_stock ELSE inventory.low_stock END,
         alerted_at = NULL, updated_at = excluded.updated_at`,
    )
    .bind(siteId, sku, input.qty, input.lowStock ?? null, now, input.lowStock !== undefined ? 1 : 0)
    .run();
  return (await inventoryFor(db, siteId, [sku])).get(sku) ?? null;
}

/** Atomic relative change (restock or correction). Never below zero (409). */
export async function adjustStock(
  db: D1Database,
  siteId: string,
  sku: string,
  delta: number,
  now: number,
): Promise<InventoryRow> {
  try {
    const res = await db
      .prepare(
        `UPDATE inventory SET qty = qty + ?, updated_at = ?,
           alerted_at = CASE WHEN ? > 0 THEN NULL ELSE alerted_at END
         WHERE site_id = ? AND sku = ?`,
      )
      .bind(delta, now, delta, siteId, sku)
      .run();
    if ((res.meta.changes ?? 0) !== 1)
      throw new HttpError(404, "not_found", "That item's stock isn't tracked yet.");
  } catch (err) {
    if (isOversell(err)) throw conflict("insufficient_stock", "Stock can't go below zero.");
    throw err;
  }
  return (await inventoryFor(db, siteId, [sku])).get(sku) as InventoryRow;
}

/** The `inventory_no_oversell` trigger aborted the statement/batch. */
export function isOversell(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}`
      : String(err);
  return msg.includes("insufficient_stock");
}

/**
 * Low-stock alerts: SKUs at or below their threshold that haven't been alerted since their last
 * restock. Marks them alerted first (so concurrent orders alert once), then emails the owner.
 */
export async function lowStockAlerts(
  services: Services,
  site: SiteRow,
  skus: string[],
  titles: Map<string, string>,
): Promise<string[]> {
  if (!skus.length) return [];
  const settings = await growthSettings(services.db, site.id);
  const now = services.now();
  const alerted: string[] = [];
  for (const sku of skus) {
    const res = await services.db
      .prepare(
        `UPDATE inventory SET alerted_at = ? WHERE site_id = ? AND sku = ? AND alerted_at IS NULL
           AND qty <= COALESCE(low_stock, ?)`,
      )
      .bind(now, site.id, sku, settings.lowStockThreshold)
      .run();
    if ((res.meta.changes ?? 0) === 1) alerted.push(sku);
  }
  if (!alerted.length) return alerted;
  const to = settings.alertEmail ?? (await ownerNotifyEmail(services, site));
  if (!to) return alerted;
  const rows = await inventoryFor(services.db, site.id, alerted);
  const lines = alerted.map(
    (sku) => `${titles.get(sku) ?? sku} (${sku}): ${rows.get(sku)?.qty ?? 0} left`,
  );
  let n = 0;
  const blk = (type: string, fields: Record<string, unknown>) => ({
    id: `blk_lowst${(++n).toString().padStart(5, "0")}` as `blk_${string}`,
    type,
    v: 1,
    fields,
  });
  const para = (text: string) =>
    blk("text", {
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    });
  const mail = renderEmail({
    site: emailSite(site),
    baseUrl: siteBaseUrl(site, services.config.hubUrl),
    title: "Running low",
    preheader: `${alerted.length} item${alerted.length === 1 ? "" : "s"} running low`,
    blocks: [blk("heading", { text: "Running low on stock", level: 1 }), ...lines.map(para)],
  } as Parameters<typeof renderEmail>[0]);
  await sendTransactional(services, {
    siteId: site.id,
    to,
    subject: `Running low: ${lines[0]}${alerted.length > 1 ? ` and ${alerted.length - 1} more` : ""}`,
    html: mail.html,
    text: mail.text,
    kind: "low-stock",
    fromName: site.name,
  });
  return alerted;
}

/** The owner's notification address: settings.notifyEmail, else the owner's account email. */
export async function ownerNotifyEmail(services: Services, site: SiteRow): Promise<string | null> {
  const s = await getSettings(services.db, site.id);
  if (s.notifyEmail) return s.notifyEmail;
  const owner = await services.db
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(site.owner_id)
    .first<{ email: string | null }>();
  return owner?.email ?? null;
}
