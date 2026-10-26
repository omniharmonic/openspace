/**
 * Discount codes (PRD §5.6): Stripe coupons + promotion codes on the shop's own account; Stripe
 * Checkout shows the code field (`allow_promotion_codes`) and applies them — the Hub never
 * computes discounted prices itself.
 */
import { z } from "zod";
import { randomId, sha256Hex } from "../lib/crypto";
import { conflict, HttpError, notFound } from "../lib/errors";
import { stripeForSite } from "./commerce";
import type { Services } from "./index";

export const DiscountInputSchema = z
  .strictObject({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{3,40}$/, { message: "Use 3–40 letters, numbers, - or _." }),
    percentOff: z.number().min(1).max(100).optional(),
    amountOff: z.number().int().min(1).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .refine((d) => (d.percentOff === undefined) !== (d.amountOff === undefined), {
    message: "Choose a percentage or a fixed amount off.",
  })
  .refine((d) => d.amountOff === undefined || !!d.currency, {
    message: "A fixed amount off needs a currency.",
  });

interface DiscountRow {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  max_redemptions: number | null;
  expires_at: number | null;
  stripe_promotion_code: string | null;
  active: number;
  created_at: number;
}

export interface DiscountView {
  id: string;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  maxRedemptions: number | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

const view = (r: DiscountRow): DiscountView => ({
  id: r.id,
  code: r.code,
  percentOff: r.percent_off,
  amountOff: r.amount_off,
  currency: r.currency,
  maxRedemptions: r.max_redemptions,
  expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  active: !!r.active,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function listDiscounts(db: D1Database, siteId: string): Promise<DiscountView[]> {
  const rows = await db
    .prepare("SELECT * FROM discount_codes WHERE site_id = ? ORDER BY created_at DESC")
    .bind(siteId)
    .all<DiscountRow>();
  return rows.results.map(view);
}

export async function createDiscount(
  services: Services,
  siteId: string,
  input: z.infer<typeof DiscountInputSchema>,
): Promise<DiscountView> {
  const code = input.code.toUpperCase();
  const exists = await services.db
    .prepare("SELECT 1 AS x FROM discount_codes WHERE site_id = ? AND code = ?")
    .bind(siteId, code)
    .first();
  if (exists) throw conflict("code_taken", "That code already exists.");
  const expiresAt = input.expiresAt ? Date.parse(input.expiresAt) : undefined;
  if (expiresAt !== undefined && expiresAt <= services.now())
    throw new HttpError(422, "invalid_date", "The end date must be in the future.");
  const { api } = await stripeForSite(services, siteId);
  // Idempotency keys: a retried or concurrent create of the same code makes one coupon and one
  // promotion code at Stripe.
  // The key covers the parameters too, so re-creating a code with different terms (after the
  // first was deactivated, say) never gets the old coupon back from Stripe's idempotency cache.
  const terms = await sha256Hex(
    JSON.stringify([
      input.percentOff,
      input.amountOff,
      input.currency,
      input.maxRedemptions,
      expiresAt,
    ]),
  );
  const key = `discount-${siteId}-${code}-${terms.slice(0, 16)}`;
  const coupon = await api.createCoupon({
    name: code,
    idempotencyKey: `${key}-coupon`,
    ...(input.percentOff !== undefined ? { percentOff: input.percentOff } : {}),
    ...(input.amountOff !== undefined
      ? { amountOff: input.amountOff, currency: input.currency }
      : {}),
  });
  const promo = await api.createPromotionCode({
    coupon: coupon.id,
    code,
    idempotencyKey: `${key}-promo`,
    ...(input.maxRedemptions ? { maxRedemptions: input.maxRedemptions } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });
  const id = randomId("dsc", 10);
  const ins = await services.db
    .prepare(
      `INSERT INTO discount_codes (id, site_id, code, percent_off, amount_off, currency, max_redemptions,
         expires_at, stripe_coupon, stripe_promotion_code, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT (site_id, code) DO NOTHING`,
    )
    .bind(
      id,
      siteId,
      code,
      input.percentOff ?? null,
      input.amountOff ?? null,
      input.currency ?? null,
      input.maxRedemptions ?? null,
      expiresAt ?? null,
      coupon.id,
      promo.id,
      services.now(),
    )
    .run();
  // Lost a concurrent create of the same code (the Stripe objects are shared via the keys).
  if ((ins.meta.changes ?? 0) !== 1) throw conflict("code_taken", "That code already exists.");
  const row = await services.db
    .prepare("SELECT * FROM discount_codes WHERE id = ?")
    .bind(id)
    .first<DiscountRow>();
  return view(row as DiscountRow);
}

export async function setDiscountActive(
  services: Services,
  siteId: string,
  id: string,
  active: boolean,
): Promise<DiscountView> {
  const row = await services.db
    .prepare("SELECT * FROM discount_codes WHERE id = ? AND site_id = ?")
    .bind(id, siteId)
    .first<DiscountRow>();
  if (!row) throw notFound("We couldn't find that code.");
  if (row.stripe_promotion_code) {
    const { api } = await stripeForSite(services, siteId);
    await api.setPromotionCodeActive(row.stripe_promotion_code, active);
  }
  await services.db
    .prepare("UPDATE discount_codes SET active = ? WHERE id = ?")
    .bind(active ? 1 : 0, id)
    .run();
  return view({ ...row, active: active ? 1 : 0 });
}
