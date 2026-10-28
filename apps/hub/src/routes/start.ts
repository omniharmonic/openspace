/**
 * "Start with Claude" (session cookie; Studio):
 *
 * - `POST /api/start {name, about?, audience?, feeling?, notes?, tokens?, colors?, fonts?, logo?,
 *   photos?, brandDoc?, html?, owner?}` → 201 `{ site, startedFrom }`: a new site that goes live
 *   at once — the page they brought made editable, or the closest template in their brand.
 * - `POST /api/imports/html {name?, html, confirmOwnership}` → the same for "Move my site" →
 *   "Upload a page" (a page Claude made, an HTML file or a zip).
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { readJson } from "../lib/validate";
import { createStartSite, StartInputSchema } from "../services/start-with-claude";
import type { AppEnv } from "../types";

export const startRoutes = new Hono<AppEnv>();

startRoutes.post("/", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, StartInputSchema);
  return c.json(await createStartSite(c.var.services, user, input, { log: c.var.log }), 201);
});

export const UploadImportSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  html: StartInputSchema.shape.html.unwrap(),
  confirmOwnership: z.literal(true, {
    error: "Confirm that this page is yours (or that you're moving it for its owner).",
  }),
  owner: StartInputSchema.shape.owner,
});

export async function uploadImport(c: Context<AppEnv>) {
  const user = requireUser(c);
  const input = await readJson(c, UploadImportSchema);
  const name =
    input.name ??
    (input.html.name
      .replace(/\.(?:html?|zip)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() ||
      "My site");
  return c.json(
    await createStartSite(
      c.var.services,
      user,
      { name: name.slice(0, 80), html: input.html, ...(input.owner ? { owner: input.owner } : {}) },
      { log: c.var.log },
    ),
    201,
  );
}
