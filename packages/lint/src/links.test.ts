import {
  allPresets,
  blocksRegistry,
  getPreset,
  presetSection,
  rt,
  type SectionPreset,
  textBlock,
} from "@omniharmonic/openspace-blocks";
import { type Op, transformForRole, validate } from "@omniharmonic/openspace-ops";
import {
  type Block,
  findBrokenLinks,
  type Link,
  type Page,
  resolveInternalLinks,
  type Section,
  type SiteDocument,
  suggestLinkTarget,
  withPages,
} from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { btn, h, healthyDoc, p, page, siteWith, stackSection } from "./__fixtures__/doc";
import { designCheck, publishCheck } from "./index";

const hero = () => getPreset("hero/full-bleed-photo@1") as SectionPreset;
const buttonOf = (s: Section) => s.blocks.find((b) => b.type === "button") as Block;
const links = (s: Section) => {
  const f = buttonOf(s).fields as { link: Link; secondaryLink: Link };
  return [f.link, f.secondaryLink];
};

/** The live-test site: a home page that got the full-bleed hero (links to /book, /retreats). */
function liveTestDoc(extra: Page[] = []) {
  const home = page("Home", "", [hero().build()]);
  const doc = siteWith([home, ...extra]);
  return { doc, home };
}

describe("broken internal links", () => {
  it("finds the preset's example links exactly where `openspace check` reported them", () => {
    const { doc, home } = liveTestDoc();
    const broken = findBrokenLinks(doc);
    expect(broken.map((l) => [l.path.join("."), l.target, l.message])).toEqual([
      ["sections.0.blocks.1.fields.link", "/book", "Link to /book does not lead to any page"],
      [
        "sections.0.blocks.1.fields.secondaryLink",
        "/retreats",
        "Link to /retreats does not lead to any page",
      ],
    ]);
    expect(broken[0]).toMatchObject({
      scope: { kind: "page", page: home.id },
      container: home.id,
      section: home.sections[0]?.id,
      block: home.sections[0]?.blocks[1]?.id,
      field: "link",
      severity: "error",
    });
  });

  it("Design check reports each one as an error on the block, with a fix that picks a page", () => {
    const contact = page("Contact us", "contact", [
      stackSection([textBlock.create({ fields: { content: rt.doc(rt.p("Write to us.")) } })]),
    ]);
    const { doc, home } = liveTestDoc([contact]);
    const issues = designCheck(doc).filter((i) => i.rule === "broken-link");
    expect(issues.map((i) => [i.severity, i.message])).toEqual([
      ["error", "A button on Home links to /book, which isn't a page on your site."],
      ["error", "A button on Home links to /retreats, which isn't a page on your site."],
    ]);
    const first = issues[0];
    expect(first).toMatchObject({
      page: home.id,
      section: home.sections[0]?.id,
      block: home.sections[0]?.blocks[1]?.id,
      autofix: { label: "Link to Contact us instead" },
    });
    // Apply the fix like Studio does: validated ops, then the issue is gone.
    let cur: SiteDocument = doc;
    for (const op of issues.flatMap((i) => i.autofix?.ops ?? [])) {
      const r = validate(cur, op as Op, { registry: blocksRegistry(), trusted: true });
      expect(r.ok).toBe(true);
      if (r.ok) cur = r.doc;
    }
    expect(findBrokenLinks(cur)).toEqual([]);
    expect(links(cur.pages[home.id]?.sections[0] as Section)[0]).toEqual({
      type: "page",
      page: contact.id,
    });
  });

  it("text links that lead nowhere are warnings, not publish blockers", () => {
    const { doc, home } = healthyDoc();
    home.sections[1]?.blocks.push(
      textBlock.create({
        fields: { content: rt.doc(rt.p([rt.link("See the timetable", "/timetable")])) },
      }),
    );
    const issues = designCheck(doc).filter((i) => i.rule === "broken-link");
    expect(issues.map((i) => i.severity)).toEqual(["warning"]);
    const gate = publishCheck(doc);
    expect(gate.ok).toBe(true);
    expect(gate.warnings.map((w) => w.message)).toEqual([
      "A text on Home links to /timetable, which isn't a page on your site.",
    ]);
  });
});

describe("pointing preset links at pages the site has", () => {
  it("keeps links that work, matches words, then a contact-like page, then home", () => {
    const retreats = page("Our retreats", "retreats", []);
    const contact = page("Get in touch", "contact", []);
    const { doc } = liveTestDoc([retreats, contact]);
    expect(suggestLinkTarget(doc, "/retreats")?.page?.id).toBe(retreats.id);
    expect(suggestLinkTarget(doc, "/book-now")?.page?.id).toBe(contact.id);
    const bare = siteWith([page("Home", "", [])]);
    expect(suggestLinkTarget(bare, "/book")?.path).toBe("/");
    const booking = siteWith([page("Home", "", []), page("Booking", "booking", [])]);
    expect(suggestLinkTarget(booking, "/book")?.path).toBe("/booking");
    // Gated pages are never picked.
    const gated = siteWith([
      page("Home", "", []),
      page("Contact", "contact", [], { access: { members: true } }),
    ]);
    expect(suggestLinkTarget(gated, "/book")?.path).toBe("/");
  });

  it("an inserted preset has no dangling links, and Editors may still insert it", () => {
    const retreats = page("Retreats", "retreats", []);
    const { doc: base } = liveTestDoc([retreats]);
    const home = Object.values(base.pages).find((p) => p.slug === "") as Page;
    const doc = withPages(base, [{ ...home, sections: [] }]);
    const built = hero().build();
    const { value: section, changes } = resolveInternalLinks(built, doc);
    // /retreats exists and is kept; /book has no match and no contact page: home.
    expect(changes.map((c) => [c.from, c.to])).toEqual([["/book", "/"]]);
    expect(links(section)).toEqual([
      { type: "page", page: home.id },
      { type: "url", url: "/retreats" },
    ]);
    // Layout and style are untouched: still a preset build for the Editor role check.
    expect(section.layout).toEqual(built.layout);
    expect(section.style).toEqual(built.style);
    const op = {
      op: "section.insert",
      id: "op_1",
      actor: "u",
      ts: 1,
      page: home.id,
      at: "end",
      section,
    } as unknown as Op;
    const decision = transformForRole(op, "editor", [], {
      doc,
      registry: blocksRegistry(),
      presetSection,
    });
    expect(decision.allowed).toBe(true);
    const after = validate(doc, op, { registry: blocksRegistry() });
    expect(after.ok).toBe(true);
    if (after.ok) expect(findBrokenLinks(after.doc)).toEqual([]);
  });

  it("no preset (sections, footers, headers) leaves a broken link once resolved", () => {
    const doc = siteWith([page("Home", "", [])]);
    const bad: string[] = [];
    for (const pr of allPresets) {
      const built = pr.build();
      const { value } = resolveInternalLinks(built, doc);
      const probe: SiteDocument =
        pr.target === "header"
          ? { ...doc, site: { ...doc.site, header: value as SiteDocument["site"]["header"] } }
          : pr.target === "footer"
            ? { ...doc, site: { ...doc.site, footer: value as Section } }
            : withPages(doc, [page("Probe", "probe", [value as Section])]);
      for (const l of findBrokenLinks(probe)) bad.push(`${pr.id}: ${l.target}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("menu entries and buttons to sections (Boulder Foodshed: the header wasn't connected)", () => {
  /** A one-page site whose menu points at #how-it-works… but no section carries those names. */
  function onePager() {
    const cta = btn("Join the waitlist");
    (cta.fields as { link: Link }).link = { type: "url", url: "/#waitlist" };
    const hero = stackSection([h("A weekly basket", 1), cta]);
    const week = {
      ...stackSection([h("How the week works"), p("Three steps.")]),
      label: "Week path",
    };
    const baskets = {
      ...stackSection([h("Pick a size"), p("Small, medium, large.")]),
      label: "Basket sizes",
    };
    const faq = {
      ...stackSection([h("Questions"), p("Is this a CSA?")]),
      label: "Questions",
      anchor: "faq",
    };
    const signup = {
      ...stackSection([h("The waitlist"), p("Join the waitlist.")], "dark"),
      label: "Sign up",
    };
    const home = page("Home", "", [hero, week, baskets, faq, signup] as Section[]);
    const doc = siteWith([home]);
    doc.site.nav = [
      { type: "page", page: home.id, label: "How it works", anchor: "how-it-works" },
      { type: "page", page: home.id, label: "Baskets", anchor: "baskets" },
      { type: "page", page: home.id, label: "Questions", anchor: "questions" },
      { type: "page", page: home.id, label: "Zebras", anchor: "zebras" },
    ];
    return { doc, home };
  }

  it("Design check warns about each one, in plain words, without blocking a publish", () => {
    const { doc } = onePager();
    const issues = designCheck(doc).filter((i) => i.rule === "broken-link");
    expect(issues.map((i) => [i.severity, i.message])).toEqual([
      [
        "warning",
        "Your menu links to “how-it-works” on Home, but no section there is called that.",
      ],
      ["warning", "Your menu links to “baskets” on Home, but no section there is called that."],
      ["warning", "Your menu links to “questions” on Home, but no section there is called that."],
      ["warning", "Your menu links to “zebras” on Home, but no section there is called that."],
      [
        "warning",
        "A button on Home links to “waitlist” on Home, but no section there is called that.",
      ],
    ]);
    expect(issues.map((i) => i.autofix?.label)).toEqual([
      "Connect it to the “Week path” section",
      "Connect it to the “Basket sizes” section",
      "Connect it to the “Questions” section",
      "Link to the top of Home instead",
      "Connect it to the “Sign up” section",
    ]);
    expect(publishCheck(doc).ok).toBe(true);
  });

  it("the fixes name the sections (or point at the section's own name) and the warnings go", () => {
    const { doc, home } = onePager();
    let cur: SiteDocument = doc;
    // Apply the fixes one by one like Studio's "Fix all" does: re-check after each.
    for (let n = 0; n < 10; n++) {
      const next = designCheck(cur).find((i) => i.rule === "broken-link" && i.autofix);
      if (!next) break;
      for (const op of next.autofix?.ops ?? []) {
        const r = validate(cur, op as Op, { registry: blocksRegistry(), trusted: true });
        expect(r.ok, JSON.stringify(op)).toBe(true);
        if (r.ok) cur = r.doc;
      }
    }
    expect(findBrokenLinks(cur)).toEqual([]);
    const sections = cur.pages[home.id]?.sections ?? [];
    expect(sections.map((s) => s.anchor)).toEqual([
      undefined,
      "how-it-works",
      "baskets",
      "faq",
      "waitlist",
    ]);
    // "Questions" already had its own name: the menu entry follows it.
    expect(cur.site.nav.map((n) => (n.type === "page" ? n.anchor : null))).toEqual([
      "how-it-works",
      "baskets",
      "faq",
      undefined,
    ]);
    // An editor may apply them too.
    const ops = designCheck(doc)
      .filter((i) => i.rule === "broken-link")
      .flatMap((i) => i.autofix?.ops ?? []);
    for (const op of ops)
      expect(transformForRole(op as Op, "editor", [], { doc }).allowed, JSON.stringify(op)).toBe(
        true,
      );
  });
});
