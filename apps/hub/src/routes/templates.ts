import { Hono } from "hono";
import { notFound } from "../lib/errors";
import { loadSiteDocument } from "../services/site-files";
import type { TemplateMeta } from "../services/templates";
import type { AppEnv } from "../types";

export const templateRoutes = new Hono<AppEnv>();

function galleryItem(meta: TemplateMeta, hubUrl: string) {
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    persona: meta.persona,
    mood: meta.mood,
    version: meta.version,
    looks: meta.looks.map((l) => ({ id: l.id, name: l.name, styles: l.styles })),
    thumbnailUrl: meta.thumbnailUrl,
    previewUrl: `${hubUrl}/t/${meta.id}/`,
  };
}

/** GET /api/templates — public gallery data (no account needed). */
templateRoutes.get("/", async (c) => {
  const list = await c.var.services.templates.list();
  return c.json({ items: list.map((m) => galleryItem(m, c.var.config.hubUrl)) });
});

/** GET /api/templates/:id — gallery data plus the template's document (for in-Studio previews). */
templateRoutes.get("/:id", async (c) => {
  const tpl = await c.var.services.templates.load(c.req.param("id"));
  if (!tpl) throw notFound("That template doesn't exist.");
  return c.json({
    ...galleryItem(tpl.meta, c.var.config.hubUrl),
    document: loadSiteDocument(tpl.files),
  });
});
