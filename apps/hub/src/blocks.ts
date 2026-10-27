import { allBlocks } from "@omniharmonic/openspace-blocks";
import {
  type AnyBlockDefinition,
  type BlockRegistry,
  createBlockRegistry,
} from "@omniharmonic/openspace-schema";

/**
 * The block registry the Hub validates ops with (field kinds for locked-section checks, block
 * field validation): the `@omniharmonic/openspace-blocks` library, so ops from any client (Studio, MCP,
 * direct API) get the same field validation. `registerBlocks` can add definitions.
 *
 * `registryForValidate()` returns the registry only when it has definitions: the schema's
 * registry rejects unknown block types, so an empty registry would refuse every block insert.
 * `transformForRole` always gets the registry (unknown types fall back to its fail-safe
 * same-shape check).
 */
let definitions: AnyBlockDefinition[] = [...allBlocks];
let registry: BlockRegistry = createBlockRegistry(definitions);

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

/** Preset builds for the Editor section-insert check (M-5). */
export { presetSection } from "@omniharmonic/openspace-blocks";
