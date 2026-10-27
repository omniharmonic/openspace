/**
 * Remote MCP: move an existing site into OpenSpace from the Claude app, nothing to install.
 *
 * - `import_site`   — start a hosted import (any platform, a GitHub Pages site or repository) into
 *                     a new site, or (`inPlace`) make the person's GitHub Pages repository
 *                     editable where it is. Same flow as Studio's "Move an existing site".
 * - `import_status` — how far a move is, what needs attention, and the live address when done.
 */
import { defineTool, ToolError } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { HttpError } from "../../lib/errors";
import {
  ConvertInputSchema,
  convertRepo,
  createImportSite,
  IMPORT_PLATFORMS,
  ImportInputSchema,
  type ImportView,
  importViewFor,
  siteImportView,
} from "../../services/imports";
import { createStartSite } from "../../services/start-with-claude";
import { grantSiteToConnection } from "../db";
import type { HubToolContext } from "../hub-tools";
import { MCP_CREATE_RATE } from "./account";
import { PageFilesArg, pageUpload } from "./start";

function describe(view: ImportView, siteName: string): string {
  const lines = [view.headline];
  for (const s of view.steps)
    lines.push(
      `${s.state === "done" ? "✓" : s.state === "active" ? "…" : s.state === "failed" ? "✗" : "·"} ${s.label}${s.detail ? ` — ${s.detail}` : ""}`,
    );
  if (view.connectUrl)
    lines.push(
      `One step for the person: open ${view.studioUrl} and choose "Connect GitHub" (about a minute, nothing to install). Then call import_status.`,
    );
  if (view.pullRequest)
    lines.push(
      `The person approves the switch on GitHub: ${view.pullRequest.url} (Merge pull request). Then call import_status.`,
    );
  if (view.state === "ready") {
    lines.push(`${siteName} is live at ${view.siteUrl}. Open it in Studio: ${view.studioUrl}`);
    if (view.attention.length)
      lines.push(
        "What needs attention:",
        ...view.attention.flatMap((g) => [
          `- ${g.title}:`,
          ...g.items.slice(0, 5).map((i) => `  - ${i}`),
        ]),
      );
    if (view.checklist.length)
      lines.push(
        "Finish setting up (after launch, in Studio):",
        ...view.checklist.map((i) => `- ${i.title}: ${i.detail}`),
      );
  } else if (view.state === "failed") lines.push(`It didn't finish: ${view.error}`);
  else lines.push("Moving a site takes a few minutes. Call import_status to follow it.");
  return lines.join("\n");
}

export function importTools(hub: HubToolContext) {
  const { services, env, user, connection, log } = hub;
  const studio = services.config.studioOrigin;
  const canCreate = connection.can_create === 1;

  const importSite = defineTool({
    name: "import_site",
    title: "Move an existing site into OpenSpace",
    description:
      "Move the person's existing website — Squarespace, WordPress, Wix, Webflow, Carrd, Framer, a GitHub Pages site or repository, or any site — into a new OpenSpace site, on free hosting, with nothing to install: the pages, posts, images, navigation, look and redirects come across in a few minutes. Ask first: the address, and confirm it's their site (or they're moving it for its owner) — pass confirmOwnership: true only then. With inPlace: true (a GitHub Pages repository they own), the repository itself becomes the OpenSpace site through a pull request they approve. Never change hosting during a move: shops, members and other paid features become 'Finish setting up' steps after launch. The move puts the new site live at its free address when it finishes — that's expected and safe (their old site stays online, untouched), not something to apologise for. Returns progress and a Studio link; follow with import_status. A page you (Claude) made for them earlier — or an HTML file they shared — goes in as `html` (or `files`) instead of url: it becomes an editable site right away, every section keeping its design.",
    input: z.object({
      url: z
        .string()
        .optional()
        .describe(
          "The site's address (https://www.example.com), a github.io address or a GitHub repository (owner/name).",
        ),
      confirmOwnership: z
        .boolean()
        .describe(
          "True only after the person confirmed it's their site (or they're moving it for its owner).",
        ),
      name: z.string().optional().describe("Name for the new site (default: from the address)."),
      platform: z.enum(IMPORT_PLATFORMS).optional().describe("Skip detection (rarely needed)."),
      render: z
        .boolean()
        .optional()
        .describe(
          "Read pages in a browser: for sites whose pages are built by JavaScript (some Wix/Framer sites).",
        ),
      html: z.string().optional().describe("The full HTML of a page (instead of url)."),
      files: PageFilesArg.optional().describe(
        "Several files of a page: HTML, CSS, images (instead of url).",
      ),
      inPlace: z
        .boolean()
        .optional()
        .describe(
          "GitHub Pages repositories only: make that repository editable in place (a pull request) instead of a new site.",
        ),
    }),
    annotations: { openWorldHint: true, destructiveHint: false, idempotentHint: false },
    async handler(_ctx, input) {
      if (!canCreate)
        throw new ToolError(
          `This connection can't create sites. Reconnect OpenSpace in your Claude app and tick "Create new sites", or move the site at ${studio}/move.`,
          "forbidden",
        );
      if (input.confirmOwnership !== true)
        throw new ToolError(
          "Ask the person to confirm the site is theirs (or that they're moving it for its owner), then call again with confirmOwnership: true.",
          "confirmation_required",
        );
      const rate = await services.pub.rateLimit.hit(`mcp-create|${connection.id}`, MCP_CREATE_RATE);
      if (!rate.ok)
        throw new ToolError(
          "Several sites were just created from this connection. Wait a while before moving another.",
          "rate_limited",
        );
      const upload = pageUpload(input);
      if (upload) {
        let r: Awaited<ReturnType<typeof createStartSite>>;
        try {
          r = await createStartSite(
            services,
            user,
            { name: (input.name ?? "My site").slice(0, 80), html: upload },
            { log },
          );
        } catch (err) {
          if (err instanceof HttpError) throw new ToolError(err.message, err.code);
          throw err;
        }
        await grantSiteToConnection(
          services.db,
          connection,
          { id: r.site.id, role: "owner" },
          services.now(),
        );
        const studioUrl = `${studio}/sites/${r.site.id}?welcome=1`;
        return {
          text: r.site.github.connectUrl
            ? `Made "${r.site.name}" from the page. One step for the person: open ${studioUrl} and choose "Connect GitHub". It goes live right after.`
            : `Made "${r.site.name}" from the page: every section keeps its design and every word, picture and link is editable in Studio. It's going live at ${r.site.url}. Studio: ${studioUrl}`,
          data: { site: { id: r.site.id, name: r.site.name, url: r.site.url, studioUrl } },
        };
      }
      if (!input.url)
        throw new ToolError(
          "Give the site's address (url), or the page's html.",
          "invalid_arguments",
        );
      const url = input.url;
      let result: Awaited<ReturnType<typeof createImportSite>>;
      try {
        if (input.inPlace) {
          const parsed = ConvertInputSchema.safeParse({ repo: url, confirmOwnership: true });
          if (!parsed.success)
            throw new ToolError(
              parsed.error.issues.map((i) => i.message).join("; "),
              "invalid_arguments",
            );
          result = await convertRepo(services, env, user, parsed.data, { log });
        } else {
          const parsed = ImportInputSchema.safeParse({
            url,
            confirmOwnership: true,
            ...(input.name ? { name: input.name } : {}),
            ...(input.platform ? { platform: input.platform } : {}),
            ...(input.render ? { render: true } : {}),
          });
          if (!parsed.success)
            throw new ToolError(
              parsed.error.issues.map((i) => i.message).join("; "),
              "invalid_arguments",
            );
          result = await createImportSite(services, env, user, parsed.data, { log });
        }
      } catch (err) {
        if (err instanceof HttpError) throw new ToolError(err.message, err.code);
        throw err;
      }
      await grantSiteToConnection(
        services.db,
        connection,
        { id: result.site.id, role: "owner" },
        services.now(),
      );
      return {
        text: `Started moving ${url} into "${result.site.name}" (${result.site.id}).\n${describe(result.import, result.site.name)}`,
        data: {
          site: { id: result.site.id, name: result.site.name, url: result.site.url },
          import: result.import,
        },
      };
    },
  });

  const importStatus = defineTool({
    name: "import_status",
    title: "How a site move is going",
    description:
      "Progress of a site move started with import_site (or in Studio): the steps, how many pages and images came across, what needs attention, the 'Finish setting up' list, and the live address when it's done. Pass the site id (or the import id).",
    input: z.object({
      site: z.string().optional().describe("Site id (st_…)."),
      import: z.string().optional().describe("Import id (imp_…)."),
    }),
    annotations: { readOnlyHint: true },
    async handler(_ctx, input) {
      let view: ImportView | null = null;
      try {
        if (input.import) view = await importViewFor(services, env, input.import, user, log);
        else if (input.site) view = await siteImportView(services, env, input.site, user, log);
      } catch (err) {
        if (err instanceof HttpError) throw new ToolError(err.message, err.code);
        throw err;
      }
      if (!view)
        throw new ToolError(
          "Give the site id (or import id) of the move to look at.",
          "invalid_arguments",
        );
      const site = hub.sites.find((s) => s.id === view?.siteId);
      return { text: describe(view, site?.name ?? "The site"), data: { import: view } };
    },
  });

  return [importSite, importStatus];
}
