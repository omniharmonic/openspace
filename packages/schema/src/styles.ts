import { z } from "zod";
import { MediaPathSchema, SlugSchema } from "./primitives";
import { named } from "./registry";
import { CssColorSchema, ImageTreatmentSchema, TYPE_PRESETS } from "./tokens";

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

/**
 * Every typography preset a site can tune: the content presets plus UI-only `button`, `nav` and
 * `wordmark` (the site title in the header).
 */
export const TYPE_SCALE_PRESETS = [...TYPE_PRESETS, "button", "nav", "wordmark"] as const;
export type TypeScalePreset = (typeof TYPE_SCALE_PRESETS)[number];

/** Font roles: headings, running text, and labels (eyebrows, buttons, navigation). */
export const FONT_ROLES = ["heading", "body", "label"] as const;
export type FontRole = (typeof FONT_ROLES)[number];

export const TEXT_CASES = ["none", "uppercase", "lowercase", "capitalize"] as const;

/**
 * A Google Fonts family (SIL OFL / Apache) used instead of the pairing's: loaded like the
 * pairing's own fonts (self-hosted at publish). Imports set it to the original site's font.
 */
export const WebFontSchema = named(
  "WebFont",
  "A Google Fonts family for a font role: family name, category, weights and whether italics load.",
  z.strictObject({
    family: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/, { message: "Use the family's Google Fonts name" }),
    category: z.enum(["serif", "sans-serif", "monospace"]),
    weights: z.array(z.int().min(100).max(900)).min(1).max(9).optional(),
    italic: z.boolean().optional(),
  }),
);
export type WebFont = z.infer<typeof WebFontSchema>;

/** One typography preset tuned: sizes in px (desktop, phone), line height, tracking (em), case. */
export const TypeStepSchema = named(
  "TypeStep",
  "A tuned typography preset: size (px at desktop and on phones), line height, letter spacing (em), case, weight, italic, font role.",
  z.strictObject({
    size: z.number().min(9).max(220).optional(),
    sizeMobile: z.number().min(9).max(160).optional(),
    lineHeight: z.number().min(0.7).max(3).optional(),
    letterSpacing: z.number().min(-0.2).max(1).optional(),
    case: z.enum(TEXT_CASES).optional(),
    weight: z.int().min(100).max(900).optional(),
    italic: z.boolean().optional(),
    font: z.enum(FONT_ROLES).optional(),
  }),
);
export type TypeStep = z.infer<typeof TypeStepSchema>;

/** Fine typography (all optional; absent = the pairing's own scale). */
export const TypographyChoicesSchema = named(
  "TypographyChoices",
  "Fine typography: Google Fonts per role (heading, body, label), a tuned type scale, eyebrow color.",
  z.strictObject({
    heading: WebFontSchema.optional(),
    body: WebFontSchema.optional(),
    /** Eyebrows, buttons and navigation (defaults to the body font). */
    label: WebFontSchema.optional(),
    scale: z.partialRecord(z.enum(TYPE_SCALE_PRESETS), TypeStepSchema).optional(),
    /** Eyebrow color: the accent/link color (default) or the muted text color. */
    eyebrowColor: z.enum(["accent", "muted"]).optional(),
  }),
);
export type TypographyChoices = z.infer<typeof TypographyChoicesSchema>;

/** Page rhythm (all optional; absent = the density's rhythm and the default widths). */
export const LayoutChoicesSchema = named(
  "LayoutChoices",
  "Page rhythm: content width and narrow width (px), section padding (px at desktop and on phones), side gutter.",
  z.strictObject({
    contentWidth: z.int().min(480).max(2400).optional(),
    narrowWidth: z.int().min(360).max(1600).optional(),
    sectionPadding: z.int().min(0).max(320).optional(),
    sectionPaddingMobile: z.int().min(0).max(240).optional(),
    gutter: z.int().min(0).max(160).optional(),
    gutterMobile: z.int().min(0).max(80).optional(),
  }),
);
export type LayoutChoices = z.infer<typeof LayoutChoicesSchema>;

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
    /** An uploaded font family (`Styles.fonts`) used for headings instead of the pairing's. */
    headingFont: z.string().max(60).optional(),
    /** An uploaded font family used for body text instead of the pairing's. */
    bodyFont: z.string().max(60).optional(),
    /** Fine typography: Google Fonts per role and a tuned type scale (imports set it). */
    typography: TypographyChoicesSchema.optional(),
    /** Page rhythm: content width and section padding (imports set it). */
    layout: LayoutChoicesSchema.optional(),
  }),
);
export type StyleChoices = z.infer<typeof StyleChoicesSchema>;

/** Uploadable font formats (PRD §5.1 "Font uploads"). */
export const FONT_FILE_FORMATS = { woff2: "woff2", ttf: "truetype", otf: "opentype" } as const;
export const FONT_CATEGORIES = [
  "serif",
  "sans-serif",
  "display",
  "monospace",
  "handwriting",
] as const;

/**
 * A font the site owns or licensed (PRD §5.1): its files live in `media/fonts/` and publish with
 * the site; `license.webUse` records that a designer confirmed the right to use it on the web.
 */
export const CustomFontSchema = named(
  "CustomFont",
  "An uploaded font family: files in media/fonts/ (WOFF2, TTF or OTF) with weights, and a web-use license confirmation.",
  z.strictObject({
    family: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$/, { message: "Use letters, numbers and spaces" }),
    category: z.enum(FONT_CATEGORIES),
    files: z
      .array(
        z.strictObject({
          src: MediaPathSchema.refine(
            (p) => p.startsWith("media/fonts/") && /\.(woff2|ttf|otf)$/.test(p),
            { message: "Font files live in media/fonts/ as .woff2, .ttf or .otf" },
          ),
          weight: z.int().min(100).max(900),
          style: z.enum(["normal", "italic"]),
        }),
      )
      .min(1)
      .max(18),
    license: z.strictObject({
      /** The uploader confirmed the license allows web use (self-hosting on a website). */
      webUse: z.literal(true),
      confirmedBy: z.string().max(80).optional(),
      confirmedAt: z.string().max(40).optional(),
    }),
  }),
);
export type CustomFont = z.infer<typeof CustomFontSchema>;

/** `content/styles.json` (doc 04 §2.1): choices + exact DTCG overrides (Designer mode). */
export const StylesSchema = named(
  "Styles",
  "content/styles.json: Site Styles choices plus DTCG token overrides.",
  z
    .strictObject({
      $schema: z.string().optional(),
      choices: StyleChoicesSchema,
      overrides: DtcgGroupSchema.optional(),
      /** Uploaded font families (PRD §5.1 "Font uploads"). */
      fonts: z.array(CustomFontSchema).max(8).optional(),
    })
    .superRefine((styles, ctx) => {
      const families = new Set<string>();
      styles.fonts?.forEach((f, i) => {
        const key = f.family.toLowerCase();
        if (families.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["fonts", i, "family"],
            message: `Two uploaded fonts are named ${f.family}`,
          });
        families.add(key);
      });
      for (const key of ["headingFont", "bodyFont"] as const) {
        const name = styles.choices[key];
        if (name !== undefined && !families.has(name.toLowerCase()))
          ctx.addIssue({
            code: "custom",
            path: ["choices", key],
            message: `No uploaded font is named ${name}`,
          });
      }
    }),
);
export type Styles = z.infer<typeof StylesSchema>;
