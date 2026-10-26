import type { BlockId, PageId, Styles } from "@openspace/schema";
import { templateSource as registry } from "@openspace/templates";
import { basicTemplate } from "../templates/basic";
import { STARTER_SITE_FILES } from "../templates/starter-files";

/**
 * Template registry seam. The Hub copies a template's files into a new site repo, so a
 * template is just files + gallery metadata. Task 9 plugs the real registry (`templates/*`)
 * in by implementing `TemplateSource`; until then `BuiltinTemplateSource` serves the
 * built-in "Basic" fixture.
 */

export interface TemplateLook {
  id: string;
  name: string;
  /** The complete `content/styles.json` for this look. */
  styles: Styles;
}

/** Blocks the Hub personalizes on creation (rich-text blocks whose text becomes name/tagline). */
export interface TemplateSlot {
  page: PageId;
  block: BlockId;
  /** Field holding the text: a rich-text `content` (default) or a plain string (`text`). */
  field?: string;
  /** Replace only this phrase (the demo owner's name inside a longer headline). */
  replace?: string;
}

export interface TemplateSlots {
  title?: TemplateSlot;
  tagline?: TemplateSlot;
}

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  persona: string;
  mood: string;
  version: string;
  looks: TemplateLook[];
  thumbnailUrl: string | null;
  /** Demo owner the template's sample content is written for (gallery placeholder values). */
  sample?: { name: string; tagline: string };
  slots?: TemplateSlots;
}

export interface LoadedTemplate {
  meta: TemplateMeta;
  /** Repo files keyed by path (text). */
  files: Record<string, string>;
}

export interface TemplateSource {
  list(): Promise<TemplateMeta[]>;
  load(id: string): Promise<LoadedTemplate | null>;
}

export type BuiltinTemplate = LoadedTemplate;

export class BuiltinTemplateSource implements TemplateSource {
  private readonly byId: Map<string, LoadedTemplate>;

  constructor(templates: LoadedTemplate[] = [basicTemplate]) {
    this.byId = new Map(templates.map((t) => [t.meta.id, t]));
  }

  async list(): Promise<TemplateMeta[]> {
    return [...this.byId.values()].map((t) => t.meta);
  }

  async load(id: string): Promise<LoadedTemplate | null> {
    const t = this.byId.get(id);
    return t ? { meta: t.meta, files: { ...t.files } } : null;
  }
}

const norm = (t: string) =>
  t
    .trim()
    .replace(/[.!…]+$/, "")
    .toLowerCase();

/**
 * Personalization slots for a registry template (which declares none): the home page headings
 * (first two sections) that carry the template's own demo owner — the heading that *is* the
 * sample tagline becomes the tagline slot; the heading that is, or names, the sample owner
 * becomes the title slot (only that phrase is replaced inside a longer headline). Headings that
 * don't carry the sample are left alone.
 */
export function derivedSlots(
  files: Record<string, string>,
  sample: TemplateMeta["sample"],
): TemplateSlots | undefined {
  if (!sample) return undefined;
  let home: {
    id: PageId;
    sections: Array<{
      blocks: Array<{ id: BlockId; type: string; fields: Record<string, unknown> }>;
    }>;
  };
  try {
    home = JSON.parse(files["content/pages/home.json"] ?? "null");
  } catch {
    return undefined;
  }
  if (!home?.sections) return undefined;
  const slots: TemplateSlots = {};
  for (const section of home.sections.slice(0, 2))
    for (const b of section.blocks) {
      const text = b.type === "heading" ? b.fields.text : undefined;
      if (typeof text !== "string") continue;
      if (!slots.tagline && norm(text) === norm(sample.tagline))
        slots.tagline = { page: home.id, block: b.id, field: "text" };
      else if (!slots.title && text.trim() === sample.name)
        slots.title = { page: home.id, block: b.id, field: "text" };
      else if (!slots.title && text.includes(sample.name))
        slots.title = { page: home.id, block: b.id, field: "text", replace: sample.name };
    }
  return slots.title || slots.tagline ? slots : undefined;
}

/** First https image in a template's files (its home page first): the gallery thumbnail. */
function firstImage(files: Record<string, string>): string | null {
  const ordered = [
    files["content/pages/home.json"] ?? "",
    ...Object.entries(files)
      .filter(([p]) => p.startsWith("content/pages/"))
      .map(([, c]) => c),
  ];
  for (const text of ordered) {
    const m = /"src":\s*"(https:\/\/[^"]+)"/.exec(text);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * The launch templates (`@openspace/templates`, Task 9) as the Hub's source: gallery metadata
 * with three looks and the demo owner, and the template's content plus the starter shell
 * (publish workflow, Astro config, AGENTS.md…) as the new site's files. `fixtures` (the "basic"
 * test template) can be loaded but aren't listed in the gallery.
 */
export class RegistryTemplateSource implements TemplateSource {
  private readonly fixtures: Map<string, LoadedTemplate>;
  private thumbs = new Map<string, string | null>();

  constructor(fixtures: LoadedTemplate[] = []) {
    this.fixtures = new Map(fixtures.map((t) => [t.meta.id, t]));
  }

  private withThumb(meta: TemplateMeta, files: Record<string, string>): TemplateMeta {
    if (!this.thumbs.has(meta.id)) this.thumbs.set(meta.id, firstImage(files));
    const slots = meta.slots ?? derivedSlots(files, meta.sample);
    return {
      ...meta,
      thumbnailUrl: meta.thumbnailUrl ?? this.thumbs.get(meta.id) ?? null,
      ...(slots ? { slots } : {}),
    };
  }

  async list(): Promise<TemplateMeta[]> {
    const metas = (await registry.list()) as TemplateMeta[];
    const out: TemplateMeta[] = [];
    for (const meta of metas) {
      if (!this.thumbs.has(meta.id)) {
        const t = await registry.load(meta.id);
        this.thumbs.set(meta.id, t ? firstImage(t.files) : null);
      }
      out.push({ ...meta, thumbnailUrl: meta.thumbnailUrl ?? this.thumbs.get(meta.id) ?? null });
    }
    return out;
  }

  async load(id: string): Promise<LoadedTemplate | null> {
    const fixture = this.fixtures.get(id);
    if (fixture) return { meta: fixture.meta, files: { ...fixture.files } };
    const t = await registry.load(id);
    if (!t) return null;
    return {
      meta: this.withThumb(t.meta as TemplateMeta, t.files),
      files: { ...STARTER_SITE_FILES, ...t.files },
    };
  }
}
