import type { SiteDocument } from "./document";
import type { PageId } from "./ids";
import type { Page } from "./page";
import type { Link } from "./primitives";

/**
 * Internal links: which site-relative addresses lead to a page, which links in a document lead
 * nowhere, and how to point a dangling link at a page that exists. Shared by `openspace check`
 * (CI), Studio's Design check, the Hub's publish gate and every path that inserts presets or
 * new blocks, so they all agree on what a broken link is.
 */

const COLLECTION_SUBPATHS = new Set(["page", "category", "categories", "tag", "tags"]);
/** Markdown and HTML links to site-relative paths inside Markdown bodies. */
export const MARKDOWN_LINK_RE = /\]\((\/[^)\s]*)\)|href="(\/[^"\s]*)"/g;

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, "");

/** What a site's internal addresses lead to. */
export class LinkTargets {
  readonly slugs: Set<string>;
  readonly redirectFroms: Set<string>;
  private readonly bySlug: Map<string, Page>;
  constructor(readonly doc: SiteDocument) {
    this.bySlug = new Map(Object.values(doc.pages).map((p) => [p.slug, p]));
    this.slugs = new Set(this.bySlug.keys());
    this.redirectFroms = new Set((doc.site.redirects ?? []).map((r) => trimSlashes(r.from)));
  }
  /** The page at a site-internal path (`/about/#team` → About), if it is one. */
  pageAt(raw: string): Page | undefined {
    return this.bySlug.get(trimSlashes(raw.split(/[?#]/)[0] ?? ""));
  }
  hasCollection(name: string): boolean {
    return name in this.doc.collections || name in (this.doc.collectionConfigs ?? {});
  }
  /** Does a site-internal path (`/about/`, `/journal/hello`) lead somewhere? */
  pathResolves(raw: string): boolean {
    const path = raw.split(/[?#]/)[0] ?? "";
    const slug = trimSlashes(path);
    const last = slug.split("/").pop() ?? "";
    if (/\.[A-Za-z0-9]+$/.test(last)) return true; // files: feeds, downloads, sitemap
    if (slug === "404" || slug.startsWith("_os/")) return true;
    if (this.slugs.has(slug) || this.redirectFroms.has(slug)) return true;
    const [head, second, ...rest] = slug.split("/");
    if (head && this.hasCollection(head)) {
      if (second === undefined) return true;
      if (this.doc.collections[head]?.[second]) return rest.length === 0;
      return COLLECTION_SUBPATHS.has(second);
    }
    return false;
  }
}

/** True for `/…` (not `//host`): a link inside the site. */
export const isInternalPath = (s: string): boolean => /^\/(?!\/)/.test(s);

// --- finding broken links -------------------------------------------------------------------

export type BrokenLinkKind =
  /** A link value `{type:"url", url:"/…"}`. */
  | "url"
  /** `{type:"page", page}` to a page that doesn't exist. */
  | "page"
  /** `{type:"item"}` to a collection item that doesn't exist. */
  | "item"
  /** A navigation entry for a collection that doesn't exist. */
  | "collection"
  /** A link inside a Markdown body (collection items). */
  | "markdown"
  /** A link mark inside rich text. */
  | "richtext"
  /** A link to a part of a page (`/#baskets`, a menu entry's anchor) no section there has. */
  | "anchor";

/** Where a broken link is: in `content/site.json`, a page, or a collection item. */
export type LinkScope =
  | { kind: "site" }
  | { kind: "page"; page: PageId }
  | { kind: "item"; collection: string; slug: string };

export interface BrokenLink {
  scope: LinkScope;
  /** Path inside the scope's value (`sections.0.blocks.1.fields.link`). */
  path: (string | number)[];
  /** The page or footer the link's block lives in (`"footer"`), when it is in a block. */
  container?: string;
  section?: string;
  block?: string;
  /** Top-level block field the link is in (`link`, `secondaryLink`, `content`). */
  field?: string;
  kind: BrokenLinkKind;
  /** What the link points at: `/book`, a page id, `journal/hello`, a collection name. */
  target: string;
  /**
   * `error` for links the published site's check fails on (link values, Markdown links);
   * `warning` for rich-text links, which `openspace check` reports without failing.
   */
  severity: "error" | "warning";
  /** The `openspace check` message. */
  message: string;
  /** For `anchor` links: the page and the fragment nothing on it answers to. */
  anchor?: { page: PageId; fragment: string };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Every internal link in the document that leads nowhere, in document order. */
export function findBrokenLinks(doc: SiteDocument): BrokenLink[] {
  const targets = new LinkTargets(doc);
  const out: BrokenLink[] = [];
  type Where = Pick<BrokenLink, "container" | "section" | "block" | "field">;
  const fragments = new Map<string, Fragments>();
  const fragmentsOf = (page: PageId) => {
    let f = fragments.get(page);
    if (!f) {
      f = pageFragments(doc, page);
      fragments.set(page, f);
    }
    return f;
  };
  const sectionIds = new Set(
    Object.values(doc.pages).flatMap((p) => p.sections.map((s) => s.id as string)),
  );

  const walk = (value: unknown, scope: LinkScope, path: (string | number)[], where: Where) => {
    const add = (
      kind: BrokenLinkKind,
      target: string,
      message: string,
      severity: BrokenLink["severity"] = "error",
    ) => out.push({ scope, path, ...where, kind, target, severity, message });
    /** Links to a part of a page: warn (never block) when nothing there answers to it. */
    const checkAnchor = (o: Record<string, unknown>) => {
      const ref = anchorRef(o, targets, scope.kind === "page" ? scope.page : undefined);
      if (!ref || fragmentsOf(ref.page.id).has(ref.fragment)) return;
      out.push({
        scope,
        path,
        ...where,
        kind: "anchor",
        target: ref.target,
        severity: "warning",
        message: `Link to ${ref.target}: no section on ${pageTitle(ref.page)} is called “${ref.fragment}”`,
        anchor: { page: ref.page.id, fragment: ref.fragment },
      });
    };
    if (typeof value === "string") {
      if (path[path.length - 1] === "body")
        for (const m of value.matchAll(MARKDOWN_LINK_RE)) {
          const target = m[1] ?? m[2];
          if (target && !targets.pathResolves(target))
            add("markdown", target, `Link to ${target} does not lead to any page`);
        }
      return;
    }
    if (Array.isArray(value)) {
      for (const [i, v] of value.entries()) walk(v, scope, [...path, i], where);
      return;
    }
    if (!isObject(value)) return;
    const o = value;
    if (o.type === "page" && typeof o.page === "string") {
      if (!(o.page in doc.pages))
        add("page", o.page, `Link to page ${o.page} but no such page exists`);
      else checkAnchor(o);
    } else if (o.type === "anchor" && typeof o.section === "string") {
      if (!sectionIds.has(o.section))
        add("anchor", o.section, "Link to a section that no longer exists", "warning");
    } else if (
      o.type === "item" &&
      typeof o.collection === "string" &&
      typeof o.slug === "string"
    ) {
      if (!doc.collections[o.collection]?.[o.slug])
        add(
          "item",
          `${o.collection}/${o.slug}`,
          `Link to ${o.collection}/${o.slug} but no such item exists`,
        );
    } else if (o.type === "collection" && typeof o.collection === "string") {
      if (!targets.hasCollection(o.collection))
        add(
          "collection",
          o.collection,
          `Navigation points at collection "${o.collection}" which does not exist`,
        );
    } else if (o.type === "url" && typeof o.url === "string" && isInternalPath(o.url)) {
      if (!targets.pathResolves(o.url))
        add("url", o.url, `Link to ${o.url} does not lead to any page`);
      else checkAnchor(o);
    } else if (o.type === "link" && isObject(o.attrs) && typeof o.attrs.href === "string") {
      const href = o.attrs.href;
      if (isInternalPath(href) && !targets.pathResolves(href))
        add("richtext", href, `Text link to ${href} does not lead to any page`, "warning");
      else checkAnchor(o);
    }
    for (const [k, v] of Object.entries(o)) walk(v, scope, [...path, k], where);
  };

  /** A section: its blocks' links carry the block (and field) they are in. */
  const walkSection = (
    section: { id: string; blocks: readonly { id: string }[] },
    scope: LinkScope,
    base: (string | number)[],
    container: string,
  ) => {
    for (const [k, v] of Object.entries(section))
      if (k !== "blocks") walk(v, scope, [...base, k], { container, section: section.id });
    section.blocks.forEach((b, j) => {
      const at = { container, section: section.id, block: b.id };
      for (const [k, v] of Object.entries(b)) {
        if (k !== "fields") walk(v, scope, [...base, "blocks", j, k], at);
        else if (isObject(v))
          for (const [field, fv] of Object.entries(v))
            walk(fv, scope, [...base, "blocks", j, "fields", field], { ...at, field });
      }
    });
  };

  const site = { kind: "site" } as const;
  for (const [k, v] of Object.entries(doc.site))
    if (k === "footer") walkSection(doc.site.footer, site, ["footer"], "footer");
    else walk(v, site, [k], {});
  for (const page of Object.values(doc.pages)) {
    const scope: LinkScope = { kind: "page", page: page.id };
    for (const [k, v] of Object.entries(page)) if (k !== "sections") walk(v, scope, [k], {});
    for (const [i, s] of page.sections.entries()) walkSection(s, scope, ["sections", i], page.id);
  }
  for (const [collection, items] of Object.entries(doc.collections))
    for (const item of Object.values(items))
      walk(item, { kind: "item", collection, slug: item.slug }, [], {});
  return out;
}

// --- pointing dangling links somewhere --------------------------------------------------------

/** Words that mark a page as the place to get in touch, book or buy. */
const CONTACT_WORDS = [
  "contact",
  "book",
  "booking",
  "bookings",
  "reserve",
  "reservations",
  "enquire",
  "enquiry",
  "enquiries",
  "inquire",
  "inquiry",
  "get-in-touch",
  "hello",
  "appointments",
  "visit",
];

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

/** Same word, or one a short suffix away (`book` / `booking`, `retreat` / `retreats`). */
const related = (a: string, b: string) => {
  if (a === b) return true;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s) && l.length - s.length <= 3;
};

const publicPages = (doc: SiteDocument): Page[] =>
  Object.values(doc.pages).filter(
    (p) => !p.access?.password && !p.access?.members && p.slug !== "404",
  );

const pagePath = (p: Page) => (p.slug ? `/${p.slug}` : "/");

export interface LinkSuggestion {
  /** The page to point at; absent for a collection's index. */
  page?: Page;
  /** Its site-relative path (`/contact`, `/`, `/journal/`). */
  path: string;
}

/**
 * A page for a link to `target` (an internal path that leads nowhere) to point at instead:
 * a page or collection whose address or title shares a word with it; else a contact/booking-like
 * page; else the home page. Undefined when the site has no public page at all.
 */
export function suggestLinkTarget(doc: SiteDocument, target: string): LinkSuggestion | undefined {
  const wanted = words(trimSlashes(target.split(/[?#]/)[0] ?? ""));
  const pages = publicPages(doc);
  const matches = (p: Page, list: readonly string[]) => {
    const own = [...words(p.slug), ...words(p.title)];
    return own.some((w) => list.some((x) => related(w, x)));
  };
  const bySlugWord = pages.find((p) => p.slug && wanted.some((w) => words(p.slug).includes(w)));
  if (bySlugWord) return { page: bySlugWord, path: pagePath(bySlugWord) };
  const byWord = pages.find((p) => p.slug && matches(p, wanted));
  if (byWord) return { page: byWord, path: pagePath(byWord) };
  const collection = Object.keys(doc.collections).find((c) =>
    wanted.some((w) => related(w, c.toLowerCase())),
  );
  if (collection) return { path: `/${collection}/` };
  const contact = CONTACT_WORDS.map((w) =>
    pages.find((p) => p.slug && (words(p.slug).includes(w) || words(p.title).includes(w))),
  ).find(Boolean);
  if (contact) return { page: contact, path: pagePath(contact) };
  const home = pages.find((p) => p.slug === "") ?? pages[0];
  return home ? { page: home, path: pagePath(home) } : undefined;
}

/** The link value a suggestion stands for (pages by id, so renaming the page keeps it working). */
export function suggestionLink(s: LinkSuggestion, newTab?: boolean): Link {
  if (s.page) return { type: "page", page: s.page.id };
  return { type: "url", url: s.path, ...(newTab ? { newTab } : {}) };
}

export interface LinkChange {
  path: (string | number)[];
  from: string;
  to: string;
}

/**
 * Point every internal link in `value` (a section, block, page or header built from a preset or
 * a block's demo content) that leads nowhere in `doc` at a page that exists
 * (`suggestLinkTarget`). Links that work are kept, and so are external, email, phone and anchor
 * links. Only block content changes: layout and style stay exactly as built, so an Editor may
 * still insert the result as a preset section. Returns a copy and what changed.
 */
export function resolveInternalLinks<T>(
  value: T,
  doc: SiteDocument,
): { value: T; changes: LinkChange[] } {
  const targets = new LinkTargets(doc);
  const changes: LinkChange[] = [];
  const cache = new Map<string, LinkSuggestion | undefined>();
  const suggest = (target: string) => {
    if (!cache.has(target)) cache.set(target, suggestLinkTarget(doc, target));
    return cache.get(target);
  };
  const fix = (v: unknown, path: (string | number)[]): unknown => {
    if (typeof v === "string") {
      if (path[path.length - 1] !== "body") return v;
      return v.replace(MARKDOWN_LINK_RE, (m, md?: string, html?: string) => {
        const target = md ?? html;
        if (!target || targets.pathResolves(target)) return m;
        const s = suggest(target);
        if (!s) return m;
        changes.push({ path, from: target, to: s.path });
        return md ? `](${s.path})` : `href="${s.path}"`;
      });
    }
    if (Array.isArray(v)) return v.map((x, i) => fix(x, [...path, i]));
    if (!isObject(v)) return v;
    if (v.type === "url" && typeof v.url === "string" && isInternalPath(v.url)) {
      if (targets.pathResolves(v.url)) return v;
      const s = suggest(v.url);
      if (!s) return v;
      changes.push({ path, from: v.url, to: s.path });
      return suggestionLink(s, v.newTab === true ? true : undefined);
    }
    if (v.type === "page" && typeof v.page === "string" && !(v.page in doc.pages)) {
      const home = suggest("/");
      if (!home?.page) return v;
      changes.push({ path, from: v.page, to: home.path });
      return { ...v, page: home.page.id };
    }
    if (v.type === "link" && isObject(v.attrs) && typeof v.attrs.href === "string") {
      const href = v.attrs.href;
      if (!isInternalPath(href) || targets.pathResolves(href)) return v;
      const s = suggest(href);
      if (!s) return v;
      changes.push({ path, from: href, to: s.path });
      return { ...v, attrs: { ...v.attrs, href: s.path } };
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = fix(x, [...path, k]);
    return out;
  };
  return { value: fix(value, []) as T, changes };
}

/** `doc` with `pages` added (links on a page being created may point at the page itself). */
export function withPages(doc: SiteDocument, pages: readonly Page[]): SiteDocument {
  const all = { ...doc.pages };
  for (const p of pages) all[p.id] = p;
  return { ...doc, pages: all };
}

// --- in-page anchors ----------------------------------------------------------------------------

const pageTitle = (p: Page) => p.title || (p.slug === "" ? "Home" : p.slug);

/** What a page can always jump to: its main area and the top. */
const LANDMARKS = ["main", "top"];
/** Static ids in a component's template (`<div id='signup'>`). */
const TEMPLATE_ID_RE = /\bid\s*=\s*["']([A-Za-z][\w-]*)["']/g;

/** The fragments (`#…`) a page answers to. */
export interface Fragments {
  has(fragment: string): boolean;
}

/**
 * What `#fragment` can point at on a page as published: each section's anchor (or its id when
 * it has none — the renderer's `id`), the footer, block ids (and the ids blocks derive from
 * theirs, like an accordion's `blk_…-q1`), static ids in the templates of the custom components
 * used there, and the page's main area.
 */
export function pageFragments(doc: SiteDocument, pageId: PageId | string): Fragments {
  const ids = new Set<string>(LANDMARKS);
  const blocks = new Set<string>();
  const page = doc.pages[pageId as PageId];
  for (const s of [...(page?.sections ?? []), doc.site.footer]) {
    ids.add(s.anchor ?? s.id);
    for (const b of s.blocks) {
      blocks.add(b.id);
      const name = /^component\/(.+)$/.exec(b.type)?.[1];
      const tpl = name ? doc.components?.[name]?.template : undefined;
      if (tpl) for (const m of tpl.matchAll(TEMPLATE_ID_RE)) if (m[1]) ids.add(m[1]);
    }
  }
  return {
    has: (f) => ids.has(f) || blocks.has(f) || [...blocks].some((b) => f.startsWith(`${b}-`)),
  };
}

interface AnchorRef {
  page: Page;
  fragment: string;
  /** How the link reads: `/#baskets`, `/about/#team`, `#faq`. */
  target: string;
}

/**
 * The page and fragment a link value points at, when it points at a part of a page of this
 * site: `{type:"page", page, anchor}` (menu entries too), `{type:"url", url:"/#x"}`, and rich-text
 * link marks (`/about#team`, or `#team` on `currentPage`).
 */
function anchorRef(
  o: Record<string, unknown>,
  targets: LinkTargets,
  currentPage?: string,
): AnchorRef | undefined {
  if (o.type === "page" && typeof o.page === "string" && typeof o.anchor === "string") {
    const page = targets.doc.pages[o.page as PageId];
    return page ? { page, fragment: o.anchor, target: `${pagePath(page)}#${o.anchor}` } : undefined;
  }
  const href =
    o.type === "url" && typeof o.url === "string"
      ? o.url
      : o.type === "link" && isObject(o.attrs) && typeof o.attrs.href === "string"
        ? o.attrs.href
        : undefined;
  if (!href) return undefined;
  const hash = /#([^#?]+)$/.exec(href)?.[1];
  if (!hash) return undefined;
  if (href.startsWith("#")) {
    if (o.type !== "link" || !currentPage) return undefined;
    const page = targets.doc.pages[currentPage as PageId];
    return page ? { page, fragment: hash, target: href } : undefined;
  }
  if (!isInternalPath(href)) return undefined;
  const page = targets.pageAt(href);
  return page ? { page, fragment: hash, target: href } : undefined;
}

/** Every string a visitor reads in a value (headings, text, labels) — not links or settings. */
function readableStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (!/^(?:\/|#|https?:|mailto:|tel:|media\/|data:)/.test(value)) out.push(value);
  } else if (Array.isArray(value)) for (const v of value) readableStrings(v, out);
  else if (isObject(value))
    for (const [k, v] of Object.entries(value))
      if (!["type", "id", "src", "url", "href", "page", "variant", "level", "preset"].includes(k))
        readableStrings(v, out);
  return out;
}

/** Does `value` hold a link to `#fragment` on `pageId`? */
function linksToAnchor(
  value: unknown,
  targets: LinkTargets,
  pageId: string,
  fragment: string,
): boolean {
  if (Array.isArray(value)) return value.some((v) => linksToAnchor(v, targets, pageId, fragment));
  if (!isObject(value)) return false;
  const ref = anchorRef(value, targets, pageId);
  if (ref && ref.page.id === pageId && ref.fragment === fragment) return true;
  return Object.values(value).some((v) => linksToAnchor(v, targets, pageId, fragment));
}

/**
 * The section a link to `#fragment` on a page most likely means, by the words of the fragment
 * (`how-it-works`, `baskets`) against each section's name, kind and the words on it — never a
 * section that itself links there (the hero's "See how it works" button). Undefined when no
 * section is a convincing match.
 */
export function suggestAnchorSection(
  doc: SiteDocument,
  pageId: PageId | string,
  fragment: string,
): Page["sections"][number] | undefined {
  const page = doc.pages[pageId as PageId];
  const wanted = words(fragment);
  if (!page || !wanted.length) return undefined;
  const targets = new LinkTargets(doc);
  /** 2 when every word of the fragment is there, 1 when some are. */
  const match = (s: string) => {
    const own = words(s);
    const hits = wanted.filter((w) => own.some((x) => related(w, x))).length;
    return hits === wanted.length ? 2 : hits ? 1 : 0;
  };
  let best: Page["sections"][number] | undefined;
  let bestScore = 0;
  for (const s of page.sections) {
    if (linksToAnchor(s.blocks, targets, page.id, fragment)) continue;
    const name = [
      s.label ?? "",
      s.anchor ?? "",
      (s.preset ?? "").replace(/@\d+$/, ""),
      ...s.blocks.map((b) => b.type.replace(/^component\//, "")),
    ].join(" ");
    const text = readableStrings(s.blocks.map((b) => b.fields)).reduce((n, t) => n + match(t), 0);
    // The section's own name and kind weigh most; words on it can't outvote them.
    const score = match(name) * 4 + Math.min(text, 4);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : undefined;
}

/**
 * Point every link in `value` to `#from` on `pageId` at `#to` instead — or at the top of that
 * page when `to` is undefined. `currentPage` is the page `value` sits on (for `#from` text
 * links). Returns a copy and how many links changed.
 */
export function retargetAnchor<T>(
  value: T,
  doc: SiteDocument,
  pageId: PageId | string,
  from: string,
  to: string | undefined,
  currentPage?: PageId | string,
): { value: T; changed: number } {
  const targets = new LinkTargets(doc);
  let changed = 0;
  const swap = (href: string) => {
    const base = href.slice(0, href.length - from.length - 1);
    if (to) return `${base}#${to}`;
    return base || "#top";
  };
  const fix = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(fix);
    if (!isObject(v)) return v;
    const ref = anchorRef(v, targets, currentPage);
    if (ref && ref.page.id === pageId && ref.fragment === from) {
      changed++;
      if (v.type === "page") {
        const { anchor: _a, ...rest } = v;
        return to ? { ...rest, anchor: to } : rest;
      }
      if (v.type === "url") return { ...v, url: swap(v.url as string) };
      const attrs = v.attrs as Record<string, unknown>;
      return { ...v, attrs: { ...attrs, href: swap(attrs.href as string) } };
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = fix(x);
    return out;
  };
  return { value: fix(value) as T, changed };
}
