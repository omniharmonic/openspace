import { buttonBlock, columnsBlock, rt } from "@omniharmonic/openspace-blocks";
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { fromTiptap, restrictDoc, toTiptap } from "./convert";
import {
  defaultTextField,
  fieldMetaAt,
  fieldSet,
  getAt,
  plainTextTargets,
  setAt,
  textFieldsOf,
} from "./fields";
import { richTextExtensions } from "./schema";

describe("text field paths", () => {
  const columns = columnsBlock.create();
  it("lists rich and plain fields, including list items", () => {
    const refs = textFieldsOf(columns).map((r) => `${r.kind}:${r.path}`);
    expect(refs).toContain("plain:items.0.heading");
    expect(refs).toContain("rich:items.2.body");
    expect(refs).toContain("plain:items.2.linkLabel");
    expect(fieldMetaAt(columns, "items.1.body")).toMatchObject({ kind: "richText" });
    expect(defaultTextField(columns)).toEqual({ path: "items.0.body", kind: "rich" });
    expect(defaultTextField(buttonBlock.create())).toEqual({ path: "label", kind: "plain" });
  });

  it("reads and immutably writes nested paths as top-level field updates", () => {
    const fields = { items: [{ a: 1 }, { a: 2 }], x: { y: "z" } };
    expect(getAt(fields, "items.1.a")).toBe(2);
    const next = setAt(fields, "items.1.a", 3);
    expect(next.items[1]).toEqual({ a: 3 });
    expect(fields.items[1]).toEqual({ a: 2 });
    expect(Array.isArray(next.items)).toBe(true);
    const set = fieldSet(columns, "items.1.heading", "Settle");
    expect(Object.keys(set)).toEqual(["items"]);
    expect((set.items as Array<{ heading: string }>)[1]?.heading).toBe("Settle");
    expect((set.items as Array<{ heading: string }>)[0]?.heading).toBe("Book");
  });

  it("finds the element showing each plain text field", () => {
    const el = document.createElement("div");
    el.innerHTML = `<div class="os-cols">
      <article><h3>Book</h3><div class="os-rich"><p>Book</p></div></article>
      <article><h3> Arrive </h3></article>
      <article><h3><span>Breathe</span></h3><a href="/schedule"><span>See the schedule</span><svg></svg></a></article>
    </div>`;
    const targets = plainTextTargets(el, columns);
    expect(targets.get("items.0.heading")?.tagName).toBe("H3");
    expect(targets.get("items.1.heading")?.textContent?.trim()).toBe("Arrive");
    expect(targets.get("items.2.heading")?.tagName).toBe("SPAN");
    expect(targets.get("items.2.linkLabel")?.textContent).toBe("See the schedule");
  });
});

describe("field allowances", () => {
  it("narrows documents to the marks and nodes a field allows", () => {
    const doc = rt.doc(
      rt.h(2, "Title"),
      {
        type: "paragraph",
        content: [{ type: "text", text: "x", marks: [{ type: "bold" }, { type: "highlight" }] }],
      },
      { type: "blockquote", content: [rt.p("quoted")] },
      rt.ul("one", "two"),
    );
    expect(restrictDoc(doc, { marks: ["bold"], blocks: ["paragraph"] })).toEqual(
      rt.doc(
        rt.p("Title"),
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }] },
        rt.p("quoted"),
        rt.p("one"),
        rt.p("two"),
      ),
    );
  });

  it("drops pasted links the site can't store", () => {
    const e = new Editor({
      extensions: richTextExtensions,
      content: toTiptap(rt.doc()),
      injectCSS: false,
    });
    e.commands.setContent('<p><a href="javascript:alert(1)">bad</a> <a href="/ok">good</a></p>');
    expect(fromTiptap(e.getJSON())).toEqual(
      rt.doc(
        rt.p([
          { type: "text", text: "bad " },
          { type: "text", text: "good", marks: [{ type: "link", attrs: { href: "/ok" } }] },
        ]),
      ),
    );
    e.destroy();
  });
});
