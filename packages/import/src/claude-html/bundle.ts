/**
 * An HTML bundle: the page (or pages) someone brings — a single HTML file Claude made, a Claude
 * artifact export, a zip of HTML/CSS/images, or a page's address — with the files it refers to.
 * Everything the importer reads goes through `bundleFetch`, which serves the bundle's own files
 * and only goes to the network for what isn't in it (web fonts, remote images, a URL source).
 * Pure: no filesystem (the CLI reads files into a bundle; the Hub gets them uploaded).
 */
import { unzipSync } from "fflate";
import type { FetchFn } from "../fetch";

/** The origin bundle files are served from (never a real host). */
export const BUNDLE_ORIGIN = "https://bundle.openspace.invalid";

export interface HtmlBundle {
  /** Bundle path (no leading slash, `/` separators) → bytes. */
  files: Map<string, Uint8Array>;
  /** The page to start from. */
  entry: string;
  /** For a page read from an address: where it lives (assets not in `files` come from there). */
  siteUrl?: string;
  /** For people: "index.html", "my-site.zip", "example.com". */
  label: string;
}

/** Most a bundle may hold (bytes), so an upload can't exhaust memory. */
export const MAX_BUNDLE_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 2000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const textOf = (bytes: Uint8Array | undefined): string =>
  bytes ? decoder.decode(bytes).replace(/^﻿/, "") : "";

const isHtmlPath = (p: string) => /\.html?$/i.test(p);

export function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** A single HTML file (pasted, uploaded, or an artifact export). */
export function bundleFromHtml(html: string, name = "index.html"): HtmlBundle {
  const entry = normalizePath(name) || "index.html";
  return {
    files: new Map([[isHtmlPath(entry) ? entry : "index.html", encoder.encode(html)]]),
    entry: isHtmlPath(entry) ? entry : "index.html",
    label: name,
  };
}

/** Files by path (an upload of several files, or a folder read by the CLI). */
export function bundleFromFiles(
  input: Record<string, Uint8Array | string> | Map<string, Uint8Array>,
  opts: { entry?: string; label?: string } = {},
): HtmlBundle {
  const files = new Map<string, Uint8Array>();
  let total = 0;
  const entries = input instanceof Map ? [...input.entries()] : Object.entries(input);
  for (const [raw, v] of entries) {
    const path = normalizePath(raw);
    if (!path || /(?:^|\/)(?:__MACOSX|\.DS_Store|\.git)(?:\/|$)/.test(path)) continue;
    const bytes = typeof v === "string" ? encoder.encode(v) : v;
    total += bytes.length;
    if (total > MAX_BUNDLE_BYTES)
      throw new Error("That's more than 60 MB of files. Leave out videos and very large images.");
    if (files.size >= MAX_FILES) throw new Error("That's more than 2,000 files.");
    files.set(path, bytes);
  }
  // A single top folder (a zipped folder): drop it.
  const tops = new Set([...files.keys()].map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  if (tops.size === 1 && !tops.has("")) {
    const top = `${[...tops][0]}/`;
    const moved = new Map<string, Uint8Array>();
    for (const [p, b] of files) moved.set(p.slice(top.length), b);
    files.clear();
    for (const [p, b] of moved) files.set(p, b);
  }
  const htmls = [...files.keys()].filter(isHtmlPath);
  if (!htmls.length) throw new Error("There's no HTML page in those files (a .html file).");
  const wanted = opts.entry ? normalizePath(opts.entry) : undefined;
  const entry =
    (wanted && files.has(wanted) ? wanted : undefined) ??
    htmls.find((p) => p === "index.html") ??
    htmls.filter((p) => /(?:^|\/)index\.html?$/i.test(p)).sort((a, b) => a.length - b.length)[0] ??
    htmls.sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length)[0];
  return { files, entry: entry as string, label: opts.label ?? entry ?? "files" };
}

export const isZip = (bytes: Uint8Array) =>
  bytes.length > 4 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  bytes[2] === 0x03 &&
  bytes[3] === 0x04;

/** A zip of HTML, CSS and images (a downloaded site, a Claude artifact project). */
export function bundleFromZip(bytes: Uint8Array, label = "site.zip"): HtmlBundle {
  let unzipped: Record<string, Uint8Array>;
  try {
    let total = 0;
    unzipped = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith("/")) return false;
        total += f.originalSize;
        if (total > MAX_BUNDLE_BYTES)
          throw new Error(
            "That zip unpacks to more than 60 MB. Leave out videos and very large images.",
          );
        return true;
      },
    });
  } catch (e) {
    const m = (e as Error).message;
    throw new Error(
      /60 MB/.test(m) ? m : "That zip file couldn't be opened. Try zipping the folder again.",
    );
  }
  return bundleFromFiles(unzipped, { label });
}

/** A page read from its address (its stylesheets and images are fetched as they're needed). */
export async function bundleFromUrl(url: string, fetchFn: FetchFn): Promise<HtmlBundle> {
  let u: URL;
  try {
    u = new URL(url.includes("://") ? url : `https://${url}`);
  } catch {
    throw new Error(`"${url}" isn't a web address.`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new Error("Use the page's web address, starting with https://.");
  const res = await fetchFn(u.toString(), { redirect: "follow" } as RequestInit);
  if (!res.ok) throw new Error(`Couldn't read ${u.toString()} (HTTP ${res.status}).`);
  const html = await res.text();
  const finalUrl = res.url || u.toString();
  return {
    files: new Map([["index.html", encoder.encode(html)]]),
    entry: "index.html",
    siteUrl: finalUrl,
    label: new URL(finalUrl).host + new URL(finalUrl).pathname.replace(/\/$/, ""),
  };
}

/** Bundle path → the URL the importer uses for it. */
export const bundleUrl = (path: string) =>
  `${BUNDLE_ORIGIN}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** The bundle path a URL points into (undefined for other hosts). */
export function bundlePathOf(url: string): string | undefined {
  if (!url.startsWith(`${BUNDLE_ORIGIN}/`)) return undefined;
  try {
    return normalizePath(decodeURIComponent(new URL(url).pathname));
  } catch {
    return undefined;
  }
}

/**
 * Where a reference in a page (`src`, `href`, CSS `url()`) points: a bundle file's URL, or an
 * absolute web address. `data:` images become small bundle files. Undefined when it leads
 * nowhere (`#`, `javascript:`, a missing file).
 */
export function resolveRef(bundle: HtmlBundle, ref: string, fromPath: string): string | undefined {
  const r = ref.trim();
  if (!r || r.startsWith("#") || /^(?:javascript|about|blob):/i.test(r)) return undefined;
  const data = /^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml|avif));(base64)?,(.*)$/is.exec(r);
  if (data) {
    const mime = (data[1] as string).toLowerCase();
    const ext = mime.includes("svg")
      ? "svg"
      : (mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png");
    let bytes: Uint8Array;
    try {
      bytes = data[2]
        ? Uint8Array.from(atob((data[3] as string).replace(/\s+/g, "")), (c) => c.charCodeAt(0))
        : encoder.encode(decodeURIComponent(data[3] as string));
    } catch {
      return undefined;
    }
    let n = bundle.files.size + 1;
    while (bundle.files.has(`inline/image-${n}.${ext}`)) n++;
    const path = `inline/image-${n}.${ext}`;
    bundle.files.set(path, bytes);
    return bundleUrl(path);
  }
  if (/^(?:mailto|tel):/i.test(r)) return r;
  if (bundle.siteUrl) {
    try {
      return new URL(r, bundle.siteUrl).toString();
    } catch {
      return undefined;
    }
  }
  if (/^https?:\/\//i.test(r) || r.startsWith("//")) return r.startsWith("//") ? `https:${r}` : r;
  const clean = r.split(/[?#]/)[0] as string;
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    // keep as written
  }
  const candidates: string[] = [];
  if (decoded.startsWith("/")) {
    // Root-relative in a built site served from a sub-path (`/powerwith/_astro/x.css`): try the
    // path, then without leading folders until a file matches.
    const segs = normalizePath(decoded).split("/");
    for (let i = 0; i < segs.length; i++) candidates.push(segs.slice(i).join("/"));
    if (decoded.endsWith("/")) candidates.push("");
  } else {
    const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/") + 1) : "";
    candidates.push(normalizePath(dir + decoded));
    candidates.push(normalizePath(decoded));
  }
  for (const c of candidates) {
    if (c === "") {
      if (bundle.files.has("index.html")) return bundleUrl("index.html");
      continue;
    }
    if (bundle.files.has(c)) return bundleUrl(c);
    if (bundle.files.has(`${c}/index.html`)) return bundleUrl(`${c}/index.html`);
    if (bundle.files.has(`${c}.html`)) return bundleUrl(`${c}.html`);
  }
  return undefined;
}

/** A fetch that serves bundle files and passes everything else to `net` (when given). */
export function bundleFetch(bundle: HtmlBundle, net?: FetchFn): FetchFn {
  return async (input: string, init?: RequestInit) => {
    const url = String(input);
    const path = bundlePathOf(url);
    if (path !== undefined) {
      const bytes = bundle.files.get(path);
      if (!bytes) return new Response("Not found", { status: 404 });
      return new Response(bytes as unknown as BodyInit, {
        status: 200,
        headers: { "content-type": mimeOf(path) },
      });
    }
    if (!net) return new Response("Offline", { status: 503 });
    return net(url, init);
  };
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
  mp4: "video/mp4",
};

export function mimeOf(path: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
