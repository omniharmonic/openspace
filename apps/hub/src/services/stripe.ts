/**
 * Stripe (arch §9.5) over fetch — no SDK. `StripeApi` is bound to one account:
 *
 * - Connect: the platform key plus `Stripe-Account: acct_…` (the owner's Standard account; no
 *   application fee is ever set).
 * - Sovereign: the owner's own restricted key, no `Stripe-Account` header.
 * - Dev (Global Constraint 8): `DevStripe` keeps sessions in D1 and serves a Hub-hosted fake
 *   checkout page that completes the session by firing a signed event through the same webhook
 *   path real Stripe uses.
 *
 * Webhook signatures: `Stripe-Signature: t=<unix>,v1=<hex hmac>[,v1=…]` over `${t}.${body}`,
 * HMAC-SHA256 with the endpoint secret, checked in constant time with a 5-minute tolerance.
 */
import type { FetchLike } from "../github/http";
import { randomId, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { hmacHex } from "../lib/seal";

export const STRIPE_API = "https://api.stripe.com";
/** Pinned so payloads don't change under us. */
export const STRIPE_VERSION = "2024-06-20";
export const SIGNATURE_TOLERANCE_SEC = 300;

/** Stripe-shaped Checkout Session parameters (subset the Hub uses). */
export interface CheckoutSessionParams {
  mode: "payment" | "subscription";
  line_items: Array<{
    quantity: number;
    price_data: {
      currency: string;
      unit_amount: number;
      product_data: { name: string; metadata?: Record<string, string> };
      recurring?: { interval: "month" | "year" };
    };
  }>;
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  metadata: Record<string, string>;
  customer_email?: string;
  expires_at?: number;
  submit_type?: "pay" | "donate";
  allow_promotion_codes?: boolean;
  automatic_tax?: { enabled: boolean };
  shipping_address_collection?: { allowed_countries: string[] };
  shipping_options?: Array<{
    shipping_rate_data: {
      type: "fixed_amount";
      display_name: string;
      fixed_amount: { amount: number; currency: string };
      delivery_estimate?: {
        minimum?: { unit: "business_day"; value: number };
        maximum?: { unit: "business_day"; value: number };
      };
    };
  }>;
  payment_intent_data?: { metadata: Record<string, string> };
  subscription_data?: { metadata: Record<string, string> };
}

export interface StripeAccountStatus {
  id: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface StripeApi {
  readonly kind: "http" | "dev";
  /** The connected account this client acts on (null: the key's own account). */
  readonly account: string | null;
  createCheckoutSession(
    params: CheckoutSessionParams,
    idempotencyKey?: string,
  ): Promise<{ id: string; url: string }>;
  createRefund(input: {
    paymentIntent: string;
    amount?: number;
    idempotencyKey?: string;
  }): Promise<{ id: string; amount: number; status: string }>;
  /** Platform-level (Connect): create a Standard account and its onboarding link. */
  createAccount(input: { email?: string | null }): Promise<{ id: string }>;
  createAccountLink(input: {
    account: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  retrieveAccount(id: string): Promise<StripeAccountStatus>;
  createCoupon(input: {
    percentOff?: number;
    amountOff?: number;
    currency?: string;
    name: string;
    idempotencyKey?: string;
  }): Promise<{ id: string }>;
  createPromotionCode(input: {
    coupon: string;
    code: string;
    maxRedemptions?: number;
    expiresAt?: number;
    idempotencyKey?: string;
  }): Promise<{ id: string }>;
  setPromotionCodeActive(id: string, active: boolean): Promise<void>;
  /**
   * A subscription invoice's payment (subscription-mode sessions have no payment intent of
   * their own): what refunds and `charge.refunded` events are matched by.
   */
  retrieveInvoice(id: string): Promise<{ paymentIntent: string | null; charge: string | null }>;
  /** Cancel a subscription now (refunded or sold-out subscription orders). */
  cancelSubscription(id: string, idempotencyKey?: string): Promise<void>;
}

export class StripeError extends HttpError {
  constructor(
    status: number,
    readonly stripeCode: string | undefined,
    message: string,
  ) {
    super(
      status >= 500 ? 502 : 402,
      "payment_provider_error",
      `Stripe couldn't complete that: ${message}`,
    );
    this.name = "StripeError";
  }
}

/** Stripe's form encoding: nested objects as `a[b]`, arrays as `a[0][b]`. */
export function stripeForm(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const walk = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) for (const [i, x] of v.entries()) walk(`${prefix}[${i}]`, x);
    else if (typeof v === "object")
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(`${prefix}[${k}]`, x);
    else out.append(prefix, String(v));
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.toString();
}

/** Real Stripe over its REST API. */
export class HttpStripe implements StripeApi {
  readonly kind = "http" as const;
  constructor(
    private readonly secretKey: string,
    private readonly fetchFn: FetchLike,
    readonly account: string | null = null,
  ) {}

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params?: Record<string, unknown>,
    opts: { idempotencyKey?: string; platform?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Stripe-Version": STRIPE_VERSION,
    };
    if (this.account && !opts.platform) headers["Stripe-Account"] = this.account;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    let url = `${STRIPE_API}${path}`;
    let body: string | undefined;
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = stripeForm(params ?? {});
    } else if (params) url += `?${stripeForm(params)}`;
    const res = await this.fetchFn(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: string };
    };
    if (!res.ok)
      throw new StripeError(
        res.status,
        json.error?.code,
        json.error?.message ?? `HTTP ${res.status}`,
      );
    return json;
  }

  async createCheckoutSession(params: CheckoutSessionParams, idempotencyKey?: string) {
    const s = await this.request<{ id: string; url: string }>(
      "POST",
      "/v1/checkout/sessions",
      params as unknown as Record<string, unknown>,
      idempotencyKey ? { idempotencyKey } : {},
    );
    return { id: s.id, url: s.url };
  }

  async retrieveInvoice(id: string) {
    const inv = await this.request<{ payment_intent?: unknown; charge?: unknown }>(
      "GET",
      `/v1/invoices/${encodeURIComponent(id)}`,
    );
    const ref = (v: unknown) =>
      typeof v === "string"
        ? v
        : v && typeof v === "object"
          ? String((v as { id?: unknown }).id ?? "") || null
          : null;
    return { paymentIntent: ref(inv.payment_intent), charge: ref(inv.charge) };
  }

  async cancelSubscription(id: string, idempotencyKey?: string) {
    try {
      await this.request(
        "DELETE",
        `/v1/subscriptions/${encodeURIComponent(id)}`,
        undefined,
        idempotencyKey ? { idempotencyKey } : {},
      );
    } catch (err) {
      // Already canceled: nothing left to do.
      if (err instanceof StripeError && err.status === 404) return;
      throw err;
    }
  }

  async createRefund(input: { paymentIntent: string; amount?: number; idempotencyKey?: string }) {
    const r = await this.request<{ id: string; amount: number; status: string }>(
      "POST",
      "/v1/refunds",
      { payment_intent: input.paymentIntent, amount: input.amount },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
    );
    return { id: r.id, amount: r.amount, status: r.status };
  }

  async createAccount(input: { email?: string | null }) {
    const a = await this.request<{ id: string }>(
      "POST",
      "/v1/accounts",
      { type: "standard", ...(input.email ? { email: input.email } : {}) },
      { platform: true },
    );
    return { id: a.id };
  }

  async createAccountLink(input: { account: string; refreshUrl: string; returnUrl: string }) {
    const l = await this.request<{ url: string }>(
      "POST",
      "/v1/account_links",
      {
        account: input.account,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: "account_onboarding",
      },
      { platform: true },
    );
    return { url: l.url };
  }

  async retrieveAccount(id: string): Promise<StripeAccountStatus> {
    const a = await this.request<{
      id: string;
      charges_enabled?: boolean;
      details_submitted?: boolean;
    }>("GET", `/v1/accounts/${encodeURIComponent(id)}`, undefined, { platform: true });
    return {
      id: a.id,
      chargesEnabled: !!a.charges_enabled,
      detailsSubmitted: !!a.details_submitted,
    };
  }

  async createCoupon(input: {
    percentOff?: number;
    amountOff?: number;
    currency?: string;
    name: string;
    idempotencyKey?: string;
  }) {
    const c = await this.request<{ id: string }>(
      "POST",
      "/v1/coupons",
      {
        name: input.name,
        duration: "once",
        ...(input.percentOff !== undefined ? { percent_off: input.percentOff } : {}),
        ...(input.amountOff !== undefined
          ? { amount_off: input.amountOff, currency: input.currency?.toLowerCase() }
          : {}),
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
    );
    return { id: c.id };
  }

  async createPromotionCode(input: {
    coupon: string;
    code: string;
    maxRedemptions?: number;
    expiresAt?: number;
    idempotencyKey?: string;
  }) {
    const p = await this.request<{ id: string }>(
      "POST",
      "/v1/promotion_codes",
      {
        coupon: input.coupon,
        code: input.code,
        max_redemptions: input.maxRedemptions,
        expires_at: input.expiresAt ? Math.floor(input.expiresAt / 1000) : undefined,
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
    );
    return { id: p.id };
  }

  async setPromotionCodeActive(id: string, active: boolean) {
    await this.request("POST", `/v1/promotion_codes/${encodeURIComponent(id)}`, { active });
  }
}

// ---- DevStripe ------------------------------------------------------------------------------------

export interface DevSession {
  id: string;
  account: string | null;
  status: "open" | "complete" | "expired";
  params: CheckoutSessionParams;
  url: string;
  createdAt: number;
}

/** Fake Stripe for DEV_MODE / no credentials: objects in D1, checkout on the Hub. */
export class DevStripe implements StripeApi {
  readonly kind = "dev" as const;
  constructor(
    private readonly db: D1Database,
    private readonly hubUrl: string,
    private readonly now: () => number,
    readonly account: string | null = null,
  ) {}

  /** Like Stripe: the same idempotency key yields the same object. */
  private async keyedId(prefix: string, key?: string): Promise<string> {
    return key
      ? `${prefix}_${(await sha256Hex(`${this.account ?? ""}|${key}`)).slice(0, 20)}`
      : randomId(prefix);
  }

  private async put(kind: string, id: string, status: string | null, data: unknown) {
    await this.db
      .prepare(
        "INSERT INTO dev_stripe_objects (id, kind, account, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
      )
      .bind(id, kind, this.account, status, JSON.stringify(data), this.now())
      .run();
  }

  async createCheckoutSession(params: CheckoutSessionParams) {
    if (!params.line_items.length) throw new StripeError(400, "invalid", "No line items.");
    for (const li of params.line_items)
      if (!Number.isInteger(li.price_data.unit_amount) || li.price_data.unit_amount < 0)
        throw new StripeError(400, "invalid", "Bad amount.");
    const id = randomId("cs_dev", 20);
    const url = `${this.hubUrl}/dev/stripe/checkout/${id}`;
    await this.put("session", id, "open", { params, url });
    return { id, url };
  }

  /** Honors idempotency keys like Stripe: the same key returns the same refund. */
  async createRefund(input: { paymentIntent: string; amount?: number; idempotencyKey?: string }) {
    const id = input.idempotencyKey
      ? `re_dev_${(await sha256Hex(`${this.account ?? ""}|${input.idempotencyKey}`)).slice(0, 20)}`
      : randomId("re_dev");
    await this.db
      .prepare(
        `INSERT INTO dev_stripe_objects (id, kind, account, status, data_json, created_at)
         VALUES (?, 'refund', ?, 'succeeded', ?, ?) ON CONFLICT (id) DO NOTHING`,
      )
      .bind(id, this.account, JSON.stringify(input), this.now())
      .run();
    const row = await this.db
      .prepare("SELECT data_json FROM dev_stripe_objects WHERE id = ?")
      .bind(id)
      .first<{ data_json: string }>();
    const stored = JSON.parse(row?.data_json ?? "{}") as { amount?: number };
    return { id, amount: stored.amount ?? 0, status: "succeeded" };
  }

  async createAccount(input: { email?: string | null }) {
    const id = randomId("acct_dev");
    await this.put("account", id, "pending", { email: input.email ?? null });
    return { id };
  }

  async createAccountLink(input: { account: string; returnUrl: string }) {
    return {
      url: `${this.hubUrl}/dev/stripe/connect/${input.account}?return=${encodeURIComponent(input.returnUrl)}`,
    };
  }

  async retrieveAccount(id: string): Promise<StripeAccountStatus> {
    const row = await this.db
      .prepare("SELECT status FROM dev_stripe_objects WHERE id = ? AND kind = 'account'")
      .bind(id)
      .first<{ status: string }>();
    if (!row) throw new StripeError(404, "resource_missing", "No such account.");
    const enabled = row.status === "enabled";
    return { id, chargesEnabled: enabled, detailsSubmitted: enabled };
  }

  async createCoupon(input: {
    percentOff?: number;
    amountOff?: number;
    currency?: string;
    name: string;
    idempotencyKey?: string;
  }) {
    const id = await this.keyedId("co_dev", input.idempotencyKey);
    await this.put("coupon", id, null, input);
    return { id };
  }

  async createPromotionCode(input: {
    coupon: string;
    code: string;
    maxRedemptions?: number;
    expiresAt?: number;
    idempotencyKey?: string;
  }) {
    const id = await this.keyedId("promo_dev", input.idempotencyKey);
    await this.put("promotion_code", id, "active", input);
    return { id };
  }

  async retrieveInvoice(id: string) {
    const row = await this.db
      .prepare("SELECT data_json FROM dev_stripe_objects WHERE id = ? AND kind = 'invoice'")
      .bind(id)
      .first<{ data_json: string }>();
    if (!row) throw new StripeError(404, "resource_missing", "No such invoice.");
    const d = JSON.parse(row.data_json) as { payment_intent?: string; charge?: string };
    return { paymentIntent: d.payment_intent ?? null, charge: d.charge ?? null };
  }

  async cancelSubscription(id: string) {
    await this.db
      .prepare(
        `INSERT INTO dev_stripe_objects (id, kind, account, status, data_json, created_at)
         VALUES (?, 'subscription', ?, 'canceled', '{}', ?)
         ON CONFLICT (id) DO UPDATE SET status = 'canceled'`,
      )
      .bind(id, this.account, this.now())
      .run();
  }

  async setPromotionCodeActive(id: string, active: boolean) {
    await this.db
      .prepare("UPDATE dev_stripe_objects SET status = ? WHERE id = ? AND kind = 'promotion_code'")
      .bind(active ? "active" : "inactive", id)
      .run();
  }
}

export async function getDevSession(db: D1Database, id: string): Promise<DevSession | null> {
  const row = await db
    .prepare(
      "SELECT id, account, status, data_json, created_at FROM dev_stripe_objects WHERE id = ? AND kind = 'session'",
    )
    .bind(id)
    .first<{
      id: string;
      account: string | null;
      status: DevSession["status"];
      data_json: string;
      created_at: number;
    }>();
  if (!row) return null;
  const data = JSON.parse(row.data_json) as { params: CheckoutSessionParams; url: string };
  return {
    id: row.id,
    account: row.account,
    status: row.status,
    params: data.params,
    url: data.url,
    createdAt: row.created_at,
  };
}

/** Mark a dev session complete exactly once (concurrent clicks complete it once). */
export async function claimDevSession(
  db: D1Database,
  id: string,
  status: "complete" | "expired",
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE dev_stripe_objects SET status = ? WHERE id = ? AND kind = 'session' AND status = 'open'",
    )
    .bind(status, id)
    .run();
  return (res.meta.changes ?? 0) === 1;
}

/** Active dev promotion code (for the fake checkout page's code field). */
export async function devPromotion(
  db: D1Database,
  account: string | null,
  code: string,
): Promise<{ percentOff?: number; amountOff?: number } | null> {
  const promo = await db
    .prepare(
      `SELECT data_json FROM dev_stripe_objects WHERE kind = 'promotion_code' AND status = 'active'
       AND account IS ? AND json_extract(data_json, '$.code') = ?`,
    )
    .bind(account, code)
    .first<{ data_json: string }>();
  if (!promo) return null;
  const { coupon } = JSON.parse(promo.data_json) as { coupon: string };
  const c = await db
    .prepare("SELECT data_json FROM dev_stripe_objects WHERE id = ? AND kind = 'coupon'")
    .bind(coupon)
    .first<{ data_json: string }>();
  return c ? (JSON.parse(c.data_json) as { percentOff?: number; amountOff?: number }) : null;
}

export async function enableDevAccount(db: D1Database, id: string): Promise<boolean> {
  const res = await db
    .prepare("UPDATE dev_stripe_objects SET status = 'enabled' WHERE id = ? AND kind = 'account'")
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) === 1;
}

// ---- webhook signatures ---------------------------------------------------------------------------

/** Build a `Stripe-Signature` header (DevStripe events and tests). */
export async function signStripePayload(
  payload: string,
  secret: string,
  timestampSec: number,
): Promise<string> {
  return `t=${timestampSec},v1=${await hmacHex(secret, `${timestampSec}.${payload}`)}`;
}

/**
 * Verify a `Stripe-Signature` header against any of `secrets` (endpoint secrets can roll).
 * Rejects malformed headers, timestamps outside the tolerance and non-matching `v1` values.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null | undefined,
  secrets: readonly string[],
  nowSec: number,
  toleranceSec = SIGNATURE_TOLERANCE_SEC,
): Promise<boolean> {
  if (!header || !secrets.length) return false;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "t" && v && /^\d{1,12}$/.test(v)) t = Number(v);
    else if (k === "v1" && v && /^[0-9a-f]{64}$/.test(v)) v1.push(v);
  }
  if (t === null || !v1.length || Math.abs(nowSec - t) > toleranceSec) return false;
  let ok = false;
  for (const secret of secrets) {
    const expected = await hmacHex(secret, `${t}.${payload}`);
    for (const sig of v1) if (await timingSafeEqual(sig, expected)) ok = true;
  }
  return ok;
}
