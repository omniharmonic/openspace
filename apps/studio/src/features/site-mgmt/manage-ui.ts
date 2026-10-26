import { useParams } from "react-router";
import { create } from "zustand";
import { useSite } from "../../api";
import type { Site } from "../../api/types";

/**
 * UI state for the site-management surfaces (dialogs that can be opened from anywhere: the
 * pages panel, ⌘K, the canvas). Settings themselves are a route (`/sites/:id/settings/:tab`).
 */
export interface MediaPickRequest {
  title: string;
  /** Only images (default) or any file. */
  accept?: "image" | "any";
  onPick: (path: string) => void;
}

interface ManageUiState {
  pageSettings: string | null;
  addPage: { after?: string } | null;
  mediaDetails: string | null;
  mediaPick: MediaPickRequest | null;
  openPageSettings: (pageId: string | null) => void;
  openAddPage: (opts?: { after?: string } | null) => void;
  openMediaDetails: (path: string | null) => void;
  pickMedia: (req: MediaPickRequest | null) => void;
  reset: () => void;
}

const initial = { pageSettings: null, addPage: null, mediaDetails: null, mediaPick: null };

export const useManageUi = create<ManageUiState>((set) => ({
  ...initial,
  openPageSettings: (pageSettings) => set({ pageSettings }),
  openAddPage: (opts = {}) => set({ addPage: opts }),
  openMediaDetails: (mediaDetails) => set({ mediaDetails }),
  pickMedia: (mediaPick) => set({ mediaPick }),
  reset: () => set(initial),
}));

/** The site being edited (from the `/sites/:id/*` route; served from the query cache). */
export function useCurrentSite(): Site | undefined {
  const { id } = useParams();
  return useSite(id).data;
}

export type Capability = "designer" | "owner" | "editor";

/**
 * What the signed-in person may do here (the Hub enforces the same rules). An unknown role gets
 * the least privilege: nothing beyond viewing.
 */
export function can(site: Site | undefined, need: Capability): boolean {
  const role = site?.role;
  if (!role) return false;
  if (need === "owner") return role === "owner";
  if (need === "designer") return role === "owner" || role === "designer";
  return role !== "contributor";
}
