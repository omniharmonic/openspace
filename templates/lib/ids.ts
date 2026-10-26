import type { PageId, Section, SiteDocument } from "@openspace/schema";
import { stableId } from "@openspace/site-kit/ids";

/**
 * Deterministic ids for template content. Section presets mint fresh random ids on every
 * `build()`; {@link stabilizeIds} replaces them with ids seeded from where each thing lives —
 * page slug, the section's preset (or label) and its occurrence on the page, the block's type and
 * occurrence in the section — so the generated files are byte-stable between runs, and inserting
 * a section elsewhere on a page doesn't renumber the rest.
 */

export { stableId };

/** A page id for a template page, seeded from its slug (`""` → `home`). */
export const pageId = (template: string, slug: string): PageId =>
  stableId("pg", `${template}:${slug || "home"}`) as PageId;

const ID_RE = /\b(?:sec|blk|frm)_[0-9a-hjkmnp-tv-z]{10}\b/g;

/** Replace every section, block and form id with one seeded from its path in the document. */
export function stabilizeIds(doc: SiteDocument, template: string): SiteDocument {
  const map = new Map<string, string>();
  const used = new Set<string>();
  const assign = (old: string, prefix: "sec" | "blk" | "frm", seed: string) => {
    const id = stableId(prefix, `${template}:${seed}`);
    if (used.has(id)) throw new Error(`stabilizeIds(${template}): duplicate seed ${seed}`);
    used.add(id);
    map.set(old, id);
  };
  const count = (m: Map<string, number>, key: string) => {
    const n = (m.get(key) ?? 0) + 1;
    m.set(key, n);
    return n;
  };
  const sections = (owner: string, list: readonly Section[]) => {
    const kinds = new Map<string, number>();
    for (const s of list) {
      const kind = s.preset ?? `custom:${s.label ?? "section"}`;
      const sSeed = `${owner}/${kind}#${count(kinds, kind)}`;
      assign(s.id, "sec", sSeed);
      const types = new Map<string, number>();
      for (const b of s.blocks) {
        const bSeed = `${sSeed}/${b.type}#${count(types, b.type)}`;
        assign(b.id, "blk", bSeed);
        const form = (b.fields as { form?: { id?: string } }).form;
        if (form?.id) assign(form.id, "frm", `${bSeed}/form`);
      }
    }
  };
  for (const p of Object.values(doc.pages)) sections(`page:${p.slug || "home"}`, p.sections);
  sections("footer", [doc.site.footer]);
  const json = JSON.stringify(doc).replace(ID_RE, (id) => {
    const next = map.get(id);
    if (!next) throw new Error(`stabilizeIds(${template}): id ${id} has no owner`);
    return next;
  });
  return JSON.parse(json) as SiteDocument;
}
