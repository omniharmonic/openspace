import { createHash, randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { HUB_URL } from "./env";

export const MCP_REDIRECT = "http://localhost:6274/oauth/callback";

const b64url = (b: Buffer) => b.toString("base64url");

export function pkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** RFC 7591 dynamic client registration (a public client, like claude.ai). */
export async function registerClient(name = "Claude") {
  const res = await fetch(`${HUB_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [MCP_REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as { client_id: string };
}

export function authorizeUrl(clientId: string, challenge: string, state: string) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: MCP_REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "mcp",
    resource: `${HUB_URL}/mcp`,
  });
  return `${HUB_URL}/authorize?${q}`;
}

export async function exchangeCode(clientId: string, code: string, verifier: string) {
  const res = await fetch(`${HUB_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: MCP_REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${HUB_URL}/mcp`,
    }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as { access_token: string; refresh_token?: string };
}

export interface ToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

/** A minimal Streamable HTTP MCP client (protocol 2025-06-18), JSON responses. */
export class McpClient {
  sessionId: string | null = null;
  private id = 1;
  constructor(
    readonly url: string,
    readonly token: string | null,
  ) {}

  private async post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
      headers["MCP-Protocol-Version"] = "2025-06-18";
    }
    return fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
  }

  async request<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}) {
    const res = await this.post({ jsonrpc: "2.0", id: this.id++, method, params });
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
  }

  async initialize() {
    const res = await this.post({
      jsonrpc: "2.0",
      id: this.id++,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "openspace-e2e", version: "1.0" },
      },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    this.sessionId = res.headers.get("mcp-session-id");
    expect(this.sessionId).toBeTruthy();
    const ack = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(ack.status).toBe(202);
  }

  async tool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return this.request<ToolResult>("tools/call", { name, arguments: args });
  }

  /** Call a tool and fail the test on a tool error; returns structured content (or parsed text). */
  async ok(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const r = await this.tool(name, args);
    const text = r.content?.map((c) => c.text).join("\n") ?? "";
    expect(r.isError, `${name}: ${text}`).toBeFalsy();
    if (r.structuredContent) return r.structuredContent;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { text };
    }
  }

  async end() {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    const res = await fetch(this.url, { method: "DELETE", headers });
    expect([200, 204]).toContain(res.status);
  }
}

export function text(r: ToolResult): string {
  return r.content?.map((c) => c.text).join("\n") ?? "";
}
