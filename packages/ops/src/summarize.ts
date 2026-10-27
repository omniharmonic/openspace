import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { FOOTER, type Op } from "./ops";
import { patchPaths } from "./paths";

/** Counts behind a change summary (publish dialog, commit message, "what changed" lists). */
export interface ChangeStats {
  ops: number;
  /** Ids of existing pages whose content or settings changed (not created/deleted ones). */
  pagesEdited: string[];
  pagesCreated: string[];
  pagesDeleted: string[];
  footerEdited: boolean;
  sectionsAdded: number;
  sectionsRemoved: number;
  sectionsMoved: number;
  blocksAdded: number;
  blocksRemoved: number;
  blocksMoved: number;
  /** Distinct blocks whose fields, style or placement changed. */
  blocksEdited: number;
  imagesAdded: number;
  imagesRemoved: number;
  /** Non-image media (video, audio, files). */
  filesAdded: number;
  filesRemoved: number;
  /** Human labels of changed style settings, e.g. "accent color", "fonts". */
  stylesChanged: string[];
  navChanged: boolean;
  siteSettingsChanged: boolean;
  itemsSaved: number;
  itemsDeleted: number;
  collectionSettingsChanged: number;
}

const STYLE_LABELS: Record<string, string> = {
  "choices.palette.brand": "brand color",
  "choices.palette": "color palette",
  "choices.pairing": "fonts",
  "choices.density": "spacing",
  "choices.shape": "corner style",
  "choices.buttons": "button style",
  "choices.motion": "motion",
  "choices.imageTreatment": "image style",
  "overrides.type": "typography",
  "overrides.font": "typography",
  "overrides.space": "spacing",
  "overrides.radius": "corner style",
};

/** A friendly label for a styles path, e.g. `overrides.color.accent` → "accent color". */
export function styleLabel(path: string): string {
  const color = /^overrides\.color\.([^.]+)/.exec(path);
  if (color) return `${(color[1] as string).replace(/-/g, " ")} color`;
  let best = "";
  for (const prefix of Object.keys(STYLE_LABELS))
    if ((path === prefix || path.startsWith(`${prefix}.`)) && prefix.length > best.length)
      best = prefix;
  return best ? (STYLE_LABELS[best] as string) : "site styles";
}

export function stats(ops: readonly Op[], doc: SiteDocument): ChangeStats {
  const s: ChangeStats = {
    ops: ops.length,
    pagesEdited: [],
    pagesCreated: [],
    pagesDeleted: [],
    footerEdited: false,
    sectionsAdded: 0,
    sectionsRemoved: 0,
    sectionsMoved: 0,
    blocksAdded: 0,
    blocksRemoved: 0,
    blocksMoved: 0,
    blocksEdited: 0,
    imagesAdded: 0,
    imagesRemoved: 0,
    filesAdded: 0,
    filesRemoved: 0,
    stylesChanged: [],
    navChanged: false,
    siteSettingsChanged: false,
    itemsSaved: 0,
    itemsDeleted: 0,
    collectionSettingsChanged: 0,
  };
  const edited = new Set<string>();
  const created = new Set<string>();
  const deleted = new Set<string>();
  const editedBlocks = new Set<string>();
  const styleLabels = new Set<string>();
  const configs = new Set<string>();
  const touch = (page: string) => {
    if (page === FOOTER) s.footerEdited = true;
    else edited.add(page);
  };
  for (const op of ops) {
    switch (op.op) {
      case "block.update":
      case "grid.place":
        touch(op.page);
        editedBlocks.add(op.block);
        break;
      case "block.insert":
        touch(op.page);
        s.blocksAdded++;
        break;
      case "block.delete":
        touch(op.page);
        s.blocksRemoved++;
        break;
      case "block.move":
        touch(op.page);
        s.blocksMoved++;
        break;
      case "section.insert":
        touch(op.page);
        s.sectionsAdded++;
        break;
      case "section.delete":
        touch(op.page);
        s.sectionsRemoved++;
        break;
      case "section.move":
        touch(op.page);
        s.sectionsMoved++;
        break;
      case "section.update":
      case "page.update":
        touch(op.page);
        break;
      case "styles.patch":
        for (const p of patchPaths(op.patch)) styleLabels.add(styleLabel(p));
        break;
      case "page.create":
        if (deleted.has(op.page.id)) deleted.delete(op.page.id);
        else created.add(op.page.id);
        if (op.nav) s.navChanged = true;
        break;
      case "page.delete":
        if (created.has(op.page)) created.delete(op.page);
        else deleted.add(op.page);
        if (op.nav) s.navChanged = true;
        break;
      case "nav.update":
        s.navChanged = true;
        break;
      case "site.update":
        if (patchPaths(op).some((p) => p === "footer" || p.startsWith("footer.")))
          s.footerEdited = true;
        if (patchPaths(op).some((p) => p !== "footer" && !p.startsWith("footer.")))
          s.siteSettingsChanged = true;
        break;
      case "media.add":
        if (!Object.hasOwn(doc.media, op.path)) {
          if (op.meta.kind === "image") s.imagesAdded++;
          else s.filesAdded++;
        }
        break;
      case "media.remove": {
        const kind = doc.media[op.path]?.kind;
        if (kind === "image") s.imagesRemoved++;
        else s.filesRemoved++;
        break;
      }
      case "collection.upsert":
        s.itemsSaved++;
        break;
      case "collection.delete":
        s.itemsDeleted++;
        break;
      case "collectionConfig.upsert":
        configs.add(op.collection);
        break;
    }
  }
  s.pagesCreated = [...created];
  s.pagesDeleted = [...deleted];
  s.pagesEdited = [...edited].filter((id) => !created.has(id) && !deleted.has(id));
  s.blocksEdited = editedBlocks.size;
  s.stylesChanged = [...styleLabels];
  s.collectionSettingsChanged = configs.size;
  return s;
}

function list(items: readonly string[], max = 3, noun = "pages"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] as string;
  if (items.length <= max)
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] as string}`;
  const rest = items.length - (max - 1);
  return `${items.slice(0, max - 1).join(", ")} and ${rest} other ${noun}`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A one-line human summary of a set of ops against the document they apply to, e.g.
 * "Edited Home and About; added 2 images; changed accent color".
 */
export function summarize(ops: readonly Op[], doc: SiteDocument): string {
  const s = stats(ops, doc);
  const created = new Map<string, string>();
  for (const op of ops) if (op.op === "page.create") created.set(op.page.id, op.page.title);
  const title = (id: string) =>
    doc.pages[id as keyof SiteDocument["pages"]]?.title ?? created.get(id) ?? id;

  const parts: string[] = [];
  const editedNames = s.pagesEdited.map(title);
  if (s.footerEdited) editedNames.push("the footer");
  if (editedNames.length) parts.push(`edited ${list(editedNames)}`);
  if (s.pagesCreated.length)
    parts.push(
      s.pagesCreated.length <= 2
        ? `added ${s.pagesCreated.length === 1 ? "page" : "pages"} ${list(s.pagesCreated.map(title))}`
        : `added ${count(s.pagesCreated.length, "page")}`,
    );
  if (s.pagesDeleted.length)
    parts.push(
      s.pagesDeleted.length <= 2
        ? `deleted ${s.pagesDeleted.length === 1 ? "page" : "pages"} ${list(s.pagesDeleted.map(title))}`
        : `deleted ${count(s.pagesDeleted.length, "page")}`,
    );
  if (s.imagesAdded) parts.push(`added ${count(s.imagesAdded, "image")}`);
  if (s.filesAdded) parts.push(`added ${count(s.filesAdded, "file")}`);
  if (s.imagesRemoved) parts.push(`removed ${count(s.imagesRemoved, "image")}`);
  if (s.filesRemoved) parts.push(`removed ${count(s.filesRemoved, "file")}`);
  if (s.stylesChanged.length) parts.push(`changed ${list(s.stylesChanged, 3, "styles")}`);
  if (s.navChanged) parts.push("updated navigation");
  if (s.siteSettingsChanged) parts.push("updated site settings");
  if (s.itemsSaved) parts.push(`saved ${count(s.itemsSaved, "collection item")}`);
  if (s.itemsDeleted) parts.push(`deleted ${count(s.itemsDeleted, "collection item")}`);
  if (s.collectionSettingsChanged)
    parts.push(`updated settings for ${count(s.collectionSettingsChanged, "collection")}`);
  if (parts.length === 0) return "No changes";
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
