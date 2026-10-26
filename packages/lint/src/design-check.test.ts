import { getPreset, type SectionPreset, sectionPresets } from "@openspace/blocks";
import { applyAll, validate } from "@openspace/ops";
import type { Page, SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import {
  btn,
  gridSection,
  h,
  healthyDoc,
  img,
  p,
  page,
  siteWith,
  stackSection,
} from "./__fixtures__/doc";
import { designCheck, type Issue } from "./index";

const rules = (issues: Issue[]) => issues.map((i) => i.rule);
const only = (issues: Issue[], rule: string) => issues.filter((i) => i.rule === rule);

/** Apply an issue's autofix (each op validated first) and return the new document. */
function fix(doc: SiteDocument, i: Issue | undefined): SiteDocument {
  expect(i?.autofix, i?.rule).toBeDefined();
  let next = doc;
  for (const op of i?.autofix?.ops ?? []) {
    const v = validate(next, op);
    expect(v.ok ? [] : v.errors).toEqual([]);
    next = applyAll(next, [op]);
  }
  return next;
}

const onePage = (...sections: Parameters<typeof page>[2]) => {
  const pg = page("Home", "", sections);
  return { doc: siteWith([pg]), pg };
};

describe("designCheck basics", () => {
  it("a healthy page has no issues", () => {
    const { doc } = healthyDoc();
    expect(designCheck(doc)).toEqual([]);
  });

  it("issues are plain JSON with ids, severities, messages and fixes", () => {
    const { doc } = onePage(stackSection([]));
    const issues = designCheck(doc);
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(JSON.parse(JSON.stringify(i))).toEqual(i);
      expect(i.id.startsWith(i.rule)).toBe(true);
      expect(["error", "warning", "info"]).toContain(i.severity);
      expect(i.message.length).toBeGreaterThan(10);
      expect(i.fix.length).toBeGreaterThan(10);
    }
  });

  it("scopes page checks to one page and throws for unknown pages", () => {
    const a = page("A", "", [stackSection([])]);
    const b = page("B", "b", [stackSection([h("Hello there", 1), btn()])]);
    const doc = siteWith([a, b]);
    expect(designCheck(doc, b.id).some((i) => i.page === a.id)).toBe(false);
    expect(designCheck(doc, a.id).some((i) => i.page === a.id)).toBe(true);
    expect(() => designCheck(doc, "pg_0000000000")).toThrow();
  });

  it("sorts errors before warnings before info", () => {
    const text1 = p("First words here");
    const text2 = p("Second words here");
    const { doc } = onePage(
      stackSection([h("Only a heading", 1)]),
      stackSection([]),
      gridSection([
        [text1, { x: 1, y: 1, w: 10, h: 4 }],
        [text2, { x: 5, y: 2, w: 10, h: 4 }],
      ]),
    );
    const sev = designCheck(doc).map((i) => i.severity);
    expect(sev).toEqual(
      [...sev].sort(
        (a, b) => ["error", "warning", "info"].indexOf(a) - ["error", "warning", "info"].indexOf(b),
      ),
    );
  });
});

describe("contrast", () => {
  it("flags a custom color that fails contrast, and the autofix restores it", () => {
    const { doc } = healthyDoc();
    doc.styles.overrides = { color: { dark: { text: { $value: "#3a3a3a", $type: "color" } } } };
    const issue = only(designCheck(doc), "contrast-override")[0];
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("dark");
    const fixed = fix(doc, issue);
    expect(only(designCheck(fixed), "contrast-override")).toEqual([]);
  });

  it("does not flag the default palettes", () => {
    const { doc } = healthyDoc();
    expect(rules(designCheck(doc))).not.toContain("contrast");
    expect(rules(designCheck(doc))).not.toContain("contrast-override");
  });

  it("flags custom section background colors that leave text unreadable", () => {
    const s = stackSection([h("Hello there friends", 1), btn()]);
    s.style.background = { type: "color", color: "#222222" }; // light theme text is dark
    const { doc } = onePage(s);
    expect(only(designCheck(doc), "background-contrast")[0]?.severity).toBe("error");
    s.style.background = { type: "color", color: "#fbfaf7" };
    expect(only(designCheck(onePage(s).doc), "background-contrast")).toEqual([]);
  });
});

describe("typefaces", () => {
  it("flags more than two families and removes override fonts", () => {
    const { doc } = healthyDoc();
    doc.styles.overrides = {
      type: { display: { fontFamily: { $value: "Lobster", $type: "fontFamily" } } },
    };
    const issue = only(designCheck(doc), "too-many-typefaces")[0];
    expect(issue?.message).toContain("lobster");
    expect(only(designCheck(fix(doc, issue)), "too-many-typefaces")).toEqual([]);
  });

  it("counts families declared in custom CSS, ignoring generic and variable fonts", () => {
    const { doc } = healthyDoc();
    doc.site.customCss = ".x{font-family: var(--os-font-body), serif} .y{font-family: system-ui}";
    expect(rules(designCheck(doc))).not.toContain("too-many-typefaces");
    doc.site.customCss = ".x{font-family: 'Comic Neue', cursive}";
    expect(rules(designCheck(doc))).toContain("too-many-typefaces");
  });
});

describe("headings", () => {
  it("flags a page with no Heading 1", () => {
    const { doc } = onePage(stackSection([h("Our classes"), btn()]));
    expect(rules(designCheck(doc))).toContain("heading-missing-h1");
  });

  it("flags a second Heading 1 and fixes it", () => {
    const { doc } = onePage(
      stackSection([h("Hello there friends", 1), btn()]),
      stackSection([h("Another top heading", 1)]),
    );
    const issue = only(designCheck(doc), "heading-multiple-h1")[0];
    expect(issue?.message).toContain("Another top heading");
    expect(only(designCheck(fix(doc, issue)), "heading-multiple-h1")).toEqual([]);
  });

  it("flags skipped levels in heading blocks and rich text, with fixes", () => {
    const rich = p("x");
    rich.fields.content = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Deep dive" }] },
      ],
    };
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      stackSection([h("Prices", 3)]),
      stackSection([rich]),
    );
    const issues = only(designCheck(doc), "heading-order");
    expect(issues[0]?.message).toContain("Prices");
    expect(issues[0]?.autofix).toBeDefined();
    let next = doc;
    for (let n = 0; n < 3; n++) {
      const i = only(designCheck(next), "heading-order")[0];
      if (!i) break;
      next = fix(next, i);
    }
    expect(only(designCheck(next), "heading-order")).toEqual([]);
  });

  it("accepts a well-ordered outline including block-owned h3 titles", () => {
    const preset = getPreset("services/image-cards@1") as SectionPreset;
    const { doc } = onePage(stackSection([h("Garden design in Austin", 1), btn()]), preset.build());
    expect(rules(designCheck(doc)).filter((r) => r.startsWith("heading"))).toEqual([]);
  });
});

describe("empty sections", () => {
  it("flags empty sections and offers to delete them", () => {
    const empty = stackSection([]);
    const { doc } = onePage(stackSection([h("Welcome to the studio", 1), btn()]), empty);
    const issue = only(designCheck(doc), "empty-section")[0];
    expect(issue?.section).toBe(empty.id);
    expect(only(designCheck(fix(doc, issue)), "empty-section")).toEqual([]);
  });

  it("treats sections of empty text blocks as empty, but not image-only sections", () => {
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      stackSection([p(" ")]),
      stackSection([img()]),
    );
    expect(only(designCheck(doc), "empty-section")).toHaveLength(1);
  });
});

describe("images", () => {
  it("flags missing alt text", () => {
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn(), img(undefined, "")]),
    );
    expect(only(designCheck(doc), "missing-alt")[0]?.severity).toBe("warning");
    expect(only(designCheck(healthyDoc().doc), "missing-alt")).toEqual([]);
  });

  it("flags images over 2× their displayed size; Unsplash images get a resize autofix", () => {
    const big = img(
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=4000&q=80",
      "Studio",
      4000,
      3000,
    );
    const s = stackSection([h("Welcome to the studio", 1), btn(), big], "light", [12]);
    big.column = 0;
    s.layout = { mode: "stack", columns: { d: [4, 8] } };
    const { doc } = onePage(s);
    const issue = only(designCheck(doc), "oversized-image")[0];
    expect(issue?.severity).toBe("info"); // served responsively
    const fixed = fix(doc, issue);
    expect(only(designCheck(fixed), "oversized-image")).toEqual([]);
  });

  it("warns (not info) for images that aren't served responsively, and accepts right-sized ones", () => {
    const big = img("https://cdn.example.com/hero.jpg", "Studio", 5000, 3000);
    const { doc } = onePage(stackSection([h("Welcome to the studio", 1), btn(), big]));
    expect(only(designCheck(doc), "oversized-image")[0]?.severity).toBe("warning");
    const ok = img("https://cdn.example.com/hero.jpg", "Studio", 2400, 1600);
    expect(
      only(
        designCheck(onePage(stackSection([h("Welcome to the studio", 1), btn(), ok])).doc),
        "oversized-image",
      ),
    ).toEqual([]);
  });

  it("notes mixed image shapes in a section", () => {
    const { doc } = onePage(
      stackSection([
        h("Welcome to the studio", 1),
        btn(),
        img(undefined, "A", 800, 600, "1:1"),
        img(undefined, "B", 800, 600, "16:9"),
      ]),
    );
    expect(only(designCheck(doc), "mixed-aspects")[0]?.severity).toBe("info");
  });
});

describe("overlapping text in grid sections", () => {
  it("errors when text overlaps text on desktop", () => {
    const a = p("First block of words");
    const b = p("Second block of words");
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [a, { x: 1, y: 1, w: 12, h: 6 }, { x: 1, y: 1, w: 8, h: 6 }],
        [b, { x: 8, y: 3, w: 12, h: 6 }, { x: 1, y: 8, w: 8, h: 6 }],
      ]),
    );
    const issues = only(designCheck(doc), "overlapping-text");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain("desktop");
  });

  it("flags mobile overlap and re-stacks the mobile layout", () => {
    const a = p("First block of words");
    const b = p("Second block of words");
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [a, { x: 1, y: 1, w: 10, h: 6 }, { x: 1, y: 1, w: 8, h: 6 }],
        [b, { x: 13, y: 1, w: 10, h: 6 }, { x: 1, y: 3, w: 8, h: 6 }],
      ]),
    );
    const issue = only(designCheck(doc), "overlapping-text")[0];
    expect(issue?.message).toContain("mobile");
    expect(only(designCheck(fix(doc, issue)), "overlapping-text")).toEqual([]);
  });

  it("allows text layered over images", () => {
    const pic = img();
    const t = p("A caption panel over the photo");
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [pic, { x: 1, y: 1, w: 16, h: 20 }, { x: 1, y: 1, w: 8, h: 12 }],
        [t, { x: 12, y: 6, w: 12, h: 8, z: 2 }, { x: 1, y: 9, w: 8, h: 8, z: 2 }],
      ]),
    );
    expect(only(designCheck(doc), "overlapping-text")).toEqual([]);
  });
});

describe("text over photos", () => {
  const layered = (themed: boolean) => {
    const pic = img();
    const t = p("A caption panel over the photo");
    if (themed) t.style = { colorTheme: "light", padding: { d: "lg" } };
    return onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [pic, { x: 1, y: 1, w: 16, h: 20 }, { x: 1, y: 1, w: 8, h: 12 }],
        [t, { x: 12, y: 6, w: 12, h: 8, z: 2 }, { x: 1, y: 14, w: 8, h: 8, z: 2 }],
      ]),
    ).doc;
  };

  it("warns when text sits on a photo without its own panel, and puts it on one", () => {
    const doc = layered(false);
    const issue = only(designCheck(doc), "text-over-photo")[0];
    expect(issue?.message).toContain("desktop");
    expect(only(designCheck(fix(doc, issue)), "text-over-photo")).toEqual([]);
  });

  it("accepts text on a themed panel", () => {
    expect(only(designCheck(layered(true)), "text-over-photo")).toEqual([]);
  });
});

describe("calls to action", () => {
  it("flags a page with no action", () => {
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), p("Some words about the studio.")]),
    );
    expect(rules(designCheck(doc))).toContain("no-call-to-action");
  });

  it("a header nav button counts as the page's action", () => {
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), p("Some words about the studio.")]),
    );
    doc.site.nav = [
      { type: "button", label: "Book", link: { type: "url", url: "/book" }, style: "primary" },
    ];
    expect(rules(designCheck(doc))).not.toContain("no-call-to-action");
  });

  it("flags more than one primary button per section and demotes the extra ones", () => {
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn("Book a class"), btn("Buy a gift card")]),
    );
    const issue = only(designCheck(doc), "multiple-primary-actions")[0];
    expect(issue).toBeDefined();
    expect(only(designCheck(fix(doc, issue)), "multiple-primary-actions")).toEqual([]);
  });
});

describe("color rhythm", () => {
  const sec = (theme: Parameters<typeof stackSection>[1], first = false) =>
    stackSection(
      first
        ? [h("Welcome to the studio", 1), btn()]
        : [h(`A ${theme} section here`), p("Words about it.")],
      theme,
    );

  it("flags four sections in a row with the same theme on long pages, with a fix", () => {
    const { doc } = onePage(
      sec("light", true),
      sec("light"),
      sec("light"),
      sec("light"),
      sec("dark"),
    );
    const issue = only(designCheck(doc), "rhythm-repeat")[0];
    expect(issue).toBeDefined();
    expect(only(designCheck(fix(doc, issue)), "rhythm-repeat")).toEqual([]);
  });

  it("allows three in a row and short pages", () => {
    expect(
      rules(
        designCheck(
          onePage(sec("light", true), sec("light"), sec("light"), sec("dark"), sec("light-accent"))
            .doc,
        ),
      ),
    ).not.toContain("rhythm-repeat");
    expect(
      rules(designCheck(onePage(sec("light", true), sec("light"), sec("light"), sec("light")).doc)),
    ).not.toContain("rhythm-repeat");
  });

  it("flags flipping between light and dark on every section", () => {
    const { doc } = onePage(
      sec("light", true),
      sec("dark"),
      sec("light-accent"),
      sec("dark-accent"),
      sec("light"),
    );
    expect(rules(designCheck(doc))).toContain("rhythm-flipping");
    const calm = onePage(
      sec("light", true),
      sec("light-accent"),
      sec("light"),
      sec("dark"),
      sec("light"),
    );
    expect(rules(designCheck(calm.doc))).not.toContain("rhythm-flipping");
  });
});

describe("copy length", () => {
  it("flags copy longer than the preset's recommended range", () => {
    const preset = getPreset("hero/centered@1") as SectionPreset;
    const s = preset.build();
    const head = s.blocks.find((b) => b.type === "heading");
    if (!head) throw new Error("no heading");
    head.fields.text = "A very long hero headline that goes on and on and on well past what fits";
    const { doc } = onePage(s);
    const issue = only(designCheck(doc), "copy-length")[0];
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toMatch(/Headline is \d+ words; this layout is designed for 3–10/);
  });

  it("notes copy shorter than the range as info, and ignores sections without a preset", () => {
    const preset = getPreset("hero/centered@1") as SectionPreset;
    const s = preset.build();
    const head = s.blocks.find((b) => b.type === "heading");
    if (head) head.fields.text = "Hi";
    expect(only(designCheck(onePage(s).doc), "copy-length")[0]?.severity).toBe("info");
    delete s.preset;
    expect(only(designCheck(onePage(s).doc), "copy-length")).toEqual([]);
  });
});

describe("photo backgrounds", () => {
  it("flags text on a photo without a scrim, and adds one", () => {
    const s = stackSection([h("Welcome to the studio", 1), btn()], "dark");
    s.style.background = {
      type: "image",
      src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920",
    };
    const { doc } = onePage(s);
    const issue = only(designCheck(doc), "photo-without-scrim")[0];
    expect(issue).toBeDefined();
    expect(only(designCheck(fix(doc, issue)), "photo-without-scrim")).toEqual([]);
  });
});

describe("pages assembled from presets", () => {
  const sectionsOf = (pg: Page) => pg.sections.length;
  it("every page preset passes the Design check with no errors in every theme", () => {
    for (const theme of ["light", "light-accent", "dark", "dark-accent", "brand"] as const) {
      const presets = [getPreset("hero/split-image@1") as SectionPreset];
      const pg = page(
        "Home",
        "",
        presets.map((pr) => pr.build({ colorTheme: theme })),
      );
      for (const pr of sectionPresets)
        if (pr.target === "page" && pr.category !== "hero")
          pg.sections.push(pr.build({ colorTheme: theme }));
      const doc = siteWith([pg]);
      const errors = designCheck(doc).filter((i) => i.severity === "error");
      expect(errors, theme).toEqual([]);
      // Page-composition warnings (rhythm on a 100-section page) aside, presets are clean.
      const other = designCheck(doc).filter(
        (i) => !i.rule.startsWith("rhythm") && i.severity !== "info",
      );
      expect(
        other.map((i) => `${i.rule}: ${i.message}`),
        theme,
      ).toEqual([]);
      expect(sectionsOf(pg)).toBeGreaterThan(80);
    }
  });
});
