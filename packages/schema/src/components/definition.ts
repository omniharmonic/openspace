import { z } from "zod";
import { type AnyBlockDefinition, type BlockFieldsMigration, defineBlock } from "../define-block";
import { type AnyFieldDef, type FieldsShape, f, fieldsSchema, type JsonValue } from "../fields";
import { newId } from "../ids";
import { LinkSchema } from "../primitives";
import { named } from "../registry";
import { responsive } from "../responsive";
import { plainText } from "../richtext";
import { BLOCK_NODE_TYPES, MARK_TYPES } from "../richtext-schema";
import { ContentWidthSchema, MinHeightSchema, type Section } from "../section";
import { ColorThemeSchema, SpaceTokenSchema } from "../tokens";
import { scopeCss } from "./css";
import { checkComponentJs } from "./js";
import {
  checkTemplate,
  expandTemplate,
  parseTemplate,
  type TemplateField,
  type TNode,
  type XNode,
} from "./template";

/**
 * Custom components (ADR custom-components): site-level, versioned section designs with their own
 * template, scoped CSS and optional behaviour JavaScript, exposing typed fields that owners edit
 * in Studio like any block. Stored as `content/components/<name>.json`; instances are blocks of
 * type `component/<name>`.
 */

/** The site-kit release that first renders component instances (publish gate). */
export const COMPONENTS_MIN_KIT = "0.1.11";

export const COMPONENT_NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const COMPONENT_TYPE_PREFIX = "component/";

/** `editorial-hero` → `component/editorial-hero`. */
export const componentType = (name: string) => `${COMPONENT_TYPE_PREFIX}${name}`;

/** `component/editorial-hero` → `editorial-hero`; null for other block types. */
export function componentNameOf(type: string): string | null {
  if (!type.startsWith(COMPONENT_TYPE_PREFIX)) return null;
  const name = type.slice(COMPONENT_TYPE_PREFIX.length);
  return COMPONENT_NAME_RE.test(name) ? name : null;
}

export const ComponentNameSchema = z.string().max(40).regex(COMPONENT_NAME_RE, {
  message: "Use lowercase words joined by hyphens, like editorial-hero",
});

const FIELD_KEY_RE = /^[a-z][a-zA-Z0-9]*$/;
const FieldKeySchema = z
  .string()
  .max(40)
  .regex(FIELD_KEY_RE, { message: "Field names are camelCase letters and digits, like ctaLabel" });

// --- field specs ----------------------------------------------------------------------------------

const common = {
  label: z.string().min(1).max(60).optional(),
  help: z.string().max(200).optional(),
  ai: z.string().max(300).optional(),
  optional: z.boolean().optional(),
};

const LINK_TYPES = ["page", "item", "url", "email", "phone", "file", "anchor"] as const;

export interface TextFieldSpec {
  kind: "text";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
}
export interface RichTextFieldSpec {
  kind: "richText";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  marks?: Array<(typeof MARK_TYPES)[number]>;
  blocks?: Array<(typeof BLOCK_NODE_TYPES)[number]>;
  maxLength?: number;
}
export interface ImageFieldSpec {
  kind: "image";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  aspect?: string;
}
export interface LinkFieldSpec {
  kind: "link";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  allow?: Array<(typeof LINK_TYPES)[number]>;
}
export interface SelectFieldSpec {
  kind: "select";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  options: Array<string | { value: string; label: string }>;
  display?: "dropdown" | "segmented" | "radio";
}
export interface BooleanFieldSpec {
  kind: "boolean";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
}
export interface NumberFieldSpec {
  kind: "number";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
}
export interface ColorFieldSpec {
  kind: "color";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
}
export interface ListFieldSpec {
  kind: "list";
  label?: string;
  help?: string;
  ai?: string;
  optional?: boolean;
  fields: Record<string, ComponentFieldSpec>;
  min?: number;
  max?: number;
  itemLabel?: string;
}
export type ComponentFieldSpec =
  | TextFieldSpec
  | RichTextFieldSpec
  | ImageFieldSpec
  | LinkFieldSpec
  | SelectFieldSpec
  | BooleanFieldSpec
  | NumberFieldSpec
  | ColorFieldSpec
  | ListFieldSpec;

export const COMPONENT_FIELD_KINDS = [
  "text",
  "richText",
  "image",
  "link",
  "select",
  "boolean",
  "number",
  "color",
  "list",
] as const;

export const ComponentFieldSpecSchema: z.ZodType<ComponentFieldSpec> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("text"),
      ...common,
      minLength: z.int().min(0).max(10_000).optional(),
      maxLength: z.int().min(1).max(10_000).optional(),
      multiline: z.boolean().optional(),
      placeholder: z.string().max(120).optional(),
    }),
    z.strictObject({
      kind: z.literal("richText"),
      ...common,
      marks: z.array(z.enum(MARK_TYPES)).optional(),
      blocks: z.array(z.enum(BLOCK_NODE_TYPES)).optional(),
      maxLength: z.int().min(1).max(50_000).optional(),
    }),
    z.strictObject({
      kind: z.literal("image"),
      ...common,
      aspect: z
        .string()
        .regex(/^(?:original|[1-9]\d{0,2}:[1-9]\d{0,2})$/)
        .optional(),
    }),
    z.strictObject({
      kind: z.literal("link"),
      ...common,
      allow: z.array(z.enum(LINK_TYPES)).min(1).optional(),
    }),
    z.strictObject({
      kind: z.literal("select"),
      ...common,
      options: z
        .array(
          z.union([
            z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            z.strictObject({
              value: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
              label: z.string().min(1).max(60),
            }),
          ]),
        )
        .min(1)
        .max(30),
      display: z.enum(["dropdown", "segmented", "radio"]).optional(),
    }),
    z.strictObject({ kind: z.literal("boolean"), ...common }),
    z.strictObject({
      kind: z.literal("number"),
      ...common,
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().positive().optional(),
      integer: z.boolean().optional(),
      unit: z.string().max(12).optional(),
    }),
    z.strictObject({ kind: z.literal("color"), ...common }),
    z.strictObject({
      kind: z.literal("list"),
      ...common,
      fields: z.record(FieldKeySchema, ComponentFieldSpecSchema),
      min: z.int().min(0).max(100).optional(),
      max: z.int().min(1).max(100).optional(),
      itemLabel: z.string().optional(),
    }),
  ]),
) as unknown as z.ZodType<ComponentFieldSpec>;

/** Declarative migration from version `n` (the key) to `n + 1` — no code. */
export const ComponentMigrationSchema = z.strictObject({
  /** Rename top-level fields: `{ "title": "headline" }`. */
  rename: z.record(FieldKeySchema, FieldKeySchema).optional(),
  /** Values for new fields (applied when the field is missing). */
  set: z.record(FieldKeySchema, z.unknown()).optional(),
  /** Fields to drop. */
  remove: z.array(FieldKeySchema).optional(),
});
export type ComponentMigration = z.infer<typeof ComponentMigrationSchema>;

const ComponentDefinitionBase = z.strictObject({
  name: ComponentNameSchema,
  label: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  version: z.int().min(1).max(1000),
  /** Gallery grouping hint (a preset category such as `hero`), free text. */
  category: z
    .string()
    .regex(/^[a-z]+(?:-[a-z]+)*$/)
    .max(30)
    .optional(),
  tags: z.array(z.string().max(30)).max(12).optional(),
  fields: z.record(FieldKeySchema, ComponentFieldSpecSchema),
  /** A complete, valid instance: what a new section starts with (and the gallery shows). */
  defaults: z.record(z.string(), z.unknown()),
  template: z.string().min(1),
  css: z.string().optional(),
  js: z.string().optional(),
  /** Section defaults for new instances. */
  section: z
    .strictObject({
      width: ContentWidthSchema.optional(),
      padding: responsive(SpaceTokenSchema).optional(),
      colorTheme: ColorThemeSchema.optional(),
      minHeight: responsive(MinHeightSchema).optional(),
    })
    .optional(),
  ai: z
    .strictObject({
      purpose: z.string().min(1).max(400),
      whenToUse: z.string().min(1).max(400),
      avoid: z.string().max(400).optional(),
    })
    .optional(),
  migrations: z.record(z.string().regex(/^[1-9]\d*$/), ComponentMigrationSchema).optional(),
});

export type ComponentDefinition = z.infer<typeof ComponentDefinitionBase> & {
  fields: Record<string, ComponentFieldSpec>;
};

export interface ComponentIssue {
  /** Which part of the definition: `fields`, `template`, `css`, `js`, `defaults`… */
  where: "name" | "fields" | "defaults" | "template" | "css" | "js" | "migrations" | "definition";
  message: string;
  line?: number;
}

// --- compile ----------------------------------------------------------------------------------------

function compileSpec(spec: ComponentFieldSpec, depth: number): AnyFieldDef {
  const base = {
    ...(spec.label !== undefined ? { label: spec.label } : {}),
    ...(spec.help !== undefined ? { help: spec.help } : {}),
    ...(spec.ai !== undefined ? { ai: spec.ai } : {}),
    ...(spec.optional ? { optional: true as const } : {}),
  };
  switch (spec.kind) {
    case "text": {
      const { kind: _k, label: _l, help: _h, ai: _a, optional: _o, ...rest } = spec;
      return f.text({ ...base, ...rest });
    }
    case "richText": {
      const { kind: _k, label: _l, help: _h, ai: _a, optional: _o, ...rest } = spec;
      return f.richText({ ...base, ...rest });
    }
    case "image":
      return f.image({ ...base, ...(spec.aspect ? { aspect: spec.aspect } : {}) });
    case "link":
      return f.link({ ...base, ...(spec.allow ? { allow: spec.allow } : {}) });
    case "select":
      return f.select({
        ...base,
        options: spec.options,
        ...(spec.display ? { display: spec.display } : {}),
      } as never);
    case "boolean":
      return f.boolean(base);
    case "number": {
      const { kind: _k, label: _l, help: _h, ai: _a, optional: _o, ...rest } = spec;
      return f.number({ ...base, ...rest });
    }
    case "color":
      return f.color(base);
    case "list": {
      if (depth >= 2) throw new Error("Lists can be nested at most two levels deep");
      const fields: FieldsShape = {};
      for (const [k, s] of Object.entries(spec.fields)) fields[k] = compileSpec(s, depth + 1);
      if (Object.keys(fields).length === 0) throw new Error("A list needs at least one field");
      return f.list({
        ...base,
        fields,
        ...(spec.min !== undefined ? { min: spec.min } : {}),
        ...(spec.max !== undefined ? { max: spec.max } : {}),
        ...(spec.itemLabel !== undefined ? { itemLabel: spec.itemLabel } : {}),
      } as never);
    }
  }
}

/** Compile field specs to `f.*` field definitions (throws with a plain message when invalid). */
export function compileComponentFields(specs: Record<string, ComponentFieldSpec>): FieldsShape {
  const out: FieldsShape = {};
  for (const [key, spec] of Object.entries(specs)) {
    try {
      out[key] = compileSpec(spec, 0);
    } catch (e) {
      throw new Error(`Field "${key}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

function templateFields(specs: Record<string, ComponentFieldSpec>): Record<string, TemplateField> {
  const out: Record<string, TemplateField> = {};
  for (const [k, s] of Object.entries(specs))
    out[k] =
      s.kind === "list" ? { kind: "list", fields: templateFields(s.fields) } : { kind: s.kind };
  return out;
}

function compileMigrations(
  migrations: ComponentDefinition["migrations"],
): Record<number, BlockFieldsMigration> {
  const out: Record<number, BlockFieldsMigration> = {};
  for (const [key, m] of Object.entries(migrations ?? {})) {
    out[Number(key)] = (fields) => {
      const next: Record<string, unknown> = { ...fields };
      for (const [from, to] of Object.entries(m.rename ?? {})) {
        if (from in next) {
          next[to] = next[from];
          delete next[from];
        }
      }
      for (const k of m.remove ?? []) delete next[k];
      for (const [k, v] of Object.entries(m.set ?? {}))
        if (next[k] === undefined) next[k] = structuredClone(v);
      return next;
    };
  }
  return out;
}

/** Everything derived from a definition, computed once per definition object. */
export interface CompiledComponent {
  def: ComponentDefinition;
  fields: FieldsShape;
  fieldsSchema: z.ZodType<Record<string, unknown>>;
  template: TNode[];
  /** Scoped CSS (`.os-c--<name> …`). */
  css: string;
  js: string;
  /** Top-level fields the template shows. */
  usedFields: Set<string>;
  /** Heading levels written by the template itself (rich text headings come on top). */
  headings: number[];
  migrations: Record<number, BlockFieldsMigration>;
}

const compiledCache = new WeakMap<
  object,
  { ok: true; c: CompiledComponent } | { ok: false; issues: ComponentIssue[] }
>();

/**
 * Check a definition completely: shape, fields, template (syntax + field references + attribute
 * rules), CSS (scoping rules), JavaScript (guard rail) and that `defaults` is a valid instance.
 */
export function checkComponent(
  input: unknown,
): { ok: true; component: CompiledComponent } | { ok: false; issues: ComponentIssue[] } {
  if (input && typeof input === "object") {
    const hit = compiledCache.get(input);
    if (hit) return hit.ok ? { ok: true, component: hit.c } : { ok: false, issues: hit.issues };
  }
  const result = checkUncached(input);
  if (input && typeof input === "object")
    compiledCache.set(
      input,
      result.ok ? { ok: true, c: result.component } : { ok: false, issues: result.issues },
    );
  return result;
}

function checkUncached(
  input: unknown,
): { ok: true; component: CompiledComponent } | { ok: false; issues: ComponentIssue[] } {
  const parsed = ComponentDefinitionBase.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        where: (["name", "fields", "defaults", "template", "css", "js", "migrations"].includes(
          String(i.path[0]),
        )
          ? String(i.path[0])
          : "definition") as ComponentIssue["where"],
        message: `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`,
      })),
    };
  const def = parsed.data as ComponentDefinition;
  const issues: ComponentIssue[] = [];
  if (Object.keys(def.fields).length > 40)
    issues.push({ where: "fields", message: "A component can have at most 40 fields" });
  let fields: FieldsShape = {};
  try {
    fields = compileComponentFields(def.fields);
  } catch (e) {
    issues.push({ where: "fields", message: e instanceof Error ? e.message : String(e) });
  }
  const tpl = parseTemplate(def.template);
  for (const e of tpl.errors) issues.push({ where: "template", message: e.message, line: e.line });
  let usedFields = new Set<string>();
  let headings: number[] = [];
  if (!tpl.errors.length) {
    const check = checkTemplate(tpl.nodes, templateFields(def.fields));
    for (const e of check.errors)
      issues.push({ where: "template", message: e.message, line: e.line });
    usedFields = check.used;
    headings = check.headings;
  }
  const scoped = scopeCss(def.name, def.css ?? "");
  for (const e of scoped.issues) issues.push({ where: "css", message: e.message, line: e.line });
  for (const e of checkComponentJs(def.js ?? ""))
    issues.push({ where: "js", message: e.message, line: e.line });
  for (const key of Object.keys(def.migrations ?? {})) {
    const from = Number(key);
    if (from >= def.version)
      issues.push({
        where: "migrations",
        message: `Migration ${key} must upgrade an older version (below ${def.version})`,
      });
  }
  const schema = fieldsSchema(fields) as unknown as z.ZodType<Record<string, unknown>>;
  if (!issues.some((i) => i.where === "fields")) {
    const d = schema.safeParse(def.defaults);
    if (!d.success)
      for (const i of d.error.issues)
        issues.push({
          where: "defaults",
          message: `${i.path.join(".") || "defaults"}: ${i.message}`,
        });
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    component: {
      def,
      fields,
      fieldsSchema: schema,
      template: tpl.nodes,
      css: scoped.css,
      js: def.js?.trim() ?? "",
      usedFields,
      headings,
      migrations: compileMigrations(def.migrations),
    },
  };
}

/** Plain-language one-liners for issues (`CSS line 4: …`). */
export function describeComponentIssues(issues: readonly ComponentIssue[]): string[] {
  const label: Record<ComponentIssue["where"], string> = {
    name: "Name",
    fields: "Fields",
    defaults: "Sample content",
    template: "Template",
    css: "CSS",
    js: "JavaScript",
    migrations: "Migrations",
    definition: "Definition",
  };
  return issues.map((i) => `${label[i.where]}${i.line ? ` line ${i.line}` : ""}: ${i.message}`);
}

export const ComponentDefinitionSchema = named(
  "ComponentDefinition",
  "A custom component: typed fields, a logic-light template, scoped CSS and optional behaviour JS (content/components/<name>.json).",
  ComponentDefinitionBase.superRefine((def, ctx) => {
    const r = checkComponent(def);
    if (!r.ok)
      for (const i of r.issues)
        ctx.addIssue({
          code: "custom",
          path: [i.where === "definition" || i.where === "name" ? "name" : i.where],
          message: `${i.line ? `line ${i.line}: ` : ""}${i.message}`,
        });
  }),
) as unknown as z.ZodType<ComponentDefinition>;

/** Components keyed by name (`SiteDocument.components`). */
export const ComponentsSchema = z.record(ComponentNameSchema, ComponentDefinitionSchema);

// --- block definitions -------------------------------------------------------------------------------

export type ComponentRender = (props: {
  component: CompiledComponent;
  fields: Record<string, unknown>;
  blockId: string;
}) => unknown;

const blockDefCache = new WeakMap<object, Map<unknown, AnyBlockDefinition>>();
const noRender: ComponentRender = () => null;

/**
 * The block definition for a component's instances (`component/<name>`), or undefined when the
 * definition is invalid. `render` comes from the renderer (schema has no React).
 */
export function componentBlockDefinition(
  def: ComponentDefinition,
  render: ComponentRender = noRender,
): AnyBlockDefinition | undefined {
  let byRender = blockDefCache.get(def);
  const hit = byRender?.get(render);
  if (hit) return hit;
  const r = checkComponent(def);
  if (!r.ok) return undefined;
  const c = r.component;
  const block = defineBlock({
    type: componentType(def.name),
    version: def.version,
    category: "layout",
    label: def.label,
    icon: "sparkles",
    ...(def.description ? { description: def.description } : {}),
    fields: c.fields,
    defaults: { fields: def.defaults as never },
    ai: def.ai ?? {
      purpose: def.description ?? `The ${def.label} designer section.`,
      whenToUse: "Where the site's designer placed it; edit its fields, not its code.",
    },
    migrate: c.migrations,
    render: ({ fields, id }) => render({ component: c, fields, blockId: id }),
  });
  byRender ??= new Map();
  byRender.set(render, block);
  blockDefCache.set(def, byRender);
  return block;
}

/** The components of a document that are valid, keyed by name. */
export function validComponents(
  components: Record<string, ComponentDefinition> | undefined,
): CompiledComponent[] {
  const out: CompiledComponent[] = [];
  for (const def of Object.values(components ?? {})) {
    const r = checkComponent(def);
    if (r.ok) out.push(r.component);
  }
  return out;
}

// --- instances ----------------------------------------------------------------------------------------

/** Preset reference for a component section: `component/<name>@<version>`. */
export const componentPresetRef = (def: Pick<ComponentDefinition, "name" | "version">) =>
  `component/${def.name}@${def.version}`;

/**
 * A new section holding one instance of `def` (fresh ids), with the definition's section defaults
 * and `fields` over its sample content.
 */
export function componentSection(
  def: ComponentDefinition,
  opts: { fields?: Record<string, unknown>; colorTheme?: Section["style"]["colorTheme"] } = {},
): Section {
  const style: Section["style"] = {};
  if (def.section?.padding) style.padding = structuredClone(def.section.padding);
  if (def.section?.minHeight) style.minHeight = structuredClone(def.section.minHeight);
  const theme = opts.colorTheme ?? def.section?.colorTheme;
  if (theme) style.colorTheme = theme;
  return {
    id: newId("sec"),
    preset: componentPresetRef(def),
    label: def.label,
    layout: {
      mode: "stack",
      columns: { d: [12] },
      ...(def.section?.width ? { width: def.section.width } : {}),
    },
    style,
    blocks: [
      {
        id: newId("blk"),
        type: componentType(def.name),
        v: def.version,
        fields: structuredClone({ ...def.defaults, ...(opts.fields ?? {}) }) as Record<
          string,
          unknown
        >,
      },
    ],
  };
}

/** Every instance of a component in a document (pages + footer). */
export function componentInstances(
  doc: {
    pages: Record<string, { sections: readonly Section[] }>;
    site: { footer: Section };
  },
  name?: string,
): Array<{
  container: string;
  section: Section;
  blockId: string;
  name: string;
  v: number;
  fields: Record<string, unknown>;
}> {
  const out: Array<{
    container: string;
    section: Section;
    blockId: string;
    name: string;
    v: number;
    fields: Record<string, unknown>;
  }> = [];
  const visit = (container: string, section: Section) => {
    for (const b of section.blocks) {
      const n = componentNameOf(b.type);
      if (n && (name === undefined || n === name))
        out.push({ container, section, blockId: b.id, name: n, v: b.v, fields: b.fields });
    }
  };
  visit("footer", doc.site.footer);
  for (const [id, page] of Object.entries(doc.pages)) for (const s of page.sections) visit(id, s);
  return out;
}

/** Expand a compiled component with field values (shared by the renderer and lint). */
export function expandComponent(
  c: CompiledComponent,
  fields: Record<string, unknown>,
  uid: string,
): XNode[] {
  return expandTemplate(c.template, fields, {
    uid,
    plainText: (doc) => plainText(doc as Parameters<typeof plainText>[0]),
  });
}

/** True when `link` parses as a link value (used by expansion consumers). */
export const isLinkValue = (link: unknown) => LinkSchema.safeParse(link).success;

/** The JSON value of sample content (helper for tools). */
export type ComponentFieldValues = Record<string, JsonValue>;
