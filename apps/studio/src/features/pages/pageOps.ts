import type { OpBody } from "@openspace/ops";
import { newId, type Page, type Redirect, type SiteDocument } from "@openspace/schema";
import type { Command } from "../editor/model/actions";
import { cloneSection } from "../editor/model/actions";
import { type Nav, pagesInNav, rowForPage, withoutPage, withPage } from "./navTree";
import type { PageTemplate } from "./pageTemplates";

/** Commands (op lists) for the Pages manager. Every change is an `@openspace/ops` op. */

const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A URL-safe page address from a title: "Our Story & Team" → "our-story-team". */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "page"
  );
}

/** Normalise what someone typed as a page address: "/About Us/" → "about-us". */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((seg) => slugify(seg))
    .filter(Boolean)
    .join("/");
}

/** Problems with a page address, in plain words (null when it's fine). */
export function slugProblem(doc: SiteDocument, slug: string, pageId?: string): string | null {
  if (slug === "") {
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    return home && home.id !== pageId ? "Only the home page can use the main address." : null;
  }
  if (!slug.split("/").every((s) => SLUG_SEGMENT.test(s)))
    return "Use lowercase letters, numbers and hyphens.";
  const clash = Object.values(doc.pages).find((p) => p.slug === slug && p.id !== pageId);
  if (clash) return `“${clash.title}” already uses /${slug}.`;
  if (doc.site.redirects?.some((r) => r.from === `/${slug}` || r.from === `/${slug}/`))
    return `/${slug} redirects somewhere else. Remove that redirect first.`;
  return null;
}

/** A free address based on `base` (adds -2, -3…). */
export function uniqueSlug(doc: SiteDocument, base: string, pageId?: string): string {
  const root = base || "page";
  if (!slugProblem(doc, root, pageId)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!slugProblem(doc, candidate, pageId)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function createPage(
  doc: SiteDocument,
  template: PageTemplate,
  input: { title?: string; slug?: string; addToNav?: boolean; after?: string } = {},
): Command & { pageId: string } {
  const title = input.title?.trim() || template.title;
  const slug = uniqueSlug(doc, normalizeSlug(input.slug ?? "") || slugify(title));
  const page: Page = {
    id: newId("pg"),
    title,
    slug,
    sections: template.build().map(cloneSection),
  } as Page;
  const nav = input.addToNav === false ? undefined : withPage(doc.site.nav, page.id, input.after);
  return {
    pageId: page.id,
    label: `Add page “${title}”`,
    bodies: [{ op: "page.create", page, ...(nav ? { nav } : {}) } as OpBody],
  };
}

export function duplicatePage(
  doc: SiteDocument,
  pageId: string,
): (Command & { pageId: string; droppedPassword: boolean }) | null {
  const src = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!src) return null;
  const title = `${src.title} (copy)`.slice(0, 120);
  const slug = uniqueSlug(doc, `${src.slug || "home"}-copy`);
  const { id: _id, sections, slug: _s, title: _t, ...rest } = structuredClone(src);
  // Passwords live in the Hub per page: a copy can't inherit one, so it starts public (members-
  // only gating needs no secret and is kept).
  const { access, ...restNoAccess } = rest;
  const page = {
    ...restNoAccess,
    ...(access?.members ? { access: { members: true } } : {}),
    id: newId("pg"),
    title,
    slug,
    sections: sections.map(cloneSection),
  } as Page;
  const inNav = pagesInNav(doc.site.nav).has(pageId);
  return {
    pageId: page.id,
    droppedPassword: Boolean(access?.password),
    label: `Duplicate “${src.title}”`,
    bodies: [
      {
        op: "page.create",
        page,
        ...(inNav ? { nav: withPage(doc.site.nav, page.id, pageId) } : {}),
      } as OpBody,
    ],
  };
}

export function deletePage(doc: SiteDocument, pageId: string): Command | null {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page || page.slug === "") return null;
  return {
    label: `Delete “${page.title}”`,
    bodies: [{ op: "page.delete", page: pageId, nav: withoutPage(doc.site.nav, pageId) } as OpBody],
  };
}

export interface PageSettingsInput {
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  seoImage: string | null;
  noindex: boolean;
  /** Published but left out of navigation, search and the sitemap. */
  unlisted: boolean;
  access: "public" | "password" | "members";
  /** Add a redirect from the old address when the slug changes. */
  redirectOld: boolean;
  /** Per-page code (Advanced; owners and designers). Absent: leave unchanged. */
  headCode?: string;
  footerCode?: string;
}

export function pageSettingsOf(page: Page): Omit<PageSettingsInput, "redirectOld"> {
  return {
    title: page.title,
    slug: page.slug,
    seoTitle: page.seo?.title ?? "",
    seoDescription: page.seo?.description ?? "",
    seoImage: page.seo?.image ?? null,
    noindex: page.seo?.noindex ?? false,
    unlisted: page.hidden ?? false,
    access: page.access?.members ? "members" : page.access?.password ? "password" : "public",
    headCode: page.headInjection ?? "",
    footerCode: page.footerInjection ?? "",
  };
}

/** One `page.update` (plus a redirect and nav change when needed) for the settings form. */
export function updatePageSettings(
  doc: SiteDocument,
  pageId: string,
  input: PageSettingsInput,
): Command | null {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page) return null;
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const put = (path: string, value: unknown, empty: boolean) => {
    if (empty) unset.push(path);
    else set[path] = value;
  };
  const cur = pageSettingsOf(page);
  if (input.title.trim() !== cur.title) set.title = input.title.trim();
  const slug = page.slug === "" ? "" : normalizeSlug(input.slug);
  if (slug !== cur.slug) set.slug = slug;
  if (input.seoTitle.trim() !== cur.seoTitle)
    put("seo.title", input.seoTitle.trim(), !input.seoTitle.trim());
  if (input.seoDescription.trim() !== cur.seoDescription)
    put("seo.description", input.seoDescription.trim(), !input.seoDescription.trim());
  if (input.seoImage !== cur.seoImage) put("seo.image", input.seoImage, !input.seoImage);
  if (input.noindex !== cur.noindex) put("seo.noindex", true, !input.noindex);
  if (input.unlisted !== cur.unlisted) put("hidden", true, !input.unlisted);
  if (input.access !== cur.access) {
    if (input.access === "public") unset.push("access");
    else set.access = input.access === "members" ? { members: true } : { password: true };
  }
  for (const [key, path] of [
    ["headCode", "headInjection"],
    ["footerCode", "footerInjection"],
  ] as const) {
    const v = input[key];
    if (v !== undefined && v.trim() !== (cur[key] ?? "").trim()) put(path, v, !v.trim());
  }
  // Paths inside a patch must not overlap: an emptied seo object is dropped whole instead.
  const seoKeys = ["title", "description", "image", "noindex", "canonical"] as const;
  const seoAfter = seoKeys.filter((k) => {
    if (unset.includes(`seo.${k}`)) return false;
    return set[`seo.${k}`] !== undefined || page.seo?.[k] !== undefined;
  });
  if (page.seo && seoAfter.length === 0 && unset.some((u) => u.startsWith("seo."))) {
    for (const k of seoKeys) {
      const i = unset.indexOf(`seo.${k}`);
      if (i >= 0) unset.splice(i, 1);
    }
    unset.push("seo");
  }

  const bodies: OpBody[] = [];
  if (Object.keys(set).length || unset.length)
    bodies.push({
      op: "page.update",
      page: pageId,
      ...(Object.keys(set).length ? { set } : {}),
      ...(unset.length ? { unset } : {}),
    } as OpBody);
  if (set.slug !== undefined && input.redirectOld && cur.slug) {
    const from = `/${cur.slug}`;
    const redirects: Redirect[] = [
      ...(doc.site.redirects ?? []).filter((r) => r.from !== from),
      { from, to: `/${slug}`, status: 301 },
    ];
    bodies.push({ op: "site.update", set: { redirects } } as OpBody);
  }
  // Unlisted pages leave the navigation.
  if (input.unlisted && !cur.unlisted && rowForPage(doc.site.nav, pageId))
    bodies.push({ op: "nav.update", tree: withoutPage(doc.site.nav, pageId) } as OpBody);
  if (!bodies.length) return null;
  return { label: `Update “${input.title.trim() || page.title}”`, bodies };
}

export function setNav(tree: Nav, label = "Reorder navigation"): Command {
  return { label, bodies: [{ op: "nav.update", tree } as OpBody] };
}
