/**
 * Hosted imports — "Move my site" (session cookie; Studio):
 *
 * - `POST /api/imports {url, name?, platform?, render?, confirmOwnership: true, owner?}` → 201
 *   `{ site, import }`: a new site whose content comes from the address (any platform, a GitHub
 *   Pages site or repository). The import runs in the new repository's GitHub Actions.
 * - `POST /api/imports/convert {repo, confirmOwnership: true}` → 201 `{ site, import }`: make an
 *   existing GitHub Pages repository editable in place (a branch and, when ready, a pull request).
 * - `GET /api/imports/:id` → the import's progress (`ImportView`), moved along on every call.
 * - `POST /api/imports/:id/retry` → run it again ("Try again").
 * - `GET /api/imports/:id/fidelity/:file` → a side-by-side thumbnail (original | new site) from
 *   the import's fidelity comparison, read from the site's repository.
 * - `GET /api/sites/:id/import` → `{ import: ImportView | null }`, the site's newest import.
 */
import { Hono } from "hono";
import { requireUser } from "../auth/session";
import { readJson } from "../lib/validate";
import {
  ConvertInputSchema,
  convertRepo,
  createImportSite,
  ImportInputSchema,
  importFidelityImage,
  importViewFor,
  retryImport,
  siteImportView,
} from "../services/imports";
import type { AppEnv } from "../types";
import { uploadImport } from "./start";

export const importRoutes = new Hono<AppEnv>();
export const siteImportRoutes = new Hono<AppEnv>();

importRoutes.post("/", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, ImportInputSchema);
  return c.json(
    await createImportSite(c.var.services, c.env, user, input, { log: c.var.log }),
    201,
  );
});

/** "Upload a page": an HTML file or zip (a page Claude made) → an editable site, live at once. */
importRoutes.post("/html", (c) => uploadImport(c));

importRoutes.post("/convert", async (c) => {
  const user = requireUser(c);
  const input = await readJson(c, ConvertInputSchema);
  return c.json(await convertRepo(c.var.services, c.env, user, input, { log: c.var.log }), 201);
});

importRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  return c.json(await importViewFor(c.var.services, c.env, c.req.param("id"), user, c.var.log));
});

importRoutes.post("/:id/retry", async (c) => {
  const user = requireUser(c);
  return c.json(await retryImport(c.var.services, c.env, c.req.param("id"), user, c.var.log));
});

importRoutes.get("/:id/fidelity/:file", async (c) => {
  const user = requireUser(c);
  const bytes = await importFidelityImage(
    c.var.services,
    c.req.param("id"),
    c.req.param("file"),
    user,
  );
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});

siteImportRoutes.get("/:id/import", async (c) => {
  const user = requireUser(c);
  return c.json({
    import: await siteImportView(c.var.services, c.env, c.req.param("id"), user, c.var.log),
  });
});
