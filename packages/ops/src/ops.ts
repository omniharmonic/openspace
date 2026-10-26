import {
  BlockIdSchema,
  BlockSchema,
  BlockStyleSchema,
  CollectionConfigSchema,
  CollectionItemSchema,
  CollectionNameSchema,
  GridItemSchema,
  GridRectSchema,
  MAX_GRID_ROWS,
  MediaMetaSchema,
  MediaPathSchema,
  NavItemSchema,
  PageIdSchema,
  PageSchema,
  responsive,
  SectionIdSchema,
  SectionSchema,
  SlugSchema,
  VariantNameSchema,
} from "@openspace/schema";
import { z } from "zod";

/**
 * The operation vocabulary (arch §5.3). Every edit — Studio, Hub DraftRoom, MCP agents, CLI —
 * is one of these plain JSON values. Ops target stable ids, are validated against
 * `@openspace/schema` before they are accepted, are invertible (undo) and mergeable (rebase).
 */

/** Op metadata: a unique op id, who made it, and when (ms since epoch; used for LWW). */
export const OpMetaShape = {
  id: z.string().min(1).max(128),
  actor: z.string().min(1).max(128),
  ts: z.number().finite().min(0),
};
export interface OpMeta {
  id: string;
  actor: string;
  ts: number;
}

/**
 * The block/section container an op addresses: a page id, or `"footer"` for the site footer
 * (a single grid/stack section in `site.footer`). Sections cannot be inserted, moved or
 * deleted in the footer.
 */
export const FOOTER = "footer" as const;
export const ContainerIdSchema = z.union([PageIdSchema, z.literal(FOOTER)]);
export type ContainerId = z.infer<typeof ContainerIdSchema>;

/**
 * Where to put a block/section in its parent list: a final index (0-based, in the list
 * without the moved item), `"start"`, `"end"`, or before/after a sibling id.
 */
export const PositionSchema = z.union([
  z.int().min(0),
  z.literal("start"),
  z.literal("end"),
  z.strictObject({ before: z.string().min(1) }),
  z.strictObject({ after: z.string().min(1) }),
]);
export type Position = z.infer<typeof PositionSchema>;

/**
 * A path patch: dot-separated paths into an object (`"seo.description"`, `"choices.palette.brand"`).
 * Arrays are leaf values (replaced whole). `unset` removes keys. Paths within one patch must not
 * overlap (no path may be a prefix of another).
 */
export const PathSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[^.]+(?:\.[^.]+)*$/, { message: "Expected a dot-separated path" });
export const PatchShape = {
  set: z.record(PathSchema, z.unknown()).optional(),
  unset: z.array(PathSchema).max(500).optional(),
};
export interface Patch {
  set?: Record<string, unknown>;
  unset?: string[];
}

export const RowsSchema = responsive(z.int().min(1).max(MAX_GRID_ROWS));
export type Rows = z.infer<typeof RowsSchema>;

export const BreakpointSchema = z.enum(["d", "t", "m"]);

const op = <T extends string, S extends z.core.$ZodLooseShape>(name: T, shape: S) =>
  z.strictObject({ op: z.literal(name), ...OpMetaShape, ...shape });

export const BlockUpdateOpSchema = op("block.update", {
  page: ContainerIdSchema,
  block: BlockIdSchema,
  /** Field values to set (top-level field keys). */
  set: z.record(z.string().min(1).max(100), z.unknown()).optional(),
  /** Field keys to remove. */
  unset: z.array(z.string().min(1).max(100)).max(200).optional(),
  /** New variant; `null` removes it. */
  variant: VariantNameSchema.nullable().optional(),
  /** New style overrides (replaced whole); `null` removes them. */
  style: BlockStyleSchema.nullable().optional(),
  /** Stack column; `null` removes it. */
  column: z.int().min(0).max(3).nullable().optional(),
  /** Layers label; `null` removes it. */
  label: z.string().max(80).nullable().optional(),
  /** Hide the block on the published site; `null` (or `false`) shows it again. */
  hidden: z.boolean().nullable().optional(),
});

export const BlockInsertOpSchema = op("block.insert", {
  page: ContainerIdSchema,
  section: SectionIdSchema,
  at: PositionSchema,
  block: BlockSchema,
  /** Grid placement when inserting into a grid section (auto-placed at the bottom if absent). */
  place: GridItemSchema.optional(),
  /** Exact grid rows to set afterwards (used by inverses); otherwise rows auto-grow to fit. */
  rows: RowsSchema.optional(),
});

export const BlockMoveOpSchema = op("block.move", {
  page: ContainerIdSchema,
  block: BlockIdSchema,
  to: z.strictObject({
    section: SectionIdSchema,
    at: PositionSchema,
    /** Grid placement in the destination (kept/auto-placed if absent). */
    place: GridItemSchema.optional(),
    /** Stack column in the destination; `null` removes it. */
    column: z.int().min(0).max(3).nullable().optional(),
    /** Exact rows for the destination grid (used by inverses). */
    rows: RowsSchema.optional(),
  }),
  /** Exact rows for the source grid section after the block leaves (used by inverses). */
  fromRows: RowsSchema.optional(),
});

export const BlockDeleteOpSchema = op("block.delete", {
  page: ContainerIdSchema,
  block: BlockIdSchema,
  /** Exact rows for the grid section afterwards (used by inverses). */
  rows: RowsSchema.optional(),
});

export const GridPlaceOpSchema = op("grid.place", {
  page: ContainerIdSchema,
  section: SectionIdSchema,
  block: BlockIdSchema,
  bp: BreakpointSchema,
  /** The placement; `null` removes a tablet/mobile override (desktop is required). */
  rect: GridRectSchema.nullable(),
  /** Exact rows to set (used by inverses); otherwise rows auto-grow to fit the placement. */
  rows: RowsSchema.optional(),
});

export const SectionInsertOpSchema = op("section.insert", {
  page: PageIdSchema,
  at: PositionSchema,
  section: SectionSchema,
});

export const SectionMoveOpSchema = op("section.move", {
  page: PageIdSchema,
  section: SectionIdSchema,
  at: PositionSchema,
});

export const SectionDeleteOpSchema = op("section.delete", {
  page: PageIdSchema,
  section: SectionIdSchema,
});

/** Paths into the section (`"style.colorTheme"`, `"layout"`, `"label"`); not `id`/`blocks`. */
export const SectionUpdateOpSchema = op("section.update", {
  page: ContainerIdSchema,
  section: SectionIdSchema,
  ...PatchShape,
});

export const StylesPatchOpSchema = op("styles.patch", {
  patch: z.strictObject(PatchShape),
});

export const PageCreateOpSchema = op("page.create", {
  page: PageSchema,
  /** Optionally replace the navigation tree in the same step (e.g. to add the new page). */
  nav: z.array(NavItemSchema).optional(),
});

/** Paths into the page (`"title"`, `"slug"`, `"seo.description"`); not `id`/`sections`. */
export const PageUpdateOpSchema = op("page.update", {
  page: PageIdSchema,
  ...PatchShape,
});

export const PageDeleteOpSchema = op("page.delete", {
  page: PageIdSchema,
  /** Optionally replace the navigation tree in the same step (e.g. to drop links to the page). */
  nav: z.array(NavItemSchema).optional(),
});

export const NavUpdateOpSchema = op("nav.update", {
  tree: z.array(NavItemSchema),
});

/** Paths into `site.json` (`"title"`, `"header.sticky"`); navigation goes through `nav.update`. */
export const SiteUpdateOpSchema = op("site.update", { ...PatchShape });

/** Adds (or replaces) the metadata for a media file. */
export const MediaAddOpSchema = op("media.add", {
  path: MediaPathSchema,
  meta: MediaMetaSchema,
});

export const MediaRemoveOpSchema = op("media.remove", {
  path: MediaPathSchema,
});

/** Creates or replaces a collection item (the collection is created if needed). */
export const CollectionUpsertOpSchema = op("collection.upsert", {
  collection: CollectionNameSchema,
  item: CollectionItemSchema,
});

export const CollectionDeleteOpSchema = op("collection.delete", {
  collection: CollectionNameSchema,
  slug: SlugSchema,
  /**
   * Keep the collection's (now empty) entry. By default a collection with no items left is
   * removed from `collections` (its settings in `collectionConfigs` are untouched).
   */
  keepEmpty: z.boolean().optional(),
});

/** Creates, replaces or (with `config: null`) removes a collection's `_collection.json`. */
export const CollectionConfigUpsertOpSchema = op("collectionConfig.upsert", {
  collection: CollectionNameSchema,
  config: CollectionConfigSchema.nullable(),
  /** With `config: null`: keep an empty `collectionConfigs` object instead of dropping it. */
  keepEmpty: z.boolean().optional(),
});

export const OpSchema = z.discriminatedUnion("op", [
  BlockUpdateOpSchema,
  BlockInsertOpSchema,
  BlockMoveOpSchema,
  BlockDeleteOpSchema,
  GridPlaceOpSchema,
  SectionInsertOpSchema,
  SectionMoveOpSchema,
  SectionDeleteOpSchema,
  SectionUpdateOpSchema,
  StylesPatchOpSchema,
  PageCreateOpSchema,
  PageUpdateOpSchema,
  PageDeleteOpSchema,
  NavUpdateOpSchema,
  SiteUpdateOpSchema,
  MediaAddOpSchema,
  MediaRemoveOpSchema,
  CollectionUpsertOpSchema,
  CollectionDeleteOpSchema,
  CollectionConfigUpsertOpSchema,
]);

export type Op = z.infer<typeof OpSchema>;
export type OpType = Op["op"];
export type OpOf<T extends OpType> = Extract<Op, { op: T }>;
export type BlockUpdateOp = OpOf<"block.update">;
export type BlockInsertOp = OpOf<"block.insert">;
export type BlockMoveOp = OpOf<"block.move">;
export type BlockDeleteOp = OpOf<"block.delete">;
export type GridPlaceOp = OpOf<"grid.place">;
export type SectionInsertOp = OpOf<"section.insert">;
export type SectionMoveOp = OpOf<"section.move">;
export type SectionDeleteOp = OpOf<"section.delete">;
export type SectionUpdateOp = OpOf<"section.update">;
export type StylesPatchOp = OpOf<"styles.patch">;
export type PageCreateOp = OpOf<"page.create">;
export type PageUpdateOp = OpOf<"page.update">;
export type PageDeleteOp = OpOf<"page.delete">;
export type NavUpdateOp = OpOf<"nav.update">;
export type SiteUpdateOp = OpOf<"site.update">;
export type MediaAddOp = OpOf<"media.add">;
export type MediaRemoveOp = OpOf<"media.remove">;
export type CollectionUpsertOp = OpOf<"collection.upsert">;
export type CollectionDeleteOp = OpOf<"collection.delete">;
export type CollectionConfigUpsertOp = OpOf<"collectionConfig.upsert">;

/** Every op type, in vocabulary order. */
export const OP_TYPES = OpSchema.options.map((o) => o.shape.op.value) as OpType[];

/** An op without its metadata, as produced by builders before stamping. */
export type OpBody<T extends Op = Op> = T extends Op ? Omit<T, keyof OpMeta> : never;

/** Attach metadata to an op body. */
export function stamp<T extends Op>(body: OpBody<T>, meta: OpMeta): T {
  return { ...body, id: meta.id, actor: meta.actor, ts: meta.ts } as unknown as T;
}

/** Parse untrusted JSON (WebSocket, MCP, CLI) into an `Op`. */
export function parseOp(
  value: unknown,
): { ok: true; op: Op } | { ok: false; errors: { path: (string | number)[]; message: string }[] } {
  const r = OpSchema.safeParse(value);
  if (r.success) return { ok: true, op: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({
      path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
      message: i.message,
    })),
  };
}
