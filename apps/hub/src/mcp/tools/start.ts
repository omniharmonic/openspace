/**
 * Remote MCP: "Start with Claude" from the Claude app, nothing to install.
 *
 * - `start_site` — a new site from the person's own words (what it's for, who it's for, how it
 *   should feel) and any brand material Claude has from the conversation (a design-token file,
 *   colours, fonts), or from a page Claude made (`html`, or `files` for several). It goes live
 *   at once (their page made editable, or the closest template in their brand) and carries the
 *   design-system record that the design-from-scratch skill then builds on.
 */
import { defineTool, ToolError } from "@omniharmonic/openspace-mcp-tools";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { bytesToBase64 } from "../../lib/crypto";
import { HttpError } from "../../lib/errors";
import {
  createStartSite,
  type StartInput,
  StartInputSchema,
} from "../../services/start-with-claude";
import { grantSiteToConnection } from "../db";
import type { HubToolContext } from "../hub-tools";
import { MCP_CREATE_RATE } from "./account";

export const PageFilesArg = z
  .array(
    z.strictObject({
      path: z
        .string()
        .min(1)
        .max(300)
        .describe('Path in the bundle, e.g. "index.html", "css/site.css", "img/hero.jpg".'),
      text: z.string().optional().describe("Text content (HTML, CSS, SVG)."),
      base64: z.string().optional().describe("Binary content (images), base64."),
    }),
  )
  .max(200);

/** A page (or files) Claude has → the upload `createStartSite` takes. */
export function pageUpload(input: {
  html?: string | undefined;
  files?: z.infer<typeof PageFilesArg> | undefined;
}): NonNullable<StartInput["html"]> | undefined {
  if (input.html)
    return {
      name: "page.html",
      data: `data:text/html;base64,${bytesToBase64(strToU8(input.html))}`,
    };
  if (input.files?.length) {
    const entries: Record<string, Uint8Array> = {};
    for (const f of input.files) {
      if (f.text !== undefined) entries[f.path.replace(/^\/+/, "")] = strToU8(f.text);
      else if (f.base64 !== undefined)
        entries[f.path.replace(/^\/+/, "")] = Uint8Array.from(atob(f.base64), (c) =>
          c.charCodeAt(0),
        );
    }
    if (!Object.keys(entries).some((p) => /\.html?$/i.test(p)))
      throw new ToolError("The files need an HTML page (e.g. index.html).", "invalid_arguments");
    return {
      name: "page.zip",
      data: `data:application/zip;base64,${bytesToBase64(zipSync(entries))}`,
    };
  }
  return undefined;
}

export function startTools(hub: HubToolContext) {
  const { services, user, connection, log } = hub;
  const studio = services.config.studioOrigin;
  const canCreate = connection.can_create === 1;

  const startSite = defineTool({
    name: "start_site",
    title: "Start a new site with Claude",
    description:
      "Create the person's new site from a conversation, with nothing to install. Ask them in plain words what the site is for (about), who it's for (audience) and how it should feel (feeling: a few words), and whether they have brand material — pass a design-token file's JSON as `tokens` (a Claude Design System, Canva brand kit, Figma/Tokens Studio export), brand `colors` (hex) and `fonts`, or a page you made for them earlier as `html` (or several files as `files`). The site goes live right away on free hosting: their page made editable, or the closest template wearing their brand (contrast-checked). It carries a design-system record (get_design_system) for the design that follows: use the openspace-design-from-scratch skill to make it bespoke. Returns the new site and its Studio link.",
    input: z.object({
      name: z.string().describe("The site's name."),
      about: z.string().optional().describe("What the business or project is, in their words."),
      audience: z.string().optional().describe("Who the site is for."),
      feeling: z
        .array(z.string())
        .optional()
        .describe('How it should feel, e.g. ["warm", "unhurried"].'),
      notes: z
        .string()
        .optional()
        .describe("Anything else they said (must-haves, sites they love)."),
      tokens: z.string().optional().describe("A design-token file's JSON text."),
      colors: z
        .array(z.string())
        .optional()
        .describe("Brand colours as #rrggbb, the main one first."),
      fonts: z.object({ heading: z.string().optional(), body: z.string().optional() }).optional(),
      html: z.string().optional().describe("The full HTML of a page you made for them."),
      files: PageFilesArg.optional().describe("Several files of a page (HTML, CSS, images)."),
      owner: z.string().optional().describe("GitHub organization to own it (default: theirs)."),
    }),
    annotations: { openWorldHint: true, destructiveHint: false, idempotentHint: false },
    async handler(_ctx, input) {
      if (!canCreate)
        throw new ToolError(
          `This connection can't create sites. Reconnect OpenSpace in your Claude app and tick "Create new sites", or start at ${studio}/start.`,
          "forbidden",
        );
      const rate = await services.pub.rateLimit.hit(`mcp-create|${connection.id}`, MCP_CREATE_RATE);
      if (!rate.ok)
        throw new ToolError(
          "Several sites were just created from this connection. Wait a while.",
          "rate_limited",
        );
      const upload = pageUpload(input);
      const parsed = StartInputSchema.safeParse({
        name: input.name,
        ...(input.about ? { about: input.about } : {}),
        ...(input.audience ? { audience: input.audience } : {}),
        ...(input.feeling?.length ? { feeling: input.feeling } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.tokens ? { tokens: input.tokens, tokensName: "tokens from Claude" } : {}),
        ...(input.colors?.length ? { colors: input.colors } : {}),
        ...(input.fonts ? { fonts: input.fonts } : {}),
        ...(upload ? { html: upload } : {}),
        ...(input.owner ? { owner: input.owner } : {}),
      });
      if (!parsed.success)
        throw new ToolError(
          parsed.error.issues.map((i) => i.message).join("; "),
          "invalid_arguments",
        );
      let r: Awaited<ReturnType<typeof createStartSite>>;
      try {
        r = await createStartSite(services, user, parsed.data, { log });
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
      const from =
        r.startedFrom.kind === "html"
          ? "their page, made editable section by section"
          : `the ${r.startedFrom.template} template (${r.startedFrom.look} look) in their brand — ${r.startedFrom.why}`;
      const waiting = r.site.github.connectUrl;
      return {
        text: [
          `Created "${r.site.name}" (${r.site.id}) from ${from}.`,
          waiting
            ? `One step for the person: open ${studioUrl} and choose "Connect GitHub" (about a minute). The site goes live right after.`
            : `It's going live at ${r.site.url} (a minute or two). Studio: ${studioUrl}`,
          "Next: get_design_system, then design it properly with them (openspace-design-from-scratch): brief → mood in words → design tokens → page plan → sections → screenshots → publish.",
        ].join("\n"),
        data: {
          site: { id: r.site.id, name: r.site.name, url: r.site.url, studioUrl },
          startedFrom: r.startedFrom,
        },
      };
    },
  });

  return [startSite];
}
