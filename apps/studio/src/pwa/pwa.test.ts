import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHub } from "../api/mock";
import { type HubApi, HubError } from "../api/types";
import { STUDIO_MANIFEST } from "./manifest";
import { isNetworkError, type KeyValue, useOfflineState, withOfflineCache } from "./offline";
import {
  listenForInstall,
  promptInstall,
  registerServiceWorker,
  shouldRegister,
  usePwa,
} from "./register";

const PUBLIC = join(__dirname, "..", "..", "public");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe("web app manifest", () => {
  it("has what browsers need to install Studio", () => {
    const m = STUDIO_MANIFEST;
    expect(m.name).toBe("OpenSpace Studio");
    expect(m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    // A 192 and a 512 icon, plus maskable versions (Android adaptive icons).
    const any = m.icons.filter((i) => i.purpose === "any");
    const maskable = m.icons.filter((i) => i.purpose === "maskable");
    expect(any.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(maskable.map((i) => i.sizes)).toContain("512x512");
  });

  it("points at real PNG files of the stated sizes", () => {
    for (const icon of STUDIO_MANIFEST.icons) {
      expect(icon.type).toBe("image/png");
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(join(PUBLIC, icon.src))).toEqual({ width: w, height: h });
    }
    expect(pngSize(join(PUBLIC, "icons/apple-touch-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("is plain JSON (what the build writes to manifest.webmanifest)", () => {
    expect(JSON.parse(JSON.stringify(STUDIO_MANIFEST))).toEqual(STUDIO_MANIFEST);
  });

  it("is linked from the page with matching theme colors", () => {
    const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain(`name="theme-color" content="${STUDIO_MANIFEST.theme_color}"`);
  });
});

describe("service worker registration", () => {
  it("never registers in tests or the dev server", () => {
    const nav = { serviceWorker: {} } as Navigator;
    expect(shouldRegister({ MODE: "test", DEV: false }, nav)).toBe(false);
    expect(shouldRegister({ MODE: "development", DEV: true }, nav)).toBe(false);
    expect(shouldRegister({ MODE: "production", DEV: false }, nav)).toBe(true);
    // Browsers without service workers (or insecure origins) skip it.
    expect(shouldRegister({ MODE: "production", DEV: false }, {} as Navigator)).toBe(false);
    // The default environment here is the test one.
    expect(registerServiceWorker()).toBe(false);
  });
});

describe("install prompt", () => {
  afterEach(() =>
    usePwa.setState({ installEvent: null, installed: false, needRefresh: false, update: null }),
  );

  it("keeps the browser's offer and shows it on request", async () => {
    const stop = listenForInstall(window);
    const prompt = vi.fn(async () => {});
    const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(usePwa.getState().installEvent).toBe(e);
    expect(await promptInstall()).toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(usePwa.getState()).toMatchObject({ installEvent: null, installed: true });
    stop();
  });

  it("forgets the offer once installed", () => {
    const stop = listenForInstall(window);
    usePwa.setState({ installEvent: new Event("x") as never });
    window.dispatchEvent(new Event("appinstalled"));
    expect(usePwa.getState()).toMatchObject({ installEvent: null, installed: true });
    stop();
  });
});

describe("opening offline", () => {
  const memory = (): KeyValue & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
  };
  const down = () => {
    throw new HubError(0, "network", "Can't reach OpenSpace.");
  };

  it("recognises network failures (not refusals)", () => {
    expect(isNetworkError(new HubError(0, "network", "x"))).toBe(true);
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new HubError(403, "forbidden", "x"))).toBe(false);
  });

  it("serves the last session, sites and templates from this device when the Hub is unreachable", async () => {
    const store = memory();
    const mock = createMockHub({
      user: { id: "u1", login: "sam", name: "Sam", avatarUrl: null },
      sites: "demo",
    });
    await mock.devLogin("Sam");
    let online = true;
    const hub: HubApi = Object.create(mock);
    for (const k of ["getSession", "listSites", "getSite", "listTemplates"] as const)
      (hub as unknown as Record<string, unknown>)[k] = (...args: unknown[]) =>
        online ? (mock[k] as (...a: unknown[]) => unknown)(...args) : down();
    const wrapped = withOfflineCache(hub, { store, now: () => 1000 });

    const session = await wrapped.getSession();
    const sites = await wrapped.listSites();
    const templates = await wrapped.listTemplates();
    expect(sites.length).toBeGreaterThan(0);
    expect(useOfflineState.getState().fromDevice).toBe(false);

    online = false;
    expect(await wrapped.getSession()).toEqual(session);
    expect(await wrapped.listSites()).toEqual(sites);
    expect(await wrapped.getSite(sites[0]?.id as string)).toEqual(sites[0]);
    expect(await wrapped.listTemplates()).toEqual(templates);
    expect(useOfflineState.getState()).toEqual({ fromDevice: true, savedAt: 1000 });
    // Everything else still goes to the Hub (and fails honestly).
    await expect(wrapped.getSite("st_unknown00")).rejects.toBeInstanceOf(HubError);

    online = true;
    await wrapped.listSites();
    expect(useOfflineState.getState().fromDevice).toBe(false);
  });

  it("passes refusals through instead of hiding them behind the saved copy", async () => {
    const store = memory();
    const mock = createMockHub({ user: null });
    const wrapped = withOfflineCache(mock, { store });
    // Signed out: the Hub refuses, nothing is invented.
    await expect(wrapped.listSites()).rejects.toMatchObject({ status: 401 });
  });
});
