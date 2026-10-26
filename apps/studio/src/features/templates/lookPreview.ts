import type { Styles } from "@openspace/schema";
import { compileStyles, fontStack, RADIUS_SCALES } from "@openspace/theme";
import type { LookStyles } from "../../api/types";

/**
 * The compact look description (palette swatches, type, radius) Studio's look pickers draw,
 * derived from a look's full Site Styles with the theme compiler, so the colors are the solved,
 * contrast-safe ones of the `light` section theme. Same derivation as the Hub's gallery data.
 */
export function lookPreview(styles: Styles): LookStyles {
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
