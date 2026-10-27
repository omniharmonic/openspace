/**
 * The site's design-system record (`content/design-system.json`): the brief, brand material,
 * distilled tokens and how they map onto Site Styles. Claude reads it before designing anything
 * so every new section stays consistent, and keeps it current as the design develops. Changes go
 * through the `designSystem.set` op (owners and designers only).
 */
import type { OpBody } from "@omniharmonic/openspace-ops";
import {
  type DesignSystem,
  DesignSystemSchema,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import {
  compileStyles,
  designSystemStyles,
  readDesignTokens,
  tokensFromStyles,
} from "@omniharmonic/openspace-theme";
import { z } from "zod";
import { ToolError } from "../errors";
import { defineTool, siteArg } from "../tool";
import { stylesSummary } from "./read";

export const DESIGN_SYSTEM_GUIDE =
  "Keep to the design system: use its colours through Site Styles roles (var(--os-color-…)), its fonts through var(--os-font-heading|body|label), its sizes through the type presets, and its rules. When you make a new bespoke component, add it to `components` with its purpose. When the person changes their mind about the look, update the record first, then restyle.";

/** The record, or one described from the current Site Styles when the site has none yet. */
export function designSystemOf(doc: SiteDocument): { record: DesignSystem; derived: boolean } {
  if (doc.designSystem) return { record: doc.designSystem, derived: false };
  return {
    record: {
      version: 1,
      tokens: tokensFromStyles(doc.styles),
      sources: [{ kind: "template", name: "Site Styles" }],
    },
    derived: true,
  };
}

const RecordPatch = z
  .object({
    brief: z.looseObject({}).optional(),
    brand: z.looseObject({}).optional(),
    tokens: z.looseObject({}).optional(),
    rules: z.array(z.string()).optional(),
    components: z.record(z.string(), z.looseObject({})).optional(),
  })
  .describe(
    "Parts of the record to replace: brief {about, audience, feeling[], notes}, brand {name, voice, guidelines}, tokens {colors{name:{value,role,usage}}, fonts{heading,body,label,mono}, type{display,h1…:{size,sizeMobile,lineHeight,letterSpacing,weight,case,font}}, space{contentWidth,sectionPadding,…}, radius{base,button}}, rules[] (design principles), components{name:{purpose}}.",
  );

export const getDesignSystem = defineTool({
  name: "get_design_system",
  title: "Get design system",
  description: `The site's design-system record (content/design-system.json): what the site is for (the owner's brief), the brand material they brought, the design tokens (colours with roles, fonts, type scale, spacing, radii), design rules, bespoke components, and how it all maps onto Site Styles. Read it before any design work. ${DESIGN_SYSTEM_GUIDE}`,
  input: z.object({ site: siteArg }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { record, derived } = designSystemOf(doc);
    return {
      data: {
        designSystem: record,
        ...(derived
          ? {
              note: "This site has no design-system record yet; this one is described from its current Site Styles. Save one with update_design_system once the direction is agreed.",
            }
          : {}),
        styles: stylesSummary(doc),
        guidance: DESIGN_SYSTEM_GUIDE,
      },
    };
  },
});

export const updateDesignSystem = defineTool({
  name: "update_design_system",
  title: "Update design system",
  description:
    "Save the site's design-system record (owners and designers only). Pass `changes` to replace parts of it, and/or `tokens` with a design-token file the person gave you (W3C/DTCG, Style Dictionary, Tokens Studio, a brand kit or plain JSON) to read it into the record. With applyToStyles, the tokens are also mapped onto Site Styles (palette, exact colours, fonts, type scale, rhythm, corners) and contrast-checked; the result says what the solver nudged.",
  input: z.object({
    site: siteArg,
    changes: RecordPatch.optional(),
    tokens: z
      .unknown()
      .optional()
      .describe("A design-token file's JSON (object or string), read into record.tokens."),
    applyToStyles: z.boolean().optional().describe("Also restyle the site from the tokens."),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { record: current, derived } = designSystemOf(doc);
    const next: Record<string, unknown> = structuredClone(current) as Record<string, unknown>;
    // A record described from Site Styles gives way to the person's own tokens.
    if (derived && input.tokens !== undefined) next.sources = [];
    const notes: string[] = [];
    if (input.tokens !== undefined) {
      let read: ReturnType<typeof readDesignTokens>;
      try {
        read = readDesignTokens(input.tokens);
      } catch (e) {
        throw new ToolError((e as Error).message, "invalid_arguments");
      }
      next.tokens = read.tokens;
      notes.push(...read.notes);
      if (read.rules.length)
        next.rules = [...new Set([...((next.rules as string[]) ?? []), ...read.rules])].slice(
          0,
          40,
        );
      next.sources = [
        ...((next.sources as unknown[]) ?? []),
        { kind: "tokens", format: read.format, at: new Date().toISOString() },
      ].slice(-40);
    }
    for (const [k, v] of Object.entries(input.changes ?? {})) if (v !== undefined) next[k] = v;
    next.updatedAt = new Date().toISOString();
    const parsed = DesignSystemSchema.safeParse(next);
    if (!parsed.success)
      throw new ToolError(
        `The design system isn't valid: ${parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        "invalid_arguments",
        [],
        "Colours are {value, role?}, fonts {family, stack?}, sizes in px.",
      );
    const record = parsed.data;
    const bodies: OpBody[] = [];
    let contrast: unknown[] = [];
    if (input.applyToStyles) {
      const mapped = designSystemStyles(record.tokens, doc.styles);
      notes.push(...mapped.notes);
      contrast = mapped.contrast;
      record.mapping = { notes: mapped.notes.slice(0, 40), contrast: mapped.contrast.slice(0, 80) };
      bodies.push({
        op: "styles.patch",
        patch: {
          set: {
            choices: mapped.styles.choices,
            ...(mapped.styles.overrides ? { overrides: mapped.styles.overrides } : {}),
          },
          ...(mapped.styles.overrides || !doc.styles.overrides ? {} : { unset: ["overrides"] }),
        },
      } as OpBody);
    }
    bodies.unshift({ op: "designSystem.set", designSystem: record } as OpBody);
    const { doc: after } = await ctx.apply(siteId, bodies);
    const failures = input.applyToStyles ? compileStyles(after.styles).contrast.failures : [];
    return {
      data: {
        designSystem: after.designSystem,
        notes,
        ...(input.applyToStyles ? { styles: stylesSummary(after), contrastNudges: contrast } : {}),
        ...(failures.length ? { contrastFailures: failures } : {}),
        next: input.applyToStyles
          ? "Take a screenshot of the home page to see the new look, then design_check."
          : "Design with it: presets first, bespoke components for signature moments.",
      },
    };
  },
});

export const designSystemTools = [getDesignSystem, updateDesignSystem] as const;
