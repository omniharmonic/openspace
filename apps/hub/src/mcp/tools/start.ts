/**
 * Remote MCP: "Start with Claude" from the Claude app, nothing to install.
 *
 * - `start_site` — the last step of a conversation in which Claude asked what the site is for,
 *   who visits, how it should feel and what material exists, proposed a direction and designed
 *   the site itself: its page(s) (`html`, or `files` for several) become an editable site that
 *   goes live at once. Without a page it falls back to the closest template in their brand.
 *   The new site is granted to this connection atomically with its creation.
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
import type { HubToolContext } from "../hub-tools";
import { MCP_CREATE_RATE } from "./account";
import { grantOnCreate, newSiteAnswer } from "./site-status";

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

/** What start_site asks of Claude before it is called (also in the server instructions). */
export const START_SITE_DESCRIPTION = [
  "Make the person's new website and put it online with OpenSpace (free hosting, theirs to keep). This is the LAST step of a conversation, not the first:",
  "1) Ask a few warm questions, one or two at a time, in plain words: what the site is for; who visits and what they should do there; how it should feel (three words); what they already have (logo, photos, colours, wording, an old site); which pages they need.",
  "2) Propose a direction in a few sentences (palette, type, layout, page list) — optionally show a quick preview — and get their yes.",
  "3) Design it yourself, bespoke — not a template: write the complete page(s) as HTML with their own CSS (a small design system as CSS variables: colours, fonts, spacing), real copy from their words (no lorem ipsum, no invented facts), phone-ready (responsive, no sideways scrolling, body text ≥ 16px, tap targets ≥ 44px, images that shrink). Pass one page as `html`, or several as `files` (index.html, about.html, css/site.css, images as base64). Every section becomes editable in OpenSpace.",
  "Leave out html/files only if the person would rather start from a template: then it picks the closest OpenSpace template and dresses it in their brand (colors, fonts, tokens).",
  "After it returns: give the person the edit link (works at once) and the live address, say the first version is being published (about a minute), run phone_check (and fix_for_phones if it finds problems), then call site_status until it's live. Finish with both links and offer to keep refining it together.",
].join("\n");

export function startTools(hub: HubToolContext) {
  const { services, user, connection, log } = hub;
  const studio = services.config.studioOrigin;
  const canCreate = connection.can_create === 1;

  const startSite = defineTool({
    name: "start_site",
    title: "Make and publish a new site",
    description: START_SITE_DESCRIPTION,
    input: z.object({
      name: z.string().describe("The site's name."),
      about: z.string().optional().describe("What the business or project is, in their words."),
      audience: z.string().optional().describe("Who visits and what they should do there."),
      feeling: z
        .array(z.string())
        .optional()
        .describe('How it should feel, e.g. ["warm", "unhurried"].'),
      notes: z
        .string()
        .optional()
        .describe("Anything else they said (pages, must-haves, sites they love)."),
      tokens: z.string().optional().describe("A design-token file's JSON text."),
      colors: z
        .array(z.string())
        .optional()
        .describe("Brand colours as #rrggbb, the main one first."),
      fonts: z.object({ heading: z.string().optional(), body: z.string().optional() }).optional(),
      html: z
        .string()
        .optional()
        .describe("The full HTML of the page you designed (with its CSS in a <style>)."),
      files: PageFilesArg.optional().describe(
        "Several files of the site you designed (HTML pages, CSS, images).",
      ),
      owner: z.string().optional().describe("GitHub organization to own it (default: theirs)."),
    }),
    annotations: { openWorldHint: true, destructiveHint: false, idempotentHint: false },
    async handler(_ctx, input) {
      if (!canCreate)
        throw new ToolError(
          `This connection can't create sites yet. The person can turn on "Create new sites" for this app in OpenSpace (${studio}/connect, under Apps with access) — then call start_site again. Or reconnect OpenSpace in the Claude app and keep "Create new sites" ticked.`,
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
        // The grant lands with the site row: this app can always reach the site it made.
        r = await createStartSite(services, user, parsed.data, {
          log,
          alsoInsert: grantOnCreate(hub),
        });
      } catch (err) {
        if (err instanceof HttpError) throw new ToolError(err.message, err.code);
        throw err;
      }
      const from =
        r.startedFrom.kind === "html"
          ? "the design you made, every section editable"
          : `the ${r.startedFrom.template} template (${r.startedFrom.look} look) in their brand — ${r.startedFrom.why}`;
      const answer = await newSiteAnswer(
        services,
        r.site,
        `Created "${r.site.name}" (${r.site.id}) from ${from}.`,
      );
      return {
        text: answer.text,
        data: {
          site: {
            id: r.site.id,
            name: r.site.name,
            url: r.site.url,
            studioUrl: answer.studioUrl,
          },
          status: answer.state.phase,
          editorReady: answer.state.editorReady,
          ...(answer.state.retryAfterSeconds
            ? { retryAfterSeconds: answer.state.retryAfterSeconds }
            : {}),
          ...(answer.state.actionUrl ? { actionUrl: answer.state.actionUrl } : {}),
          startedFrom: r.startedFrom,
          next: "phone_check, then site_status until live; finish with the live link and the edit link.",
        },
      };
    },
  });

  return [startSite];
}
