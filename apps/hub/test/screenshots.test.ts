import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { DEV_HMAC_KEY } from "../src/public-env";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import {
  type BrowserBackend,
  browserMayLoad,
  cloudflareBrowser,
  MAX_IMAGE_EDGE,
  MAX_TILES,
  placeholderPng,
  planTiles,
  SHOT_TOKEN_TTL_MS,
  SHOT_USER_RATE,
  type ShotTarget,
  signShotToken,
  verifyShotToken,
} from "../src/services/screenshots";
import { call, devLogin } from "./helpers";
import { HUB, McpTestClient, oauthConnect, toolText } from "./mcp-helpers";
import { createSite } from "./room-helpers";

const fakeDns = {
  async resolve(name: string, type: string) {
    if (type !== "A") return [];
    if (name === "internal.example.com") return ["10.1.2.3"];
    if (name === "metadata.example.com") return ["169.254.169.254"];
    return ["93.184.216.34"];
  },
};

/** Records what it was asked to capture; answers with one tiny JPEG-typed image per target. */
function recordingBackend(): BrowserBackend & { seen: ShotTarget[] } {
  const seen: ShotTarget[] = [];
  return {
    kind: "browser",
    seen,
    async capture(targets) {
      seen.push(...targets);
      return targets.map((t) => ({
        images: [
          { base64: "AAAA", mimeType: "image/jpeg" as const, width: 10, height: 10 },
          ...(t.fullPage
            ? [{ base64: "BBBB", mimeType: "image/jpeg" as const, width: 10, height: 4 }]
            : []),
        ],
        cssWidth: t.width,
        cssHeight: t.fullPage ? 3000 : 900,
        truncated: false,
      }));
    },
  };
}

async function setup(screenshots?: BrowserBackend | null) {
  const limiter = new MemoryRateLimiter();
  const app = createApp({
    services: {
      public: { rateLimit: limiter, dns: fakeDns },
      ...(screenshots !== undefined ? { screenshots } : {}),
    },
  });
  const owner = await devLogin(app, "Maya Lin");
  const site = await createSite(app, owner, "Maya Yoga");
  const conn = await oauthConnect(app, owner, { sites: [site.id] });
  const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
  await mcp.initialize();
  return { app, owner, site, mcp, limiter };
}

type ToolResult = Awaited<ReturnType<McpTestClient["tool"]>>;
const images = (r: ToolResult) =>
  ((r.result?.content ?? []) as Array<{ type: string; mimeType?: string }>).filter(
    (c) => c.type === "image",
  );

describe("remote MCP screenshots", () => {
  it("dev mode answers with a placeholder for the draft and for a public page", async () => {
    const { mcp } = await setup();
    const names = (
      ((await mcp.request("tools/list")).result?.tools ?? []) as Array<{ name: string }>
    ).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["screenshot", "screenshot_url"]));

    const shot = await mcp.tool("screenshot", { page: "/", device: "all" });
    expect(shot.result?.isError).toBeFalsy();
    expect(images(shot)).toHaveLength(3);
    expect(images(shot)[0]?.mimeType).toBe("image/png");
    expect(toolText(shot)).toMatch(/placeholder/);

    const ref = await mcp.tool("screenshot_url", { url: "https://www.example.com/about" });
    expect(ref.result?.isError).toBeFalsy();
    expect(images(ref)).toHaveLength(1);
  });

  it("captures the draft through a short-lived signed preview link, never a session", async () => {
    const backend = recordingBackend();
    const { app, site, mcp } = await setup(backend);
    const shot = await mcp.tool("screenshot", { page: "/", device: "mobile" });
    expect(shot.result?.isError).toBeFalsy();
    // A tall page comes back as tiles, top to bottom.
    expect(images(shot)).toHaveLength(2);
    expect(images(shot)[0]?.mimeType).toBe("image/jpeg");
    const target = backend.seen[0] as ShotTarget;
    expect(target.width).toBe(390);
    expect(target.fullPage).toBe(true);
    const url = new URL(target.url);
    expect(url.pathname).toBe(`/p/${site.id}/`);
    const token = url.searchParams.get("os_shot") as string;
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{32}$/);

    // The link opens the draft without any cookie …
    const ok = await call(app, `${url.pathname}${url.search}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("<html");
    // … but only for this site, and only untampered.
    const other = await createSite(app, await devLogin(app, "Someone Else"), "Other");
    expect((await call(app, `/p/${other.id}/?os_shot=${encodeURIComponent(token)}`)).status).toBe(
      401,
    );
    expect((await call(app, `${url.pathname}?os_shot=${token.slice(0, -2)}xx`)).status).toBe(401);
    expect((await call(app, url.pathname)).status).toBe(401);

    // Sections are captured alone (sticky headers hidden by the browser script).
    const miss = await mcp.tool("screenshot", { page: "/", section: "sec_x", device: "desktop" });
    const sectionId = /Sections: (sec_[0-9a-z]+)/.exec(toolText(miss))?.[1] as string;
    expect(sectionId).toBeTruthy();
    await mcp.tool("screenshot", { page: "/", section: sectionId, device: "desktop" });
    expect(backend.seen[1]?.sectionId).toBe(sectionId);
    expect(backend.seen[1]?.fullPage).toBe(false);
  });

  it("captures the live page of a published site, and any public page", async () => {
    const backend = recordingBackend();
    const { mcp } = await setup(backend);
    // Without a url: the site's live page (in dev, the Hub's /s/ stand-in for GitHub Pages).
    const live = await mcp.tool("screenshot_url", { device: "desktop", fullPage: false });
    expect(live.result?.isError, toolText(live)).toBeFalsy();
    expect(backend.seen.at(-1)?.width).toBe(1440);
    expect(backend.seen.at(-1)?.url).toMatch(/\/s\/st_[0-9a-z]+\/$/);

    const r = await mcp.tool("screenshot_url", { url: "https://old.example.com/", device: "all" });
    expect(r.result?.isError).toBeFalsy();
    expect(backend.seen.slice(-3).map((t) => t.width)).toEqual([1440, 834, 390]);
    expect(backend.seen.at(-1)?.url).toBe("https://old.example.com/");
  });

  it("refuses private, internal and odd addresses (SSRF)", async () => {
    const backend = recordingBackend();
    const { mcp } = await setup(backend);
    for (const url of [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://localhost:5173/",
      "http://metadata.google.internal/",
      "https://intranet/",
      "https://example.com:8443/",
      "https://user:pw@example.com/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://internal.example.com/",
      "https://metadata.example.com/",
      "http://2130706433/",
    ]) {
      const r = await mcp.tool("screenshot_url", { url });
      expect(r.result?.isError, url).toBe(true);
    }
    expect(backend.seen).toHaveLength(0);
  });

  it("limits screenshots per person", async () => {
    const backend = recordingBackend();
    const { mcp } = await setup(backend);
    let limited = false;
    for (let i = 0; i <= SHOT_USER_RATE.limit; i++) {
      const r = await mcp.tool("screenshot_url", { url: "https://www.example.com/" });
      if (r.result?.isError) {
        expect(toolText(r)).toMatch(/a lot of screenshots/);
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
    expect(backend.seen.length).toBe(SHOT_USER_RATE.limit);
  });

  it("explains when the operator hasn't enabled Browser Rendering", async () => {
    const { mcp } = await setup(null);
    const r = await mcp.tool("screenshot_url", { url: "https://www.example.com/" });
    expect(r.result?.isError).toBe(true);
    expect(toolText(r)).toMatch(/Browser Rendering/);
    const d = await mcp.tool("screenshot", { page: "/" });
    expect(d.result?.isError).toBe(true);
  });
});

describe("screenshot helpers", () => {
  it("signs tokens per site with a short lifetime", async () => {
    const now = 1_800_000_000_000;
    const t = await signShotToken(DEV_HMAC_KEY, "st_a", now);
    expect(await verifyShotToken(DEV_HMAC_KEY, "st_a", t, now)).toBe(true);
    expect(await verifyShotToken(DEV_HMAC_KEY, "st_b", t, now)).toBe(false);
    expect(await verifyShotToken("other-key", "st_a", t, now)).toBe(false);
    expect(await verifyShotToken(DEV_HMAC_KEY, "st_a", t, now + SHOT_TOKEN_TTL_MS + 1)).toBe(false);
    expect(await verifyShotToken(DEV_HMAC_KEY, "st_a", "garbage", now)).toBe(false);
  });

  it("checks every request the browser makes", () => {
    expect(browserMayLoad("https://fonts.googleapis.com/css2")).toBe(true);
    expect(browserMayLoad("data:image/png;base64,AAAA")).toBe(true);
    expect(browserMayLoad("http://10.0.0.1/")).toBe(false);
    expect(browserMayLoad("http://169.254.169.254/")).toBe(false);
    expect(browserMayLoad("http://[fd00::1]/")).toBe(false);
    expect(browserMayLoad("http://printer.local/")).toBe(false);
    expect(browserMayLoad("ftp://example.com/")).toBe(false);
    expect(browserMayLoad("http://localhost:8787/p/x", ["http://localhost:8787"])).toBe(true);
  });

  it("tiles tall pages for the model and caps their height", () => {
    const desk = planTiles(1440, 3000);
    expect(desk.scale).toBeCloseTo(1280 / 1440);
    for (const t of desk.tiles)
      expect(Math.round(t.height * desk.scale)).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
    expect(desk.tiles.reduce((n, t) => n + t.height, 0)).toBe(3000);
    expect(desk.truncated).toBe(false);
    const huge = planTiles(390, 50_000);
    expect(huge.tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(huge.truncated).toBe(true);
  });

  it("makes a valid placeholder PNG", () => {
    const png = placeholderPng(12, 8);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const v = new DataView(png.buffer);
    expect(v.getUint32(16)).toBe(12);
    expect(v.getUint32(20)).toBe(8);
  });

  it("drives Browser Rendering: reuses an idle session, blocks private requests, JPEG tiles", async () => {
    const calls: string[] = [];
    const aborted: string[] = [];
    let handler: ((req: unknown) => void) | undefined;
    const page = {
      setViewport: async () => undefined,
      setRequestInterception: async () => undefined,
      on: (_: string, h: (req: unknown) => void) => {
        handler = h;
      },
      goto: async (url: string) => {
        calls.push(`goto ${url}`);
        for (const u of [url, "http://10.0.0.5/track.gif", "https://cdn.example.com/a.jpg"])
          handler?.({
            url: () => u,
            continue: async () => undefined,
            abort: async () => {
              aborted.push(u);
            },
          });
      },
      waitForNetworkIdle: async () => undefined,
      evaluate: async (script: string) => (script.includes("scrollHeight") ? 2600 : undefined),
      viewport: () => ({ width: 1440, height: 900 }),
      screenshot: async (o: { type: string; clip: { height: number; scale: number } }) => {
        calls.push(`shot ${o.type} ${o.clip.height} ${o.clip.scale.toFixed(2)}`);
        return new Uint8Array([1, 2, 3]);
      },
      close: async () => {
        calls.push("close");
      },
    };
    const browser = {
      newPage: async () => page,
      disconnect: async () => {
        calls.push("disconnect");
      },
    };
    const puppeteer = {
      sessions: async () => [{ sessionId: "busy", connectionId: "c1" }, { sessionId: "idle" }],
      connect: async (_b: unknown, id: string) => {
        calls.push(`connect ${id}`);
        return browser;
      },
      launch: async () => {
        calls.push("launch");
        return browser;
      },
    };
    const backend = cloudflareBrowser(
      { fetch: (async () => new Response()) as unknown as typeof fetch },
      { loadPuppeteer: async () => puppeteer },
    );
    const [r] = await backend.capture([
      { url: "https://old.example.com/", width: 1440, fullPage: true },
    ]);
    expect(calls[0]).toBe("connect idle");
    expect(calls).not.toContain("launch");
    expect(aborted).toEqual(["http://10.0.0.5/track.gif"]);
    expect(r?.images.length).toBe(2);
    expect(r?.images[0]?.mimeType).toBe("image/jpeg");
    expect(calls.filter((c) => c.startsWith("shot jpeg"))).toHaveLength(2);
    expect(calls.slice(-2)).toEqual(["close", "disconnect"]);
  });

  it("waits for a busy browser instead of failing when two screenshots are asked at once", async () => {
    let launches = 0;
    const browser = {
      newPage: async () => ({
        setViewport: async () => undefined,
        setRequestInterception: async () => undefined,
        on: () => undefined,
        goto: async () => undefined,
        waitForNetworkIdle: async () => undefined,
        evaluate: async () => undefined,
        viewport: () => ({ width: 390, height: 844 }),
        screenshot: async () => new Uint8Array([1]),
        close: async () => undefined,
      }),
      disconnect: async () => undefined,
    };
    const puppeteer = {
      sessions: async () => [],
      connect: async () => browser,
      launch: async () => {
        launches++;
        if (launches < 3) throw new Error("Unable to create new browser: code: 429: rate limit");
        return browser;
      },
    };
    const waits: number[] = [];
    const backend = cloudflareBrowser(
      { fetch: (async () => new Response()) as unknown as typeof fetch },
      {
        loadPuppeteer: async () => puppeteer,
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    const [r] = await backend.capture([{ url: "https://old.example.com/", width: 390 }]);
    expect(r?.images).toHaveLength(1);
    expect(launches).toBe(3);
    expect(waits).toHaveLength(2);
  });
});
