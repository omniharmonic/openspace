import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../block-registry";
import { fromMarkdown } from "../richtext";
import { scopeCss } from "./css";
import {
  type ComponentDefinition,
  ComponentDefinitionSchema,
  checkComponent,
  componentBlockDefinition,
  componentInstances,
  componentNameOf,
  componentSection,
  describeComponentIssues,
  expandComponent,
} from "./definition";
import { checkComponentJs } from "./js";
import { withComponents } from "./registry";
import { checkTemplate, expandTemplate, parseTemplate } from "./template";

const card = (overrides: Partial<ComponentDefinition> = {}): ComponentDefinition => ({
  name: "story-cards",
  label: "Story cards",
  description: "Cards that tell a story.",
  version: 1,
  fields: {
    headline: { kind: "text", maxLength: 80 },
    intro: { kind: "richText", optional: true },
    tone: { kind: "select", options: ["calm", "bold"] },
    accent: { kind: "color", optional: true },
    cta: { kind: "link", optional: true },
    ctaLabel: { kind: "text", optional: true },
    items: {
      kind: "list",
      max: 6,
      itemLabel: "title",
      fields: {
        title: { kind: "text" },
        photo: { kind: "image", optional: true },
      },
    },
  },
  defaults: {
    headline: "Three ways in",
    tone: "calm",
    items: [{ title: "Walk" }, { title: "Swim" }],
  },
  template: `<section class="cards" data-tone="{{tone}}" aria-labelledby="{{@uid}}-h">
  <h2 id="{{@uid}}-h">{{headline}}</h2>
  {{rich intro class="lead"}}
  <ul>{{#each items}}<li style="--i: {{@index}}">{{@number}}. {{title}}{{#if photo}}{{image photo sizes="30vw"}}{{/if}}</li>{{else}}<li>Nothing yet</li>{{/each}}</ul>
  {{#if cta}}{{button cta label=ctaLabel variant="secondary"}}{{/if}}
  {{#if tone == "bold"}}<span>Bold</span>{{else}}<span>Calm</span>{{/if}}
</section>`,
  css: `:scope { color: var(--os-color-text); }
.cards li { animation: rise 1s both; }
@keyframes rise { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .cards li { animation: none } }
@media (max-width: 767px) { .cards ul { display: block } }`,
  ...overrides,
});

describe("template parser", () => {
  it("parses elements, helpers and blocks", () => {
    const r = parseTemplate(card().template);
    expect(r.errors).toEqual([]);
    expect(r.nodes.length).toBeGreaterThan(0);
  });

  it.each([
    ["<script>alert(1)</script>", /Scripts can't go/],
    ['<img src="x.jpg">', /image field/],
    ['<div onclick="x()">x</div>', /event handlers/],
    ["{{{raw}}}", /Raw output/],
    ["<div>{{#if a}}</div>{{/if}}", /appears before|closes/],
    ["<div><span></div>", /closes <span>/],
    ["<marquee>x</marquee>", /isn't one of the elements/],
    ["{{#each}}x{{/each}}", /Use \{\{#each listField\}\}/],
    ['<div class="{{#if a}}x{{/if}}"></div>', /can't go inside an attribute/],
    ["<div>", /never closed/],
  ])("rejects %s", (src, message) => {
    const r = parseTemplate(src);
    const errors = r.errors.length
      ? r.errors
      : checkTemplate(r.nodes, { a: { kind: "boolean" } }).errors;
    expect(errors.map((e) => e.message).join("\n")).toMatch(message);
  });

  it("reports line numbers", () => {
    const r = parseTemplate("<div>\n<p>ok</p>\n<iframe></iframe></div>");
    expect(r.errors[0]?.line).toBe(3);
  });

  it("checks field references and kinds", () => {
    const fields = {
      title: { kind: "text" },
      body: { kind: "richText" },
      cta: { kind: "link" },
      items: { kind: "list", fields: { name: { kind: "text" } } },
    };
    const msgs = (src: string) =>
      checkTemplate(parseTemplate(src).nodes, fields).errors.map((e) => e.message);
    expect(msgs("{{missing}}")[0]).toMatch(/no field called "missing"/);
    expect(msgs("{{rich title}}")[0]).toMatch(/needs a rich text field/);
    expect(msgs("{{items}}")[0]).toMatch(/loop over it/);
    expect(msgs("{{#each items}}{{name}} {{../title}}{{/each}}")).toEqual([]);
    expect(msgs("{{#each items}}{{title}}{{/each}}")[0]).toMatch(/in this list item/);
    expect(msgs("{{@index}}")[0]).toMatch(/only works inside/);
    expect(msgs('<a href="javascript:alert(1)">x</a>')[0]).toMatch(/must be a link field/);
    expect(msgs('<a href="{{href cta}}">x</a>')).toEqual([]);
    expect(msgs('<a href="{{title}}">x</a>')[0]).toMatch(/exactly \{\{href field\}\}/);
    expect(msgs('<div id="hero">x</div>')[0]).toMatch(/@uid/);
    expect(msgs('<div style="color: red">x</div>')[0]).toMatch(/custom properties/);
    expect(msgs('<div style="--x: url(evil)">x</div>')[0]).toMatch(/can't load files/);
    expect(msgs('<div tabindex="3">x</div>')[0]).toMatch(/tabindex/);
    expect(msgs("<button>x</button>")[0]).toMatch(/type="button"/);
    expect(msgs('<a href="/x"><button type="button">x</button></a>')[0]).toMatch(
      /can't be inside a link/,
    );
    expect(msgs('<div data-os-id="x"></div>')[0]).toMatch(/reserved/);
    expect(msgs("{{button cta}}")[0]).toMatch(/needs a label/);
  });

  it("expands with escaping-free data, loops, conditions and specials", () => {
    const c = checkComponent(card());
    if (!c.ok) throw new Error(describeComponentIssues(c.issues).join("\n"));
    const out = expandComponent(
      c.component,
      {
        headline: "Hi <b>there</b>",
        tone: "bold",
        items: [{ title: "A" }, { title: "B" }],
        cta: { type: "url", url: "https://example.com" },
        ctaLabel: "Go",
        intro: fromMarkdown("Hello"),
      },
      "blk_x",
    );
    const json = JSON.stringify(out);
    expect(json).toContain("Hi <b>there</b>"); // raw text, escaped by React on output
    expect(json).toContain('"id":"blk_x-h"');
    expect(json).toContain('"--i":"1"');
    expect(json).toContain('"2",". ","B"');
    expect(json).toContain('"k":"button"');
    expect(json).toContain("Bold");
    expect(json).toContain('"k":"rich"');
    const empty = expandComponent(c.component, { headline: "x", tone: "calm", items: [] }, "u");
    expect(JSON.stringify(empty)).toContain("Nothing yet");
    expect(JSON.stringify(empty)).toContain("Calm");
  });

  it("sanitizes values interpolated into style and class", () => {
    const r = parseTemplate('<div class="a {{v}}" style="--x: {{v}}">x</div>');
    const out = expandTemplate(
      r.nodes,
      { v: 'red; background: url(x) "<' },
      {
        uid: "u",
        plainText: () => "",
      },
    );
    const el = out[0] as { attrs: Record<string, string>; style: Record<string, string> };
    expect(el.style["--x"]).not.toMatch(/[;<"]|url\(/);
    expect(el.attrs.class).not.toMatch(/[;:(<"]/);
  });
});

describe("component CSS", () => {
  it("scopes selectors, :scope and keyframes", () => {
    const r = scopeCss("story-cards", card().css ?? "");
    expect(r.issues).toEqual([]);
    expect(r.css).toContain(".os-c--story-cards{color:var(--os-color-text)}");
    expect(r.css).toContain(
      ".os-c--story-cards .cards li{animation:os-c-story-cards-rise 1s both}",
    );
    expect(r.css).toContain("@keyframes os-c-story-cards-rise{");
    expect(r.css).toContain("@media (max-width: 767px){.os-c--story-cards .cards ul{");
  });

  it.each([
    ["@import url(https://evil.example/x.css);", /@import/],
    ["body { color: red }", /outside the component/],
    [":root { --x: 1 }", /outside the component/],
    [".a { background: url(https://evil.example/t.png) }", /can't be loaded/],
    [".a { width: expression(alert(1)) }", /Scripts/],
    [".a { color: red", /isn't closed/],
    [".a { .b { color: red } }", /Nested rules/],
  ])("rejects %s", (css, message) => {
    expect(
      scopeCss("x", css)
        .issues.map((i) => i.message)
        .join("\n"),
    ).toMatch(message);
  });

  it("allows Google font files and small data images", () => {
    const r = scopeCss(
      "x",
      `@font-face { font-family: X; src: url(https://fonts.gstatic.com/s/x.woff2) }
.a { background-image: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E") }`,
    );
    expect(r.issues).toEqual([]);
  });
});

describe("component JS guard", () => {
  it("accepts DOM-only progressive enhancement", () => {
    expect(
      checkComponentJs(`if (ctx.reducedMotion) return;
const items = root.querySelectorAll("[data-item]");
const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("in", e.isIntersecting)));
items.forEach((el) => io.observe(el));
// fetch() mentioned in a comment is fine
setTimeout(() => root.classList.add("ready"), 10);`),
    ).toEqual([]);
  });

  it.each([
    ['fetch("https://x")', /network/],
    ["new XMLHttpRequest()", /network/],
    ["eval('1')", /eval/],
    ["new Function('x')", /functions from text/],
    ['root.innerHTML = "<b>x</b>"', /Writing HTML/],
    ["import('x')", /load other code/],
    ["localStorage.setItem('a', 1)", /store data/],
    ['window.location = "https://x"', /navigate/],
    ['setTimeout("alert(1)", 1)', /function, not text/],
    ['el.setAttribute("onclick", "x")', /event handlers/],
    ["const s = '</script>'", /<\/script/],
  ])("rejects %s", (src, message) => {
    expect(
      checkComponentJs(src)
        .map((i) => i.message)
        .join("\n"),
    ).toMatch(message);
  });
});

describe("component definitions", () => {
  it("accepts a complete definition", () => {
    const r = ComponentDefinitionSchema.safeParse(card());
    expect(r.success).toBe(true);
  });

  it("explains problems in plain language", () => {
    const r = checkComponent(
      card({
        template: "<div>{{nope}}</div>",
        css: "body{}",
        js: "fetch('x')",
        defaults: { headline: 5 },
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const lines = describeComponentIssues(r.issues).join("\n");
    expect(lines).toMatch(/Template line 1: There's no field called "nope"/);
    expect(lines).toMatch(/CSS line 1: "body" styles outside/);
    expect(lines).toMatch(/JavaScript line 1: fetch/);
    expect(lines).toMatch(/Sample content: headline/);
  });

  it("compiles to a block definition with the component's fields", () => {
    const def = componentBlockDefinition(card());
    expect(def?.type).toBe("component/story-cards");
    expect(Object.keys(def?.meta.fields ?? {})).toContain("items");
    expect(def?.meta.fields.items?.kind).toBe("list");
    const block = def?.create();
    expect(block?.fields.headline).toBe("Three ways in");
    expect(def?.validate({ ...(block as object), fields: { headline: 1 } } as never).success).toBe(
      false,
    );
  });

  it("migrates instances declaratively", () => {
    const v2 = card({
      version: 2,
      fields: { ...card().fields, title: { kind: "text", maxLength: 80 } },
      defaults: { ...card().defaults, title: "Three ways in" },
      migrations: { "1": { rename: { headline: "title" } } },
    });
    // v2 keeps headline too in this test; rename moves the value.
    const def = componentBlockDefinition(v2);
    const migrated = createBlockRegistry(def ? [def] : []).migrate({
      id: "blk_0000000001" as never,
      type: "component/story-cards",
      v: 1,
      fields: { headline: "Old", tone: "calm", items: [] },
    });
    expect(migrated.v).toBe(2);
    expect(migrated.fields.title).toBe("Old");
    expect(migrated.fields.headline).toBeUndefined();
  });

  it("layers components over a base registry and builds sections", () => {
    const base = createBlockRegistry([]);
    const reg = withComponents(base, { "story-cards": card() });
    expect(reg.has("component/story-cards")).toBe(true);
    expect(withComponents(base, { "story-cards": card() }).types()).toContain(
      "component/story-cards",
    );
    const section = componentSection(card(), { colorTheme: "dark" });
    expect(section.preset).toBe("component/story-cards@1");
    expect(section.style.colorTheme).toBe("dark");
    expect(reg.validate(section.blocks[0] as never)).toEqual({ success: true });
    expect(componentNameOf("component/story-cards")).toBe("story-cards");
    expect(componentNameOf("text")).toBeNull();
    const doc = {
      pages: { pg_a: { sections: [section] } },
      site: { footer: { ...section, id: "sec_footer0000", blocks: [] } },
    };
    expect(componentInstances(doc as never, "story-cards")).toHaveLength(1);
  });
});

describe("component CSS false positives", () => {
  it("allows scroll-behavior and similar properties", () => {
    expect(
      scopeCss("x", ".a { scroll-behavior: smooth; overscroll-behavior-x: contain }").issues,
    ).toEqual([]);
  });
});
