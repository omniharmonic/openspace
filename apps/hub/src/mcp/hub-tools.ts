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
import { screenshotUrlTool } from "./screenshots";
import { accountTools } from "./tools/account";
import { importTools } from "./tools/imports";
import { siteStatusTools } from "./tools/site-status";
import { startTools } from "./tools/start";

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
export const HUB_TOOL_FACTORIES: HubToolFactory[] = [
  accountTools,
  // "Move my site": hosted imports and in-place conversions.
  importTools,
  // "Start with Claude": a new site from a brief, brand material or a page Claude made.
  startTools,
  // site_status: setting up → publishing → live, and "Allow" links for sites not shared yet.
  siteStatusTools,
  // screenshot_url fetches the public web through Browser Rendering.
  (ctx) => [screenshotUrlTool(ctx.services.screenshots, ctx.services, ctx.sites, ctx.user.id)],
];

export function hubTools(ctx: HubToolContext): ToolDefinition[] {
  return HUB_TOOL_FACTORIES.flatMap((factory) => factory(ctx));
}
