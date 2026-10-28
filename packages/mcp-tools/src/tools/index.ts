import type { ToolDefinition } from "../tool";
import { componentTools } from "./components";
import { designTools } from "./design";
import { designSystemTools } from "./design-system";
import { editTools } from "./edit";
import { pageTools } from "./pages";
import { publishTools } from "./publish";
import {
  getBlockSchema,
  getPage,
  getSite,
  listBlocks,
  listSectionPresets,
  listSites,
} from "./read";

/** Every tool, in the order `tools/list` returns them (read → edit → design → publish). */
export const ALL_TOOLS: readonly ToolDefinition[] = [
  listSites,
  getSite,
  getPage,
  listBlocks,
  getBlockSchema,
  listSectionPresets,
  ...editTools,
  ...pageTools,
  ...designSystemTools,
  ...designTools,
  ...componentTools,
  ...publishTools,
] as unknown as ToolDefinition[];

export * from "./components";
export * from "./design";
export * from "./design-system";
export * from "./edit";
export * from "./pages";
export * from "./publish";
export * from "./read";
