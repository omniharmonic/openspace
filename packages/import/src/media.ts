/**
 * Downloads images and files into `media/` through the same pipeline as uploads (format sniffing,
 * metadata stripped, ≤2400px long edge, `media/YYYY/MM/name-id.ext` paths, `MediaMeta` with
 * size and alt text). The highest-quality rendition is asked for first: Squarespace CDN images
 * as uploaded (`?format=original`, then the largest web sizes), the original upload elsewhere
 * (see `html/image.ts`); the site-kit pipeline makes the responsive AVIF/WebP/JPEG sizes from it
 * at publish. SVG logos and marks stay SVG (through the same strict re-serializer as uploads);
 * identical files reached by different addresses are stored once.
 */
import { createHash } from "node:crypto";
import {
  type ImageResizer,
  MAX_IMAGE_EDGE,
  prepareImage,
  sanitizeSvg,
  svgSize,
} from "@omniharmonic/openspace-mcp-tools";
import { type ImageValue, type MediaMeta, newId } from "@omniharmonic/openspace-schema";
import type { SqImage, SqNotice } from "./types";

const SQS_CDN = /(?:^|\.)squarespace-cdn\.com$|(?:^|\.)squarespace\.com$/;
const FILE_MAX = 25 * 1024 * 1024;

const FILE_TYPES: Record<string, { mime: string; kind: MediaMeta["kind"] }> = {
  pdf: { mime: "application/pdf", kind: "file" },
  doc: { mime: "application/msword", kind: "file" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "file",
  },
  xls: { mime: "application/vnd.ms-excel", kind: "file" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "file" },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "file" },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "file",
  },
  zip: { mime: "application/zip", kind: "file" },
  txt: { mime: "text/plain", kind: "file" },
  csv: { mime: "text/csv", kind: "file" },
  epub: { mime: "application/epub+zip", kind: "file" },
  mp3: { mime: "audio/mpeg", kind: "audio" },
  m4a: { mime: "audio/mp4", kind: "audio" },
  wav: { mime: "audio/wav", kind: "audio" },
  ogg: { mime: "audio/ogg", kind: "audio" },
  mp4: { mime: "video/mp4", kind: "video" },
  webm: { mime: "video/webm", kind: "video" },
};

export interface MediaImporterOptions {
  fetch: typeof fetch;
  resize?: ImageResizer;
  now?: Date;
  /** Skip downloads (dry runs and tests that only look at structure). */
  offline?: boolean;
  /** Where the media came from, for its credit line ("Squarespace", "WordPress"). */
  source?: string;
  /**
   * Turn an SVG (icons, marks) into a PNG; without it SVGs are reported, not imported. An image
   * address ending in `#color=RRGGBB` paints `currentColor` in that color first (line icons drawn
   * in the text color of their section).
   */
  rasterizeSvg?: (svg: Uint8Array, opts?: { icon?: boolean }) => Promise<Uint8Array>;
}

export class MediaImporter {
  /** Repo path → bytes to write. */
  readonly files = new Map<string, Uint8Array>();
  /** Repo path → metadata for `content/media.json`. */
  readonly media: Record<string, MediaMeta> = {};
  readonly notices: SqNotice[] = [];
  private readonly images = new Map<string, Promise<ImageValue | undefined>>();
  private readonly docs = new Map<string, Promise<string | undefined>>();
  /** Downloaded file URL → repo path (for synchronous link rewriting). */
  readonly fileLinks = new Map<string, string>();
  private readonly now: Date;

  private readonly fetchImage: typeof fetch;

  constructor(private readonly opts: MediaImporterOptions) {
    this.now = opts.now ?? new Date();
    const raster = opts.rasterizeSvg;
    this.fetchImage = raster
      ? ((async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input instanceof Request ? input.url : input);
          const res = await opts.fetch(input, init);
          const type = res.headers.get("content-type") ?? "";
          if (!res.ok || !(/svg/i.test(type) || /\.svg(?:[?#]|$)/i.test(url))) return res;
          let svg = await res.text();
          const color = /#color=([0-9a-f]{6})\b/i.exec(url)?.[1];
          if (color) svg = svg.replace(/currentColor/g, `#${color}`);
          const png = await raster(new TextEncoder().encode(svg), {
            icon: /#(?:.*&)?icon\b/.test(url),
          });
          return new Response(png as unknown as BodyInit, {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }) as typeof fetch)
      : opts.fetch;
  }

  get count(): number {
    return this.files.size;
  }

  /** Download an image once (cached by URL) and return the value to store in content. */
  image(img: SqImage, where = "media"): Promise<ImageValue | undefined> {
    const key = img.url;
    let p = this.images.get(key);
    if (!p) {
      p = this.download(img, where);
      this.images.set(key, p);
    }
    return p.then((v) => (v ? { ...v, alt: (img.alt || v.alt || "").slice(0, 500) } : undefined));
  }

  private candidates(url: string, width?: number, height?: number): string[] {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return [];
    }
    if (u.protocol !== "https:") u.protocol = "https:";
    if (!SQS_CDN.test(u.host)) return [u.toString()];
    return squarespaceRenditions(u, width, height, Boolean(this.opts.resize));
  }

  private async download(img: SqImage, where: string): Promise<ImageValue | undefined> {
    if (this.opts.offline) return undefined;
    // SVG logos and marks stay vector (icons painted for a card strip are rasterized below).
    if (/\.svg(?:[?#]|$)/i.test(img.url) && !/#(?:.*&)?icon\b/.test(img.url)) {
      const kept = await this.keepSvg(img).catch(() => undefined);
      if (kept) return kept;
    }
    let base = (new URL(img.url).pathname.split("/").pop() || "image").replace(/\.svg$/i, ".png");
    try {
      base = decodeURIComponent(base).replace(/\+/g, " ");
    } catch {
      // keep the raw name
    }
    let lastError = "";
    const tries = [
      ...this.candidates(img.url, img.width, img.height),
      ...(img.alternates ?? []).filter((a) => /^https?:\/\//.test(a)),
    ];
    const unique = [...new Set(tries)];
    for (const url of unique) {
      try {
        const prepared = await prepareImage(
          { url, alt: img.alt ?? "", filename: base },
          {
            fetch: this.fetchImage,
            ...(this.opts.resize ? { resize: this.opts.resize } : {}),
            now: this.now,
          },
        );
        const same = this.stored(prepared.bytes);
        if (same) return this.valueOf(same, img);
        const meta: MediaMeta = { ...prepared.meta };
        if (img.focal) meta.focal = img.focal;
        this.credit(meta, img);
        this.files.set(prepared.path, prepared.bytes);
        this.media[prepared.path] = meta;
        this.remember(prepared.bytes, prepared.path);
        return {
          src: prepared.path as ImageValue["src"],
          alt: img.alt ?? "",
          width: meta.width as number,
          height: meta.height as number,
          mediaId: meta.id,
          ...(img.focal ? { focal: img.focal } : {}),
        };
      } catch (e) {
        lastError = (e as Error).message;
        // Other renditions are worth a try (an original too big to store, a 404 on one size);
        // a single address that failed for another reason is final.
        if (!/larger than|too_large|px on the long edge/i.test(lastError) && unique.length < 2)
          break;
      }
    }
    this.notices.push({
      kind: "media",
      where,
      message: `Couldn't import image ${img.url}: ${lastError}`,
    });
    return undefined;
  }

  /** Content hash → stored path: one file however many addresses lead to it. */
  private readonly byHash = new Map<string, string>();

  private hash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  private stored(bytes: Uint8Array): string | undefined {
    return this.byHash.get(this.hash(bytes));
  }

  private remember(bytes: Uint8Array, path: string): void {
    this.byHash.set(this.hash(bytes), path);
  }

  private valueOf(path: string, img: SqImage): ImageValue {
    const meta = this.media[path] as MediaMeta;
    if (img.focal && !meta.focal) meta.focal = img.focal;
    return {
      src: path as ImageValue["src"],
      alt: img.alt ?? "",
      width: meta.width as number,
      height: meta.height as number,
      mediaId: meta.id,
      ...(img.focal ? { focal: img.focal } : {}),
    };
  }

  /** Where the file came from, and the original's own credit/licence when the site said. */
  private credit(meta: MediaMeta, img: SqImage): void {
    meta.credit = {
      source: `Imported from ${this.opts.source ?? "Squarespace"}`.slice(0, 100),
      ...(img.credit ? { author: img.credit.slice(0, 200) } : {}),
    };
    if (img.license) meta.license = img.license.slice(0, 200);
  }

  /** An SVG kept as SVG: strictly re-serialized (as uploads are); undefined to rasterize it. */
  private async keepSvg(img: SqImage): Promise<ImageValue | undefined> {
    let url = img.url;
    const color = /#color=([0-9a-f]{6})\b/i.exec(url)?.[1];
    url = url.replace(/#.*$/, "");
    if (!/^https:\/\//.test(url)) url = url.replace(/^http:/, "https:");
    const res = await this.opts.fetch(url);
    if (!res.ok) return undefined;
    const declared = Number(res.headers.get("content-length") ?? "");
    if (declared > 2 * 1024 * 1024) return undefined;
    let text = await res.text();
    if (text.length > 2 * 1024 * 1024 || !/<svg[\s>]/i.test(text)) return undefined;
    if (color) text = text.replace(/currentColor/g, `#${color}`);
    const clean = sanitizeSvg(text);
    if (!clean.ok) {
      this.notices.push({
        kind: "media",
        where: "media",
        message: `The SVG ${url} couldn't be kept as a vector (${clean.problem}); it was turned into a picture instead.`,
      });
      return undefined;
    }
    const bytes = new TextEncoder().encode(clean.svg);
    const same = this.stored(bytes);
    if (same) return this.valueOf(same, img);
    const size = svgSize(clean.svg) ??
      (img.width && img.height ? { width: img.width, height: img.height } : undefined) ?? {
        width: 512,
        height: 512,
      };
    const id = newId("med");
    const yyyy = String(this.now.getUTCFullYear());
    const mm = String(this.now.getUTCMonth() + 1).padStart(2, "0");
    let name = new URL(url).pathname.split("/").pop() || "image";
    try {
      name = decodeURIComponent(name);
    } catch {
      // keep the raw name
    }
    const stem =
      name
        .replace(/\.svg$/i, "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "image";
    const path = `media/${yyyy}/${mm}/${stem}-${id.slice(4, 8)}.svg`;
    const meta: MediaMeta = {
      id: id as MediaMeta["id"],
      path: path as MediaMeta["path"],
      kind: "image",
      mime: "image/svg+xml",
      bytes: bytes.length,
      width: size.width,
      height: size.height,
      alt: (img.alt ?? "").slice(0, 500),
      originalName: name.slice(0, 255),
      createdAt: this.now.toISOString(),
    };
    if (img.focal) meta.focal = img.focal;
    this.credit(meta, img);
    this.files.set(path, bytes);
    this.media[path] = meta;
    this.remember(bytes, path);
    return this.valueOf(path, img);
  }

  /** Download a linked document or audio file (`/s/…`, `/wp-content/uploads/…`) into `media/files/`. */
  file(url: string, where = "media"): Promise<string | undefined> {
    let p = this.docs.get(url);
    if (!p) {
      p = this.downloadFile(url, where);
      this.docs.set(url, p);
    }
    return p;
  }

  private async downloadFile(url: string, where: string): Promise<string | undefined> {
    if (this.opts.offline) return undefined;
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "file");
    const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
    const type = FILE_TYPES[ext];
    if (!type) {
      this.notices.push({
        kind: "media",
        where,
        message: `Linked file ${url} has an unsupported type; the link points at the old site.`,
      });
      return undefined;
    }
    try {
      const res = await this.opts.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") ?? "");
      if (declared > FILE_MAX) throw new Error("larger than 25 MB");
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > FILE_MAX) throw new Error("larger than 25 MB");
      const id = newId("med");
      const stem =
        name
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50) || "file";
      const path = `media/files/${stem}-${id.slice(4, 8)}.${ext}`;
      this.files.set(path, bytes);
      this.fileLinks.set(url, path);
      this.media[path] = {
        id,
        path: path as MediaMeta["path"],
        kind: type.kind,
        mime: type.mime,
        bytes: bytes.length,
        originalName: name.slice(0, 255),
        createdAt: this.now.toISOString(),
      } as MediaMeta;
      return path;
    } catch (e) {
      this.notices.push({
        kind: "media",
        where,
        message: `Couldn't download ${url} (${(e as Error).message}); the link points at the old site.`,
      });
      return undefined;
    }
  }
}

/**
 * Squarespace CDN renditions, best first: the file as uploaded (`?format=original`), then web
 * sizes from the largest down. Without a resizer, sizes whose long edge would pass the storage
 * limit are skipped (portraits step down).
 */
export function squarespaceRenditions(
  u: URL,
  width?: number,
  height?: number,
  canResize = true,
): string[] {
  const at = (format: string) => {
    const c = new URL(u);
    c.searchParams.set("format", format);
    return c.toString();
  };
  const ratio = width && height ? height / width : 1;
  const fits = (w: number) => canResize || w * Math.max(1, ratio) <= MAX_IMAGE_EDGE;
  const known = width && height ? Math.max(width, height) : undefined;
  const sizes = [2500, 1500, 1000, 750, 500].filter(fits);
  const originalFits = canResize || (known !== undefined && known <= MAX_IMAGE_EDGE);
  return [
    ...(originalFits ? [at("original")] : []),
    ...(sizes.length ? sizes : [500]).map((w) => at(`${w}w`)),
  ];
}
