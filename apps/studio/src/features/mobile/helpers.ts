import { blockText } from "@omniharmonic/openspace-lint";
import type { Section, SiteDocument } from "@omniharmonic/openspace-schema";

/** Pages in navigation order (folders flattened), then pages not in the navigation. */
export function pagesInOrder(
  doc: SiteDocument,
): SiteDocument["pages"][keyof SiteDocument["pages"]][] {
  const ids: string[] = [];
  for (const item of doc.site.nav) {
    if (item.type === "page") ids.push(item.page);
    if (item.type === "folder") {
      if (item.page) ids.push(item.page);
      for (const child of item.items) if (child.type === "page") ids.push(child.page);
    }
  }
  const all = Object.values(doc.pages);
  const home = all.find((p) => p.slug === "");
  const ordered = [...(home ? [home.id as string] : []), ...ids, ...all.map((p) => p.id as string)];
  const seen = new Set<string>();
  const out = [];
  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const p = doc.pages[id as keyof SiteDocument["pages"]];
    if (p) out.push(p);
  }
  return out;
}

/** The words a section starts with (its first heading or text), for the section list. */
export function sectionSummary(section: Section): string {
  for (const b of section.blocks) {
    const text = blockText(b).replace(/\s+/g, " ").trim();
    if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  }
  return section.blocks.length ? `${section.blocks.length} blocks` : "Empty section";
}
