import {
  type ComponentDefinition,
  checkComponent,
  componentSection,
  type Section,
} from "@omniharmonic/openspace-schema";
import { bentoGrid } from "./bento-grid";
import { editorialHero } from "./editorial-hero";
import { layeredCollage } from "./layered-collage";
import { scrollStory } from "./scroll-story";
import { testimonialMarquee } from "./testimonial-marquee";

/**
 * The opt-in "Designer components" library (ADR custom-components §5): high-end custom components
 * a site can adopt. Adding one copies its definition into the site (`component.upsert`), so the
 * site owns it from then on and a designer (or Claude) can adapt its code.
 */
export const designerComponents: readonly ComponentDefinition[] = [
  editorialHero,
  layeredCollage,
  scrollStory,
  bentoGrid,
  testimonialMarquee,
];

export { bentoGrid, editorialHero, layeredCollage, scrollStory, testimonialMarquee };

/** A library component by name (a fresh copy). */
export function designerComponent(name: string): ComponentDefinition | undefined {
  const def = designerComponents.find((d) => d.name === name);
  return def ? structuredClone(def) : undefined;
}

/** JSON-serializable gallery/MCP metadata for the library. */
export interface DesignerComponentMeta {
  name: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
  fields: string[];
  hasScript: boolean;
  ai?: ComponentDefinition["ai"];
}

export function designerComponentCatalog(): DesignerComponentMeta[] {
  return designerComponents.map((d) => ({
    name: d.name,
    label: d.label,
    description: d.description ?? "",
    category: d.category ?? "other",
    tags: [...(d.tags ?? [])],
    fields: Object.keys(d.fields),
    hasScript: Boolean(d.js?.trim()),
    ...(d.ai ? { ai: d.ai } : {}),
  }));
}

/** A new section for a component (site or library), with fresh ids. */
export function designerSection(
  def: ComponentDefinition,
  opts: Parameters<typeof componentSection>[1] = {},
): Section {
  if (!checkComponent(def).ok) throw new Error(`The ${def.label} component has problems`);
  return componentSection(def, opts);
}
