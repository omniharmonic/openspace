/**
 * Remote MCP screenshots (Cloudflare Browser Rendering, or the dev placeholder):
 *
 * - `screenshot` (shared tool): the draft through `/p/:siteId/…?os_shot=<signed token>`.
 * - `screenshot_url` (Hub tool): any public web page — the original Squarespace / GitHub Pages
 *   site being migrated — or, given only `site` (+ `page`), the site's live published page.
 *
 * Every capture is charged to per-person and per-site limits; addresses are SSRF-checked before
 * the browser opens them and again for every request the page makes.
 */
import {
  defineTool,
  pagePathOf,
  resolvePage,
  type Screenshot,
  type ScreenshotRequest,
  ToolError,
  type ToolOutput,
} from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { requireHmacKey } from "../public-env";
import type { Services } from "../services";
import {
  type BrowserBackend,
  chargeScreenshots,
  checkCaptureUrl,
  type ShotResult,
  signShotToken,
} from "../services/screenshots";
import type { GrantSite } from "./db";
import type { ScreenshotProvider } from "./store";

const WIDTHS = { desktop: 1440, tablet: 834, mobile: 390 } as const;
type Device = keyof typeof WIDTHS;

function noteOf(r: ShotResult): string | undefined {
  const notes: string[] = [];
  if (r.placeholder)
    notes.push(
      "This is a grey placeholder from the development Hub (no real browser here); use render_page to inspect the page.",
    );
  if (r.images.length > 1) notes.push(`Tall page: ${r.images.length} images, top to bottom.`);
  if (r.truncated)
    notes.push(
      `The page is ${Math.round(r.cssHeight)}px tall; only the top part was captured. Use section screenshots for the rest.`,
    );
  return notes.length ? notes.join(" ") : undefined;
}

export function toScreenshot(r: ShotResult): Screenshot {
  const [first, ...rest] = r.images;
  if (!first) throw new ToolError("The capture came back empty. Try again.", "capture_failed");
  return {
    base64: first.base64,
    mimeType: first.mimeType,
    width: r.cssWidth,
    height: Math.round(r.cssHeight),
    ...(rest.length ? { more: rest.map((i) => ({ base64: i.base64, mimeType: i.mimeType })) } : {}),
    ...(noteOf(r) ? { note: noteOf(r) } : {}),
  };
}

/** Draft screenshots for `HubSiteStore`: a signed, short-lived preview link per capture. */
export function draftScreenshots(
  backend: BrowserBackend,
  services: Services,
  userId: string,
): ScreenshotProvider {
  return {
    async capture(siteId: string, pagePath: string, req: ScreenshotRequest) {
      await chargeScreenshots(services.pub.rateLimit, { userId, siteId, count: 1 });
      const token = await signShotToken(
        requireHmacKey(services.pub.config),
        siteId,
        services.now(),
      );
      const path = `/${pagePath.replace(/^\/+/, "")}`;
      const url = `${services.config.hubUrl}/p/${siteId}${path}?os_shot=${encodeURIComponent(token)}`;
      const [r] = await backend.capture([
        { url, width: req.width, fullPage: req.fullPage, sectionId: req.sectionId },
      ]);
      if (!r) throw new ToolError("The capture came back empty. Try again.", "capture_failed");
      return toScreenshot(r);
    },
  };
}

/** `screenshot_url`: a public page (the site being migrated), or this site's live page. */
export function screenshotUrlTool(
  backend: BrowserBackend | null,
  services: Services,
  sites: GrantSite[],
  userId: string,
) {
  return defineTool({
    name: "screenshot_url",
    title: "Screenshot a web page",
    description:
      'Screenshot of a public web page at desktop (1440), tablet (834) or mobile (390) width, or "all". Use it on the original site you are migrating (e.g. the Squarespace or GitHub Pages page) and compare with `screenshot` of the OpenSpace draft to reach visual parity. Without url, pass site (and page) to capture the site\'s live, published page. Tall pages come back as several images, top to bottom. Read-only.',
    input: z.object({
      url: z.string().optional().describe("An http(s) address, e.g. https://www.example.com/about"),
      site: z
        .string()
        .optional()
        .describe("Site id (st_…): capture its live published page instead of a url."),
      page: z.string().optional().describe("With site: page id, slug or title (default home)."),
      device: z
        .enum(["desktop", "tablet", "mobile", "all"])
        .optional()
        .describe('Default "desktop".'),
      fullPage: z.boolean().optional().describe("Capture the whole page height (default true)."),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(ctx, input): Promise<ToolOutput> {
      let raw = input.url;
      let siteId: string | undefined;
      if (!raw) {
        if (!input.site && sites.length !== 1)
          throw new ToolError(
            "Give a url, or a site to capture its live page.",
            "invalid_arguments",
          );
        siteId = await ctx.siteId(input.site);
        const live = sites.find((s) => s.id === siteId)?.url;
        if (!live)
          throw new ToolError(
            "This site isn't published yet, so there's no live page. Use screenshot for the draft.",
            "not_ready",
          );
        let path = "/";
        if (input.page) {
          const doc = await ctx.doc(siteId);
          const { page } = resolvePage(doc, input.page);
          if (page) path = pagePathOf(page);
        }
        raw = `${live.replace(/\/+$/, "")}${path}`;
      }
      const u = await checkCaptureUrl(raw, services.pub.dns, [
        new URL(services.config.hubUrl).origin,
      ]);
      if (!backend)
        throw new ToolError(
          "Screenshots aren't available on this Hub yet (the operator hasn't enabled Browser Rendering).",
          "unsupported",
          [],
          "Describe what you need from the page instead, or ask the owner to share a screenshot.",
        );
      const devices: Device[] =
        input.device === "all" ? ["desktop", "tablet", "mobile"] : [input.device ?? "desktop"];
      await chargeScreenshots(services.pub.rateLimit, {
        userId,
        ...(siteId ? { siteId } : {}),
        count: devices.length,
      });
      const results = await backend.capture(
        devices.map((d) => ({
          url: u.toString(),
          width: WIDTHS[d],
          fullPage: input.fullPage ?? true,
        })),
      );
      const images: NonNullable<ToolOutput["images"]> = [];
      const shots: Array<{ device: Device; width: number; height: number; images: number }> = [];
      const notes: string[] = [];
      results.forEach((r, i) => {
        const device = devices[i] as Device;
        for (const [j, img] of r.images.entries())
          images.push({
            base64: img.base64,
            mimeType: img.mimeType,
            caption: `${device} ${r.cssWidth}px${r.images.length > 1 ? ` (part ${j + 1})` : ""}`,
          });
        shots.push({
          device,
          width: r.cssWidth,
          height: Math.round(r.cssHeight),
          images: r.images.length,
        });
        const note = noteOf(r);
        if (note) notes.push(`${device}: ${note}`);
      });
      return {
        text: `Screenshot${shots.length > 1 ? "s" : ""} of ${u}: ${shots.map((s) => `${s.device} ${s.width}×${s.height}`).join(", ")}.${notes.length ? `\n${notes.join("\n")}` : ""}`,
        data: { url: u.toString(), shots },
        images,
      };
    },
  });
}
