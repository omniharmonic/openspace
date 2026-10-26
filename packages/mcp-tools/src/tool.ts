import { z } from "zod";
import type { ToolContext } from "./context";

/** What a tool handler returns; the server turns it into MCP `content` + `structuredContent`. */
export interface ToolOutput {
  /** Human/agent-readable text. Defaults to pretty JSON of `data`. */
  text?: string;
  /** Structured result (also sent as `structuredContent` when it is an object). */
  data?: unknown;
  /** Images (PNG screenshots). */
  images?: Array<{ base64: string; mimeType: string; caption?: string }>;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: ToolAnnotations;
  handler(ctx: ToolContext, input: z.output<S>): Promise<ToolOutput>;
}

export function defineTool<S extends z.ZodObject>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

/** Shared argument: the site id (optional when the connection covers one site). */
export const siteArg = z
  .string()
  .optional()
  .describe("Site id (st_…). Optional when this connection covers exactly one site.");

/** Page reference: id, slug or title. */
export const pageArg = z
  .string()
  .describe('Page id (pg_…), slug ("" or "/" for home, "about") or exact title.');

/** Container reference for block/section tools: a page or "footer". */
export const containerArg = z
  .string()
  .describe('Page id/slug/title, or "footer" for the site footer section.');

/** Insert/move position. */
export const positionArg = z
  .union([
    z.int().min(0),
    z.enum(["start", "end"]),
    z.strictObject({ before: z.string() }),
    z.strictObject({ after: z.string() }),
  ])
  .describe('Where: an index, "start", "end", {"before": id} or {"after": id}.');

/** `confirm: true` required by destructive tools. */
export const confirmArg = z
  .boolean()
  .optional()
  .describe("Must be true. Ask the owner first: this cannot be undone from here.");

export const deviceArg = z.enum(["desktop", "tablet", "mobile"]);
