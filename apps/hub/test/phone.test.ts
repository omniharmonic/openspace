import type { PhoneProbeResult } from "@omniharmonic/openspace-lint";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import type { BrowserBackend, PhoneTarget } from "../src/services/screenshots";
import { call, devLogin } from "./helpers";
import { HUB, McpTestClient, oauthConnect } from "./mcp-helpers";
import { createSite } from "./room-helpers";

/** A browser that finds an overlap on every page it measures, and records what it measured. */
function phoneBrowser(): BrowserBackend & { measured: PhoneTarget[] } {
  const measured: PhoneTarget[] = [];
  return {
    kind: "browser",
    measured,
    async capture() {
      return [];
    },
    async measure(targets) {
      measured.push(...targets);
      return targets.map(
        (t): PhoneProbeResult => ({
          width: t.width,
          height: 780,
          scrollWidth: t.width + 40,
          findings: [{ kind: "page-overflow", area: "main", tag: "table", value: 40 }],
        }),
      );
    },
  };
}

class MemoryKv {
  map = new Map<string, string>();
  async get(key: string, type?: string) {
    const v = this.map.get(key);
    return v === undefined ? null : type === "json" ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
}

async function setup(screenshots?: BrowserBackend | null) {
  const cache = new MemoryKv();
  const app = createApp({
    services: {
      public: { rateLimit: new MemoryRateLimiter(), cache: cache as never },
      ...(screenshots !== undefined ? { screenshots } : {}),
    },
  });
  const owner = await devLogin(app, "Maya Lin");
  const site = await createSite(app, owner, "Maya Yoga");
  return { app, owner, site, cache };
}

describe("phone check on the Hub", () => {
  it("measures each draft page as a phone at 360 and 390, then answers unchanged pages from the cache", async () => {
    const browser = phoneBrowser();
    const { app, owner, site, cache } = await setup(browser);
    const res = await call(app, `/api/sites/${site.id}/phone-check`, {
      method: "POST",
      cookie: owner,
      json: { pages: [""] },
    });
    expect(res.status).toBe(200);
    const { phone } = (await res.json()) as {
      phone: {
        rendered: boolean;
        measured: number;
        cached: number;
        issues: Array<{ rule: string; message: string }>;
      };
    };
    expect(phone.rendered).toBe(true);
    expect(phone.measured).toBe(1);
    expect(browser.measured.map((t) => t.width)).toEqual([360, 390]);
    expect(new URL(browser.measured[0]?.url as string).searchParams.get("os_shot")).toBeTruthy();
    const overflow = phone.issues.find((i) => i.rule === "phone-page-overflow");
    expect(overflow?.message).toMatch(/scrolls sideways/);
    expect(cache.map.size).toBe(2);

    // Nothing changed: no browser this time.
    const again = (await (
      await call(app, `/api/sites/${site.id}/phone-check`, {
        method: "POST",
        cookie: owner,
        json: { pages: [""] },
      })
    ).json()) as { phone: { measured: number; cached: number } };
    expect(again.phone.measured).toBe(0);
    expect(again.phone.cached).toBe(1);
    expect(browser.measured).toHaveLength(2);
  });

  it("runs the static rules and says so without a browser", async () => {
    const { app, owner, site } = await setup(null);
    const res = await call(app, `/api/sites/${site.id}/phone-check`, {
      method: "POST",
      cookie: owner,
      json: {},
    });
    const { phone } = (await res.json()) as { phone: { rendered: boolean; note: string } };
    expect(phone.rendered).toBe(false);
    expect(phone.note).toMatch(/isn't available/);
  });

  it("is only for people working on the site", async () => {
    const { app, site } = await setup(phoneBrowser());
    const stranger = await devLogin(app, "Someone Else");
    const res = await call(app, `/api/sites/${site.id}/phone-check`, {
      method: "POST",
      cookie: stranger,
      json: {},
    });
    expect(res.status).toBe(404);
  });

  it("gives Claude phone_check through the remote MCP server", async () => {
    const browser = phoneBrowser();
    const { app, owner, site } = await setup(browser);
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const r = await mcp.tool("phone_check", { page: "/" });
    expect(r.result?.isError).toBeFalsy();
    const data = r.result?.structuredContent as {
      rendered: boolean;
      issues: Array<{ rule: string }>;
    };
    expect(data.rendered).toBe(true);
    expect(data.issues.map((i) => i.rule)).toContain("phone-page-overflow");
  });
});
