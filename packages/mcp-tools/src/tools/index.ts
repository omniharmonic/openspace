import type { ToolDefinition } from "../tool";
import { designTools } from "./design";
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
  ...designTools,
  ...publishTools,
] as unknown as ToolDefinition[];

export * from "./design";
export * from "./edit";
export * from "./pages";
export * from "./publish";
export * from "./read";
