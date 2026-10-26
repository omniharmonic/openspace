import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/env";
import { siteCors, siteOrigins } from "../src/lib/cors";

describe("public per-site CORS", () => {
  const prod = readConfig({ ...env, DEV_MODE: "false" });
  const dev = readConfig(env);

  it("allows the deploy origin, the custom domain (and www) and, in dev, Studio/Hub", () => {
    const site = { url: "https://maya.github.io/maya-yoga/", domain: "mayayoga.com" };
    expect(siteOrigins(site, prod).sort()).toEqual(
      ["https://maya.github.io", "https://mayayoga.com", "https://www.mayayoga.com"].sort(),
    );
    expect(siteOrigins({ url: null, domain: null }, dev)).toEqual([
      "http://localhost:5173",
      "http://localhost:8787",
    ]);
  });

  it("answers preflights only for the site's origins", async () => {
    const app = new Hono();
    app.use(
      "/f/:siteId/*",
      siteCors(prod, async (id) =>
        id === "st_known00000" ? { url: "https://maya.github.io/x/", domain: null } : null,
      ),
    );
    app.post("/f/:siteId/:form", (c) => c.json({ ok: true }));
    const ok = await app.request("/f/st_known00000/frm_1", {
      method: "OPTIONS",
      headers: { Origin: "https://maya.github.io", "Access-Control-Request-Method": "POST" },
    });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://maya.github.io");
    const no = await app.request("/f/st_known00000/frm_1", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
    const unknown = await app.request("/f/st_other00000/frm_1", {
      method: "POST",
      headers: { Origin: "https://maya.github.io" },
    });
    expect(unknown.headers.get("access-control-allow-origin")).toBeNull();
  });
});
