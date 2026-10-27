/**
 * Account-level remote MCP tools (first run from Claude, before there is a site):
 *
 * - `list_sites`     — the shared tool, plus a friendly next step when there are none.
 * - `list_templates` — the Hub's site templates and their looks (what `create_site` takes).
 * - `create_site`    — the same flow as Studio's "Create my site", including the GitHub App
 *                      install step: when GitHub needs a click from the person, the answer is a
 *                      Studio link to finish it. The new site joins this connection's grant.
 */
import { defineTool, ToolError } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { HttpError } from "../../lib/errors";
import { CreateSiteSchema, createSite } from "../../services/sites";
import { grantSiteToConnection } from "../db";
import type { HubToolContext } from "../hub-tools";

/** New sites per connection per hour (each one is a GitHub repository). */
export const MCP_CREATE_RATE = { name: "mcp-create", limit: 5, windowSec: 3600 };

const EMPTY_HINT =
  "You don't have a site yet — I can create one from a template (list_templates, then create_site) or move your existing site.";

export function accountTools(hub: HubToolContext) {
  const { services, user, connection, log } = hub;
  const studio = services.config.studioOrigin;
  const canCreate = connection.can_create === 1;

  const listSites = defineTool({
    name: "list_sites",
    title: "List sites",
    description:
      "Sites this connection can edit, with their titles and live addresses. Start here. With no sites yet, offer to create one (list_templates → create_site) or to move the person's existing site.",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    async handler(ctx) {
      const allowed = new Set(await ctx.allowedSites());
      const sites = (await ctx.store.listSites()).filter((s) => allowed.has(s.id));
      const data = {
        sites,
        canPublish: ctx.grant.publish && ctx.store.capabilities.canPublish,
        canCreateSites: canCreate,
      };
      if (sites.length) return { data };
      const text = canCreate
        ? EMPTY_HINT
        : `${EMPTY_HINT} This connection wasn't allowed to create sites: reconnect OpenSpace in your Claude app (Settings → Connectors) and tick "Create new sites", or start one at ${studio}/templates.`;
      return { text, data: { ...data, next: text } };
    },
  });

  const listTemplates = defineTool({
    name: "list_templates",
    title: "List templates and looks",
    description:
      "OpenSpace site templates (who each is for, its mood) and their looks. Use a template id and look id with create_site, or with apply_template_look to restyle an existing site.",
    input: z.object({ template: z.string().optional() }),
    annotations: { readOnlyHint: true },
    async handler(_ctx, input) {
      const all = await services.templates.list();
      const list = input.template ? all.filter((t) => t.id === input.template) : all;
      return {
        data: {
          templates: list.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            persona: t.persona,
            mood: t.mood,
            previewUrl: `${services.config.hubUrl}/t/${t.id}/`,
            looks: t.looks.map((l) => ({ id: l.id, name: l.name })),
          })),
          next: "Pick a template and look that fit the person, then call create_site.",
        },
      };
    },
  });

  const createSiteTool = defineTool({
    name: "create_site",
    title: "Create a site",
    description:
      "Create a new website from a template (same as Studio's Create my site): it gets its own GitHub repository and a free web address. Ask for the site's name first. If GitHub needs the person to approve OpenSpace (first site), the result has a Studio link they must open — give it to them and wait.",
    input: z.object({
      template: z.string().describe("Template id from list_templates."),
      look: z.string().optional().describe("Look id from list_templates (default: the first)."),
      name: z.string().describe("The site's name, e.g. the person's business or their name."),
      tagline: z.string().optional().describe("One line about what they do."),
      owner: z
        .string()
        .optional()
        .describe("GitHub organization to own the site (default: the person's own account)."),
    }),
    annotations: { openWorldHint: true },
    async handler(_ctx, input) {
      if (!canCreate)
        throw new ToolError(
          `This connection can't create sites. Reconnect OpenSpace in your Claude app and tick "Create new sites", or create one at ${studio}/templates.`,
          "forbidden",
        );
      const parsed = CreateSiteSchema.safeParse({
        template: input.template,
        name: input.name,
        ...(input.look ? { look: input.look } : {}),
        ...(input.tagline ? { tagline: input.tagline } : {}),
        ...(input.owner ? { owner: input.owner } : {}),
      });
      if (!parsed.success)
        throw new ToolError(
          parsed.error.issues.map((i) => i.message).join("; "),
          "invalid_arguments",
        );
      const rate = await services.pub.rateLimit.hit(`mcp-create|${connection.id}`, MCP_CREATE_RATE);
      if (!rate.ok)
        throw new ToolError(
          "Several sites were just created from this connection. Wait a while before making another.",
          "rate_limited",
        );
      let site: Awaited<ReturnType<typeof createSite>>;
      try {
        site = await createSite(services, user, parsed.data, { log });
      } catch (err) {
        if (err instanceof HttpError) throw new ToolError(err.message, err.code);
        throw err;
      }
      await grantSiteToConnection(
        services.db,
        connection,
        { id: site.id, role: "owner" },
        services.now(),
      );
      const studioUrl = `${studio}/sites/${site.id}`;
      const summary = {
        id: site.id,
        name: site.name,
        status: site.status,
        url: site.url,
        studioUrl,
      };
      if (site.github.access !== "ok") {
        const text = `One more step for ${site.name}: OpenSpace needs permission on GitHub to create the site's repository. Ask the person to open ${studioUrl} and choose "Connect GitHub" (about a minute, nothing to install). When they're back, call get_site for ${site.id} and carry on.`;
        return {
          text,
          data: { site: summary, needsGitHub: true, actionUrl: studioUrl, next: text },
        };
      }
      const text =
        site.status === "failed"
          ? `${site.name} was created but its first publish didn't finish: ${site.statusDetail ?? "try again in a moment"}. The person can choose Try again at ${studioUrl}.`
          : `Created ${site.name} (${site.id}). It goes live at ${site.url} in about a minute. You can start editing now: get_site with site "${site.id}". The person can watch at ${studioUrl}.`;
      return { text, data: { site: summary, needsGitHub: false, next: text } };
    },
  });

  return [listSites, listTemplates, createSiteTool];
}
