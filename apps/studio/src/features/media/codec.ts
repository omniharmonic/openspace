/**
 * Image decode/draw/encode behind a small interface so the pipeline runs in the browser (Canvas)
 * and in tests (a fake codec). The browser codec decodes with `createImageBitmap` (honoring EXIF
 * orientation, so stripping the orientation tag never rotates a photo) and re-encodes through a
 * canvas, which drops every metadata block.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Non-destructive edits applied while drawing. */
export interface ImageEdit {
  /** Crop in source pixels. */
  crop?: Rect;
  /** CSS filter, e.g. `brightness(1.1) contrast(1.05) saturate(0.9)`. */
  filter?: string;
}

export interface Decoded {
  width: number;
  height: number;
  source: unknown;
  close(): void;
}

/** A drawn bitmap the codec can read or encode. */
export interface Surface {
  width: number;
  height: number;
}

export interface ImageCodec {
  decode(blob: Blob): Promise<Decoded>;
  draw(source: unknown, width: number, height: number, edit?: ImageEdit): Surface;
  /** RGBA bytes of a surface. */
  pixels(surface: Surface): Uint8ClampedArray;
  /** Encode a surface; the result's `type` says what the browser actually produced. */
  encode(surface: Surface, mime: string, quality?: number): Promise<Blob>;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
interface CanvasSurface extends Surface {
  canvas: AnyCanvas;
}

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function context2d(canvas: AnyCanvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("This browser can't process images here.");
  return ctx;
}

/** The real codec (Canvas + createImageBitmap). */
export const browserCodec: ImageCodec = {
  async decode(blob) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      throw new Error("This image format can't be opened here. Try a JPEG or PNG.");
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },

  draw(source, width, height, edit) {
    const canvas = makeCanvas(width, height);
    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (edit?.filter) ctx.filter = edit.filter;
    const img = source as CanvasImageSource;
    const c = edit?.crop;
    if (c) ctx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, width, height);
    else ctx.drawImage(img, 0, 0, width, height);
    return { width, height, canvas } as CanvasSurface;
  },

  pixels(surface) {
    const { canvas, width, height } = surface as CanvasSurface;
    return context2d(canvas).getImageData(0, 0, width, height).data;
  },

  async encode(surface, mime, quality) {
    const { canvas } = surface as CanvasSurface;
    if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: mime, quality });
    return new Promise<Blob>((resolve, reject) =>
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Couldn't save the image."))),
        mime,
        quality,
      ),
    );
  },
};
