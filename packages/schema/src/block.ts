import { z } from "zod";
import { BlockIdSchema } from "./ids";
import { named } from "./registry";
import { responsive } from "./responsive";
import {
  AlignSchema,
  AnimationSchema,
  ColorThemeSchema,
  ImageTreatmentSchema,
  RadiusTokenSchema,
  ShadowTokenSchema,
  SpaceTokenSchema,
  TypePresetSchema,
} from "./tokens";

/** Block type names: `testimonial`, `image-gallery`, or namespaced custom blocks `acme/map`. */
export const BLOCK_TYPE_RE = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const BlockTypeSchema = z
  .string()
  .regex(BLOCK_TYPE_RE, { message: "Expected a block type such as text or image-gallery" });

/** Variant names: lowercase-hyphenated. */
export const VariantNameSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Expected a lowercase-hyphenated variant" });

/** Named typography slots inside a block, e.g. `typography.quote`. */
export const TYPOGRAPHY_SLOT_RE = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Per-block style overrides. Every key is a token reference; which keys a block honours is
 * declared by its definition's `styleSlots`.
 */
export const BlockStyleSchema = named(
  "BlockStyle",
  "Token-based style overrides for a block; allowed keys are the block definition's styleSlots.",
  z.strictObject({
    colorTheme: ColorThemeSchema.optional(),
    padding: responsive(SpaceTokenSchema).optional(),
    radius: RadiusTokenSchema.optional(),
    border: z.enum(["none", "subtle", "strong"]).optional(),
    shadow: ShadowTokenSchema.optional(),
    align: responsive(AlignSchema).optional(),
    imageTreatment: ImageTreatmentSchema.optional(),
    animation: AnimationSchema.optional(),
    typography: z.record(z.string().regex(TYPOGRAPHY_SLOT_RE), TypePresetSchema).optional(),
  }),
);
export type BlockStyle = z.infer<typeof BlockStyleSchema>;

/** Top-level style slot names a block definition can declare. */
export const STYLE_SLOTS = [
  "colorTheme",
  "padding",
  "radius",
  "border",
  "shadow",
  "align",
  "imageTreatment",
  "animation",
] as const;
export type StyleSlot = (typeof STYLE_SLOTS)[number] | `typography.${string}`;

export function isStyleSlot(value: string): value is StyleSlot {
  if ((STYLE_SLOTS as readonly string[]).includes(value)) return true;
  const m = /^typography\.(.+)$/.exec(value);
  return m !== null && TYPOGRAPHY_SLOT_RE.test(m[1] as string);
}

/** Style slots actually used by a style object (e.g. `["padding", "typography.quote"]`). */
export function styleSlotsUsed(style: BlockStyle | undefined): StyleSlot[] {
  if (!style) return [];
  const out: StyleSlot[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;
    if (key === "typography")
      for (const slot of Object.keys(value as object)) out.push(`typography.${slot}`);
    else out.push(key as StyleSlot);
  }
  return out;
}

/**
 * A block instance as stored in a page (arch §3.2). `fields` is validated against the block
 * type's definition (see `defineBlock`); here it is any JSON object.
 */
export const BlockSchema = named(
  "Block",
  "A block instance: a typed, versioned bundle of fields placed in a section.",
  z.strictObject({
    id: BlockIdSchema,
    type: BlockTypeSchema,
    v: z.int().min(1),
    /** Stack-mode column index (0-based, desktop columns). Ignored in grid mode. */
    column: z.int().min(0).max(3).optional(),
    fields: z.record(z.string(), z.unknown()),
    variant: VariantNameSchema.optional(),
    style: BlockStyleSchema.optional(),
  }),
);
export type Block = z.infer<typeof BlockSchema>;
