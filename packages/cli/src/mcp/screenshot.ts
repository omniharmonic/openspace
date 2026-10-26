/**
 * Screenshots through Playwright when it is installed (an optional dependency): the page is
 * loaded from the local preview server so media and fonts resolve, and a section capture is an
 * element screenshot of `[data-os-id="sec_…"]` in the real page.
 */
import type { Screenshot, ScreenshotRequest } from "@openspace/mcp-tools";

// biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
type Browser = any;

export interface Screenshotter {
  capture(url: string, req: ScreenshotRequest): Promise<Screenshot>;
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
    async close() {
      if (!browser) return;
      const b = await browser.catch(() => undefined);
      browser = undefined;
      await b?.close().catch(() => undefined);
    },
  };
}
