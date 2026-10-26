/**
 * Astro side of the image pass (arch §4.3): `getImage()` for AVIF + WebP + fallback at the
 * width ladder. Imports `astro:assets` and the integration's media glob, so only Astro routes
 * use it. Results are cached per build.
 */
/// <reference path="../virtual.d.ts" />

import { getImage } from "astro:assets";
import { mediaImports } from "virtual:openspace/media";
import { doc } from "virtual:openspace/site";
import type { ImageMap, ResolvedImage } from "@openspace/renderer";
import {
  fallbackFormat,
  fallbackWidth,
  imageWidths,
  localImageSrcs,
  resolvedImage,
} from "./images";

interface ImageMeta {
  src: string;
  width: number;
  height: number;
  format: string;
}

const cache = new Map<string, Promise<ResolvedImage | undefined>>();

async function resolveOne(src: string): Promise<ResolvedImage | undefined> {
  const load = mediaImports[`/${src}`];
  if (!load) return undefined;
  const meta = (await load()) as ImageMeta;
  if (meta.format === "svg") return undefined;
  const widths = imageWidths(meta.width);
  const transform = async (format: "avif" | "webp" | "jpg" | "png") => {
    const r = await getImage({ src: meta, width: fallbackWidth(meta.width), widths, format });
    return { src: r.src, srcset: r.srcSet.attribute };
  };
  const [avif, webp, fallback] = await Promise.all([
    transform("avif"),
    transform("webp"),
    transform(fallbackFormat(meta.format)),
  ]);
  return resolvedImage(meta, { avif, webp, fallback }, doc.media[src]?.placeholder);
}

/** Resolve local media images (cached). Unknown/remote/SVG sources are skipped. */
export async function resolveImages(srcs: Iterable<string>): Promise<ImageMap> {
  const map: Record<string, ResolvedImage> = {};
  await Promise.all(
    localImageSrcs(srcs).map(async (src) => {
      let pending = cache.get(src);
      if (!pending) {
        pending = resolveOne(src);
        cache.set(src, pending);
      }
      const resolved = await pending;
      if (resolved) map[src] = resolved;
    }),
  );
  return map;
}

/** Every image in `media/` (the Worker's image manifest for gated pages). */
export function allMediaImages(): string[] {
  return Object.keys(mediaImports).map((k) => k.replace(/^\//, ""));
}
