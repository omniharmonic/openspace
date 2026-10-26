import { env } from "cloudflare:test";
import type { SiteDocument } from "@openspace/schema";
import { planSite, renderRoute } from "@openspace/site-kit/render";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { BEHAVIOR_SOURCES } from "../src/services/behavior-sources";
import { call, devLogin } from "./helpers";
import { PNG_1PX, STUDIO_ORIGIN } from "./mcp-helpers";
import { op } from "./room-helpers";

const HUB = "http://localhost:8787";

async function meadowSite() {
  const app = createApp();
  const cookie = await devLogin(app, "Kai Moreno");
  const res = await call(app, "/api/sites", {
    method: "POST",
    cookie,
    json: { template: "meadow", name: "Fernwood Studio" },
  });
  expect(res.status).toBe(201);
  const site = (await res.json()) as { id: string };
  return { app, cookie, site };
}

async function published(app: ReturnType<typeof createApp>, id: string, cookie: string) {
  const res = await call(app, `/api/sites/${id}/document?ref=published`, { cookie });
  return ((await res.json()) as { document: SiteDocument }).document;
}

describe("dev preview through the real renderer", () => {
  it("embeds the renderer's current behavior bundles", () => {
    expect(BEHAVIOR_SOURCES).toEqual(JSON.parse(env.BEHAVIOR_BUNDLES));
  });

  it("serves exactly what a published build renders, collection pages and behaviors included", async () => {
    const { app, cookie, site } = await meadowSite();
    const doc = await published(app, site.id, cookie);
    const plan = planSite(doc);
    const basePath = `/s/${site.id}`;
    const location = { site: HUB, base: basePath, basePath, siteUrl: `${HUB}${basePath}/` };
    const item = plan.routes.find((r) => r.kind === "item");
    const list = plan.routes.find((r) => r.kind === "collection");
    for (const route of [plan.routes.find((r) => r.path === "/"), item, list]) {
      if (!route) throw new Error("missing route");
      const res = await call(app, `${basePath}${route.path}`);
      expect(res.status, route.path).toBe(200);
      const html = await res.text();
      // Byte-identical to site-kit's build output for the same location (`now` aside).
      const expected = renderRoute({
        plan,
        route,
        location,
        hubUrl: HUB,
        mode: "production",
        ogImages: false,
      });
      expect(html.length, route.path).toBeGreaterThan(1000);
      expect(html.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "")).toBe(
        expected.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ""),
      );
    }
    const home = await (await call(app, `${basePath}/`)).text();
    expect(home).toContain('<style data-os="blocks">');
    const scripts = [...home.matchAll(/src="([^"]+_os\/behaviors\/[^"]+\.js)"/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const src of scripts) {
      const js = await call(app, src as string);
      expect(js.status, src).toBe(200);
      expect(js.headers.get("content-type")).toContain("javascript");
      expect(js.headers.get("access-control-allow-origin")).toBe("*");
    }
    expect((await call(app, `${basePath}/_os/behaviors/nope.js`)).status).toBe(404);
  });

  it("shows draft media through signed URLs and published media publicly", async () => {
    const { app, cookie, site } = await meadowSite();
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", PNG_1PX))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const path = `media/2026/10/dot-${sha.slice(0, 8)}.png`;
    const form = new FormData();
    form.set(
      "meta",
      JSON.stringify({ path, mime: "image/png", bytes: PNG_1PX.length, sha256: sha }),
    );
    form.set("file", new Blob([PNG_1PX], { type: "image/png" }), "dot.png");
    const up = await call(app, `/api/sites/${site.id}/media`, {
      method: "POST",
      cookie,
      headers: { Origin: STUDIO_ORIGIN },
      body: form,
    });
    expect(up.status).toBe(201);
    const doc = await published(app, site.id, cookie);
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    const heroImage = home?.sections.flatMap((s) => s.blocks).find((b) => b.type === "image");
    if (!home || !heroImage) throw new Error("no image block");
    const ops = [
      op({
        op: "media.add",
        path,
        meta: {
          id: "med_0000000001",
          path,
          kind: "image",
          mime: "image/png",
          bytes: PNG_1PX.length,
          width: 1,
          height: 1,
          alt: "A dot",
          createdAt: new Date().toISOString(),
        },
      }),
      op({
        op: "block.update",
        page: home.id,
        block: heroImage.id,
        set: { image: { src: path, alt: "A dot" } },
      }),
    ];
    const sub = await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie,
      headers: { Origin: STUDIO_ORIGIN },
      json: { ops },
    });
    const results = ((await sub.json()) as { results: Array<{ status: string }> }).results;
    expect(results.map((r) => r.status)).toEqual(["accepted", "accepted"]);

    const draft = await (await call(app, `/p/${site.id}/`, { cookie })).text();
    const signed = new RegExp(`/p/${site.id}/${path}\\?exp=\\d+&amp;sig=[A-Za-z0-9_-]+`).exec(
      draft,
    )?.[0];
    expect(signed, "signed media URL in the draft").toBeTruthy();
    const url = (signed as string).replace(/&amp;/g, "&");
    const img = await call(app, url); // no cookie: sandboxed pages send none
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect((await call(app, url.replace(/sig=[^&]+/, "sig=forged"))).status).toBe(404);
    expect((await call(app, `/p/${site.id}/${path}`)).status).toBe(404);

    // After publishing, the live preview serves it publicly.
    await call(app, `/api/sites/${site.id}/publish`, {
      method: "POST",
      cookie,
      headers: { Origin: STUDIO_ORIGIN },
    });
    const live = await (await call(app, `/s/${site.id}/`)).text();
    expect(live).toContain(`/s/${site.id}/${path}`);
    expect((await call(app, `/s/${site.id}/${path}`)).status).toBe(200);
    expect((await call(app, `/s/${site.id}/media/../openspace.json`)).status).toBe(404);
  });
});
