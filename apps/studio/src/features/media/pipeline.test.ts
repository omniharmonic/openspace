import type { MediaMeta } from "@omniharmonic/openspace-schema";
import { MediaMetaSchema } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { dominantColor, fitWithin, suggestFocal } from "./analyze";
import {
  hasExif,
  stripJpegMetadata,
  stripMetadata,
  stripPngMetadata,
  stripWebpMetadata,
} from "./metadata";
import { extFor, findDuplicate, hashOfPath, mediaPathFor, sha256Hex, slugifyName } from "./naming";
import { MAX_EDGE, MediaError, processMedia, sniffMime, UNSUPPORTED_MESSAGE } from "./pipeline";
import { sanitizeSvg, svgSize } from "./svg";
import {
  contains,
  type FakeImage,
  fakeCodec,
  fakePhoto,
  GPS_MARKER,
  jpegWithExif,
  pngWithExif,
  webpWithExif,
} from "./testing";

const OCT_26 = () => new Date("2026-10-26T12:00:00Z");
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe("metadata stripping", () => {
  it("removes EXIF/GPS and comments from JPEG but keeps the image data", () => {
    const src = jpegWithExif("scan-data");
    expect(hasExif(src)).toBe(true);
    expect(contains(src, GPS_MARKER)).toBe(true);
    const out = stripJpegMetadata(src);
    expect(hasExif(out)).toBe(false);
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, "taken on a phone")).toBe(false);
    expect(contains(out, "JFIF")).toBe(true);
    expect(contains(out, "scan-data")).toBe(true);
    expect(Array.from(out.subarray(-2))).toEqual([0xff, 0xd9]);
  });

  it("removes eXIf and text chunks from PNG", () => {
    const out = stripPngMetadata(pngWithExif());
    expect(hasExif(out)).toBe(false);
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, "home address")).toBe(false);
    expect(contains(out, "IHDR")).toBe(true);
    expect(contains(out, "IDAT")).toBe(true);
    expect(contains(out, "IEND")).toBe(true);
  });

  it("removes EXIF and XMP chunks from WebP, clears their flags and fixes the RIFF size", () => {
    const out = stripWebpMetadata(webpWithExif());
    expect(contains(out, GPS_MARKER)).toBe(false);
    expect(contains(out, "xmpmeta")).toBe(false);
    expect(contains(out, "VP8L")).toBe(true);
    const riff =
      (out[4] ?? 0) | ((out[5] ?? 0) << 8) | ((out[6] ?? 0) << 16) | ((out[7] ?? 0) << 24);
    expect(riff).toBe(out.length - 8);
    // VP8X flags byte: EXIF (0x08) and XMP (0x04) cleared.
    expect((out[20] ?? 0) & 0x0c).toBe(0);
  });

  it("leaves other formats alone", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 hello");
    expect(stripMetadata(pdf)).toBe(pdf);
  });
});

describe("naming and dedupe", () => {
  it("slugifies file names", () => {
    expect(slugifyName("IMG_2041 (1).HEIC")).toBe("img-2041-1");
    expect(slugifyName("Café Façade — Été.jpg")).toBe("cafe-facade-ete");
    expect(slugifyName("....png")).toBe("image");
  });

  it("names files media/YYYY/MM/<slug>-<hash>.<ext>", async () => {
    const sha = await sha256Hex(new TextEncoder().encode("hello"));
    expect(sha).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    const path = mediaPathFor({
      name: "Sunset at the Beach.jpeg",
      sha256: sha,
      mime: "image/jpeg",
      date: OCT_26(),
    });
    expect(path).toBe("media/2026/10/sunset-at-the-beach-2cf24dba.jpg");
    expect(hashOfPath(path)).toBe("2cf24dba");
    expect(extFor("image/webp")).toBe("webp");
    expect(() => extFor("text/html")).toThrow();
  });

  it("finds an identical file already in the library", () => {
    const media = {
      "media/2026/09/other-name-2cf24dba.jpg": {} as MediaMeta,
      "media/2026/09/else-00000000.jpg": {} as MediaMeta,
    };
    expect(findDuplicate(media, "2cf24dba5fb0")).toBe("media/2026/09/other-name-2cf24dba.jpg");
    expect(findDuplicate(media, "ffffffff")).toBeNull();
  });
});

describe("pixel analysis", () => {
  it("finds the dominant color and a focal point on the subject", () => {
    const w = 40;
    const h = 30;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const subject = (x - 30) ** 2 + (y - 8) ** 2 < 16;
        px[p] = subject ? 240 : 20;
        px[p + 1] = subject ? 30 : 60;
        px[p + 2] = subject ? 30 : 110;
        px[p + 3] = 255;
      }
    expect(dominantColor(px)).toBe("#143c6e");
    const [fx, fy] = suggestFocal(px, w, h);
    expect(fx).toBeGreaterThan(0.6);
    expect(fy).toBeLessThan(0.45);
  });

  it("centers the focal point on flat images", () => {
    const px = new Uint8ClampedArray(20 * 20 * 4).fill(128);
    expect(suggestFocal(px, 20, 20)).toEqual([0.5, 0.5]);
  });

  it("fits the long edge without upscaling", () => {
    expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 });
    expect(fitWithin(1200, 4800, 2400)).toEqual({ width: 600, height: 2400 });
    expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600 });
  });
});

describe("processMedia", () => {
  const setup = (img: FakeImage, opts: { webp?: boolean } = {}) => {
    const images = new WeakMap<Blob, FakeImage>();
    const { codec, log } = fakeCodec(images, opts);
    const file = fakePhoto(images, img, "Beach Day.JPG");
    return { codec, log, file, images };
  };

  it("caps the long edge at 2400px and re-encodes photos as JPEG q0.85", async () => {
    const { codec, log, file } = setup({ width: 4000, height: 3000, subject: [0.7, 0.3] });
    const out = await processMedia(file, { codec, now: OCT_26 });
    const main = log.encoded.find((e) => e.width === 2400);
    expect(main).toEqual({ width: 2400, height: 1800, mime: "image/jpeg", quality: 0.85 });
    expect(Math.max(...log.encoded.map((e) => Math.max(e.width, e.height)))).toBeLessThanOrEqual(
      MAX_EDGE,
    );
    expect(out.meta.width).toBe(2400);
    expect(out.meta.height).toBe(1800);
    expect(out.resized).toBe(true);
    expect(out.meta.mime).toBe("image/jpeg");
    expect(log.closed).toBe(1);
  });

  it("strips EXIF and GPS even when the encoder copied them", async () => {
    const { codec, file } = setup({ width: 1600, height: 1200 });
    expect(contains(await bytes(file), GPS_MARKER)).toBe(true);
    const out = await processMedia(file, { codec, now: OCT_26 });
    const result = await bytes(out.blob);
    expect(hasExif(result)).toBe(false);
    expect(contains(result, GPS_MARKER)).toBe(false);
    expect(out.meta.placeholder).toMatch(/^data:image\/jpeg;base64,/);
    expect(
      contains(
        Uint8Array.from(atob(out.meta.placeholder?.split(",")[1] ?? ""), (c) => c.charCodeAt(0)),
        GPS_MARKER,
      ),
    ).toBe(false);
  });

  it("names the file by its content hash and validates as MediaMeta", async () => {
    const { codec, file } = setup({ width: 800, height: 600, subject: [0.2, 0.8] });
    const out = await processMedia(file, { codec, now: OCT_26 });
    expect(out.path).toMatch(/^media\/2026\/10\/beach-day-[0-9a-f]{8}\.jpg$/);
    expect(out.path).toContain(out.sha256.slice(0, 8));
    expect(out.sha256).toBe(await sha256Hex(await bytes(out.blob)));
    expect(out.meta.path).toBe(out.path);
    expect(out.meta.bytes).toBe(out.blob.size);
    expect(out.meta.originalName).toBe("Beach Day.JPG");
    expect(out.meta.focal?.[0]).toBeLessThan(0.5);
    expect(out.meta.focal?.[1]).toBeGreaterThan(0.5);
    expect(out.dominant).toMatch(/^#[0-9a-f]{6}$/);
    expect(MediaMetaSchema.safeParse(out.meta).success).toBe(true);
    expect(out.resized).toBe(false);
  });

  it("dedupes an identical upload against the library", async () => {
    const { codec, file, images } = setup({ width: 800, height: 600 });
    const first = await processMedia(file, { codec, now: OCT_26 });
    const again = fakePhoto(images, { width: 800, height: 600 }, "copy of beach.jpg");
    const second = await processMedia(again, {
      codec,
      now: OCT_26,
      existing: { [first.path]: first.meta } as never,
    });
    expect(second.sha256).toBe(first.sha256);
    expect(second.duplicateOf).toBe(first.path);
  });

  it("keeps transparency: lossless WebP where supported, PNG otherwise", async () => {
    const webp = setup({ width: 600, height: 600, alpha: true }, { webp: true });
    const a = await processMedia(webp.file, { codec: webp.codec, now: OCT_26 });
    expect(webp.log.encoded.find((e) => e.width === 600)).toMatchObject({
      mime: "image/webp",
      quality: 1,
    });
    expect(a.meta.mime).toBe("image/webp");
    expect(a.path).toMatch(/\.webp$/);
    expect(contains(await bytes(a.blob), GPS_MARKER)).toBe(false);

    const png = setup({ width: 600, height: 600, alpha: true });
    const b = await processMedia(png.file, { codec: png.codec, now: OCT_26 });
    expect(b.meta.mime).toBe("image/png");
    expect(b.path).toMatch(/\.png$/);
    expect(hasExif(await bytes(b.blob))).toBe(false);
  });

  it("applies crop and filters before encoding", async () => {
    const { codec, log, file } = setup({ width: 3000, height: 2000 });
    const edit = { crop: { x: 500, y: 0, width: 2000, height: 2000 }, filter: "brightness(1.1)" };
    const out = await processMedia(file, { codec, now: OCT_26, edit });
    expect(out.meta.width).toBe(2000);
    expect(out.meta.height).toBe(2000);
    expect(log.drawn.every((d) => d.edit === edit)).toBe(true);
  });

  it("sanitizes SVGs and reads their size", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="10" height="10"/></a><foreignObject><div>x</div></foreignObject></svg>`;
    const file = new File([svg], "Logo.svg", { type: "image/svg+xml" });
    const out = await processMedia(file, { now: OCT_26 });
    const text = await out.blob.text();
    expect(text).not.toMatch(/script|onload|javascript:|foreignObject/i);
    expect(text).toContain("<rect");
    expect(out.meta).toMatchObject({
      kind: "image",
      mime: "image/svg+xml",
      width: 120,
      height: 60,
    });
    expect(out.path).toMatch(/^media\/2026\/10\/logo-[0-9a-f]{8}\.svg$/);
  });

  it("refuses videos unless the site is on Cloudflare, and keeps documents as they are", async () => {
    const video = new File(
      [new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])],
      "clip.mp4",
      { type: "video/mp4" },
    );
    await expect(processMedia(video, { now: OCT_26 })).rejects.toBeInstanceOf(MediaError);
    const ok = await processMedia(video, { now: OCT_26, allowVideo: true });
    expect(ok.meta.kind).toBe("video");
    const pdf = new File(["%PDF-1.7 menu"], "Dinner Menu.pdf", { type: "application/pdf" });
    const doc = await processMedia(pdf, { now: OCT_26 });
    expect(doc.meta).toMatchObject({ kind: "file", mime: "application/pdf" });
    expect(doc.path).toMatch(/^media\/2026\/10\/dinner-menu-[0-9a-f]{8}\.pdf$/);
  });

  it("sniffs the real type from the bytes", () => {
    const t = (s: string) => new TextEncoder().encode(s);
    expect(sniffMime(jpegWithExif())).toBe("image/jpeg");
    expect(sniffMime(pngWithExif())).toBe("image/png");
    expect(sniffMime(webpWithExif())).toBe("image/webp");
    expect(sniffMime(t('<?xml version="1.0"?><svg>'))).toBe("image/svg+xml");
    expect(sniffMime(t('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"><svg>'))).toBe(
      "image/svg+xml",
    );
    expect(sniffMime(t("<!doctype html><html><body><svg></svg>"))).toBeNull();
    expect(sniffMime(t("alert(document.cookie)"))).toBeNull();
    expect(sniffMime(t("ID3\u0004rest"))).toBe("audio/mpeg");
  });
});

describe("allowlist (files are served from the site's own origin)", () => {
  const refuse = async (file: File) => {
    const err = await processMedia(file, { now: OCT_26 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MediaError);
    expect((err as MediaError).code).toBe("unsupported");
    expect((err as MediaError).message).toBe(UNSUPPORTED_MESSAGE);
  };

  it("refuses HTML, even when it claims to be an image", async () => {
    await refuse(
      new File(["<!doctype html><script>alert(1)</script>"], "promo.html", { type: "text/html" }),
    );
    await refuse(new File(["<html><body>hi</body></html>"], "photo.jpg", { type: "image/jpeg" }));
    await refuse(
      new File(["<html><svg onload=alert(1)></svg></html>"], "logo.svg", { type: "image/svg+xml" }),
    );
  });

  it("refuses scripts and other unknown types", async () => {
    await refuse(
      new File(["alert(document.cookie)"], "app.js", { type: "application/javascript" }),
    );
    await refuse(new File(["PK\u0003\u0004zip"], "site.zip", { type: "application/zip" }));
    await refuse(new File(["plain words"], "notes.txt", { type: "text/plain" }));
  });

  it("takes the extension from the sniffed type, never the file name", async () => {
    const images = new WeakMap<Blob, FakeImage>();
    const { codec } = fakeCodec(images);
    const png = new File([pngWithExif() as Uint8Array<ArrayBuffer>], "holiday.html", {
      type: "text/html",
    });
    images.set(png, { width: 40, height: 40, alpha: true });
    const out = await processMedia(png, { codec, now: OCT_26 });
    expect(out.path).toMatch(/^media\/2026\/10\/holiday-[0-9a-f]{8}\.png$/);
    const pdf = await processMedia(
      new File(["%PDF-1.7 menu"], "menu.exe", { type: "application/x-msdownload" }),
      { now: OCT_26 },
    );
    expect(pdf.path).toMatch(/\.pdf$/);
  });

  it("still sanitizes SVGs that carry script", async () => {
    const out = await processMedia(
      new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>'],
        "icon.svg",
      ),
      { now: OCT_26 },
    );
    const text = await out.blob.text();
    expect(text).not.toContain("script");
    expect(text).toContain("<circle");
  });
});

describe("dedupe by full hash", () => {
  it("only treats a short-hash match as a duplicate when the full SHA-256 matches", async () => {
    const images = new WeakMap<Blob, FakeImage>();
    const { codec } = fakeCodec(images);
    const first = await processMedia(fakePhoto(images, { width: 800, height: 600 }, "a.jpg"), {
      codec,
      now: OCT_26,
    });
    const existing = { [first.path]: first.meta } as never;
    // Same content: confirmed by its bytes.
    const same = await processMedia(fakePhoto(images, { width: 800, height: 600 }, "a.jpg"), {
      codec,
      now: OCT_26,
      existing,
      existingBytes: async () => new Uint8Array(await first.blob.arrayBuffer()),
    });
    expect(same.duplicateOf).toBe(first.path);
    // Same name and short hash, different bytes: not a duplicate, and it gets a longer name.
    const other = await processMedia(fakePhoto(images, { width: 800, height: 600 }, "a.jpg"), {
      codec,
      now: OCT_26,
      existing,
      existingBytes: async () => new TextEncoder().encode("something else"),
    });
    expect(other.duplicateOf).toBeNull();
    expect(other.path).not.toBe(first.path);
    expect(other.path).toContain(other.sha256.slice(0, 16));
  });

  it("falls back to a solid placeholder in the dominant color", async () => {
    const images = new WeakMap<Blob, FakeImage>();
    const { codec } = fakeCodec(images);
    const failing = {
      ...codec,
      encode: async (s: Parameters<typeof codec.encode>[0], mime: string, q?: number) => {
        if (s.width <= 16) throw new Error("no");
        return codec.encode(s, mime, q);
      },
    };
    const out = await processMedia(
      fakePhoto(images, { width: 300, height: 200, color: [200, 30, 40] }),
      { codec: failing, now: OCT_26 },
    );
    expect(out.meta.placeholder).toMatch(/^data:image\/png;base64,/);
    const bytes = Uint8Array.from(atob(out.meta.placeholder?.split(",")[1] ?? ""), (c) =>
      c.charCodeAt(0),
    );
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(MediaMetaSchema.safeParse(out.meta).success).toBe(true);
  });
});

describe("svg helpers", () => {
  it("rejects non-SVG text", () => {
    expect(() => sanitizeSvg("<html><body>hi</body></html>")).toThrow();
  });
  it("derives size from width/height or viewBox", () => {
    expect(svgSize('<svg width="300" height="100">')).toEqual({ width: 300, height: 100 });
    expect(svgSize('<svg width="300" viewBox="0 0 30 20">')).toEqual({ width: 300, height: 200 });
    expect(svgSize("<svg>")).toEqual({ width: 512, height: 512 });
  });
});
