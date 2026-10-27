/**
 * @omniharmonic/openspace-mcp-tools — the shared MCP tool set (arch §10): typed, validated site-editing tools,
 * resources and prompts behind a transport-agnostic JSON-RPC MCP server. The Hub serves it over
 * Streamable HTTP (Workers) and the CLI over stdio (`openspace mcp`), each with its own
 * `SiteStore`. No Node APIs in this entry.
 */
export const name = "@omniharmonic/openspace-mcp-tools";

export { pagePathOf, resolvePage, ToolContext } from "./context";
export { errorText, invalidInput, issueLines, pathText, ToolError, zodToIssues } from "./errors";
export { DESIGN_GUIDANCE, ITERATION_GUIDANCE } from "./guidance";
export {
  base64ToBytes,
  bytesToBase64,
  fetchImage,
  type ImageFormat,
  type ImageResizer,
  imageSize,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  type PreparedImage,
  prepareImage,
  sniffImage,
  stripMetadata,
} from "./images";
export { blockPreview, blockToAgent, fieldsFromAgent, fieldsToAgent } from "./markdown";
export { MemorySiteStore, type MemorySiteStoreOptions } from "./memory-store";
export { getPrompt, PROMPTS, type PromptDefinition } from "./prompts";
export { type PreviewOptions, renderPreviewHtml } from "./render";
export { listResources, RESOURCE_TEMPLATES, readResource } from "./resources";
export {
  createMcpServer,
  handleMcpRequest,
  type McpServerOptions,
  OpenSpaceMcpServer,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
} from "./server";
export type * from "./store";
export { type SvgResult, sanitizeSvg, svgSize } from "./svg";
export { loadTemplates, normaliseTemplate, templatesFromModule } from "./templates";
export { defineTool, type ToolAnnotations, type ToolDefinition, type ToolOutput } from "./tool";
export { ALL_TOOLS, applyStyles } from "./tools";
