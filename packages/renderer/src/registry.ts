import type { AnyBlockDefinition, BlockDefinition, FieldsShape } from "@openspace/schema";
import type { ReactNode } from "react";

/**
 * A block definition whose `render` returns React nodes. Schema keeps `render` generic
 * (`(props) => unknown`) so it has no React dependency; the renderer narrows it here.
 */
// biome-ignore lint/suspicious/noExplicitAny: erased field shape for registries
export type RendererBlockDefinition = BlockDefinition<any, any, ReactNode>;

/** The minimal registry surface the renderer needs (schema's `BlockRegistry` satisfies it). */
export interface RendererBlockRegistry {
  get(type: string): AnyBlockDefinition | undefined;
}

const blocks = new Map<string, AnyBlockDefinition>();

/**
 * Register block definitions with the renderer. Re-registering a type replaces it (hot reload,
 * custom blocks overriding library blocks).
 */
export function registerBlocks(
  defs: readonly (AnyBlockDefinition | BlockDefinition<FieldsShape, string, ReactNode>)[],
): void {
  for (const def of defs) blocks.set(def.type, def as AnyBlockDefinition);
}

/** Look up a registered block definition. */
export function getBlock(type: string): RendererBlockDefinition | undefined {
  return blocks.get(type) as RendererBlockDefinition | undefined;
}

/** All registered definitions. */
export function listBlocks(): RendererBlockDefinition[] {
  return [...blocks.values()] as RendererBlockDefinition[];
}

/** Remove one type, or every registration when called without arguments (tests). */
export function unregisterBlocks(...types: string[]): void {
  if (types.length === 0) blocks.clear();
  for (const t of types) blocks.delete(t);
}

/** The module-level registry as a {@link RendererBlockRegistry}. */
export const globalRegistry: RendererBlockRegistry = { get: (type) => blocks.get(type) };
