import { BUTTON_STYLES, COLOR_THEMES } from "@omniharmonic/openspace-schema";
import { contrastRatio, type ThemeColorSet } from "./contrast";
import { BUTTON_ROLES, buttonTokens } from "./layout";
import type { ThemeRole } from "./types";

const SURFACES = ["background", "surface", "surface-raised"] as const;

/** Resolve `var(--os-color-<role>)` against a theme; `transparent` → null (sits on a surface). */
function resolve(value: string, colors: Record<ThemeRole, string>): string | null {
  if (value === "transparent") return null;
  const m = /^var\(--os-color-([a-z-]+)\)$/.exec(value);
  if (!m?.[1]) throw new Error(`Unresolvable button color: ${value}`);
  const color = colors[m[1] as ThemeRole];
  if (!color) throw new Error(`Unknown role in button color: ${value}`);
  return color;
}

/**
 * Every button style × role × state (rest, hover, pressed) × theme whose label falls under
 * `min` against its fill (or, for transparent buttons, against any section surface).
 */
export function buttonContrastFailures(themes: ThemeColorSet, min = 4.5): string[] {
  const failures: string[] = [];
  for (const style of BUTTON_STYLES) {
    const tokens = buttonTokens(style);
    for (const role of BUTTON_ROLES) {
      const t = tokens[role];
      for (const [state, bg, fg] of [
        ["rest", t.bg, t.color],
        ["hover", t["bg-hover"], t["color-hover"]],
        ["pressed", t["bg-active"], t["color-active"]],
      ] as const) {
        for (const theme of COLOR_THEMES) {
          const colors = themes[theme];
          const label = resolve(fg, colors) as string;
          const fill = resolve(bg, colors);
          const grounds = fill ? [fill] : SURFACES.map((s) => colors[s]);
          for (const ground of grounds) {
            const ratio = contrastRatio(label, ground);
            if (ratio < min) {
              failures.push(
                `${theme} ${style}/${role}/${state}: ${label} on ${ground} = ${ratio.toFixed(2)}`,
              );
            }
          }
        }
      }
    }
  }
  return failures;
}
