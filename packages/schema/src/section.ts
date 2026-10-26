import { z } from "zod";
import { type Block, BlockSchema } from "./block";
import { BlockIdSchema, SectionIdSchema } from "./ids";
import { FocalPointSchema, MediaSrcSchema, SlugSchema } from "./primitives";
import { named } from "./registry";
import { resolve, responsive } from "./responsive";
import { AnimationSchema, ColorThemeSchema, ColorValueSchema, SpaceTokenSchema } from "./tokens";

/** Grid columns per breakpoint (arch §3.3). Tablet inherits the desktop grid. */
export const GRID_COLUMNS = { d: 24, t: 24, m: 8 } as const;
/** Stack-mode column spans are in twelfths. */
export const STACK_UNITS = 12;
export const MAX_STACK_COLUMNS = 4;
export const MAX_GRID_ROWS = 400;

export const CONTENT_WIDTHS = ["narrow", "content", "wide", "full"] as const;
export const ContentWidthSchema = z.enum(CONTENT_WIDTHS);
export type ContentWidth = z.infer<typeof ContentWidthSchema>;

// --- stack ----------------------------------------------------------------------------------

/** Column spans in twelfths, 1–4 columns, summing to 12 — e.g. `[7, 5]`. */
export const StackColumnsSchema = z
  .array(z.int().min(1).max(STACK_UNITS))
  .min(1)
  .max(MAX_STACK_COLUMNS)
  .refine((cols) => cols.reduce((a, b) => a + b, 0) === STACK_UNITS, {
    message: "Column spans must add up to 12",
  });

/** Desktop column indexes in stacking order, e.g. `[1, 0]` puts the second column first. */
export const StackOrderSchema = z
  .array(
    z
      .int()
      .min(0)
      .max(MAX_STACK_COLUMNS - 1),
  )
  .max(MAX_STACK_COLUMNS);

export const StackLayoutSchema = named(
  "StackLayout",
  "Stack mode: blocks flow in 1–4 columns with per-breakpoint ratios; impossible to misalign.",
  z.strictObject({
    mode: z.literal("stack"),
    columns: responsive(StackColumnsSchema),
    /** Stacking order of desktop columns at tablet/mobile, e.g. `{ m: [1, 0] }` (FR-13). */
    order: z
      .strictObject({ t: StackOrderSchema.optional(), m: StackOrderSchema.optional() })
      .optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    gap: SpaceTokenSchema.optional(),
    width: ContentWidthSchema.optional(),
  }),
);
export type StackLayout = z.infer<typeof StackLayoutSchema>;

// --- grid -----------------------------------------------------------------------------------

/** A placement on the section grid; 1-based column/row, `w`/`h` spans. */
export const GridRectSchema = z.strictObject({
  x: z.int().min(1),
  y: z.int().min(1),
  w: z.int().min(1),
  h: z.int().min(1),
  z: z.int().min(0).max(100).optional(),
  /** Bleed to the viewport edge via the full-bleed tracks (uses full-start/full-end lines). */
  bleed: z.enum(["left", "right", "both"]).optional(),
});
export type GridRect = z.infer<typeof GridRectSchema>;

/** Per-breakpoint placements; `t` inherits `d`; `m` is independent (Studio auto-generates it). */
export const GridItemSchema = z
  .strictObject({ d: GridRectSchema, t: GridRectSchema.optional(), m: GridRectSchema.optional() })
  .superRefine((item, ctx) => {
    for (const bp of ["d", "t", "m"] as const) {
      const rect = item[bp];
      if (!rect) continue;
      const cols = GRID_COLUMNS[bp];
      if (rect.x + rect.w - 1 > cols) {
        ctx.addIssue({
          code: "custom",
          path: [bp, "w"],
          message: `Placement overflows the ${cols}-column grid (x + w - 1 must be ≤ ${cols})`,
        });
      }
    }
  });
export type GridItem = z.infer<typeof GridItemSchema>;

export const GridLayoutSchema = named(
  "GridLayout",
  "Grid mode (Fluid-Engine equivalent): 24 columns desktop/tablet, 8 mobile, rows grow to fit.",
  z
    .strictObject({
      mode: z.literal("grid"),
      rows: responsive(z.int().min(1).max(MAX_GRID_ROWS)),
      items: z.record(BlockIdSchema, GridItemSchema),
      width: ContentWidthSchema.optional(),
    })
    .superRefine((layout, ctx) => {
      for (const [id, item] of Object.entries(layout.items)) {
        for (const bp of ["d", "t", "m"] as const) {
          const rect = bp === "t" ? (item.t ?? item.d) : item[bp];
          if (!rect) continue;
          const rows = resolve(layout.rows, bp);
          if (rect.y + rect.h - 1 > rows) {
            ctx.addIssue({
              code: "custom",
              path: ["items", id, bp, "h"],
              message: `Placement extends past the last row (${rows}) at breakpoint "${bp}"`,
            });
          }
        }
      }
    }),
);
export type GridLayout = z.infer<typeof GridLayoutSchema>;

export const SectionLayoutSchema = z.discriminatedUnion("mode", [
  StackLayoutSchema,
  GridLayoutSchema,
]);
export type SectionLayout = z.infer<typeof SectionLayoutSchema>;

// --- style ----------------------------------------------------------------------------------

export const OverlaySchema = z.strictObject({
  color: ColorValueSchema,
  opacity: z.number().min(0).max(1),
});

export const SectionBackgroundSchema = named(
  "SectionBackground",
  "Section background: none, a color, an image (focal point, overlay), a gradient or a video.",
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("none") }),
    z.strictObject({ type: z.literal("color"), color: ColorValueSchema }),
    z.strictObject({
      type: z.literal("image"),
      src: MediaSrcSchema,
      focal: FocalPointSchema.optional(),
      overlay: OverlaySchema.optional(),
      parallax: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("gradient"),
      from: ColorValueSchema,
      to: ColorValueSchema,
      via: ColorValueSchema.optional(),
      angle: z.number().min(0).max(360).optional(),
    }),
    z.strictObject({
      type: z.literal("video"),
      src: MediaSrcSchema,
      poster: MediaSrcSchema.optional(),
      focal: FocalPointSchema.optional(),
      overlay: OverlaySchema.optional(),
    }),
  ]),
);
export type SectionBackground = z.infer<typeof SectionBackgroundSchema>;

/** `auto`, viewport units (`80vh`, `100svh`), percent or pixels. */
export const MinHeightSchema = z
  .string()
  .regex(/^(?:auto|(?:[1-9]\d?|100)(?:vh|svh|dvh|lvh|%)|[1-9]\d{1,3}px)$/, {
    message: "Expected auto, a viewport height like 80vh, or pixels like 480px",
  });

export const SectionStyleSchema = named(
  "SectionStyle",
  "Token-based section style: color theme, padding, min height, background, entrance animation.",
  z.strictObject({
    colorTheme: ColorThemeSchema.optional(),
    padding: responsive(SpaceTokenSchema).optional(),
    minHeight: responsive(MinHeightSchema).optional(),
    background: SectionBackgroundSchema.optional(),
    animation: AnimationSchema.optional(),
  }),
);
export type SectionStyle = z.infer<typeof SectionStyleSchema>;

/** Section preset reference: `<category>/<name>@<version>`, e.g. `hero/split-image@2`. */
export const PresetRefSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*@[1-9]\d*$/, {
    message: "Expected a preset reference like hero/split-image@2",
  });

// --- section --------------------------------------------------------------------------------

/** Cross-field checks shared by page sections and the site footer. */
export function checkSectionIntegrity(
  section: { layout: SectionLayout; blocks: readonly Block[] },
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  section.blocks.forEach((b, i) => {
    if (ids.has(b.id))
      ctx.addIssue({
        code: "custom",
        path: ["blocks", i, "id"],
        message: `Duplicate block id ${b.id}`,
      });
    ids.add(b.id);
  });
  const layout = section.layout;
  if (layout.mode === "stack") {
    // `column` indexes the desktop columns; tablet/mobile stack them (see `order`).
    const maxCols = layout.columns.d.length;
    section.blocks.forEach((b, i) => {
      if (b.column !== undefined && b.column >= maxCols) {
        ctx.addIssue({
          code: "custom",
          path: ["blocks", i, "column"],
          message: `Column ${b.column} does not exist; the layout has ${maxCols} desktop column(s)`,
        });
      }
    });
    for (const bp of ["t", "m"] as const) {
      const order = layout.order?.[bp];
      if (!order) continue;
      if (new Set(order).size !== order.length || order.some((c) => c >= layout.columns.d.length)) {
        ctx.addIssue({
          code: "custom",
          path: ["layout", "order", bp],
          message: "Order must list distinct desktop column indexes",
        });
      }
    }
  } else {
    for (const id of Object.keys(layout.items)) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["layout", "items", id],
          message: `Grid placement for ${id}, which is not a block in this section`,
        });
      }
    }
    section.blocks.forEach((b, i) => {
      if (!layout.items[b.id]) {
        ctx.addIssue({
          code: "custom",
          path: ["blocks", i],
          message: `Block ${b.id} has no grid placement`,
        });
      }
    });
  }
}

export const SectionSchema = named(
  "Section",
  "A page section: a layout (stack or grid), token-based style and an ordered list of blocks.",
  z
    .strictObject({
      id: SectionIdSchema,
      preset: PresetRefSchema.optional(),
      /** Name shown in Studio's layers panel. */
      label: z.string().max(80).optional(),
      /** In-page anchor (`#about`) for links and nav. */
      anchor: SlugSchema.optional(),
      layout: SectionLayoutSchema,
      style: SectionStyleSchema,
      locked: z.boolean().optional(),
      hidden: z.boolean().optional(),
      blocks: z.array(BlockSchema),
    })
    .superRefine(checkSectionIntegrity),
);
export type Section = z.infer<typeof SectionSchema>;
