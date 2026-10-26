/**
 * @openspace/ops — typed, validated, invertible, mergeable operations over a `SiteDocument`
 * (arch §5.3). Every edit from Studio, the Hub DraftRoom, MCP agents and the CLI is an `Op`.
 */
export const name = "@openspace/ops";

export type { SiteDocument } from "@openspace/schema";

export * from "./apply";
export * from "./diff";
export {
  autoPlace,
  containerPath,
  effectiveRect,
  findBlock,
  findSection,
  indexIds,
  locateBlock,
  locateSection,
  OpError,
  raiseRows,
  resolvePosition,
  sectionsOf,
  usedRows,
} from "./doc";
export * from "./invert";
export * from "./ops";
export { deepEqual, isJson } from "./paths";
export * from "./rebase";
export * from "./roles";
export * from "./summarize";
export * from "./validate";
