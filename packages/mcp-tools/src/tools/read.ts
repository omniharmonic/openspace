import {
  getPreset,
  PRESET_CATEGORIES,
  type Preset,
  presetCatalog,
} from "@omniharmonic/openspace-blocks";
import { FOOTER } from "@omniharmonic/openspace-ops";
import {
  type Block,
  type BlockMeta,
  blockFieldsJsonSchema,
  type Page,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { compileStyles, getPairing } from "@omniharmonic/openspace-theme";
import { z } from "zod";
import { pagePathOf, resolvePage, type ToolContext } from "../context";
import { ToolError } from "../errors";
import { blockPreview, blockToAgent } from "../markdown";
import { containerArg, defineTool, siteArg } from "../tool";

export const listSites = defineTool({
  name: "list_sites",
  title: "List sites",
  description:
    "Sites this connection can edit, with their titles and live addresses. Start here when you don't know the site id.",
  input: z.object({}),
  annotations: { readOnlyHint: true },
  async handler(ctx) {
    const allowed = new Set(await ctx.allowedSites());
    const sites = (await ctx.store.listSites()).filter((s) => allowed.has(s.id));
    return { data: { sites, canPublish: ctx.grant.publish && ctx.store.capabilities.canPublish } };
  },
});

export function stylesSummary(doc: SiteDocument) {
  const compiled = compileStyles(doc.styles);
  const pairing = getPairing(doc.styles.choices.pairing);
  return {
    choices: doc.styles.choices,
    pairing: pairing
      ? { id: pairing.id, heading: pairing.heading.family, body: pairing.body.family }
      : { id: doc.styles.choices.pairing, unknown: true },
    overrides: doc.styles.overrides ?? null,
    brand: compiled.tokens.palette.brand,
    themes: Object.fromEntries(
      Object.entries(compiled.tokens.themes).map(([theme, c]) => [
        theme,
        {
          background: c.background,
          text: c.text,
          heading: c.heading,
          accent: c.accent,
          "accent-text": c["accent-text"],
        },
      ]),
    ),
    contrast: {
      mode: compiled.contrast.mode,
      adjustedBySolver: compiled.contrast.adjustments.length,
      failures: compiled.contrast.failures.length,
    },
  };
}

function pageSummary(page: Page) {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    path: pagePathOf(page),
    sections: page.sections.length,
    hidden: page.hidden ?? false,
  };
}

export const getSite = defineTool({
  name: "get_site",
  title: "Get site",
  description:
    "Site settings, navigation, header/footer, Site Styles summary, page list and collections. Call before editing to learn page ids and the current look.",
  input: z.object({ site: siteArg }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { site } = doc;
    return {
      data: {
        id: siteId,
        title: site.title,
        tagline: site.tagline ?? null,
        template: doc.config.template ?? null,
        url: doc.config.deploy.customDomain
          ? `https://${doc.config.deploy.customDomain}`
          : doc.config.deploy.url,
        nav: site.nav,
        header: site.header,
        footer: {
          sectionId: site.footer.id,
          layout: site.footer.layout.mode,
          blocks: site.footer.blocks.map((b) => ({ id: b.id, type: b.type })),
          note: 'Edit footer blocks with the block tools using page "footer".',
        },
        announcement: site.announcement ?? null,
        social: site.social ?? [],
        seo: site.seo ?? null,
        styles: stylesSummary(doc),
        pages: Object.values(doc.pages).map(pageSummary),
        collections: Object.entries(doc.collections).map(([name, items]) => ({
          name,
          kind: Object.values(items)[0]?.kind ?? doc.collectionConfigs?.[name]?.kind ?? null,
          items: Object.keys(items).length,
        })),
        media: Object.keys(doc.media).length,
        capabilities: {
          ...ctx.store.capabilities,
          // Same answer as list_sites: publishing needs both the store and this connection.
          canPublish: ctx.grant.publish && ctx.store.capabilities.canPublish,
          grantPublish: ctx.grant.publish,
        },
      },
    };
  },
});

function sectionView(
  ctx: ToolContext,
  section: Section,
  detail: "full" | "outline",
  doc?: SiteDocument,
): Record<string, unknown> {
  const registry = doc ? ctx.registryFor(doc) : ctx.registry;
  const blocks = section.blocks.map((b: Block) => {
    if (detail === "outline") {
      const out: Record<string, unknown> = {
        id: b.id,
        type: b.type,
        text: blockPreview(registry, b),
      };
      if (b.variant) out.variant = b.variant;
      if (b.column !== undefined) out.column = b.column;
      if (b.hidden) out.hidden = true;
      return out;
    }
    return blockToAgent(registry, b);
  });
  const base: Record<string, unknown> = {
    id: section.id,
    ...(section.preset ? { preset: section.preset } : {}),
    ...(section.label ? { label: section.label } : {}),
    ...(section.hidden ? { hidden: true } : {}),
    ...(section.locked ? { locked: true } : {}),
    theme: section.style?.colorTheme ?? "light",
  };
  if (detail === "outline") {
    base.layout =
      section.layout.mode === "grid" ? "grid" : `stack ${JSON.stringify(section.layout.columns.d)}`;
    base.blocks = blocks;
    return base;
  }
  return {
    ...base,
    layout: section.layout,
    style: section.style ?? {},
    ...(section.anchor ? { anchor: section.anchor } : {}),
    blocks,
  };
}

export const getPage = defineTool({
  name: "get_page",
  title: "Get page",
  description:
    'A page\'s section/block tree with stable ids, fields (rich text as Markdown), layout and style. Use detail "outline" for a compact overview (ids, types, text previews) and "full" before editing fields or grid placements. page "footer" returns the site footer section.',
  input: z.object({
    site: siteArg,
    page: containerArg,
    detail: z.enum(["full", "outline"]).optional().describe('Default "full".'),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const detail = input.detail ?? "full";
    const { id, page } = resolvePage(doc, input.page, { allowFooter: true });
    if (id === FOOTER || !page)
      return { data: { page: FOOTER, sections: [sectionView(ctx, doc.site.footer, detail, doc)] } };
    return {
      data: {
        id: page.id,
        title: page.title,
        slug: page.slug,
        path: pagePathOf(page),
        seo: page.seo ?? {},
        ...(page.header ? { header: page.header } : {}),
        ...(page.hidden ? { hidden: true } : {}),
        sections: page.sections.map((s) => sectionView(ctx, s, detail, doc)),
      },
    };
  },
});

function blockMetaView(m: BlockMeta, full: boolean) {
  const fields = Object.fromEntries(
    Object.entries(m.fields).map(([k, f]) => {
      const v: Record<string, unknown> = {
        kind: f.kind === "richText" ? "richText (Markdown)" : f.kind,
      };
      if (f.optional) v.optional = true;
      if (f.label) v.label = f.label;
      if (full && f.help) v.help = f.help;
      if (f.ai) v.ai = f.ai;
      if (f.kind === "select") v.options = f.options.map((o) => o.value);
      if (f.kind === "text" && f.maxLength) v.maxLength = f.maxLength;
      if (f.kind === "list")
        v.itemFields = Object.fromEntries(
          Object.entries(f.fields).map(([ik, iv]) => [
            ik,
            iv.kind === "richText" ? "richText (Markdown)" : iv.kind,
          ]),
        );
      if (f.kind === "image") v.shape = "{ src, alt, focal? }";
      if (f.kind === "link") v.allow = f.allow;
      return [k, v];
    }),
  );
  return {
    type: m.type,
    label: m.label,
    category: m.category,
    description: m.description,
    variants: m.variants,
    styleSlots: m.styleSlots,
    fields,
    ai: m.ai,
  };
}

export const listBlocks = defineTool({
  name: "list_blocks",
  title: "List blocks",
  description:
    "The block catalog: each block's fields (rich text as Markdown), variants, style slots and AI guidance (purpose, whenToUse, avoid). Filter by category or type. Prefer section presets for whole sections; use blocks to add or adjust pieces.",
  input: z.object({
    category: z.string().optional(),
    type: z.string().optional().describe("One block type for full detail."),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    let metas = ctx.registry.meta();
    if (input.type) {
      metas = metas.filter((m) => m.type === input.type);
      if (!metas.length)
        throw new ToolError(
          `Unknown block type "${input.type}". Types: ${ctx.registry.types().join(", ")}.`,
          "not_found",
        );
    }
    if (input.category) metas = metas.filter((m) => m.category === input.category);
    return {
      data: {
        blocks: metas.map((m) => blockMetaView(m, Boolean(input.type))),
        categories: [...new Set(ctx.registry.meta().map((m) => m.category))],
      },
    };
  },
});

export const getBlockSchema = defineTool({
  name: "get_block_schema",
  title: "Get block schema",
  description:
    "JSON Schema for one block type's fields (with labels and AI hints). Rich-text fields are shown as ProseMirror JSON but the edit tools also accept a Markdown string for them.",
  input: z.object({ type: z.string() }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const def = ctx.registry.get(input.type);
    if (!def)
      throw new ToolError(
        `Unknown block type "${input.type}". Types: ${ctx.registry.types().join(", ")}.`,
        "not_found",
      );
    return {
      data: {
        type: def.type,
        version: def.version,
        variants: def.meta.variants,
        styleSlots: def.meta.styleSlots,
        fields: blockFieldsJsonSchema(def),
      },
    };
  },
});

export const listSectionPresets = defineTool({
  name: "list_section_presets",
  title: "List section presets",
  description:
    "Designed section presets by category (hero, about, services, gallery, testimonials, pricing, faq, team, stats, cta, contact, newsletter, blog, events, products, footer, header) with descriptions, layout, designed-for color themes, copy-length ranges and AI guidance. Compose pages from these with insert_section/create_page.",
  input: z.object({
    category: z.enum(PRESET_CATEGORIES).optional(),
    query: z.string().optional().describe("Words to match in label, description or tags."),
    detail: z.enum(["brief", "full"]).optional().describe('Default "brief".'),
  }),
  annotations: { readOnlyHint: true },
  async handler(_ctx, input) {
    let list = presetCatalog.slice();
    if (input.category) list = list.filter((p) => p.category === input.category);
    if (input.query) {
      const words = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((p) => {
        const hay =
          `${p.id} ${p.label} ${p.description} ${p.tags.join(" ")} ${p.ai.whenToUse}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    const full = input.detail === "full";
    return {
      data: {
        presets: list.map((p) =>
          full
            ? p
            : {
                id: p.id,
                label: p.label,
                description: p.description,
                target: p.target,
                layout: p.layout,
                overlap: p.overlap,
                themes: p.themes,
                whenToUse: p.ai.whenToUse,
              },
        ),
        categories: PRESET_CATEGORIES,
      },
    };
  },
});

/** Find a preset by exact id, or by `category/name` (latest version). */
export function findPreset(id: string): Preset {
  const exact = getPreset(id);
  if (exact) return exact;
  const base = id.replace(/@\d+$/, "");
  const matches = presetCatalog
    .filter((p) => p.id.startsWith(`${base}@`))
    .sort((a, b) => b.version - a.version);
  const best = matches[0] && getPreset(matches[0].id);
  if (best) return best;
  const category = base.split("/")[0] ?? "";
  const near = presetCatalog.filter((p) => p.category === category).map((p) => p.id);
  throw new ToolError(
    `Unknown preset "${id}".${near.length ? ` In ${category}: ${near.join(", ")}.` : " Call list_section_presets."}`,
    "not_found",
  );
}
