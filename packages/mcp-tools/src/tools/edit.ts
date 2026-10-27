import { autoMobileLayoutOps } from "@omniharmonic/openspace-lint";
import {
  FOOTER,
  findBlock,
  findSection,
  locateBlock,
  type OpBody,
} from "@omniharmonic/openspace-ops";
import {
  type Block,
  type BlockRegistry,
  COLOR_THEMES,
  type LinkChange,
  LinkSchema,
  newId,
  resolveInternalLinks,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { z } from "zod";
import { resolvePage, type ToolContext } from "../context";
import { ToolError } from "../errors";
import { blockPreview, fieldsFromAgent } from "../markdown";
import { containerArg, defineTool, positionArg, siteArg } from "../tool";
import { findPreset } from "./read";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const themeArg = z.enum(COLOR_THEMES).describe("Section color theme.");

const blockSummary = (registry: BlockRegistry, b: Block) => ({
  id: b.id,
  type: b.type,
  ...(b.variant ? { variant: b.variant } : {}),
  ...(b.column !== undefined ? { column: b.column } : {}),
  text: blockPreview(registry, b),
});

export function sectionSummary(registry: BlockRegistry, s: Section) {
  return {
    id: s.id,
    ...(s.preset ? { preset: s.preset } : {}),
    theme: s.style?.colorTheme ?? "light",
    layout: s.layout.mode,
    blocks: s.blocks.map((b) => blockSummary(registry, b)),
  };
}

/** Resolve a page-or-footer container reference to its id. */
function container(doc: SiteDocument, ref: string): string {
  return resolvePage(doc, ref, { allowFooter: true }).id;
}

function pageOnly(doc: SiteDocument, ref: string): string {
  if (ref === FOOTER)
    throw new ToolError(
      "Sections can't be inserted, moved or deleted in the footer; replace it with a footer preset (insert_section with a footer/… preset) or edit its blocks.",
      "invalid_arguments",
    );
  return resolvePage(doc, ref).id;
}

function requireSection(doc: SiteDocument, page: string, section: string): Section {
  const loc = findSection(doc, page as never, section);
  if (!loc) {
    const ids =
      page === FOOTER
        ? [doc.site.footer.id]
        : ((doc.pages[page as never] as { sections: Section[] } | undefined)?.sections.map(
            (s) => s.id,
          ) ?? []);
    throw new ToolError(
      `No section ${section} on ${page}. Sections there: ${ids.join(", ") || "none"}.`,
      "not_found",
    );
  }
  return loc.section;
}

function requireBlock(
  doc: SiteDocument,
  page: string,
  block: string,
): { block: Block; section: Section } {
  const loc = findBlock(doc, page as never, block);
  if (loc) return { block: loc.block, section: loc.section };
  const elsewhere = locateBlock(doc, block);
  throw new ToolError(
    elsewhere
      ? `Block ${block} is on ${elsewhere.container}, not ${page}.`
      : `No block ${block}. Call get_page to see block ids.`,
    "not_found",
  );
}

/** Build a new block from agent input: fresh id, current version, Markdown → rich text. */
export function makeBlock(
  registry: BlockRegistry,
  input: { type: string; fields?: Record<string, unknown>; id?: string; [k: string]: unknown },
): Block {
  const def = registry.get(input.type);
  if (!def)
    throw new ToolError(
      `Unknown block type "${input.type}". Types: ${registry.types().join(", ")}.`,
      "invalid_arguments",
    );
  const fields: Record<string, unknown> = {};
  // Only required fields fall back to their defaults, so library demo copy never leaks in.
  for (const [k, m] of Object.entries(def.meta.fields))
    if (!m.optional && m.default !== undefined) fields[k] = structuredClone(m.default);
  Object.assign(fields, fieldsFromAgent(registry, input.type, input.fields ?? {}));
  const { type, fields: _f, id, v: _v, ...rest } = input;
  return {
    ...rest,
    id: (id ?? newId("blk")) as Block["id"],
    type,
    v: def.version,
    fields,
  } as Block;
}

/** Normalise an explicit section from the agent: ids filled in, blocks built with `makeBlock`. */
export function makeSection(registry: BlockRegistry, raw: Record<string, unknown>): Section {
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  return {
    ...raw,
    id: (typeof raw.id === "string" ? raw.id : newId("sec")) as Section["id"],
    layout: raw.layout ?? { mode: "stack", columns: { d: [12] } },
    style: isRecord(raw.style) ? raw.style : { colorTheme: "light" },
    blocks: blocks.map((b, i) => {
      if (!isRecord(b) || typeof b.type !== "string")
        throw new ToolError(`section.blocks[${i}] needs a "type".`, "invalid_arguments");
      return makeBlock(registry, b as { type: string });
    }),
  } as Section;
}

export const insertSection = defineTool({
  name: "insert_section",
  title: "Insert section",
  description:
    "Add a section to a page from a preset id (preferred — see list_section_presets) or an explicit section. Preset sections arrive with designed demo copy: replace it with the owner's real content using update_block. Header presets restyle the site header and footer presets replace the site footer (page is ignored for those). Returns the new section and block ids.",
  input: z.object({
    site: siteArg,
    page: z
      .string()
      .optional()
      .describe("Page id/slug/title (not needed for header/footer presets)."),
    preset: z
      .string()
      .optional()
      .describe('Preset id, e.g. "hero/split-image@1" (version optional).'),
    section: z
      .looseObject({})
      .optional()
      .describe(
        "Explicit section ({layout, style, blocks:[{type, fields, variant?, column?}]}); ids are generated when omitted; rich text as Markdown.",
      ),
    at: positionArg.optional(),
    colorTheme: themeArg.optional(),
    primaryLink: z
      .unknown()
      .optional()
      .describe(
        "Link for the main call to action ({type:'page', page:'pg_…'} or {type:'url', url}).",
      ),
    secondaryLink: z.unknown().optional(),
    collection: z.string().optional().describe("Collection for summary/events/product presets."),
    label: z.string().max(80).optional().describe("Layers label for the section."),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    if (!!input.preset === !!input.section)
      throw new ToolError("Give exactly one of preset or section.", "invalid_arguments");
    const links: Record<string, unknown> = {};
    for (const k of ["primaryLink", "secondaryLink"] as const) {
      if (input[k] === undefined) continue;
      const r = LinkSchema.safeParse(input[k]);
      if (!r.success)
        throw new ToolError(
          `${k} is not a valid link: ${r.error.issues.map((i) => i.message).join("; ")}`,
          "invalid_arguments",
        );
      links[k] = r.data;
    }
    if (input.preset) {
      const preset = findPreset(input.preset);
      const opts = { colorTheme: input.colorTheme, collection: input.collection, ...links };
      // The preset's example links (/book, /retreats…) point at pages this site has, so an
      // inserted preset never stops a publish; links passed in are checked the same way.
      const linkNote = (changes: LinkChange[]) =>
        changes.length
          ? {
              linksChanged: changes.map((c) => ({ from: c.from, to: c.to })),
              linkNote:
                "Example links that lead nowhere on this site were pointed at existing pages; change them with update_block.",
            }
          : {};
      if (preset.target === "header") {
        const { value: header, changes } = resolveInternalLinks(preset.build(opts), doc);
        await ctx.apply(siteId, [{ op: "site.update", set: { header } } as OpBody]);
        return {
          data: {
            applied: preset.id,
            header,
            note: "The site header now uses this preset.",
            ...linkNote(changes),
          },
        };
      }
      const { value: section, changes } = resolveInternalLinks(preset.build(opts) as Section, doc);
      if (input.label) section.label = input.label;
      if (preset.target === "footer") {
        await ctx.apply(siteId, [{ op: "site.update", set: { footer: section } } as OpBody]);
        return {
          data: {
            replaced: "footer",
            section: sectionSummary(ctx.registry, section),
            note: 'Edit footer blocks with page "footer".',
            ...linkNote(changes),
          },
        };
      }
      if (!input.page)
        throw new ToolError("page is required for page sections.", "invalid_arguments");
      const page = pageOnly(doc, input.page);
      await ctx.apply(siteId, [
        { op: "section.insert", page, at: input.at ?? "end", section } as OpBody,
      ]);
      return {
        data: {
          page,
          section: sectionSummary(ctx.registry, section),
          copyGuidance: preset.copy.map((c) => `${c.label}: ${c.words[0]}–${c.words[1]} words`),
          next: "Replace the demo copy with the owner's content (update_block), then run design_check.",
          ...linkNote(changes),
        },
      };
    }
    if (!input.page) throw new ToolError("page is required.", "invalid_arguments");
    const page = pageOnly(doc, input.page);
    const section = makeSection(ctx.registry, input.section as Record<string, unknown>);
    if (input.colorTheme)
      section.style = { ...(section.style ?? {}), colorTheme: input.colorTheme };
    if (input.label) section.label = input.label;
    await ctx.apply(siteId, [
      { op: "section.insert", page, at: input.at ?? "end", section } as OpBody,
    ]);
    return { data: { page, section: sectionSummary(ctx.registry, section) } };
  },
});

export const updateSection = defineTool({
  name: "update_section",
  title: "Update section",
  description:
    'Change a section\'s settings with dot-path patches, e.g. set {"style.colorTheme": "dark", "style.padding": {"d": "xl", "m": "lg"}, "label": "Intro", "anchor": "classes", "hidden": true, "layout": {...}}. Shortcuts: colorTheme. Blocks are edited with the block tools.',
  input: z.object({
    site: siteArg,
    page: containerArg,
    section: z.string(),
    set: z.record(z.string(), z.unknown()).optional(),
    unset: z.array(z.string()).optional(),
    colorTheme: themeArg.optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    requireSection(doc, page, input.section);
    const set = { ...(input.set ?? {}) };
    if (input.colorTheme) set["style.colorTheme"] = input.colorTheme;
    const body: Record<string, unknown> = { op: "section.update", page, section: input.section };
    if (Object.keys(set).length) body.set = set;
    if (input.unset?.length) body.unset = input.unset;
    const { doc: next } = await ctx.apply(siteId, [body as OpBody]);
    return {
      data: { section: sectionSummary(ctx.registry, requireSection(next, page, input.section)) },
    };
  },
});

export const moveSection = defineTool({
  name: "move_section",
  title: "Move section",
  description: "Reorder a section within its page.",
  input: z.object({ site: siteArg, page: z.string(), section: z.string(), at: positionArg }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = pageOnly(doc, input.page);
    requireSection(doc, page, input.section);
    const { doc: next } = await ctx.apply(siteId, [
      { op: "section.move", page, section: input.section, at: input.at } as OpBody,
    ]);
    return { data: { order: next.pages[page as never]?.sections.map((s: Section) => s.id) } };
  },
});

export const deleteSection = defineTool({
  name: "delete_section",
  title: "Delete section",
  description:
    "Remove a section and its blocks from a page (recoverable from the session snapshot or discard_draft).",
  input: z.object({ site: siteArg, page: z.string(), section: z.string() }),
  annotations: { destructiveHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = pageOnly(doc, input.page);
    requireSection(doc, page, input.section);
    await ctx.apply(siteId, [{ op: "section.delete", page, section: input.section } as OpBody]);
    return { data: { deleted: input.section } };
  },
});

const gridItemArg = z
  .looseObject({})
  .describe(
    "Grid placement {d:{x,y,w,h,z?,bleed?}, t?, m?}: 24 columns on desktop/tablet, 8 on mobile, 1-based.",
  );

export const insertBlock = defineTool({
  name: "insert_block",
  title: "Insert block",
  description:
    "Add a block to a section. Fields are validated against the block type (see list_blocks); rich text as Markdown. In stack sections pick a column (0-based); in grid sections give place (auto-placed at the bottom otherwise) and then check the mobile layout (auto_mobile_layout).",
  input: z.object({
    site: siteArg,
    page: containerArg,
    section: z.string(),
    block: z
      .looseObject({
        type: z.string(),
        fields: z.record(z.string(), z.unknown()).optional(),
        variant: z.string().optional(),
        style: z.record(z.string(), z.unknown()).optional(),
        column: z.int().min(0).max(3).optional(),
        label: z.string().optional(),
      })
      .describe("{type, fields, variant?, style?, column?, label?}"),
    at: positionArg.optional(),
    place: gridItemArg.optional(),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    requireSection(doc, page, input.section);
    const made = makeBlock(ctx.registry, input.block as { type: string });
    // Demo links from the block's defaults (/schedule…) point at pages this site has; links
    // the caller gave are kept as given (design_check reports them if they lead nowhere).
    const block = resolveInternalLinks(made, doc).value;
    for (const k of Object.keys(input.block.fields ?? {}))
      if (k in made.fields) block.fields[k] = made.fields[k];
    const body: Record<string, unknown> = {
      op: "block.insert",
      page,
      section: input.section,
      at: input.at ?? "end",
      block,
    };
    if (input.place) body.place = input.place;
    const { doc: next, warnings } = await ctx.apply(siteId, [body as OpBody]);
    const placed = findBlock(next, page as never, block.id);
    return {
      data: {
        block: blockSummary(ctx.registry, placed?.block ?? block),
        ...(warnings.length ? { warnings } : {}),
      },
    };
  },
});

export const updateBlock = defineTool({
  name: "update_block",
  title: "Update block",
  description:
    "Edit a block: set replaces whole top-level fields (rich text as Markdown; lists are replaced whole), unset removes optional fields; variant/style/column/label/hidden adjust presentation (null removes). Ids are preserved.",
  input: z.object({
    site: siteArg,
    page: containerArg,
    block: z.string(),
    set: z.record(z.string(), z.unknown()).optional(),
    unset: z.array(z.string()).optional(),
    variant: z.string().nullable().optional(),
    style: z.record(z.string(), z.unknown()).nullable().optional(),
    column: z.int().min(0).max(3).nullable().optional(),
    label: z.string().max(80).nullable().optional(),
    hidden: z.boolean().nullable().optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    const { block } = requireBlock(doc, page, input.block);
    const body: Record<string, unknown> = { op: "block.update", page, block: input.block };
    if (input.set) body.set = fieldsFromAgent(ctx.registry, block.type, input.set);
    if (input.unset?.length) body.unset = input.unset;
    for (const k of ["variant", "style", "column", "label", "hidden"] as const)
      if (input[k] !== undefined) body[k] = input[k];
    if (Object.keys(body).length === 3)
      throw new ToolError(
        "Nothing to change: give set, unset, variant, style, column, label or hidden.",
        "invalid_arguments",
      );
    const { doc: next } = await ctx.apply(siteId, [body as OpBody]);
    const updated = findBlock(next, page as never, input.block)?.block ?? block;
    return { data: { block: blockSummary(ctx.registry, updated) } };
  },
});

export const moveBlock = defineTool({
  name: "move_block",
  title: "Move block",
  description:
    "Move a block within its page (to another section and/or position). Give column for stack sections and place for grid sections.",
  input: z.object({
    site: siteArg,
    page: containerArg,
    block: z.string(),
    to: z.object({
      section: z.string(),
      at: positionArg.optional(),
      column: z.int().min(0).max(3).nullable().optional(),
      place: gridItemArg.optional(),
    }),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    requireBlock(doc, page, input.block);
    requireSection(doc, page, input.to.section);
    const to: Record<string, unknown> = { section: input.to.section, at: input.to.at ?? "end" };
    if (input.to.column !== undefined) to.column = input.to.column;
    if (input.to.place) to.place = input.to.place;
    await ctx.apply(siteId, [{ op: "block.move", page, block: input.block, to } as OpBody]);
    return { data: { moved: input.block, to } };
  },
});

export const deleteBlock = defineTool({
  name: "delete_block",
  title: "Delete block",
  description:
    "Remove a block from its section (recoverable via the session snapshot or discard_draft).",
  input: z.object({ site: siteArg, page: containerArg, block: z.string() }),
  annotations: { destructiveHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    requireBlock(doc, page, input.block);
    await ctx.apply(siteId, [{ op: "block.delete", page, block: input.block } as OpBody]);
    return { data: { deleted: input.block } };
  },
});

const rectArg = z
  .looseObject({})
  .describe(
    "{x, y, w, h, z?, bleed?: 'left'|'right'|'both'} (1-based; 24 columns desktop/tablet, 8 mobile)",
  );

export const placeInGrid = defineTool({
  name: "place_in_grid",
  title: "Place in grid",
  description:
    "Set a block's grid placement per breakpoint in a grid section. d = desktop (required on first placement), t = tablet override (null removes), m = mobile (null removes; regenerate with auto_mobile_layout). Rows grow automatically. Overlap is allowed (use z) but text must not overlap text.",
  input: z.object({
    site: siteArg,
    page: containerArg,
    section: z.string(),
    block: z.string(),
    d: rectArg.optional(),
    t: rectArg.nullable().optional(),
    m: rectArg.nullable().optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    const section = requireSection(doc, page, input.section);
    if (section.layout.mode !== "grid")
      throw new ToolError(
        `Section ${section.id} is a stack section; set the block's column with update_block instead.`,
        "invalid_arguments",
      );
    const bodies: OpBody[] = [];
    for (const bp of ["d", "t", "m"] as const) {
      const rect = input[bp];
      if (rect === undefined) continue;
      bodies.push({
        op: "grid.place",
        page,
        section: section.id,
        block: input.block,
        bp,
        rect,
      } as OpBody);
    }
    if (!bodies.length) throw new ToolError("Give at least one of d, t or m.", "invalid_arguments");
    const { doc: next } = await ctx.apply(siteId, bodies);
    const after = requireSection(next, page, section.id);
    return {
      data: {
        placement: after.layout.mode === "grid" ? after.layout.items[input.block as never] : null,
        rows: after.layout.mode === "grid" ? after.layout.rows : null,
        next:
          input.d && input.m === undefined
            ? "Desktop changed: review mobile (auto_mobile_layout or screenshot device mobile)."
            : undefined,
      },
    };
  },
});

export const autoMobileLayout = defineTool({
  name: "auto_mobile_layout",
  title: "Auto mobile layout",
  description:
    "Generate mobile grid placements for a grid section by visual reading order (top-to-bottom, left-to-right on the desktop grid, layered items kept on their host). Keeps existing mobile placements unless reset is true.",
  input: z.object({
    site: siteArg,
    page: containerArg,
    section: z.string(),
    reset: z.boolean().optional(),
  }),
  annotations: { idempotentHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const page = container(doc, input.page);
    const section = requireSection(doc, page, input.section);
    if (section.layout.mode !== "grid")
      return { data: { changed: 0, note: "Stack sections stack automatically on mobile." } };
    const ops = autoMobileLayoutOps(doc, page, section.id, { reset: input.reset });
    if (!ops.length)
      return { data: { changed: 0, note: "Mobile placements are already complete." } };
    const bodies = ops.map(({ id: _i, actor: _a, ts: _t, ...b }) => b as OpBody);
    const { doc: next } = await ctx.apply(siteId, bodies);
    const after = requireSection(next, page, section.id);
    return {
      data: {
        changed: ops.length,
        mobile:
          after.layout.mode === "grid"
            ? Object.fromEntries(Object.entries(after.layout.items).map(([id, it]) => [id, it.m]))
            : null,
      },
    };
  },
});

export const editTools = [
  insertSection,
  updateSection,
  moveSection,
  deleteSection,
  insertBlock,
  updateBlock,
  moveBlock,
  deleteBlock,
  placeInGrid,
  autoMobileLayout,
];

export type { ToolContext };
