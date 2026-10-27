import type { Position } from "@omniharmonic/openspace-ops";
import { create } from "zustand";

/** Where the block menu inserts: a section, optionally a stack column and an anchor block. */
export interface BlockTarget {
  section: string;
  column?: number;
  after?: string;
}

interface BlockMenuState {
  open: boolean;
  /** Explicit target; when absent the menu inserts next to the current selection. */
  target: BlockTarget | null;
  openFor: (target?: BlockTarget | null) => void;
  close: () => void;
}

export const useBlockMenu = create<BlockMenuState>((set) => ({
  open: false,
  target: null,
  openFor: (target = null) => set({ open: true, target }),
  close: () => set({ open: false, target: null }),
}));

interface AddSectionState {
  /** The gallery dialog (from a canvas "+"), with the position to insert at. */
  open: boolean;
  at: Position | null;
  openAt: (at: Position) => void;
  close: () => void;
}

export const useAddSection = create<AddSectionState>((set) => ({
  open: false,
  at: null,
  openAt: (at) => set({ open: true, at }),
  close: () => set({ open: false, at: null }),
}));
