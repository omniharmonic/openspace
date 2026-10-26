import type { COLOR_ROLES, COLOR_SCALE_STEPS } from "@openspace/schema";

/** A semantic color role (doc 04 §3.1), e.g. `text-muted`. */
export type ColorRole = (typeof COLOR_ROLES)[number];
/** A color scale step, 50–950. */
export type ScaleStep = (typeof COLOR_SCALE_STEPS)[number];
/** An 11-step color scale. */
export type ColorScale<T = string> = Record<ScaleStep, T>;
