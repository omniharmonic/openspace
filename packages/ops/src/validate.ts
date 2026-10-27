import {
  type Block,
  type BlockRegistry,
  type CollectionItem,
  componentInstances,
  componentNameOf,
  createBlockRegistry,
  type NavItem,
  PageSchema,
  SectionSchema,
  type SiteDocument,
  SiteDocumentSchema,
  SiteSchema,
  StylesSchema,
  withComponents,
} from "@omniharmonic/openspace-schema";
import { produce } from "immer";
import type { z } from "zod";
import { mutate } from "./apply";
import { containerPath, indexIds, OpError, sectionsOf } from "./doc";
import { type ContainerId, FOOTER, type Op, parseOp } from "./ops";
import { findForbiddenKey, isJson, isPathPrefix, isPlainObject, patchPaths } from "./paths";

export interface OpIssue {
  path: (string | number)[];
  message: string;
}

export type ValidationResult =
  | { ok: true; doc: SiteDocument; warnings: OpIssue[] }
  | { ok: false; errors: OpIssue[] };

export interface ValidateOptions {
  /** Also validate inserted/updated blocks' fields against their definitions. */
  registry?: BlockRegistry;
  /**
   * Skip parsing the op's shape with `OpSchema` (only for ops constructed in-process by
   * trusted code; anything from the network must be parsed).
   */
  trusted?: boolean;
}

function zodIssues(error: z.ZodError, prefix: (string | number)[]): OpIssue[] {
  return error.issues.map((i) => ({
    path: [...prefix, ...i.path.map((p) => (typeof p === "symbol" ? String(p) : p))],
    message: i.message,
  }));
}

// --- referential checks ----------------------------------------------------------------------

/** Navigation/announcement links that point at pages which do not exist. */
export function siteRefIssues(doc: SiteDocument): OpIssue[] {
  const issues: OpIssue[] = [];
  const has = (id: string) => Object.hasOwn(doc.pages, id);
  const checkItem = (item: NavItem | { type: string }, path: (string | number)[]) => {
    const it = item as NavItem;
    if (it.type === "page" && !has(it.page))
      issues.push({
        path: [...path, "page"],
        message: `Navigation links to missing page ${it.page}`,
      });
    if (it.type === "folder") {
      if (it.page && !has(it.page))
        issues.push({
          path: [...path, "page"],
          message: `Folder lands on missing page ${it.page}`,
        });
      it.items.forEach((leaf, j) => {
        checkItem(leaf, [...path, "items", j]);
      });
    }
    if (it.type === "button" && it.link.type === "page" && !has(it.link.page))
      issues.push({
        path: [...path, "link", "page"],
        message: `Button links to missing page ${it.link.page}`,
      });
  };
  doc.site.nav.forEach((item, i) => {
    checkItem(item, ["site", "nav", i]);
  });
  const link = doc.site.announcement?.link;
  if (link?.type === "page" && !has(link.page))
    issues.push({
      path: ["site", "announcement", "link", "page"],
      message: `Announcement links to missing page ${link.page}`,
    });
  return issues;
}

/** Walk a JSON value, calling `visit` for every plain object with its path. */
function walk(
  value: unknown,
  path: (string | number)[],
  visit: (o: Record<string, unknown>, p: (string | number)[]) => void,
) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      walk(v, [...path, i], visit);
    });
  } else if (isPlainObject(value)) {
    visit(value, path);
    for (const [k, v] of Object.entries(value)) walk(v, [...path, k], visit);
  }
}

/** Page links inside page content (block fields, SEO…) that point at `pageId`. */
function contentLinksTo(doc: SiteDocument, pageId: string): OpIssue[] {
  const out: OpIssue[] = [];
  const visit = (o: Record<string, unknown>, p: (string | number)[]) => {
    if (o.type === "page" && o.page === pageId)
      out.push({ path: p, message: `Links to deleted page ${pageId}` });
  };
  walk(doc.pages, ["pages"], visit);
  walk(doc.site.footer, ["site", "footer"], visit);
  return out;
}

/** Strings anywhere in content equal to a media path. */
function mediaRefs(doc: SiteDocument, path: string): OpIssue[] {
  const out: OpIssue[] = [];
  const scan = (value: unknown, p: (string | number)[]) => {
    if (typeof value === "string") {
      if (value === path) out.push({ path: p, message: `Still references removed media ${path}` });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        scan(v, [...p, i]);
      });
    } else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) scan(v, [...p, k]);
  };
  scan(doc.pages, ["pages"]);
  scan(doc.site, ["site"]);
  scan(doc.collections, ["collections"]);
  return out;
}

function slugIssues(doc: SiteDocument, pageId: string): OpIssue[] {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page) return [];
  for (const other of Object.values(doc.pages)) {
    if (other.id !== pageId && other.slug === page.slug)
      return [
        {
          path: ["pages", pageId, "slug"],
          message: `Slug "${page.slug}" is also used by ${other.id}`,
        },
      ];
  }
  return [];
}

function collectionIssues(doc: SiteDocument, name: string): OpIssue[] {
  const items = Object.values(doc.collections[name] ?? {}) as CollectionItem[];
  const kinds = new Set(items.map((i) => i.kind));
  const out: OpIssue[] = [];
  if (kinds.size > 1)
    out.push({ path: ["collections", name], message: `Collection ${name} mixes item kinds` });
  const configKind = doc.collectionConfigs?.[name]?.kind;
  if (configKind && configKind !== "custom") {
    for (const item of items)
      if (item.kind !== configKind)
        out.push({
          path: ["collections", name, item.slug, "kind"],
          message: `Collection ${name} is a ${configKind} collection but ${item.slug} is ${item.kind}`,
        });
  }
  return out;
}

/** Section/block ids introduced by an op must be new to the whole document. */
function newIdIssues(
  doc: SiteDocument,
  sections: readonly { id: string; blocks: readonly { id: string }[] }[],
  blocks: readonly { id: string }[],
  path: (string | number)[],
): OpIssue[] {
  const idx = indexIds(doc);
  const out: OpIssue[] = [];
  const seen = new Set<string>();
  const claim = (id: string, kind: "Section" | "Block", taken: boolean) => {
    if (taken || seen.has(id)) out.push({ path, message: `${kind} id ${id} is already used` });
    seen.add(id);
  };
  for (const s of sections) {
    claim(s.id, "Section", idx.sections.has(s.id));
    for (const b of s.blocks) claim(b.id, "Block", idx.blocks.has(b.id));
  }
  for (const b of blocks) claim(b.id, "Block", idx.blocks.has(b.id));
  return out;
}

/** Section/block ids must be unique across pages + footer (checked after footer replacement). */
function globalIdIssues(doc: SiteDocument): OpIssue[] {
  const r = SiteDocumentSchema.safeParse(doc);
  if (r.success) return [];
  return zodIssues(r.error, []).filter((i) => /id .* is used in both/.test(i.message));
}

function containerIssues(doc: SiteDocument, container: ContainerId): OpIssue[] {
  if (container === FOOTER) {
    const r = SectionSchema.safeParse(doc.site.footer);
    return r.success ? [] : zodIssues(r.error, ["site", "footer"]);
  }
  const page = doc.pages[container];
  if (!page) return [{ path: ["pages", container], message: `Page ${container} does not exist` }];
  const r = PageSchema.safeParse(page);
  return r.success ? [] : zodIssues(r.error, ["pages", container]);
}

const NO_BLOCKS = createBlockRegistry([]);

/**
 * The registry to validate `doc`'s blocks with: `base` plus the document's custom components
 * (`component/<name>` types). Without a base registry only component instances are checked.
 */
export function registryForDoc(
  base: BlockRegistry | undefined,
  doc: Pick<SiteDocument, "components">,
): { registry: BlockRegistry; onlyComponents: boolean } | undefined {
  if (base) return { registry: withComponents(base, doc.components), onlyComponents: false };
  if (!doc.components || Object.keys(doc.components).length === 0) return undefined;
  return { registry: withComponents(NO_BLOCKS, doc.components), onlyComponents: true };
}

function blockIssues(
  base: BlockRegistry | undefined,
  doc: SiteDocument,
  container: ContainerId,
  ids: readonly string[],
): OpIssue[] {
  if (ids.length === 0) return [];
  const reg = registryForDoc(base, doc);
  const want = new Set(ids);
  const out: OpIssue[] = [];
  const path = containerPath(container);
  (sectionsOf(doc, container) ?? []).forEach((s, i) => {
    s.blocks.forEach((b: Block, j) => {
      if (!want.has(b.id)) return;
      const isComponent = componentNameOf(b.type) !== null;
      if (isComponent && !doc.components?.[componentNameOf(b.type) as string]) {
        out.push({
          path: [...path, "sections", i, "blocks", j, "type"],
          message: `This site has no component called "${componentNameOf(b.type)}"`,
        });
        return;
      }
      if (!reg || (reg.onlyComponents && !isComponent)) return;
      const r = reg.registry.validate(b);
      if (!r.success)
        for (const issue of r.issues)
          out.push({
            path: [...path, "sections", i, "blocks", j, ...issue.path],
            message: issue.message,
          });
    });
  });
  return out;
}

/** Every instance of component `name` must be valid against its (new) definition. */
function componentInstanceIssues(doc: SiteDocument, name: string): OpIssue[] {
  const reg = registryForDoc(undefined, doc);
  const out: OpIssue[] = [];
  const instances = componentInstances(doc, name);
  for (const inst of instances) {
    const block = inst.section.blocks.find((b) => b.id === inst.blockId) as Block;
    const r = reg?.registry.validate(block);
    if (r && !r.success)
      for (const issue of r.issues.slice(0, 5))
        out.push({
          path: ["blocks", inst.blockId, ...issue.path],
          message: `A section using ${name} would break: ${issue.message}`,
        });
  }
  return out;
}

function setValueIssues(op: Op): OpIssue[] {
  const sets: Record<string, unknown>[] = [];
  if (op.op === "styles.patch") sets.push(op.patch.set ?? {});
  else if (
    op.op === "block.update" ||
    op.op === "section.update" ||
    op.op === "page.update" ||
    op.op === "site.update"
  )
    sets.push(op.set ?? {});
  const out: OpIssue[] = [];
  for (const set of sets)
    for (const [k, v] of Object.entries(set))
      if (v === undefined || !isJson(v))
        out.push({ path: ["set", k], message: `Value for "${k}" is not plain JSON` });
  return out;
}

// --- validate --------------------------------------------------------------------------------

/**
 * Validate an op against a document: shape (OpSchema), preconditions (targets exist, positions in
 * range, new ids unique), then the resulting fragment (page, footer, site, styles, item…) against
 * the schema plus referential integrity. On success returns the resulting document and any
 * non-blocking warnings (e.g. content links to a deleted page).
 */
export function validate(
  doc: SiteDocument,
  input: Op | unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const forbidden = findForbiddenKey(input);
  if (forbidden)
    return { ok: false, errors: [{ path: [], message: `Forbidden key "${forbidden}"` }] };
  let op: Op;
  if (options.trusted) op = input as Op;
  else {
    const parsed = parseOp(input);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    op = parsed.op;
  }
  const valueIssues = setValueIssues(op);
  if (valueIssues.length) return { ok: false, errors: valueIssues };

  // Preconditions that need the document before the op.
  const pre: OpIssue[] = [];
  switch (op.op) {
    case "block.insert":
      pre.push(...newIdIssues(doc, [], [op.block], ["block", "id"]));
      break;
    case "section.insert":
      pre.push(...newIdIssues(doc, [op.section], [], ["section", "id"]));
      break;
    case "page.create":
      pre.push(...newIdIssues(doc, op.page.sections, [], ["page", "sections"]));
      break;
    case "media.add":
      if (op.meta.path !== op.path)
        pre.push({
          path: ["meta", "path"],
          message: `Media path ${op.meta.path} does not match ${op.path}`,
        });
      for (const [p, m] of Object.entries(doc.media))
        if (p !== op.path && m.id === op.meta.id)
          pre.push({
            path: ["meta", "id"],
            message: `Media id ${op.meta.id} is already used by ${p}`,
          });
      break;
  }
  if (pre.length) return { ok: false, errors: pre };

  let next: SiteDocument;
  try {
    next = produce(doc, (draft) => {
      mutate(draft as SiteDocument, op);
    });
  } catch (e) {
    if (e instanceof OpError) return { ok: false, errors: [{ path: e.path, message: e.message }] };
    return {
      ok: false,
      errors: [{ path: [], message: e instanceof Error ? e.message : String(e) }],
    };
  }

  const errors: OpIssue[] = [];
  const warnings: OpIssue[] = [];
  switch (op.op) {
    case "block.update":
      errors.push(
        ...containerIssues(next, op.page),
        ...blockIssues(options.registry, next, op.page, [op.block]),
      );
      break;
    case "block.insert":
      errors.push(
        ...containerIssues(next, op.page),
        ...blockIssues(options.registry, next, op.page, [op.block.id]),
      );
      break;
    case "block.move":
    case "block.delete":
    case "grid.place":
    case "section.move":
    case "section.delete":
      errors.push(...containerIssues(next, op.page));
      break;
    case "section.update":
      errors.push(...containerIssues(next, op.page));
      break;
    case "section.insert":
      errors.push(
        ...containerIssues(next, op.page),
        ...blockIssues(
          options.registry,
          next,
          op.page,
          op.section.blocks.map((b) => b.id),
        ),
      );
      break;
    case "page.create":
      errors.push(
        ...containerIssues(next, op.page.id),
        ...slugIssues(next, op.page.id),
        ...blockIssues(
          options.registry,
          next,
          op.page.id,
          op.page.sections.flatMap((s) => s.blocks.map((b) => b.id)),
        ),
      );
      if (op.nav) errors.push(...siteSchemaIssues(next), ...siteRefIssues(next));
      break;
    case "page.update":
      errors.push(...containerIssues(next, op.page));
      if (patchPaths(op).some((p) => isPathPrefix("slug", p)))
        errors.push(...slugIssues(next, op.page));
      break;
    case "page.delete":
      if (op.nav) errors.push(...siteSchemaIssues(next));
      errors.push(...siteRefIssues(next));
      warnings.push(...contentLinksTo(next, op.page));
      break;
    case "nav.update":
      errors.push(...siteSchemaIssues(next), ...siteRefIssues(next));
      break;
    case "site.update":
      errors.push(...siteSchemaIssues(next), ...siteRefIssues(next));
      if (errors.length === 0 && patchPaths(op).some((p) => isPathPrefix("footer", p)))
        errors.push(...globalIdIssues(next));
      break;
    case "styles.patch": {
      const r = StylesSchema.safeParse(next.styles);
      if (!r.success) errors.push(...zodIssues(r.error, ["styles"]));
      break;
    }
    case "media.add":
      break;
    case "media.remove":
      warnings.push(...mediaRefs(next, op.path));
      break;
    case "collection.upsert":
    case "collectionConfig.upsert":
      errors.push(...collectionIssues(next, op.collection));
      break;
    case "collection.delete":
      break;
    case "component.upsert":
      errors.push(...componentInstanceIssues(next, op.component.name));
      break;
    case "component.delete": {
      const used = componentInstances(next, op.name);
      if (used.length)
        errors.push({
          path: ["components", op.name],
          message: `${used.length} section${used.length === 1 ? " still uses" : "s still use"} this component; remove ${used.length === 1 ? "it" : "them"} first`,
        });
      break;
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, doc: next, warnings };
}

/** The type of the block a document path points into (pages.<id>.sections.<i>.blocks.<j>…). */
function blockTypeAt(doc: SiteDocument, path: readonly (string | number)[]): string | undefined {
  if (path[0] === "site") return doc.site.footer.blocks[path[3] as number]?.type;
  const page = doc.pages[path[1] as keyof SiteDocument["pages"]];
  return page?.sections[path[3] as number]?.blocks[path[5] as number]?.type;
}

function siteSchemaIssues(doc: SiteDocument): OpIssue[] {
  const r = SiteSchema.safeParse(doc.site);
  return r.success ? [] : zodIssues(r.error, ["site"]);
}

/** Validate a sequence of ops; stops at the first invalid one. */
export function validateAll(
  doc: SiteDocument,
  ops: readonly unknown[],
  options: ValidateOptions = {},
):
  | { ok: true; doc: SiteDocument; warnings: OpIssue[] }
  | { ok: false; index: number; errors: OpIssue[] } {
  let cur = doc;
  const warnings: OpIssue[] = [];
  for (let index = 0; index < ops.length; index++) {
    const r = validate(cur, ops[index], options);
    if (!r.ok) return { ok: false, index, errors: r.errors };
    cur = r.doc;
    warnings.push(...r.warnings);
  }
  return { ok: true, doc: cur, warnings };
}

/**
 * Full validation of a document: the whole `SiteDocumentSchema` (ids unique, keys match, …),
 * navigation/announcement page references and, with a registry, every block's fields.
 */
export function validateDocument(
  doc: unknown,
  options: Pick<ValidateOptions, "registry"> = {},
): ValidationResult {
  const r = SiteDocumentSchema.safeParse(doc);
  if (!r.success) return { ok: false, errors: zodIssues(r.error, []) };
  const errors = siteRefIssues(r.data);
  const reg = registryForDoc(options.registry, r.data);
  if (reg)
    for (const issue of reg.registry.validateDocument(r.data)) {
      if (reg.onlyComponents && !/^component\//.test(String(blockTypeAt(r.data, issue.path))))
        continue;
      errors.push({ path: issue.path, message: issue.message });
    }
  if (errors.length) return { ok: false, errors };
  return { ok: true, doc: doc as SiteDocument, warnings: [] };
}
