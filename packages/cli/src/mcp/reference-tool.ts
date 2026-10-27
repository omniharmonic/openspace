/**
 * `screenshot_url`: a screenshot of any public web page — the original site being migrated —
 * at the same widths as `screenshot`, so Claude can put the old and new pages side by side.
 * Local stdio server only (it needs a browser). Lazy-loaded images are scrolled into view first.
 */
import { defineTool, ToolError, type ToolOutput } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";

// biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
type Browser = any;
type Chromium = { launch(o?: object): Promise<Browser> };

const WIDTHS = { desktop: 1440, tablet: 834, mobile: 390 } as const;
type Device = keyof typeof WIDTHS;

export interface UrlScreenshotter {
  capture(
    url: string,
    width: number,
    fullPage: boolean,
  ): Promise<{ base64: string; width: number; height: number }>;
  close(): Promise<void>;
}

export function createUrlScreenshotter(chromium: Chromium): UrlScreenshotter {
  let browser: Promise<Browser> | undefined;
  const launch = async (): Promise<Browser> => {
    try {
      return await chromium.launch({ headless: true });
    } catch {
      return chromium.launch({ headless: true, channel: "chrome" });
    }
  };
  return {
    async capture(url, width, fullPage) {
      browser ??= launch();
      const b = await browser;
      const page = await b.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      try {
        await page.goto(url, { waitUntil: "load", timeout: 45_000 });
        // Scroll through the page so lazy-loaded images (Squarespace's data-src) load.
        await page
          .evaluate(`(async () => {
            for (let y = 0, i = 0; y < document.body.scrollHeight && i < 60; y += 700, i++) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 120));
            }
            window.scrollTo(0, 0);
          })()`)
          .catch(() => undefined);
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        await page.evaluate("document.fonts && document.fonts.ready").catch(() => undefined);
        const png: Buffer = await page.screenshot({ type: "png", fullPage });
        return {
          base64: png.toString("base64"),
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    async close() {
      const b = await browser?.catch(() => undefined);
      browser = undefined;
      await b?.close().catch(() => undefined);
    },
  };
}

export function screenshotUrlTool(shooter: UrlScreenshotter | undefined, why?: string) {
  return defineTool({
    name: "screenshot_url",
    title: "Screenshot a web page",
    description:
      'PNG screenshot of a public web page — typically the original site being migrated (e.g. the Squarespace page) — at desktop (1440), tablet (834) or mobile (390) width, or "all". Compare it with `screenshot` of the OpenSpace page to reach visual parity. Read-only; local server only.',
    input: z.object({
      url: z.string().describe("An http(s) address, e.g. https://www.example.com/about"),
      device: z
        .enum(["desktop", "tablet", "mobile", "all"])
        .optional()
        .describe('Default "desktop".'),
      fullPage: z.boolean().optional().describe("Capture the whole page height (default true)."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(_ctx, input): Promise<ToolOutput> {
      let u: URL;
      try {
        u = new URL(input.url);
      } catch {
        throw new ToolError(`"${input.url}" is not a web address.`, "invalid_arguments");
      }
      if (u.protocol !== "https:" && u.protocol !== "http:")
        throw new ToolError("Only http(s) pages can be captured.", "invalid_arguments");
      if (!shooter)
        throw new ToolError(
          `Screenshots aren't available here${why ? ` (${why})` : ""}.`,
          "unsupported",
          [],
          "Install Playwright next to the CLI (npm i -D playwright && npx playwright install chromium) and restart the MCP server.",
        );
      const devices: Device[] =
        input.device === "all" ? ["desktop", "tablet", "mobile"] : [input.device ?? "desktop"];
      const images: NonNullable<ToolOutput["images"]> = [];
      const shots: { device: Device; width: number; height: number }[] = [];
      for (const device of devices) {
        const shot = await shooter
          .capture(u.toString(), WIDTHS[device], input.fullPage ?? true)
          .catch((e: Error) => {
            throw new ToolError(
              `Couldn't capture ${u}: ${e.message.split("\n")[0]}`,
              "fetch_failed",
            );
          });
        images.push({
          base64: shot.base64,
          mimeType: "image/png",
          caption: `${device} ${shot.width}px`,
        });
        shots.push({ device, width: shot.width, height: shot.height });
      }
      return {
        text: `Screenshot${shots.length > 1 ? "s" : ""} of ${u}: ${shots.map((s) => `${s.device} ${s.width}×${s.height}`).join(", ")}.`,
        data: { url: u.toString(), shots },
        images,
      };
    },
  });
}
