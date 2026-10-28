import type { OpBody } from "@omniharmonic/openspace-ops";
import {
  type NavItem,
  type Page,
  pageFragments,
  type Section,
  type SiteDocument,
  SlugSchema,
  suggestAnchorSection,
} from "@omniharmonic/openspace-schema";

/**
 * Menu entries that scroll to a section of a page (`{type:"page", page, anchor}` — a one-page
 * site's "How it works", "Prices"). The section answers to its link name (`section.anchor`);
 * choosing a section without one gives it one in the same change, so the entry (and any other
 * link to that name) works at once.
 */

export type SectionEntry = Extract<NavItem, { type: "page" }> & { anchor: string };

export const isSectionEntry = (item: NavItem): item is SectionEntry =>
  item.type === "page" && Boolean(item.anchor);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** A section's name for people: its Layers label, else its first heading, else its place. */
export function sectionTitle(page: Page, section: Section): string {
  if (section.label) return section.label;
  for (const b of section.blocks) {
    const t = (b.fields as { text?: unknown }).text;
    if (typeof t === "string" && t.trim()) return t.trim().slice(0, 60);
  }
  return `Section ${page.sections.indexOf(section) + 1}`;
}

/** Where a section entry goes: the section it scrolls to, or undefined when none answers. */
export function entryTarget(doc: SiteDocument, item: SectionEntry): Section | undefined {
  const page = doc.pages[item.page];
  if (!page || !pageFragments(doc, page.id).has(item.anchor)) return undefined;
  return page.sections.find((s) => (s.anchor ?? s.id) === item.anchor);
}

/** The section a (possibly unconnected) entry most likely means, to preselect in the dialog. */
export function entrySection(doc: SiteDocument, item: SectionEntry): Section | undefined {
  return entryTarget(doc, item) ?? suggestAnchorSection(doc, item.page, item.anchor);
}

/**
 * The menu entry for "label → this section of this page", and the op naming the section when
 * it has no link name yet: the entry's previous name when free (other links to it start working
 * too), else one made from the label or the section's name.
 */
export function sectionEntry(
  doc: SiteDocument,
  input: { label: string; page: string; section: string; previous?: string; hidden?: boolean },
): { item: SectionEntry; bodies: OpBody[] } | undefined {
  const page = doc.pages[input.page as Page["id"]];
  const section = page?.sections.find((s) => s.id === input.section);
  if (!page || !section) return undefined;
  const base = {
    type: "page" as const,
    page: page.id,
    label: input.label,
    ...(input.hidden ? { hidden: true } : {}),
  };
  if (section.anchor) return { item: { ...base, anchor: section.anchor }, bodies: [] };
  const taken = new Set(page.sections.map((s) => s.anchor).filter(Boolean));
  const free = (a: string | undefined): a is string =>
    !!a && SlugSchema.safeParse(a).success && !taken.has(a as never);
  const stem = slugify(input.label) || slugify(sectionTitle(page, section)) || "section";
  let anchor = [input.previous, stem].find(free);
  for (let n = 2; !anchor; n++) if (free(`${stem}-${n}`)) anchor = `${stem}-${n}`;
  return {
    item: { ...base, anchor },
    bodies: [{ op: "section.update", page: page.id, section: section.id, set: { anchor } }],
  };
}
