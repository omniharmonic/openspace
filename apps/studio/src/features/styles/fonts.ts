import { type CustomFont, newId, type Styles } from "@omniharmonic/openspace-schema";
import { customFontFaces } from "@omniharmonic/openspace-theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { sha256Hex, slugifyName } from "../media/naming";
import { previewUrl, readMediaBytes, useMediaSources } from "../media/sources";

/**
 * Uploaded fonts (PRD §5.1): what Studio needs to add a licensed font to Site Styles and show it
 * in the canvas.
 */

export const FONT_EXT_MIME = { woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as const;
export type FontExt = keyof typeof FONT_EXT_MIME;
export const FONT_ACCEPT = ".woff2,.ttf,.otf,font/woff2,font/ttf,font/otf";
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

/** The font format from the file's own bytes (never its name), or null. */
export function sniffFontExt(head: Uint8Array): FontExt | null {
  const tag = String.fromCharCode(...head.subarray(0, 4));
  if (tag === "wOF2") return "woff2";
  if (tag === "OTTO") return "otf";
  if (tag === "true" || (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0))
    return "ttf";
  return null;
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/thin|hairline/i, 100],
  [/extra-?light|ultra-?light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi-?bold|demi-?bold/i, 600],
  [/extra-?bold|ultra-?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
];

/** Weight and style guessed from a file name (`Grotesk-SemiBoldItalic.woff2` → 600 italic). */
export function guessFace(name: string): { weight: number; style: "normal" | "italic" } {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const numeric = /(?:^|[^0-9])([1-9]00)(?:[^0-9]|$)/.exec(base)?.[1];
  const word = WEIGHT_WORDS.find(([re]) => re.test(base))?.[1];
  return {
    weight: numeric ? Number(numeric) : (word ?? 400),
    style: /italic|oblique/i.test(base) ? "italic" : "normal",
  };
}

/** A family name from a file name (`StudioGrotesk-Bold.woff2` → `Studio Grotesk`). */
export function guessFamily(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-_]/)[0]
    ?.replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base?.slice(0, 60) || "My font";
}

export interface PreparedFontFile {
  path: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
  weight: number;
  style: "normal" | "italic";
  name: string;
}

/** Check a file and name it `media/fonts/<family>-<weight>[i]-<hash>.<ext>`. */
export async function prepareFontFile(
  file: File,
  family: string,
  face: { weight: number; style: "normal" | "italic" },
): Promise<PreparedFontFile> {
  if (file.size > MAX_FONT_BYTES) throw new Error(`${file.name} is larger than 5 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffFontExt(bytes);
  if (!ext) throw new Error(`${file.name} isn't a WOFF2, TTF or OTF font.`);
  const sha256 = await sha256Hex(bytes);
  const slug = slugifyName(family) || "font";
  return {
    path: `media/fonts/${slug}-${face.weight}${face.style === "italic" ? "i" : ""}-${sha256.slice(0, 8)}.${ext}`,
    mime: FONT_EXT_MIME[ext],
    bytes,
    sha256,
    weight: face.weight,
    style: face.style,
    name: file.name,
  };
}

/** The `media.add` metadata for an uploaded font file. */
export function fontMediaMeta(f: PreparedFontFile, now: Date) {
  return {
    id: newId("med"),
    path: f.path,
    kind: "file" as const,
    mime: f.mime,
    bytes: f.bytes.length,
    originalName: f.name.slice(0, 255),
    license: "Web use confirmed by the uploader",
    createdAt: now.toISOString(),
  };
}

/** Add (or replace, by family) an uploaded font in Site Styles. */
export function withFont(fonts: readonly CustomFont[] | undefined, font: CustomFont): CustomFont[] {
  const key = font.family.toLowerCase();
  const kept = (fonts ?? []).filter((f) => f.family.toLowerCase() !== key);
  return [...kept, font];
}

/**
 * `@font-face` CSS for every uploaded font, with URLs Studio can load: this session's copies,
 * or the bytes read from the site's draft files (object URLs; the Hub proxy needs the session
 * cookie, which @font-face requests don't send).
 */
export function useCustomFontCss(styles: Styles): string {
  const local = useMediaSources((s) => s.local);
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  /** Files being read (each is read once, however often the effect re-runs). */
  const pending = useRef(new Set<string>());
  const files = useMemo(
    () => (styles.fonts ?? []).flatMap((f) => f.files.map((x) => x.src)),
    [styles.fonts],
  );
  const mounted = useRef(true);
  useEffect(() => {
    for (const src of files) {
      if (local[src] || loaded[src] || pending.current.has(src)) continue;
      pending.current.add(src);
      void readMediaBytes(src).then((bytes) => {
        pending.current.delete(src);
        if (!mounted.current || !bytes || typeof URL.createObjectURL !== "function") return;
        const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]));
        setLoaded((prev) => ({ ...prev, [src]: url }));
      });
    }
    // Fonts removed from Site Styles: free their copies.
    const gone = Object.keys(loaded).filter((src) => !files.includes(src));
    if (gone.length) {
      for (const src of gone) URL.revokeObjectURL(loaded[src] as string);
      setLoaded((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => files.includes(k))),
      );
    }
  }, [files, local, loaded]);
  // Free every copy when the canvas or panel goes away.
  const latest = useRef(loaded);
  latest.current = loaded;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const url of Object.values(latest.current)) URL.revokeObjectURL(url);
    };
  }, []);
  return useMemo(
    () =>
      customFontFaces(
        styles,
        (src) => local[src] ?? loaded[src] ?? previewUrl(src, useMediaSources.getState()),
        { all: true },
      ),
    [styles, local, loaded],
  );
}
