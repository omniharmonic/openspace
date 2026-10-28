/**
 * Screenshots through Playwright when it is installed (an optional dependency): the page is
 * loaded from the local preview server so media and fonts resolve, and a section capture is an
 * element screenshot of `[data-os-id="sec_…"]` in the real page.
 */
import {
  PHONE_HEIGHT,
  PHONE_PREPARE_SCRIPT,
  PHONE_PROBE_SCRIPT,
  type PhoneProbeResult,
} from "@omniharmonic/openspace-lint";
import type { Screenshot, ScreenshotRequest } from "@omniharmonic/openspace-mcp-tools";

// biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
type Browser = any;

export interface Screenshotter {
  capture(url: string, req: ScreenshotRequest): Promise<Screenshot>;
  /** Lay the page out as a phone (touch, mobile viewport) and run the Phone check's probe. */
  measure(url: string, width: number): Promise<PhoneProbeResult>;
  close(): Promise<void>;
}

type Importer = (spec: string) => Promise<unknown>;
const defaultImporter: Importer = (spec) => import(/* @vite-ignore */ spec);

/** Load Playwright's chromium, or explain why not. */
export async function loadPlaywright(
  importer: Importer = defaultImporter,
): Promise<{ chromium: { launch(o?: object): Promise<Browser> } } | { error: string }> {
  for (const spec of ["playwright", "playwright-core"]) {
    try {
      const mod = (await importer(spec)) as {
        chromium?: unknown;
        default?: { chromium?: unknown };
      };
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return { chromium: chromium as { launch(o?: object): Promise<Browser> } };
    } catch {
      // try the next one
    }
  }
  return {
    error:
      "Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium` in the site folder and restart `openspace mcp`.",
  };
}

/**
 * Run in the page before a capture (a string, so the CLI needs no DOM types):
 * - lazy images: switch them to eager, scroll through the page so observers fire, then wait
 *   (up to 5 s) for every image to finish, so full-page phone shots aren't grey boxes;
 * - a section capture: hide fixed and sticky elements outside that section (the sticky header,
 *   an announcement bar) so they don't cover its top. `visibility` keeps the layout unchanged.
 */
export function prepareScript(sectionId?: string): string {
  return `(async () => {
  const imgs = Array.from(document.images);
  for (const img of imgs) { img.loading = "eager"; img.decoding = "sync"; }
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 30));
  }
  window.scrollTo(0, 0);
  const done = Promise.all(Array.from(document.images).map((img) => img.complete ? null :
    new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); })));
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  const id = ${JSON.stringify(sectionId ?? null)};
  if (id) {
    const target = document.querySelector('[data-os-id="' + id + '"]');
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (target && (el.contains(target) || target.contains(el))) continue;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") el.style.setProperty("visibility", "hidden", "important");
    }
  }
})()`;
}

export function createScreenshotter(chromium: {
  launch(o?: object): Promise<Browser>;
}): Screenshotter {
  let browser: Promise<Browser> | undefined;
  const launch = async (): Promise<Browser> => {
    try {
      return await chromium.launch({ headless: true });
    } catch (first) {
      // Fall back to an installed Google Chrome when Playwright's own browser isn't downloaded.
      try {
        return await chromium.launch({ headless: true, channel: "chrome" });
      } catch {
        throw new Error(
          `Couldn't start a browser for screenshots (${(first as Error).message.split("\n")[0]}). Run \`npx playwright install chromium\`.`,
        );
      }
    }
  };
  return {
    async capture(url, req) {
      browser ??= launch();
      let b: Browser;
      try {
        b = await browser;
      } catch (e) {
        browser = undefined;
        throw e;
      }
      const page = await b.newPage({
        viewport: { width: req.width, height: 900 },
        deviceScaleFactor: 1,
      });
      try {
        await page.goto(url, { waitUntil: "load", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
        await page.evaluate("document.fonts && document.fonts.ready").catch(() => undefined);
        await page.evaluate(prepareScript(req.sectionId)).catch(() => undefined);
        let png: Buffer;
        if (req.sectionId) {
          png = await page
            .locator(`[data-os-id="${req.sectionId}"]`)
            .first()
            .screenshot({ type: "png" });
        } else png = await page.screenshot({ type: "png", fullPage: req.fullPage });
        const height = png.readUInt32BE(20);
        return {
          base64: png.toString("base64"),
          mimeType: "image/png",
          width: png.readUInt32BE(16),
          height,
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    async measure(url, width) {
      browser ??= launch();
      let b: Browser;
      try {
        b = await browser;
      } catch (e) {
        browser = undefined;
        throw e;
      }
      const context = await b.newContext({
        viewport: { width, height: PHONE_HEIGHT },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "load", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
        await page.evaluate(PHONE_PREPARE_SCRIPT).catch(() => undefined);
        return (await page.evaluate(PHONE_PROBE_SCRIPT)) as PhoneProbeResult;
      } finally {
        await context.close().catch(() => undefined);
      }
    },
    async close() {
      if (!browser) return;
      const b = await browser.catch(() => undefined);
      browser = undefined;
      await b?.close().catch(() => undefined);
    },
  };
}
