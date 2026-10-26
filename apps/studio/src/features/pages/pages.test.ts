import { blocksRegistry } from "@openspace/blocks";
import { validateDocument } from "@openspace/ops";
import type { NavItem, SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { devSiteDocument } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import {
  buildNav,
  flattenNav,
  moveRow,
  type Nav,
  nudgeRow,
  pagesInNav,
  projectMove,
  removeRow,
  setFolder,
  withoutPage,
  withPage,
} from "./navTree";
import {
  createPage,
  deletePage,
  duplicatePage,
  normalizeSlug,
  pageSettingsOf,
  slugify,
  slugProblem,
  updatePageSettings,
} from "./pageOps";
import { PAGE_TEMPLATES, pageTemplate } from "./pageTemplates";

const P = (n: number) => `pg_${String(n).padStart(10, "0")}`;
const page = (n: number): NavItem => ({ type: "page", page: P(n) as never });
const nav: Nav = [
  page(1),
  { type: "folder", label: "Classes", items: [page(2) as never, page(3) as never] },
  page(4),
  { type: "button", label: "Book", link: { type: "url", url: "/book" }, style: "primary" },
];
const ids = (n: Nav) =>
  flattenNav(n).map(
    (r) =>
      `${"  ".repeat(r.depth)}${r.item.type === "page" ? r.item.page.slice(-1) : r.item.type === "folder" ? r.item.label : r.item.type}`,
  );

describe("navigation tree", () => {
  it("flattens and rebuilds losslessly", () => {
    const rows = flattenNav(nav);
    expect(rows.map((r) => r.id)).toEqual(["0", "1", "1.0", "1.1", "2", "3"]);
    expect(buildNav(rows)).toEqual(nav);
  });

  it("moves a page into a folder by dragging right under it", () => {
    const rows = flattenNav(nav);
    // Page 4 dragged onto the folder's last child, pointer offset one level in.
    const proj = projectMove(rows, "2", "1.1", 1);
    expect(proj).toMatchObject({ depth: 1, maxDepth: 1 });
    // Dropped onto the last child: it takes that child's place (dnd-kit order).
    expect(ids(moveRow(rows, "2", "1.1", proj.depth))).toEqual([
      "1",
      "Classes",
      "  2",
      "  4",
      "  3",
      "button",
    ]);
  });

  it("moves a folder with its children and keeps folders/buttons top level", () => {
    const rows = flattenNav(nav);
    expect(projectMove(rows, "1", "0", 1).depth).toBe(0);
    expect(ids(moveRow(rows, "1", "0", 0))).toEqual(["Classes", "  2", "  3", "1", "4", "button"]);
    expect(projectMove(rows, "3", "1.0", 1).depth).toBe(0);
  });

  it("drags a child out of its folder", () => {
    const rows = flattenNav(nav);
    const proj = projectMove(rows, "1.0", "2", 0);
    expect(proj.depth).toBe(0);
    expect(ids(moveRow(rows, "1.0", "2", 0))).toEqual(["1", "Classes", "  3", "4", "2", "button"]);
  });

  it("nudges rows past their siblings with the keyboard", () => {
    expect(ids(nudgeRow(nav, "2", -1))).toEqual(["1", "4", "Classes", "  2", "  3", "button"]);
    expect(ids(nudgeRow(nav, "0", 1))).toEqual(["Classes", "  2", "  3", "1", "4", "button"]);
    expect(ids(nudgeRow(nav, "1.0", 1))).toEqual(["1", "Classes", "  3", "  2", "4", "button"]);
    // At the edge of a folder or the list, nothing moves.
    expect(nudgeRow(nav, "1.0", -1)).toEqual(nav);
    expect(nudgeRow(nav, "0", -1)).toEqual(nav);
  });

  it("puts pages in and out of folders", () => {
    expect(ids(setFolder(nav, "2", 1))).toEqual(["1", "Classes", "  2", "  3", "  4", "button"]);
    expect(ids(setFolder(nav, "1.0", null))).toEqual(["1", "Classes", "  3", "2", "4", "button"]);
  });

  it("removes folders (children move up) and page links", () => {
    expect(ids(removeRow(nav, "1"))).toEqual(["1", "2", "3", "4", "button"]);
    expect(ids(withoutPage(nav, P(2)))).toEqual(["1", "Classes", "  3", "4", "button"]);
    expect(pagesInNav(nav)).toEqual(new Set([P(1), P(2), P(3), P(4)]));
  });

  it("adds new pages before the trailing button, or after a sibling", () => {
    expect(ids(withPage(nav, P(5)))).toEqual(["1", "Classes", "  2", "  3", "4", "5", "button"]);
    expect(ids(withPage(nav, P(5), P(2)))).toEqual([
      "1",
      "Classes",
      "  2",
      "  5",
      "  3",
      "4",
      "button",
    ]);
  });
});

function session() {
  const doc = devSiteDocument({
    siteId: "st_0000000000",
    name: "Maya Yoga",
    url: "https://maya.example/",
  });
  return createEditorStore({ doc, actor: "user:test" });
}

const valid = (doc: SiteDocument) => {
  const r = validateDocument(doc, { registry: blocksRegistry() });
  return r.ok && blocksRegistry().validateDocument(doc).length === 0 ? { ok: true } : r;
};

describe("page commands (ops)", () => {
  it("adds every page template as a valid page linked in the navigation", () => {
    const store = session();
    for (const t of PAGE_TEMPLATES) {
      const cmd = createPage(store.getState().doc, t);
      const res = store.getState().commit(cmd.bodies, { label: cmd.label });
      expect(res.ok, `${t.id}: ${JSON.stringify(!res.ok && res.errors)}`).toBe(true);
      const doc = store.getState().doc;
      const created = doc.pages[cmd.pageId as keyof SiteDocument["pages"]];
      expect(created?.sections.length).toBeGreaterThan(0);
      expect(pagesInNav(doc.site.nav).has(cmd.pageId)).toBe(true);
    }
    expect(valid(store.getState().doc)).toMatchObject({ ok: true });
    // Undo removes the last page and its nav entry.
    store.getState().undo();
    expect(Object.keys(store.getState().doc.pages)).toHaveLength(3 + PAGE_TEMPLATES.length - 1);
  });

  it("gives clashing pages a free address", () => {
    const store = session();
    const about = pageTemplate("about");
    if (!about) throw new Error("template");
    const a = createPage(store.getState().doc, about);
    store.getState().commit(a.bodies);
    const b = createPage(store.getState().doc, about);
    store.getState().commit(b.bodies);
    const slugs = Object.values(store.getState().doc.pages).map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("duplicates a page with fresh ids next to the original, and deletes pages", () => {
    const store = session();
    const doc = store.getState().doc;
    const target = Object.values(doc.pages).find((p) => p.slug !== "");
    if (!target) throw new Error("page");
    const dup = duplicatePage(doc, target.id);
    expect(dup).not.toBeNull();
    expect(store.getState().commit(dup?.bodies ?? []).ok).toBe(true);
    const after = store.getState().doc;
    const copy = after.pages[dup?.pageId as keyof SiteDocument["pages"]];
    expect(copy?.title).toBe(`${target.title} (copy)`);
    expect(copy?.sections[0]?.id).not.toBe(target.sections[0]?.id);
    expect(valid(after)).toMatchObject({ ok: true });

    const del = deletePage(after, dup?.pageId as string);
    expect(store.getState().commit(del?.bodies ?? []).ok).toBe(true);
    expect(pagesInNav(store.getState().doc.site.nav).has(dup?.pageId as string)).toBe(false);
    // The home page can't be deleted.
    const home = Object.values(after.pages).find((p) => p.slug === "");
    expect(deletePage(after, home?.id as string)).toBeNull();
  });

  it("saves page settings: title, address with redirect, SEO, unlisted and gating", () => {
    const store = session();
    const doc = store.getState().doc;
    const target = Object.values(doc.pages).find((p) => p.slug !== "");
    if (!target) throw new Error("page");
    const oldSlug = target.slug;
    const cmd = updatePageSettings(doc, target.id, {
      ...pageSettingsOf(target),
      title: "Our classes",
      slug: "/Our Classes/",
      seoTitle: "Yoga classes in Portland",
      seoDescription: "Small classes for every body.",
      noindex: true,
      unlisted: true,
      access: "password",
      redirectOld: true,
    });
    const res = store.getState().commit(cmd?.bodies ?? [], { label: cmd?.label });
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
    const after = store.getState().doc;
    const p = after.pages[target.id];
    expect(p).toMatchObject({
      title: "Our classes",
      slug: "our-classes",
      hidden: true,
      access: { password: true },
      seo: {
        title: "Yoga classes in Portland",
        description: "Small classes for every body.",
        noindex: true,
      },
    });
    expect(after.site.redirects).toContainEqual({
      from: `/${oldSlug}`,
      to: "/our-classes",
      status: 301,
    });
    expect(pagesInNav(after.site.nav).has(target.id)).toBe(false);

    // Clearing SEO again drops the fields; nothing else changes.
    const back = updatePageSettings(after, target.id, {
      ...pageSettingsOf(p as never),
      seoTitle: "",
      seoDescription: "",
      noindex: false,
      access: "public",
      redirectOld: false,
    });
    expect(store.getState().commit(back?.bodies ?? []).ok).toBe(true);
    const cleared = store.getState().doc.pages[target.id];
    expect(cleared?.seo).toBeUndefined();
    expect(cleared?.access).toBeUndefined();
    expect(
      updatePageSettings(store.getState().doc, target.id, {
        ...pageSettingsOf(cleared as never),
        redirectOld: false,
      }),
    ).toBeNull();
  });

  it("saves and clears per-page head and footer code (M-8)", () => {
    const store = session();
    const doc = store.getState().doc;
    const target = Object.values(doc.pages).find((p) => p.slug !== "");
    if (!target) throw new Error("page");
    const cmd = updatePageSettings(doc, target.id, {
      ...pageSettingsOf(target),
      headCode: '<link rel="preconnect" href="https://cal.com">',
      footerCode: '<script src="https://cal.com/embed.js" defer></script>',
      redirectOld: false,
    });
    expect(store.getState().commit(cmd?.bodies ?? []).ok).toBe(true);
    const p = store.getState().doc.pages[target.id];
    expect(p?.headInjection).toContain("cal.com");
    expect(p?.footerInjection).toContain("embed.js");
    // Leaving code undefined (non-designers) never touches it.
    expect(
      updatePageSettings(store.getState().doc, target.id, {
        ...pageSettingsOf(p as never),
        headCode: undefined,
        footerCode: undefined,
        redirectOld: false,
      }),
    ).toBeNull();
    const clear = updatePageSettings(store.getState().doc, target.id, {
      ...pageSettingsOf(p as never),
      headCode: "  ",
      footerCode: "",
      redirectOld: false,
    });
    expect(store.getState().commit(clear?.bodies ?? []).ok).toBe(true);
    const cleared = store.getState().doc.pages[target.id];
    expect(cleared?.headInjection).toBeUndefined();
    expect(cleared?.footerInjection).toBeUndefined();
  });

  it("members-only pages can be limited to membership plans", () => {
    const store = session();
    const doc = store.getState().doc;
    const target = Object.values(doc.pages).find((p) => p.slug !== "");
    if (!target) throw new Error("page");
    const cmd = updatePageSettings(doc, target.id, {
      ...pageSettingsOf(target),
      access: "members",
      tiers: ["tier_patron", "tier_gold", "tier_gold"],
      redirectOld: false,
    });
    expect(store.getState().commit(cmd?.bodies ?? []).ok).toBe(true);
    const gated = store.getState().doc.pages[target.id];
    expect(gated?.access).toEqual({ members: true, tiers: ["tier_gold", "tier_patron"] });
    expect(pageSettingsOf(gated as never).tiers).toEqual(["tier_gold", "tier_patron"]);
    // Every member again.
    const open = updatePageSettings(store.getState().doc, target.id, {
      ...pageSettingsOf(gated as never),
      tiers: [],
      redirectOld: false,
    });
    expect(store.getState().commit(open?.bodies ?? []).ok).toBe(true);
    expect(store.getState().doc.pages[target.id]?.access).toEqual({ members: true });
  });

  it("duplicates a page without its own code for editors", () => {
    const store = session();
    const doc = store.getState().doc;
    const target = Object.values(doc.pages).find((p) => p.slug !== "");
    if (!target) throw new Error("page");
    const withCode = {
      ...doc,
      pages: { ...doc.pages, [target.id]: { ...target, headInjection: "<meta name=x>" } },
    } as typeof doc;
    const page = (cmd: ReturnType<typeof duplicatePage>) =>
      (cmd?.bodies[0] as { page: { headInjection?: string } } | undefined)?.page;
    expect(page(duplicatePage(withCode, target.id))?.headInjection).toBe("<meta name=x>");
    expect(page(duplicatePage(withCode, target.id, { keepCode: false }))?.headInjection).toBe(
      undefined,
    );
  });

  it("explains address problems in plain words", () => {
    const doc = session().getState().doc;
    const other = Object.values(doc.pages).find((p) => p.slug !== "");
    expect(slugProblem(doc, "Bad Slug")).toMatch(/lowercase/);
    expect(slugProblem(doc, other?.slug as string)).toMatch(/already uses/);
    expect(slugProblem(doc, other?.slug as string, other?.id)).toBeNull();
    expect(slugProblem(doc, "")).toMatch(/home page/);
    expect(slugify("Our Story & Team!")).toBe("our-story-and-team");
    expect(normalizeSlug("/Retreats/Spring 2027/")).toBe("retreats/spring-2027");
  });
});
