import { describe, expect, it } from "vitest";
import { docFromText, fromMarkdown, normalizeDoc, plainText, toMarkdown } from "./richtext";
import {
  type BlockNode,
  type InlineNode,
  type Mark,
  marksUsed,
  type RichTextDoc,
  RichTextDocSchema,
  type TextNode,
} from "./richtext-schema";

const t = (text: string, ...marks: Mark[]): TextNode =>
  marks.length ? { type: "text", text, marks } : { type: "text", text };

function roundTripMd(md: string) {
  const doc = fromMarkdown(md);
  expect(RichTextDocSchema.safeParse(doc).success).toBe(true);
  expect(toMarkdown(doc)).toBe(md);
}

function roundTripDoc(doc: RichTextDoc) {
  expect(RichTextDocSchema.safeParse(doc).success).toBe(true);
  const md = toMarkdown(doc);
  expect(fromMarkdown(md)).toEqual(normalizeDoc(doc));
}

describe("markdown → doc", () => {
  it("parses headings with levels and presets", () => {
    const doc = fromMarkdown("# Hero statement {.display}\n\n## Section\n\n###### Deep");
    expect(doc.content).toEqual([
      { type: "heading", attrs: { level: 1, preset: "display" }, content: [t("Hero statement")] },
      { type: "heading", attrs: { level: 2 }, content: [t("Section")] },
      { type: "heading", attrs: { level: 4 }, content: [t("Deep")] },
    ]);
  });

  it("parses paragraphs with presets and soft/hard breaks", () => {
    const doc = fromMarkdown("Intro text {.lead}\n\nline one\nstill one\\\nline two  \nline three");
    expect(doc.content).toEqual([
      { type: "paragraph", attrs: { preset: "lead" }, content: [t("Intro text")] },
      {
        type: "paragraph",
        content: [
          t("line one still one"),
          { type: "hardBreak" },
          t("line two"),
          { type: "hardBreak" },
          t("line three"),
        ],
      },
    ]);
  });

  it("parses marks", () => {
    const doc = fromMarkdown(
      '**bold** *it* _it2_ ~~gone~~ <u>under</u> ==hi== <mark data-color="accent">tok</mark> `code`',
    );
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [
        t("bold", { type: "bold" }),
        t(" "),
        t("it", { type: "italic" }),
        t(" "),
        t("it2", { type: "italic" }),
        t(" "),
        t("gone", { type: "strike" }),
        t(" "),
        t("under", { type: "underline" }),
        t(" "),
        t("hi", { type: "highlight" }),
        t(" "),
        t("tok", { type: "highlight", attrs: { color: "accent" } }),
        t(" "),
        t("code", { type: "code" }),
      ],
    });
  });

  it("parses nested marks and links", () => {
    const doc = fromMarkdown(
      '***both*** [a **b**](https://x.dev "T"){target="_blank"} [rel](/about)',
    );
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [
        t("both", { type: "bold" }, { type: "italic" }),
        t(" "),
        t("a ", { type: "link", attrs: { href: "https://x.dev", title: "T", newTab: true } }),
        t(
          "b",
          { type: "link", attrs: { href: "https://x.dev", title: "T", newTab: true } },
          { type: "bold" },
        ),
        t(" "),
        t("rel", { type: "link", attrs: { href: "/about" } }),
      ],
    });
  });

  it("treats unmatched delimiters and intraword underscores as text", () => {
    const doc = fromMarkdown("5 * 3 and snake_case_name and [not a link] and a ~ b = c");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [t("5 * 3 and snake_case_name and [not a link] and a ~ b = c")],
    });
  });

  it("parses bullet, ordered and nested lists", () => {
    const doc = fromMarkdown("- one\n- two\n  - nested\n\n3. three\n4. four");
    expect(doc.content).toEqual([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [t("one")] }] },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [t("two")] },
              {
                type: "bulletList",
                content: [
                  { type: "listItem", content: [{ type: "paragraph", content: [t("nested")] }] },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [t("three")] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [t("four")] }] },
        ],
      },
    ]);
  });

  it("parses blockquotes with nested content", () => {
    const doc = fromMarkdown("> quoted *text*\n>\n> - item");
    expect(doc.content).toEqual([
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [t("quoted "), t("text", { type: "italic" })] },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("item")] }] }],
          },
        ],
      },
    ]);
  });

  it("always returns schema-valid documents: unsafe links and unknown colors are dropped", () => {
    const cases: Array<[string, RichTextDoc["content"]]> = [
      ["[x](javascript:alert(1))", [{ type: "paragraph", content: [t("x")] }]],
      [
        "[**b**](data:text/html,hi) tail",
        [{ type: "paragraph", content: [t("b", { type: "bold" }), t(" tail")] }],
      ],
      ["[x](<a b>)", [{ type: "paragraph", content: [t("x")] }]],
      [
        '<mark data-color="hotpink">hi</mark> <mark data-color="accent">ok</mark>',
        [
          {
            type: "paragraph",
            content: [
              t("hi", { type: "highlight" }),
              t(" "),
              t("ok", { type: "highlight", attrs: { color: "accent" } }),
            ],
          },
        ],
      ],
      [
        `[x](/a "${"t".repeat(300)}")`,
        [
          {
            type: "paragraph",
            content: [t("x", { type: "link", attrs: { href: "/a", title: "t".repeat(200) } })],
          },
        ],
      ],
    ];
    for (const [md, content] of cases) {
      const doc = fromMarkdown(md);
      expect(RichTextDocSchema.safeParse(doc).success, md).toBe(true);
      expect(doc.content, md).toEqual(content);
    }
    // An unsafe inner link inside a valid outer link keeps the outer link.
    const nested = fromMarkdown("[a [b](javascript:x)](/ok)");
    expect(RichTextDocSchema.safeParse(nested).success).toBe(true);
  });
});

describe("markdown round-trips", () => {
  it.each([
    ["headings", "# Title\n\n## Sub {.eyebrow}\n\n### Three\n\n#### Four {.display}"],
    ["paragraph presets", "Lead in. {.lead}\n\nFine print {.small}\n\nPlain"],
    ["marks", '**b** *i* ~~s~~ <u>u</u> ==h== <mark data-color="accent-200">c</mark> `x`'],
    ["nested marks", "***bi*** **bold *both* bold** **<u>ub</u>**"],
    [
      "links",
      '[site](https://example.com) [t](https://a.dev "Title") [n](/x){target="_blank"} [m](mailto:a@b.co)',
    ],
    ["marked links", "[**bold** link](https://example.com)"],
    ["lists", "- a\n- b\n  - c\n    1. d\n    2. e\n- f"],
    ["ordered start", "5. five\n6. six"],
    ["adjacent lists", "- a\n\n* b\n\n1. c\n\n1) d"],
    ["multi-paragraph item", "- first\n\n  second\n- next"],
    ["blockquote", "> a quote\\\n> with a break\n>\n> - and a list"],
    ["hard breaks", "one\\\ntwo\\\nthree"],
    ["heading break", "## top<br>bottom"],
    ["escapes", "\\*not bold\\* and \\[x\\] and 1. no list and a \\<tag"],
    ["line-start escapes", "\\# not heading\\\n\\- not list\\\n2024\\. year\\\n\\> nope"],
    ["code with backticks", "``a ` b`` and ``` ``x`` ```"],
    ["preset look-alike", "ends with \\{.lead}"],
  ])("%s", (_name, md) => roundTripMd(md));

  it("round-trips documents through markdown", () => {
    const docs: RichTextDoc[] = [
      {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1, preset: "display" },
            content: [t("Slow, grounded yoga")],
          },
          {
            type: "paragraph",
            attrs: { preset: "lead" },
            content: [
              t("Classes in "),
              t("Boulder", { type: "bold" }, { type: "underline" }),
              { type: "hardBreak" },
              t("since ", { type: "italic" }),
              t("2019", { type: "italic" }, { type: "highlight", attrs: { color: "accent" } }),
            ],
          },
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [t("Breathe."), { type: "hardBreak" }, t("Then move.")],
              },
            ],
          },
          {
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [t("Book", { type: "link", attrs: { href: "/schedule" } })],
                  },
                ],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [t("a*b_c [d] `e`", { type: "strike" })] }],
              },
            ],
          },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("x")] }] }],
          },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("y")] }] }],
          },
        ],
      },
      { type: "doc", content: [{ type: "paragraph", content: [t("x = y == z ~ ~~ {.lead}")] }] },
      {
        type: "doc",
        content: [{ type: "paragraph", content: [t("`tick` ", { type: "code" }), t(" after")] }],
      },
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [t("- dash"), { type: "hardBreak" }, t("# hash")] },
        ],
      },
    ];
    for (const doc of docs) roundTripDoc(doc);
  });

  it("normalizes mergeable text, mark order and empty paragraphs", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        {
          type: "paragraph",
          attrs: { preset: "body" },
          content: [
            t(" a", { type: "italic" }, { type: "bold" }),
            t("b ", { type: "bold" }, { type: "italic" }),
          ],
        },
      ],
    };
    expect(normalizeDoc(doc)).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [t("ab", { type: "bold" }, { type: "italic" })] }],
    });
    roundTripDoc(doc);
  });
});

describe("plainText", () => {
  it("extracts text with breaks", () => {
    const doc = fromMarkdown("# Title\n\nHello **world**\\\nagain\n\n- a\n- b\n\n> q");
    expect(plainText(doc)).toBe("Title\n\nHello world\nagain\n\na\nb\n\nq");
  });

  it("docFromText makes a paragraph with hard breaks", () => {
    const doc = docFromText("one\ntwo");
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [t("one"), { type: "hardBreak" }, t("two")],
    });
    expect(marksUsed(fromMarkdown("**a** [b](/c)"))).toEqual(new Set(["bold", "link"]));
  });
});

describe("randomized round-trips", () => {
  // Small seeded PRNG so failures are reproducible.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const CHARS = "abc XYZ 019 *_~=`[]<>{}.#-+\\()!\"'";
  const MARKS: Mark[] = [
    { type: "bold" },
    { type: "italic" },
    { type: "strike" },
    { type: "underline" },
    { type: "highlight" },
    { type: "highlight", attrs: { color: "accent" } },
    { type: "code" },
    { type: "link", attrs: { href: "https://example.com/a" } },
    { type: "link", attrs: { href: "/b", title: 'say "hi"', newTab: true } },
  ];

  function randomDoc(r: () => number): RichTextDoc {
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
    const text = () => {
      let out = "";
      const n = 1 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) out += pick([...CHARS]);
      return out;
    };
    const inline = (): InlineNode[] => {
      const out: InlineNode[] = [];
      const n = 1 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        if (r() < 0.1) out.push({ type: "hardBreak" });
        else {
          const marks: Mark[] = [];
          for (const m of MARKS)
            if (r() < 0.15 && !marks.some((x) => x.type === m.type)) marks.push(m);
          out.push(t(text(), ...marks));
        }
      }
      return out;
    };
    const block = (depth: number): BlockNode => {
      const kind = depth > 2 ? 0 : Math.floor(r() * 5);
      if (kind === 1)
        return {
          type: "heading",
          attrs: { level: pick([1, 2, 3, 4] as const) },
          content: inline(),
        };
      if (kind === 2 || kind === 3)
        return {
          type: kind === 2 ? "bulletList" : "orderedList",
          content: [0, 1].map(() => ({ type: "listItem", content: [block(depth + 1)] })),
        } as BlockNode;
      if (kind === 4) return { type: "blockquote", content: [block(depth + 1)] };
      return { type: "paragraph", content: inline() };
    };
    return { type: "doc", content: [block(0), block(0), block(0)] };
  }

  it("doc → markdown → doc is stable for 300 random documents", () => {
    const r = rng(42);
    for (let k = 0; k < 300; k++) {
      const doc = randomDoc(r);
      const md = toMarkdown(doc);
      const back = fromMarkdown(md);
      expect({ md, doc: back }).toEqual({ md, doc: normalizeDoc(doc) });
    }
  });
});
