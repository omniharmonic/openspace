import { designCheck, type Issue, seoCheck } from "@openspace/lint";
import { type Op, type OpBody, validate } from "@openspace/ops";
import {
  BREAKPOINT_INFO,
  BUTTON_STYLES,
  DENSITIES,
  IMAGE_TREATMENTS,
  MOTION_LEVELS,
  type Page,
  SHAPES,
  type SiteDocument,
} from "@openspace/schema";
import {
  compileStyles,
  curatedPalettes,
  getCuratedPalette,
  getPairing,
  TYPE_PAIRINGS,
} from "@openspace/theme";
import { z } from "zod";
import { pagePathOf, resolvePage, type ToolContext } from "../context";
import { issueLines, ToolError } from "../errors";
import { renderPreviewHtml } from "../render";
import type { Device } from "../store";
import { loadTemplates } from "../templates";
import { defineTool, deviceArg, siteArg, type ToolOutput } from "../tool";
import { stylesSummary } from "./read";

const stripMeta = (op: Op): OpBody => {
  const { id: _i, actor: _a, ts: _t, ...body } = op;
  return body as OpBody;
};

// --- styles ------------------------------------------------------------------------------------

export const getStyles = defineTool({
  name: "get_styles",
  title: "Get Site Styles",
  description:
    "Current Site Styles (palette, type pairing, density, shape, buttons, motion, image treatment, token overrides), the resulting colors per section theme, and the available options (pairings, curated palettes, enum values). Change styles here, never with inline CSS.",
  input: z.object({
    site: siteArg,
    options: z.boolean().optional().describe("Include the option lists (default true)."),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const compiled = compileStyles(doc.styles);
    const data: Record<string, unknown> = {
      ...stylesSummary(doc),
      themes: compiled.tokens.themes,
      fonts: { googleFontsUrl: compiled.tokens.fonts.googleFontsUrl },
      solverAdjustments: compiled.contrast.adjustments,
    };
    if (input.options !== false)
      data.options = {
        pairings: TYPE_PAIRINGS.map((p) => ({
          id: p.id,
          heading: p.heading.family,
          body: p.body.family,
          ...(p.template ? { template: p.template } : {}),
        })),
        palettes: curatedPalettes.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          neutral: p.neutral,
          description: p.description,
        })),
        density: DENSITIES,
        shape: SHAPES,
        buttons: BUTTON_STYLES,
        motion: MOTION_LEVELS,
        imageTreatment: IMAGE_TREATMENTS,
        neutral: ["warm", "cool", "pure"],
        contrast: ["standard", "high"],
        overridePaths:
          'overrides use DTCG paths: "color.<role>" (light theme), "color.<theme>.<role>", "color.all.<role>", "color.accent-500", "type.display.letterSpacing"… Roles: background, surface, surface-raised, text, text-muted, heading, accent, accent-text, link, border, focus…',
      };
    return { data };
  },
});

const ChoicesPatch = z
  .object({
    palette: z
      .object({
        brand: z.string().optional(),
        neutral: z.enum(["warm", "cool", "pure"]).optional(),
        contrast: z.enum(["standard", "high"]).optional(),
        source: z.enum(["brand", "logo", "image", "curated"]).optional(),
      })
      .optional(),
    pairing: z.string().optional(),
    density: z.enum(DENSITIES).optional(),
    shape: z.enum(SHAPES).optional(),
    buttons: z.enum(BUTTON_STYLES).optional(),
    motion: z.enum(MOTION_LEVELS).optional(),
    imageTreatment: z.enum(IMAGE_TREATMENTS).optional(),
  })
  .describe("Partial Site Styles choices.");

export type ContrastMode = "adjust" | "reject";

/**
 * Apply a styles patch with a contrast check. Unfixable contrast failures are always refused;
 * overrides that fail contrast are replaced by the nearest accessible color (`adjust`) or
 * refused (`reject`). Returns explanations of every adjustment.
 */
export async function applyStyles(
  ctx: ToolContext,
  siteId: string,
  patch: { set?: Record<string, unknown>; unset?: string[] },
  mode: ContrastMode,
): Promise<{ doc: SiteDocument; adjustments: string[]; solverNotes: string[] }> {
  const doc = await ctx.doc(siteId);
  const pairing = patch.set?.["choices.pairing"];
  if (typeof pairing === "string" && !getPairing(pairing))
    throw new ToolError(
      `Unknown type pairing "${pairing}". Pairings: ${TYPE_PAIRINGS.map((p) => p.id).join(", ")}.`,
      "invalid_arguments",
    );
  const body: Record<string, unknown> = { op: "styles.patch", patch: {} };
  if (patch.set && Object.keys(patch.set).length)
    (body.patch as Record<string, unknown>).set = patch.set;
  if (patch.unset?.length) (body.patch as Record<string, unknown>).unset = patch.unset;
  const [first] = ctx.stamp([body as OpBody], "preview");
  const trial = validate(doc, first);
  if (!trial.ok)
    throw new ToolError(
      `Those styles are not valid:\n${issueLines(trial.errors).join("\n")}`,
      "invalid_arguments",
      trial.errors,
    );
  // Only the site-wide contrast rules matter here.
  const issues = designCheck({ ...trial.doc, pages: {} }).filter(
    (i) => i.rule === "contrast" || i.rule === "contrast-override",
  );
  const unfixable = issues.filter((i) => i.rule === "contrast");
  if (unfixable.length)
    throw new ToolError(
      `These styles leave text unreadable even after automatic adjustment:\n${unfixable.map((i) => `- ${i.message} ${i.fix}`).join("\n")}`,
      "contrast",
      [],
      'Pick a brand color with more lightness contrast, or keep contrast "standard".',
    );
  const overrideIssues = issues.filter((i) => i.rule === "contrast-override");
  if (overrideIssues.length && mode === "reject")
    throw new ToolError(
      `These color overrides fail WCAG AA contrast:\n${overrideIssues.map((i) => `- ${i.message} ${i.fix}`).join("\n")}`,
      "contrast",
      [],
      'Use the suggested colors, or call again with onContrast: "adjust" to apply them automatically.',
    );
  const fixes = overrideIssues.flatMap((i) => (i.autofix?.ops ?? []).map(stripMeta));
  const { doc: next } = await ctx.apply(siteId, [body as OpBody, ...fixes]);
  const solverNotes = compileStyles(next.styles)
    .warnings.filter((w) => w.code === "contrast-adjusted")
    .map((w) => w.message);
  return {
    doc: next,
    adjustments: overrideIssues.map((i) => `${i.message} → ${i.fix}`),
    solverNotes,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const setStyles = defineTool({
  name: "set_styles",
  title: "Set Site Styles",
  description:
    'Restyle the whole site: patch Site Styles choices (palette brand/neutral/contrast, pairing, density, shape, buttons, motion, imageTreatment), pick a curated palette by id, and set/unset exact DTCG token overrides (e.g. {"color.accent": "#2f6b4f"}). Every change is contrast-checked: unreadable overrides are moved to the nearest accessible shade (onContrast "adjust", default) or refused ("reject"), with an explanation.',
  input: z.object({
    site: siteArg,
    choices: ChoicesPatch.optional(),
    palette: z.string().optional().describe("Curated palette id (sets brand + neutral)."),
    overrides: z
      .object({
        set: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Token path → value or {$value, $type}, e.g. {"color.accent": "#0a5"}'),
        unset: z.array(z.string()).optional(),
      })
      .optional(),
    onContrast: z.enum(["adjust", "reject"]).optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    if (input.palette) {
      const p = getCuratedPalette(input.palette);
      if (!p)
        throw new ToolError(
          `Unknown palette "${input.palette}". Palettes: ${curatedPalettes.map((c) => c.id).join(", ")}.`,
          "invalid_arguments",
        );
      set["choices.palette.brand"] = p.brand;
      set["choices.palette.neutral"] = p.neutral;
      set["choices.palette.source"] = "curated";
    }
    const c = input.choices ?? {};
    for (const [k, v] of Object.entries(c.palette ?? {}))
      if (v !== undefined) set[`choices.palette.${k}`] = v;
    for (const k of ["pairing", "density", "shape", "buttons", "motion", "imageTreatment"] as const)
      if (c[k] !== undefined) set[`choices.${k}`] = c[k];
    for (const [path, v] of Object.entries(input.overrides?.set ?? {})) {
      const token = isRecord(v) && "$value" in v ? v : { $value: v };
      if (path.startsWith("color.") && isRecord(token) && token.$type === undefined)
        token.$type = "color";
      set[`overrides.${path}`] = token;
    }
    for (const path of input.overrides?.unset ?? []) unset.push(`overrides.${path}`);
    if (!Object.keys(set).length && !unset.length)
      throw new ToolError(
        "Nothing to change: give choices, palette or overrides.",
        "invalid_arguments",
      );
    const r = await applyStyles(ctx, siteId, { set, unset }, input.onContrast ?? "adjust");
    return {
      data: {
        styles: stylesSummary(r.doc),
        contrastAdjustments: r.adjustments,
        solverNotes: r.solverNotes,
        next: "Check the result with screenshot or render_page, then design_check.",
      },
    };
  },
});

// --- templates ---------------------------------------------------------------------------------

export const listTemplates = defineTool({
  name: "list_templates",
  title: "List templates and looks",
  description:
    "Templates and their alternate looks (palette + type pairing + shape/buttons combinations). apply_template_look restyles the current content with one of them without touching the content.",
  input: z.object({ template: z.string().optional() }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const { source, templates } = await loadTemplates(ctx.store);
    const list = input.template ? templates.filter((t) => t.id === input.template) : templates;
    return {
      data: {
        source,
        templates: list.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          persona: t.persona,
          mood: t.mood,
          looks: t.looks.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            pairing: l.choices.pairing,
            brand: l.choices.palette.brand,
            shape: l.choices.shape,
            buttons: l.choices.buttons,
          })),
        })),
      },
    };
  },
});

export const applyTemplateLook = defineTool({
  name: "apply_template_look",
  title: "Apply template look",
  description:
    "Restyle the site with a template look (Site Styles choices only; content and layout stay). Contrast-checked like set_styles. resetOverrides also clears exact token overrides so the look applies cleanly.",
  input: z.object({
    site: siteArg,
    template: z.string(),
    look: z.string().optional().describe("Look id (default: the template's first look)."),
    resetOverrides: z.boolean().optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const { templates } = await loadTemplates(ctx.store);
    const t = templates.find((x) => x.id === input.template);
    if (!t)
      throw new ToolError(
        `Unknown template "${input.template}". Templates: ${templates.map((x) => x.id).join(", ")}.`,
        "not_found",
      );
    const look = input.look ? t.looks.find((l) => l.id === input.look) : t.looks[0];
    if (!look)
      throw new ToolError(
        `Template ${t.id} has no look "${input.look}". Looks: ${t.looks.map((l) => l.id).join(", ")}.`,
        "not_found",
      );
    const doc = await ctx.doc(siteId);
    const unset = input.resetOverrides && doc.styles.overrides ? ["overrides"] : [];
    const r = await applyStyles(ctx, siteId, { set: { choices: look.choices }, unset }, "adjust");
    return {
      data: {
        applied: { template: t.id, look: look.id, name: look.name },
        styles: stylesSummary(r.doc),
        contrastAdjustments: r.adjustments,
        ...(doc.styles.overrides && !input.resetOverrides
          ? {
              note: "The site has exact token overrides that still apply on top of this look; pass resetOverrides: true to clear them.",
            }
          : {}),
      },
    };
  },
});

// --- design check ------------------------------------------------------------------------------

const CHECKS = ["design", "seo"] as const;

function runChecks(
  doc: SiteDocument,
  pageId: string | undefined,
  checks: readonly string[],
  now: number,
): Issue[] {
  const out: Issue[] = [];
  if (checks.includes("design"))
    out.push(...designCheck(doc, pageId, { actor: "design-check", now }));
  if (checks.includes("seo")) {
    const pages = pageId ? [doc.pages[pageId as Page["id"]]] : Object.values(doc.pages);
    for (const p of pages) if (p) out.push(...seoCheck(p, doc, { actor: "design-check", now }));
  }
  return out;
}

const RANK = { error: 0, warning: 1, info: 2 } as const;

export const designCheckTool = defineTool({
  name: "design_check",
  title: "Design check",
  description:
    "Run Studio's Design check (contrast, typefaces, heading order, empty sections, missing alt text, oversized images, overlapping text in grids, calls to action, color rhythm, copy lengths) and the SEO check on a page or the whole site. Each issue has an id; issues with autofix can be fixed with apply_fix. Aim for zero errors before publishing.",
  input: z.object({
    site: siteArg,
    page: z.string().optional().describe("Page id/slug/title (default: whole site)."),
    checks: z.array(z.enum(CHECKS)).optional().describe('Default ["design", "seo"].'),
    minSeverity: z
      .enum(["error", "warning", "info"])
      .optional()
      .describe('Default "info" (everything).'),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const pageId = input.page ? resolvePage(doc, input.page).id : undefined;
    const min = RANK[input.minSeverity ?? "info"];
    const issues = runChecks(doc, pageId, input.checks ?? CHECKS, ctx.now()).filter(
      (i) => RANK[i.severity] <= min,
    );
    const counts = { error: 0, warning: 0, info: 0 };
    for (const i of issues) counts[i.severity]++;
    return {
      data: {
        ...(pageId ? { page: pageId } : {}),
        counts,
        issues: issues.map((i) => ({
          id: i.id,
          rule: i.rule,
          severity: i.severity,
          ...(i.page ? { page: i.page } : {}),
          ...(i.section ? { section: i.section } : {}),
          ...(i.block ? { block: i.block } : {}),
          message: i.message,
          fix: i.fix,
          autofix: i.autofix?.label ?? null,
        })),
        next: issues.some((i) => i.autofix)
          ? "Fix with apply_fix {issues: [ids]} or edit directly; then re-run design_check."
          : undefined,
      },
    };
  },
});

export const applyFix = defineTool({
  name: "apply_fix",
  title: "Apply design fix",
  description:
    'Apply the automatic fix of one or more design_check/SEO issues by id (or "all" to apply every available autofix on the page/site). Issues are recomputed before each fix, so ids stay valid as the document changes.',
  input: z.object({
    site: siteArg,
    issues: z.union([z.array(z.string()).min(1), z.literal("all")]),
    page: z.string().optional().describe('Limit to a page (needed for speed with "all").'),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    let doc = await ctx.doc(siteId);
    const pageId = input.page ? resolvePage(doc, input.page).id : undefined;
    const applied: Array<{ id: string; fix: string }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    const wanted = input.issues === "all" ? null : [...new Set(input.issues)];
    const seen = new Set<string>();
    for (let guard = 0; guard < 100; guard++) {
      const issues = runChecks(doc, pageId, CHECKS, ctx.now());
      const next = wanted
        ? wanted.map((id) => issues.find((i) => i.id === id && !seen.has(id))).find(Boolean)
        : issues.find((i) => i.autofix && !seen.has(i.id));
      if (!next) break;
      seen.add(next.id);
      if (!next.autofix) {
        skipped.push({ id: next.id, reason: `No automatic fix. ${next.fix}` });
        continue;
      }
      try {
        const r = await ctx.apply(siteId, next.autofix.ops.map(stripMeta));
        doc = r.doc;
        applied.push({ id: next.id, fix: next.autofix.label });
      } catch (e) {
        skipped.push({ id: next.id, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    if (wanted)
      for (const id of wanted)
        if (!seen.has(id))
          skipped.push({
            id,
            reason: "Not found (already fixed, or the id is wrong — re-run design_check).",
          });
    const remaining = runChecks(doc, pageId, CHECKS, ctx.now());
    const counts = { error: 0, warning: 0, info: 0 };
    for (const i of remaining) counts[i.severity]++;
    return { data: { applied, skipped, remaining: counts } };
  },
});

// --- preview, render, screenshot ----------------------------------------------------------------

export const preview = defineTool({
  name: "preview",
  title: "Preview",
  description:
    "Preview address of the draft (a page path is added when page is given). Share it with the owner; use screenshot to look at the page yourself.",
  input: z.object({ site: siteArg, page: z.string().optional() }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = input.page ? resolvePage(doc, input.page).page : null;
    const url = await ctx.store.previewUrl(siteId, page ? pagePathOf(page) : "/");
    return {
      data: {
        url,
        ...(url
          ? {}
          : {
              note: "No preview server here; use render_page for the HTML or screenshot for an image.",
            }),
        screenshots: ctx.store.capabilities.canScreenshot,
      },
    };
  },
});

export const renderPage = defineTool({
  name: "render_page",
  title: "Render page HTML",
  description:
    "The draft page rendered to HTML by the site's real renderer: the full document, a one-section document (section), or only the markup inside <main> (fragment). Use it to inspect structure, headings and classes while iterating on a design.",
  input: z.object({
    site: siteArg,
    page: z.string(),
    section: z.string().optional(),
    fragment: z.boolean().optional(),
    maxChars: z.int().min(1000).optional().describe("Truncate long output (default 200000)."),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { id } = resolvePage(doc, input.page);
    const html = renderPreviewHtml(doc, id, { sectionId: input.section, fragment: input.fragment });
    const max = input.maxChars ?? 200_000;
    return {
      text:
        html.length > max
          ? `${html.slice(0, max)}\n<!-- truncated: ${html.length - max} more characters -->`
          : html,
    };
  },
});

const DEVICE_WIDTH: Record<Device, number> = {
  desktop: BREAKPOINT_INFO.d.previewWidth,
  tablet: BREAKPOINT_INFO.t.previewWidth,
  mobile: BREAKPOINT_INFO.m.previewWidth,
};

export const screenshot = defineTool({
  name: "screenshot",
  title: "Screenshot",
  description:
    'PNG screenshot of a draft page or one section at desktop (1440), tablet (834) or mobile (390) width — or "all" three — so you can see the design and iterate. Returns the preview URL as well. Needs a screenshot provider (Playwright locally).',
  input: z.object({
    site: siteArg,
    page: z.string(),
    section: z.string().optional(),
    device: z
      .union([deviceArg, z.literal("all")])
      .optional()
      .describe('Default "desktop".'),
    fullPage: z
      .boolean()
      .optional()
      .describe("Capture the whole page height (default true for pages, ignored for sections)."),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input): Promise<ToolOutput> {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { id, page } = resolvePage(doc, input.page);
    const url = await ctx.store.previewUrl(siteId, page ? pagePathOf(page) : "/");
    if (!ctx.store.capabilities.canScreenshot || !ctx.store.screenshot)
      throw new ToolError(
        "Screenshots aren't available here.",
        "unsupported",
        [],
        ctx.store.capabilities.publishNote?.includes("git")
          ? "Install Playwright next to the CLI (npm i -D playwright && npx playwright install chromium) and restart the MCP server; meanwhile use render_page."
          : `Use render_page to inspect the HTML${url ? ` or open ${url}` : ""}.`,
      );
    const html = renderPreviewHtml(doc, id, { sectionId: input.section });
    const devices: Device[] =
      input.device === "all" ? ["desktop", "tablet", "mobile"] : [input.device ?? "desktop"];
    const images: NonNullable<ToolOutput["images"]> = [];
    const shots: Array<{ device: Device; width: number; height?: number }> = [];
    for (const device of devices) {
      const shot = await ctx.store.screenshot(siteId, {
        pageId: id,
        sectionId: input.section,
        device,
        width: DEVICE_WIDTH[device],
        fullPage: input.section ? false : (input.fullPage ?? true),
        html,
      });
      images.push({
        base64: shot.base64,
        mimeType: shot.mimeType,
        caption: `${device} ${shot.width}px`,
      });
      shots.push({ device, width: shot.width, height: shot.height });
    }
    return {
      text: `Screenshot${shots.length > 1 ? "s" : ""} of ${page?.title ?? id}${input.section ? ` (section ${input.section})` : ""}: ${shots.map((s) => `${s.device} ${s.width}×${s.height ?? "?"}`).join(", ")}.${url ? ` Preview: ${url}` : ""}`,
      data: { url, shots },
      images,
    };
  },
});

export const designTools = [
  getStyles,
  setStyles,
  listTemplates,
  applyTemplateLook,
  designCheckTool,
  applyFix,
  preview,
  renderPage,
  screenshot,
];
