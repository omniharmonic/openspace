import {
  type ComponentDefinition,
  componentSection,
  createBlockRegistry,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { stampOp } from "./__fixtures__/arbitrary";
import { IDS, siteFixture } from "./__fixtures__/site";
import { apply } from "./apply";
import { diff } from "./diff";
import { invert } from "./invert";
import type { Op, OpBody } from "./ops";
import { deepEqual } from "./paths";
import { rebase } from "./rebase";
import { transformForRole } from "./roles";
import { summarize } from "./summarize";
import { validate, validateAll, validateDocument } from "./validate";

const home = IDS.home as `pg_${string}`;

const quote = (over: Partial<ComponentDefinition> = {}): ComponentDefinition => ({
  name: "pull-quote",
  label: "Pull quote",
  version: 1,
  fields: {
    quote: { kind: "text", maxLength: 200, multiline: true },
    author: { kind: "text", optional: true },
  },
  defaults: { quote: "Slow down; breathe." },
  template: `<figure class="pq"><blockquote>{{quote}}</blockquote>{{#if author}}<figcaption>{{author}}</figcaption>{{/if}}</figure>`,
  css: `.pq { font-family: var(--os-font-heading); color: var(--os-color-heading); }`,
  section: { width: "narrow" },
  ...over,
});

function accept(doc: SiteDocument, body: OpBody, registry = createBlockRegistry([])) {
  const op = stampOp(body);
  const r = validate(doc, op, { registry });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  expect(deepEqual(apply(r.doc, invert(doc, op)), doc)).toBe(true);
  return { doc: r.doc, op };
}

function withQuote() {
  const doc = siteFixture();
  const a = accept(doc, { op: "component.upsert", component: quote() });
  const section = componentSection(quote());
  const b = accept(a.doc, { op: "section.insert", page: home, at: "end", section });
  return { doc: b.doc, section, blockId: section.blocks[0]?.id as string };
}

describe("component ops", () => {
  it("upserts a definition, inserts an instance and edits its fields", () => {
    const { doc, blockId } = withQuote();
    expect(doc.components?.["pull-quote"]?.label).toBe("Pull quote");
    const edit = accept(doc, {
      op: "block.update",
      page: home,
      block: blockId as never,
      set: { quote: "A new line", author: "Maya" },
    });
    expect(validateDocument(edit.doc).ok).toBe(true);
    const bad = validate(
      edit.doc,
      stampOp({ op: "block.update", page: home, block: blockId as never, set: { quote: 42 } }),
    );
    expect(bad.ok).toBe(false);
  });

  it("validates instances even without a block library registry", () => {
    const { doc, blockId } = withQuote();
    const r = validate(
      doc,
      stampOp({ op: "block.update", page: home, block: blockId as never, set: { nope: 1 } }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects instances of a component the site doesn't have", () => {
    const doc = siteFixture();
    const r = validate(
      doc,
      stampOp({ op: "section.insert", page: home, at: "end", section: componentSection(quote()) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toMatch(/no component called "pull-quote"/);
  });

  it("rejects invalid definitions with plain messages", () => {
    const r = validate(
      siteFixture(),
      stampOp({
        op: "component.upsert",
        component: quote({ template: "<script>x</script>" }),
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r.errors)).toMatch(/Scripts can't go in a template/);
  });

  it("refuses definition changes that would break instances, unless migrated in the same step", () => {
    const { doc, blockId } = withQuote();
    const v2 = quote({
      version: 2,
      fields: { text: { kind: "text", maxLength: 200, multiline: true } },
      defaults: { text: "Slow down; breathe." },
      template: "<blockquote>{{text}}</blockquote>",
      migrations: { "1": { rename: { quote: "text" }, remove: ["author"] } },
    });
    const breaking = validate(doc, stampOp({ op: "component.upsert", component: v2 }));
    expect(breaking.ok).toBe(false);
    const migrated = accept(doc, {
      op: "component.upsert",
      component: v2,
      instances: { [blockId]: { v: 2, fields: { text: "Slow down; breathe." } } },
    });
    expect(validateDocument(migrated.doc).ok).toBe(true);
  });

  it("refuses deleting a component that is still used; deletes it once unused", () => {
    const { doc, section } = withQuote();
    expect(validate(doc, stampOp({ op: "component.delete", name: "pull-quote" })).ok).toBe(false);
    const gone = accept(doc, { op: "section.delete", page: home, section: section.id });
    const del = accept(gone.doc, { op: "component.delete", name: "pull-quote" });
    expect(del.doc.components).toBeUndefined();
  });

  it("only owners and designers can change component code; editors edit fields", () => {
    const { doc, blockId, section } = withQuote();
    const upsert = stampOp({ op: "component.upsert", component: quote({ label: "Changed" }) });
    expect(transformForRole(upsert, "designer", [], { doc }).allowed).toBe(true);
    const editor = transformForRole(upsert, "editor", [], { doc });
    expect(editor.allowed).toBe(false);
    if (!editor.allowed) expect(editor.reason).toMatch(/owners and designers/);
    expect(
      transformForRole(stampOp({ op: "component.delete", name: "pull-quote" }), "contributor", [], {
        doc,
      }).allowed,
    ).toBe(false);
    const field = stampOp({
      op: "block.update",
      page: home,
      block: blockId as never,
      set: { quote: "Edited by an editor" },
    });
    expect(transformForRole(field, "editor", [], { doc }).allowed).toBe(true);
    // Locked: text fields of the component still count as content.
    expect(
      transformForRole(field, "editor", [section.id], {
        doc,
        registry: createBlockRegistry([]),
      }).allowed,
    ).toBe(true);
    // Editors may insert a section of an existing component, built as the gallery builds it.
    const insert = stampOp({
      op: "section.insert",
      page: home,
      at: "end",
      section: componentSection(quote()),
    });
    expect(transformForRole(insert, "editor", [], { doc }).allowed).toBe(true);
    const restyled = componentSection(quote());
    restyled.layout = { mode: "stack", columns: { d: [6, 6] } };
    expect(
      transformForRole(
        stampOp({ op: "section.insert", page: home, at: "end", section: restyled }),
        "editor",
        [],
        { doc },
      ).allowed,
    ).toBe(false);
  });

  it("diffs file edits into component ops (definition first, instances migrated)", () => {
    const { doc, blockId } = withQuote();
    const after: SiteDocument = structuredClone(doc);
    const def = quote({ label: "Big quote", css: ".pq { font-size: var(--os-type-h2-size) }" });
    after.components = { "pull-quote": def };
    const ops = diff(doc, after);
    expect(ops.map((o) => o.op)).toEqual(["component.upsert"]);
    const r = validateAll(doc, ops);
    expect(r.ok).toBe(true);
    // Removing the section and the component deletes the component last.
    const bare: SiteDocument = structuredClone(doc);
    const page = bare.pages[home];
    if (page) page.sections = page.sections.filter((s) => !s.blocks.some((b) => b.id === blockId));
    delete bare.components;
    const ops2 = diff(doc, bare);
    expect(ops2.at(-1)?.op).toBe("component.delete");
    expect(validateAll(doc, ops2).ok).toBe(true);
  });

  it("summarizes and rebases component edits", () => {
    const { doc } = withQuote();
    const a = stampOp({ op: "component.upsert", component: quote({ label: "A" }) }, "ana", 1);
    const b = stampOp({ op: "component.upsert", component: quote({ label: "B" }) }, "bo", 2);
    expect(summarize([a], doc)).toMatch(/Changed the design of the A section/);
    const r = rebase([a] as Op[], [b] as Op[], { base: doc });
    // Same component, remote is later: the local edit loses.
    expect(r.ops).toHaveLength(0);
  });
});
