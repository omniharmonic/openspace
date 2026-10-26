import { Hono } from "hono";
import { requireUser } from "../auth/session";
import { readJson } from "../lib/validate";
import {
  archiveSite,
  CreateSiteSchema,
  cancelTransfer,
  createSite,
  DeleteSiteSchema,
  getSiteView,
  listSites,
  PatchSiteSchema,
  patchSite,
  publishSite,
  readSiteDocument,
  siteForUser,
  TransferSiteSchema,
  transferSite,
} from "../services/sites";
import type { AppEnv } from "../types";

export const siteRoutes = new Hono<AppEnv>();

/** GET /api/sites — sites the person owns or collaborates on. */
siteRoutes.get("/", async (c) => {
  const user = requireUser(c);
  return c.json({ sites: await listSites(c.var.services, user) });
});

/** POST /api/sites { template, look?, name, tagline?, brandColor? } */
siteRoutes.post("/", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, CreateSiteSchema);
  const site = await createSite(c.var.services, user, input, { log: c.var.log });
  return c.json(site, 201);
});

siteRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  return c.json(await getSiteView(c.var.services, c.req.param("id"), user, c.var.log));
});

siteRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);
  const patch = await readJson(c, PatchSiteSchema);
  return c.json(await patchSite(c.var.services, c.req.param("id"), user, patch));
});

/**
 * POST /api/sites/:id/publish — flush the draft room and squash-publish the draft (editor+);
 * a site whose setup didn't finish resumes setup instead. Returns the site plus `publish`.
 */
siteRoutes.post("/:id/publish", async (c) => {
  const user = requireUser(c);
  return c.json(await publishSite(c.var.services, c.env, c.req.param("id"), user, c.var.log));
});

/** DELETE /api/sites/:id { confirmName: "<site name>" } — archive with 30-day retention. */
siteRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  const { confirm } = await readJson(c, DeleteSiteSchema);
  return c.json(await archiveSite(c.var.services, c.req.param("id"), user, confirm, c.var.log));
});

/** POST /api/sites/:id/transfer { to: "<login>" } */
siteRoutes.post("/:id/transfer", async (c) => {
  const user = requireUser(c);
  const { to } = await readJson(c, TransferSiteSchema);
  return c.json(await transferSite(c.var.services, c.req.param("id"), user, to));
});

/** DELETE /api/sites/:id/transfer — withdraw a pending ownership transfer (owner). */
siteRoutes.delete("/:id/transfer", async (c) => {
  const user = requireUser(c);
  return c.json(await cancelTransfer(c.var.services, c.req.param("id"), user));
});

/** GET /api/sites/:id/document[?ref=published] — the full SiteDocument at the draft head. */
siteRoutes.get("/:id/document", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const which = c.req.query("ref") === "published" ? "published" : "draft";
  const snap = await readSiteDocument(c.var.services, site, which, user);
  return c.json({ document: snap.doc, head: snap.head, branch: snap.branch });
});
