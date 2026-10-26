import type { Block, NavItem, Page, Section, SiteDocument } from "@openspace/schema";
import { apply } from "./apply";
import { findSection, getPage, locateBlock, locateSection } from "./doc";
import { type ContainerId, FOOTER, type Op, type OpBody, type OpMeta } from "./ops";
import { clone, deepEqual, diffObjects, isEmptyPatch, type Obj } from "./paths";

export interface DiffOptions {
  actor?: string;
  ts?: number;
  /** Op ids are `<idPrefix><n>`. */
  idPrefix?: string;
}

/** Navigation with every reference to `pageId` removed (folders keep their other items). */
export function pruneNav(nav: readonly NavItem[], pageId: string): NavItem[] {
  const out: NavItem[] = [];
  for (const item of nav) {
    if (item.type === "page" && item.page === pageId) continue;
    if (item.type === "button" && item.link.type === "page" && item.link.page === pageId) continue;
    if (item.type === "folder") {
      const folder = clone(item);
      if (folder.page === pageId) delete folder.page;
      folder.items = folder.items.filter((leaf) => !(leaf.type === "page" && leaf.page === pageId));
      out.push(folder);
      continue;
    }
    out.push(clone(item));
  }
  return out;
}

function navRefersTo(nav: readonly NavItem[], pageId: string): boolean {
  return !deepEqual(pruneNav(nav, pageId), nav);
}

/**
 * Ops that turn `before` into `after` (`applyAll(before, diff(before, after))` equals `after`,
 * except `config`, which ops do not edit). Used by the CLI/local MCP to turn file edits into ops
 * and by the update bot. Ids are matched, so moved blocks/sections become moves, not
 * delete + insert (cross-page moves are delete + insert).
 *
 * Each op is applied to a working copy as it is emitted, so later ops see earlier ones. For
 * ordinary edits every op is individually valid; contrived reshuffles (e.g. swapping two pages'
 * slugs) may pass through an intermediate state that `validate` would reject.
 */
export function diff(before: SiteDocument, after: SiteDocument, options: DiffOptions = {}): Op[] {
  const actor = options.actor ?? "system";
  const ts = options.ts ?? 0;
  const prefix = options.idPrefix ?? "diff-";
  const ops: Op[] = [];
  let work = before;
  const emit = (body: OpBody) => {
    const meta: OpMeta = { id: `${prefix}${ops.length + 1}`, actor, ts };
    const op = { ...body, ...meta } as Op;
    ops.push(op);
    work = apply(work, op);
  };

  // Where every section/block lives in `after`.
  const afterSections = new Map<string, ContainerId>();
  const afterBlocks = new Set<string>();
  const noteSection = (container: ContainerId, s: Section) => {
    afterSections.set(s.id, container);
    for (const b of s.blocks) afterBlocks.add(b.id);
  };
  noteSection(FOOTER, after.site.footer);
  for (const page of Object.values(after.pages))
    for (const s of page.sections) noteSection(page.id, s);

  // 1. Styles.
  const styles = diffObjects(before.styles as unknown as Obj, after.styles as unknown as Obj);
  if (!isEmptyPatch(styles)) emit({ op: "styles.patch", patch: compactPatch(styles) });

  // 2. Deleted pages (dropping them from navigation in the same step).
  for (const id of Object.keys(before.pages)) {
    if (Object.hasOwn(after.pages, id)) continue;
    const nav = work.site.nav;
    emit(
      navRefersTo(nav, id)
        ? { op: "page.delete", page: id as Page["id"], nav: pruneNav(nav, id) }
        : { op: "page.delete", page: id as Page["id"] },
    );
  }

  // 3. Content that no longer exists anywhere.
  for (const page of Object.values(work.pages))
    for (const s of [...page.sections])
      if (!afterSections.has(s.id)) emit({ op: "section.delete", page: page.id, section: s.id });
  const removeBlock = (id: string) => {
    const loc = locateBlock(work, id);
    if (loc) emit({ op: "block.delete", page: loc.container, block: id as Block["id"] });
  };
  const allBlocks = (doc: SiteDocument) => {
    const ids: string[] = doc.site.footer.blocks.map((b) => b.id);
    for (const p of Object.values(doc.pages))
      for (const s of p.sections) for (const b of s.blocks) ids.push(b.id);
    return ids;
  };
  for (const id of allBlocks(work)) if (!afterBlocks.has(id)) removeBlock(id);

  // 4. New pages: whole when none of their content exists yet, otherwise empty then filled.
  for (const page of Object.values(after.pages)) {
    if (getPage(work, page.id)) continue;
    const reuses = page.sections.some(
      (s) => locateSection(work, s.id) || s.blocks.some((b) => locateBlock(work, b.id)),
    );
    emit({ op: "page.create", page: reuses ? { ...clone(page), sections: [] } : clone(page) });
  }

  // 5. Structure: sections in order per page, blocks in order per section.
  const insertWhole = (page: Page["id"], at: number, section: Section) => {
    for (const b of section.blocks) removeBlock(b.id);
    emit({ op: "section.insert", page, at, section: clone(section) });
  };
  const needsReplace = (w: Section, s: Section) =>
    w.layout.mode !== s.layout.mode ||
    (w.layout.mode === "stack" &&
      s.layout.mode === "stack" &&
      w.layout.columns.d.length !== s.layout.columns.d.length);

  const syncBlocks = (container: ContainerId, target: Section) => {
    target.blocks.forEach((ab, i) => {
      const cur = liveSection(work, container, target.id);
      const grid = target.layout.mode === "grid" ? target.layout : undefined;
      if (cur.blocks[i]?.id !== ab.id) {
        const loc = locateBlock(work, ab.id);
        if (loc && loc.container === container) {
          const to: Extract<OpBody, { op: "block.move" }>["to"] = { section: target.id, at: i };
          const item = grid?.items[ab.id];
          if (item) to.place = clone(item);
          if (!grid) to.column = ab.column ?? null;
          emit({ op: "block.move", page: container, block: ab.id, to });
        } else {
          if (loc) removeBlock(ab.id);
          const item = grid?.items[ab.id];
          emit({
            op: "block.insert",
            page: container,
            section: target.id,
            at: i,
            block: clone(ab),
            ...(item ? { place: clone(item) } : {}),
          });
        }
      }
      // Content of the block.
      const wb = liveSection(work, container, target.id).blocks[i] as Block;
      const set: Record<string, unknown> = {};
      const unset: string[] = [];
      for (const k of Object.keys(wb.fields))
        if (!Object.hasOwn(ab.fields, k) || ab.fields[k] === undefined) unset.push(k);
      for (const [k, v] of Object.entries(ab.fields))
        if (v !== undefined && !deepEqual(wb.fields[k], v)) set[k] = clone(v);
      const upd: Extract<OpBody, { op: "block.update" }> = {
        op: "block.update",
        page: container,
        block: ab.id,
      };
      if (Object.keys(set).length) upd.set = set;
      if (unset.length) upd.unset = unset;
      if (!deepEqual(wb.variant, ab.variant)) upd.variant = ab.variant ?? null;
      if (!deepEqual(wb.style, ab.style)) upd.style = ab.style ? clone(ab.style) : null;
      if (!deepEqual(wb.column, ab.column)) upd.column = ab.column ?? null;
      if (Object.keys(upd).length > 3) emit(upd);
      // Grid placement.
      if (grid) {
        const wl = liveSection(work, container, target.id).layout;
        const witem = wl.mode === "grid" ? wl.items[ab.id] : undefined;
        const sitem = grid.items[ab.id];
        if (sitem)
          for (const bp of ["d", "t", "m"] as const) {
            if (deepEqual(witem?.[bp], sitem[bp])) continue;
            const rect = sitem[bp];
            emit({
              op: "grid.place",
              page: container,
              section: target.id,
              block: ab.id,
              bp,
              rect: rect ? clone(rect) : null,
            });
          }
      }
    });
  };

  // Footer.
  {
    const target = after.site.footer;
    const w = work.site.footer;
    if (w.id !== target.id || needsReplace(w, target)) {
      for (const b of target.blocks) if (!w.blocks.some((x) => x.id === b.id)) removeBlock(b.id);
      emit({ op: "site.update", set: { footer: clone(target) } });
    } else syncBlocks(FOOTER, target);
  }

  for (const page of Object.values(after.pages)) {
    page.sections.forEach((target, j) => {
      const cur = (getPage(work, page.id) as Page).sections;
      if (cur[j]?.id !== target.id) {
        const loc = locateSection(work, target.id);
        if (loc && loc.container === page.id) {
          emit({ op: "section.move", page: page.id, section: target.id, at: j });
        } else {
          if (loc && loc.container !== FOOTER)
            emit({ op: "section.delete", page: loc.container, section: target.id });
          insertWhole(page.id, j, target);
          return;
        }
      }
      const w = (getPage(work, page.id) as Page).sections[j] as Section;
      if (needsReplace(w, target)) {
        emit({ op: "section.delete", page: page.id, section: target.id });
        insertWhole(page.id, j, target);
        return;
      }
      syncBlocks(page.id, target);
    });
  }

  // 6. Section settings (layout rows/columns, style, label…) once membership is final.
  const syncSection = (container: ContainerId, target: Section) => {
    const w = findSection(work, container, target.id)?.section;
    if (!w) return;
    const patch = diffObjects(w as unknown as Obj, target as unknown as Obj, ["id", "blocks"]);
    if (!isEmptyPatch(patch))
      emit({ op: "section.update", page: container, section: target.id, ...compactPatch(patch) });
  };
  syncSection(FOOTER, after.site.footer);
  for (const page of Object.values(after.pages))
    for (const s of page.sections) syncSection(page.id, s);

  // 7. Page settings.
  for (const page of Object.values(after.pages)) {
    const w = getPage(work, page.id) as Page;
    const patch = diffObjects(w as unknown as Obj, page as unknown as Obj, ["id", "sections"]);
    if (!isEmptyPatch(patch)) emit({ op: "page.update", page: page.id, ...compactPatch(patch) });
  }

  // 8. Site settings and navigation.
  const site = diffObjects(work.site as unknown as Obj, after.site as unknown as Obj, [
    "nav",
    "footer",
  ]);
  if (!isEmptyPatch(site)) emit({ op: "site.update", ...compactPatch(site) });
  if (!deepEqual(work.site.nav, after.site.nav))
    emit({ op: "nav.update", tree: clone(after.site.nav) });

  // 9. Media.
  for (const path of Object.keys(work.media))
    if (!Object.hasOwn(after.media, path)) emit({ op: "media.remove", path });
  for (const [path, meta] of Object.entries(after.media))
    if (!deepEqual(work.media[path], meta)) emit({ op: "media.add", path, meta: clone(meta) });

  // 10. Collections.
  for (const [name, items] of Object.entries(work.collections)) {
    const keep = after.collections[name];
    const gone = Object.keys(items).filter((slug) => !keep || !Object.hasOwn(keep, slug));
    for (const slug of gone)
      emit({
        op: "collection.delete",
        collection: name,
        slug,
        ...(keep ? { keepEmpty: true } : {}),
      });
  }
  for (const [name, items] of Object.entries(after.collections))
    for (const [slug, item] of Object.entries(items))
      if (!deepEqual(work.collections[name]?.[slug], item))
        emit({ op: "collection.upsert", collection: name, item: clone(item) });

  // 11. Collection settings.
  const wc = work.collectionConfigs ?? {};
  const ac = after.collectionConfigs;
  const goneConfigs = Object.keys(wc).filter((n) => !ac || !Object.hasOwn(ac, n));
  for (const name of goneConfigs)
    emit({
      op: "collectionConfig.upsert",
      collection: name,
      config: null,
      ...(ac ? { keepEmpty: true } : {}),
    });
  for (const [name, config] of Object.entries(ac ?? {}))
    if (!deepEqual(wc[name], config))
      emit({ op: "collectionConfig.upsert", collection: name, config: clone(config) });

  return ops;
}

function compactPatch(patch: { set: Obj; unset: string[] }): { set?: Obj; unset?: string[] } {
  const out: { set?: Obj; unset?: string[] } = {};
  if (Object.keys(patch.set).length) out.set = patch.set;
  if (patch.unset.length) out.unset = patch.unset;
  return out;
}

function liveSection(doc: SiteDocument, container: ContainerId, id: string): Section {
  const loc = findSection(doc, container, id);
  if (!loc) throw new Error(`diff: section ${id} vanished from ${container}`);
  return loc.section;
}
