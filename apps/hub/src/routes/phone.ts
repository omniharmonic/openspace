/**
 * The Phone check for Studio's publish dialog and phone preview:
 *
 * - `POST /api/sites/:id/phone-check` `{ pages?: string[] }` → `{ phone: PhoneCheckResult }`:
 *   the draft's pages laid out as a phone (360 and 390 px) in Cloudflare Browser Rendering and
 *   measured, plus the static phone rules. Unchanged pages come from the cache; at most
 *   `PHONE_PAGES_PER_RUN` changed pages are measured per call.
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { HttpError } from "../lib/errors";
import { roomStub, unwrapRoom } from "../room";
import { phoneCheckDraft } from "../services/phone-check";
import { siteForUser } from "../services/sites";
import type { AppEnv } from "../types";

const Body = z.object({ pages: z.array(z.string().max(120)).max(200).optional() });

export const phoneRoutes = new Hono<AppEnv>();

phoneRoutes.post("/:id/phone-check", async (c) => {
  const user = requireUser(c);
  const services = c.var.services;
  const site = await siteForUser(services, c.req.param("id"), user);
  const parsed = Body.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    throw new HttpError(400, "invalid_request", "Expected { pages?: string[] }.");
  const { doc } = await unwrapRoom(roomStub(c.env, site.id).getDocument(site.id));
  const phone = await phoneCheckDraft(services, {
    siteId: site.id,
    userId: user.id,
    doc,
    ...(parsed.data.pages ? { pages: parsed.data.pages } : {}),
  });
  return c.json({ phone });
});
