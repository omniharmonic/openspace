import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { MemorySiteStore, type MemorySiteStoreOptions } from "./memory-store";
import { createMcpServer, type McpServerOptions, type OpenSpaceMcpServer } from "./server";
import type { Grant } from "./store";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MEADOW_DIR = join(HERE, "..", "..", "..", "tools", "fixtures", "meadow-site");

let cached: SiteDocument | undefined;
export async function meadowDoc(): Promise<SiteDocument> {
  cached ??= await loadSiteDocument(MEADOW_DIR);
  return structuredClone(cached);
}

export const OWNER: Grant = { sites: "*", publish: true, role: "owner" };

/** A JSON-RPC driver over `server.handle`. */
export class Rpc {
  private n = 0;
  constructor(readonly server: OpenSpaceMcpServer) {}

  async raw(method: string, params?: unknown) {
    return (await this.server.handle({ jsonrpc: "2.0", id: ++this.n, method, params })) as {
      result?: Record<string, unknown>;
      error?: { code: number; message: string };
    };
  }

  async request(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const r = await this.raw(method, params);
    if (r.error) throw new Error(`${method}: ${r.error.message}`);
    return r.result as Record<string, unknown>;
  }

  /** tools/call; returns structured data, throws on isError unless `allowError`. */
  async call(name: string, args: Record<string, unknown> = {}) {
    const r = (await this.request("tools/call", { name, arguments: args })) as {
      isError?: boolean;
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      structuredContent?: Record<string, unknown>;
    };
    if (r.isError) throw new Error(`${name} failed: ${r.content[0]?.text}`);
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    return { data: r.structuredContent as any, content: r.content };
  }

  async callError(name: string, args: Record<string, unknown> = {}) {
    const r = (await this.request("tools/call", { name, arguments: args })) as {
      isError?: boolean;
      content: Array<{ text?: string }>;
      structuredContent?: { error?: { code: string } };
    };
    if (!r.isError) throw new Error(`${name} unexpectedly succeeded`);
    return { text: r.content[0]?.text ?? "", code: r.structuredContent?.error?.code };
  }
}

export async function setup(
  opts: {
    grant?: Grant;
    store?: Partial<MemorySiteStoreOptions>;
    server?: Partial<McpServerOptions>;
    doc?: SiteDocument;
  } = {},
) {
  const doc = opts.doc ?? (await meadowDoc());
  const store = new MemorySiteStore({
    sites: [doc],
    now: () => new Date("2026-10-26T12:00:00Z"),
    ...opts.store,
  });
  const server = createMcpServer(store, opts.grant ?? OWNER, {
    now: () => 1793000000000,
    ...opts.server,
  });
  const rpc = new Rpc(server);
  await rpc.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  return { store, server, rpc, siteId: doc.config.siteId as string };
}

/** A 1×1 PNG built by hand (IHDR + IDAT + IEND), optionally with a tEXt chunk. */
export function tinyPng(width = 1, height = 1, withText = false): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTable[(c ^ x) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: number[]) => {
    const td = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat(data));
    const len = data.length;
    const out = [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...td];
    const c = crc(td);
    return [...out, c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
  };
  const be = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const bytes = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...be(width), ...be(height), 8, 2, 0, 0, 0]),
    ...(withText ? chunk("tEXt", [...[..."Author\0secret"].map((c) => c.charCodeAt(0))]) : []),
    ...chunk("IDAT", [0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00]),
    ...chunk("IEND", []),
  ];
  return Buffer.from(bytes).toString("base64");
}
