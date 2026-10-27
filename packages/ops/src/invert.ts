import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { apply } from "./apply";
import {
  containerPath,
  copyRows,
  findBlock,
  findSection,
  getPage,
  locateBlock,
  OpError,
  sectionsOf,
} from "./doc";
import type { ContainerId, Op, OpMeta } from "./ops";
import { clone, invertPatch } from "./paths";

/** Drop `undefined` properties so inverse ops are clean JSON. */
function compact<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

function need<T>(value: T | undefined, message: string, path: (string | number)[]): T {
  if (value === undefined) throw new OpError(message, path);
  return value;
}

function blockLoc(doc: SiteDocument, page: ContainerId, block: string) {
  need(sectionsOf(doc, page), `Page ${page} does not exist`, containerPath(page));
  return need(findBlock(doc, page, block), `Block ${block} does not exist`, containerPath(page));
}

function sectionLoc(doc: SiteDocument, page: ContainerId, section: string) {
  need(sectionsOf(doc, page), `Page ${page} does not exist`, containerPath(page));
  return need(
    findSection(doc, page, section),
    `Section ${section} does not exist`,
    containerPath(page),
  );
}

/**
 * The op that undoes `op`. Computed from the document *before* `op` is applied, so
 * `apply(apply(doc, op), invert(doc, op))` equals `doc`. The inverse carries `meta` (default:
 * the original's actor/ts and id `"<id>:undo"`). Throws `OpError` if `op` does not apply to `doc`.
 */
export function invert(doc: SiteDocument, op: Op, meta?: OpMeta): Op {
  const m: OpMeta = meta ?? { id: `${op.id}:undo`, actor: op.actor, ts: op.ts };
  const body = invertBody(doc, op);
  return { ...body, id: m.id, actor: m.actor, ts: m.ts } as Op;
}

type Body = Record<string, unknown> & { op: Op["op"] };

function invertBody(doc: SiteDocument, op: Op): Body {
  switch (op.op) {
    case "block.update": {
      const { block } = blockLoc(doc, op.page, op.block);
      const set: Record<string, unknown> = {};
      const unset: string[] = [];
      const keys = new Set([...(op.unset ?? []), ...Object.keys(op.set ?? {})]);
      for (const k of keys) {
        if (Object.hasOwn(block.fields, k) && block.fields[k] !== undefined)
          set[k] = clone(block.fields[k]);
        else if (op.set && Object.hasOwn(op.set, k)) unset.push(k);
      }
      return compact({
        op: "block.update",
        page: op.page,
        block: op.block,
        set: Object.keys(set).length ? set : undefined,
        unset: unset.length ? unset : undefined,
        variant: op.variant !== undefined ? (block.variant ?? null) : undefined,
        style: op.style !== undefined ? (block.style ? clone(block.style) : null) : undefined,
        column: op.column !== undefined ? (block.column ?? null) : undefined,
        label: op.label !== undefined ? (block.label ?? null) : undefined,
        hidden: op.hidden !== undefined ? (block.hidden ?? null) : undefined,
      });
    }
    case "block.insert": {
      const { section } = sectionLoc(doc, op.page, op.section);
      return compact({
        op: "block.delete",
        page: op.page,
        block: op.block.id,
        rows: section.layout.mode === "grid" ? copyRows(section.layout.rows) : undefined,
      });
    }
    case "block.delete": {
      const loc = blockLoc(doc, op.page, op.block);
      const layout = loc.section.layout;
      const item = layout.mode === "grid" ? layout.items[op.block] : undefined;
      return compact({
        op: "block.insert",
        page: op.page,
        section: loc.section.id,
        at: loc.index,
        block: clone(loc.block),
        place: item ? clone(item) : undefined,
        rows: layout.mode === "grid" ? copyRows(layout.rows) : undefined,
      });
    }
    case "block.move": {
      const from = blockLoc(doc, op.page, op.block);
      const dest = sectionLoc(doc, op.page, op.to.section).section;
      const src = from.section;
      const same = src.id === dest.id;
      const srcItem = src.layout.mode === "grid" ? src.layout.items[op.block] : undefined;
      return compact({
        op: "block.move",
        page: op.page,
        block: op.block,
        to: compact({
          section: src.id,
          at: from.index,
          place: srcItem ? clone(srcItem) : undefined,
          column: from.block.column ?? null,
          rows: src.layout.mode === "grid" ? copyRows(src.layout.rows) : undefined,
        }),
        fromRows: !same && dest.layout.mode === "grid" ? copyRows(dest.layout.rows) : undefined,
      });
    }
    case "grid.place": {
      const { section } = sectionLoc(doc, op.page, op.section);
      if (section.layout.mode !== "grid")
        throw new OpError(`Section ${op.section} is not a grid section`, containerPath(op.page));
      const item = section.layout.items[op.block];
      const prev = item?.[op.bp];
      return {
        op: "grid.place",
        page: op.page,
        section: op.section,
        block: op.block,
        bp: op.bp,
        rect: prev ? clone(prev) : null,
        rows: copyRows(section.layout.rows),
      };
    }
    case "section.insert":
      return { op: "section.delete", page: op.page, section: op.section.id };
    case "section.delete": {
      const loc = sectionLoc(doc, op.page, op.section);
      return { op: "section.insert", page: op.page, at: loc.index, section: clone(loc.section) };
    }
    case "section.move": {
      const loc = sectionLoc(doc, op.page, op.section);
      return { op: "section.move", page: op.page, section: op.section, at: loc.index };
    }
    case "section.update": {
      const loc = sectionLoc(doc, op.page, op.section);
      return {
        op: "section.update",
        page: op.page,
        section: op.section,
        ...invertPatch(loc.section, op),
      };
    }
    case "styles.patch":
      return { op: "styles.patch", patch: invertPatch(doc.styles, op.patch) };
    case "page.create":
      return compact({
        op: "page.delete",
        page: op.page.id,
        nav: op.nav ? clone(doc.site.nav) : undefined,
      });
    case "page.delete": {
      const page = need(getPage(doc, op.page), `Page ${op.page} does not exist`, [
        "pages",
        op.page,
      ]);
      return compact({
        op: "page.create",
        page: clone(page),
        nav: op.nav ? clone(doc.site.nav) : undefined,
      });
    }
    case "page.update": {
      const page = need(getPage(doc, op.page), `Page ${op.page} does not exist`, [
        "pages",
        op.page,
      ]);
      return { op: "page.update", page: op.page, ...invertPatch(page, op) };
    }
    case "nav.update":
      return { op: "nav.update", tree: clone(doc.site.nav) };
    case "site.update":
      return { op: "site.update", ...invertPatch(doc.site, op) };
    case "media.add": {
      const prev = Object.hasOwn(doc.media, op.path) ? doc.media[op.path] : undefined;
      return prev
        ? { op: "media.add", path: op.path, meta: clone(prev) }
        : { op: "media.remove", path: op.path };
    }
    case "media.remove": {
      const prev = need(
        Object.hasOwn(doc.media, op.path) ? doc.media[op.path] : undefined,
        `Media ${op.path} does not exist`,
        ["media", op.path],
      );
      return { op: "media.add", path: op.path, meta: clone(prev) };
    }
    case "collection.upsert": {
      const items = Object.hasOwn(doc.collections, op.collection)
        ? doc.collections[op.collection]
        : undefined;
      const prev = items && Object.hasOwn(items, op.item.slug) ? items[op.item.slug] : undefined;
      return prev
        ? { op: "collection.upsert", collection: op.collection, item: clone(prev) }
        : compact({
            op: "collection.delete",
            collection: op.collection,
            slug: op.item.slug,
            keepEmpty: items ? true : undefined,
          });
    }
    case "collection.delete": {
      const items = Object.hasOwn(doc.collections, op.collection)
        ? doc.collections[op.collection]
        : undefined;
      const prev = need(
        items && Object.hasOwn(items, op.slug) ? items[op.slug] : undefined,
        `Item ${op.collection}/${op.slug} does not exist`,
        ["collections", op.collection, op.slug],
      );
      return { op: "collection.upsert", collection: op.collection, item: clone(prev) };
    }
    case "collectionConfig.upsert": {
      const configs = doc.collectionConfigs;
      const prev =
        configs && Object.hasOwn(configs, op.collection) ? configs[op.collection] : undefined;
      if (op.config === null) {
        const p = need(prev, `Collection ${op.collection} has no settings`, [
          "collectionConfigs",
          op.collection,
        ]);
        return { op: "collectionConfig.upsert", collection: op.collection, config: clone(p) };
      }
      return prev
        ? { op: "collectionConfig.upsert", collection: op.collection, config: clone(prev) }
        : compact({
            op: "collectionConfig.upsert",
            collection: op.collection,
            config: null,
            keepEmpty: configs ? true : undefined,
          });
    }
    case "component.upsert": {
      const components = doc.components;
      const name = op.component.name;
      const prev = components && Object.hasOwn(components, name) ? components[name] : undefined;
      const instances: Record<string, { v: number; fields: Record<string, unknown> }> = {};
      for (const id of Object.keys(op.instances ?? {})) {
        const loc = need(locateBlock(doc, id), `Block ${id} does not exist`, ["instances", id]);
        instances[id] = { v: loc.block.v, fields: clone(loc.block.fields) };
      }
      const restore = Object.keys(instances).length ? { instances } : {};
      return prev
        ? { op: "component.upsert", component: clone(prev), ...restore }
        : compact({ op: "component.delete", name, keepEmpty: components ? true : undefined });
    }
    case "component.delete": {
      const components = doc.components;
      const prev = need(
        components && Object.hasOwn(components, op.name) ? components[op.name] : undefined,
        `Component ${op.name} does not exist`,
        ["components", op.name],
      );
      return { op: "component.upsert", component: clone(prev) };
    }
    default: {
      const never: never = op;
      throw new OpError(`Unknown op ${(never as { op: string }).op}`, ["op"]);
    }
  }
}

/** Inverses for a sequence (each computed against the document state it applies to), reversed. */
export function invertAll(doc: SiteDocument, ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  let cur = doc;
  for (const op of ops) {
    out.push(invert(cur, op));
    cur = apply(cur, op);
  }
  return out.reverse();
}
