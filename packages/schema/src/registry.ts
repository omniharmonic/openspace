import { z } from "zod";

/**
 * Private metadata registry for the content model. Schemas registered here get a stable
 * `$defs` name (and title/description) in exported JSON Schema. A private registry (rather
 * than zod's global one) avoids "duplicate id" errors if this module is evaluated twice
 * (e.g. under HMR, or when both `src` and `dist` are loaded).
 */
export interface SchemaMeta {
  id: string;
  title?: string;
  description?: string;
}

export const contentRegistry = z.registry<SchemaMeta>();

/** Register `schema` in the content registry under `id` and return it unchanged. */
export function named<T extends z.ZodType>(id: string, description: string, schema: T): T {
  contentRegistry.add(schema, { id, title: id, description });
  return schema;
}
