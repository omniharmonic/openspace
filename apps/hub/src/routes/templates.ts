import type { Context } from "hono";
import { Hono } from "hono";
import { notFound } from "../lib/errors";
import { cachedLookPreview } from "../services/look-preview";
import { loadSiteDocument } from "../services/site-files";
import type { TemplateMeta, TemplateSource } from "../services/templates";
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
    // `styles` is the compact preview Studio sketches from; `siteStyles` the full styles.json.
    looks: meta.looks.map((l) => ({
      id: l.id,
      name: l.name,
      styles: cachedLookPreview(l.styles),
      siteStyles: l.styles,
    })),
    ...(meta.sample ? { sample: meta.sample } : {}),
    thumbnailUrl: meta.thumbnailUrl,
    previewUrl: `${hubUrl}/t/${meta.id}/`,
  };
}

// --- per-isolate response cache --------------------------------------------------------------------
//
// Template data is immutable for the life of a deployment, so the serialized responses are kept
// per isolate: the gallery list by the identity of the array its source returned (the registry
// returns one shared array), a template's detail by its source instance. Nothing here depends on
// who is asking. Browsers revalidate with the ETag.

interface Cached {
  body: string;
  etag: string;
}

const listCache = new WeakMap<readonly TemplateMeta[], Map<string, Cached>>();
const detailCache = new WeakMap<TemplateSource, Map<string, Cached>>();

/** Gallery data changes only on deploy: let browsers reuse it briefly, then revalidate. */
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

/** FNV-1a (32-bit) of the body, as a weak ETag: cheap, and computed once per cached body. */
function etagOf(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `W/"${(h >>> 0).toString(16)}-${body.length.toString(16)}"`;
}

function cacheFor<K extends object>(caches: WeakMap<K, Map<string, Cached>>, owner: K) {
  let map = caches.get(owner);
  if (!map) {
    map = new Map();
    caches.set(owner, map);
  }
  return map;
}

function cached(map: Map<string, Cached>, key: string, make: () => unknown): Cached {
  let hit = map.get(key);
  if (!hit) {
    const body = JSON.stringify(make());
    hit = { body, etag: etagOf(body) };
    map.set(key, hit);
  }
  return hit;
}

function send(c: Context<AppEnv>, { body, etag }: Cached) {
  c.header("ETag", etag);
  c.header("Cache-Control", CACHE_CONTROL);
  const match = c.req.header("if-none-match");
  if (match?.split(",").some((t) => t.trim() === etag)) return c.body(null, 304);
  c.header("Content-Type", "application/json");
  return c.body(body, 200);
}

/** GET /api/templates — public gallery data (no account needed). */
templateRoutes.get("/", async (c) => {
  const list = await c.var.services.templates.list();
  const byHub = cacheFor(listCache, list);
  const { hubUrl } = c.var.config;
  return send(
    c,
    cached(byHub, hubUrl, () => ({ templates: list.map((m) => galleryItem(m, hubUrl)) })),
  );
});

/** GET /api/templates/:id — gallery data plus the template's document (for in-Studio previews). */
templateRoutes.get("/:id", async (c) => {
  const source = c.var.services.templates;
  const id = c.req.param("id");
  const { hubUrl } = c.var.config;
  const byKey = cacheFor(detailCache, source);
  const key = `${id}\n${hubUrl}`;
  let hit = byKey.get(key);
  const pre = hit ? undefined : source.prebuilt?.(id);
  if (pre) {
    // Same bytes as the general path below: the gallery item with `document` appended last.
    const item = JSON.stringify(galleryItem(pre.meta, hubUrl));
    const body = `${item.slice(0, -1)},"document":${pre.documentJson}}`;
    hit = { body, etag: etagOf(body) };
    byKey.set(key, hit);
  } else if (!hit) {
    const tpl = await source.load(id);
    if (!tpl) throw notFound("That template doesn't exist.");
    hit = cached(byKey, key, () => ({
      ...galleryItem(tpl.meta, hubUrl),
      document: loadSiteDocument(tpl.files),
    }));
  }
  return send(c, hit);
});
