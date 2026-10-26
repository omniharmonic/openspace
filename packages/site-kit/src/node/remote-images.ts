/**
 * Self-hosted demo photos. Templates ship remote demo photography (Unsplash, credited in the
 * content). Publishing builds (`OPENSPACE_REMOTE_IMAGES=download`, like the fonts' download) fetch
 * each photo once per width and format from the image CDN (AVIF + JPEG, the renderer's widths up
 * to the photo's own width) and publish them under `_os/img/`, so the page's largest image comes
 * from the site's own origin over its existing connection instead of a new one (LCP). Credits
 * are untouched: they live in the content. A failed download keeps that photo remote.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ImageMap, REMOTE_WIDTHS, type ResolvedImage } from "@openspace/renderer";
import type { SiteDocument } from "@openspace/schema";

export interface RemoteImagePlan {
  map: ImageMap;
  /** Files to publish: `name` under `_os/img/`, read from `from` (the download cache). */
  files: { name: string; from: string }[];
}

const HOSTS = new Set(["images.unsplash.com"]);
const FORMATS = [
  { fm: "avif", ext: "avif", type: "image/avif" },
  { fm: "jpg", ext: "jpg", type: "image/jpeg" },
] as const;

/** Remote CDN images the document shows, with the dimensions the content gives them. */
export function remoteImages(doc: SiteDocument): Map<string, { width?: number; height?: number }> {
  const out = new Map<string, { width?: number; height?: number }>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 60 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    for (const [k, x] of Object.entries(o)) {
      if (typeof x === "string" && /^(src|image|poster)$/.test(k) && isRemote(x)) {
        const dims = {
          ...(typeof o.width === "number" ? { width: o.width } : {}),
          ...(typeof o.height === "number" ? { height: o.height } : {}),
        };
        if (!out.has(x) || dims.width) out.set(x, dims);
      } else visit(x, depth + 1);
    }
  };
  visit(doc.site, 0);
  visit(doc.pages, 0);
  visit(doc.collections, 0);
  return out;
}

function isRemote(src: string): boolean {
  try {
    return HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

/** Width and height of a baseline/progressive JPEG (SOF marker), or null. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] as number;
    const len = ((b[i + 2] as number) << 8) | (b[i + 3] as number);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return {
        height: ((b[i + 5] as number) << 8) | (b[i + 6] as number),
        width: ((b[i + 7] as number) << 8) | (b[i + 8] as number),
      };
    i += 2 + len;
  }
  return null;
}

const variant = (src: string, w: number, fm: string) => {
  const u = new URL(src);
  u.searchParams.set("w", String(w));
  u.searchParams.set("fm", fm);
  u.searchParams.delete("auto");
  if (!u.searchParams.has("fit")) u.searchParams.set("fit", "max");
  if (!u.searchParams.has("q")) u.searchParams.set("q", "80");
  return u.toString();
};

const cache = new Map<string, Promise<RemoteImagePlan>>();

export function selfHostRemoteImages(
  doc: SiteDocument,
  opts: { cacheDir: string; basePath: string; fetch?: typeof fetch },
): Promise<RemoteImagePlan> {
  const key = `${opts.cacheDir}|${opts.basePath}|${JSON.stringify([...remoteImages(doc).keys()])}`;
  let p = cache.get(key);
  if (!p) {
    p = plan(doc, opts);
    cache.set(key, p);
  }
  return p;
}

async function plan(
  doc: SiteDocument,
  opts: { cacheDir: string; basePath: string; fetch?: typeof fetch },
): Promise<RemoteImagePlan> {
  const f = opts.fetch ?? fetch;
  await mkdir(opts.cacheDir, { recursive: true });
  const map: Record<string, ResolvedImage> = {};
  const files: RemoteImagePlan["files"] = [];
  const get = async (url: string, file: string): Promise<Uint8Array | null> => {
    const path = join(opts.cacheDir, file);
    const cached = await readFile(path).catch(() => null);
    if (cached?.length) return new Uint8Array(cached);
    try {
      const res = await f(url, { headers: { Accept: "image/avif,image/*" } });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length) return null;
      await writeFile(path, bytes);
      return bytes;
    } catch {
      return null;
    }
  };
  const queue = [...remoteImages(doc)];
  const work = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [src, dims] = next;
      const hash = createHash("sha256").update(src).digest("hex").slice(0, 12);
      const master = Number(new URL(src).searchParams.get("w")) || 1080;
      const widths = REMOTE_WIDTHS.filter((w) => w <= master);
      if (!widths.length) continue;
      const largest = widths[widths.length - 1] as number;
      const byFormat: Record<string, string[]> = {};
      let size = dims.width && dims.height ? { width: dims.width, height: dims.height } : null;
      let ok = true;
      for (const fmt of FORMATS) {
        const entries: string[] = [];
        for (const w of widths) {
          const name = `${hash}-${w}.${fmt.ext}`;
          const bytes = await get(variant(src, w, fmt.fm), name);
          if (!bytes) {
            ok = false;
            break;
          }
          if (fmt.ext === "jpg" && w === largest && !size) size = jpegSize(bytes);
          files.push({ name, from: join(opts.cacheDir, name) });
          entries.push(`${opts.basePath}/_os/img/${name} ${w}w`);
        }
        if (!ok) break;
        byFormat[fmt.ext] = entries;
      }
      if (!ok || !size) continue;
      const jpg = byFormat.jpg ?? [];
      map[src] = {
        src: (jpg[jpg.length - 1] ?? "").split(" ")[0] as string,
        srcset: jpg.join(", "),
        sources: [{ type: "image/avif", srcset: (byFormat.avif ?? []).join(", ") }],
        width: size.width,
        height: size.height,
      };
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  const used = new Set(
    Object.keys(map).map((s) => createHash("sha256").update(s).digest("hex").slice(0, 12)),
  );
  return { map, files: files.filter((x) => used.has(x.name.split("-")[0] as string)) };
}
