import type { ImageMap, ResolvedImage } from "@openspace/renderer";
import type { SiteDocument } from "@openspace/schema";
import { useMemo } from "react";
import { create } from "zustand";

/**
 * Where Studio can show a media file from. Files uploaded in this session (or waiting in the
 * queue) show from local object URLs instantly; everything else comes from the site's draft
 * files: through the Hub's draft media proxy (`<hub>/api/sites/:id/media/…`, session cookie) when
 * the Hub client offers one — this also covers dev mode and private site files — else
 * `raw.githubusercontent.com/<site files>/os/draft/<path>` (site files are public, FR-5).
 */
interface MediaSourcesState {
  /** "owner/name" of the site's files, and the draft branch. */
  repo: string | null;
  branch: string;
  /** URL prefix of the Hub's draft media proxy for this site (`…/api/sites/:id/`), if any. */
  remote: string | null;
  local: Record<string, string>;
  setRepo: (repo: string | null, branch?: string) => void;
  setRemote: (remote: string | null) => void;
  addLocal: (path: string, blob: Blob) => string;
  reset: () => void;
}

/** Bytes of files added in this session (for dedupe by full hash without a download). */
const localBlobs = new Map<string, Blob>();

/** Read a library file's bytes: this session's copy, else the site's draft files. */
export async function readMediaBytes(path: string): Promise<Uint8Array | null> {
  const blob = localBlobs.get(path);
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  const state = useMediaSources.getState();
  const url = previewUrl(path, state);
  if (url === path || typeof fetch !== "function") return null;
  try {
    const res = await fetch(url, mediaFetchInit(url));
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export const useMediaSources = create<MediaSourcesState>((set, get) => ({
  repo: null,
  branch: "os/draft",
  remote: null,
  local: {},
  setRepo: (repo, branch = "os/draft") => set({ repo, branch }),
  setRemote: (remote) => set({ remote }),
  addLocal: (path, blob) => {
    localBlobs.set(path, blob);
    const existing = get().local[path];
    if (existing) return existing;
    const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : path;
    set((s) => ({ local: { ...s.local, [path]: url } }));
    return url;
  },
  reset: () => {
    for (const url of Object.values(get().local))
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    set({ repo: null, remote: null, local: {} });
  },
}));

type SourceState = Pick<MediaSourcesState, "repo" | "branch" | "local"> &
  Partial<Pick<MediaSourcesState, "remote">>;

export function previewUrl(src: string, state: SourceState): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const local = state.local[src];
  if (local) return local;
  if (state.remote) return `${state.remote}${src}`;
  if (state.repo) return `https://raw.githubusercontent.com/${state.repo}/${state.branch}/${src}`;
  return src;
}

/** `fetch` options for a media URL: the Hub proxy needs the session cookie. */
export function mediaFetchInit(url: string): RequestInit {
  const remote = useMediaSources.getState().remote;
  return remote && url.startsWith(remote) ? { credentials: "include" } : {};
}

export function useMediaPreviewUrl(src: string | null | undefined): string | null {
  const repo = useMediaSources((s) => s.repo);
  const branch = useMediaSources((s) => s.branch);
  const remote = useMediaSources((s) => s.remote);
  const local = useMediaSources((s) => (src ? s.local[src] : undefined));
  if (!src) return null;
  return previewUrl(src, { repo, branch, remote, local: local ? { [src]: local } : {} });
}

/** Image map for the canvas so library files (and fresh uploads) show while editing. */
export function useCanvasImageMap(media: SiteDocument["media"]): ImageMap {
  const repo = useMediaSources((s) => s.repo);
  const branch = useMediaSources((s) => s.branch);
  const remote = useMediaSources((s) => s.remote);
  const local = useMediaSources((s) => s.local);
  return useMemo(() => {
    const map: Record<string, ResolvedImage> = {};
    for (const [path, meta] of Object.entries(media)) {
      if (meta.kind !== "image" || !meta.width || !meta.height) continue;
      if (!local[path] && !repo && !remote) continue;
      map[path] = {
        src: previewUrl(path, { repo, branch, remote, local }),
        width: meta.width,
        height: meta.height,
        ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
      };
    }
    return map;
  }, [media, repo, branch, remote, local]);
}
