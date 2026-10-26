import { z } from "zod";
import { SlugSchema } from "./primitives";
import { named } from "./registry";
import { CssColorSchema, ImageTreatmentSchema } from "./tokens";

/** W3C Design Tokens (DTCG) `$type` values. */
export const DTCG_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
] as const;

export type DtcgValue =
  | string
  | number
  | boolean
  | null
  | DtcgValue[]
  | { [key: string]: DtcgValue };

export interface DtcgToken {
  $value: DtcgValue;
  $type?: (typeof DTCG_TYPES)[number];
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export interface DtcgGroup {
  $type?: (typeof DTCG_TYPES)[number];
  $description?: string;
  [name: string]: DtcgToken | DtcgGroup | string | undefined;
}

const DtcgValueSchema: z.ZodType<DtcgValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(DtcgValueSchema),
    z.record(z.string(), DtcgValueSchema),
  ]),
);

export const DtcgTokenSchema: z.ZodType<DtcgToken> = z.strictObject({
  $value: DtcgValueSchema,
  $type: z.enum(DTCG_TYPES).optional(),
  $description: z.string().optional(),
  $extensions: z.record(z.string(), z.unknown()).optional(),
});

/** A DTCG group: named tokens or nested groups, plus optional `$type`/`$description`. */
export const DtcgGroupSchema: z.ZodType<DtcgGroup> = named(
  "DtcgGroup",
  "A W3C design-token group: nested groups and tokens ({ $value, $type? }).",
  z.lazy(() =>
    z
      .object({
        $type: z.enum(DTCG_TYPES).optional(),
        $description: z.string().optional(),
      })
      .catchall(z.union([DtcgTokenSchema, DtcgGroupSchema]))
      .superRefine((group, ctx) => {
        for (const key of Object.keys(group)) {
          if (key === "$type" || key === "$description") continue;
          if (key.startsWith("$") || /[.{}]/.test(key)) {
            ctx.addIssue({ code: "custom", path: [key], message: `Invalid token name "${key}"` });
          }
        }
      }),
  ) as unknown as z.ZodType<DtcgGroup>,
);

export const DENSITIES = ["compact", "comfortable", "airy"] as const;
export const SHAPES = ["sharp", "soft", "round"] as const;
export const BUTTON_STYLES = [
  "solid",
  "outline",
  "underline",
  "pill-solid",
  "pill-outline",
  "text-arrow",
] as const;
export const MOTION_LEVELS = ["none", "subtle", "expressive"] as const;

/** Site Styles choices that owners edit; the theme compiler expands them into tokens. */
export const StyleChoicesSchema = named(
  "StyleChoices",
  "Site Styles selections (palette, font pairing, density, shape, buttons, motion, image treatment).",
  z.strictObject({
    palette: z.strictObject({
      brand: CssColorSchema,
      neutral: z.enum(["warm", "cool", "pure"]),
      contrast: z.enum(["standard", "high"]),
      /** Where the brand color came from (for Studio's palette UI). */
      source: z.enum(["brand", "logo", "image", "curated"]).optional(),
    }),
    pairing: SlugSchema,
    density: z.enum(DENSITIES),
    shape: z.enum(SHAPES),
    buttons: z.enum(BUTTON_STYLES),
    motion: z.enum(MOTION_LEVELS),
    imageTreatment: ImageTreatmentSchema,
  }),
);
export type StyleChoices = z.infer<typeof StyleChoicesSchema>;

/** `content/styles.json` (doc 04 §2.1): choices + exact DTCG overrides (Designer mode). */
export const StylesSchema = named(
  "Styles",
  "content/styles.json: Site Styles choices plus DTCG token overrides.",
  z.strictObject({
    $schema: z.string().optional(),
    choices: StyleChoicesSchema,
    overrides: DtcgGroupSchema.optional(),
  }),
);
export type Styles = z.infer<typeof StylesSchema>;
