/**
 * Downloads images and files into `media/` through the same pipeline as uploads (format sniffing,
 * metadata stripped, ≤2400px long edge, `media/YYYY/MM/name-id.ext` paths, `MediaMeta` with
 * size and alt text). Squarespace CDN images are requested at a web size (`?format=1500w`) and
 * stepped down when a portrait would exceed the long-edge limit without a resizer.
 */
import { type ImageResizer, MAX_IMAGE_EDGE, prepareImage } from "@omniharmonic/openspace-mcp-tools";
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
  rasterizeSvg?: (svg: Uint8Array) => Promise<Uint8Array>;
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
          const png = await raster(new TextEncoder().encode(svg));
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

    // Pick a width whose long edge stays within the limit (portraits step down).
    const ratio = width && height ? height / width : 1;
    const widths = [1500, 1000, 750, 500].filter((w) => w * Math.max(1, ratio) <= MAX_IMAGE_EDGE);
    const list = (widths.length ? widths : [500]).map((w) => {
      const c = new URL(u);
      c.searchParams.set("format", `${w}w`);
      return c.toString();
    });
    return list;
  }

  private async download(img: SqImage, where: string): Promise<ImageValue | undefined> {
    if (this.opts.offline) return undefined;
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
    for (const url of [...new Set(tries)]) {
      try {
        const prepared = await prepareImage(
          { url, alt: img.alt ?? "", filename: base },
          {
            fetch: this.fetchImage,
            ...(this.opts.resize ? { resize: this.opts.resize } : {}),
            now: this.now,
          },
        );
        const meta: MediaMeta = { ...prepared.meta };
        if (img.focal) meta.focal = img.focal;
        meta.credit = { source: `Imported from ${this.opts.source ?? "Squarespace"}` };
        this.files.set(prepared.path, prepared.bytes);
        this.media[prepared.path] = meta;
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
        if (
          !/larger than|too_large|px on the long edge/i.test(lastError) &&
          !img.alternates?.length
        )
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
