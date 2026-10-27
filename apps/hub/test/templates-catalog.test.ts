import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { computeLookPreviews, lookPreview } from "../src/services/look-preview";
import {
  computeTemplateCatalog,
  computeTemplateDocuments,
  RegistryTemplateSource,
  type TemplateSource,
} from "../src/services/templates";
import { LOOK_PREVIEWS, TEMPLATE_CATALOG } from "../src/templates/catalog";
import { TEMPLATE_DOCUMENTS } from "../src/templates/documents";
import { call } from "./helpers";

describe("embedded template catalog", () => {
  it("matches the registry (run `pnpm embed:catalog` after changing templates or the theme)", async () => {
    const catalog = await computeTemplateCatalog();
    expect(TEMPLATE_CATALOG).toEqual(catalog);
    expect(LOOK_PREVIEWS).toEqual(computeLookPreviews(catalog));
    expect(TEMPLATE_DOCUMENTS).toEqual(await computeTemplateDocuments());
  });

  it("serves the same template detail bytes as building the template would", async () => {
    const registry = new RegistryTemplateSource();
    // The same source without the prebuilt fast path: builds and parses on request.
    const built: TemplateSource = { list: () => registry.list(), load: (id) => registry.load(id) };
    const fast = createApp();
    const slow = createApp({ services: { templates: built } });
    for (const { id } of TEMPLATE_CATALOG) {
      const a = await call(fast, `/api/templates/${id}`);
      const b = await call(slow, `/api/templates/${id}`);
      expect(a.status).toBe(200);
      expect(await a.text()).toBe(await b.text());
    }
  });

  it("is what the registry source lists, one shared array", async () => {
    const a = await new RegistryTemplateSource().list();
    const b = await new RegistryTemplateSource().list();
    expect(a).toBe(TEMPLATE_CATALOG);
    expect(b).toBe(a);
  });

  it("previews every look exactly as lookPreview does", () => {
    for (const t of TEMPLATE_CATALOG)
      for (const l of t.looks)
        expect(LOOK_PREVIEWS[`${t.id}/${l.id}`]).toEqual(lookPreview(l.styles));
  });
});

describe("template responses are cacheable", () => {
  for (const path of ["/api/templates", "/api/templates/meadow"])
    it(`${path}: identical bodies, an ETag, Cache-Control and 304 on revalidation`, async () => {
      const app = createApp();
      const a = await call(app, path);
      const b = await call(app, path);
      expect(a.status).toBe(200);
      expect(a.headers.get("content-type")).toMatch(/^application\/json/);
      expect(a.headers.get("cache-control")).toMatch(/public, max-age=\d+/);
      const etag = a.headers.get("etag");
      expect(etag).toMatch(/^W\/"/);
      expect(b.headers.get("etag")).toBe(etag);
      expect(await b.text()).toBe(await a.text());
      const again = await call(app, path, { headers: { "If-None-Match": etag ?? "" } });
      expect(again.status).toBe(304);
      expect(await again.text()).toBe("");
      const stale = await call(app, path, { headers: { "If-None-Match": 'W/"0-0"' } });
      expect(stale.status).toBe(200);
    });
});
