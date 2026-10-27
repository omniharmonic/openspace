/**
 * `import_squarespace`: the Squarespace importer as an MCP tool. Local stdio server only — it
 * fetches the web and writes a new site folder next to the one being served, so it is never part
 * of the shared (Hub) tool set. Like `publish`, it does nothing without `confirm: true`.
 */
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { REPORT_FILE } from "@omniharmonic/openspace-import";
import { defineTool, ToolError } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { defaultFolder, importSummary, runImportSquarespace } from "../import";
import { captureIo } from "../io";

export interface ImportToolOptions {
  /** The served site's folder; new sites are created next to it. */
  siteRoot: string;
  fetch?: typeof fetch;
}

export function importSquarespaceTool(opts: ImportToolOptions) {
  return defineTool({
    name: "import_squarespace",
    title: "Import a Squarespace site",
    description:
      "Move a Squarespace site the owner controls into a NEW OpenSpace site folder (pages, blog/events/products, media, navigation, SEO, redirects, an approximate Site Styles look) and run openspace check. Fetches the site politely (robots.txt honoured) and writes files, so it requires confirm: true after the owner agrees; `owner: true` (also read ?format=json) only when they confirm they own the site. Does not change the site this server is serving. Returns the summary and the IMPORT-REPORT.md text.",
    input: z.object({
      url: z
        .string()
        .min(4)
        .describe("The Squarespace site's address, e.g. https://www.example.com"),
      folder: z
        .string()
        .optional()
        .describe(
          "New folder for the imported site, relative to the folder that contains the served site (default: from the address). Must not exist or be empty.",
        ),
      owner: z
        .boolean()
        .optional()
        .describe(
          "The owner confirmed they own the site: also read Squarespace's ?format=json data.",
        ),
      exportFile: z
        .string()
        .optional()
        .describe(
          "Path to the site's WordPress export (XML) for blog posts, if the owner has one.",
        ),
      target: z
        .enum(["github-pages", "cloudflare"])
        .optional()
        .describe("cloudflare to sell products or gate pages"),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true: the owner agreed to fetch the site and create the folder."),
    }),
    annotations: { openWorldHint: true, destructiveHint: false, idempotentHint: false },
    async handler(_ctx, input) {
      if (input.confirm !== true)
        throw new ToolError(
          `Importing ${input.url} reads the whole site over the network and creates a new folder. Ask the owner to confirm (and whether they own the site, for owner: true), then call again with confirm: true.`,
          "confirmation_required",
        );
      const parent = dirname(resolve(opts.siteRoot));
      const folder = input.folder ?? defaultFolder(input.url);
      const dir = isAbsolute(folder) ? folder : join(parent, folder);
      if (
        resolve(dir) === resolve(opts.siteRoot) ||
        resolve(opts.siteRoot).startsWith(`${resolve(dir)}/`)
      )
        throw new ToolError(
          "Choose a new folder: the import never writes into the site being served.",
          "invalid_arguments",
        );
      const cap = captureIo(parent);
      let r: Awaited<ReturnType<typeof runImportSquarespace>>;
      try {
        r = await runImportSquarespace(cap.io, input.url, dir, {
          ...(input.owner ? { owner: true } : {}),
          ...(input.exportFile ? { export: resolve(parent, input.exportFile) } : {}),
          ...(input.target ? { target: input.target } : {}),
          ...(opts.fetch ? { fetch: opts.fetch } : {}),
        });
      } catch (e) {
        throw new ToolError((e as Error).message, "import_failed");
      }
      const summary = importSummary(r);
      return {
        text: [
          ...summary,
          "",
          `To edit it with Claude, open Claude Code in ${relative(parent, r.dir) || r.dir} (the OpenSpace MCP server serves the folder it starts in).`,
          "",
          `--- ${REPORT_FILE} ---`,
          r.result.report,
        ].join("\n"),
        data: {
          dir: r.dir,
          pages: Object.values(r.result.doc.pages).map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
          })),
          collections: r.result.build.collections,
          redirects: r.result.build.redirects.length,
          check: { ok: r.check.ok, errors: r.check.errors, warnings: r.check.warnings },
          report: join(r.dir, REPORT_FILE),
        },
      };
    },
  });
}
