import type { Styles } from "@omniharmonic/openspace-schema";
import { compileStyles, fontStack, RADIUS_SCALES } from "@omniharmonic/openspace-theme";
import { LOOK_PREVIEWS, TEMPLATE_CATALOG } from "../templates/catalog";

/**
 * The compact look description Studio's gallery draws its sketches from (Studio's `LookStyles`),
 * derived from a look's full `Styles` with the theme compiler so the colors are the solved,
 * contrast-safe ones of the `light` section theme.
 */
export interface LookPreview {
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    onAccent: string;
  };
  fonts: { heading: string; body: string };
  /** Button/image corner radius in px (999 = pill). */
  radius: number;
  imageShape: "rect" | "arch" | "circle";
}

export function lookPreview(styles: Styles): LookPreview {
  const { tokens } = compileStyles(styles);
  const light = tokens.themes.light;
  const choices = styles.choices;
  const pill = choices.buttons.startsWith("pill");
  return {
    colors: {
      background: light.background,
      surface: light.surface,
      text: light.text,
      muted: light["text-muted"],
      accent: light.accent,
      onAccent: light["accent-text"],
    },
    fonts: { heading: fontStack(tokens.pairing.heading), body: fontStack(tokens.pairing.body) },
    radius: pill ? 999 : (RADIUS_SCALES[choices.shape].button ?? 0),
    imageShape:
      choices.imageTreatment === "arch"
        ? "arch"
        : choices.imageTreatment === "circle"
          ? "circle"
          : "rect",
  };
}

/**
 * Look previews by look styles. Compiling a look's styles costs ~2.5 ms of CPU, and the gallery
 * shows 36 looks: the registry's previews are precomputed (`LOOK_PREVIEWS`, embedded with the
 * template catalog) and anything else is computed once per isolate.
 */
const previews = new Map<string, LookPreview>();
let seeded = false;

export function cachedLookPreview(styles: Styles): LookPreview {
  if (!seeded) {
    seeded = true;
    for (const t of TEMPLATE_CATALOG)
      for (const l of t.looks) {
        const p = LOOK_PREVIEWS[`${t.id}/${l.id}`];
        if (p) previews.set(JSON.stringify(l.styles), p);
      }
  }
  const key = JSON.stringify(styles);
  let p = previews.get(key);
  if (!p) {
    p = lookPreview(styles);
    previews.set(key, p);
  }
  return p;
}

/** Every registry look's preview, keyed `<template>/<look>` (what the catalog embeds). */
export function computeLookPreviews(
  catalog: readonly { id: string; looks: readonly { id: string; styles: Styles }[] }[],
): Record<string, LookPreview> {
  const out: Record<string, LookPreview> = {};
  for (const t of catalog) for (const l of t.looks) out[`${t.id}/${l.id}`] = lookPreview(l.styles);
  return out;
}
