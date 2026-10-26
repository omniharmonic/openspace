/**
 * Stripe webhooks and the orders dashboard (arch §9.5).
 *
 * Webhooks are verified (`verifyStripeSignature`), tied to a site (Connect: the event's
 * `account` → that site's connected account; sovereign: the per-site endpoint), and idempotent:
 * every state change is a conditional UPDATE, and stock is decremented in the same D1 batch
 * (transaction) that claims the order, guarded by `stock_applied`, so redelivered or concurrent
 * events never decrement twice. The `inventory_no_oversell` trigger aborts a batch that would
 * oversell; that order is refunded and marked `out_of_stock` instead.
 */
import { esc, renderEmail } from "@openspace/email-render";
import type { Block } from "@openspace/schema";
import { getSite, type SiteRow } from "../db/sites";
import { DEV_STRIPE_WEBHOOK_SECRET } from "../growth-env";
import { timingSafeEqual } from "../lib/crypto";
import { HttpError, notFound } from "../lib/errors";
import type { Logger } from "../lib/log";
import { hmacB64 } from "../lib/seal";
import { requireHmacKey } from "../public-env";
import type { OrderItem } from "./checkout";
import {
  isOversell,
  lowStockAlerts,
  siteForAccount,
  sovereignWebhookSecret,
  stripeForSite,
} from "./commerce";
import { emailSite, sendTransactional, siteBaseUrl } from "./email";
import type { Services } from "./index";
import { applyMembershipPayment, applySubscriptionChange } from "./members";
import { verifyStripeSignature } from "./stripe";

export type OrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "out_of_stock"
  | "expired"
  | "failed";

export interface OrderRow {
  id: string;
  site_id: string;
  stripe_session: string | null;
  status: OrderStatus;
  total: number;
  currency: string;
  items_json: string;
  shipping_json: string | null;
  created_at: number;
  number: number | null;
  kind: "order" | "donation" | "membership";
  mode: string | null;
  stripe_account: string | null;
  payment_intent: string | null;
  subscription_id: string | null;
  email: string | null;
  customer_name: string | null;
  amounts_json: string | null;
  stock_applied: number;
  fulfillment: "unfulfilled" | "fulfilled";
  fulfilled_at: number | null;
  tracking: string | null;
  refunded: number;
  note: string | null;
  meta_json: string | null;
  paid_at: number | null;
  updated_at: number | null;
}

const parse = <T>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

export function orderItems(o: Pick<OrderRow, "items_json">): OrderItem[] {
  return parse<OrderItem[]>(o.items_json, []);
}

export interface OrderView {
  id: string;
  number: number | null;
  kind: OrderRow["kind"];
  status: OrderStatus;
  fulfillment: OrderRow["fulfillment"];
  email: string | null;
  customerName: string | null;
  currency: string;
  total: number;
  refunded: number;
  amounts: Record<string, number>;
  items: OrderItem[];
  shipping: { name?: string; address?: Record<string, string | null> } | null;
  tracking: string | null;
  note: string | null;
  mode: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
}

export function toOrderView(o: OrderRow): OrderView {
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
  return {
    id: o.id,
    number: o.number,
    kind: o.kind,
    status: o.status,
    fulfillment: o.fulfillment,
    email: o.email,
    customerName: o.customer_name,
    currency: o.currency,
    total: o.total,
    refunded: o.refunded,
    amounts: parse(o.amounts_json, {}),
    items: orderItems(o),
    shipping: parse(o.shipping_json, null),
    tracking: o.tracking,
    note: o.note,
    mode: o.mode,
    createdAt: new Date(o.created_at).toISOString(),
    paidAt: iso(o.paid_at),
    fulfilledAt: iso(o.fulfilled_at),
  };
}

export async function getOrder(db: D1Database, siteId: string, id: string) {
  return db
    .prepare("SELECT * FROM orders WHERE site_id = ? AND id = ?")
    .bind(siteId, id)
    .first<OrderRow>();
}

// ---- webhook entry point ------------------------------------------------------------------------

export type WebhookEndpoint = { kind: "connect" } | { kind: "sovereign"; siteId: string };

interface StripeEvent {
  id: string;
  type: string;
  account?: string | null;
  livemode?: boolean;
  created?: number;
  data: { object: Record<string, unknown> };
}

export interface WebhookResult {
  status: 200 | 400 | 404 | 503;
  body: Record<string, unknown>;
}

/** Verify and process one webhook delivery. Throws (→ 500, Stripe retries) on processing errors. */
export async function handleStripeWebhook(
  services: Services,
  raw: string,
  signature: string | null,
  endpoint: WebhookEndpoint,
  log?: Logger,
): Promise<WebhookResult> {
  let secrets: string[];
  if (endpoint.kind === "connect") secrets = services.growth.config.connectWebhookSecrets;
  else {
    const s = await sovereignWebhookSecret(services, endpoint.siteId);
    secrets = s ? [s] : [];
    if (services.growth.config.stripeDev) secrets.push(DEV_STRIPE_WEBHOOK_SECRET);
  }
  if (!secrets.length)
    return {
      status: 503,
      body: { error: { code: "not_configured", message: "Webhooks aren't set up." } },
    };
  const ok = await verifyStripeSignature(
    raw,
    signature,
    secrets,
    Math.floor(services.now() / 1000),
  );
  if (!ok)
    return {
      status: 400,
      body: { error: { code: "bad_signature", message: "Invalid signature." } },
    };
  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
    if (typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object)
      throw new Error("shape");
  } catch {
    return { status: 400, body: { error: { code: "bad_request", message: "Unreadable event." } } };
  }
  const seen = await services.db
    .prepare("SELECT 1 AS x FROM stripe_events WHERE id = ?")
    .bind(event.id)
    .first();
  if (seen) return { status: 200, body: { received: true, duplicate: true } };

  // Which site is this for? Never trust metadata alone: it must agree with the endpoint/account.
  const obj = event.data.object;
  const metaSite = (obj.metadata as Record<string, string> | undefined)?.os_site ?? null;
  let siteId: string | null;
  if (endpoint.kind === "sovereign") siteId = endpoint.siteId;
  else if (event.account) siteId = await siteForAccount(services.db, event.account);
  else siteId = services.growth.config.stripeDev ? metaSite : null; // DevStripe without an account
  if (!siteId || (metaSite && metaSite !== siteId)) {
    log?.warn("stripe event for an unknown site", { type: event.type, id: event.id });
    await recordEvent(services, event, null);
    return { status: 200, body: { received: true, ignored: true } };
  }
  const site = await getSite(services.db, siteId);
  if (!site) {
    await recordEvent(services, event, null);
    return { status: 200, body: { received: true, ignored: true } };
  }
  const result = await processEvent(services, site, event, log);
  await recordEvent(services, event, site.id);
  return { status: 200, body: { received: true, ...result } };
}

async function recordEvent(services: Services, e: StripeEvent, siteId: string | null) {
  await services.db
    .prepare(
      "INSERT INTO stripe_events (id, site_id, type, received_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
    )
    .bind(e.id, siteId, e.type, services.now())
    .run();
}

async function processEvent(
  services: Services,
  site: SiteRow,
  event: StripeEvent,
  log?: Logger,
): Promise<Record<string, unknown>> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return completeSession(services, site, obj, log);
    case "checkout.session.async_payment_failed":
      return {
        order: await setOrderStatus(services, site.id, obj, "failed", ["pending", "processing"]),
      };
    case "checkout.session.expired":
      return { order: await setOrderStatus(services, site.id, obj, "expired", ["pending"]) };
    case "charge.refunded":
      return refundedCharge(services, site.id, obj);
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return {
        member: await applySubscriptionChange(services, site.id, {
          id: String(obj.id ?? ""),
          status:
            event.type === "customer.subscription.deleted" ? "canceled" : String(obj.status ?? ""),
          tier: (obj.metadata as Record<string, string> | undefined)?.os_tier ?? null,
        }),
      };
    default:
      return { ignored: event.type };
  }
}

async function orderForSession(
  services: Services,
  siteId: string,
  session: Record<string, unknown>,
): Promise<OrderRow | null> {
  const meta = (session.metadata as Record<string, string> | undefined) ?? {};
  const id = meta.os_order ?? (session.client_reference_id as string | undefined);
  if (!id) return null;
  const order = await getOrder(services.db, siteId, id);
  // The session must be the one this order created (no cross-order replays).
  if (!order || (order.stripe_session && order.stripe_session !== session.id)) return null;
  return order;
}

async function setOrderStatus(
  services: Services,
  siteId: string,
  session: Record<string, unknown>,
  status: OrderStatus,
  from: OrderStatus[],
): Promise<string | null> {
  const order = await orderForSession(services, siteId, session);
  if (!order) return null;
  await services.db
    .prepare(
      `UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`,
    )
    .bind(status, services.now(), order.id, ...from)
    .run();
  return order.id;
}

/** A paid session: claim the order, decrement stock atomically, then deliver. */
export async function completeSession(
  services: Services,
  site: SiteRow,
  session: Record<string, unknown>,
  log?: Logger,
): Promise<Record<string, unknown>> {
  const order = await orderForSession(services, site.id, session);
  if (!order) return { order: null };
  const db = services.db;
  const now = services.now();
  const details = (session.customer_details as Record<string, unknown> | undefined) ?? {};
  const totals = (session.total_details as Record<string, number> | undefined) ?? {};
  const shipping =
    (session.shipping_details as Record<string, unknown> | undefined) ??
    ((session.collected_information as Record<string, unknown> | undefined)?.shipping_details as
      | Record<string, unknown>
      | undefined) ??
    null;
  const email =
    (typeof details.email === "string" ? details.email.toLowerCase() : null) ?? order.email;
  const name = typeof details.name === "string" ? details.name.slice(0, 200) : null;
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : order.total;
  const subtotal =
    typeof session.amount_subtotal === "number" ? session.amount_subtotal : order.total;
  const amounts = {
    subtotal,
    shipping: totals.amount_shipping ?? 0,
    tax: totals.amount_tax ?? 0,
    discount: totals.amount_discount ?? 0,
    total: amountTotal,
  };
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const sub = typeof session.subscription === "string" ? session.subscription : null;
  const common = [
    email,
    name,
    pi,
    sub,
    JSON.stringify(amounts),
    shipping ? JSON.stringify(shipping) : null,
  ];

  if (session.payment_status === "unpaid") {
    // Delayed payment methods: wait for async_payment_succeeded.
    await db
      .prepare(
        `UPDATE orders SET status = 'processing', email = ?, customer_name = ?, payment_intent = ?,
           subscription_id = ?, amounts_json = ?, shipping_json = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(...common, now, order.id)
      .run();
    return { order: order.id, status: "processing" };
  }
  if (subtotal !== order.total)
    log?.warn("checkout subtotal differs from the order", {
      order: order.id,
      subtotal,
      total: order.total,
    });

  const items = orderItems(order);
  const tracked = order.kind === "order" ? items : [];
  const stmts = [
    db
      .prepare(
        `UPDATE orders SET status = 'paid', paid_at = ?, total = ?, email = ?, customer_name = ?,
           payment_intent = ?, subscription_id = ?, amounts_json = ?, shipping_json = ?, updated_at = ?
         WHERE id = ? AND status IN ('pending', 'processing', 'expired')`,
      )
      .bind(now, amountTotal, ...common, now, order.id),
    ...tracked.map((it) =>
      db
        .prepare(
          `UPDATE inventory SET qty = qty - ?, updated_at = ? WHERE site_id = ? AND sku = ?
             AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid' AND stock_applied = 0)`,
        )
        .bind(it.qty, now, site.id, it.sku, order.id),
    ),
    db
      .prepare(
        "UPDATE orders SET stock_applied = 1 WHERE id = ? AND status = 'paid' AND stock_applied = 0",
      )
      .bind(order.id),
  ];
  let claimed: boolean;
  try {
    const results = await db.batch(stmts);
    claimed = (results[0]?.meta.changes ?? 0) === 1;
  } catch (err) {
    if (!isOversell(err)) throw err;
    return outOfStock(services, site, order, { email, name, pi, amountTotal, amounts }, log);
  }
  if (!claimed) return { order: order.id, duplicate: true };

  const paid = (await getOrder(db, site.id, order.id)) as OrderRow;
  const out: Record<string, unknown> = { order: order.id, status: "paid" };
  // Follow-ups never fail the webhook (the payment is recorded; Stripe must not retry it).
  const titles = new Map(items.map((i) => [i.sku, i.title]));
  out.lowStock = await lowStockAlerts(
    services,
    site,
    tracked.map((i) => i.sku),
    titles,
  ).catch((err) => {
    log?.warn("low-stock alert failed", { err, siteId: site.id });
    return [];
  });
  if (order.kind === "membership" && email) {
    const tier = parse<{ tier?: string }>(order.meta_json, {}).tier ?? null;
    out.member = await applyMembershipPayment(services, site, {
      email,
      name,
      tier,
      customer: typeof session.customer === "string" ? session.customer : null,
      subscription: sub,
    });
  }
  if (email && items.some((i) => i.digital) && order.kind === "order")
    out.delivered = await sendDigitalDelivery(services, site, paid).catch((err) => {
      log?.warn("digital delivery email failed", { err, siteId: site.id });
      return false;
    });
  return out;
}

async function outOfStock(
  services: Services,
  site: SiteRow,
  order: OrderRow,
  p: {
    email: string | null;
    name: string | null;
    pi: string | null;
    amountTotal: number;
    amounts: Record<string, number>;
  },
  log?: Logger,
): Promise<Record<string, unknown>> {
  const db = services.db;
  const now = services.now();
  const res = await db
    .prepare(
      `UPDATE orders SET status = 'out_of_stock', email = ?, customer_name = ?, payment_intent = ?,
         total = ?, amounts_json = ?, note = 'Sold out before payment finished', updated_at = ?
       WHERE id = ? AND status IN ('pending', 'processing', 'expired')`,
    )
    .bind(p.email, p.name, p.pi, p.amountTotal, JSON.stringify(p.amounts), now, order.id)
    .run();
  if ((res.meta.changes ?? 0) !== 1) return { order: order.id, duplicate: true };
  let refunded = false;
  if (p.pi) {
    try {
      const { api } = await stripeForSite(services, site.id);
      const r = await api.createRefund({ paymentIntent: p.pi, idempotencyKey: `oos-${order.id}` });
      await db
        .prepare(
          "UPDATE orders SET status = 'refunded', refunded = ?, updated_at = ? WHERE id = ? AND status = 'out_of_stock'",
        )
        .bind(r.amount || p.amountTotal, services.now(), order.id)
        .run();
      refunded = true;
    } catch (err) {
      log?.error("automatic refund for a sold-out order failed", { err, order: order.id });
    }
  }
  if (p.email)
    await sendSimpleMail(services, site, p.email, "order-sold-out", `Your ${site.name} order`, [
      "Sorry — an item in your order sold out while you were paying.",
      refunded
        ? "We've refunded your payment in full. It can take a few days to appear."
        : "We'll refund your payment in full shortly.",
    ]).catch(() => undefined);
  return { order: order.id, status: refunded ? "refunded" : "out_of_stock", outOfStock: true };
}

async function refundedCharge(services: Services, siteId: string, charge: Record<string, unknown>) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  const amount = typeof charge.amount_refunded === "number" ? charge.amount_refunded : null;
  if (!pi || amount === null) return { order: null };
  await services.db
    .prepare(
      `UPDATE orders SET refunded = MAX(refunded, ?),
         status = CASE WHEN MAX(refunded, ?) >= total THEN 'refunded' ELSE 'partially_refunded' END,
         updated_at = ?
       WHERE site_id = ? AND payment_intent = ? AND status IN ('paid', 'partially_refunded', 'refunded')`,
    )
    .bind(amount, amount, services.now(), siteId, pi)
    .run();
  return { refundedPaymentIntent: pi };
}

// ---- digital delivery ---------------------------------------------------------------------------

export const DOWNLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function digitalKey(siteId: string, sku: string): string {
  return `digital/${siteId}/${encodeURIComponent(sku)}`;
}

export async function downloadToken(
  services: Services,
  orderId: string,
  idx: number,
  expMs: number,
): Promise<string> {
  const key = requireHmacKey(services.pub.config);
  const exp = Math.floor(expMs / 1000);
  return `${orderId}.${idx}.${exp}.${await hmacB64(key, `download:${orderId}:${idx}:${exp}`, 32)}`;
}

export async function verifyDownloadToken(
  services: Services,
  token: string,
): Promise<{ orderId: string; idx: number } | null> {
  const m = token.match(/^(ord_[0-9a-z]+)\.(\d{1,3})\.(\d{1,12})\.([A-Za-z0-9_-]{32})$/);
  if (!m) return null;
  const [, orderId, idx, exp, sig] = m as unknown as [string, string, string, string, string];
  if (Number(exp) * 1000 < services.now()) return null;
  const key = requireHmacKey(services.pub.config);
  const expected = await hmacB64(key, `download:${orderId}:${idx}:${exp}`, 32);
  return (await timingSafeEqual(sig, expected)) ? { orderId, idx: Number(idx) } : null;
}

async function sendDigitalDelivery(services: Services, site: SiteRow, order: OrderRow) {
  if (!order.email) return false;
  const items = orderItems(order);
  const exp = services.now() + DOWNLOAD_TTL_MS;
  const links: Array<{ title: string; url: string }> = [];
  for (const [idx, it] of items.entries()) {
    if (!it.digital) continue;
    const head = await services.uploads.head(digitalKey(site.id, it.sku));
    if (!head) continue;
    links.push({
      title: it.title,
      url: `${services.config.hubUrl}/c/${site.id}/download/${await downloadToken(services, order.id, idx, exp)}`,
    });
  }
  if (!links.length) return false;
  let n = 0;
  const blk = (type: string, fields: Record<string, unknown>): Block => ({
    id: `blk_dl${(++n).toString().padStart(8, "0")}` as Block["id"],
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
    title: "Your downloads",
    preheader: `Your downloads from ${site.name}`,
    footerNote: "You are receiving this because you bought something from this site.",
    blocks: [
      blk("heading", { text: "Your downloads are ready", level: 1 }),
      para(`Thank you for your order #${order.number ?? ""}. These links work for 7 days.`),
      ...links.map((l) =>
        blk("button", { label: `Download ${l.title}`, link: { type: "url", url: l.url } }),
      ),
    ],
  });
  await sendTransactional(services, {
    siteId: site.id,
    to: order.email,
    subject: `Your downloads from ${site.name}`,
    html: mail.html,
    text: mail.text,
    kind: "order-download",
    fromName: site.name,
  });
  return true;
}

async function sendSimpleMail(
  services: Services,
  site: SiteRow,
  to: string,
  kind: string,
  subject: string,
  paragraphs: string[],
) {
  let n = 0;
  const blocks: Block[] = paragraphs.map((text) => ({
    id: `blk_ml${(++n).toString().padStart(8, "0")}` as Block["id"],
    type: "text",
    v: 1,
    fields: {
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    },
  }));
  const mail = renderEmail({
    site: emailSite(site),
    baseUrl: siteBaseUrl(site, services.config.hubUrl),
    title: subject,
    blocks,
  });
  await sendTransactional(services, {
    siteId: site.id,
    to,
    subject,
    html: mail.html,
    text: mail.text,
    kind,
    fromName: site.name,
  });
}

// ---- Studio: list, fulfill, refund, packing slip --------------------------------------------------

export interface OrderQuery {
  status?: OrderStatus;
  kind?: OrderRow["kind"];
  fulfillment?: OrderRow["fulfillment"];
  q?: string;
  from?: number;
  to?: number;
  limit: number;
  cursor?: string;
}

export async function listOrders(db: D1Database, siteId: string, q: OrderQuery) {
  // Pending/expired/failed sessions are checkout attempts, not orders: hidden unless asked for.
  const where = ["site_id = ?"];
  const args: unknown[] = [siteId];
  if (q.status) {
    where.push("status = ?");
    args.push(q.status);
  } else where.push("status NOT IN ('pending', 'expired', 'failed')");
  if (q.kind) {
    where.push("kind = ?");
    args.push(q.kind);
  }
  if (q.fulfillment) {
    where.push("fulfillment = ?");
    args.push(q.fulfillment);
  }
  if (q.q) {
    const num = Number(q.q.replace(/^#/, ""));
    if (Number.isInteger(num) && num > 0) {
      where.push("(number = ? OR email LIKE ? ESCAPE '\\')");
      args.push(num);
    } else where.push("(email LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\')");
    const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like);
    if (!(Number.isInteger(num) && num > 0)) args.push(like);
  }
  if (q.from) {
    where.push("created_at >= ?");
    args.push(q.from);
  }
  if (q.to) {
    where.push("created_at < ?");
    args.push(q.to);
  }
  if (q.cursor) {
    const [at, id] = q.cursor.split("|");
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    args.push(Number(at), Number(at), id ?? "");
  }
  const rows = await db
    .prepare(
      `SELECT * FROM orders WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...args, q.limit + 1)
    .all<OrderRow>();
  const page = rows.results.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    orders: page.map(toOrderView),
    nextCursor: rows.results.length > q.limit && last ? `${last.created_at}|${last.id}` : null,
  };
}

export async function fulfillOrder(
  services: Services,
  site: SiteRow,
  orderId: string,
  input: { tracking?: string | null; notify?: boolean; fulfilled?: boolean },
): Promise<OrderView> {
  const order = await getOrder(services.db, site.id, orderId);
  if (!order) throw notFound("We couldn't find that order.");
  if (!["paid", "partially_refunded"].includes(order.status))
    throw new HttpError(409, "not_fulfillable", "Only paid orders can be marked as sent.");
  const fulfilled = input.fulfilled !== false;
  const now = services.now();
  await services.db
    .prepare(
      "UPDATE orders SET fulfillment = ?, fulfilled_at = ?, tracking = COALESCE(?, tracking), updated_at = ? WHERE id = ?",
    )
    .bind(
      fulfilled ? "fulfilled" : "unfulfilled",
      fulfilled ? now : null,
      input.tracking ?? null,
      now,
      order.id,
    )
    .run();
  if (fulfilled && input.notify && order.email)
    await sendSimpleMail(
      services,
      site,
      order.email,
      "order-shipped",
      `Your ${site.name} order is on its way`,
      [
        `Good news — order #${order.number ?? ""} has been sent.`,
        ...(input.tracking ? [`Tracking: ${input.tracking}`] : []),
      ],
    );
  return toOrderView((await getOrder(services.db, site.id, order.id)) as OrderRow);
}

export async function refundOrder(
  services: Services,
  site: SiteRow,
  orderId: string,
  input: { amount?: number; restock?: boolean },
): Promise<OrderView> {
  const order = await getOrder(services.db, site.id, orderId);
  if (!order) throw notFound("We couldn't find that order.");
  if (!["paid", "partially_refunded"].includes(order.status) || !order.payment_intent)
    throw new HttpError(409, "not_refundable", "This order can't be refunded.");
  const remaining = order.total - order.refunded;
  const amount = input.amount ?? remaining;
  if (!Number.isInteger(amount) || amount < 1 || amount > remaining)
    throw new HttpError(
      422,
      "invalid_amount",
      "That refund is more than what's left on the order.",
    );
  const { api } = await stripeForSite(services, site.id);
  const r = await api.createRefund({
    paymentIntent: order.payment_intent,
    amount,
    idempotencyKey: `refund-${order.id}-${order.refunded}-${amount}`,
  });
  const now = services.now();
  const total = order.refunded + (r.amount || amount);
  const restock =
    input.restock && total >= order.total && order.stock_applied === 1 && order.kind === "order";
  const stmts = [
    services.db
      .prepare(
        `UPDATE orders SET refunded = ?, status = ?, updated_at = ? WHERE id = ? AND refunded = ?`,
      )
      .bind(
        total,
        total >= order.total ? "refunded" : "partially_refunded",
        now,
        order.id,
        order.refunded,
      ),
  ];
  if (restock)
    for (const it of orderItems(order))
      stmts.push(
        services.db
          .prepare(
            "UPDATE inventory SET qty = qty + ?, alerted_at = NULL, updated_at = ? WHERE site_id = ? AND sku = ?",
          )
          .bind(it.qty, now, site.id, it.sku),
      );
  await services.db.batch(stmts);
  return toOrderView((await getOrder(services.db, site.id, order.id)) as OrderRow);
}

function money(amount: number, currency: string): string {
  try {
    const exp = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits as number;
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 10 ** exp);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Printable packing slip (no prices — it goes in the box). */
export function packingSlipHtml(site: SiteRow, order: OrderRow): string {
  const items = orderItems(order);
  const ship = parse<{ name?: string; address?: Record<string, string | null> } | null>(
    order.shipping_json,
    null,
  );
  const a = ship?.address ?? {};
  const addr = [
    ship?.name ?? order.customer_name,
    a.line1,
    a.line2,
    [a.postal_code, a.city].filter(Boolean).join(" "),
    a.state,
    a.country,
  ]
    .filter((l): l is string => !!l)
    .map((l) => `<div>${esc(l)}</div>`)
    .join("");
  const rows = items
    .map(
      (i) => `<tr><td>${esc(i.title)}</td><td>${esc(i.sku)}</td><td class="n">${i.qty}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Packing slip #${order.number ?? ""}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 24px}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px 4px}.n{text-align:right}
.meta{color:#555}.cols{display:flex;justify-content:space-between;gap:24px;margin-top:24px}
@media print{body{margin:0}}</style></head><body>
<h1>${esc(site.name)}</h1><div class="meta">Packing slip · Order #${order.number ?? ""} · ${esc(new Date(order.paid_at ?? order.created_at).toISOString().slice(0, 10))}</div>
<div class="cols"><div><strong>Ship to</strong>${addr || "<div>—</div>"}</div>
<div><strong>Customer</strong><div>${esc(order.email ?? "—")}</div></div></div>
<table><thead><tr><th>Item</th><th>SKU</th><th class="n">Qty</th></tr></thead><tbody>${rows}</tbody></table>
<p class="meta">Total paid: ${esc(money(order.total, order.currency))}</p>
</body></html>`;
}
