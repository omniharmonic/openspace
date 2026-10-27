import { describe, expect, it } from "vitest";
import { IDS, siteFixture } from "./__fixtures__/site";
import type { SiteDocument } from "./document";
import { findBrokenLinks, LinkTargets, resolveInternalLinks, suggestLinkTarget } from "./links";

const doc = (): SiteDocument => siteFixture();

describe("internal links", () => {
  it("knows which addresses lead somewhere (pages, collections, items, files, redirects)", () => {
    const d = doc();
    d.site.redirects = [{ from: "/old-about", to: "/about", status: 301 } as never];
    const t = new LinkTargets(d);
    for (const ok of [
      "/",
      "/about",
      "/about/",
      "/journal/",
      "/journal/page/2",
      "/feed.xml",
      "/old-about",
      "/about#team",
      "/about?x=1",
    ])
      expect(t.pathResolves(ok), ok).toBe(true);
    for (const bad of ["/book", "/retreats", "/journal/nope/extra", "/book-now?plan=a"])
      expect(t.pathResolves(bad), bad).toBe(false);
  });

  it("a valid site has none; every kind of broken link is found with its location", () => {
    expect(findBrokenLinks(doc())).toEqual([]);
    const d = doc();
    d.site.nav.push({ type: "url", label: "Shop", url: "/shop" } as never);
    const home = d.pages[IDS.home];
    const button = home?.sections[0]?.blocks.find((b) => b.id === IDS.button);
    if (!button) throw new Error("fixture");
    button.fields.link = { type: "page", page: "pg_gone000000" };
    const found = findBrokenLinks(d);
    expect(found.map((l) => [l.kind, l.target, l.severity])).toEqual([
      ["url", "/shop", "error"],
      ["page", "pg_gone000000", "error"],
    ]);
    expect(found[1]).toMatchObject({
      scope: { kind: "page", page: IDS.home },
      container: IDS.home,
      section: IDS.hero,
      block: IDS.button,
      field: "link",
      message: "Link to page pg_gone000000 but no such page exists",
    });
  });

  it("points dangling links at a matching page, a contact-like page, or home", () => {
    const d = doc();
    expect(suggestLinkTarget(d, "/about-us")?.page?.id).toBe(IDS.about);
    expect(suggestLinkTarget(d, "/book")?.path).toBe("/");
    const value = {
      link: { type: "url", url: "/book", newTab: true },
      ok: { type: "url", url: "/about" },
      ext: { type: "url", url: "https://example.com/book" },
      body: "See [our story](/story) and [about](/about).",
      text: { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "/timetable" } }] },
    };
    const { value: out, changes } = resolveInternalLinks(value, d);
    expect(out.link).toEqual({ type: "page", page: IDS.home });
    expect(out.ok).toEqual(value.ok);
    expect(out.ext).toEqual(value.ext);
    expect(out.body).toBe("See [our story](/) and [about](/about).");
    expect(out.text.marks[0]?.attrs.href).toBe("/");
    expect(changes.map((c) => c.from)).toEqual(["/book", "/story", "/timetable"]);
    // The input is not modified.
    expect(value.link.url).toBe("/book");
  });
});
