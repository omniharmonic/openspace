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
  constructor(readonly doc: SiteDocument) {
    this.slugs = new Set(Object.values(doc.pages).map((p) => p.slug));
    this.redirectFroms = new Set((doc.site.redirects ?? []).map((r) => trimSlashes(r.from)));
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
  | "richtext";

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
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Every internal link in the document that leads nowhere, in document order. */
export function findBrokenLinks(doc: SiteDocument): BrokenLink[] {
  const targets = new LinkTargets(doc);
  const out: BrokenLink[] = [];
  type Where = Pick<BrokenLink, "container" | "section" | "block" | "field">;

  const walk = (value: unknown, scope: LinkScope, path: (string | number)[], where: Where) => {
    const add = (
      kind: BrokenLinkKind,
      target: string,
      message: string,
      severity: BrokenLink["severity"] = "error",
    ) => out.push({ scope, path, ...where, kind, target, severity, message });
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
    } else if (o.type === "link" && isObject(o.attrs) && typeof o.attrs.href === "string") {
      const href = o.attrs.href;
      if (isInternalPath(href) && !targets.pathResolves(href))
        add("richtext", href, `Text link to ${href} does not lead to any page`, "warning");
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
