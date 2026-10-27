import { z } from "zod";
import { MediaPathSchema } from "./primitives";
import { named } from "./registry";
import { COLOR_ROLES } from "./tokens";

/**
 * The site's design-system record (`content/design-system.json`): what the site is for, the brand
 * material the owner brought (design tokens, colours, fonts, logo, a brand document, a page Claude
 * made), the tokens distilled from it, and how those tokens map onto Site Styles. Claude's design
 * skills read it before every change so new sections stay consistent; Studio never renders it.
 * Optional: a site without one is unchanged.
 */

export const DESIGN_SYSTEM_FILE = "content/design-system.json";

const Text = (max: number) => z.string().max(max);

/** A colour in the brand palette, with the Site Styles role it plays (when it plays one). */
export const DesignColorSchema = z.strictObject({
  /** `#rrggbb` (or any CSS colour the theme can read). */
  value: Text(80),
  role: z.enum([...COLOR_ROLES, "brand", "secondary"]).optional(),
  /** Where it is used ("labels and rules only"). */
  usage: Text(200).optional(),
});
export type DesignColor = z.infer<typeof DesignColorSchema>;

export const DesignFontSchema = z.strictObject({
  family: Text(80),
  /** The full CSS stack as given (`'Lora', Georgia, serif`). */
  stack: Text(200).optional(),
  category: z.enum(["serif", "sans-serif", "monospace", "display", "handwriting"]).optional(),
  weights: z.array(z.int().min(100).max(900)).max(9).optional(),
  /** Served by Google Fonts (so the site can self-host it). */
  google: z.boolean().optional(),
});
export type DesignFont = z.infer<typeof DesignFontSchema>;

/** One step of the type scale (px; desktop and phone). */
export const DesignTypeStepSchema = z.strictObject({
  size: z.number().min(6).max(240).optional(),
  sizeMobile: z.number().min(6).max(200).optional(),
  lineHeight: z.number().min(0.6).max(4).optional(),
  letterSpacing: z.number().min(-0.5).max(2).optional(),
  weight: z.int().min(100).max(900).optional(),
  case: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  font: z.enum(["heading", "body", "label", "mono"]).optional(),
});
export type DesignTypeStep = z.infer<typeof DesignTypeStepSchema>;

export const DesignTokensSchema = z.strictObject({
  colors: z.record(Text(60), DesignColorSchema).optional(),
  fonts: z
    .strictObject({
      heading: DesignFontSchema.optional(),
      body: DesignFontSchema.optional(),
      label: DesignFontSchema.optional(),
      mono: DesignFontSchema.optional(),
    })
    .optional(),
  /** Type scale by role (`display`, `h1`…`h4`, `lead`, `body`, `small`, `eyebrow`, `button`, `nav`). */
  type: z.record(Text(40), DesignTypeStepSchema).optional(),
  /** Page rhythm and spacing steps in px. */
  space: z
    .strictObject({
      contentWidth: z.number().min(0).max(4000).optional(),
      narrowWidth: z.number().min(0).max(4000).optional(),
      sectionPadding: z.number().min(0).max(400).optional(),
      sectionPaddingMobile: z.number().min(0).max(400).optional(),
      gutter: z.number().min(0).max(400).optional(),
      gutterMobile: z.number().min(0).max(400).optional(),
      scale: z.record(Text(40), z.number().min(0).max(2000)).optional(),
    })
    .optional(),
  /** Corner radii in px (`base`, `button`, `card`, `image`; 9999 = pill). */
  radius: z.record(Text(40), z.number().min(0).max(10_000)).optional(),
  shadow: z.record(Text(40), Text(200)).optional(),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export const DESIGN_SOURCE_KINDS = [
  "tokens",
  "brand-kit",
  "html",
  "brand-doc",
  "logo",
  "photos",
  "manual",
  "template",
  "claude",
] as const;

export const DesignSystemSchema = named(
  "DesignSystem",
  "content/design-system.json: the brief, brand material, distilled design tokens and how they map onto Site Styles (read by Claude's design skills).",
  z.strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    /** The person's own words about the site (Start with Claude). */
    brief: z
      .strictObject({
        about: Text(2000).optional(),
        audience: Text(1000).optional(),
        /** How it should feel ("warm", "calm", "bold"…). */
        feeling: z.array(Text(40)).max(12).optional(),
        /** Anything else they said (must-haves, places they love). */
        notes: Text(2000).optional(),
      })
      .optional(),
    brand: z
      .strictObject({
        name: Text(120).optional(),
        /** How the brand speaks (from a brand document, or Claude's notes). */
        voice: Text(2000).optional(),
        /** Text of a brand document the owner brought (trimmed). */
        guidelines: Text(20_000).optional(),
        logo: MediaPathSchema.optional(),
        /** Brand photos the owner brought (media paths). */
        photos: z.array(MediaPathSchema).max(24).optional(),
        /** Files kept in the repository for reference (PDF brand books…), not published. */
        documents: z
          .array(z.strictObject({ name: Text(120), path: Text(300) }))
          .max(12)
          .optional(),
      })
      .optional(),
    tokens: DesignTokensSchema,
    /** Design principles to keep ("Rust is for labels and rules only; never body text"). */
    rules: z.array(Text(300)).max(40).optional(),
    /** How the tokens became Site Styles: plain sentences, contrast changes included. */
    mapping: z
      .strictObject({
        notes: z.array(Text(400)).max(40),
        contrast: z
          .array(
            z.strictObject({
              theme: Text(40),
              role: Text(40),
              from: Text(40),
              to: Text(40),
              against: Text(40),
            }),
          )
          .max(80)
          .optional(),
      })
      .optional(),
    /** Bespoke components and what each is for (kept in step with content/components). */
    components: z
      .record(Text(40), z.strictObject({ purpose: Text(300), source: Text(200).optional() }))
      .optional(),
    sources: z
      .array(
        z.strictObject({
          kind: z.enum(DESIGN_SOURCE_KINDS),
          name: Text(200).optional(),
          /** Token format (`dtcg`, `style-dictionary`, `tokens-studio`, `canva`, `plain`). */
          format: Text(40).optional(),
          at: Text(40).optional(),
        }),
      )
      .max(40)
      .optional(),
    updatedAt: Text(40).optional(),
  }),
);
export type DesignSystem = z.infer<typeof DesignSystemSchema>;
