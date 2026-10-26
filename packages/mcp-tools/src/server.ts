/**
 * A transport-agnostic MCP server: `handle(jsonRpcMessage)` implements the protocol methods
 * (initialize, ping, tools/*, resources/*, prompts/*) and returns the response, so the same
 * server runs behind stdio (CLI), Streamable HTTP on Workers (Hub) or an in-memory pipe (tests).
 * `connect(transport)` wires it to any `@modelcontextprotocol/sdk` `Transport`.
 *
 * Only the SDK's protocol types/constants are imported (zod-only, no Node APIs), so this module
 * runs on Cloudflare Workers.
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  ErrorCode,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import { blocksRegistry } from "@openspace/blocks";
import type { BlockRegistry } from "@openspace/schema";
import { z } from "zod";
import { ToolContext } from "./context";
import { errorText, invalidInput, ToolError } from "./errors";
import { getPrompt, PROMPTS } from "./prompts";
import { listResources, RESOURCE_TEMPLATES, readResource } from "./resources";
import type { Grant, SiteStore } from "./store";
import type { ToolDefinition, ToolOutput } from "./tool";
import { ALL_TOOLS } from "./tools";

export const SERVER_NAME = "openspace";
export const SERVER_VERSION = "0.1.0";

export const SERVER_INSTRUCTIONS = `OpenSpace edits a website through typed, validated operations. Start with get_site, then get_page (detail "outline") for ids. Compose with section presets (list_section_presets → insert_section/create_page), replace demo copy with update_block (rich text is Markdown), restyle only through Site Styles (set_styles / apply_template_look). Iterate: design_check → edit → screenshot/render_page. Read openspace://guidance/design once per session. Edits land in the draft; publish only when the owner asks (confirm: true).`;

export interface McpServerOptions {
  store: SiteStore;
  grant: Grant;
  registry?: BlockRegistry;
  /** Clock in ms (tests). */
  now?: () => number;
  /** Agent label recorded on sessions (default from the client's name, else "Claude"). */
  label?: string;
  /** Extra/override tools (e.g. a Hub-only tool); same name replaces a built-in. */
  tools?: readonly ToolDefinition[];
  /**
   * Called with unexpected (non-ToolError) failures; their details never reach the client.
   * Default: `console.error`.
   */
  onError?: (error: unknown, method: string) => void;
  /**
   * Treat the connection as already initialized (stateless transports that re-create the
   * server per request, like `handleMcpRequest`).
   */
  assumeInitialized?: boolean;
}

/** Methods a client may call before `initialize` completes. */
const PRE_INIT_METHODS = new Set(["initialize", "ping"]);
/** The only protocol revision that allowed JSON-RPC batches. */
const BATCH_VERSION = "2025-03-26";

type Id = string | number;
type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Resource not found (MCP spec). */
const RESOURCE_NOT_FOUND = -32002;

const schemaCache = new WeakMap<z.ZodType, Json>();
function inputJsonSchema(schema: z.ZodType): Json {
  let s = schemaCache.get(schema);
  if (!s) {
    s = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Json;
    delete s.$schema;
    if (s.type !== "object") s = { type: "object", properties: {} };
    schemaCache.set(schema, s);
  }
  return s;
}

export class OpenSpaceMcpServer {
  readonly ctx: ToolContext;
  private readonly tools = new Map<string, ToolDefinition>();
  private clientName: string | undefined;
  private initialized: boolean;
  private protocolVersion: string | undefined;
  private closed = false;

  constructor(private readonly options: McpServerOptions) {
    this.ctx = new ToolContext({
      store: options.store,
      grant: options.grant,
      registry: options.registry ?? blocksRegistry(),
      now: options.now,
      label: options.label,
    });
    this.initialized = Boolean(options.assumeInitialized);
    for (const t of ALL_TOOLS) this.tools.set(t.name, t);
    for (const t of options.tools ?? []) this.tools.set(t.name, t);
  }

  /** Tool definitions served by this instance. */
  toolList(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /**
   * Handle one JSON-RPC message (or a batch). Returns the response(s), or undefined for
   * notifications.
   */
  async handle(message: unknown): Promise<JSONRPCMessage | JSONRPCMessage[] | undefined> {
    if (Array.isArray(message)) {
      // Batching was removed in MCP 2025-06-18; only a 2025-03-26 session may batch.
      if (this.protocolVersion !== BATCH_VERSION)
        return {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: ErrorCode.InvalidRequest,
            message: "JSON-RPC batches are not supported in this protocol version",
          },
        } as unknown as JSONRPCMessage;
      const out: JSONRPCMessage[] = [];
      for (const m of message) {
        const r = await this.handleOne(m);
        if (r) out.push(r);
      }
      return out.length ? out : undefined;
    }
    return this.handleOne(message);
  }

  private async handleOne(message: unknown): Promise<JSONRPCMessage | undefined> {
    if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      // Responses from the client (we send no requests) and malformed input.
      if (isRecord(message) && ("result" in message || "error" in message)) return undefined;
      const id =
        isRecord(message) && (typeof message.id === "string" || typeof message.id === "number")
          ? message.id
          : null;
      return {
        jsonrpc: "2.0",
        id,
        error: { code: ErrorCode.InvalidRequest, message: "Invalid JSON-RPC request" },
      } as unknown as JSONRPCMessage;
    }
    const hasId = typeof message.id === "string" || typeof message.id === "number";
    const params = isRecord(message.params) ? message.params : {};
    if (!hasId) {
      // Notifications: initialized, cancelled, roots changed… nothing to do.
      return undefined;
    }
    const id = message.id as Id;
    if (!this.initialized && !PRE_INIT_METHODS.has(message.method))
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: ErrorCode.InvalidRequest,
          message: "Server not initialized: send initialize first",
        },
      } as JSONRPCMessage;
    try {
      const result = await this.dispatch(message.method, params);
      return { jsonrpc: "2.0", id, result } as JSONRPCMessage;
    } catch (e) {
      if (e instanceof RpcError)
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: e.code,
            message: e.message,
            ...(e.data !== undefined ? { data: e.data } : {}),
          },
        } as JSONRPCMessage;
      if (e instanceof ToolError)
        return {
          jsonrpc: "2.0",
          id,
          error: { code: ErrorCode.InvalidParams, message: errorText(e) },
        } as JSONRPCMessage;
      this.reportError(e, message.method);
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: ErrorCode.InternalError,
          message: "Internal error; the details were logged on the server.",
        },
      } as JSONRPCMessage;
    }
  }

  private async dispatch(method: string, params: Json): Promise<Json> {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "ping":
        return {};
      case "logging/setLevel":
        return {};
      case "tools/list":
        return {
          tools: this.toolList().map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: inputJsonSchema(t.input),
            annotations: { title: t.title, ...t.annotations },
          })),
        };
      case "tools/call":
        return this.callTool(params);
      case "resources/list":
        return { resources: await listResources(this.ctx) };
      case "resources/templates/list":
        return { resourceTemplates: RESOURCE_TEMPLATES };
      case "resources/read": {
        if (typeof params.uri !== "string")
          throw new RpcError(ErrorCode.InvalidParams, "uri is required");
        try {
          return { contents: [await readResource(this.ctx, params.uri)] };
        } catch (e) {
          if (e instanceof ToolError && e.code === "not_found")
            throw new RpcError(RESOURCE_NOT_FOUND, e.message, { uri: params.uri });
          throw e;
        }
      }
      case "prompts/list":
        return {
          prompts: PROMPTS.map((p) => ({
            name: p.name,
            title: p.title,
            description: p.description,
            arguments: p.arguments,
          })),
        };
      case "prompts/get": {
        if (typeof params.name !== "string")
          throw new RpcError(ErrorCode.InvalidParams, "name is required");
        const args = isRecord(params.arguments)
          ? Object.fromEntries(Object.entries(params.arguments).map(([k, v]) => [k, String(v)]))
          : {};
        return getPrompt(params.name, args);
      }
      case "completion/complete":
        return { completion: { values: [], hasMore: false } };
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  }

  private reportError(e: unknown, where: string): void {
    if (this.options.onError) this.options.onError(e, where);
    else console.error(`openspace mcp: ${where}:`, e);
  }

  private initialize(params: Json): Json {
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : LATEST_PROTOCOL_VERSION;
    this.protocolVersion = protocolVersion;
    this.initialized = true;
    const info = isRecord(params.clientInfo) ? params.clientInfo : {};
    this.clientName = typeof info.name === "string" ? info.name : undefined;
    return {
      protocolVersion,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
        prompts: { listChanged: false },
        logging: {},
      },
      serverInfo: { name: SERVER_NAME, title: "OpenSpace", version: SERVER_VERSION },
      instructions: SERVER_INSTRUCTIONS,
    };
  }

  /** Name the client reported in `initialize`. */
  get client(): string | undefined {
    return this.clientName;
  }

  private async callTool(params: Json): Promise<Json> {
    const name = params.name;
    if (typeof name !== "string") throw new RpcError(ErrorCode.InvalidParams, "name is required");
    const tool = this.tools.get(name);
    if (!tool)
      throw new RpcError(
        ErrorCode.InvalidParams,
        `Unknown tool "${name}". Call tools/list for the available tools.`,
      );
    const parsed = tool.input.safeParse(isRecord(params.arguments) ? params.arguments : {});
    try {
      if (!parsed.success) throw invalidInput(name, parsed.error);
      const out = await tool.handler(this.ctx, parsed.data as never);
      return toCallResult(out);
    } catch (e) {
      if (e instanceof ToolError)
        return {
          isError: true,
          content: [{ type: "text", text: errorText(e) }],
          structuredContent: {
            error: {
              code: e.code,
              message: e.message,
              ...(e.issues.length ? { issues: e.issues } : {}),
            },
          },
        };
      this.reportError(e, `tools/call ${name}`);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Internal error in ${name}; the details were logged on the server. Try again, or try a different approach.`,
          },
        ],
      };
    }
  }

  /** Wire the server to an SDK transport (stdio, Streamable HTTP, in-memory). */
  async connect(transport: Transport): Promise<void> {
    transport.onmessage = (message) => {
      void this.handle(message).then(
        async (response) => {
          if (!response) return;
          for (const r of Array.isArray(response) ? response : [response]) await transport.send(r);
        },
        (e) => this.options.onError?.(e, "transport"),
      );
    };
    const prior = transport.onclose;
    transport.onclose = () => {
      prior?.();
      void this.close();
    };
    await transport.start();
  }

  /** End the agent sessions this connection started. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.ctx.endSessions();
  }
}

function toCallResult(out: ToolOutput): Json {
  const content: Json[] = [];
  const text = out.text ?? (out.data !== undefined ? JSON.stringify(out.data, null, 2) : "Done.");
  content.push({ type: "text", text });
  for (const img of out.images ?? [])
    content.push({ type: "image", data: img.base64, mimeType: img.mimeType });
  const result: Json = { content };
  if (isRecord(out.data)) result.structuredContent = JSON.parse(JSON.stringify(out.data)) as Json;
  return result;
}

/** A stateful server for one connection (agent sessions are kept until `close`). */
export function createMcpServer(
  store: SiteStore,
  grant: Grant,
  options: Omit<McpServerOptions, "store" | "grant"> = {},
): OpenSpaceMcpServer {
  return new OpenSpaceMcpServer({ ...options, store, grant });
}

/**
 * Stateless one-shot handling: a fresh server per message, closed afterwards. Every edit then
 * runs in its own agent session (with its own start snapshot); keep a `createMcpServer`
 * instance per MCP session when the transport has sessions (the Hub's McpAgent does).
 */
export async function handleMcpRequest(
  store: SiteStore,
  grant: Grant,
  message: unknown,
  options: Omit<McpServerOptions, "store" | "grant"> = {},
): Promise<JSONRPCMessage | JSONRPCMessage[] | undefined> {
  const server = createMcpServer(store, grant, { assumeInitialized: true, ...options });
  try {
    return await server.handle(message);
  } finally {
    await server.close();
  }
}
