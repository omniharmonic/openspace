import { type ReactNode, useEffect, useRef } from "react";
import { create } from "zustand";

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

interface CommandState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  sources: Record<string, PaletteCommand[]>;
  register: (source: string, commands: PaletteCommand[]) => void;
  unregister: (source: string) => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  sources: {},
  register: (source, commands) => set((s) => ({ sources: { ...s.sources, [source]: commands } })),
  unregister: (source) =>
    set((s) => {
      const { [source]: _removed, ...rest } = s.sources;
      return { sources: rest };
    }),
}));

export function allCommands(sources: Record<string, PaletteCommand[]>): PaletteCommand[] {
  return Object.values(sources).flat();
}

/**
 * Registers commands with the palette while the calling component is mounted.
 * `commands` may change every render; the latest `run` is always used.
 */
export function useRegisterCommands(source: string, commands: PaletteCommand[]) {
  const latest = useRef(commands);
  latest.current = commands;
  const signature = commands.map((c) => `${c.id}:${c.label}:${c.group}:${c.shortcut ?? ""}`).join("|");
  useEffect(() => {
    const wrapped = latest.current.map((c) => ({
      ...c,
      run: () => latest.current.find((x) => x.id === c.id)?.run(),
    }));
    useCommandStore.getState().register(source, wrapped);
    return () => useCommandStore.getState().unregister(source);
    // biome-ignore lint/correctness/useExhaustiveDependencies: signature captures command identity
  }, [source, signature]);
}
