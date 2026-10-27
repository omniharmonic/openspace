/**
 * Old Squarespace addresses → new OpenSpace targets: page slugs, collection names and item
 * slugs (made URL-safe and unique), the redirects that keep old links and search results
 * working, and link resolution for buttons, navigation and rich text.
 */
import { type Link, newId, type PageId } from "@omniharmonic/openspace-schema";
import type { SqSite } from "../squarespace/types";

export const slugify = (s: string, fallback = "page"): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "") || fallback;

const RESERVED = new Set(["404", "_os", "media", "api", "feed", "rss", "sitemap", "home", "index"]);

export interface PageTarget {
  id: PageId;
  slug: string;
}
export interface ItemTarget {
  collection: string;
  slug: string;
}

export type Resolved =
  | { kind: "page"; link: Link; path: string }
  | { kind: "item"; link: Link; path: string }
  | { kind: "collection"; link: Link; path: string }
  | { kind: "external"; link: Link; path: string }
  | { kind: "file"; url: string }
  | { kind: "missing"; path: string };

export class UrlMap {
  readonly pages = new Map<string, PageTarget>();
  readonly collections = new Map<string, string>();
  readonly items = new Map<string, ItemTarget>();
  readonly redirects: { from: string; to: string }[] = [];
  private readonly host: string;

  constructor(readonly site: SqSite) {
    this.host = new URL(site.baseUrl).host.replace(/^www\./, "");
    const taken = new Set<string>();
    const unique = (base: string) => {
      let s = base;
      for (let i = 2; taken.has(s) || RESERVED.has(s.split("/")[0] ?? ""); i++) s = `${base}-${i}`;
      taken.add(s);
      return s;
    };
    // Collections claim their first segment (pages can't share it).
    for (const c of site.collections) {
      const seg = c.path === "/" ? "" : (c.path.split("/").filter(Boolean).pop() ?? "");
      const fallback = c.kind === "products" ? "shop" : c.kind === "blog" ? "blog" : c.kind;
      const name = unique(slugify(seg || fallback, fallback));
      this.collections.set(c.path, name);
      const itemSlugs = new Set<string>();
      for (const item of c.items) {
        const last = item.path.split("/").filter(Boolean).pop() ?? item.title;
        let slug = slugify(last, "item");
        for (let i = 2; itemSlugs.has(slug); i++) slug = `${slugify(last, "item")}-${i}`;
        itemSlugs.add(slug);
        this.items.set(item.path, { collection: name, slug });
        const to = `/${name}/${slug}`;
        if (item.path && item.path !== to) this.addRedirect(item.path, to);
      }
      if (c.path !== `/${name}` && c.path !== "/") this.addRedirect(c.path, `/${name}/`);
    }
    for (const p of site.pages) {
      if (p.locked) continue;
      const slug =
        p.path === "/"
          ? ""
          : unique(
              p.path
                .split("/")
                .filter(Boolean)
                .map((seg) => slugify(seg))
                .join("/"),
            );
      this.pages.set(p.path, { id: newId("pg"), slug });
      if (p.path !== "/" && p.path !== `/${slug}`) this.addRedirect(p.path, `/${slug}`);
    }
    for (const a of site.aliases ?? []) {
      const target = this.pages.get(a.to);
      if (!target) continue;
      this.pages.set(a.from, target);
      this.addRedirect(a.from, this.pagePath(target));
    }
  }

  private addRedirect(from: string, to: string) {
    const safe = encodeURI(from).replace(/[?#]/g, "");
    if (!safe.startsWith("/") || safe === to || this.redirects.some((r) => r.from === safe)) return;
    this.redirects.push({ from: safe, to });
  }

  /** Normalize an href to an old-site path, or undefined when it is external. */
  oldPath(href: string): string | undefined {
    try {
      const u = new URL(href, this.site.baseUrl);
      if (u.host.replace(/^www\./, "") !== this.host) return undefined;
      return decodeURI(u.pathname).replace(/\/+$/, "") || "/";
    } catch {
      return undefined;
    }
  }

  pagePath(t: PageTarget): string {
    return t.slug ? `/${t.slug}` : "/";
  }

  /** Resolve a Squarespace href to an OpenSpace link. */
  resolve(href: string, newTab?: boolean): Resolved {
    const h = href.trim();
    if (/^mailto:/i.test(h)) {
      const email = decodeURIComponent(h.slice(7).split("?")[0] ?? "");
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? { kind: "external", link: { type: "email", email }, path: `mailto:${email}` }
        : { kind: "missing", path: h };
    }
    if (/^tel:/i.test(h)) {
      const phone = decodeURIComponent(h.slice(4)).trim();
      return /^\+?[0-9 ()\-.]{3,30}$/.test(phone)
        ? { kind: "external", link: { type: "phone", phone }, path: `tel:${phone}` }
        : { kind: "missing", path: h };
    }
    if (h.startsWith("#")) return { kind: "missing", path: h };
    const old = this.oldPath(h);
    if (old === undefined) {
      if (!/^https?:\/\//i.test(h)) return { kind: "missing", path: h };
      return {
        kind: "external",
        link: { type: "url", url: h, ...(newTab ? { newTab: true } : {}) },
        path: h,
      };
    }
    // Squarespace-hosted files (/s/brochure.pdf) are downloaded by the caller.
    if (/^\/s\/[^/]+\.[A-Za-z0-9]+$/.test(old))
      return { kind: "file", url: new URL(old, this.site.baseUrl).toString() };
    const page = this.pages.get(old);
    if (page)
      return { kind: "page", link: { type: "page", page: page.id }, path: this.pagePath(page) };
    const item = this.items.get(old);
    if (item)
      return {
        kind: "item",
        link: { type: "item", collection: item.collection, slug: item.slug },
        path: `/${item.collection}/${item.slug}`,
      };
    const coll = this.collections.get(old);
    if (coll !== undefined)
      return { kind: "collection", link: { type: "url", url: `/${coll}/` }, path: `/${coll}/` };
    // Collection sub-views: /blog/category/x, /blog/tag/x, /shop/p/x (handled above via items).
    const [first, ...rest] = old.split("/").filter(Boolean);
    const parent = first ? this.collections.get(`/${first}`) : undefined;
    if (parent && (rest[0] === "category" || rest[0] === "tag") && rest[1]) {
      const path = `/${parent}/${rest[0]}/${slugify(rest[1])}/`;
      return { kind: "collection", link: { type: "url", url: path }, path };
    }
    return { kind: "missing", path: old };
  }
}
