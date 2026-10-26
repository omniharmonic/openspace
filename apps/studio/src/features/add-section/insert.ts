import {
  blocksRegistry,
  type HeaderPreset,
  type Preset,
  type SectionPreset,
} from "@openspace/blocks";
import type { OpBody, Position } from "@openspace/ops";
import {
  type BlockCategory,
  type GridItem,
  type GridLayout,
  resolve,
  type Section,
  type SiteDocument,
} from "@openspace/schema";
import { type Command, cloneBlock } from "../editor/model/actions";
import { locate, type SelItem } from "../editor/model/selection";
import type { BlockTarget } from "./blockMenuStore";

/** Default grid height (rows) for a new block, by category. */
const GRID_ROWS: Partial<Record<BlockCategory, number>> = {
  text: 5,
  media: 12,
  navigation: 3,
  forms: 16,
  "social-proof": 8,
  contact: 8,
};

/**
 * A default placement for a block added to a grid section: centred, half width, under
 * everything on desktop; full width under everything on phones (the same shape the mobile
 * auto-layout produces, so the phone layout stays readable).
 */
export function defaultGridPlace(layout: GridLayout, rows: number): GridItem {
  const dRows = resolve(layout.rows, "d");
  const mRows = resolve(layout.rows, "m");
  return {
    d: { x: 7, y: dRows + 1, w: 12, h: rows },
    m: { x: 1, y: mRows + 1, w: 8, h: rows },
  };
}

/** Where a new block goes when nothing explicit was asked: next to the selection. */
export function targetFromSelection(
  doc: SiteDocument,
  pageId: string,
  selection: readonly SelItem[],
): BlockTarget | null {
  const item = selection.at(-1);
  const loc = item ? locate(doc, pageId, item) : undefined;
  if (loc?.block)
    return {
      section: loc.section.id,
      after: loc.block.id,
      ...(loc.block.column !== undefined ? { column: loc.block.column } : {}),
    };
  if (loc) return { section: loc.section.id };
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const last = page?.sections.at(-1);
  return last ? { section: last.id } : null;
}

/** Insert a new block of `type` (fresh block and form ids) into a stack column or a grid. */
export function insertBlockCommand(
  doc: SiteDocument,
  pageId: string,
  type: string,
  target: BlockTarget,
): Command | null {
  const def = blocksRegistry().get(type);
  const loc = locate(doc, pageId, { kind: "section", id: target.section });
  if (!def || !loc) return null;
  const block = cloneBlock(def.create());
  const section = loc.section;
  const after =
    target.after && section.blocks.some((b) => b.id === target.after) ? target.after : undefined;
  const at: Position = after ? { after } : "end";
  let body: OpBody;
  if (section.layout.mode === "stack") {
    const cols = section.layout.columns.d.length;
    const column = Math.min(Math.max(target.column ?? 0, 0), cols - 1);
    if (column > 0) block.column = column;
    body = { op: "block.insert", page: loc.container, section: section.id, at, block } as OpBody;
  } else {
    const place = defaultGridPlace(section.layout, GRID_ROWS[def.category] ?? 8);
    body = {
      op: "block.insert",
      page: loc.container,
      section: section.id,
      at,
      block,
      place,
    } as OpBody;
  }
  return {
    bodies: [body],
    select: [{ kind: "block", id: block.id }],
    label: `Add ${def.label.toLowerCase()}`,
  };
}

export const isHeaderPreset = (p: Preset): p is HeaderPreset => p.target === "header";

/**
 * Apply a preset: page sections insert at `at`; footer presets replace the site footer;
 * header presets set the site header (keeping the logo size the person chose).
 */
export function presetCommand(
  doc: SiteDocument,
  pageId: string,
  preset: Preset,
  at: Position,
): Command {
  if (isHeaderPreset(preset)) {
    const header = { ...preset.build() };
    if (doc.site.header.logoHeight) header.logoHeight = doc.site.header.logoHeight;
    if (doc.site.header.showSocial !== undefined && header.showSocial === undefined)
      header.showSocial = doc.site.header.showSocial;
    return {
      bodies: [{ op: "site.update", set: { header } } as OpBody],
      label: `Use the ${preset.label.toLowerCase()} header`,
    };
  }
  const section: Section = (preset as SectionPreset).build();
  if (preset.target === "footer") {
    return {
      bodies: [{ op: "site.update", set: { footer: section } } as OpBody],
      select: [{ kind: "section", id: section.id }],
      label: "Replace footer",
    };
  }
  return {
    bodies: [{ op: "section.insert", page: pageId, at, section } as OpBody],
    select: [{ kind: "section", id: section.id }],
    label: `Add ${preset.label.toLowerCase()} section`,
  };
}

/** Where "Add section" inserts without an explicit position: after the selection, else at the end. */
export function positionFromSelection(
  doc: SiteDocument,
  pageId: string,
  selection: readonly SelItem[],
): Position {
  const item = selection.at(-1);
  const loc = item ? locate(doc, pageId, item) : undefined;
  return loc && loc.container !== "footer" ? { after: loc.section.id } : "end";
}
