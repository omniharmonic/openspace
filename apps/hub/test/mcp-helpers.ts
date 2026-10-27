import { env } from "cloudflare:test";
import { base64url } from "../src/lib/crypto";
import { call, type TestApp } from "./helpers";

export const HUB = "http://localhost:8787";
export const STUDIO_ORIGIN = "http://localhost:5173";
export const REDIRECT = "http://localhost:6274/oauth/callback";

/** A 1×1 PNG. */
export const PNG_1PX = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (ch) => ch.charCodeAt(0),
);

export async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  return { verifier, challenge };
}

/** Run register → authorize → consent → token. Returns the access token and connection id. */
export async function oauthConnect(
  app: TestApp,
  cookie: string,
  opts: {
    sites: string[];
    publish?: boolean;
    create?: boolean;
    clientName?: string;
    wrongVerifier?: boolean;
  },
) {
  const reg = await call(app, `${HUB}/register`, {
    method: "POST",
    json: {
      client_name: opts.clientName ?? "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  if (reg.status !== 201) throw new Error(`register ${reg.status} ${await reg.text()}`);
  const client = (await reg.json()) as { client_id: string };
  const { verifier, challenge } = await pkce();
  const q = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-123",
    scope: "mcp",
    resource: `${HUB}/mcp`,
  });
  const page = await call(app, `${HUB}/authorize?${q}`, { cookie });
  if (page.status !== 200) throw new Error(`authorize ${page.status} ${await page.text()}`);
  const htmlText = await page.text();
  const handle = /name="handle" value="([^"]+)"/.exec(htmlText)?.[1];
  if (!handle) throw new Error(`no consent handle in ${htmlText.slice(0, 500)}`);
  const form = new URLSearchParams({ handle, action: "allow" });
  for (const s of opts.sites) form.append("site", s);
  if (opts.publish) form.set("publish", "1");
  if (opts.create) form.set("create", "1");
  const decided = await call(app, `${HUB}/authorize`, {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HUB },
    body: form.toString(),
  });
  if (decided.status !== 302) throw new Error(`consent ${decided.status} ${await decided.text()}`);
  const back = new URL(decided.headers.get("location") as string);
  const code = back.searchParams.get("code") as string;
  const tok = await call(app, `${HUB}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      code_verifier: opts.wrongVerifier ? `${verifier}x` : verifier,
      resource: `${HUB}/mcp`,
    }).toString(),
  });
  if (tok.status !== 200)
    throw new Error(`token ${tok.status} ${await tok.text()}`, { cause: tok.status });
  const tokens = (await tok.json()) as { access_token: string; refresh_token?: string };
  const conn = await env.HUB_DB.prepare(
    "SELECT id FROM mcp_connections WHERE client_id = ? AND revoked_at IS NULL",
  )
    .bind(client.client_id)
    .first<{ id: string }>();
  return {
    clientId: client.client_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    connectionId: conn?.id as string,
    back,
  };
}

/** A minimal Streamable HTTP MCP client over the test app. */
export class McpTestClient {
  sessionId: string | null = null;
  private nextId = 1;

  constructor(
    private readonly app: TestApp,
    private readonly url: string,
    private readonly auth: string | null,
  ) {}

  async post(body: unknown, extra: Record<string, string> = {}): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...extra,
    };
    if (this.auth) headers.Authorization = `Bearer ${this.auth}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    return call(this.app, this.url, { method: "POST", headers, body: JSON.stringify(body) });
  }

  async request(method: string, params: Record<string, unknown> = {}) {
    const res = await this.post({ jsonrpc: "2.0", id: this.nextId++, method, params });
    if (res.status !== 200) throw new Error(`${method}: ${res.status} ${await res.text()}`);
    return (await res.json()) as {
      result?: Record<string, unknown> & {
        isError?: boolean;
        content?: Array<{ type: string; text: string }>;
        structuredContent?: Record<string, unknown>;
      };
      error?: { code: number; message: string };
    };
  }

  async initialize() {
    const res = await this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "claude-ai", version: "1.0" },
      },
    });
    if (res.status !== 200) throw new Error(`initialize: ${res.status} ${await res.text()}`);
    this.sessionId = res.headers.get("mcp-session-id");
    const body = (await res.json()) as { result: { protocolVersion: string } };
    const ack = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    if (ack.status !== 202) throw new Error(`initialized: ${ack.status}`);
    return body.result;
  }

  tool(name: string, args: Record<string, unknown> = {}) {
    return this.request("tools/call", { name, arguments: args });
  }

  async close(): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.auth) headers.Authorization = `Bearer ${this.auth}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    return call(this.app, this.url, { method: "DELETE", headers });
  }
}

export const toolText = (r: Awaited<ReturnType<McpTestClient["tool"]>>) =>
  r.result?.content?.map((c) => c.text).join("\n") ?? JSON.stringify(r.error);
