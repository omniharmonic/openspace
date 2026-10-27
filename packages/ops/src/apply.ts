import {
  type Block,
  componentType,
  type GridItem,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { produce } from "immer";
import {
  autoPlace,
  containerPath,
  copyRows,
  findBlock,
  findSection,
  getPage,
  locateBlock,
  OpError,
  raiseRows,
  resolvePosition,
  sectionsOf,
} from "./doc";
import { type ContainerId, FOOTER, type Op, type Patch } from "./ops";
import {
  applyPatch,
  checkPath,
  clone,
  isForbiddenKey,
  type Obj,
  overlappingPaths,
  patchPaths,
} from "./paths";

/** Top-level keys that path patches may not touch, per target. */
export const PROTECTED_PATHS = {
  page: ["id", "sections"],
  section: ["id", "blocks"],
  site: ["nav"],
  styles: [] as string[],
} as const;

function checkPatch(
  patch: Patch,
  protectedKeys: readonly string[],
  path: (string | number)[],
  what: string,
): void {
  const paths = patchPaths(patch);
  for (const p of paths) {
    const problem = checkPath(p);
    if (problem) throw new OpError(problem, path);
    const top = p.split(".")[0] as string;
    if (protectedKeys.includes(top)) {
      const hint =
        top === "nav"
          ? "use nav.update"
          : top === "sections" || top === "blocks"
            ? "use the section/block ops"
            : "ids never change";
      throw new OpError(`Cannot patch ${what} "${top}" directly (${hint})`, path);
    }
  }
  const overlaps = overlappingPaths(paths);
  if (overlaps.length > 0)
    throw new OpError(`Overlapping patch paths: ${overlaps.join(", ")}`, path);
}

function requireSections(doc: SiteDocument, container: ContainerId): Section[] {
  const sections = sectionsOf(doc, container);
  if (!sections) throw new OpError(`Page ${container} does not exist`, ["pages", container]);
  return sections;
}

function requireSection(doc: SiteDocument, container: ContainerId, id: string): Section {
  requireSections(doc, container);
  const loc = findSection(doc, container, id);
  if (!loc)
    throw new OpError(`Section ${id} is not on ${describe(container)}`, containerPath(container));
  return loc.section;
}

function describe(container: ContainerId): string {
  return container === FOOTER ? "the footer" : `page ${container}`;
}

function requirePage(doc: SiteDocument, id: string, op: string) {
  if (id === FOOTER) throw new OpError(`${op} is not allowed on the footer`, ["site", "footer"]);
  const page = getPage(doc, id);
  if (!page) throw new OpError(`Page ${id} does not exist`, ["pages", id]);
  return page;
}

/** Put a block into a section (grid placement/columns handled by the caller). */
function placeInGrid(section: Section, blockId: string, item: GridItem | undefined): void {
  if (section.layout.mode !== "grid") return;
  section.layout.items[blockId as Block["id"]] = item ? clone(item) : autoPlace(section.layout);
}

/**
 * Mutate `doc` (an Immer draft) by `op`. Throws `OpError` when a precondition fails.
 * Exposed for batching inside one `produce` call; most callers want `apply`.
 */
export function mutate(doc: SiteDocument, op: Op): void {
  switch (op.op) {
    case "block.update": {
      for (const k of [...(op.unset ?? []), ...Object.keys(op.set ?? {})])
        if (isForbiddenKey(k)) throw new OpError(`Forbidden field key "${k}"`, ["set", k]);
      requireSections(doc, op.page);
      const loc = findBlock(doc, op.page, op.block);
      if (!loc)
        throw new OpError(
          `Block ${op.block} is not on ${describe(op.page)}`,
          containerPath(op.page),
        );
      const b = loc.block;
      for (const k of op.unset ?? []) delete b.fields[k];
      for (const [k, v] of Object.entries(op.set ?? {})) b.fields[k] = clone(v);
      if (op.variant !== undefined) {
        if (op.variant === null) delete b.variant;
        else b.variant = op.variant;
      }
      if (op.style !== undefined) {
        if (op.style === null) delete b.style;
        else b.style = clone(op.style);
      }
      if (op.label !== undefined) {
        if (op.label === null) delete b.label;
        else b.label = op.label;
      }
      if (op.hidden !== undefined) {
        if (!op.hidden) delete b.hidden;
        else b.hidden = true;
      }
      if (op.column !== undefined) {
        if (op.column === null) delete b.column;
        else b.column = op.column;
      }
      return;
    }
    case "block.insert": {
      const section = requireSection(doc, op.page, op.section);
      const at = resolvePosition(
        section.blocks.map((b) => b.id),
        op.at,
        [...containerPath(op.page), "sections", op.section],
      );
      if (section.blocks.some((b) => b.id === op.block.id))
        throw new OpError(`Block ${op.block.id} already exists`, ["block", "id"]);
      section.blocks.splice(at, 0, clone(op.block));
      if (section.layout.mode === "grid") {
        placeInGrid(section, op.block.id, op.place);
        if (op.rows) section.layout.rows = copyRows(op.rows);
        else raiseRows(section.layout);
      }
      return;
    }
    case "block.move": {
      requireSections(doc, op.page);
      const from = findBlock(doc, op.page, op.block);
      if (!from)
        throw new OpError(
          `Block ${op.block} is not on ${describe(op.page)}`,
          containerPath(op.page),
        );
      const dest = requireSection(doc, op.page, op.to.section);
      const src = from.section;
      const same = src.id === dest.id;
      const [block] = src.blocks.splice(from.index, 1) as [Block];
      if (src.layout.mode === "grid" && !same) {
        delete src.layout.items[block.id];
        if (op.fromRows) src.layout.rows = copyRows(op.fromRows);
      }
      const at = resolvePosition(
        dest.blocks.map((b) => b.id),
        op.to.at,
        [...containerPath(op.page), "sections", dest.id],
      );
      dest.blocks.splice(at, 0, block);
      const moved = dest.blocks[at] as Block;
      if (dest.layout.mode === "grid") {
        // Within one grid section the placement is kept unless a new one is given.
        if (!same || op.to.place || !dest.layout.items[block.id])
          placeInGrid(dest, block.id, op.to.place);
        if (op.to.rows) dest.layout.rows = copyRows(op.to.rows);
        else raiseRows(dest.layout);
      }
      if (op.to.column !== undefined) {
        if (op.to.column === null) delete moved.column;
        else moved.column = op.to.column;
      } else if (dest.layout.mode === "stack" && moved.column !== undefined) {
        const cols = dest.layout.columns.d.length;
        if (moved.column >= cols) moved.column = cols - 1;
      }
      return;
    }
    case "block.delete": {
      requireSections(doc, op.page);
      const loc = findBlock(doc, op.page, op.block);
      if (!loc)
        throw new OpError(
          `Block ${op.block} is not on ${describe(op.page)}`,
          containerPath(op.page),
        );
      loc.section.blocks.splice(loc.index, 1);
      if (loc.section.layout.mode === "grid") {
        delete loc.section.layout.items[op.block];
        if (op.rows) loc.section.layout.rows = copyRows(op.rows);
      }
      return;
    }
    case "grid.place": {
      const section = requireSection(doc, op.page, op.section);
      const base = [...containerPath(op.page), "sections", op.section];
      if (section.layout.mode !== "grid")
        throw new OpError(`Section ${op.section} is not a grid section`, [
          ...base,
          "layout",
          "mode",
        ]);
      if (!section.blocks.some((b) => b.id === op.block))
        throw new OpError(`Block ${op.block} is not in section ${op.section}`, [...base, "blocks"]);
      const item = section.layout.items[op.block];
      if (op.rect === null) {
        if (op.bp === "d")
          throw new OpError("The desktop placement cannot be removed", [
            ...base,
            "layout",
            "items",
            op.block,
            "d",
          ]);
        if (item) delete item[op.bp];
      } else if (item) {
        item[op.bp] = clone(op.rect);
      } else {
        if (op.bp !== "d")
          throw new OpError(`Block ${op.block} needs a desktop placement first`, [
            ...base,
            "layout",
            "items",
            op.block,
          ]);
        section.layout.items[op.block] = { d: clone(op.rect) };
      }
      if (op.rows) section.layout.rows = copyRows(op.rows);
      else raiseRows(section.layout);
      return;
    }
    case "section.insert": {
      const page = requirePage(doc, op.page, "section.insert");
      const at = resolvePosition(
        page.sections.map((s) => s.id),
        op.at,
        ["pages", op.page],
      );
      if (page.sections.some((s) => s.id === op.section.id))
        throw new OpError(`Section ${op.section.id} already exists`, ["section", "id"]);
      page.sections.splice(at, 0, clone(op.section));
      return;
    }
    case "section.move": {
      const page = requirePage(doc, op.page, "section.move");
      const from = page.sections.findIndex((s) => s.id === op.section);
      if (from < 0)
        throw new OpError(`Section ${op.section} is not on page ${op.page}`, ["pages", op.page]);
      const [section] = page.sections.splice(from, 1) as [Section];
      const at = resolvePosition(
        page.sections.map((s) => s.id),
        op.at,
        ["pages", op.page],
      );
      page.sections.splice(at, 0, section);
      return;
    }
    case "section.delete": {
      const page = requirePage(doc, op.page, "section.delete");
      const from = page.sections.findIndex((s) => s.id === op.section);
      if (from < 0)
        throw new OpError(`Section ${op.section} is not on page ${op.page}`, ["pages", op.page]);
      page.sections.splice(from, 1);
      return;
    }
    case "section.update": {
      const section = requireSection(doc, op.page, op.section);
      checkPatch(
        op,
        PROTECTED_PATHS.section,
        [...containerPath(op.page), "sections", op.section],
        "section",
      );
      applyPatch(section as unknown as Obj, op);
      return;
    }
    case "styles.patch": {
      checkPatch(op.patch, PROTECTED_PATHS.styles, ["styles"], "styles");
      applyPatch(doc.styles as unknown as Obj, op.patch);
      return;
    }
    case "page.create": {
      if (getPage(doc, op.page.id))
        throw new OpError(`Page ${op.page.id} already exists`, ["pages", op.page.id]);
      doc.pages[op.page.id] = clone(op.page);
      if (op.nav) doc.site.nav = clone(op.nav);
      return;
    }
    case "page.update": {
      const page = requirePage(doc, op.page, "page.update");
      checkPatch(op, PROTECTED_PATHS.page, ["pages", op.page], "page");
      applyPatch(page as unknown as Obj, op);
      return;
    }
    case "page.delete": {
      requirePage(doc, op.page, "page.delete");
      delete doc.pages[op.page];
      if (op.nav) doc.site.nav = clone(op.nav);
      return;
    }
    case "nav.update": {
      doc.site.nav = clone(op.tree);
      return;
    }
    case "site.update": {
      checkPatch(op, PROTECTED_PATHS.site, ["site"], "site");
      applyPatch(doc.site as unknown as Obj, op);
      return;
    }
    case "media.add": {
      doc.media[op.path] = clone(op.meta);
      return;
    }
    case "media.remove": {
      if (!Object.hasOwn(doc.media, op.path))
        throw new OpError(`Media ${op.path} does not exist`, ["media", op.path]);
      delete doc.media[op.path];
      return;
    }
    case "collection.upsert": {
      const items = Object.hasOwn(doc.collections, op.collection)
        ? doc.collections[op.collection]
        : undefined;
      if (items) items[op.item.slug] = clone(op.item);
      else doc.collections[op.collection] = { [op.item.slug]: clone(op.item) };
      return;
    }
    case "collection.delete": {
      const items = Object.hasOwn(doc.collections, op.collection)
        ? doc.collections[op.collection]
        : undefined;
      if (!items || !Object.hasOwn(items, op.slug))
        throw new OpError(`Item ${op.collection}/${op.slug} does not exist`, [
          "collections",
          op.collection,
          op.slug,
        ]);
      delete items[op.slug];
      if (!op.keepEmpty && Object.keys(items).length === 0) delete doc.collections[op.collection];
      return;
    }
    case "collectionConfig.upsert": {
      if (op.config === null) {
        const configs = doc.collectionConfigs;
        if (!configs || !Object.hasOwn(configs, op.collection))
          throw new OpError(`Collection ${op.collection} has no settings`, [
            "collectionConfigs",
            op.collection,
          ]);
        delete configs[op.collection];
        if (!op.keepEmpty && Object.keys(configs).length === 0) delete doc.collectionConfigs;
      } else {
        if (!doc.collectionConfigs) doc.collectionConfigs = {};
        doc.collectionConfigs[op.collection] = clone(op.config);
      }
      return;
    }
    case "component.upsert": {
      const name = op.component.name;
      if (!doc.components) doc.components = {};
      doc.components[name] = clone(op.component);
      for (const [id, inst] of Object.entries(op.instances ?? {})) {
        const loc = locateBlock(doc, id);
        if (!loc || loc.block.type !== componentType(name))
          throw new OpError(`Block ${id} is not a ${name} section`, ["instances", id]);
        loc.block.v = inst.v;
        loc.block.fields = clone(inst.fields);
      }
      return;
    }
    case "component.delete": {
      const components = doc.components;
      if (!components || !Object.hasOwn(components, op.name))
        throw new OpError(`Component ${op.name} does not exist`, ["components", op.name]);
      delete components[op.name];
      if (!op.keepEmpty && Object.keys(components).length === 0) delete doc.components;
      return;
    }
    default: {
      const never: never = op;
      throw new OpError(`Unknown op ${(never as { op: string }).op}`, ["op"]);
    }
  }
}

/**
 * Apply an op immutably (Immer structural sharing; untouched pages keep their identity).
 * Throws `OpError` when a precondition fails. Does not schema-validate — use `validate` for
 * untrusted ops.
 */
export function apply(doc: SiteDocument, op: Op): SiteDocument {
  return produce(doc, (draft) => {
    mutate(draft as SiteDocument, op);
  });
}

/** Apply ops in order (one Immer pass). Throws `OpError` (with `index`) on the first failure. */
export function applyAll(doc: SiteDocument, ops: readonly Op[]): SiteDocument {
  return produce(doc, (draft) => {
    ops.forEach((op, index) => {
      try {
        mutate(draft as SiteDocument, op);
      } catch (e) {
        if (e instanceof OpError) throw Object.assign(e, { index });
        throw e;
      }
    });
  });
}
