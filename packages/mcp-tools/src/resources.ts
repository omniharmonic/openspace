/**
 * MCP resources (arch §10.2): block JSON Schemas, document schemas, each site's token set and
 * AGENTS.md, the design guidance (doc 04 §9) and the preset catalog — so the agent composes with
 * presets and tokens rather than inventing styles.
 */
import { presetCatalog } from "@omniharmonic/openspace-blocks";
import { blockFieldsJsonSchema, toJsonSchema } from "@omniharmonic/openspace-schema";
import { generateAgentsMd } from "@omniharmonic/openspace-site-kit/agents-md";
import { compileStyles } from "@omniharmonic/openspace-theme";
import type { ToolContext } from "./context";
import { ToolError } from "./errors";
import { DESIGN_GUIDANCE, ITERATION_GUIDANCE } from "./guidance";

export interface ResourceEntry {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType: string;
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

const DOC_SCHEMAS = [
  "page",
  "section",
  "block",
  "site",
  "styles",
  "rich-text",
  "collection-item",
] as const;

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "openspace://schemas/blocks/{type}",
    name: "block-schema",
    title: "Block JSON Schema",
    description: "JSON Schema for one block type's fields (labels and AI hints included).",
    mimeType: "application/json",
  },
  {
    uriTemplate: "openspace://sites/{site}/tokens",
    name: "site-tokens",
    title: "Site design tokens",
    description:
      "Compiled Site Styles: palette, role colors per section theme, fonts, CSS variables.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "openspace://sites/{site}/agents-md",
    name: "agents-md",
    title: "AGENTS.md",
    description: "How agents should edit the site: schema, conventions and safe-edit rules.",
    mimeType: "text/markdown",
  },
];

const json = (uri: string, value: unknown): ResourceContents => ({
  uri,
  mimeType: "application/json",
  text: JSON.stringify(value, null, 2),
});

export async function listResources(ctx: ToolContext): Promise<ResourceEntry[]> {
  const out: ResourceEntry[] = [
    {
      uri: "openspace://guidance/design",
      name: "design-guidance",
      title: "Design guidance",
      description:
        "The rules Studio's Design check enforces (doc 04 §9) and how to work with presets and tokens.",
      mimeType: "text/markdown",
    },
    {
      uri: "openspace://guidance/iteration",
      name: "iteration-guidance",
      title: "Design iteration loop",
      description: "Inspect → check → edit → look → judge, with the tools for each step.",
      mimeType: "text/markdown",
    },
    {
      uri: "openspace://presets",
      name: "presets",
      title: "Section preset catalog",
      description: "Every section preset with copy ranges, image slots, themes and AI guidance.",
      mimeType: "application/json",
    },
    {
      uri: "openspace://schemas/blocks",
      name: "block-schemas",
      title: "Block JSON Schemas",
      description: "Field JSON Schemas for every block type.",
      mimeType: "application/json",
    },
  ];
  for (const name of DOC_SCHEMAS)
    out.push({
      uri: `openspace://schemas/${name}`,
      name: `${name}-schema`,
      title: `${name} JSON Schema`,
      mimeType: "application/json",
    });
  for (const id of await ctx.allowedSites()) {
    out.push({
      uri: `openspace://sites/${id}/tokens`,
      name: `${id}-tokens`,
      title: "Site design tokens",
      mimeType: "application/json",
    });
    out.push({
      uri: `openspace://sites/${id}/agents-md`,
      name: `${id}-agents-md`,
      title: "AGENTS.md",
      mimeType: "text/markdown",
    });
  }
  return out;
}

export async function readResource(ctx: ToolContext, uri: string): Promise<ResourceContents> {
  if (uri === "openspace://guidance/design")
    return { uri, mimeType: "text/markdown", text: DESIGN_GUIDANCE };
  if (uri === "openspace://guidance/iteration")
    return { uri, mimeType: "text/markdown", text: ITERATION_GUIDANCE };
  if (uri === "openspace://presets") return json(uri, presetCatalog);
  if (uri === "openspace://schemas/blocks")
    return json(
      uri,
      Object.fromEntries(ctx.registry.list().map((d) => [d.type, blockFieldsJsonSchema(d)])),
    );
  let m = /^openspace:\/\/schemas\/blocks\/([a-z0-9/-]+)$/.exec(uri);
  if (m) {
    const def = ctx.registry.get(m[1] as string);
    if (!def) throw new ToolError(`Unknown block type "${m[1]}".`, "not_found");
    return json(uri, blockFieldsJsonSchema(def));
  }
  m = /^openspace:\/\/schemas\/([a-z-]+)$/.exec(uri);
  if (m && (DOC_SCHEMAS as readonly string[]).includes(m[1] as string))
    return json(uri, toJsonSchema(m[1] as (typeof DOC_SCHEMAS)[number]));
  m = /^openspace:\/\/sites\/([^/]+)\/(tokens|agents-md)$/.exec(uri);
  if (m) {
    const siteId = await ctx.siteId(m[1]);
    const doc = await ctx.doc(siteId);
    if (m[2] === "tokens") {
      const compiled = compileStyles(doc.styles);
      return json(uri, {
        choices: doc.styles.choices,
        overrides: doc.styles.overrides ?? null,
        tokens: compiled.tokens,
        contrast: compiled.contrast,
      });
    }
    const text =
      (await ctx.store.agentsMd?.(siteId)) ??
      generateAgentsMd({ registry: ctx.registry, siteTitle: doc.site.title });
    return { uri, mimeType: "text/markdown", text };
  }
  throw new ToolError(`Unknown resource ${uri}. Call resources/list.`, "not_found");
}
