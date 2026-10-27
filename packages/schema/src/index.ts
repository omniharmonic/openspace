/**
 * @omniharmonic/openspace-schema — the OpenSpace content model.
 *
 * Zod schemas + inferred TypeScript types for every content document, stable ids, responsive
 * values, rich text (with Markdown converters), the block definition API (`defineBlock`, `f.*`),
 * migrations, JSON Schema export and the secret scanner. No React, no Node-only APIs.
 */
export const name = "@omniharmonic/openspace-schema";

export * from "./block";
export * from "./block-registry";
export * from "./collections";
export * from "./components";
export * from "./config";
export * from "./define-block";
export * from "./document";
export * from "./fields";
export * from "./form";
export * from "./grid-fallback";
export * from "./ids";
export * from "./json-schema";
export * from "./links";
export * from "./media";
export * from "./migrations";
export * from "./page";
export * from "./primitives";
export { contentRegistry, type SchemaMeta } from "./registry";
export * from "./responsive";
export * from "./richtext";
export * from "./richtext-schema";
export * from "./secrets";
export * from "./section";
export * from "./site";
export * from "./styles";
export * from "./tokens";
