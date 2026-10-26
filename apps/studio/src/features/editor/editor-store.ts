import { create } from "zustand";

/**
 * Editor UI state (chrome only). Task 20 extends this store with the
 * SiteDocument, selection and the ops-based undo stack.
 */
export type LeftPanel = "pages" | "layers" | "add" | "styles" | "media";
export type Breakpoint = "desktop" | "tablet" | "mobile";
export type Zoom = "fit" | number;

/** Device preview widths (Global Constraint 7). */
export const DEVICE_WIDTHS: Record<Breakpoint, number> = { desktop: 1440, tablet: 834, mobile: 390 };
export const DEVICE_HEIGHTS: Record<Breakpoint, number> = { desktop: 960, tablet: 1112, mobile: 844 };
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2] as const;

export interface EditorUiState {
  leftPanel: LeftPanel | null;
  inspectorOpen: boolean;
  /** Figma's ⌘\: hide all panels to see just the page. */
  chromeHidden: boolean;
  breakpoint: Breakpoint;
  zoom: Zoom;
  /** Scale actually used when zoom is "fit" (reported by the canvas). */
  fitScale: number;
  toggleLeftPanel: (panel: LeftPanel) => void;
  setLeftPanel: (panel: LeftPanel | null) => void;
  toggleInspector: () => void;
  toggleChrome: () => void;
  setBreakpoint: (bp: Breakpoint) => void;
  setZoom: (zoom: Zoom) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFitScale: (s: number) => void;
  reset: () => void;
}

const initial = {
  leftPanel: "pages" as LeftPanel | null,
  inspectorOpen: true,
  chromeHidden: false,
  breakpoint: "desktop" as Breakpoint,
  zoom: "fit" as Zoom,
  fitScale: 1,
};

export function effectiveZoom(s: Pick<EditorUiState, "zoom" | "fitScale">): number {
  return s.zoom === "fit" ? s.fitScale : s.zoom;
}

export const useEditorUi = create<EditorUiState>((set, get) => ({
  ...initial,
  toggleLeftPanel: (panel) =>
    set((s) => ({ leftPanel: s.leftPanel === panel && !s.chromeHidden ? null : panel, chromeHidden: false })),
  setLeftPanel: (leftPanel) => set({ leftPanel }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleChrome: () => set((s) => ({ chromeHidden: !s.chromeHidden })),
  setBreakpoint: (breakpoint) => set({ breakpoint, zoom: "fit" }),
  setZoom: (zoom) => set({ zoom }),
  zoomIn: () => {
    const z = effectiveZoom(get());
    set({ zoom: ZOOM_STEPS.find((step) => step > z + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1] });
  },
  zoomOut: () => {
    const z = effectiveZoom(get());
    set({ zoom: [...ZOOM_STEPS].reverse().find((step) => step < z - 0.001) ?? ZOOM_STEPS[0] });
  },
  setFitScale: (fitScale) => set({ fitScale }),
  reset: () => set(initial),
}));
