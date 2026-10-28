import { describe, expect, it } from "vitest";
import { IDS, siteFixture } from "./__fixtures__/site";
import type { SiteDocument } from "./document";
import {
  findBrokenLinks,
  LinkTargets,
  pageFragments,
  resolveInternalLinks,
  retargetAnchor,
  suggestAnchorSection,
  suggestLinkTarget,
} from "./links";

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

/** Boulder Foodshed (wave: header not connected): menu entries to sections nobody named. */
function sectionsDoc(): SiteDocument {
  const d = doc();
  const home = d.pages[IDS.home];
  if (!home) throw new Error("fixture");
  const text = (id: string, t: string, level?: number) => ({
    id,
    type: "text",
    v: 1,
    fields: {
      content: {
        type: "doc",
        content: [
          level
            ? { type: "heading", attrs: { level }, content: [{ type: "text", text: t }] }
            : { type: "paragraph", content: [{ type: "text", text: t }] },
        ],
      },
    },
  });
  const section = (id: string, label: string, blocks: unknown[]) =>
    ({ id, label, layout: { mode: "stack", columns: { d: [12] } }, style: {}, blocks }) as never;
  home.sections.push(
    section("sec_weekpath01", "Week path", [
      text("blk_weekpath01", "How the week works", 2),
      text("blk_weekpath02", "From the market stall to your door."),
    ]),
    section("sec_baskets001", "Basket sizes", [text("blk_baskets001", "Pick a size", 2)]),
    section("sec_faq0000001", "Questions beside heading", [
      text("blk_faq0000001", "Good to know", 2),
      text("blk_faq0000002", "Not yet. Join the waitlist and we'll email you."),
    ]),
    section("sec_signup0001", "Centred on dark", [
      text("blk_signup0001", "The waitlist", 2),
      text("blk_signup0002", "Join the waitlist"),
    ]),
  );
  // The hero links down the page (and so is never the target itself).
  const hero = home.sections[0];
  hero?.blocks.push(text("blk_herolink01", "See how the week works") as never);
  const button = hero?.blocks.find((b) => b.id === IDS.button);
  if (button) button.fields.link = { type: "url", url: "/#how-it-works" };
  d.site.nav = [
    { type: "page", page: IDS.home, label: "How it works", anchor: "how-it-works" },
    { type: "page", page: IDS.home, label: "Baskets", anchor: "baskets" },
    { type: "page", page: IDS.home, label: "Questions", anchor: "questions" },
    {
      type: "button",
      label: "Join the waitlist",
      link: { type: "url", url: "/#waitlist" },
      style: "primary",
    },
  ] as SiteDocument["site"]["nav"];
  return d;
}

describe("in-page anchors", () => {
  it("knows what a page can jump to: section anchors and ids, blocks, component ids", () => {
    const d = sectionsDoc();
    const home = d.pages[IDS.home];
    if (!home?.sections[1]) throw new Error("fixture");
    home.sections[1].anchor = "classes";
    d.components = {
      promo: { name: "promo", template: "<div id='signup-box'>{{title}}</div>" } as never,
    };
    home.sections[2]?.blocks.push({
      id: "blk_promo00001",
      type: "component/promo",
      v: 1,
      fields: {},
    } as never);
    const f = pageFragments(d, IDS.home);
    for (const ok of [
      "classes",
      IDS.hero,
      IDS.button,
      `${IDS.button}-q1`,
      "signup-box",
      "main",
      "top",
    ])
      expect(f.has(ok), ok).toBe(true);
    expect(f.has(IDS.grid)).toBe(false); // it has an anchor now: its id isn't its fragment
    expect(f.has("baskets")).toBe(false);
  });

  it("flags menu entries, buttons and text links to sections that don't exist (warnings)", () => {
    const d = sectionsDoc();
    const found = findBrokenLinks(d).filter((l) => l.kind === "anchor");
    expect(found.map((l) => [l.path.join("."), l.target, l.severity])).toEqual([
      ["nav.0", "/#how-it-works", "warning"],
      ["nav.1", "/#baskets", "warning"],
      ["nav.2", "/#questions", "warning"],
      ["nav.3.link", "/#waitlist", "warning"],
      ["sections.0.blocks.1.fields.link", "/#how-it-works", "warning"],
    ]);
    expect(found[0]?.anchor).toEqual({ page: IDS.home, fragment: "how-it-works" });
    expect(found[0]?.message).toMatch(/no section on Home is called “how-it-works”/);
    // Nothing blocks a publish.
    expect(findBrokenLinks(d).filter((l) => l.severity === "error")).toEqual([]);
    // Once the sections carry those anchors, nothing is flagged.
    const home = d.pages[IDS.home];
    if (!home) throw new Error("fixture");
    const anchors: Record<string, string> = {
      sec_weekpath01: "how-it-works",
      sec_baskets001: "baskets",
      sec_faq0000001: "questions",
      sec_signup0001: "waitlist",
    };
    for (const s of home.sections) if (anchors[s.id]) s.anchor = anchors[s.id] as never;
    expect(findBrokenLinks(d)).toEqual([]);
  });

  it("checks rich-text #links on the page they're on and anchor links to sections", () => {
    const d = sectionsDoc();
    d.site.nav = [];
    const home = d.pages[IDS.home];
    const block = home?.sections[1]?.blocks[0];
    if (!block) throw new Error("fixture");
    block.fields.content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "link", attrs: { href: "#nowhere" } }] },
            { type: "text", text: "b", marks: [{ type: "link", attrs: { href: `#${IDS.grid}` } }] },
            { type: "text", text: "c", marks: [{ type: "link", attrs: { href: "/about#team" } }] },
          ],
        },
      ],
    };
    const hero = home?.sections[0]?.blocks.find((b) => b.id === IDS.button);
    if (hero) hero.fields.link = { type: "anchor", section: "sec_gone000000" };
    const found = findBrokenLinks(d).filter((l) => l.kind === "anchor");
    expect(found.map((l) => l.target)).toEqual(["sec_gone000000", "#nowhere", "/about#team"]);
  });

  it("finds the section a dangling anchor means, never the one that links to it", () => {
    const d = sectionsDoc();
    const pick = (f: string) => suggestAnchorSection(d, IDS.home, f)?.id;
    expect(pick("how-it-works")).toBe("sec_weekpath01");
    expect(pick("baskets")).toBe("sec_baskets001");
    expect(pick("questions")).toBe("sec_faq0000001");
    expect(pick("waitlist")).toBe("sec_signup0001");
    expect(pick("zebra-crossing")).toBeUndefined();
  });

  it("points links at another anchor (or the top of the page)", () => {
    const d = sectionsDoc();
    const nav = retargetAnchor(d.site.nav, d, IDS.home, "baskets", "basket-sizes");
    expect(nav.changed).toBe(1);
    expect(nav.value[1]).toMatchObject({ anchor: "basket-sizes", label: "Baskets" });
    const button = retargetAnchor(d.site.nav, d, IDS.home, "waitlist", undefined);
    expect((button.value[3] as { link: unknown }).link).toEqual({ type: "url", url: "/" });
    const text = retargetAnchor(
      { type: "link", attrs: { href: "#questions" } },
      d,
      IDS.home,
      "questions",
      "faq",
      IDS.home,
    );
    expect(text.value.attrs.href).toBe("#faq");
  });
});
