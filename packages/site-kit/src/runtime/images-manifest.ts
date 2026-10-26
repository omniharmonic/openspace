/**
 * `/_os/images.json` (Cloudflare target): the resolved image map for every file in `media/`,
 * prerendered at build time. The Worker passes it to the renderer for gated pages, whose
 * content isn't known at build time, so their local images get the same AVIF/WebP/fallback
 * sources and dimensions as static pages.
 */
import { allMediaImages, resolveImages } from "./astro-images";

export const prerender = true;

export async function GET(): Promise<Response> {
  const map = await resolveImages(allMediaImages());
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  return new Response(`${JSON.stringify(sorted)}\n`, {
    headers: { "content-type": "application/json" },
  });
}
