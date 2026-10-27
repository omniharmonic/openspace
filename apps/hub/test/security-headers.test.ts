import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { call } from "./helpers";

describe("security headers", () => {
  it("API responses: nosniff, no framing, strict CSP, referrer policy; HSTS on https", async () => {
    const app = createApp();
    const res = await call(app, "/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    const https = await call(
      app,
      "/api/capabilities",
      {},
      {
        ...(env as unknown as Record<string, unknown>),
        HUB_URL: "https://hub.example",
      },
    );
    expect(https.headers.get("strict-transport-security")).toMatch(/max-age=31536000/);
    // Credentialed CORS still works next to the new headers.
    const cors = await call(app, "/api/me", { headers: { Origin: "http://localhost:5173" } });
    expect(cors.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("Hub HTML pages keep their own CSP; previews stay sandboxed and only Studio may frame them", async () => {
    const app = createApp();
    const preview = await call(app, "/t/basic/");
    const csp = preview.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).toContain("frame-ancestors 'self' http://localhost:5173");
    expect(preview.headers.get("x-frame-options")).toBeNull();
    const page = await call(app, "/n/confirm/nope");
    expect(page.headers.get("content-security-policy")).toContain("style-src 'unsafe-inline'");
  });
});
