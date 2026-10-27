import type { Link as LinkValue, Page, SiteDocument } from "@omniharmonic/openspace-schema";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useRenderContext } from "./context";

/** Normalise a base path: `""`, `"/"` → `""`; `"repo/"` → `"/repo"`. */
export function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath) return "";
  const trimmed = basePath.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

/** URL path of a page: home is `/`, others end with a slash (`/about/`). */
export function pagePath(page: Pick<Page, "slug">, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  return page.slug ? `${base}/${page.slug}/` : `${base}/`;
}

/** URL path of a collection item: `/journal/opening-day/`. */
export function itemPath(collection: string, slug: string, basePath = ""): string {
  return `${normalizeBasePath(basePath)}/${collection}/${slug}/`;
}

/** Public URL of a media source: repo paths get the base path, remote URLs pass through. */
export function mediaUrl(src: string, basePath = ""): string {
  if (/^https?:\/\//.test(src) || src.startsWith("data:")) return src;
  return `${normalizeBasePath(basePath)}/${src.replace(/^\/+/, "")}`;
}

/** Prefix a site-relative path (`/schedule`) with the base path; leave everything else. */
export function withBase(href: string, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  if (!base || !href.startsWith("/") || href.startsWith("//")) return href;
  if (href === base || href.startsWith(`${base}/`)) return href;
  return `${base}${href}`;
}

export interface ResolvedLink {
  href: string;
  /** Open in a new tab (adds `target="_blank" rel="noopener"`). */
  newTab: boolean;
  /** The target no longer exists (deleted page/section). */
  broken: boolean;
  external: boolean;
}

export interface LinkResolveOptions {
  doc?: SiteDocument | undefined;
  basePath?: string;
  /** The page being rendered: anchors to its own sections become `#fragment`. */
  currentPageId?: string | undefined;
}

/** In-page fragment for a section: its `anchor` if set, else its id. */
export function sectionFragment(section: { id: string; anchor?: string | undefined }): string {
  return section.anchor ?? section.id;
}

/** Resolve a link target (page, collection item, URL, email, phone, file, anchor) to an href. */
export function resolveLink(link: LinkValue, opts: LinkResolveOptions = {}): ResolvedLink {
  const base = opts.basePath ?? "";
  const ok = (href: string, newTab = false, external = false): ResolvedLink => ({
    href,
    newTab,
    broken: false,
    external,
  });
  switch (link.type) {
    case "page": {
      const page = opts.doc?.pages[link.page];
      if (opts.doc && !page) return { href: "#", newTab: false, broken: true, external: false };
      const path = page ? pagePath(page, base) : `${normalizeBasePath(base)}/`;
      const hash = link.anchor ? `#${link.anchor}` : "";
      if (hash && link.page === opts.currentPageId) return ok(hash);
      return ok(path + hash);
    }
    case "item": {
      const exists = opts.doc ? Boolean(opts.doc.collections[link.collection]?.[link.slug]) : true;
      return {
        href: itemPath(link.collection, link.slug, base),
        newTab: false,
        broken: !exists,
        external: false,
      };
    }
    case "url": {
      const external = /^https?:\/\//.test(link.url);
      return ok(external ? link.url : withBase(link.url, base), link.newTab ?? false, external);
    }
    case "email": {
      const subject = link.subject ? `?subject=${encodeURIComponent(link.subject)}` : "";
      return ok(`mailto:${link.email}${subject}`);
    }
    case "phone":
      return ok(`tel:${link.phone.replace(/[^+0-9]/g, "")}`);
    case "file":
      return ok(mediaUrl(link.src, base), link.newTab ?? false, /^https?:\/\//.test(link.src));
    case "anchor": {
      if (!opts.doc) return ok(`#${link.section}`);
      for (const page of Object.values(opts.doc.pages)) {
        const section = page.sections.find((s) => s.id === link.section);
        if (!section) continue;
        const hash = `#${sectionFragment(section)}`;
        return ok(page.id === opts.currentPageId ? hash : pagePath(page, base) + hash);
      }
      return { href: "#", newTab: false, broken: true, external: false };
    }
  }
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: LinkValue;
  children?: ReactNode;
}

/** An `<a>` for a structured link, resolved against the current site and base path. */
export function Link({ to, children, ...rest }: LinkProps) {
  const ctx = useRenderContext();
  const r = resolveLink(to, { doc: ctx.doc, basePath: ctx.basePath, currentPageId: ctx.page?.id });
  const extra: Record<string, string> = {};
  if (r.newTab) {
    extra.target = "_blank";
    extra.rel = "noopener";
  }
  if (r.broken && ctx.mode !== "production") extra["data-os-broken-link"] = "";
  return (
    <a href={r.href} {...extra} {...rest}>
      {children}
    </a>
  );
}
