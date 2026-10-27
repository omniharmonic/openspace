import type { NavItem, NavLeaf, SiteDocument } from "@omniharmonic/openspace-schema";

/**
 * Pure helpers for the navigation tree (`site.nav`): flatten it into rows for the Pages
 * manager, move rows (drag and drop, keyboard) and rebuild it. Folders hold one level of
 * pages, collections and links; buttons and folders always sit at the top level.
 */

export type Nav = SiteDocument["site"]["nav"];

export interface NavRow {
  /** Position in the tree: "2" or "2.1". Stable for one render. */
  id: string;
  depth: 0 | 1;
  item: NavItem;
}

export function isLeaf(item: NavItem): item is NavLeaf {
  return item.type === "page" || item.type === "collection" || item.type === "link";
}

export function flattenNav(nav: Nav): NavRow[] {
  const rows: NavRow[] = [];
  nav.forEach((item, i) => {
    rows.push({ id: String(i), depth: 0, item });
    if (item.type === "folder")
      item.items.forEach((child, j) => {
        rows.push({ id: `${i}.${j}`, depth: 1, item: child });
      });
  });
  return rows;
}

/** Rebuild a tree from rows: depth-1 rows join the nearest folder above them. */
export function buildNav(rows: ReadonlyArray<Pick<NavRow, "depth" | "item">>): Nav {
  const out: NavItem[] = [];
  let folder: Extract<NavItem, { type: "folder" }> | null = null;
  for (const row of rows) {
    if (row.item.type === "folder") {
      folder = { ...row.item, items: [] };
      out.push(folder);
      continue;
    }
    if (row.depth === 1 && folder && isLeaf(row.item)) {
      folder.items.push(row.item);
      continue;
    }
    // A top-level item ends the folder above it.
    folder = null;
    out.push(row.item);
  }
  return out;
}

/** Rows that travel with `id` when it's dragged (a folder takes its children). */
function block(rows: NavRow[], index: number): number {
  const row = rows[index];
  if (row?.item.type !== "folder") return 1;
  let n = 1;
  while (rows[index + n]?.depth === 1) n++;
  return n;
}

export interface Projection {
  depth: 0 | 1;
  minDepth: 0 | 1;
  maxDepth: 0 | 1;
}

/**
 * Where a dragged row lands: moved to `overId`'s position, at the depth the pointer suggests
 * (`desiredDepth`, from horizontal offset), clamped to what the neighbours allow.
 */
export function projectMove(
  rows: NavRow[],
  activeId: string,
  overId: string,
  desiredDepth: number,
): Projection {
  const from = rows.findIndex((r) => r.id === activeId);
  const to = rows.findIndex((r) => r.id === overId);
  const active = rows[from];
  if (!active || to < 0) return { depth: 0, minDepth: 0, maxDepth: 0 };
  const size = block(rows, from);
  const without = [...rows.slice(0, from), ...rows.slice(from + size)];
  // Index in `without` where the active block is inserted.
  let at = to > from ? to - size + 1 : to;
  at = Math.max(0, Math.min(at, without.length));
  const prev = without[at - 1];
  const next = without[at];
  const leaf = isLeaf(active.item);
  const maxDepth: 0 | 1 = leaf && prev && (prev.item.type === "folder" || prev.depth === 1) ? 1 : 0;
  const minDepth: 0 | 1 = leaf && next?.depth === 1 ? 1 : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, Math.round(desiredDepth))) as 0 | 1;
  return { depth, minDepth, maxDepth };
}

/** Move a row (and a folder's children) to `overId`'s position at `depth`. */
export function moveRow(rows: NavRow[], activeId: string, overId: string, depth: 0 | 1): Nav {
  const from = rows.findIndex((r) => r.id === activeId);
  const to = rows.findIndex((r) => r.id === overId);
  if (from < 0 || to < 0) return buildNav(rows);
  const size = block(rows, from);
  const moving = rows.slice(from, from + size);
  const without = [...rows.slice(0, from), ...rows.slice(from + size)];
  let at = to > from ? to - size + 1 : to;
  at = Math.max(0, Math.min(at, without.length));
  const head = moving[0];
  if (!head) return buildNav(rows);
  const placed = [{ ...head, depth }, ...moving.slice(1)];
  return buildNav([...without.slice(0, at), ...placed, ...without.slice(at)]);
}

/** Swap a row with its previous/next sibling (keyboard / menu). Folders move with their pages. */
export function nudgeRow(nav: Nav, id: string, dir: -1 | 1): Nav {
  const [a, b] = id.split(".").map(Number) as [number, number | undefined];
  const swap = <T>(list: readonly T[], i: number): T[] | null => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return null;
    const out = [...list];
    [out[i], out[j]] = [out[j] as T, out[i] as T];
    return out;
  };
  if (b === undefined) return swap(nav, a) ?? nav;
  const folder = nav[a];
  if (folder?.type !== "folder") return nav;
  const items = swap(folder.items, b);
  if (!items) return nav;
  return nav.map((item, i) => (i === a ? { ...folder, items } : item));
}

/** Put a leaf into a folder (at its end), or take it out to the top level after the folder. */
export function setFolder(nav: Nav, id: string, folderIndex: number | null): Nav {
  const rows = flattenNav(nav);
  const row = rows.find((r) => r.id === id);
  if (!row || !isLeaf(row.item)) return nav;
  const rest = rows.filter((r) => r.id !== id);
  if (folderIndex === null) {
    const parent = id.includes(".") ? Number(id.split(".")[0]) : null;
    if (parent === null) return nav;
    // After the parent folder's last child.
    const parentAt = rest.findIndex((r) => r.id === String(parent));
    let at = parentAt + 1;
    while (rest[at]?.depth === 1) at++;
    return buildNav([...rest.slice(0, at), { ...row, depth: 0 }, ...rest.slice(at)]);
  }
  const folderAt = rest.findIndex((r) => r.id === String(folderIndex));
  if (folderAt < 0 || rest[folderAt]?.item.type !== "folder") return nav;
  let at = folderAt + 1;
  while (rest[at]?.depth === 1) at++;
  return buildNav([...rest.slice(0, at), { ...row, depth: 1 }, ...rest.slice(at)]);
}

/** Replace the item at a row id. */
export function updateItem(nav: Nav, id: string, update: (item: NavItem) => NavItem): Nav {
  const rows = flattenNav(nav).map((r) => (r.id === id ? { ...r, item: update(r.item) } : r));
  return buildNav(rows);
}

/** Remove a row; a folder's children move up to the top level in its place. */
export function removeRow(nav: Nav, id: string): Nav {
  const rows = flattenNav(nav);
  const row = rows.find((r) => r.id === id);
  if (!row) return nav;
  const out = rows
    .filter((r) => r.id !== id)
    .map((r) =>
      row.item.type === "folder" && r.id.startsWith(`${id}.`) ? { ...r, depth: 0 as const } : r,
    );
  return buildNav(out);
}

/** Every page id the navigation links to (including folder landing pages). */
export function pagesInNav(nav: Nav): Set<string> {
  const out = new Set<string>();
  for (const item of nav) {
    if (item.type === "page") out.add(item.page);
    if (item.type === "folder") {
      if (item.page) out.add(item.page);
      for (const c of item.items) if (c.type === "page") out.add(c.page);
    }
  }
  return out;
}

/** Drop every link to a page (deleting it). Empty folders stay. */
export function withoutPage(nav: Nav, pageId: string): Nav {
  const out: NavItem[] = [];
  for (const item of nav) {
    if (item.type === "page" && item.page === pageId) continue;
    if (item.type === "folder") {
      const { page, ...rest } = item;
      out.push({
        ...rest,
        ...(page && page !== pageId ? { page } : {}),
        items: item.items.filter((c) => !(c.type === "page" && c.page === pageId)),
      });
      continue;
    }
    if (item.type === "button" && item.link.type === "page" && item.link.page === pageId) continue;
    out.push(item);
  }
  return out;
}

/** Add a page link at the end (or after another page's entry, at the same depth). */
export function withPage(nav: Nav, pageId: string, after?: string): Nav {
  const entry = { type: "page", page: pageId } as NavLeaf;
  if (!after) {
    // Before any trailing button (CTA) so it stays last.
    const lastButton = nav.length > 0 && nav[nav.length - 1]?.type === "button";
    return lastButton ? [...nav.slice(0, -1), entry, ...nav.slice(-1)] : [...nav, entry];
  }
  const rows = flattenNav(nav);
  const at = rows.findIndex((r) => r.item.type === "page" && r.item.page === after);
  if (at < 0) return withPage(nav, pageId);
  const depth = rows[at]?.depth ?? 0;
  let end = at + 1;
  if (depth === 0) end = at + block(rows, at);
  return buildNav([...rows.slice(0, end), { id: "new", depth, item: entry }, ...rows.slice(end)]);
}

/** The row for a page's navigation entry, if it has one. */
export function rowForPage(nav: Nav, pageId: string): NavRow | undefined {
  return flattenNav(nav).find((r) => r.item.type === "page" && r.item.page === pageId);
}
