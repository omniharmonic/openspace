/**
 * The Hub as an OAuth 2.1 authorization server for MCP clients (arch §10.1), on
 * `@cloudflare/workers-oauth-provider`: RFC 8414 metadata, RFC 7591 dynamic client registration
 * (`/register`), the token endpoint (`/token`: authorization code + PKCE S256, refresh rotation,
 * RFC 7009 revocation) and RFC 8707 resource binding, all stored hashed/encrypted in `OAUTH_KV`.
 * The authorization endpoint (`/authorize`: sign-in + per-site consent) is ours — routes/mcp.ts.
 */
import { OAuthAuthorizationServer } from "@cloudflare/workers-oauth-provider";
import type { Context } from "hono";
import type { HubBindings, HubConfig } from "../env";
import type { AppEnv } from "../types";

export const MCP_SCOPE = "mcp";
export const AUTHORIZE_PATH = "/authorize";
export const TOKEN_PATH = "/token";
export const REGISTER_PATH = "/register";

/** What every OAuth access token carries (encrypted at rest by the provider). */
export interface McpTokenProps {
  userId: string;
  connectionId: string;
}

/** The protected resource MCP clients name (RFC 8707) and tokens are bound to. */
export const mcpResource = (config: HubConfig) => `${config.hubUrl}/mcp`;

export function protectedResourceMetadata(config: HubConfig) {
  return {
    resource: mcpResource(config),
    authorization_servers: [config.hubUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_SCOPE],
    resource_name: "OpenSpace",
    resource_documentation: `${config.hubUrl}/`,
  };
}

/** `WWW-Authenticate` for an MCP request without a valid token (MCP authorization, RFC 9728). */
export function bearerChallenge(config: HubConfig, error?: "invalid_token"): string {
  const meta = `${config.hubUrl}/.well-known/oauth-protected-resource/mcp`;
  return `Bearer resource_metadata="${meta}", scope="${MCP_SCOPE}"${
    error ? `, error="${error}", error_description="The access token is invalid or expired"` : ""
  }`;
}

// One server per Hub URL. Construction is pure configuration (no request state).
const servers = new Map<string, OAuthAuthorizationServer<HubBindings>>();

export function authorizationServer(config: HubConfig): OAuthAuthorizationServer<HubBindings> {
  let as = servers.get(config.hubUrl);
  if (!as) {
    as = new OAuthAuthorizationServer<HubBindings>({
      issuer: config.hubUrl,
      resources: [mcpResource(config)],
      authorizeEndpoint: AUTHORIZE_PATH,
      tokenEndpoint: TOKEN_PATH,
      clientRegistrationEndpoint: REGISTER_PATH,
      scopesSupported: [MCP_SCOPE],
      // Client ID Metadata Documents (MCP 2025-11+ clients); needs `global_fetch_strictly_public`.
      clientIdMetadataDocumentEnabled: true,
      accessTokenTTL: 60 * 60,
      // A connection stays while the client keeps refreshing; 60 idle days end it.
      refreshTokenTTL: 60 * 24 * 60 * 60,
      refreshTokenIdleTTL: 60 * 24 * 60 * 60,
    });
    servers.set(config.hubUrl, as);
  }
  return as;
}

/**
 * The Worker's ExecutionContext, or a stand-in when there is none (`app.request` in tests):
 * background work is awaited inline then, which is what tests want anyway.
 */
export function executionContext(c: Context<AppEnv>): ExecutionContext {
  try {
    return c.executionCtx as ExecutionContext;
  } catch {
    return {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
      props: {},
    } as unknown as ExecutionContext;
  }
}
