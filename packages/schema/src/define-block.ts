import { z } from "zod";
import {
  BLOCK_TYPE_RE,
  type Block,
  type BlockStyle,
  BlockStyleSchema,
  isStyleSlot,
  type StyleSlot,
  styleSlotsUsed,
} from "./block";
import {
  type FieldMeta,
  type FieldsShape,
  type FieldValues,
  fieldsMeta,
  fieldsSchema,
  type JsonValue,
} from "./fields";
import { type BlockId, newId } from "./ids";

/**
 * Block definitions (arch §4.1). One definition drives three consumers: the renderer (HTML),
 * Studio (fields, panels, menus, defaults) and MCP (tool schemas and AI guidance). The render
 * function's return type is generic so this package has no React dependency.
 */

export const BLOCK_CATEGORIES = [
  "text",
  "media",
  "layout",
  "navigation",
  "social-proof",
  "forms",
  "commerce",
  "collections",
  "contact",
  "embed",
  "data",
] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

/** Guidance for agents: what the block is for, when to use it, what to avoid. */
export interface BlockAiGuidance {
  purpose: string;
  whenToUse: string;
  avoid?: string;
}

/** Upgrades `fields` from version `n` (the key) to `n + 1`. Must be pure. */
export type BlockFieldsMigration = (fields: Record<string, unknown>) => Record<string, unknown>;

export interface BlockRenderProps<Fields, Variant extends string> {
  id: BlockId;
  fields: Fields;
  variant: Variant;
  style: BlockStyle | undefined;
  block: Block;
}

export interface BlockDefaults<F extends FieldsShape, V extends string> {
  variant?: V;
  fields?: Partial<FieldValues<F>>;
  style?: BlockStyle;
}

export interface BlockDefinitionInput<F extends FieldsShape, V extends string, R> {
  type: string;
  version: number;
  category: BlockCategory;
  label: string;
  /** Icon name from Studio's icon set (e.g. a Lucide name such as "quote"). */
  icon: string;
  description?: string;
  fields: F;
  variants?: readonly V[];
  styleSlots?: readonly StyleSlot[];
  defaults?: BlockDefaults<F, V>;
  ai: BlockAiGuidance;
  /** Field migrations keyed by the version they upgrade *from*. */
  migrate?: Readonly<Record<number, BlockFieldsMigration>>;
  render: (props: BlockRenderProps<FieldValues<F>, V>) => R;
}

/** JSON-serializable summary of a block definition (Studio inspectors, MCP, AGENTS.md). */
export interface BlockMeta {
  type: string;
  version: number;
  category: BlockCategory;
  label: string;
  icon: string;
  description?: string;
  fields: Record<string, FieldMeta>;
  variants: string[];
  styleSlots: StyleSlot[];
  defaults: { variant?: string; fields: Record<string, JsonValue>; style?: BlockStyle };
  ai: BlockAiGuidance;
}

export interface BlockIssue {
  path: (string | number)[];
  message: string;
}

export type BlockValidation<F extends FieldsShape> =
  | { success: true; fields: FieldValues<F> }
  | { success: false; issues: BlockIssue[] };

export interface BlockDefinition<
  F extends FieldsShape = FieldsShape,
  V extends string = string,
  R = unknown,
> extends Readonly<
    Omit<BlockDefinitionInput<F, V, R>, "variants" | "styleSlots" | "defaults" | "render">
  > {
  /** Render the block (declared as a method so definitions are assignable to `AnyBlockDefinition`). */
  render(props: BlockRenderProps<FieldValues<F>, V>): R;
  readonly variants: readonly V[];
  readonly styleSlots: readonly StyleSlot[];
  readonly defaults: BlockDefaults<F, V>;
  /** Strict zod schema for this block's `fields`. */
  readonly fieldsSchema: z.ZodType<FieldValues<F>>;
  /** Serializable metadata. */
  readonly meta: BlockMeta;
  /** Validate a stored block instance of this type (type, version, fields, variant, style slots). */
  validate(block: Block): BlockValidation<F>;
  /** Create a new instance from field defaults + `defaults` + `init`. Throws if invalid. */
  create(init?: {
    id?: BlockId;
    fields?: Partial<FieldValues<F>>;
    variant?: V;
    style?: BlockStyle;
    column?: number;
  }): Block;
}

// biome-ignore lint/suspicious/noExplicitAny: registry-friendly erased definition type
export type AnyBlockDefinition = BlockDefinition<any, any, any>;

function issuesOf(error: z.ZodError, prefix: (string | number)[]): BlockIssue[] {
  return error.issues.map((i) => ({
    path: [...prefix, ...i.path.map((p) => (typeof p === "symbol" ? String(p) : p))],
    message: i.message,
  }));
}

/** Define a block type. Validates the definition itself and precomputes schema + metadata. */
export function defineBlock<
  const F extends FieldsShape,
  const V extends string = never,
  R = unknown,
>(input: BlockDefinitionInput<F, V, R>): BlockDefinition<F, V, R> {
  const where = `defineBlock("${input.type}")`;
  if (!BLOCK_TYPE_RE.test(input.type)) throw new Error(`${where}: invalid block type name`);
  if (!Number.isInteger(input.version) || input.version < 1)
    throw new Error(`${where}: version must be an integer ≥ 1`);

  const variants = [...(input.variants ?? [])] as V[];
  if (new Set(variants).size !== variants.length) throw new Error(`${where}: duplicate variants`);
  for (const v of variants) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v))
      throw new Error(`${where}: invalid variant name "${v}"`);
  }
  const styleSlots = [...(input.styleSlots ?? [])];
  for (const s of styleSlots)
    if (!isStyleSlot(s)) throw new Error(`${where}: unknown style slot "${s}"`);

  const schema = fieldsSchema(input.fields);
  const defaults: BlockDefaults<F, V> = { ...(input.defaults ?? {}) };
  if (defaults.variant !== undefined && !variants.includes(defaults.variant)) {
    throw new Error(`${where}: default variant "${defaults.variant}" is not one of its variants`);
  }
  if (variants.length > 0 && defaults.variant === undefined) defaults.variant = variants[0] as V;
  if (defaults.fields) {
    const partial = (schema as unknown as z.ZodObject).partial().safeParse(defaults.fields);
    if (!partial.success)
      throw new Error(`${where}: invalid default fields\n${z.prettifyError(partial.error)}`);
  }
  if (defaults.style) {
    const parsed = BlockStyleSchema.safeParse(defaults.style);
    if (!parsed.success)
      throw new Error(`${where}: invalid default style\n${z.prettifyError(parsed.error)}`);
    for (const slot of styleSlotsUsed(parsed.data)) {
      if (!styleSlots.includes(slot))
        throw new Error(`${where}: default style uses undeclared slot "${slot}"`);
    }
  }
  for (const key of Object.keys(input.migrate ?? {})) {
    const from = Number(key);
    if (!Number.isInteger(from) || from < 1 || from >= input.version) {
      throw new Error(
        `${where}: migration key ${key} must be a version between 1 and ${input.version - 1}`,
      );
    }
  }

  const fieldMetas = fieldsMeta(input.fields);
  const fieldDefaults: Record<string, JsonValue> = {};
  for (const [key, meta] of Object.entries(fieldMetas))
    if (meta.default !== undefined) fieldDefaults[key] = meta.default;
  const metaDefaults: BlockMeta["defaults"] = {
    fields: { ...fieldDefaults, ...((defaults.fields ?? {}) as Record<string, JsonValue>) },
  };
  if (defaults.variant !== undefined) metaDefaults.variant = defaults.variant;
  if (defaults.style !== undefined) metaDefaults.style = defaults.style;

  const meta: BlockMeta = {
    type: input.type,
    version: input.version,
    category: input.category,
    label: input.label,
    icon: input.icon,
    fields: fieldMetas,
    variants: [...variants],
    styleSlots,
    defaults: metaDefaults,
    ai: { ...input.ai },
  };
  if (input.description !== undefined) meta.description = input.description;

  const validate = (block: Block): BlockValidation<F> => {
    const issues: BlockIssue[] = [];
    if (block.type !== input.type)
      issues.push({ path: ["type"], message: `Expected block type ${input.type}` });
    if (block.v > input.version) {
      issues.push({
        path: ["v"],
        message: `Block version ${block.v} is newer than this library (${input.version})`,
      });
    } else if (block.v < input.version) {
      issues.push({
        path: ["v"],
        message: `Block version ${block.v} needs migrating to ${input.version}`,
      });
    }
    const parsed = schema.safeParse(block.fields);
    if (!parsed.success) issues.push(...issuesOf(parsed.error, ["fields"]));
    if (block.variant !== undefined && !variants.includes(block.variant as V)) {
      issues.push({
        path: ["variant"],
        message: variants.length
          ? `Unknown variant "${block.variant}"; expected one of ${variants.join(", ")}`
          : `${input.type} has no variants`,
      });
    }
    for (const slot of styleSlotsUsed(block.style)) {
      if (!styleSlots.includes(slot)) {
        issues.push({
          path: ["style", ...slot.split(".")],
          message: `${input.type} does not support the "${slot}" style`,
        });
      }
    }
    return issues.length || !parsed.success
      ? { success: false, issues }
      : { success: true, fields: parsed.data };
  };

  const create: BlockDefinition<F, V, R>["create"] = (init = {}) => {
    const block: Block = {
      id: init.id ?? newId("blk"),
      type: input.type,
      v: input.version,
      fields: structuredClone({ ...metaDefaults.fields, ...(init.fields ?? {}) }) as Record<
        string,
        unknown
      >,
    };
    if (init.column !== undefined) block.column = init.column;
    const variant = init.variant ?? defaults.variant;
    if (variant !== undefined) block.variant = variant;
    const style = init.style ?? defaults.style;
    if (style !== undefined) block.style = structuredClone(style);
    const result = validate(block);
    if (!result.success) {
      throw new Error(
        `${where}.create: ${result.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
      );
    }
    return block;
  };

  const def: BlockDefinition<F, V, R> = {
    ...input,
    variants,
    styleSlots,
    defaults,
    fieldsSchema: schema,
    meta,
    validate,
    create,
  };
  return Object.freeze(def);
}
