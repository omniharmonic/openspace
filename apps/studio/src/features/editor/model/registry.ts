import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  type BlockRegistry,
  type ComponentDefinition,
  withComponents,
} from "@omniharmonic/openspace-schema";

/**
 * The block registry Studio's panels read field definitions, labels and icons from: the block
 * library plus the open site's custom components (`component/<name>` types, ADR
 * custom-components). The editor store keeps it pointed at the document's current components.
 */
let current: Record<string, ComponentDefinition> | undefined;

export function setStudioComponents(components: Record<string, ComponentDefinition> | undefined) {
  current = components;
}

export function studioRegistry(): BlockRegistry {
  return withComponents(blocksRegistry(), current);
}
