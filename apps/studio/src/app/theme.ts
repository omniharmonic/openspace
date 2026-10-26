import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist((set) => ({ preference: "system", setPreference: (preference) => set({ preference }) }), {
    name: "openspace.studio.theme",
  }),
);

function systemDark() {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return systemDark() ? "dark" : "light";
  return pref;
}

/** Keeps `<html data-theme>` in sync with the preference and the OS setting. */
export function useThemeSync() {
  const preference = useThemeStore((s) => s.preference);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference);
    };
    apply();
    if (preference !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [preference]);
}

export function nextTheme(pref: ThemePreference): ThemePreference {
  return pref === "system" ? "light" : pref === "light" ? "dark" : "system";
}
