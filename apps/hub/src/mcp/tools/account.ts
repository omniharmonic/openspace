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
import { allowUrl, unsharedSites } from "../access";
import type { HubToolContext } from "../hub-tools";
import { grantOnCreate, newSiteAnswer } from "./site-status";

/** New sites per connection per hour (each one is a GitHub repository). */
export const MCP_CREATE_RATE = { name: "mcp-create", limit: 5, windowSec: 3600 };

const EMPTY_HINT =
  "You don't have a site yet — I can make one with you: tell me what it's for and who it's for, and I'll design it and put it online (start_site). I can also move a site you already have (import_site).";

export function accountTools(hub: HubToolContext) {
  const { services, user, connection, log } = hub;
  const studio = services.config.studioOrigin;
  const canCreate = connection.can_create === 1;
  const allSites = connection.all_sites === 1;

  const listSites = defineTool({
    name: "list_sites",
    title: "List sites",
    description:
      "Sites this connection can edit, with their titles and live addresses — and the person's other sites it can't see yet, with a link that lets them share one in a click. Start here. With no sites yet, start a new one with the person (ask about it first, then start_site) or move their existing site (import_site).",
    input: z.object({}),
    annotations: { readOnlyHint: true },
    async handler(ctx) {
      const allowed = new Set(await ctx.allowedSites());
      const sites = (await ctx.store.listSites()).filter((s) => allowed.has(s.id));
      // The person's other sites (e.g. made in Studio after connecting): named, with an "Allow" link.
      const others = allSites ? [] : await unsharedSites(services, user.id, hub.sites);
      const notShared = others.map((s) => ({
        id: s.id,
        name: s.name,
        allowUrl:
          connection.kind === "oauth" ? allowUrl(studio, connection.id, s.id) : `${studio}/connect`,
      }));
      const data = {
        sites,
        canPublish: ctx.grant.publish && ctx.store.capabilities.canPublish,
        canCreateSites: canCreate,
        allSites,
        notShared,
      };
      const otherText = notShared.length
        ? `\nThe person has ${notShared.length === 1 ? "another site" : `${notShared.length} other sites`} this connection can't edit yet: ${notShared.map((s) => `"${s.name}" (to share it, they open ${s.allowUrl} and choose Allow)`).join("; ")}. Or they can allow all their sites, including future ones, at ${studio}/connect.`
        : "";
      if (sites.length)
        return otherText
          ? { text: `${JSON.stringify(data, null, 2)}${otherText}`, data }
          : { data };
      const text = notShared.length
        ? `No sites are shared with this connection yet.${otherText}`
        : canCreate
          ? EMPTY_HINT
          : `${EMPTY_HINT} This connection wasn't allowed to create sites: the person can turn on "Create new sites" for this app at ${studio}/connect (Apps with access).`;
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
          `This connection can't create sites yet. The person can turn on "Create new sites" for this app at ${studio}/connect (Apps with access), then try again — or create one at ${studio}/templates.`,
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
        // The grant lands with the site row: this app can always reach the site it made.
        site = await createSite(services, user, parsed.data, {
          log,
          alsoInsert: grantOnCreate(hub),
        });
      } catch (err) {
        if (err instanceof HttpError) throw new ToolError(err.message, err.code);
        throw err;
      }
      const answer = await newSiteAnswer(services, site, `Created ${site.name} (${site.id}).`);
      const summary = {
        id: site.id,
        name: site.name,
        status: answer.state.phase,
        url: site.url,
        studioUrl: answer.studioUrl,
      };
      const needsGitHub = answer.state.phase === "needs_github";
      return {
        text: answer.text,
        data: {
          site: summary,
          needsGitHub,
          editorReady: answer.state.editorReady,
          ...(answer.state.actionUrl ? { actionUrl: answer.state.actionUrl } : {}),
          next: answer.text,
        },
      };
    },
  });

  return [listSites, listTemplates, createSiteTool];
}
