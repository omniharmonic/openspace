/**
 * Studio APIs for the public services (Task 16), mounted under `/api/sites`. Session cookie +
 * a role on the site; every mutating action writes the audit log. See the Task 16 report for the
 * full contract.
 */
import type { Role } from "@omniharmonic/openspace-ops";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { audit } from "../db/audit";
import type { SiteWithRole } from "../db/sites";
import type { User } from "../db/users";
import { parseCsv } from "../lib/csv";
import { badRequest, HttpError, notFound } from "../lib/errors";
import { readJson } from "../lib/validate";
import type { Range } from "../services/analytics";
import {
  DATA_SCOPES,
  deleteSiteData,
  erasePerson,
  exportSiteZip,
  submissionsCsv,
  subscribersCsv,
} from "../services/data";
import {
  checkDomain,
  connectDomain,
  getDomain,
  lookupDomain,
  removeDomain,
} from "../services/domains";
import { siteBaseUrl } from "../services/email";
import { deleteUploadsFor } from "../services/form-uploads";
import {
  getSubmission,
  listSubmissions,
  loadManifest,
  toSubmissionView,
  withFileLinks,
} from "../services/forms";
import { analyticsReport } from "../services/insights";
import {
  confirmSubscriberManually,
  getSubscriber,
  importSubscribers,
  listSubscribers,
  setSubscriberTags,
  TagSchema,
  toSubscriberView,
} from "../services/newsletter";
import { quotaExceeded, quotaReport } from "../services/quotas";
import { publicGuide, REGISTRARS } from "../services/registrars";
import { getSettings, PatchServiceSettingsSchema, patchSettings } from "../services/settings";
import { requireRole, siteForUser } from "../services/sites";
import type { AppEnv } from "../types";

export const siteServiceRoutes = new Hono<AppEnv>();

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

function csvResponse(c: Context<AppEnv>, filename: string, csv: string) {
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "site";

const LimitSchema = z.coerce.number().int().min(1).max(200).default(50);
const BoolParam = z.enum(["1", "true", "0", "false"]).transform((v) => v === "1" || v === "true");

// ---- settings and usage -----------------------------------------------------------------------------

siteServiceRoutes.get("/:id/services/settings", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ settings: await getSettings(c.var.services.db, site.id) });
});

siteServiceRoutes.patch("/:id/services/settings", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const patch = await readJson(c, PatchServiceSettingsSchema);
  const settings = await patchSettings(c.var.services.db, site.id, patch, c.var.services.now());
  await log(c, site.id, user, "services.settings", patch);
  return c.json({ settings });
});

siteServiceRoutes.get("/:id/quotas", async (c) => {
  const { site } = await siteWith(c, "contributor");
  const { services } = c.var;
  return c.json({
    quotas: await quotaReport(services.db, site.id, services.now(), services.pub.quotaOverrides),
  });
});

siteServiceRoutes.get("/:id/audit", async (c) => {
  const { site } = await siteWith(c, "owner");
  const q = z
    .object({ limit: LimitSchema, before: z.coerce.number().int().optional() })
    .parse(c.req.query());
  const rows = await c.var.services.db
    .prepare(
      `SELECT a.id, a.actor, a.action, a.meta, a.at, u.login AS actor_login FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor
       WHERE a.site_id = ?${q.before ? " AND a.at < ?" : ""} ORDER BY a.at DESC LIMIT ?`,
    )
    .bind(...(q.before ? [site.id, q.before, q.limit] : [site.id, q.limit]))
    .all<{
      id: string;
      actor: string;
      action: string;
      meta: string | null;
      at: number;
      actor_login: string | null;
    }>();
  return c.json({
    entries: rows.results.map((r) => ({
      id: r.id,
      actor: r.actor,
      actorLogin: r.actor_login,
      action: r.action,
      meta: r.meta ? JSON.parse(r.meta) : null,
      at: new Date(r.at).toISOString(),
    })),
    nextBefore:
      rows.results.length === q.limit ? (rows.results[rows.results.length - 1]?.at ?? null) : null,
  });
});

// ---- forms and inbox ----------------------------------------------------------------------------------

siteServiceRoutes.get("/:id/forms", async (c) => {
  const { site } = await siteWith(c, "editor");
  const { services } = c.var;
  const manifest = await loadManifest(services, site, siteBaseUrl(site, services.config.hubUrl));
  const counts = (
    await services.db
      .prepare(
        `SELECT form_id, COUNT(*) AS total, SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread
         FROM submissions WHERE site_id = ? AND COALESCE(spam_score, 0) < 0.7 GROUP BY form_id`,
      )
      .bind(site.id)
      .all<{ form_id: string; total: number; unread: number }>()
  ).results;
  const byId = new Map(counts.map((r) => [r.form_id, r]));
  return c.json({
    forms: manifest.map((m) => ({
      id: m.form.id,
      name: m.form.name,
      fields: m.form.fields,
      notifyOwner: m.form.notifyOwner !== false,
      action: `${services.config.hubUrl}/f/${site.id}/${m.form.id}`,
      total: byId.get(m.form.id)?.total ?? 0,
      unread: byId.get(m.form.id)?.unread ?? 0,
    })),
  });
});

siteServiceRoutes.get("/:id/submissions", async (c) => {
  const { site } = await siteWith(c, "editor");
  const q = z
    .object({
      form: z.string().max(40).optional(),
      q: z.string().max(200).optional(),
      unread: BoolParam.optional(),
      spam: BoolParam.optional(),
      limit: LimitSchema,
      cursor: z.string().max(80).optional(),
    })
    .parse(c.req.query());
  return c.json(
    await withFileLinks(
      c.var.services,
      site.id,
      await listSubmissions(c.var.services.db, site.id, q),
    ),
  );
});

siteServiceRoutes.get("/:id/submissions.csv", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const form = c.req.query("form") || undefined;
  await log(c, site.id, user, "submissions.export", { form: form ?? null });
  return csvResponse(
    c,
    `${slug(site.name)}-entries.csv`,
    await submissionsCsv(c.var.services.db, site.id, form),
  );
});

siteServiceRoutes.get("/:id/submissions/:subId", async (c) => {
  const { site } = await siteWith(c, "editor");
  const row = await getSubmission(c.var.services.db, site.id, c.req.param("subId"));
  if (!row) throw notFound("We couldn't find that entry.");
  return c.json({
    submission: await withFileLinks(c.var.services, site.id, toSubmissionView(row)),
  });
});

siteServiceRoutes.patch("/:id/submissions/:subId", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const { read } = await readJson(c, z.strictObject({ read: z.boolean() }));
  const { services } = c.var;
  const res = await services.db
    .prepare("UPDATE submissions SET read_at = ? WHERE site_id = ? AND id = ?")
    .bind(read ? services.now() : null, site.id, c.req.param("subId"))
    .run();
  if (!res.meta.changes) throw notFound("We couldn't find that entry.");
  await log(c, site.id, user, read ? "submission.read" : "submission.unread", {
    id: c.req.param("subId"),
  });
  const row = await getSubmission(services.db, site.id, c.req.param("subId"));
  return c.json({ submission: row ? toSubmissionView(row) : null });
});

const IdsSchema = z.array(z.string().max(40)).min(1).max(500);

siteServiceRoutes.post("/:id/submissions/mark-read", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const body = await readJson(
    c,
    z.strictObject({
      ids: IdsSchema.optional(),
      all: z.boolean().optional(),
      form: z.string().optional(),
      read: z.boolean().default(true),
    }),
  );
  if (!body.ids && !body.all) throw badRequest("Say which entries: ids, or all: true.");
  const { services } = c.var;
  const at = body.read ? services.now() : null;
  let changed = 0;
  if (body.all) {
    const r = await services.db
      .prepare(
        `UPDATE submissions SET read_at = ? WHERE site_id = ?${body.form ? " AND form_id = ?" : ""}`,
      )
      .bind(...(body.form ? [at, site.id, body.form] : [at, site.id]))
      .run();
    changed = r.meta.changes ?? 0;
  } else
    for (const id of body.ids ?? []) {
      const r = await services.db
        .prepare("UPDATE submissions SET read_at = ? WHERE site_id = ? AND id = ?")
        .bind(at, site.id, id)
        .run();
      changed += r.meta.changes ?? 0;
    }
  await log(c, site.id, user, "submissions.mark", { read: body.read, count: changed });
  return c.json({ changed });
});

siteServiceRoutes.delete("/:id/submissions/:subId", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  await deleteUploadsFor(c.var.services, {
    siteId: site.id,
    submissionIds: [c.req.param("subId")],
  });
  const r = await c.var.services.db
    .prepare("DELETE FROM submissions WHERE site_id = ? AND id = ?")
    .bind(site.id, c.req.param("subId"))
    .run();
  if (!r.meta.changes) throw notFound("We couldn't find that entry.");
  await log(c, site.id, user, "submission.delete", { id: c.req.param("subId") });
  return c.json({ deleted: 1 });
});

siteServiceRoutes.post("/:id/submissions/delete", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const { ids } = await readJson(c, z.strictObject({ ids: IdsSchema }));
  await deleteUploadsFor(c.var.services, { siteId: site.id, submissionIds: ids });
  let deleted = 0;
  for (const id of ids) {
    const r = await c.var.services.db
      .prepare("DELETE FROM submissions WHERE site_id = ? AND id = ?")
      .bind(site.id, id)
      .run();
    deleted += r.meta.changes ?? 0;
  }
  await log(c, site.id, user, "submissions.delete", { count: deleted });
  return c.json({ deleted });
});

// ---- subscribers ------------------------------------------------------------------------------------

siteServiceRoutes.get("/:id/subscribers", async (c) => {
  const { site } = await siteWith(c, "editor");
  const q = z
    .object({
      status: z.enum(["pending", "confirmed", "unsubscribed"]).optional(),
      tag: z.string().max(40).optional(),
      q: z.string().max(200).optional(),
      limit: LimitSchema,
      cursor: z.string().max(80).optional(),
    })
    .parse(c.req.query());
  return c.json(await listSubscribers(c.var.services.db, site.id, q));
});

siteServiceRoutes.get("/:id/subscribers.csv", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  await log(c, site.id, user, "subscribers.export");
  return csvResponse(
    c,
    `${slug(site.name)}-subscribers.csv`,
    await subscribersCsv(c.var.services.db, site.id),
  );
});

siteServiceRoutes.post("/:id/subscribers/import", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const body = await readJson(
    c,
    z.strictObject({
      csv: z.string().min(1).max(2_000_000),
      consent: z.literal(true, { message: "Confirm these people agreed to receive your emails." }),
      tags: z.array(TagSchema).max(10).optional(),
    }),
  );
  const result = await importSubscribers(
    c.var.services,
    site.id,
    parseCsv(body.csv),
    body.tags ?? [],
  );
  await log(c, site.id, user, "subscribers.import", {
    added: result.added,
    updated: result.updated,
    skipped: result.skipped.length,
  });
  return c.json(result);
});

siteServiceRoutes.post("/:id/subscribers/tags", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const body = await readJson(
    c,
    z.strictObject({
      ids: IdsSchema,
      add: z.array(TagSchema).max(10).default([]),
      remove: z.array(TagSchema).max(10).default([]),
    }),
  );
  const changed = await setSubscriberTags(
    c.var.services.db,
    site.id,
    body.ids,
    body.add,
    body.remove,
    c.var.services.now(),
  );
  await log(c, site.id, user, "subscribers.tags", {
    count: changed,
    add: body.add,
    remove: body.remove,
  });
  return c.json({ changed });
});

siteServiceRoutes.patch("/:id/subscribers/:subId", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const body = await readJson(
    c,
    z.strictObject({
      tags: z.array(TagSchema).max(20).optional(),
      firstName: z.string().max(80).nullable().optional(),
      status: z.literal("unsubscribed").optional(),
    }),
  );
  const { services } = c.var;
  const row = await getSubscriber(services.db, site.id, c.req.param("subId"));
  if (!row) throw notFound("We couldn't find that subscriber.");
  const now = services.now();
  await services.db
    .prepare(
      `UPDATE subscribers SET tags = COALESCE(?, tags), first_name = CASE WHEN ? THEN ? ELSE first_name END,
         status = COALESCE(?, status), unsubscribed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE unsubscribed_at END,
         updated_at = ? WHERE id = ?`,
    )
    .bind(
      body.tags ? JSON.stringify([...new Set(body.tags)]) : null,
      body.firstName !== undefined ? 1 : 0,
      body.firstName ?? null,
      body.status ?? null,
      body.status ?? null,
      now,
      now,
      row.id,
    )
    .run();
  await log(c, site.id, user, "subscriber.update", { id: row.id, ...body });
  const updated = await getSubscriber(services.db, site.id, row.id);
  return c.json({ subscriber: updated ? toSubscriberView(updated) : null });
});

/** POST /api/sites/:id/subscribers/:subId/confirm { consent: true } — owner confirms by hand. */
siteServiceRoutes.post("/:id/subscribers/:subId/confirm", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  await readJson(
    c,
    z.strictObject({
      consent: z.literal(true, { message: "Confirm this person agreed to receive your emails." }),
    }),
  );
  const { services } = c.var;
  const result = await confirmSubscriberManually(services, site.id, c.req.param("subId"));
  if (!result) throw notFound("That subscriber isn't waiting to confirm.");
  if (result === "full") throw quotaExceeded("subscriber");
  await log(c, site.id, user, "subscriber.confirm", { id: c.req.param("subId") });
  const updated = await getSubscriber(services.db, site.id, c.req.param("subId"));
  return c.json({ subscriber: updated ? toSubscriberView(updated) : null });
});

siteServiceRoutes.delete("/:id/subscribers/:subId", async (c) => {
  const { site, user } = await siteWith(c, "editor");
  const r = await c.var.services.db
    .prepare("DELETE FROM subscribers WHERE site_id = ? AND id = ?")
    .bind(site.id, c.req.param("subId"))
    .run();
  if (!r.meta.changes) throw notFound("We couldn't find that subscriber.");
  await log(c, site.id, user, "subscriber.delete", { id: c.req.param("subId") });
  return c.json({ deleted: 1 });
});

// ---- analytics --------------------------------------------------------------------------------------

siteServiceRoutes.get("/:id/analytics", async (c) => {
  const { site } = await siteWith(c, "contributor");
  const q = z
    .object({
      range: z.enum(["day", "week", "month"]).default("week"),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    })
    .parse(c.req.query());
  let range: Range | { from: number; to: number } = q.range;
  if (q.from && q.to) {
    const from = Date.parse(`${q.from}T00:00:00Z`);
    const to = Date.parse(`${q.to}T00:00:00Z`) + 86_400_000;
    if (to <= from || to - from > 400 * 86_400_000)
      throw badRequest("Choose a range of up to 400 days.");
    range = { from, to };
  }
  return c.json(await analyticsReport(c.var.services, site, range));
});

// ---- domains ----------------------------------------------------------------------------------------

const DomainBody = z.strictObject({ domain: z.string().min(3).max(253) });

function domainDeps(c: Context<AppEnv>) {
  const { services } = c.var;
  return { services, rdap: services.pub.rdap, dns: services.pub.dns };
}

siteServiceRoutes.get("/:id/domain", async (c) => {
  const { site } = await siteWith(c, "editor");
  return c.json({ domain: await getDomain(c.var.services, site) });
});

siteServiceRoutes.post("/:id/domain/lookup", async (c) => {
  const { site } = await siteWith(c, "designer");
  const { domain } = await readJson(c, DomainBody);
  return c.json(await lookupDomain(domainDeps(c), site, domain));
});

siteServiceRoutes.post("/:id/domain", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  const { domain } = await readJson(c, DomainBody);
  return c.json({ domain: await connectDomain(domainDeps(c), site, user, domain) }, 201);
});

siteServiceRoutes.post("/:id/domain/check", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  return c.json({ domain: await checkDomain(domainDeps(c), site, user) });
});

siteServiceRoutes.delete("/:id/domain", async (c) => {
  const { site, user } = await siteWith(c, "designer");
  await removeDomain(c.var.services, site, user);
  return c.json({ domain: null });
});

// ---- data export / deletion ------------------------------------------------------------------------

siteServiceRoutes.get("/:id/export", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const zip = await exportSiteZip(c.var.services, site);
  await log(c, site.id, user, "data.export", { bytes: zip.byteLength });
  return c.body(zip as unknown as ArrayBuffer, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${slug(site.name)}-data.zip"`,
    "Cache-Control": "no-store",
  });
});

siteServiceRoutes.post("/:id/data/delete", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const body = await readJson(
    c,
    z.strictObject({
      confirmName: z.string(),
      scopes: z.array(z.enum([...DATA_SCOPES, "all"])).min(1),
    }),
  );
  if (body.confirmName.trim() !== site.name)
    throw new HttpError(400, "confirmation_mismatch", "Type the site's name exactly to confirm.");
  const scopes = body.scopes.includes("all")
    ? [...DATA_SCOPES]
    : (body.scopes as (typeof DATA_SCOPES)[number][]);
  const deleted = await deleteSiteData(c.var.services.db, site.id, scopes);
  await log(c, site.id, user, "data.delete", { scopes, deleted });
  return c.json({ deleted });
});

siteServiceRoutes.post("/:id/data/erase", async (c) => {
  const { site, user } = await siteWith(c, "owner");
  const { email } = await readJson(c, z.strictObject({ email: z.email() }));
  const deleted = await erasePerson(c.var.services.db, site.id, email);
  // The audit entry records that an erasure happened, not whose data it was.
  await log(c, site.id, user, "data.erase", deleted);
  return c.json({ deleted });
});

// ---- registrar instructions (no site needed) ---------------------------------------------------------

export const domainInfoRoutes = new Hono<AppEnv>();

domainInfoRoutes.get("/registrars", (c) => c.json({ registrars: REGISTRARS.map(publicGuide) }));
