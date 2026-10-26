/**
 * Studio APIs for growth + commerce (Task 18), mounted under `/api/sites`. Session cookie and a
 * role on the site (shown in brackets in the report); every mutation writes the audit log. The
 * full contract is in the Task 18 report.
 */
import type { Role } from "@openspace/ops";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { audit } from "../db/audit";
import type { SiteWithRole } from "../db/sites";
import type { User } from "../db/users";
import { toCsv } from "../lib/csv";
import { HttpError, notFound } from "../lib/errors";
import { readJson } from "../lib/validate";
import {
  CampaignInputSchema,
  CampaignPatchSchema,
  campaignStats,
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  previewCampaign,
  SegmentSchema,
  scheduleCampaign,
  segmentCount,
  sendTest,
  startCampaign,
  unscheduleCampaign,
  updateCampaign,
} from "../services/campaigns";
import { loadCatalog } from "../services/catalog";
import {
  adjustStock,
  allInventory,
  clearSovereign,
  commerceRow,
  connectOnboarding,
  growthSettings,
  PatchGrowthSettingsSchema,
  patchGrowthSettings,
  paymentsView,
  refreshConnectStatus,
  setSovereign,
  setStock,
} from "../services/commerce";
import {
  createDiscount,
  DiscountInputSchema,
  listDiscounts,
  setDiscountActive,
} from "../services/discounts";
import {
  AddMemberSchema,
  addMember,
  deleteMember,
  deleteTier,
  listMembers,
  listTiers,
  PatchMemberSchema,
  pagePasswords,
  patchMember,
  saveTier,
  setPagePassword,
  TierInputSchema,
} from "../services/members";
import {
  digitalKey,
  fulfillOrder,
  getOrder,
  listOrders,
  type OrderStatus,
  packingSlipHtml,
  refundOrder,
  toOrderView,
} from "../services/orders";
import {
  createSender,
  deleteSender,
  getSender,
  listSenders,
  SenderInputSchema,
  senderView,
  verifySender,
} from "../services/senders";
import { requireRole, siteForUser } from "../services/sites";
import { applyUpdate, checkSiteUpdate, dismissUpdate, listUpdates } from "../services/updates";
import type { AppEnv } from "../types";

export const growthRoutes = new Hono<AppEnv>();

async function siteWith(
  c: Context<AppEnv>,
  min: Role,
): Promise<{ site: SiteWithRole; user: User }> {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id") ?? "", user);
  requireRole(site, min);
  return { site, user };
}

async function log(c: Context<AppEnv>, siteId: string, user: User, action: string, meta?: unknown) {
  await audit(c.var.services.db, { siteId, actor: user.id, action, meta }, c.var.services.now());
}

const Limit = z.coerce.number().int().min(1).max(200).default(50);
const Sku = z.string().min(1).max(64).regex(/^\S+$/);

// ---- commerce settings & payments ---------------------------------------------------------------

growthRoutes.get("/:id/commerce/settings", async (c) => {
  const { site } = await siteWith(c, "editor");
  const { services } = c.var;
  return c.json({
    settings: await growthSettings(services.db, site.id),
    payments: paymentsView(services, site.id, await commerceRow(services.db, site.id)),
  });
});

growthRoutes.patch("/:id/commerce/settings", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const patch = await readJson(c, PatchGrowthSettingsSchema);
  const settings = await patchGrowthSettings(
    c.var.services.db,
    site.id,
    patch,
    c.var.services.now(),
  );
  await log(c, site.id, user, "commerce.settings", patch);
  return c.json({ settings });
});

growthRoutes.post("/:id/commerce/connect", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const body = await readJson(c, z.strictObject({ returnUrl: z.string().max(500).optional() }));
  const studio = c.var.config.studioOrigin;
  const back = body.returnUrl?.startsWith(`${studio}/`)
    ? body.returnUrl
    : `${studio}/sites/${site.id}/shop`;
  const out = await connectOnboarding(c.var.services, site, user, back);
  await log(c, site.id, user, "commerce.connect", { account: out.account });
  return c.json(out);
});

/** Stored payment status (no side effects). */
growthRoutes.get("/:id/commerce/connect", async (c) => {
  const { site } = await siteWith(c, "designer");
  const { services } = c.var;
  return c.json({
    payments: paymentsView(services, site.id, await commerceRow(services.db, site.id)),
  });
});

/** Re-read the connected account's status from Stripe (Studio calls this after onboarding). */
growthRoutes.post("/:id/commerce/connect/refresh", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const payments = await refreshConnectStatus(c.var.services, site.id);
  await log(c, site.id, user, "commerce.connect.refresh", {
    chargesEnabled: payments.chargesEnabled,
  });
  return c.json({ payments });
});

growthRoutes.put("/:id/commerce/sovereign", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const body = await readJson(
    c,
    z.strictObject({ secretKey: z.string().max(300), webhookSecret: z.string().max(300) }),
  );
  const payments = await setSovereign(c.var.services, site, user, body);
  await log(c, site.id, user, "commerce.sovereign", { enabled: true });
  return c.json({ payments });
});

growthRoutes.delete("/:id/commerce/sovereign", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const payments = await clearSovereign(c.var.services, site.id);
  await log(c, site.id, user, "commerce.sovereign", { enabled: false });
  return c.json({ payments });
});

// ---- products & inventory -----------------------------------------------------------------------

growthRoutes.get("/:id/products", async (c) => {
  const { site } = await siteWith(c, "editor");
  const { services } = c.var;
  const [catalog, inventory, settings] = await Promise.all([
    loadCatalog(services, site),
    allInventory(services.db, site.id),
    growthSettings(services.db, site.id),
  ]);
  const inv = new Map(inventory.map((r) => [r.sku, r]));
  const products = await Promise.all(
    [...catalog.skus.values()].map(async (p) => {
      const r = inv.get(p.sku);
      return {
        sku: p.sku,
        title: p.title,
        price: p.price,
        available: p.available,
        digital: p.digital,
        path: p.path,
        collection: p.collection,
        slug: p.slug,
        tracked: !!r,
        qty: r?.qty ?? null,
        lowStock: r?.low_stock ?? null,
        low: !!r && r.qty <= (r.low_stock ?? settings.lowStockThreshold),
        hasFile: p.digital ? !!(await services.uploads.head(digitalKey(site.id, p.sku))) : false,
      };
    }),
  );
  return c.json({ products, source: catalog.source });
});

growthRoutes.put("/:id/inventory", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const body = await readJson(
    c,
    z.strictObject({
      sku: Sku,
      qty: z.number().int().min(0).max(10_000_000).nullable(),
      lowStock: z.number().int().min(0).max(10_000).nullable().optional(),
    }),
  );
  const row = await setStock(
    c.var.services.db,
    site.id,
    body.sku,
    { qty: body.qty, ...(body.lowStock !== undefined ? { lowStock: body.lowStock } : {}) },
    c.var.services.now(),
  );
  await log(c, site.id, user, "inventory.set", body);
  return c.json({
    inventory: row
      ? { sku: row.sku, qty: row.qty, lowStock: row.low_stock }
      : { sku: body.sku, tracked: false },
  });
});

growthRoutes.post("/:id/inventory/adjust", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const body = await readJson(
    c,
    z.strictObject({ sku: Sku, delta: z.number().int().min(-1_000_000).max(1_000_000) }),
  );
  const row = await adjustStock(
    c.var.services.db,
    site.id,
    body.sku,
    body.delta,
    c.var.services.now(),
  );
  await log(c, site.id, user, "inventory.adjust", body);
  return c.json({ inventory: { sku: row.sku, qty: row.qty, lowStock: row.low_stock } });
});

const MAX_DIGITAL_BYTES = 100 * 1024 * 1024;

growthRoutes.put("/:id/products/file", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const sku = Sku.parse(c.req.query("sku"));
  const filename = (c.req.header("x-filename") ?? sku).slice(0, 200);
  const size = Number(c.req.header("content-length") ?? 0);
  if (!size || size > MAX_DIGITAL_BYTES)
    throw new HttpError(413, "too_large", "Digital files can be up to 100 MB.");
  if (!c.req.raw.body)
    throw new HttpError(400, "bad_request", "Send the file as the request body.");
  await c.var.services.uploads.put(digitalKey(site.id, sku), c.req.raw.body, {
    httpMetadata: { contentType: c.req.header("content-type") ?? "application/octet-stream" },
    customMetadata: { filename },
  });
  await log(c, site.id, user, "product.file", { sku, filename, size });
  return c.json({ ok: true, sku, size });
});

growthRoutes.delete("/:id/products/file", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const sku = Sku.parse(c.req.query("sku"));
  await c.var.services.uploads.delete(digitalKey(site.id, sku));
  await log(c, site.id, user, "product.file.delete", { sku });
  return c.json({ ok: true });
});

// ---- orders -------------------------------------------------------------------------------------

const ORDER_STATUSES = [
  "pending",
  "processing",
  "paid",
  "partially_refunded",
  "refunded",
  "out_of_stock",
  "expired",
  "failed",
] as const satisfies readonly OrderStatus[];

growthRoutes.get("/:id/orders", async (c) => {
  const { site } = await siteWith(c, "editor");
  const q = z
    .object({
      status: z.enum(ORDER_STATUSES).optional(),
      kind: z.enum(["order", "donation", "membership"]).optional(),
      fulfillment: z.enum(["unfulfilled", "fulfilled"]).optional(),
      problem: z
        .enum(["1", "true"])
        .transform(() => true)
        .optional(),
      toSend: z
        .enum(["1", "true"])
        .transform(() => true)
        .optional(),
      q: z.string().max(100).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      limit: Limit,
      cursor: z.string().max(80).optional(),
    })
    .parse(c.req.query());
  return c.json(
    await listOrders(c.var.services.db, site.id, {
      ...q,
      from: q.from ? Date.parse(`${q.from}T00:00:00Z`) : undefined,
      to: q.to ? Date.parse(`${q.to}T00:00:00Z`) + 86_400_000 : undefined,
    }),
  );
});

growthRoutes.get("/:id/orders/:orderId/packing-slip", async (c) => {
  const { site } = await siteWith(c, "editor");
  const order = await getOrder(c.var.services.db, site.id, c.req.param("orderId"));
  if (!order) throw notFound("We couldn't find that order.");
  return c.html(packingSlipHtml(site, order), 200, {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "Cache-Control": "no-store",
  });
});

growthRoutes.get("/:id/orders/:orderId", async (c) => {
  const { site } = await siteWith(c, "editor");
  const order = await getOrder(c.var.services.db, site.id, c.req.param("orderId"));
  if (!order) throw notFound("We couldn't find that order.");
  return c.json({ order: toOrderView(order) });
});

growthRoutes.post("/:id/orders/:orderId/fulfill", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const body = await readJson(
    c,
    z.strictObject({
      tracking: z.string().trim().max(200).nullable().optional(),
      notify: z.boolean().optional(),
      fulfilled: z.boolean().optional(),
    }),
  );
  const order = await fulfillOrder(c.var.services, site, c.req.param("orderId"), body);
  await log(c, site.id, user, "order.fulfill", {
    order: order.id,
    fulfilled: body.fulfilled !== false,
  });
  return c.json({ order });
});

growthRoutes.post("/:id/orders/:orderId/refund", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const body = await readJson(
    c,
    z.strictObject({ amount: z.number().int().min(1).optional(), restock: z.boolean().optional() }),
  );
  const order = await refundOrder(c.var.services, site, c.req.param("orderId"), body);
  await log(c, site.id, user, "order.refund", { order: order.id, amount: body.amount ?? "full" });
  return c.json({ order });
});

// ---- discount codes -----------------------------------------------------------------------------

growthRoutes.get("/:id/discounts", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ discounts: await listDiscounts(c.var.services.db, site.id) });
});

growthRoutes.post("/:id/discounts", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const body = await readJson(c, DiscountInputSchema);
  const discount = await createDiscount(c.var.services, site.id, body);
  await log(c, site.id, user, "discount.create", { code: discount.code });
  return c.json({ discount }, 201);
});

growthRoutes.patch("/:id/discounts/:did", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const body = await readJson(c, z.strictObject({ active: z.boolean() }));
  const discount = await setDiscountActive(
    c.var.services,
    site.id,
    c.req.param("did"),
    body.active,
  );
  await log(c, site.id, user, "discount.update", { code: discount.code, active: body.active });
  return c.json({ discount });
});

// ---- members, tiers, page passwords -------------------------------------------------------------

const MemberQuery = z.object({
  tier: z.string().max(40).optional(),
  status: z.enum(["active", "blocked"]).optional(),
  q: z.string().max(100).optional(),
  limit: Limit,
  cursor: z.string().max(80).optional(),
});

growthRoutes.get("/:id/members.csv", async (c) => {
  const { site } = await siteWith(c, "editor");
  const all = await listMembers(c.var.services.db, site.id, { limit: 10_000 });
  const csv = toCsv(
    ["id", "email", "name", "tier", "status", "paid", "created_at", "last_login_at"],
    all.members.map((m) => [
      m.id,
      m.email,
      m.name ?? "",
      m.tier ?? "",
      m.status,
      m.paid ? "yes" : "no",
      m.createdAt ?? "",
      m.lastLoginAt ?? "",
    ]),
  );
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="members.csv"',
    "Cache-Control": "no-store",
  });
});

growthRoutes.get("/:id/members", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json(await listMembers(c.var.services.db, site.id, MemberQuery.parse(c.req.query())));
});

growthRoutes.post("/:id/members", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const out = await addMember(c.var.services, site, await readJson(c, AddMemberSchema));
  await log(c, site.id, user, "member.add", { member: out.member.id, invited: out.invited });
  return c.json(out, 201);
});

growthRoutes.patch("/:id/members/:mid", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const patch = await readJson(c, PatchMemberSchema);
  const member = await patchMember(c.var.services, site.id, c.req.param("mid"), patch);
  await log(c, site.id, user, "member.update", { member: member.id, ...patch });
  return c.json({ member });
});

growthRoutes.delete("/:id/members/:mid", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const n = await deleteMember(c.var.services.db, site.id, c.req.param("mid"));
  if (!n) throw notFound("We couldn't find that member.");
  await log(c, site.id, user, "member.delete", { member: c.req.param("mid") });
  return c.json({ deleted: n });
});

growthRoutes.get("/:id/tiers", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ tiers: await listTiers(c.var.services.db, site.id) });
});

growthRoutes.post("/:id/tiers", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const tier = await saveTier(c.var.services, site.id, null, await readJson(c, TierInputSchema));
  await log(c, site.id, user, "tier.create", { tier: tier.id });
  return c.json({ tier }, 201);
});

growthRoutes.patch("/:id/tiers/:tid", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const body = await readJson(
    c,
    TierInputSchema.partial().extend({ name: z.string().trim().min(1).max(60) }),
  );
  const tier = await saveTier(c.var.services, site.id, c.req.param("tid"), body);
  await log(c, site.id, user, "tier.update", { tier: tier.id });
  return c.json({ tier });
});

growthRoutes.delete("/:id/tiers/:tid", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  await deleteTier(c.var.services.db, site.id, c.req.param("tid"));
  await log(c, site.id, user, "tier.delete", { tier: c.req.param("tid") });
  return c.json({ deleted: 1 });
});

growthRoutes.get("/:id/page-passwords", async (c) => {
  const { site } = await siteWith(c, "designer");
  const rows = await pagePasswords(c.var.services.db, site.id);
  return c.json({
    pages: rows.map((r) => ({
      pageId: r.page_id,
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
  });
});

const PageId = z.string().regex(/^pg_[0-9a-z]{10}$/);

growthRoutes.put("/:id/page-passwords/:pageId", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const pageId = PageId.parse(c.req.param("pageId"));
  const { password } = await readJson(c, z.strictObject({ password: z.string().max(200) }));
  const out = await setPagePassword(c.var.services, site, user, pageId, password);
  await log(c, site.id, user, "page.password", { pageId, set: true });
  return c.json(out);
});

growthRoutes.delete("/:id/page-passwords/:pageId", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const pageId = PageId.parse(c.req.param("pageId"));
  const out = await setPagePassword(c.var.services, site, user, pageId, null);
  await log(c, site.id, user, "page.password", { pageId, set: false });
  return c.json(out);
});

// ---- senders & campaigns ------------------------------------------------------------------------

growthRoutes.get("/:id/senders", async (c) => {
  const { site } = await siteWith(c, "designer");
  const rows = await listSenders(c.var.services.db, site.id);
  return c.json({ senders: rows.map((r) => senderView(c.var.services, r)) });
});

growthRoutes.post("/:id/senders", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const sender = await createSender(
    c.var.services,
    site.id,
    user.id,
    await readJson(c, SenderInputSchema),
  );
  await log(c, site.id, user, "sender.connect", { sender: sender.id, provider: sender.provider });
  return c.json({ sender }, 201);
});

growthRoutes.post("/:id/senders/:sid/verify", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const sender = await verifySender(c.var.services, site.id, c.req.param("sid"));
  await log(c, site.id, user, "sender.verify", { sender: sender.id, status: sender.status });
  return c.json({ sender });
});

growthRoutes.delete("/:id/senders/:sid", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  if (!(await getSender(c.var.services.db, site.id, c.req.param("sid")))) throw notFound();
  await deleteSender(c.var.services.db, site.id, c.req.param("sid"));
  await log(c, site.id, user, "sender.remove", { sender: c.req.param("sid") });
  return c.json({ deleted: 1 });
});

growthRoutes.get("/:id/segments/count", async (c) => {
  const { site } = await siteWith(c, "editor");
  const tags = c.req.queries("tag") ?? [];
  const seg = SegmentSchema.parse({ tags, match: c.req.query("match") ?? "any" });
  return c.json({ count: await segmentCount(c.var.services.db, site.id, seg) });
});

growthRoutes.get("/:id/campaigns", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ campaigns: await listCampaigns(c.var.services.db, site.id) });
});

growthRoutes.post("/:id/campaigns", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const campaign = await createCampaign(
    c.var.services,
    site.id,
    user.id,
    await readJson(c, CampaignInputSchema),
  );
  await log(c, site.id, user, "campaign.create", { campaign: campaign.id });
  return c.json({ campaign }, 201);
});

growthRoutes.get("/:id/campaigns/:cid", async (c) => {
  const { site } = await siteWith(c, "editor");
  const db = c.var.services.db;
  return c.json({
    campaign: await getCampaign(db, site.id, c.req.param("cid")),
    stats: await campaignStats(db, site.id, c.req.param("cid")),
  });
});

growthRoutes.patch("/:id/campaigns/:cid", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const campaign = await updateCampaign(
    c.var.services,
    site.id,
    c.req.param("cid"),
    await readJson(c, CampaignPatchSchema),
  );
  await log(c, site.id, user, "campaign.update", { campaign: campaign.id });
  return c.json({ campaign });
});

growthRoutes.delete("/:id/campaigns/:cid", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  await deleteCampaign(c.var.services.db, site.id, c.req.param("cid"));
  await log(c, site.id, user, "campaign.delete", { campaign: c.req.param("cid") });
  return c.json({ deleted: 1 });
});

growthRoutes.post("/:id/campaigns/:cid/preview", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json(await previewCampaign(c.var.services, site, c.req.param("cid")));
});

growthRoutes.post("/:id/campaigns/:cid/test", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const { to } = await readJson(
    c,
    z.strictObject({ to: z.string().trim().toLowerCase().email().max(254) }),
  );
  const r = await sendTest(c.var.services, site, c.req.param("cid"), to);
  await log(c, site.id, user, "campaign.test", { campaign: c.req.param("cid") });
  return c.json({ ok: true, id: r.id });
});

growthRoutes.post("/:id/campaigns/:cid/schedule", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const { sendAt } = await readJson(
    c,
    z.strictObject({ sendAt: z.iso.datetime({ offset: true }) }),
  );
  const campaign = await scheduleCampaign(
    c.var.services,
    site,
    c.req.param("cid"),
    Date.parse(sendAt),
  );
  await log(c, site.id, user, "campaign.schedule", { campaign: campaign.id, sendAt });
  return c.json({ campaign });
});

growthRoutes.post("/:id/campaigns/:cid/unschedule", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const campaign = await unscheduleCampaign(c.var.services, site.id, c.req.param("cid"));
  await log(c, site.id, user, "campaign.unschedule", { campaign: campaign.id });
  return c.json({ campaign });
});

growthRoutes.post("/:id/campaigns/:cid/send", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const campaign = await startCampaign(c.var.services, site, c.req.param("cid"), c.var.log);
  await log(c, site.id, user, "campaign.send", {
    campaign: campaign.id,
    recipients: campaign.recipients,
  });
  return c.json({ campaign }, 202);
});

growthRoutes.get("/:id/campaigns/:cid/stats", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ stats: await campaignStats(c.var.services.db, site.id, c.req.param("cid")) });
});

// ---- update bot ---------------------------------------------------------------------------------

growthRoutes.get("/:id/updates", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ updates: await listUpdates(c.var.services.db, site.id) });
});

growthRoutes.post("/:id/updates/check", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const update = await checkSiteUpdate(c.var.services, site, c.var.log);
  await log(c, site.id, user, "update.check", {
    update: update?.id ?? null,
    to: update?.to ?? null,
  });
  return c.json({ update });
});

growthRoutes.post("/:id/updates/:uid/apply", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  try {
    return c.json({
      update: await applyUpdate(c.var.services, site, user, c.req.param("uid"), c.var.log),
    });
  } catch (err) {
    await log(c, site.id, user, "update.apply_failed", {
      update: c.req.param("uid"),
      code: err instanceof HttpError ? err.code : "error",
    });
    throw err;
  }
});

growthRoutes.post("/:id/updates/:uid/dismiss", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  await dismissUpdate(c.var.services, site.id, c.req.param("uid"));
  await log(c, site.id, user, "update.dismiss", { update: c.req.param("uid") });
  return c.json({ ok: true });
});
