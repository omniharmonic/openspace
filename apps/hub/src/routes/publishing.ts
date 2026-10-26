import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { readJson } from "../lib/validate";
import { roomStub, unwrapRoom } from "../room";
import {
  cancelSchedule,
  listSchedules,
  listSnapshots,
  listVersions,
  PUBLISH_ROLE,
  ROLLBACK_ROLE,
  restoreSnapshot,
  ScheduleSchema,
  SnapshotNameSchema,
  schedulePublish,
} from "../services/publishing";
import { getSiteView, ownerOf, requireRole, siteForUser } from "../services/sites";
import { pagesWithoutPassword } from "../services/worker-secrets";
import type { AppEnv } from "../types";

/** History, rollback, snapshots, scheduled publish and "Fix it for me" (arch §5.4–§5.5). */
export const publishingRoutes = new Hono<AppEnv>();

const RollbackSchema = z.strictObject({ sha: z.string().regex(/^[0-9a-f]{7,64}$/) });

/** GET /api/sites/:id/versions — published versions, newest first. */
publishingRoutes.get("/:id/versions", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const owner = await ownerOf(c.var.services, site);
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 100);
  return c.json({ versions: await listVersions(c.var.services, site, owner, limit) });
});

/** POST /api/sites/:id/rollback { sha } — new version on main with that version's content. */
publishingRoutes.post("/:id/rollback", async (c) => {
  const user = requireUser(c);
  const { sha } = await readJson(c, RollbackSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, ROLLBACK_ROLE);
  const result = await unwrapRoom(
    roomStub(c.env, site.id).rollback(site.id, { userId: user.id, sha }),
  );
  // Studio asks for a password when the restored version protects a page that has none.
  const { doc } = await unwrapRoom(roomStub(c.env, site.id).getDocument(site.id));
  return c.json({
    ...result,
    pagesWithoutPassword: await pagesWithoutPassword(c.var.services.db, site.id, doc),
    site: await getSiteView(c.var.services, site.id, user),
  });
});

/**
 * POST /api/sites/:id/discard — "Discard changes": the draft goes back to what is live, as
 * ordinary (undoable) ops through the room. Designer or owner. → `{ applied, failed, seq, hadChanges }`
 */
publishingRoutes.post("/:id/discard", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, "designer");
  return c.json(
    await unwrapRoom(roomStub(c.env, site.id).discardDraft(site.id, { userId: user.id })),
  );
});

/** POST /api/sites/:id/fix — "Fix it for me" for the last failed publish. */
publishingRoutes.post("/:id/fix", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, PUBLISH_ROLE);
  const result = await unwrapRoom(
    roomStub(c.env, site.id).fixLastPublish(site.id, { userId: user.id }),
  );
  return c.json({ ...result, site: await getSiteView(c.var.services, site.id, user) });
});

/** GET /api/sites/:id/snapshots */
publishingRoutes.get("/:id/snapshots", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const owner = await ownerOf(c.var.services, site);
  return c.json({ snapshots: await listSnapshots(c.var.services, site, owner) });
});

/** POST /api/sites/:id/snapshots { name } — tag the current draft as `os/snap/<name>`. */
publishingRoutes.post("/:id/snapshots", async (c) => {
  const user = requireUser(c);
  const { name } = await readJson(c, SnapshotNameSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, "editor");
  return c.json(await unwrapRoom(roomStub(c.env, site.id).snapshot(site.id, name)), 201);
});

/** POST /api/sites/:id/snapshots/:name/restore — make the draft match the snapshot (as ops). */
publishingRoutes.post("/:id/snapshots/:name/restore", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, ROLLBACK_ROLE);
  const owner = await ownerOf(c.var.services, site);
  return c.json(
    await restoreSnapshot(c.env, c.var.services, site, owner, user, c.req.param("name")),
  );
});

/** GET /api/sites/:id/schedule — scheduled publishes. */
publishingRoutes.get("/:id/schedule", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  return c.json({ schedules: await listSchedules(c.var.services, site.id) });
});

/** POST /api/sites/:id/schedule { at } — publish the draft at a date and time. */
publishingRoutes.post("/:id/schedule", async (c) => {
  const user = requireUser(c);
  const { at } = await readJson(c, ScheduleSchema);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, PUBLISH_ROLE);
  return c.json(await schedulePublish(c.var.services, site, user, at), 201);
});

/** DELETE /api/sites/:id/schedule/:scheduleId */
publishingRoutes.delete("/:id/schedule/:scheduleId", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  requireRole(site, PUBLISH_ROLE);
  await cancelSchedule(c.var.services, site.id, c.req.param("scheduleId"), user);
  return c.json({ ok: true });
});
