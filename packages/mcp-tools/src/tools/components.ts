/**
 * Custom components (ADR custom-components §10): list, read, create, update, preview and insert
 * site-level designer sections. Definitions change through `component.upsert` ops (owners and
 * designers only — the role rules refuse others); instances are ordinary blocks whose fields
 * owners edit in Studio.
 */
import { designerComponent, designerComponentCatalog } from "@omniharmonic/openspace-blocks";
import { componentIssues, type Issue } from "@omniharmonic/openspace-lint";
import type { OpBody } from "@omniharmonic/openspace-ops";
import {
  COMPONENT_PREVIEW_IDS,
  componentPreview,
  componentPreviewPath,
} from "@omniharmonic/openspace-renderer";
import {
  type Block,
  COLOR_THEMES,
  type ComponentDefinition,
  checkComponent,
  compileComponentFields,
  componentBlockDefinition,
  componentInstances,
  componentSection,
  createBlockRegistry,
  describeComponentIssues,
  fieldsMeta,
  resolveInternalLinks,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { z } from "zod";
import { pagePathOf, resolvePage } from "../context";
import { ToolError } from "../errors";
import { fieldsFromAgent, valuesFromAgent } from "../markdown";
import { renderPreviewHtml } from "../render";
import type { Device, Screenshot } from "../store";
import { anchorArg, defineTool, positionArg, siteArg, type ToolOutput } from "../tool";
import { takenAnchor } from "./edit";

const nameArg = z
  .string()
  .describe('Component name, lowercase-hyphenated (e.g. "editorial-hero").');

const GUIDE =
  "Prefer section presets. Use a component for a bespoke moment presets can't express. Always expose every word, image and link as a field (owners edit fields, never code), always style with theme tokens (var(--os-color-…), var(--os-font-…), var(--os-space-…)), use the 767/768/1199/1200 breakpoints and honour reduced motion.";

/** Findings (Design check) that concern component `name`: its definition and its instances. */
function findingsFor(doc: SiteDocument, name: string): Issue[] {
  const blocks = new Set(componentInstances(doc, name).map((i) => i.blockId));
  return componentIssues(doc).filter(
    (i) => (i.block && blocks.has(i.block)) || i.id.split(":").some((part) => part === name),
  );
}

const findingLines = (issues: readonly Issue[]) =>
  issues.map((i) => ({ severity: i.severity, rule: i.rule, message: i.message, fix: i.fix }));

function invalid(def: unknown, what: string): ToolError {
  const r = checkComponent(def);
  const lines = r.ok ? [] : describeComponentIssues(r.issues);
  return new ToolError(
    `The ${what} has problems; nothing was saved:\n${lines.map((l) => `- ${l}`).join("\n")}`,
    "invalid_component",
    [],
    "Fix each listed line (template tags/attributes, CSS rules, JavaScript) and call again. Field values in defaults must match the field kinds.",
  );
}

/** Sample content given with Markdown for rich-text fields, converted (best effort). */
function withAgentDefaults(def: ComponentDefinition): ComponentDefinition {
  if (!def || typeof def !== "object" || !def.fields || !def.defaults) return def;
  try {
    const metas = fieldsMeta(compileComponentFields(def.fields));
    return { ...def, defaults: valuesFromAgent(metas, def.defaults) };
  } catch {
    return def;
  }
}

function siteComponent(doc: SiteDocument, name: string): ComponentDefinition {
  const def = doc.components?.[name];
  if (!def)
    throw new ToolError(
      `This site has no component "${name}". Components: ${Object.keys(doc.components ?? {}).join(", ") || "none"}.`,
      "not_found",
      [],
      "list_components shows the site's components and the Designer components library (insert_component can add one from the library).",
    );
  return def;
}

export const listComponents = defineTool({
  name: "list_components",
  title: "List components",
  description: `The site's custom components (designer sections with their own markup, CSS and small JS, edited by owners through typed fields) and the opt-in Designer components library. ${GUIDE}`,
  input: z.object({ site: siteArg }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const site = Object.values(doc.components ?? {}).map((def) => {
      const r = checkComponent(def);
      return {
        name: def.name,
        label: def.label,
        version: def.version,
        ...(def.description ? { description: def.description } : {}),
        fields: Object.entries(def.fields).map(([key, f]) => ({
          key,
          kind: f.kind,
          ...(f.label ? { label: f.label } : {}),
        })),
        instances: componentInstances(doc, def.name).length,
        hasScript: Boolean(def.js?.trim()),
        ...(r.ok ? {} : { problems: describeComponentIssues(r.issues).slice(0, 5) }),
      };
    });
    const library = designerComponentCatalog().map((c) => ({
      ...c,
      inSite: Boolean(doc.components?.[c.name]),
    }));
    return { data: { components: site, library, guidance: GUIDE } };
  },
});

export const getComponent = defineTool({
  name: "get_component",
  title: "Get component",
  description:
    "A custom component's full definition (fields, defaults, template, css, js, section defaults, ai) plus where it is used and its Design check findings. Library components (not yet in the site) are returned too.",
  input: z.object({ site: siteArg, name: nameArg }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const def = doc.components?.[input.name] ?? designerComponent(input.name);
    if (!def) siteComponent(doc, input.name);
    const inSite = Boolean(doc.components?.[input.name]);
    return {
      data: {
        component: def,
        inSite,
        instances: componentInstances(doc, input.name).map((i) => ({
          page: i.container,
          section: i.section.id,
          block: i.blockId,
        })),
        findings: inSite ? findingLines(findingsFor(doc, input.name)) : [],
      },
    };
  },
});

const definitionArg = z
  .looseObject({})
  .describe(
    "The full definition: {name, label, description?, version: 1, category?, fields: {key: {kind: text|richText|image|link|select|boolean|number|color|list, label?, optional?, …}}, defaults: {a complete sample instance}, template, css?, js?, section?: {width?, padding?, colorTheme?}, ai?: {purpose, whenToUse, avoid?}}.",
  );

export const createComponent = defineTool({
  name: "create_component",
  title: "Create component",
  description: `Add a custom component to the site: pass a full definition, or "from" a Designer components library name (optionally renamed). Templates use {{field}} (escaped), {{rich f}}, {{image f sizes=… aspect=…}}, {{button f label=g}}, {{#link f}}…{{/link}}, href="{{href f}}", style="--x: {{color f}}", {{#if}}/{{else}}/{{#unless}}, {{#each list}} with {{@index}}/{{@number}}, and {{@uid}} in ids; no <script>/<style>/<img>/<iframe>, no on* handlers. CSS is scoped automatically (:scope = the component root). js is the body of function(root, ctx) run on the published page only (ctx.reducedMotion); no network, eval or innerHTML. Then insert_component and preview_component. ${GUIDE}`,
  input: z.object({
    site: siteArg,
    component: definitionArg.optional(),
    from: z.string().optional().describe("Designer components library name to copy."),
    name: z.string().optional().describe('New name when copying "from" the library.'),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    if (!input.component === !input.from)
      throw new ToolError(
        'Give either "component" (a definition) or "from" (a library name).',
        "invalid_arguments",
      );
    let def: ComponentDefinition;
    if (input.from) {
      const lib = designerComponent(input.from);
      if (!lib)
        throw new ToolError(
          `No library component "${input.from}". Library: ${designerComponentCatalog()
            .map((c) => c.name)
            .join(", ")}.`,
          "not_found",
        );
      def = { ...lib, ...(input.name ? { name: input.name } : {}) };
    } else def = withAgentDefaults(input.component as unknown as ComponentDefinition);
    if (doc.components?.[def.name])
      throw new ToolError(
        `The site already has a component "${def.name}".`,
        "exists",
        [],
        "Use update_component to change it, or pick another name.",
      );
    if (!checkComponent(def).ok) throw invalid(def, "component");
    const { doc: next } = await ctx.apply(siteId, [
      { op: "component.upsert", component: def } as OpBody,
    ]);
    return {
      data: {
        component: { name: def.name, label: def.label, version: def.version },
        findings: findingLines(findingsFor(next, def.name)),
        next: "insert_component to place it on a page, then preview_component (screenshots) to look at it.",
      },
    };
  },
});

export const updateComponent = defineTool({
  name: "update_component",
  title: "Update component",
  description:
    "Change a custom component (only owners and designers may). changes replaces top-level parts (label, description, fields, defaults, template, css, js, section, ai, version). Every section using it must stay valid: if fields change incompatibly, raise version and pass migrate ({rename:{old:new}, set:{newField: value}, remove:[...]}) — existing sections are upgraded in the same step. Returns Design check findings.",
  input: z.object({
    site: siteArg,
    name: nameArg,
    changes: z.looseObject({}).describe("Top-level parts of the definition to replace."),
    migrate: z
      .strictObject({
        rename: z.record(z.string(), z.string()).optional(),
        set: z.record(z.string(), z.unknown()).optional(),
        remove: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const old = siteComponent(doc, input.name);
    const changes = input.changes as Partial<ComponentDefinition>;
    if (changes.name && changes.name !== old.name)
      throw new ToolError(
        "A component can't be renamed; create a new one instead.",
        "invalid_arguments",
      );
    const def: ComponentDefinition = withAgentDefaults({ ...old, ...changes, name: old.name });
    if (input.migrate) {
      if (!(def.version > old.version))
        throw new ToolError(
          `Raise version above ${old.version} when migrating existing sections.`,
          "invalid_arguments",
        );
      def.migrations = { ...(def.migrations ?? {}), [String(old.version)]: input.migrate };
    }
    if (!checkComponent(def).ok) throw invalid(def, "updated component");
    const block = componentBlockDefinition(def);
    const registry = createBlockRegistry(block ? [block] : []);
    const instances: Record<string, { v: number; fields: Record<string, unknown> }> = {};
    const broken: string[] = [];
    for (const inst of componentInstances(doc, def.name)) {
      const b = inst.section.blocks.find((x) => x.id === inst.blockId) as Block;
      let migrated = b;
      try {
        migrated = registry.migrate(b);
      } catch (e) {
        broken.push(`${inst.blockId}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const r = registry.validate(migrated);
      if (!r.success)
        broken.push(`${inst.blockId}: ${r.issues[0]?.path.join(".")}: ${r.issues[0]?.message}`);
      else if (migrated !== b) instances[b.id] = { v: migrated.v, fields: migrated.fields };
    }
    if (broken.length)
      throw new ToolError(
        `These sections would stop working with the new definition:\n${broken.map((l) => `- ${l}`).join("\n")}`,
        "would_break",
        [],
        "Keep the change compatible (optional new fields, same kinds), or raise version and pass migrate to upgrade existing sections.",
      );
    const { doc: next } = await ctx.apply(siteId, [
      {
        op: "component.upsert",
        component: def,
        ...(Object.keys(instances).length ? { instances } : {}),
      } as OpBody,
    ]);
    return {
      data: {
        component: { name: def.name, label: def.label, version: def.version },
        migratedSections: Object.keys(instances).length,
        findings: findingLines(findingsFor(next, def.name)),
      },
    };
  },
});

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 834, mobile: 390 };

export const previewComponent = defineTool({
  name: "preview_component",
  title: "Preview component",
  description:
    "Look at a custom component on its own, with its sample content or the fields you give, in the site's styles: screenshots (desktop and mobile by default) when available, otherwise its rendered HTML. Also returns its Design check findings (accessibility, contrast, motion, budgets, mobile) — fix errors before showing the owner.",
  input: z.object({
    site: siteArg,
    name: nameArg,
    fields: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Sample values (rich text as Markdown)."),
    theme: z.enum(COLOR_THEMES).optional().describe("Section color theme to preview in."),
    device: z
      .enum(["desktop", "tablet", "mobile", "both", "all"])
      .optional()
      .describe('Default "both" (desktop + mobile).'),
  }),
  annotations: { readOnlyHint: true },
  async handler(ctx, input): Promise<ToolOutput> {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const def = siteComponent(doc, input.name);
    const fields = input.fields
      ? fieldsFromAgent(ctx.registryFor(doc), `component/${def.name}`, input.fields)
      : undefined;
    const preview = componentPreview(doc, def, {
      ...(fields ? { fields } : {}),
      ...(input.theme ? { colorTheme: input.theme } : {}),
    });
    const findings = findingLines(findingsFor(preview.doc, def.name));
    const html = renderPreviewHtml(preview.doc, preview.page.id, {
      sectionId: COMPONENT_PREVIEW_IDS.section,
    });
    if (!ctx.store.capabilities.canScreenshot || !ctx.store.screenshot) {
      const m = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html);
      return {
        text: `Screenshots aren't available here; this is the rendered component.\n\n${(m?.[1] ?? html).slice(0, 60_000)}`,
        data: { findings },
      };
    }
    const devices: Device[] =
      input.device === "all"
        ? ["desktop", "tablet", "mobile"]
        : input.device === "both" || !input.device
          ? ["desktop", "mobile"]
          : [input.device];
    const path = componentPreviewPath(def.name, {
      ...(fields ? { fields } : {}),
      ...(input.theme ? { colorTheme: input.theme } : {}),
    });
    const images: NonNullable<ToolOutput["images"]> = [];
    const notes: string[] = [];
    for (const device of devices) {
      const shot: Screenshot = await ctx.store.screenshot(siteId, {
        pageId: preview.page.id,
        sectionId: COMPONENT_PREVIEW_IDS.section,
        device,
        width: DEVICE_WIDTH[device],
        fullPage: false,
        html,
        path,
      });
      images.push({
        base64: shot.base64,
        mimeType: shot.mimeType,
        caption: `${def.label} — ${device}`,
      });
      for (const part of shot.more ?? [])
        images.push({ ...part, caption: `${def.label} — ${device} (more)` });
      if (shot.note) notes.push(`${device}: ${shot.note}`);
    }
    const errors = findings.filter((f) => f.severity === "error").length;
    return {
      text: `${def.label}: ${devices.join(" + ")} preview.${errors ? ` ${errors} problem(s) block publishing — see findings.` : ""}${notes.length ? `\n${notes.join("\n")}` : ""}`,
      data: { findings },
      images,
    };
  },
});

export const insertComponent = defineTool({
  name: "insert_component",
  title: "Insert component",
  description:
    "Add a section using a custom component to a page (a site component, or a Designer components library name — it is added to the site first). fields override the sample content (rich text as Markdown); replace sample copy and photos with the owner's real content. Give it an anchor when the menu or a button should jump to it. Returns the section and block ids (edit later with update_block).",
  input: z.object({
    site: siteArg,
    page: z.string().describe("Page id/slug/title."),
    name: nameArg,
    fields: z.record(z.string(), z.unknown()).optional(),
    theme: z.enum(COLOR_THEMES).optional(),
    anchor: anchorArg.optional(),
    at: positionArg.optional(),
  }),
  annotations: {},
  async handler(ctx, input) {
    const siteId = await ctx.siteId(input.site);
    const doc = await ctx.doc(siteId);
    const { id: page } = resolvePage(doc, input.page);
    const bodies: OpBody[] = [];
    let def = doc.components?.[input.name];
    let view = doc;
    if (!def) {
      const lib = designerComponent(input.name);
      if (!lib) siteComponent(doc, input.name);
      def = lib as ComponentDefinition;
      bodies.push({ op: "component.upsert", component: def } as OpBody);
      view = { ...doc, components: { ...(doc.components ?? {}), [def.name]: def } };
    }
    const given = input.fields
      ? fieldsFromAgent(ctx.registryFor(view), `component/${def.name}`, input.fields)
      : {};
    // Sample links point at pages the site has; the caller's own fields are kept as given.
    const section = resolveInternalLinks(
      componentSection(def, { ...(input.theme ? { colorTheme: input.theme } : {}) }),
      view,
    ).value;
    const block = section.blocks[0] as Block;
    block.fields = { ...block.fields, ...given };
    if (input.anchor) section.anchor = takenAnchor(doc, page, input.anchor);
    bodies.push({ op: "section.insert", page, at: input.at ?? "end", section } as OpBody);
    const { doc: next } = await ctx.apply(siteId, bodies);
    const target = next.pages[page as keyof SiteDocument["pages"]];
    return {
      data: {
        page,
        section: section.id,
        block: block.id,
        addedToSite: bodies.length > 1,
        findings: findingLines(findingsFor(next, def.name)),
        preview: await ctx.store.previewUrl(siteId, target ? pagePathOf(target) : "/"),
      },
    };
  },
});

export const componentTools = [
  listComponents,
  getComponent,
  createComponent,
  updateComponent,
  previewComponent,
  insertComponent,
];
