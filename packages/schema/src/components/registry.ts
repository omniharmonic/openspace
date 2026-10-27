import { type BlockRegistry, createBlockRegistry } from "../block-registry";
import type { AnyBlockDefinition } from "../define-block";
import {
  type ComponentDefinition,
  type ComponentRender,
  componentBlockDefinition,
} from "./definition";

const cache = new WeakMap<BlockRegistry, WeakMap<object, BlockRegistry>>();
const EMPTY = {};

/**
 * A registry with the site's components layered over `base`: `component/<name>` resolves to the
 * definition compiled from `components[name]` (invalid definitions are left out, so their
 * instances fail validation as an unknown type). Cached per (base, components object).
 */
export function withComponents(
  base: BlockRegistry,
  components: Record<string, ComponentDefinition> | undefined,
  render?: ComponentRender,
): BlockRegistry {
  const key = components ?? EMPTY;
  if (!components || Object.keys(components).length === 0) return base;
  let byDoc = cache.get(base);
  const hit = render ? undefined : byDoc?.get(key);
  if (hit) return hit;
  const defs: AnyBlockDefinition[] = [];
  for (const def of Object.values(components)) {
    const block = componentBlockDefinition(def, render);
    if (block && !base.has(block.type)) defs.push(block);
  }
  const registry = createBlockRegistry([...base.list(), ...defs]);
  if (!render) {
    byDoc ??= new WeakMap();
    byDoc.set(key, registry);
    cache.set(base, byDoc);
  }
  return registry;
}
