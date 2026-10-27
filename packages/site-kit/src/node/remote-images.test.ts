import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import {
  jpegSize,
  looksLikeImage,
  remoteImages,
  remoteWidths,
  selfHostRemoteImages,
} from "./remote-images";

/** A minimal JPEG header with an SOF0 marker for 800×600. */
const jpeg = () =>
  new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0, 0, 0, 0, 0, 0,
  ]);

/** The start of an AVIF file: an `ftyp` box with the `avif` brand. */
const avif = () =>
  new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0]);

const PHOTO = "https://images.unsplash.com/photo-1?w=960&q=80";
const doc = {
  site: { logo: null },
  pages: {
    pg_a: {
      sections: [
        { blocks: [{ fields: { image: { src: PHOTO, alt: "Pier", width: 960, height: 640 } } }] },
        { blocks: [{ fields: { image: { src: "media/own.jpg", alt: "" } } }] },
      ],
    },
  },
  collections: {},
} as unknown as SiteDocument;

describe("self-hosted demo photos", () => {
  it("finds remote CDN photos with their content dimensions", () => {
    expect([...remoteImages(doc)]).toEqual([[PHOTO, { width: 960, height: 640 }]]);
    expect(jpegSize(jpeg())).toEqual({ width: 800, height: 600 });
  });

  it("downloads AVIF and JPEG per width once and maps them under _os/img", async () => {
    const urls: string[] = [];
    const fakeFetch = (async (url: string) => {
      urls.push(url);
      return new Response(url.includes("fm=jpg") ? jpeg() : avif(), {
        headers: { "content-type": url.includes("fm=jpg") ? "image/jpeg" : "image/avif" },
      });
    }) as unknown as typeof fetch;
    const cacheDir = await mkdtemp(join(tmpdir(), "os-remote-"));
    const plan = await selfHostRemoteImages(doc, { cacheDir, basePath: "/site", fetch: fakeFetch });
    const hit = plan.map[PHOTO];
    expect(hit?.width).toBe(960);
    expect(hit?.sources?.[0]?.type).toBe("image/avif");
    expect(hit?.sources?.[0]?.srcset).toMatch(
      /^\/site\/_os\/img\/[0-9a-f]{12}-480-q50\.avif 480w, /,
    );
    // AVIF at its own quality (the content's q=80 is a JPEG quality).
    expect(urls.filter((u) => u.includes("fm=avif")).every((u) => u.includes("q=50"))).toBe(true);
    expect(urls.filter((u) => u.includes("fm=jpg")).every((u) => u.includes("q=80"))).toBe(true);
    expect(hit?.srcset).toMatch(/-960\.jpg 960w$/);
    // 480, 640, 768, 960 × AVIF + JPEG; nothing for the site's own media.
    expect(urls).toHaveLength(8);
    expect(urls.every((u) => u.startsWith("https://images.unsplash.com/photo-1?"))).toBe(true);
    expect(plan.files).toHaveLength(8);
  });

  it("keeps a photo remote when a download fails", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "os-remote-"));
    const plan = await selfHostRemoteImages(doc, {
      cacheDir,
      basePath: "",
      fetch: (async () => new Response("no", { status: 503 })) as unknown as typeof fetch,
    });
    expect(plan.map).toEqual({});
    expect(plan.files).toEqual([]);
  });

  it("never caches or publishes a non-image (an HTML error page with status 200)", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "os-remote-"));
    const html = (async () =>
      new Response("<html>rate limited</html>", {
        headers: { "content-type": "image/jpeg" },
      })) as unknown as typeof fetch;
    const plan = await selfHostRemoteImages(doc, { cacheDir, basePath: "/x", fetch: html });
    expect(plan.map).toEqual({});
    expect(looksLikeImage(avif(), "a.avif")).toBe(true);
    expect(looksLikeImage(jpeg(), "a.jpg")).toBe(true);
    expect(looksLikeImage(new TextEncoder().encode("<html>"), "a.jpg")).toBe(false);
  });

  it("self-hosts small portraits and avatars and every image field, at 1x and 2x", async () => {
    const PORTRAIT = "https://images.unsplash.com/photo-2?w=320&q=80";
    const AVATAR = "https://images.unsplash.com/photo-3?w=96&q=80";
    const OG = "https://images.unsplash.com/photo-4?w=1200";
    const people = {
      site: { logo: null, seo: { image: OG } },
      pages: {
        pg_a: {
          sections: [
            {
              blocks: [
                {
                  fields: {
                    members: [
                      {
                        name: "Ingrid",
                        photo: { src: PORTRAIT, alt: "", width: 320, height: 479 },
                      },
                    ],
                    quotes: [{ avatar: AVATAR, credit: { href: "https://unsplash.com/@x" } }],
                  },
                },
              ],
            },
          ],
        },
      },
      collections: {},
    } as unknown as SiteDocument;
    expect([...remoteImages(people).keys()].sort()).toEqual([AVATAR, OG, PORTRAIT].sort());
    expect(remoteWidths(320)).toEqual([320, 640]);
    expect(remoteWidths(96)).toEqual([96, 192]);
    expect(remoteWidths(1080)).toEqual([480, 640, 768, 960, 1080]);
    const fakeFetch = (async (url: string) =>
      new Response(url.includes("fm=jpg") ? jpeg() : avif(), {
        headers: { "content-type": url.includes("fm=jpg") ? "image/jpeg" : "image/avif" },
      })) as unknown as typeof fetch;
    const cacheDir = await mkdtemp(join(tmpdir(), "os-remote-"));
    const plan = await selfHostRemoteImages(people, { cacheDir, basePath: "/r", fetch: fakeFetch });
    expect(plan.map[PORTRAIT]?.srcset).toMatch(
      /-320\.jpg 320w, \/r\/_os\/img\/[0-9a-f]{12}-640\.jpg 640w$/,
    );
    expect(plan.map[PORTRAIT]?.sources?.[0]?.srcset).toMatch(/-640-q50\.avif 640w$/);
    expect(plan.map[PORTRAIT]?.width).toBe(320);
    expect(plan.map[AVATAR]?.src).toMatch(/^\/r\/_os\/img\/[0-9a-f]{12}-192\.jpg$/);
    expect(plan.map[OG]?.src).toMatch(/-1080\.jpg$/);
  });
});
