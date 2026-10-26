import type { BlockId, PageId, Styles } from "@openspace/schema";
import { basicTemplate } from "../templates/basic";

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
export interface TemplateSlots {
  title?: { page: PageId; block: BlockId };
  tagline?: { page: PageId; block: BlockId };
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
