/**
 * Import fidelity 3: media objects and thumbnail rows from hand-made HTML, articles split into
 * chapters, Squarespace 7.0 nested rows, WordPress page titles, the content card, and the
 * custom-component generator keeping inline rich text, accent rules and panels on tokens.
 * Fixtures are authored here.
 */
import {
  type Block,
  checkComponent,
  newId,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { find, parseDocument } from "./dom";
import { compareLooks } from "./fidelity/compare";
import { componentFromBlueprint } from "./fidelity/component-gen";
import { lookFromProbe } from "./fidelity/look";
import type { LookProbe, ProbeSection, ProbeText } from "./fidelity/probe";
import { tuneRound } from "./fidelity/tune";
import { parseHtmlPage } from "./html/extract";
import { splitAtHeadings } from "./map/sections";
import { splitFooterLine } from "./map/site";
import { parseLayout } from "./squarespace/page";
import { withPageTitle } from "./wordpress/crawl";

const t = (family: string, size: number, extra: Partial<ProbeText> = {}): ProbeText => ({
  family,
  size,
  lineHeight: 1.4,
  letterSpacing: 0,
  case: "none",
  weight: 400,
  italic: false,
  ...extra,
});

describe("hand-made HTML: media objects and thumbnails", () => {
  const html = `<!doctype html><html><head><title>Me</title></head><body><main>
    <section id="books"><h2>my books</h2>
      <figure><a href="/u"><img width="150" height="240" src="https://x.example/u.png" alt="Useful cover"></a>
        <figcaption><h3><a href="/u">Useful Not True</a> (2024)</h3><p>Doubt everything.</p></figcaption></figure>
      <figure><a href="/h"><img width="150" height="240" src="https://x.example/h.png" alt="How cover"></a>
        <figcaption><h3><a href="/h">How to Live</a> (2021)</h3><p>My masterpiece.</p></figcaption></figure>
    </section>
    <section id="photos"><h2>photos</h2>
      <a href="https://x.example/1-big.jpg"><img width="100" height="100" src="https://x.example/1.jpg" alt="One"></a>
      <a href="https://x.example/2-big.jpg"><img width="100" height="100" src="https://x.example/2.jpg" alt="Two"></a>
      <a href="https://x.example/3-big.jpg"><img width="100" height="100" src="https://x.example/3.jpg" alt="Three"></a>
      <a href="https://x.example/4-big.jpg"><img width="100" height="100" src="https://x.example/4.jpg" alt="Four"></a>
    </section></main></body></html>`;
  const page = parseHtmlPage(html, "https://x.example/");
  const blocks = (i: number) =>
    page.sections[i]?.layout.mode === "classic"
      ? page.sections[i].layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
      : [];

  it("a figure with a heading and words in its caption is a picture at its own size, then the words", () => {
    const b = blocks(0);
    const images = b.filter((x) => x.kind === "image");
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ natural: true, href: "/u" });
    const texts = b.filter((x) => x.kind === "text").map((x) => (x as { html: string }).html);
    expect(texts.join(" ")).toContain("Useful Not True");
    expect(texts.join(" ")).toContain("Doubt everything.");
  });

  it("a row of small linked pictures is one gallery grid", () => {
    const g = blocks(1).find((x) => x.kind === "gallery");
    expect(g).toMatchObject({ kind: "gallery", layout: "grid" });
    expect((g as { images: unknown[] }).images).toHaveLength(4);
  });
});

describe("articles split into chapters", () => {
  const text = (nodes: unknown[]): { block: Block; column: number } => ({
    block: {
      id: newId("blk"),
      type: "text",
      v: 1,
      fields: { content: { type: "doc", content: nodes } },
    } as Block,
    column: 0,
  });
  const h2 = (s: string) => ({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: s }],
  });
  const p = (s: string) => ({ type: "paragraph", content: [{ type: "text", text: s }] });
  const long = "words ".repeat(120);

  it("a long one-column article becomes one section per top-level heading", () => {
    const parts = splitAtHeadings([text([p(long), h2("One"), p(long), h2("Two"), p(long)])]);
    expect(parts).toHaveLength(3);
    const first = parts[1]?.[0]?.block.fields.content as { content: { type: string }[] };
    expect(first.content[0]?.type).toBe("heading");
    // Ids stay unique.
    const ids = parts.flat().map((x) => x.block.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a short run stays one section", () => {
    expect(splitAtHeadings([text([h2("One"), p("a"), h2("Two"), p("b")])])).toHaveLength(1);
  });

  it("a media object's picture moves with the heading under it", () => {
    const img = {
      block: {
        id: newId("blk"),
        type: "image",
        v: 1,
        fields: { image: { src: "https://x.example/a.png", alt: "" }, size: "original" },
      } as Block,
      column: 0,
    };
    const img2 = { ...img, block: { ...img.block, id: newId("blk") } };
    const h3 = (s: string) => ({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: s }],
    });
    const parts = splitAtHeadings([
      text([h2("my books")]),
      img,
      text([h3("A"), p("blurb")]),
      img2,
      text([h3("B"), p("blurb")]),
      { ...img, block: { ...img.block, id: newId("blk") } },
      text([h3("C"), p("blurb")]),
    ]);
    expect(parts.length).toBe(4);
    expect(parts[1]?.[0]?.block.type).toBe("image");
    expect(parts[2]?.[0]?.block.type).toBe("image");
  });
});

describe("Squarespace 7.0: a nested row keeps its columns", () => {
  it("heading | text rows inside the page's single column stay side by side", () => {
    const html = `<div class="sqs-layout"><div class="row sqs-row"><div class="col sqs-col-12 span-12">
      <div class="sqs-block html-block"><div class="sqs-block-content"><h2>Template Features</h2></div></div>
      <div class="row sqs-row">
        <div class="col sqs-col-4 span-4"><div class="sqs-block html-block"><div class="sqs-block-content"><h3>BANNER AREA</h3></div></div></div>
        <div class="col sqs-col-8 span-8"><div class="sqs-block html-block"><div class="sqs-block-content"><p>The banner sits at the top.</p></div></div></div>
      </div>
      <div class="sqs-block html-block"><div class="sqs-block-content"><p>After the row.</p></div></div>
    </div></div></div>`;
    const layout = find(parseDocument(html), (e) =>
      (e.attrs ?? []).some((a) => a.name === "class" && a.value === "sqs-layout"),
    );
    const rows = parseLayout(layout as never);
    expect(rows.map((r) => r.columns.map((c) => c.span))).toEqual([[12], [4, 8], [12]]);
  });
});

describe("WordPress: classic themes show the page title", () => {
  it("adds the title as the page's Heading 1 when the content has none", () => {
    const out = withPageTitle(
      [
        {
          theme: "",
          layout: {
            mode: "classic",
            rows: [{ columns: [{ span: 12, blocks: [{ kind: "text", html: "<p>Hi</p>" }] }] }],
          },
        },
      ],
      "Contact",
      true,
    );
    const first =
      out[0]?.layout.mode === "classic" ? out[0].layout.rows[0]?.columns[0]?.blocks[0] : undefined;
    expect(first).toMatchObject({ kind: "heading", text: "Contact", level: 1 });
    expect(withPageTitle([], "Contact", false)).toEqual([]);
  });
});

describe("the content card", () => {
  it("sections on an inset raised panel over another page color become a card surface", () => {
    const s = (i: number): ProbeSection => ({
      index: i,
      top: 80 + i * 600,
      height: 500,
      left: 514,
      width: 825,
      raised: true,
      background: "#ffffff",
      columns: 1,
      italicLines: 0,
      text: "x",
      textWidth: 660,
      body: t("Noto Serif", 19),
    });
    const probe: LookProbe = {
      url: "https://x.example/",
      viewport: 1440,
      title: "x",
      presets: { body: t("Noto Serif", 19) },
      layout: {},
      sections: [s(0), s(1)],
      height: 2000,
      pageBackground: "#e9f2f9",
    };
    const look = lookFromProbe(probe);
    expect(look?.layout).toMatchObject({
      surface: "card",
      pageBackground: "#e9f2f9",
      contentWidth: 664,
    });
    const flat = lookFromProbe({
      ...probe,
      sections: [{ ...s(0), left: 0, width: 1440, raised: false }],
    });
    expect(flat?.layout.surface).toBeUndefined();
  });
});

describe("components keep rich text, rules and panels on tokens", () => {
  it("links and emphasis inside a paragraph are a rich text field; rules and panels use theme colors", () => {
    const section: ProbeSection = {
      index: 0,
      top: 0,
      height: 400,
      background: "#ffffff",
      columns: 1,
      italicLines: 0,
      text: "x",
      blueprint: [
        {
          kind: "heading",
          level: 2,
          text: "Read more",
          box: { x: 200, y: 40, w: 600, h: 40 },
          style: { ...t("Serif", 32), color: "#111111" },
        },
        { kind: "rule", box: { x: 200, y: 90, w: 40, h: 2 }, color: "#b0562f" },
        {
          kind: "text",
          text: "See the foreign publishers of my books.",
          runs: [
            { t: "See " },
            { t: "the foreign publishers", href: "https://sive.example/fp" },
            { t: " of my " },
            { t: "books", i: 1 },
            { t: "." },
          ],
          box: { x: 200, y: 110, w: 600, h: 30 },
          style: { ...t("Georgia", 20), color: "#222222" },
        },
        {
          kind: "panel",
          box: { x: 180, y: 20, w: 660, h: 140 },
          color: "#f4f1ea",
          border: { width: 1, color: "#dddddd" },
          radius: 4,
        },
      ],
    };
    const gen = componentFromBlueprint({
      name: "imported-home-2",
      label: "Read more",
      section,
      roles: { heading: "Serif", body: "Georgia" },
      colors: {
        text: "#222222",
        heading: "#111111",
        accent: "#b0562f",
        surface: "#f4f1ea",
        border: "#dddddd",
      },
      link: () => undefined,
      origin: "https://sive.example",
    });
    expect(gen).toBeDefined();
    const def = gen?.def as NonNullable<typeof gen>["def"];
    const check = checkComponent(def);
    expect(check.ok ? [] : check.issues).toEqual([]);
    const rich = Object.entries(def.fields).find(([, f]) => f.kind === "richText");
    expect(rich).toBeDefined();
    const doc = gen?.fields[rich?.[0] as string] as {
      content: {
        content: { text: string; marks?: { type: string; attrs?: { href: string } }[] }[];
      }[];
    };
    const nodes = doc.content[0]?.content ?? [];
    expect(nodes.find((n) => n.text === "the foreign publishers")?.marks).toEqual([
      { type: "link", attrs: { href: "/fp" } },
    ]);
    expect(nodes.find((n) => n.text === "books")?.marks).toEqual([{ type: "italic" }]);
    expect(def.template).toContain("{{rich ");
    expect(def.template).toContain("<hr");
    expect(def.css).toContain("border-top: 2px solid var(--os-color-accent)");
    expect(def.css).toContain("background: var(--os-color-surface)");
    expect(def.css).toContain("solid var(--os-color-border)");
    expect(def.css).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("a page title in a wrapper of its own", () => {
  it("opens the content below it instead of sitting alone in a section", () => {
    const html = `<!doctype html><html><head><title>About</title></head><body><main><article>
      <header class="entry-header"><h1 class="entry-title">About</h1></header>
      <div class="entry-content"><p>The foundation supports open source publishing for everyone, everywhere, always.</p>
      <p>A second paragraph so this reads as an article body with some length to it.</p></div>
    </article></main></body></html>`;
    const page = parseHtmlPage(html, "https://x.example/");
    expect(page.sections).toHaveLength(1);
    const first =
      page.sections[0]?.layout.mode === "classic"
        ? page.sections[0].layout.rows[0]?.columns[0]?.blocks[0]
        : undefined;
    expect(JSON.stringify(first)).toContain("About");
  });
});

describe("tuning: headings, banner heights and page widths", () => {
  const doc = (): SiteDocument =>
    ({
      config: {},
      site: { title: "x" },
      styles: {
        choices: {
          palette: { brand: "#b8714a", neutral: "warm", contrast: "standard" },
          pairing: "classic-editorial",
          density: "comfortable",
          shape: "soft",
          buttons: "solid",
          motion: "subtle",
          imageTreatment: "none",
          layout: { contentWidth: 1200 },
        },
      },
      pages: {
        pg_home: {
          id: "pg_home",
          title: "Home",
          slug: "",
          sections: [
            {
              id: "sec_a",
              layout: { mode: "stack", columns: { d: [12] } },
              style: {
                colorTheme: "dark",
                background: { type: "image", src: "media/a.jpg" },
              },
              blocks: [
                { id: "blk_t", type: "heading", v: 1, fields: { text: "Press", level: "h2" } },
              ],
            },
            {
              id: "sec_b",
              layout: { mode: "stack", columns: { d: [12] }, width: "wide" },
              style: { colorTheme: "light" },
              blocks: [
                {
                  id: "blk_u",
                  type: "text",
                  v: 1,
                  fields: { content: { type: "doc", content: [] } },
                },
              ],
            },
          ],
        },
      },
      collections: {},
      collectionConfigs: {},
      media: {},
    }) as unknown as SiteDocument;
  const section = (
    heading: ProbeText & { text: string },
    extra: Partial<ProbeSection> = {},
  ): ProbeSection => ({
    index: 0,
    top: 0,
    height: 500,
    background: "#111111",
    heading: { ...heading, tag: "h2", left: 120 },
    columns: 1,
    italicLines: 0,
    text: heading.text,
    ...extra,
  });
  const probe = (
    viewport: number,
    head: ProbeText,
    s: Partial<ProbeSection>,
    layout: LookProbe["layout"] = {},
  ): LookProbe => ({
    url: "https://x.example/",
    viewport,
    title: "",
    presets: {
      h2: t("Serif", viewport > 700 ? 60 : 40),
      eyebrow: t("Sans", 12, { case: "uppercase", letterSpacing: 0.3 }),
    },
    layout,
    sections: [
      section({ ...head, text: "Press" }, { backgroundImage: true, ...s }),
      {
        ...section({ ...t("Serif", 60), text: "Words" }),
        index: 1,
        background: "#ffffff",
        backgroundImage: false,
      },
    ],
    height: 3000,
  });

  it("sets a label-like heading at the eyebrow preset, sizes a banner like the original, narrows a page's sections", () => {
    const label = t("Sans", 12, { case: "uppercase", letterSpacing: 0.3 });
    const original = probe(
      1440,
      label,
      { height: 500, contentTop: 200, contentBottom: 260 },
      { contentWidth: 1200 },
    );
    const imported = probe(
      1440,
      t("Serif", 60),
      { height: 900, contentTop: 300, contentBottom: 360 },
      { contentWidth: 1376 },
    );
    const m = [
      {
        path: "/",
        viewport: 1440,
        original,
        imported,
        comparison: compareLooks(original, imported, "/"),
      },
    ];
    const h = tuneRound(doc(), m, ["headings"]);
    expect(h.doc.pages.pg_home?.sections[0]?.blocks[0]?.style).toEqual({
      typography: { heading: "eyebrow" },
    });
    const tall = tuneRound(doc(), m, ["heights"]);
    expect(tall.doc.pages.pg_home?.sections[0]?.style).toMatchObject({ minHeight: { d: "500px" } });
    const w = tuneRound(doc(), m, ["widths"]);
    expect(w.doc.pages.pg_home?.sections[1]?.layout.width).toBeUndefined();
    expect(w.changes.join(" ")).toContain("content width");
  });
});

describe("a one-line footer", () => {
  it("becomes that many columns of small labels", () => {
    const p = (s: string) => ({ type: "paragraph", content: [{ type: "text", text: s }] });
    const footer = {
      id: "sec_f",
      layout: { mode: "stack", columns: { d: [12] } },
      style: { colorTheme: "dark" },
      blocks: [
        {
          id: "blk_f",
          type: "text",
          v: 1,
          fields: { content: { type: "doc", content: [p("NAME"), p("LINKS"), p("© 2026")] } },
        },
      ],
    } as unknown as Section;
    splitFooterLine(footer, 3, true);
    expect(footer.layout).toMatchObject({ columns: { d: [4, 4, 4], m: [12] } });
    expect(footer.blocks.map((b) => b.column)).toEqual([0, 1, 2]);
    expect(footer.blocks.map((b) => (b.style as { align?: { d: string } }).align?.d)).toEqual([
      "start",
      "center",
      "end",
    ]);
    expect(JSON.stringify(footer.blocks[0]?.fields)).toContain('"preset":"eyebrow"');
    expect(new Set(footer.blocks.map((b) => b.id)).size).toBe(3);
  });
});
