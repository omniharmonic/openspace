import type { ReactNode } from "react";
import { create } from "zustand";

export type ToastTone = "neutral" | "success" | "danger" | "celebrate";

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** Keep the toast open after the action runs (e.g. "Copy link"). */
  keepOpen?: boolean;
}

export interface ToastItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  tone: ToastTone;
  action?: ToastAction;
  /** Milliseconds; `Infinity` keeps it until dismissed. */
  duration: number;
}

export type ToastInput = Omit<ToastItem, "id" | "tone" | "duration"> &
  Partial<Pick<ToastItem, "tone" | "duration" | "id">>;

interface ToastState {
  toasts: ToastItem[];
  push: (t: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? `toast-${++counter}`;
    const item: ToastItem = { tone: "neutral", duration: 5000, ...t, id };
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), item].slice(-4) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Shows a toast from anywhere (no hook needed). Returns its id. */
export function toast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}
