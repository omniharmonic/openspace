import {
  type AnyBlockDefinition,
  type BlockRegistry,
  createBlockRegistry,
} from "@openspace/schema";

/**
 * The block registry the Hub validates ops with (field kinds for locked-section checks, block
 * field validation). `@openspace/blocks` is not wired in yet: once it is, call
 * `registerBlocks(registerAll())` (or pass its definitions) at Worker/DO startup — every caller
 * goes through `blockRegistry()`, so nothing else changes.
 *
 * `registryForValidate()` returns the registry only when it has definitions: the schema's
 * registry rejects unknown block types, so an empty registry would refuse every block insert.
 * `transformForRole` always gets the registry (unknown types fall back to its fail-safe
 * same-shape check).
 */
let definitions: AnyBlockDefinition[] = [];
let registry: BlockRegistry = createBlockRegistry([]);

export function registerBlocks(defs: readonly AnyBlockDefinition[]): void {
  const byType = new Map(definitions.map((d) => [d.type, d]));
  for (const d of defs) byType.set(d.type, d);
  definitions = [...byType.values()];
  registry = createBlockRegistry(definitions);
}

export function blockRegistry(): BlockRegistry {
  return registry;
}

export function registryForValidate(): BlockRegistry | undefined {
  return definitions.length ? registry : undefined;
}
