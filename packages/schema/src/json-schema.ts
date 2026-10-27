import { z } from "zod";
import { BlockSchema } from "./block";
import { CollectionConfigSchema, CollectionItemSchema } from "./collections";
import { SiteConfigSchema } from "./config";
import type { AnyBlockDefinition } from "./define-block";
import { SiteDocumentSchema } from "./document";
import { FormSchema } from "./form";
import { MediaMetaSchema } from "./media";
import { PageSchema } from "./page";
import { contentRegistry } from "./registry";
import { RichTextDocSchema } from "./richtext-schema";
import { SectionSchema } from "./section";
import { SiteSchema } from "./site";
import { StylesSchema } from "./styles";

/** Base URL that `$schema` references in site files point at. */
export const SCHEMA_BASE_URL = "https://schema.openspace.host/v1";

/** Every top-level document the content model defines, by published file name. */
export const DOCUMENT_SCHEMAS = {
  "site-config": SiteConfigSchema,
  site: SiteSchema,
  styles: StylesSchema,
  page: PageSchema,
  section: SectionSchema,
  block: BlockSchema,
  "rich-text": RichTextDocSchema,
  "collection-item": CollectionItemSchema,
  "collection-config": CollectionConfigSchema,
  "media-meta": MediaMetaSchema,
  form: FormSchema,
  "site-document": SiteDocumentSchema,
} as const satisfies Record<string, z.ZodType>;

export type DocumentSchemaName = keyof typeof DOCUMENT_SCHEMAS;
export type JsonSchema = Record<string, unknown>;

/** URL of a published JSON Schema, e.g. `https://schema.openspace.host/v1/page.json`. */
export function schemaUrl(name: DocumentSchemaName): string {
  return `${SCHEMA_BASE_URL}/${name}.json`;
}

function convert(schema: z.ZodType, id?: string): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    metadata: contentRegistry,
    unrepresentable: "any",
    io: "input",
    cycles: "ref",
    reused: "inline",
  }) as JsonSchema;
  return id ? { $id: id, ...json } : json;
}

/** JSON Schema (draft 2020-12) for one top-level document. */
export function toJsonSchema(name: DocumentSchemaName): JsonSchema {
  return convert(DOCUMENT_SCHEMAS[name], schemaUrl(name));
}

/** JSON Schemas for every top-level document, keyed by name. */
export function allJsonSchemas(): Record<DocumentSchemaName, JsonSchema> {
  const out = {} as Record<DocumentSchemaName, JsonSchema>;
  for (const name of Object.keys(DOCUMENT_SCHEMAS) as DocumentSchemaName[])
    out[name] = toJsonSchema(name);
  return out;
}

/**
 * JSON Schema for a block type's `fields` (MCP tool input schemas, AGENTS.md). Field labels,
 * help and AI hints become `title`/`description`.
 */
export function blockFieldsJsonSchema(def: AnyBlockDefinition): JsonSchema {
  const json = convert(def.fieldsSchema);
  const props = json.properties as Record<string, JsonSchema> | undefined;
  if (props) {
    for (const [key, meta] of Object.entries(def.meta.fields)) {
      const prop = props[key];
      if (!prop) continue;
      if (meta.label) prop.title = meta.label;
      const description = [meta.help, meta.ai].filter(Boolean).join(" ");
      if (description) prop.description = description;
      if (meta.default !== undefined) prop.default = meta.default;
    }
  }
  return { title: def.label, description: def.ai.purpose, ...json };
}
