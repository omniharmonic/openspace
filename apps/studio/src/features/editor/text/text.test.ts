import { RichText } from "@omniharmonic/openspace-renderer";
import { type RichTextDoc, RichTextDocSchema } from "@omniharmonic/openspace-schema";
import { Editor } from "@tiptap/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { fromTiptap, toTiptap } from "./convert";
import { applyTextStyle, currentTextStyle, richTextExtensions } from "./schema";

const SAMPLE: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { preset: "eyebrow" },
      content: [{ type: "text", text: "Since 2014" }],
    },
    {
      type: "heading",
      attrs: { level: 1, preset: "display" },
      content: [{ type: "text", text: "Slow yoga" }],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Classes" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Plain, " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and " },
        {
          type: "text",
          text: "linked italic",
          marks: [{ type: "italic" }, { type: "link", attrs: { href: "/classes", newTab: true } }],
        },
        { type: "hardBreak" },
        {
          type: "text",
          text: "marked",
          marks: [{ type: "highlight", attrs: { color: "accent" } }],
        },
        { type: "text", text: " u", marks: [{ type: "underline" }] },
        { type: "text", text: " s", marks: [{ type: "strike" }] },
        { type: "text", text: " c", marks: [{ type: "code" }] },
      ],
    },
    {
      type: "paragraph",
      attrs: { preset: "lead" },
      content: [{ type: "text", text: "Lead copy" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Three" }] }],
        },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Breathe." }] }],
    },
    { type: "paragraph" },
  ],
};

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function make(doc: RichTextDoc) {
  editor = new Editor({ extensions: richTextExtensions, content: toTiptap(doc), injectCSS: false });
  return editor;
}

describe("rich text ⇄ Tiptap", () => {
  it("round-trips every node and mark of the OpenSpace subset losslessly", () => {
    const e = make(SAMPLE);
    const back = fromTiptap(e.getJSON());
    expect(back).toEqual(SAMPLE);
    expect(RichTextDocSchema.safeParse(back).success).toBe(true);
  });

  it("renders the same HTML as the published RichText (no layout jump when editing)", () => {
    const e = make(SAMPLE);
    const published = renderToStaticMarkup(createElement(RichText, { doc: SAMPLE }));
    const inner = published.replace(/^<div class="os-rich">/, "").replace(/<\/div>$/, "");
    const normalise = (html: string) =>
      html
        .replace(/ rel="noopener"/g, "")
        .replace(/<br class="ProseMirror-trailingBreak"\/?>/g, "<br/>")
        .replace(/<br>/g, "<br/>")
        .replace(/style="--hl: ?([^";]+);?"/g, 'style="--hl:$1"')
        .replace(/<p><\/p>/g, "<p><br/></p>");
    expect(normalise(e.getHTML())).toBe(normalise(inner));
  });

  it("drops unsafe links and unknown structure, and normalises defaults", () => {
    const doc = fromTiptap({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { preset: "body" },
          content: [
            {
              type: "text",
              text: "a",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            { type: "text", text: "b" },
            { type: "image", attrs: {} } as never,
          ],
        },
        {
          type: "heading",
          attrs: { level: 2, preset: "h2" },
          content: [{ type: "text", text: "H" }],
        },
        { type: "horizontalRule" },
        { type: "bulletList", content: [] },
      ],
    });
    expect(doc).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ab" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] },
      ],
    });
  });

  it("parses pasted HTML into the subset", () => {
    const e = make({ type: "doc", content: [] });
    e.commands.setContent(
      '<h5>Small</h5><p>Hi <b>there</b> <span style="color:red">red</span> <a href="https://x.org" target="_blank">x</a></p><table><tr><td>cell</td></tr></table>',
    );
    const doc = fromTiptap(e.getJSON());
    expect(doc.content[0]).toEqual({
      type: "heading",
      attrs: { level: 4 },
      content: [{ type: "text", text: "Small" }],
    });
    expect(doc.content[1]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "Hi " },
        { type: "text", text: "there", marks: [{ type: "bold" }] },
        { type: "text", text: " red " },
        {
          type: "text",
          text: "x",
          marks: [{ type: "link", attrs: { href: "https://x.org", newTab: true } }],
        },
      ],
    });
    expect(RichTextDocSchema.safeParse(doc).success).toBe(true);
  });

  it("applies typography presets from the toolbar", () => {
    const e = make({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    });
    e.commands.setTextSelection(2);
    expect(currentTextStyle(e)).toBe("body");
    applyTextStyle(e, "display");
    expect(fromTiptap(e.getJSON()).content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1, preset: "display" },
    });
    expect(currentTextStyle(e)).toBe("display");
    applyTextStyle(e, "h3");
    expect(fromTiptap(e.getJSON()).content[0]).toEqual({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Hello" }],
    });
    applyTextStyle(e, "small");
    expect(fromTiptap(e.getJSON()).content[0]).toMatchObject({
      type: "paragraph",
      attrs: { preset: "small" },
    });
    applyTextStyle(e, "body");
    expect(fromTiptap(e.getJSON()).content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Hello" }],
    });
  });
});
