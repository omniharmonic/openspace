import { Monitor, Moon, Sun } from "lucide-react";
import { IconButton } from "../ui";
import { nextTheme, useThemeStore } from "./theme";

const LABEL = {
  system: "Theme: match system",
  light: "Theme: light",
  dark: "Theme: dark",
} as const;
const ICON = { system: <Monitor />, light: <Sun />, dark: <Moon /> } as const;

export function ThemeButton() {
  const pref = useThemeStore((s) => s.preference);
  const set = useThemeStore((s) => s.setPreference);
  return <IconButton label={LABEL[pref]} icon={ICON[pref]} onClick={() => set(nextTheme(pref))} />;
}
