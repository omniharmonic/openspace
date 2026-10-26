import { z } from "zod";
import { COLLECTION_KINDS, type CollectionKind } from "./collections";
import { type Form, FormSchema } from "./form";
import {
  type AspectRatio,
  CollectionNameSchema,
  HttpsUrlSchema,
  type ImageValue,
  ImageValueSchema,
  type Link,
  LinkSchema,
  type MediaValue,
  MediaValueSchema,
  SlugSchema,
} from "./primitives";
import { plainText } from "./richtext";
import {
  BLOCK_NODE_TYPES,
  type BlockNodeType,
  blockTypesUsed,
  MARK_TYPES,
  type MarkType,
  marksUsed,
  type RichTextDoc,
  RichTextDocSchema,
} from "./richtext-schema";
import { type ColorToken, ColorTokenSchema, type ColorValue, ColorValueSchema } from "./tokens";

/**
 * Field builders (`f.*`) for block definitions (arch §4.1). Each builder returns a `FieldDef`
 * carrying (a) a zod schema for the value and (b) JSON-serializable metadata that Studio's
 * inspectors and the MCP tool schemas are generated from.
 */

export const FIELD_KINDS = [
  "text",
  "richText",
  "image",
  "media",
  "link",
  "select",
  "boolean",
  "number",
  "color",
  "list",
  "reference",
  "form",
  "embed",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// --- metadata ---------------------------------------------------------------------------------

/** Metadata common to every field kind. */
export interface FieldMetaBase {
  kind: FieldKind;
  /** Inspector label. Filled from the field key by `defineBlock` when omitted. */
  label?: string;
  /** Short help text shown under the control and used as the JSON Schema description. */
  help?: string;
  /** Extra guidance for AI agents (MCP), e.g. "3–9 words; no exclamation marks". */
  ai?: string;
  optional: boolean;
  default?: JsonValue;
}

export interface TextFieldMeta extends FieldMetaBase {
  kind: "text";
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
}
export interface RichTextFieldMeta extends FieldMetaBase {
  kind: "richText";
  marks: MarkType[];
  blocks: BlockNodeType[];
  /** Maximum plain-text length. */
  maxLength?: number;
}
export interface ImageFieldMeta extends FieldMetaBase {
  kind: "image";
  /** Preferred crop, a rendering hint for Studio's cropper. */
  aspect?: AspectRatio;
}
export interface MediaFieldMeta extends FieldMetaBase {
  kind: "media";
  kinds: Array<"video" | "audio">;
}
export interface LinkFieldMeta extends FieldMetaBase {
  kind: "link";
  allow: Array<Link["type"]>;
}
export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
}
export interface SelectFieldMeta extends FieldMetaBase {
  kind: "select";
  options: SelectOption[];
  /** Hint for the inspector control. */
  display?: "dropdown" | "segmented" | "radio";
}
export interface BooleanFieldMeta extends FieldMetaBase {
  kind: "boolean";
}
export interface NumberFieldMeta extends FieldMetaBase {
  kind: "number";
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
}
export interface ColorFieldMeta extends FieldMetaBase {
  kind: "color";
  /** Whether exact CSS colors are allowed in addition to palette tokens (Designer role). */
  allowCustom: boolean;
}
export interface ListFieldMeta extends FieldMetaBase {
  kind: "list";
  fields: Record<string, FieldMeta>;
  min?: number;
  max?: number;
  /** Which item field titles the item in the inspector (e.g. "question"). */
  itemLabel?: string;
}
export interface ReferenceFieldMeta extends FieldMetaBase {
  kind: "reference";
  /** Collection kinds that can be referenced. */
  collectionKinds: CollectionKind[];
  /** Max items when picking explicitly. */
  maxItems?: number;
}
export interface FormFieldMeta extends FieldMetaBase {
  kind: "form";
}
export interface EmbedFieldMeta extends FieldMetaBase {
  kind: "embed";
  allow: Array<"url" | "code">;
}

export type FieldMeta =
  | TextFieldMeta
  | RichTextFieldMeta
  | ImageFieldMeta
  | MediaFieldMeta
  | LinkFieldMeta
  | SelectFieldMeta
  | BooleanFieldMeta
  | NumberFieldMeta
  | ColorFieldMeta
  | ListFieldMeta
  | ReferenceFieldMeta
  | FormFieldMeta
  | EmbedFieldMeta;

// --- field definitions ------------------------------------------------------------------------

/** A field: value schema + serializable metadata. `O` tracks optionality at the type level. */
export interface FieldDef<
  T = unknown,
  O extends boolean = boolean,
  M extends FieldMeta = FieldMeta,
> {
  readonly kind: M["kind"];
  readonly optional: O;
  /** Schema for a present value (optionality is applied by the containing object). */
  readonly schema: z.ZodType<T>;
  readonly meta: M;
}

// biome-ignore lint/suspicious/noExplicitAny: variance helper for heterogeneous field maps
export type AnyFieldDef = FieldDef<any, boolean, FieldMeta>;
export type FieldsShape = Record<string, AnyFieldDef>;

export type FieldValue<D> = D extends FieldDef<infer T, boolean, FieldMeta> ? T : never;

type OptionalKeys<F extends FieldsShape> = {
  [K in keyof F]: F[K]["optional"] extends true ? K : never;
}[keyof F];
type RequiredKeys<F extends FieldsShape> = Exclude<keyof F, OptionalKeys<F>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The value type of a block's `fields` object. */
export type FieldValues<F extends FieldsShape> = Simplify<
  { [K in RequiredKeys<F>]: FieldValue<F[K]> } & { [K in OptionalKeys<F>]?: FieldValue<F[K]> }
>;

interface CommonOptions<T> {
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  default?: T;
}
type Opt<O> = O extends { optional: true } ? true : false;

function make<T, O extends boolean, M extends FieldMeta>(
  schema: z.ZodType<T>,
  meta: Omit<M, "optional" | "label" | "help" | "ai" | "default">,
  options: CommonOptions<T> | undefined,
): FieldDef<T, O, M> {
  const full = { ...meta, optional: options?.optional === true } as M;
  if (options?.label !== undefined) full.label = options.label;
  if (options?.help !== undefined) full.help = options.help;
  if (options?.ai !== undefined) full.ai = options.ai;
  if (options?.default !== undefined) {
    const parsed = schema.safeParse(options.default);
    if (!parsed.success) {
      throw new Error(`Invalid default for ${meta.kind} field: ${z.prettifyError(parsed.error)}`);
    }
    full.default = options.default as JsonValue;
  }
  return {
    kind: meta.kind as M["kind"],
    optional: (options?.optional === true) as O,
    schema,
    meta: full,
  };
}

/** Build the zod object schema for a field map (strict: unknown keys are rejected). */
export function fieldsSchema<F extends FieldsShape>(fields: F): z.ZodType<FieldValues<F>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, def] of Object.entries(fields))
    shape[key] = def.optional ? def.schema.optional() : def.schema;
  return z.strictObject(shape) as unknown as z.ZodType<FieldValues<F>>;
}

/** Turn a field key into a label: `photoAlt` → "Photo alt", `cta_label` → "Cta label". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Serializable metadata for a field map, with labels filled in. */
export function fieldsMeta(fields: FieldsShape): Record<string, FieldMeta> {
  const out: Record<string, FieldMeta> = {};
  for (const [key, def] of Object.entries(fields))
    out[key] = { ...def.meta, label: def.meta.label ?? humanize(key) };
  return out;
}

// --- value schemas specific to fields -----------------------------------------------------------

/** Value of a `reference` field: items from a collection, picked explicitly or by filter. */
export const ReferenceValueSchema = z.strictObject({
  collection: CollectionNameSchema,
  /** Explicit picks (slugs), in display order. Absent means "use the filter". */
  items: z.array(SlugSchema).max(100).optional(),
  filter: z
    .strictObject({
      categories: z.array(SlugSchema).optional(),
      tags: z.array(z.string()).optional(),
      featured: z.boolean().optional(),
      upcoming: z.boolean().optional(),
    })
    .optional(),
  sort: z.enum(["date-desc", "date-asc", "title", "manual"]).optional(),
  limit: z.int().min(1).max(100).optional(),
});
export type ReferenceValue = z.infer<typeof ReferenceValueSchema>;

/** Value of an `embed` field: a sanitized https URL (oEmbed) or a code snippet (sandboxed). */
export const EmbedValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("url"), url: HttpsUrlSchema }),
  z.strictObject({ type: z.literal("code"), code: z.string().min(1).max(50_000) }),
]);
export type EmbedValue = z.infer<typeof EmbedValueSchema>;

// --- builders -------------------------------------------------------------------------------------

export interface TextOptions extends CommonOptions<string> {
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
}

function text<const O extends TextOptions>(options?: O): FieldDef<string, Opt<O>, TextFieldMeta> {
  let schema = z.string();
  if (options?.minLength !== undefined) schema = schema.min(options.minLength);
  if (options?.maxLength !== undefined) schema = schema.max(options.maxLength);
  const value = options?.multiline
    ? schema
    : schema.refine((s) => !/[\r\n]/.test(s), { message: "Must be a single line" });
  const meta: Omit<TextFieldMeta, "optional"> = { kind: "text" };
  if (options?.minLength !== undefined) meta.minLength = options.minLength;
  if (options?.maxLength !== undefined) meta.maxLength = options.maxLength;
  if (options?.multiline) meta.multiline = true;
  if (options?.placeholder !== undefined) meta.placeholder = options.placeholder;
  return make(value, meta, options);
}

export interface RichTextOptions extends CommonOptions<RichTextDoc> {
  marks?: readonly MarkType[];
  blocks?: readonly BlockNodeType[];
  maxLength?: number;
}

function richText<const O extends RichTextOptions>(
  options?: O,
): FieldDef<RichTextDoc, Opt<O>, RichTextFieldMeta> {
  const marks = [...(options?.marks ?? MARK_TYPES)];
  const blocks = [...(options?.blocks ?? BLOCK_NODE_TYPES)];
  const schema = RichTextDocSchema.superRefine((doc, ctx) => {
    for (const m of marksUsed(doc)) {
      if (!marks.includes(m))
        ctx.addIssue({ code: "custom", message: `The "${m}" mark is not allowed here` });
    }
    for (const b of blockTypesUsed(doc)) {
      if (!blocks.includes(b))
        ctx.addIssue({ code: "custom", message: `"${b}" is not allowed here` });
    }
    if (options?.maxLength !== undefined && plainText(doc).length > options.maxLength) {
      ctx.addIssue({
        code: "custom",
        message: `Text is longer than ${options.maxLength} characters`,
      });
    }
  });
  const meta: Omit<RichTextFieldMeta, "optional"> = { kind: "richText", marks, blocks };
  if (options?.maxLength !== undefined) meta.maxLength = options.maxLength;
  return make(schema, meta, options);
}

export interface ImageOptions extends CommonOptions<ImageValue> {
  aspect?: AspectRatio;
}
function image<const O extends ImageOptions>(
  options?: O,
): FieldDef<ImageValue, Opt<O>, ImageFieldMeta> {
  const meta: Omit<ImageFieldMeta, "optional"> = { kind: "image" };
  if (options?.aspect) meta.aspect = options.aspect;
  return make(ImageValueSchema, meta, options);
}

export interface MediaOptions extends CommonOptions<MediaValue> {
  kinds?: ReadonlyArray<"video" | "audio">;
}
function media<const O extends MediaOptions>(
  options?: O,
): FieldDef<MediaValue, Opt<O>, MediaFieldMeta> {
  const kinds = [...(options?.kinds ?? (["video", "audio"] as const))];
  const schema = MediaValueSchema.refine((v) => kinds.includes(v.kind), {
    message: `Expected ${kinds.join(" or ")}`,
  });
  return make(schema, { kind: "media", kinds }, options);
}

const LINK_TYPES: Array<Link["type"]> = ["page", "item", "url", "email", "phone", "file", "anchor"];
export interface LinkOptions extends CommonOptions<Link> {
  allow?: ReadonlyArray<Link["type"]>;
}
function link<const O extends LinkOptions>(options?: O): FieldDef<Link, Opt<O>, LinkFieldMeta> {
  const allow = [...(options?.allow ?? LINK_TYPES)];
  const schema = LinkSchema.refine((l) => allow.includes(l.type), {
    message: `Link type must be one of ${allow.join(", ")}`,
  });
  return make(schema, { kind: "link", allow }, options);
}

export interface SelectOptions<V extends string> extends CommonOptions<V> {
  options: readonly (V | SelectOption<V>)[];
  display?: SelectFieldMeta["display"];
}
function select<const V extends string, const O extends SelectOptions<V>>(
  options: O & SelectOptions<V>,
): FieldDef<V, Opt<O>, SelectFieldMeta> {
  const opts: SelectOption<V>[] = options.options.map((o) =>
    typeof o === "string" ? { value: o, label: humanize(o) } : { value: o.value, label: o.label },
  );
  if (opts.length === 0) throw new Error("select fields need at least one option");
  const values = opts.map((o) => o.value);
  if (new Set(values).size !== values.length) throw new Error("select options must be unique");
  const schema = z.enum(values as [V, ...V[]]) as unknown as z.ZodType<V>;
  const meta: Omit<SelectFieldMeta, "optional"> = { kind: "select", options: opts };
  if (options.display) meta.display = options.display;
  return make(schema, meta, options);
}

function boolean<const O extends CommonOptions<boolean>>(
  options?: O,
): FieldDef<boolean, Opt<O>, BooleanFieldMeta> {
  return make(z.boolean(), { kind: "boolean" }, options);
}

export interface NumberOptions extends CommonOptions<number> {
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
}
function number<const O extends NumberOptions>(
  options?: O,
): FieldDef<number, Opt<O>, NumberFieldMeta> {
  let schema = options?.integer ? z.int() : z.number();
  if (options?.min !== undefined) schema = schema.min(options.min);
  if (options?.max !== undefined) schema = schema.max(options.max);
  const meta: Omit<NumberFieldMeta, "optional"> = { kind: "number" };
  for (const key of ["min", "max", "step", "integer", "unit"] as const) {
    if (options?.[key] !== undefined) (meta as Record<string, unknown>)[key] = options[key];
  }
  return make(schema, meta, options);
}

export interface ColorOptions extends CommonOptions<string> {
  /** Also allow exact CSS colors (Designer mode); otherwise only palette tokens. */
  allowCustom?: boolean;
}
/** A palette token (`accent`, `neutral-200`), or with `allowCustom` also an exact CSS color. */
function color<const O extends ColorOptions>(
  options?: O,
): FieldDef<ColorToken | ColorValue, Opt<O>, ColorFieldMeta> {
  const allowCustom = options?.allowCustom === true;
  const schema: z.ZodType<string> = allowCustom ? ColorValueSchema : ColorTokenSchema;
  return make(schema, { kind: "color", allowCustom }, options);
}

export interface ListOptions<F extends FieldsShape> extends CommonOptions<FieldValues<F>[]> {
  fields: F;
  min?: number;
  max?: number;
  itemLabel?: keyof F & string;
}
function list<const F extends FieldsShape, const O extends ListOptions<F>>(
  options: O & ListOptions<F>,
): FieldDef<FieldValues<F>[], Opt<O>, ListFieldMeta> {
  let schema = z.array(fieldsSchema(options.fields));
  if (options.min !== undefined) schema = schema.min(options.min);
  if (options.max !== undefined) schema = schema.max(options.max);
  if (options.itemLabel !== undefined && !(options.itemLabel in options.fields)) {
    throw new Error(`list itemLabel "${options.itemLabel}" is not one of its fields`);
  }
  const meta: Omit<ListFieldMeta, "optional"> = {
    kind: "list",
    fields: fieldsMeta(options.fields),
  };
  if (options.min !== undefined) meta.min = options.min;
  if (options.max !== undefined) meta.max = options.max;
  if (options.itemLabel !== undefined) meta.itemLabel = options.itemLabel;
  return make(schema as unknown as z.ZodType<FieldValues<F>[]>, meta, options);
}

export interface ReferenceOptions extends CommonOptions<ReferenceValue> {
  collectionKinds?: readonly CollectionKind[];
  maxItems?: number;
}
function reference<const O extends ReferenceOptions>(
  options?: O,
): FieldDef<ReferenceValue, Opt<O>, ReferenceFieldMeta> {
  const collectionKinds = [...(options?.collectionKinds ?? COLLECTION_KINDS)];
  const max = options?.maxItems;
  const schema =
    max === undefined
      ? ReferenceValueSchema
      : ReferenceValueSchema.refine((v) => (v.items?.length ?? 0) <= max, {
          message: `Pick at most ${max} items`,
        });
  const meta: Omit<ReferenceFieldMeta, "optional"> = { kind: "reference", collectionKinds };
  if (max !== undefined) meta.maxItems = max;
  return make(schema, meta, options);
}

function form<const O extends CommonOptions<Form>>(
  options?: O,
): FieldDef<Form, Opt<O>, FormFieldMeta> {
  return make(FormSchema, { kind: "form" }, options);
}

export interface EmbedOptions extends CommonOptions<EmbedValue> {
  allow?: ReadonlyArray<"url" | "code">;
}
function embed<const O extends EmbedOptions>(
  options?: O,
): FieldDef<EmbedValue, Opt<O>, EmbedFieldMeta> {
  const allow = [...(options?.allow ?? (["url", "code"] as const))];
  const schema = EmbedValueSchema.refine((v) => allow.includes(v.type), {
    message: `Embed must be ${allow.join(" or ")}`,
  });
  return make(schema, { kind: "embed", allow }, options);
}

/** Field builders. */
export const f = {
  text,
  richText,
  image,
  media,
  link,
  select,
  boolean,
  number,
  color,
  list,
  reference,
  form,
  embed,
} as const;
