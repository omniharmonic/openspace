/**
 * Hub-only remote MCP tools, registered next to the shared tool set (`createMcpServer`'s `tools`
 * option; a Hub tool with a built-in's name replaces it). Each module contributes a factory that
 * receives the request's Hub context; add new account-level tools (e.g. `import_site`, "move my
 * site") as another factory in `HUB_TOOL_FACTORIES` — no stubs needed elsewhere.
 */
import type { ToolDefinition } from "@omniharmonic/openspace-mcp-tools";
import type { User } from "../db/users";
import type { HubBindings } from "../env";
import type { Logger } from "../lib/log";
import type { Services } from "../services";
import type { ConnectionRow, GrantSite } from "./db";
import { accountTools } from "./tools/account";

export interface HubToolContext {
  env: HubBindings;
  services: Services;
  user: User;
  connection: ConnectionRow;
  /** Sites this connection reaches now (re-read every request). */
  sites: GrantSite[];
  log: Logger;
}

export type HubToolFactory = (ctx: HubToolContext) => ToolDefinition[];

/** Every Hub tool module. Order matters only for duplicate names (the later one wins). */
export const HUB_TOOL_FACTORIES: HubToolFactory[] = [accountTools];

export function hubTools(ctx: HubToolContext): ToolDefinition[] {
  return HUB_TOOL_FACTORIES.flatMap((factory) => factory(ctx));
}
