import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/env";
import { siteOrigins } from "../src/lib/cors";

describe("config", () => {
  it("refuses DEV_MODE on an https Hub unless ALLOW_DEV_MODE is set", () => {
    const https = { ...env, DEV_MODE: "true", HUB_URL: "https://hub.example.org" };
    expect(readConfig(https)).toMatchObject({ devMode: false, devModeRefused: true });
    expect(readConfig({ ...https, ALLOW_DEV_MODE: "true" })).toMatchObject({
      devMode: true,
      devModeRefused: false,
    });
    expect(readConfig(env)).toMatchObject({ devMode: true, devModeRefused: false });
  });
});

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
});
