import { BUTTON_STYLES, COLOR_THEMES } from "@omniharmonic/openspace-schema";
import { contrastRatio, type ThemeColorSet } from "./contrast";
import { BUTTON_ROLES, buttonTokens } from "./layout";
import type { ThemeRole } from "./types";

const SURFACES = ["background", "surface", "surface-raised"] as const;

/**
 * The colors a fill paints: one `var(--os-color-<role>)`, or every stop of a gradient of them
 * (same-hue steps, so the label passing on each stop passes in between); `transparent` → null.
 */
function fills(value: string, colors: Record<ThemeRole, string>): string[] | null {
  if (value === "transparent") return null;
  if (value.startsWith("linear-gradient(")) {
    const stops = [...value.matchAll(/var\(--os-color-[a-z-]+\)/g)].map((m) => m[0]);
    if (!stops.length) throw new Error(`Unresolvable button gradient: ${value}`);
    return stops.map((v) => resolve(v, colors));
  }
  return [resolve(value, colors)];
}

/** Resolve `var(--os-color-<role>)` against a theme. */
function resolve(value: string, colors: Record<ThemeRole, string>): string {
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
          const label = resolve(fg, colors);
          const grounds = fills(bg, colors) ?? SURFACES.map((s) => colors[s]);
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
