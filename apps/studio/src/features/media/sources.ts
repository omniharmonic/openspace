import type { ImageMap, ResolvedImage } from "@openspace/renderer";
import type { SiteDocument } from "@openspace/schema";
import { useMemo } from "react";
import { create } from "zustand";

/**
 * Where Studio can show a media file from. Files uploaded in this session (or waiting in the
 * queue) show from local object URLs instantly; everything else comes from the site's draft
 * files (`raw.githubusercontent.com/<site files>/os/draft/<path>`; site files are public, FR-5).
 */
interface MediaSourcesState {
  /** "owner/name" of the site's files, and the draft branch. */
  repo: string | null;
  branch: string;
  local: Record<string, string>;
  setRepo: (repo: string | null, branch?: string) => void;
  addLocal: (path: string, blob: Blob) => string;
  reset: () => void;
}

export const useMediaSources = create<MediaSourcesState>((set, get) => ({
  repo: null,
  branch: "os/draft",
  local: {},
  setRepo: (repo, branch = "os/draft") => set({ repo, branch }),
  addLocal: (path, blob) => {
    const existing = get().local[path];
    if (existing) return existing;
    const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : path;
    set((s) => ({ local: { ...s.local, [path]: url } }));
    return url;
  },
  reset: () => {
    for (const url of Object.values(get().local))
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    set({ repo: null, local: {} });
  },
}));

export function previewUrl(
  src: string,
  state: Pick<MediaSourcesState, "repo" | "branch" | "local">,
): string {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const local = state.local[src];
  if (local) return local;
  if (state.repo) return `https://raw.githubusercontent.com/${state.repo}/${state.branch}/${src}`;
  return src;
}

export function useMediaPreviewUrl(src: string | null | undefined): string | null {
  const repo = useMediaSources((s) => s.repo);
  const branch = useMediaSources((s) => s.branch);
  const local = useMediaSources((s) => (src ? s.local[src] : undefined));
  if (!src) return null;
  return previewUrl(src, { repo, branch, local: local ? { [src]: local } : {} });
}

/** Image map for the canvas so library files (and fresh uploads) show while editing. */
export function useCanvasImageMap(media: SiteDocument["media"]): ImageMap {
  const repo = useMediaSources((s) => s.repo);
  const branch = useMediaSources((s) => s.branch);
  const local = useMediaSources((s) => s.local);
  return useMemo(() => {
    const map: Record<string, ResolvedImage> = {};
    for (const [path, meta] of Object.entries(media)) {
      if (meta.kind !== "image" || !meta.width || !meta.height) continue;
      if (!local[path] && !repo) continue;
      map[path] = {
        src: previewUrl(path, { repo, branch, local }),
        width: meta.width,
        height: meta.height,
        ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
      };
    }
    return map;
  }, [media, repo, branch, local]);
}
