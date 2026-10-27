/**
 * Hub-side screenshots for the remote MCP server (no local browser needed):
 *
 * - `browser`: Cloudflare Browser Rendering through the Worker's `BROWSER` binding and
 *   `@cloudflare/puppeteer`. One browser session is reused across captures (Workers Free allows
 *   one new browser every 20 s and 3 at once), every request the page makes is checked against
 *   the SSRF rules, lazy images are made eager, fonts are awaited, sticky headers are hidden for
 *   section shots, and the result is cut into JPEG tiles sized for a model (≤ 1568 px a side).
 * - `stub`: a placeholder PNG, selected in DEV_MODE (Global Constraint 8), so local runs and e2e
 *   exercise the whole flow without a Cloudflare account.
 *
 * Draft pages are reached through a short-lived, site-bound signed token on `/p/:siteId/…`
 * (`os_shot`), never with the person's own session.
 */
import { ToolError } from "@omniharmonic/openspace-mcp-tools";
import { zlibSync } from "fflate";
import type { HubBindings, HubConfig } from "../env";
import { base64url, bytesToBase64, timingSafeEqual } from "../lib/crypto";
import { isInternalHostname, isPrivateAddress } from "../mcp/ssrf";
import type { DnsResolver } from "./domains";
import type { RateLimitService, RateRule } from "./rate-limit";

export interface ShotTarget {
  url: string;
  /** Viewport width in CSS px. */
  width: number;
  fullPage: boolean;
  /** Capture only `[data-os-id="<sectionId>"]` (sticky elements outside it are hidden). */
  sectionId?: string;
}

export interface ShotImage {
  base64: string;
  mimeType: "image/jpeg" | "image/png";
  /** Pixel size of this image. */
  width: number;
  height: number;
}

export interface ShotResult {
  /** One image, or several tiles top to bottom for a tall page. */
  images: ShotImage[];
  /** Captured area in CSS px. */
  cssWidth: number;
  cssHeight: number;
  /** The page was taller than the capture limit. */
  truncated: boolean;
  /** A dev placeholder, not a real rendering. */
  placeholder?: boolean;
}

export interface BrowserBackend {
  readonly kind: "browser" | "stub";
  /** Capture each target in order (one browser for the whole call). */
  capture(targets: ShotTarget[]): Promise<ShotResult[]>;
}

// --- limits ---------------------------------------------------------------------------------------

/** Longest edge of an image handed to the model (larger ones are downscaled by the client anyway). */
export const MAX_IMAGE_EDGE = 1568;
/** Output width cap: desktop (1440 CSS px) is scaled to this. */
export const MAX_OUTPUT_WIDTH = 1280;
/** Tallest page area captured, in CSS px (beyond it the result says it was cut). */
export const MAX_CSS_HEIGHT = 9000;
/** Tiles per capture, and total JPEG bytes per capture. */
export const MAX_TILES = 6;
export const MAX_BYTES = 4 * 1024 * 1024;
const NAV_TIMEOUT_MS = 25_000;
const CAPTURE_TIMEOUT_MS = 55_000;

/** Captures per person and per site (each device counts). */
export const SHOT_USER_RATE: RateRule = { name: "shot-user", limit: 40, windowSec: 600 };
export const SHOT_USER_DAILY: RateRule = { name: "shot-user-day", limit: 400, windowSec: 86_400 };
export const SHOT_SITE_RATE: RateRule = { name: "shot-site", limit: 60, windowSec: 600 };

export async function chargeScreenshots(
  rateLimit: RateLimitService,
  opts: { userId: string; siteId?: string; count: number },
): Promise<void> {
  const rules: Array<[string, RateRule]> = [
    [`shot|u|${opts.userId}`, SHOT_USER_RATE],
    [`shot|ud|${opts.userId}`, SHOT_USER_DAILY],
  ];
  if (opts.siteId) rules.push([`shot|s|${opts.siteId}`, SHOT_SITE_RATE]);
  for (let i = 0; i < opts.count; i++)
    for (const [key, rule] of rules) {
      const r = await rateLimit.hit(key, rule);
      if (!r.ok)
        throw new ToolError(
          `That's a lot of screenshots in a short time. Wait about ${Math.ceil(r.retryAfter / 60)} minute(s), then continue (use render_page or design_check meanwhile).`,
          "rate_limited",
        );
    }
}

// --- signed draft access ------------------------------------------------------------------------

/** Lifetime of a draft screenshot token: long enough for one capture, useless after. */
export const SHOT_TOKEN_TTL_MS = 3 * 60 * 1000;

async function shotMac(key: string, siteId: string, exp: number): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    k,
    new TextEncoder().encode(`draft-screenshot|${siteId}|${exp}`),
  );
  return base64url(new Uint8Array(mac)).slice(0, 32);
}

/** `<exp>.<sig>`: lets the screenshot browser open one site's draft preview for a few minutes. */
export async function signShotToken(key: string, siteId: string, now: number): Promise<string> {
  const exp = now + SHOT_TOKEN_TTL_MS;
  return `${exp}.${await shotMac(key, siteId, exp)}`;
}

export async function verifyShotToken(
  key: string,
  siteId: string,
  token: string,
  now: number,
): Promise<boolean> {
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || exp < now || exp > now + SHOT_TOKEN_TTL_MS) return false;
  return timingSafeEqual(m[2] as string, await shotMac(key, siteId, exp));
}

// --- URL safety ---------------------------------------------------------------------------------

const ipv4Literal = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const ipv6Literal = (h: string) => h.includes(":");

/**
 * Synchronous check for every request the browser makes (documents, redirects, subresources):
 * http(s) on the default ports, no credentials, no private / loopback / metadata addresses or
 * internal names. `data:` and `blob:` stay inside the page and are allowed.
 */
export function browserMayLoad(raw: string, extraAllowedOrigins: readonly string[] = []): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol === "data:" || u.protocol === "blob:") return true;
  if (extraAllowedOrigins.includes(u.origin)) return true;
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (u.port && !((u.protocol === "https:" && u.port === "443") || u.port === "80")) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipv4Literal(host) || ipv6Literal(host)) return !isPrivateAddress(host);
  return !isInternalHostname(host);
}

/** Full check of an address an agent asked to capture: the rules above plus a DNS lookup. */
export async function checkCaptureUrl(
  raw: string,
  dns: DnsResolver | null,
  trustedOrigins: readonly string[] = [],
): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new ToolError(`"${raw}" is not a web address.`, "invalid_arguments");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new ToolError("Only http:// and https:// pages can be captured.", "invalid_arguments");
  // The Hub itself (its dev stand-in for live sites lives at /s/…).
  if (trustedOrigins.includes(u.origin) && !u.username && !u.password) return u;
  if (!browserMayLoad(u.toString()))
    throw new ToolError(
      "That address points into a private network (or uses an unusual port), so it can't be captured.",
      "blocked_address",
    );
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (dns && !ipv4Literal(host) && !ipv6Literal(host)) {
    let addrs: string[];
    try {
      addrs = [...(await dns.resolve(host, "A")), ...(await dns.resolve(host, "AAAA"))];
    } catch {
      throw new ToolError(`Couldn't look up ${host}. Check the address.`, "fetch_failed");
    }
    if (!addrs.length)
      throw new ToolError(`${host} doesn't exist (no address found).`, "fetch_failed");
    if (addrs.some(isPrivateAddress))
      throw new ToolError(
        "That address points into a private network, so it can't be captured.",
        "blocked_address",
      );
  }
  return u;
}

// --- selection ----------------------------------------------------------------------------------

/** The subset of the Browser Rendering binding used here. */
export interface BrowserBinding {
  fetch: typeof fetch;
}

/**
 * `SCREENSHOTS=off` turns screenshots off; DEV_MODE uses the placeholder; otherwise the `BROWSER`
 * binding when it is configured (none → the tools explain that screenshots are unavailable).
 */
export function selectBrowserBackend(env: HubBindings, config: HubConfig): BrowserBackend | null {
  const mode = String((env as { SCREENSHOTS?: string }).SCREENSHOTS ?? "").toLowerCase();
  if (mode === "off") return null;
  if (mode === "stub" || config.devMode) return stubBrowser();
  const binding = (env as { BROWSER?: BrowserBinding }).BROWSER;
  if (!binding) return null;
  return cloudflareBrowser(binding, { allowedOrigins: [new URL(config.hubUrl).origin] });
}

// --- dev placeholder ----------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A grey placeholder PNG with a darker "header" band (RGB, no dependencies beyond zlib). */
export function placeholderPng(width: number, height: number): Uint8Array {
  const row = width * 3 + 1;
  const raw = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    const shade = y < Math.max(8, Math.round(height * 0.08)) ? 0x9a : 0xdd;
    for (let x = 0; x < width; x++) raw.fill(shade, y * row + 1 + x * 3, y * row + 4 + x * 3);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function stubBrowser(): BrowserBackend {
  return {
    kind: "stub",
    async capture(targets) {
      return targets.map((t) => {
        const cssHeight = t.sectionId ? 600 : t.fullPage ? 2400 : 900;
        // Small on purpose: it stands in for the real image, it isn't one.
        const w = Math.max(1, Math.round(t.width / 4));
        const h = Math.max(1, Math.round(cssHeight / 4));
        return {
          images: [
            {
              base64: bytesToBase64(placeholderPng(w, h)),
              mimeType: "image/png",
              width: w,
              height: h,
            },
          ],
          cssWidth: t.width,
          cssHeight,
          truncated: false,
          placeholder: true,
        };
      });
    },
  };
}

// --- Cloudflare Browser Rendering ---------------------------------------------------------------

/**
 * Run in the page before a capture (a string, so the Hub needs no DOM types): lazy images become
 * eager (incl. Squarespace-style `data-src`), the page is scrolled through so observers fire,
 * images (≤ 6 s) and fonts are awaited, and for a section capture fixed / sticky elements outside
 * it are hidden (`visibility` keeps the layout).
 */
export function prepareScript(sectionId?: string): string {
  return `(async () => {
  for (const img of Array.from(document.images)) {
    img.loading = "eager"; img.decoding = "sync";
    const ds = img.getAttribute("data-src") || img.getAttribute("data-image");
    if (ds && (!img.getAttribute("src") || img.getAttribute("src").startsWith("data:"))) img.src = ds;
  }
  const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 60; y += step, i++) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
  const done = Promise.all(Array.from(document.images).map((img) => img.complete ? null :
    new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); })));
  await Promise.race([done, new Promise((r) => setTimeout(r, 6000))]);
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
  const id = ${JSON.stringify(sectionId ?? null)};
  if (id) {
    const target = document.querySelector('[data-os-id="' + CSS.escape(id) + '"]');
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (target && (el.contains(target) || target.contains(el))) continue;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") el.style.setProperty("visibility", "hidden", "important");
    }
  }
})()`;
}

/** Tile layout for a capture area: scale to ≤ MAX_OUTPUT_WIDTH, tiles ≤ MAX_IMAGE_EDGE tall. */
export function planTiles(
  cssWidth: number,
  cssHeight: number,
): { scale: number; tiles: Array<{ y: number; height: number }>; truncated: boolean } {
  const scale = Math.min(1, MAX_OUTPUT_WIDTH / cssWidth);
  const capped = Math.min(cssHeight, MAX_CSS_HEIGHT);
  const tileCss = Math.floor(MAX_IMAGE_EDGE / scale);
  const tiles: Array<{ y: number; height: number }> = [];
  for (let y = 0; y < capped && tiles.length < MAX_TILES; y += tileCss)
    tiles.push({ y, height: Math.min(tileCss, capped - y) });
  const covered = tiles.reduce((n, t) => n + t.height, 0);
  return { scale, tiles, truncated: covered < cssHeight };
}

// biome-ignore lint/suspicious/noExplicitAny: puppeteer's Page/Browser types are not needed here
type Any = any;

export interface CloudflareBrowserOptions {
  /** Origins always allowed (the Hub itself, for draft previews). */
  allowedOrigins?: string[];
  /** Load puppeteer (tests inject a fake). */
  loadPuppeteer?: () => Promise<Any>;
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ToolError(message, "timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const toBytes = (b: Any): Uint8Array =>
  b instanceof Uint8Array ? b : new Uint8Array(b as ArrayBuffer);

export function cloudflareBrowser(
  binding: BrowserBinding,
  options: CloudflareBrowserOptions = {},
): BrowserBackend {
  const load =
    options.loadPuppeteer ??
    (async () => (await import("@cloudflare/puppeteer")).default as unknown as Any);
  const allowed = options.allowedOrigins ?? [];

  /** Reuse an idle session (no one connected) before launching a new browser. */
  async function acquire(puppeteer: Any): Promise<Any> {
    try {
      const sessions: Array<{ sessionId: string; connectionId?: string }> =
        await puppeteer.sessions(binding);
      for (const s of sessions)
        if (!s.connectionId)
          try {
            return await puppeteer.connect(binding, s.sessionId);
          } catch {
            // taken by someone else in the meantime; try the next
          }
    } catch {
      // listing failed: just launch
    }
    try {
      return await puppeteer.launch(binding, { keep_alive: 120_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ToolError(
        /429|limit|too many/i.test(msg)
          ? "The screenshot browser is busy (plan limit reached). Wait a minute and try again, or use render_page."
          : "Couldn't start the screenshot browser. Try again in a minute, or use render_page.",
        "unavailable",
      );
    }
  }

  async function captureOne(browser: Any, t: ShotTarget): Promise<ShotResult> {
    const page = await browser.newPage();
    try {
      await page.setViewport({
        width: t.width,
        height: t.width < 500 ? 844 : 900,
        deviceScaleFactor: 1,
      });
      await page.setRequestInterception(true);
      page.on("request", (req: Any) => {
        if (req.isInterceptResolutionHandled?.()) return;
        if (browserMayLoad(req.url(), allowed)) void req.continue();
        else void req.abort("blockedbyclient");
      });
      try {
        await page.goto(t.url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
      } catch (e) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        throw new ToolError(`Couldn't open ${t.url}: ${msg}`, "fetch_failed");
      }
      await page.waitForNetworkIdle?.({ idleTime: 500, timeout: 5000 }).catch(() => undefined);
      await page.evaluate(prepareScript(t.sectionId)).catch(() => undefined);

      let area: { x: number; y: number; width: number; height: number };
      if (t.sectionId) {
        const el = await page.$(`[data-os-id="${t.sectionId.replace(/[^A-Za-z0-9_-]/g, "")}"]`);
        const box = el ? await el.boundingBox() : null;
        if (!box) throw new ToolError(`Section ${t.sectionId} isn't on that page.`, "not_found");
        const scrollY: number = await page.evaluate("window.scrollY");
        area = { x: 0, y: box.y + scrollY, width: t.width, height: Math.max(1, box.height) };
      } else {
        const full: number = t.fullPage
          ? await page.evaluate(
              "Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)",
            )
          : (page.viewport()?.height ?? 900);
        area = { x: 0, y: 0, width: t.width, height: Math.max(1, Math.ceil(full)) };
      }
      const plan = planTiles(area.width, area.height);
      const images: ShotImage[] = [];
      let bytes = 0;
      let truncated = plan.truncated;
      for (const tile of plan.tiles) {
        const buf = toBytes(
          await page.screenshot({
            type: "jpeg",
            quality: 72,
            captureBeyondViewport: true,
            clip: {
              x: area.x,
              y: area.y + tile.y,
              width: area.width,
              height: tile.height,
              scale: plan.scale,
            },
          }),
        );
        if (bytes + buf.length > MAX_BYTES && images.length) {
          truncated = true;
          break;
        }
        bytes += buf.length;
        images.push({
          base64: bytesToBase64(buf),
          mimeType: "image/jpeg",
          width: Math.round(area.width * plan.scale),
          height: Math.round(tile.height * plan.scale),
        });
      }
      return { images, cssWidth: area.width, cssHeight: area.height, truncated };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  return {
    kind: "browser",
    async capture(targets) {
      const puppeteer = await load();
      const browser = await acquire(puppeteer);
      try {
        return await withTimeout(
          (async () => {
            const out: ShotResult[] = [];
            for (const t of targets) out.push(await captureOne(browser, t));
            return out;
          })(),
          CAPTURE_TIMEOUT_MS,
          "The page took too long to capture. Try a single device or a section.",
        );
      } finally {
        // Keep the browser alive for the next capture (keep_alive); just let go of it.
        await Promise.resolve(browser.disconnect?.()).catch(() => undefined);
      }
    },
  };
}
