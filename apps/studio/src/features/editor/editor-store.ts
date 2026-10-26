import { create } from "zustand";

/**
 * Editor UI state (chrome: panels, device, zoom, panning). The document, page, selection,
 * hover and undo history live in the per-site document store (`model/store.ts`).
 */
export type LeftPanel =
  | "pages"
  | "layers"
  | "add"
  | "styles"
  | "media"
  | "chrome"
  | "check"
  | "looks";
export type Breakpoint = "desktop" | "tablet" | "mobile";
export type Zoom = "fit" | number;

/** Device preview widths (Global Constraint 7). */
export const DEVICE_WIDTHS: Record<Breakpoint, number> = {
  desktop: 1440,
  tablet: 834,
  mobile: 390,
};
export const DEVICE_HEIGHTS: Record<Breakpoint, number> = {
  desktop: 960,
  tablet: 1112,
  mobile: 844,
};
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export interface EditorUiState {
  leftPanel: LeftPanel | null;
  inspectorOpen: boolean;
  /** Figma's ⌘\: hide all panels to see just the page. */
  chromeHidden: boolean;
  breakpoint: Breakpoint;
  zoom: Zoom;
  /** Scale actually used when zoom is "fit" (reported by the canvas). */
  fitScale: number;
  /** Space is held: dragging pans the canvas. */
  panning: boolean;
  /** The `?` keyboard shortcuts sheet. */
  shortcutsOpen: boolean;
  /**
   * Tablets and small laptops (768–1099 px): one side panel at a time, so the canvas keeps a
   * usable size. Opening the left panel closes the inspector and the reverse.
   */
  onePanel: boolean;
  setOnePanel: (on: boolean) => void;
  /** Something was picked on the canvas: in one-panel mode, show the inspector instead of the left panel. */
  revealInspector: () => void;
  toggleLeftPanel: (panel: LeftPanel) => void;
  setLeftPanel: (panel: LeftPanel | null) => void;
  /** Open a left panel from anywhere (shows hidden chrome; the one-panel rule applies). */
  showLeftPanel: (panel: LeftPanel) => void;
  toggleInspector: () => void;
  toggleChrome: () => void;
  setBreakpoint: (bp: Breakpoint) => void;
  setZoom: (zoom: Zoom) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFitScale: (s: number) => void;
  setPanning: (panning: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  reset: () => void;
}

const initial = {
  leftPanel: "pages" as LeftPanel | null,
  inspectorOpen: true,
  chromeHidden: false,
  breakpoint: "desktop" as Breakpoint,
  zoom: "fit" as Zoom,
  fitScale: 1,
  panning: false,
  shortcutsOpen: false,
  onePanel: false,
};

export function effectiveZoom(s: Pick<EditorUiState, "zoom" | "fitScale">): number {
  return s.zoom === "fit" ? s.fitScale : s.zoom;
}

export const useEditorUi = create<EditorUiState>((set, get) => ({
  ...initial,
  toggleLeftPanel: (panel) =>
    set((s) => {
      const leftPanel = s.leftPanel === panel && !s.chromeHidden ? null : panel;
      return {
        leftPanel,
        chromeHidden: false,
        ...(s.onePanel && leftPanel ? { inspectorOpen: false } : {}),
      };
    }),
  setLeftPanel: (leftPanel) =>
    set((s) => ({ leftPanel, ...(s.onePanel && leftPanel ? { inspectorOpen: false } : {}) })),
  showLeftPanel: (leftPanel) =>
    set((s) => ({
      leftPanel,
      chromeHidden: false,
      ...(s.onePanel ? { inspectorOpen: false } : {}),
    })),
  toggleInspector: () =>
    set((s) => {
      const inspectorOpen = !s.inspectorOpen;
      return { inspectorOpen, ...(s.onePanel && inspectorOpen ? { leftPanel: null } : {}) };
    }),
  setOnePanel: (onePanel) =>
    set((s) =>
      // Entering one-panel mode with both open keeps the inspector.
      onePanel && s.leftPanel && s.inspectorOpen ? { onePanel, leftPanel: null } : { onePanel },
    ),
  revealInspector: () =>
    set((s) =>
      // Desktop keeps the person's own choice (a closed inspector stays closed).
      s.onePanel ? { inspectorOpen: true, leftPanel: null, chromeHidden: false } : {},
    ),
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
  setPanning: (panning) => {
    if (get().panning !== panning) set({ panning });
  },
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  // The viewport rule survives a reset (it describes the window, not this editor session).
  reset: () => set((s) => ({ ...initial, onePanel: s.onePanel })),
}));
