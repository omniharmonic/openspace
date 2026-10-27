import type { Styles } from "@omniharmonic/openspace-schema";
import { compileStyles, fontStack, RADIUS_SCALES } from "@omniharmonic/openspace-theme";

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
