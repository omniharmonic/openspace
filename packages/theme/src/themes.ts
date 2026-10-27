import { COLOR_ROLES, COLOR_THEMES, type ColorTheme } from "@omniharmonic/openspace-schema";
import { gamutMap, type Oklch, oklchToHex, parseColor } from "./color";
import {
  CONTRAST_MINIMUMS,
  CORE_CONTRAST_PAIRS,
  type ContrastMode,
  type ContrastPair,
  contrastRatio,
  type Direction,
  relativeLuminance,
  STATE_PAIRS,
  solveLightness,
  type ThemeColorSet,
} from "./contrast";
import { accentScale, type NeutralTint, neutralScale } from "./scales";
import {
  type ColorRole,
  type ColorScale,
  STATE_ROLES,
  type StateRole,
  type ThemeRole,
} from "./types";

export interface PaletteInput {
  brand: string;
  neutral: NeutralTint;
  contrast?: ContrastMode;
}

export interface Palette {
  brand: Oklch;
  accent: ColorScale<Oklch>;
  neutral: ColorScale<Oklch>;
}

export function buildPalette(brand: string | Oklch, neutral: NeutralTint): Palette {
  const b = gamutMap(typeof brand === "string" ? parseColor(brand) : brand);
  return { brand: b, accent: accentScale(b), neutral: neutralScale(b, neutral) };
}

type RoleSet = Record<ColorRole, Oklch>;

const WHITE: Oklch = { l: 1, c: 0, h: 0 };
const BLACK: Oklch = { l: 0, c: 0, h: 0 };
const STATUS_HUE = { success: 150, warning: 70, danger: 27 } as const;
const status = (l: number, c = 0.14) => ({
  success: { l, c, h: STATUS_HUE.success },
  warning: { l, c, h: STATUS_HUE.warning },
  danger: { l, c: c + 0.04, h: STATUS_HUE.danger },
});

/** Pick the candidate with the highest contrast against `bg`. */
export function bestOn(bg: Oklch, candidates: Oklch[]): Oklch {
  let best = candidates[0] as Oklch;
  for (const c of candidates) if (contrastRatio(c, bg) > contrastRatio(best, bg)) best = c;
  return best;
}

/** Label color for text sitting on `bg`: white or the darkest neutral, whichever contrasts more. */
export function onColor(bg: Oklch, palette: Palette): Oklch {
  return bestOn(bg, [WHITE, palette.neutral[950]]);
}

const shift = (c: Oklch, dl: number): Oklch => gamutMap({ ...c, l: c.l + dl });

/** The un-solved role sets for each section theme (doc 04 §3.2). */
export function themeRoles(palette: Palette): Record<ColorTheme, RoleSet> {
  const { accent: a, neutral: n, brand } = palette;
  const onAccent = (bg: Oklch) => onColor(bg, palette);

  const light: RoleSet = {
    background: n[50],
    surface: n[100],
    "surface-raised": WHITE,
    text: n[900],
    "text-muted": n[600],
    heading: n[950],
    accent: brand,
    "accent-text": onAccent(brand),
    border: n[200],
    focus: a[600],
    link: a[700],
    ...status(0.5),
  };

  const lightAccent: RoleSet = {
    background: a[50],
    surface: a[100],
    "surface-raised": n[50],
    text: n[900],
    "text-muted": n[700],
    heading: n[950],
    accent: a[600],
    "accent-text": onAccent(a[600]),
    border: a[200],
    focus: a[700],
    link: a[700],
    ...status(0.48),
  };

  const dark: RoleSet = {
    background: n[950],
    surface: n[900],
    "surface-raised": n[800],
    text: n[100],
    "text-muted": n[400],
    heading: n[50],
    accent: a[400],
    "accent-text": onAccent(a[400]),
    border: n[800],
    focus: a[300],
    link: a[300],
    ...status(0.78, 0.13),
  };

  const darkAccent: RoleSet = {
    background: a[950],
    surface: a[900],
    "surface-raised": a[800],
    text: a[50],
    "text-muted": a[200],
    heading: WHITE,
    accent: a[300],
    "accent-text": onAccent(a[300]),
    border: a[800],
    focus: a[200],
    link: a[200],
    ...status(0.82, 0.12),
  };

  // Brand: the saturated brand color is the background; everything else inverts around it.
  const brandIsLight = contrastRatio(brand, BLACK) >= contrastRatio(brand, WHITE);
  const toward = brandIsLight ? -1 : 1;
  const ink = brandIsLight ? a[950] : a[50];
  const brandTheme: RoleSet = {
    background: brand,
    surface: shift(brand, -0.04 * toward),
    "surface-raised": shift(brand, -0.08 * toward),
    text: ink,
    "text-muted": brandIsLight ? a[900] : a[100],
    heading: brandIsLight ? n[950] : WHITE,
    accent: brandIsLight ? n[950] : WHITE,
    "accent-text": brand,
    border: shift(brand, 0.12 * toward),
    focus: ink,
    link: ink,
    ...status(brandIsLight ? 0.32 : 0.92, 0.1),
  };

  return {
    light,
    "light-accent": lightAccent,
    dark,
    "dark-accent": darkAccent,
    brand: brandTheme,
  };
}

export interface ContrastAdjustment {
  theme: ColorTheme;
  role: ThemeRole;
  from: string;
  to: string;
  /** The role it was adjusted against. */
  against: ThemeRole;
  required: number;
}

export interface SolvedThemes {
  themes: ThemeColorSet;
  adjustments: ContrastAdjustment[];
}

/** Backgrounds must reach this multiple of the body minimum against pure white/black. */
const POLARITY_HEADROOM = 1.2;
const SURFACES = ["background", "surface", "surface-raised"] as const;
const SURFACE_SET = new Set<ThemeRole>(SURFACES);
/** OKLCH lightness step from `accent` to its hover fill (pressed is twice this). */
const HOVER_STEP = 0.06;

/**
 * Unsolved hover/pressed fills: the accent stepped in lightness away from its label (toward it
 * only when the accent is already at black/white).
 */
export function accentStates(accent: Oklch, label: Oklch): Record<StateRole, Oklch> {
  const sign = label.l > accent.l ? -1 : 1;
  const step = (n: number) => {
    const next = shift(accent, sign * HOVER_STEP * n);
    return oklchToHex(next) === oklchToHex(accent) ? shift(accent, -sign * HOVER_STEP * n) : next;
  };
  return { "accent-hover": step(1), "accent-pressed": step(2) };
}

/**
 * The contrast solver (doc 04 §3.3). Lightness only, hue never changes.
 *
 * 1. Polarity: each theme has light-on-dark or dark-on-light text. Every surface is moved (if
 *    needed) so the pure extreme of that polarity clears the body minimum with headroom — this
 *    makes all text/surface pairs jointly solvable.
 * 2. For every pair in {@link CONTRAST_PAIRS}, the foreground moves the minimum distance (on
 *    surfaces: only away from them, in the theme's polarity).
 * 3. If a foreground can't get there (e.g. `accent-text` on a mid-tone `accent` in `high` mode),
 *    the background moves instead — choosing the direction that keeps the background's own pairs
 *    passing, flipping the foreground's polarity when that is what it takes.
 *
 * 4. Button states: `accent-hover` / `accent-pressed` step the accent's lightness away from its
 *    label, then are solved against `accent-text` (body) and `background` (UI).
 *
 * `text-muted` is kept no stronger than `text`. Iterates until every pair passes.
 */
export function solveThemes(
  roles: Record<ColorTheme, RoleSet>,
  mode: ContrastMode = "standard",
): SolvedThemes {
  const mins = CONTRAST_MINIMUMS[mode];
  const adjustments = new Map<string, ContrastAdjustment>();
  const themes = {} as ThemeColorSet;

  for (const theme of COLOR_THEMES) {
    const set = { ...roles[theme] } as Record<ThemeRole, Oklch>;
    const hex = (role: ThemeRole) => oklchToHex(set[role]);
    const record = (role: ThemeRole, against: ThemeRole, required: number, next: Oklch) => {
      const key = `${theme}:${role}`;
      const prev = adjustments.get(key);
      const from = prev?.from ?? hex(role);
      set[role] = next;
      adjustments.set(key, { theme, role, from, to: hex(role), against, required });
    };

    // 1. polarity
    const lightText = relativeLuminance(set.text) > relativeLuminance(set.background);
    const extreme = lightText ? WHITE : BLACK;
    const away: Direction = lightText ? "lighter" : "darker";
    const need = mins.body * POLARITY_HEADROOM;
    for (const surface of SURFACES) {
      if (contrastRatio(extreme, set[surface]) >= need) continue;
      const moved = solveLightness(set[surface], extreme, need);
      if (moved) record(surface, "text", mins.body, moved);
    }

    // Pairs where `role` is the foreground — used to keep a moved background valid.
    const ownPairsPass = (role: ThemeRole, candidate: Oklch) =>
      CORE_CONTRAST_PAIRS.every(
        (p) => p.fg !== role || contrastRatio(candidate, set[p.bg]) >= mins[p.level],
      );

    const solvePairs = (pairs: readonly ContrastPair[], allowBgMoves: boolean) => {
      for (let pass = 0; pass < 10; pass++) {
        let changed = false;
        for (const { fg, bg, level, adjust } of pairs) {
          const required = mins[level];
          if (contrastRatio(hex(fg), hex(bg)) >= required) continue;
          const [move, fixed] = adjust === "bg" ? [bg, fg] : [fg, bg];
          const direction = SURFACE_SET.has(fixed) ? away : "either";
          const solved = solveLightness(set[move], set[fixed], required, direction);
          if (solved) {
            record(move, fixed, required, solved);
            changed = true;
            continue;
          }
          if (!allowBgMoves) continue;
          let best: { bg: Oklch; fg: Oklch; delta: number } | null = null;
          for (const end of [WHITE, BLACK]) {
            const fgEnd = gamutMap({ ...set[fg], l: end.l });
            const movedBg = solveLightness(set[bg], fgEnd, required);
            if (!movedBg || !ownPairsPass(bg, movedBg)) continue;
            const delta = Math.abs(movedBg.l - set[bg].l);
            if (best && delta >= best.delta) continue;
            best = {
              bg: movedBg,
              fg: solveLightness(set[fg], movedBg, required) ?? fgEnd,
              delta,
            };
          }
          if (!best) continue;
          record(bg, fg, required, best.bg);
          record(fg, bg, required, best.fg);
          changed = true;
        }
        if (!changed) break;
      }
    };

    // 2–3. semantic role pairs
    solvePairs(CORE_CONTRAST_PAIRS, true);

    // Hierarchy: muted text never out-contrasts body text (it equals text when no accessible
    // in-between exists).
    for (const surface of SURFACES) {
      if (contrastRatio(set["text-muted"], set[surface]) > contrastRatio(set.text, set[surface])) {
        record("text-muted", "text", mins.body, set.text);
        break;
      }
    }

    // 4. button states: step the accent away from its label, then solve only the state colors.
    Object.assign(set, accentStates(set.accent, set["accent-text"]));
    solvePairs(STATE_PAIRS, false);
    // No room for a visible state (accent at black/white, label at the minimum): deepen the
    // label away from the accent so the pressed step — and so also hover — fits.
    if (hex("accent-hover") === hex("accent") || hex("accent-pressed") === hex("accent")) {
      const toward = set["accent-text"].l > set.accent.l ? 1 : -1;
      const pressed = shift(set.accent, toward * HOVER_STEP * 2);
      const label = solveLightness(
        set["accent-text"],
        pressed,
        mins.body,
        toward > 0 ? "lighter" : "darker",
      );
      if (label) {
        record("accent-text", "accent-pressed", mins.body, label);
        set["accent-hover"] = shift(set.accent, toward * HOVER_STEP);
        set["accent-pressed"] = pressed;
        solvePairs(STATE_PAIRS, false);
      }
    }

    const out = {} as Record<ThemeRole, string>;
    for (const role of [...COLOR_ROLES, ...STATE_ROLES]) out[role] = hex(role);
    themes[theme] = out;
  }

  const list = [...adjustments.values()].filter((a) => a.from !== a.to);
  return { themes, adjustments: list };
}
