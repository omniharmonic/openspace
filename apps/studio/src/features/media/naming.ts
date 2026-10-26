import { MEDIA_PATH_RE, type SiteDocument } from "@openspace/schema";

/** Characters of the content hash used in file names (32 bits of SHA-256). */
export const NAME_HASH_LENGTH = 8;

/** Hex SHA-256 of some bytes (Web Crypto). */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A file name as a short URL-safe slug: `IMG_2041 (1).HEIC` → `img-2041-1`. */
export function slugifyName(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const slug = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "image";
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** File extension for a MIME type (falls back to the original name's extension, then `bin`). */
export function extFor(mime: string, originalName = ""): string {
  const known = EXT[mime.toLowerCase()];
  if (known) return known;
  const fromName = /\.([A-Za-z0-9]{1,5})$/.exec(originalName)?.[1]?.toLowerCase();
  return fromName ?? "bin";
}

/**
 * `media/YYYY/MM/<slug>-<hash>.<ext>` (arch §5.6). The hash is the start of the SHA-256 of the
 * final bytes, so the same picture always gets the same name and can be deduped.
 */
export function mediaPathFor(input: {
  name: string;
  sha256: string;
  mime: string;
  date: Date;
}): string {
  const yyyy = String(input.date.getUTCFullYear());
  const mm = String(input.date.getUTCMonth() + 1).padStart(2, "0");
  const ext = extFor(input.mime, input.name);
  const path = `media/${yyyy}/${mm}/${slugifyName(input.name)}-${input.sha256.slice(0, NAME_HASH_LENGTH)}.${ext}`;
  if (!MEDIA_PATH_RE.test(path)) throw new Error(`Couldn't name ${input.name}`);
  return path;
}

/** The content hash embedded in a media path, if it follows the naming scheme. */
export function hashOfPath(path: string): string | null {
  return new RegExp(`-([0-9a-f]{${NAME_HASH_LENGTH}})\\.[a-z0-9]+$`).exec(path)?.[1] ?? null;
}

/** An existing media file with the same content hash (dedupe), if any. */
export function findDuplicate(media: SiteDocument["media"], sha256: string): string | null {
  const short = sha256.slice(0, NAME_HASH_LENGTH);
  for (const path of Object.keys(media)) if (hashOfPath(path) === short) return path;
  return null;
}
