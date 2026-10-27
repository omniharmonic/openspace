/**
 * `import_site` (and its older name `import_squarespace`): the site importer as an MCP tool. It
 * detects the platform (Squarespace, WordPress, Wix, Webflow, anything else) unless told. Local
 * stdio server only — it fetches the web and writes a new site folder next to the one being
 * served, so it is never part of the shared (Hub) tool set. Like `publish`, it does nothing
 * without `confirm: true`.
 */
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { REPORT_FILE } from "@omniharmonic/openspace-import";
import { defineTool, ToolError } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { defaultFolder, importSummary, runImportSite } from "../import";
import { captureIo } from "../io";

export interface ImportToolOptions {
  /** The served site's folder; new sites are created next to it. */
  siteRoot: string;
  fetch?: typeof fetch;
  /** Pause between requests (tests use 0). */
  delayMs?: number;
}

const PLATFORMS = [
  "auto",
  "squarespace",
  "wordpress",
  "wix",
  "webflow",
  "framer",
  "carrd",
  "url",
] as const;

const DESCRIPTION =
  "Move a site the owner controls — Squarespace, WordPress, Wix, Webflow, Carrd, Framer or any HTML site — into a NEW OpenSpace site folder (pages, blog posts, media, navigation, SEO, redirects, an approximate Site Styles look with the closest section presets) and run openspace check. Detects the platform unless `platform` is given. Fetches the site politely (robots.txt honoured) and writes files, so it requires confirm: true after the owner agrees; `owner: true` (Squarespace ?format=json) only when they confirm they own the site; `render: true` reads JavaScript-built pages in a browser (Playwright). Does not change the site this server is serving. Returns the summary and the IMPORT-REPORT.md text.";

/** `import_site`; `alias: true` registers the same tool as `import_squarespace` (Squarespace). */
export function importSiteTool(opts: ImportToolOptions & { alias?: boolean }) {
  const legacy = opts.alias === true;
  return defineTool({
    ...(legacy
      ? {
          name: "import_squarespace",
          title: "Import a Squarespace site",
          description:
            "Older name of import_site for Squarespace sites (same behaviour with platform: squarespace). Prefer import_site.",
        }
      : {
          name: "import_site",
          title: "Import a website (any platform)",
          description: DESCRIPTION,
        }),
    input: z.object({
      url: z.string().min(4).describe("The site's address, e.g. https://www.example.com"),
      platform: z
        .enum(PLATFORMS)
        .optional()
        .describe(
          "Skip detection: the platform that built the site (url = the generic HTML importer). Default auto.",
        ),
      render: z
        .boolean()
        .optional()
        .describe(
          "Render pages in a browser first (needs Playwright): for sites built by JavaScript, e.g. some Wix and Framer sites.",
        ),
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
          "Path to a WordPress export (WXR XML): a WordPress site's full export, or Squarespace's blog export.",
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
      let r: Awaited<ReturnType<typeof runImportSite>>;
      const platform = legacy
        ? "squarespace"
        : input.platform === "url"
          ? "generic"
          : (input.platform ?? "auto");
      try {
        r = await runImportSite(cap.io, input.url, dir, {
          platform,
          ...(input.render && !legacy ? { render: true } : {}),
          ...(input.owner ? { owner: true } : {}),
          ...(input.exportFile ? { export: resolve(parent, input.exportFile) } : {}),
          ...(input.target ? { target: input.target } : {}),
          ...(opts.fetch ? { fetch: opts.fetch } : {}),
          ...(opts.delayMs !== undefined ? { delay: opts.delayMs } : {}),
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
          platform: r.result.site.platform ?? "squarespace",
          ...(r.result.detection ? { detection: r.result.detection.evidence } : {}),
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

/** @deprecated the `import_squarespace` alias of `import_site`. */
export function importSquarespaceTool(opts: ImportToolOptions) {
  return importSiteTool({ ...opts, alias: true });
}
