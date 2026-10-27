import { getPreset, type SectionPreset, sectionPresets } from "@omniharmonic/openspace-blocks";
import { applyAll, validate } from "@omniharmonic/openspace-ops";
import { type Page, resolveInternalLinks, type SiteDocument } from "@omniharmonic/openspace-schema";
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
import { blendOver, designCheck, type Issue, photoTextChecks, worstCaseRatio } from "./index";

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

  it("keeps a block's own padding when putting it on a panel", () => {
    const pic = img();
    const t = p("A caption over the photo");
    t.style = { padding: { d: "xs" } };
    const doc = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [pic, { x: 1, y: 1, w: 16, h: 20 }, { x: 1, y: 1, w: 8, h: 12 }],
        [t, { x: 12, y: 6, w: 12, h: 8, z: 2 }, { x: 1, y: 14, w: 8, h: 8, z: 2 }],
      ]),
    ).doc;
    const op = only(designCheck(doc), "text-over-photo")[0]?.autofix?.ops[0] as {
      style?: { padding?: unknown };
    };
    expect(op.style?.padding).toEqual({ d: "xs" });
  });

  it("accepts text on a themed panel", () => {
    expect(only(designCheck(layered(true)), "text-over-photo")).toEqual([]);
  });
});

describe("hidden text", () => {
  it("errors when a higher-layer image completely covers text", () => {
    const pic = img();
    const t = p("Words nobody will see");
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [t, { x: 4, y: 4, w: 6, h: 3 }, { x: 1, y: 14, w: 8, h: 3 }],
        [pic, { x: 1, y: 1, w: 16, h: 12, z: 3 }, { x: 1, y: 1, w: 8, h: 12 }],
      ]),
    );
    const issue = only(designCheck(doc), "text-hidden")[0];
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("desktop");
  });

  it("allows text in front of the image or only partly behind it", () => {
    const pic = img();
    const t = p("Words in front");
    t.style = { colorTheme: "light" };
    const { doc } = onePage(
      stackSection([h("Welcome to the studio", 1), btn()]),
      gridSection([
        [pic, { x: 1, y: 1, w: 16, h: 12 }, { x: 1, y: 1, w: 8, h: 12 }],
        [t, { x: 4, y: 4, w: 6, h: 3, z: 2 }, { x: 1, y: 14, w: 8, h: 3 }],
      ]),
    );
    expect(only(designCheck(doc), "text-hidden")).toEqual([]);
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
    expect(issue?.message).toMatch(/Headline is \d+ words; this layout is designed for 3–9/);
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

describe("text over photos", () => {
  const photoSection = (opacity: number) => {
    const s = stackSection(
      [
        h("Welcome to the studio", 1),
        p("Small classes, every morning."),
        btn("Join us", "secondary"),
      ],
      "dark",
    );
    s.style.background = {
      type: "image",
      src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920",
      overlay: { color: "background", opacity },
    };
    return s;
  };

  it("checks text against the scrim over both a black and a white photo", () => {
    expect(worstCaseRatio("#ffffff", "#000000", 1)).toBeCloseTo(21, 0);
    // A 40% black scrim over a white photo leaves white text far below 4.5:1.
    expect(worstCaseRatio("#ffffff", "#000000", 0.4)).toBeLessThan(3);
    expect(blendOver("#000000", 0.5, "#ffffff")).toBe("#808080");
  });

  it("flags text a light scrim can't protect, with an autofix that raises the overlay", () => {
    const { doc } = onePage(photoSection(0.4));
    const issues = only(designCheck(doc), "text-over-photo-contrast");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "error")).toBe(true);
    const fixed = fix(doc, issues[0] as Issue);
    expect(only(designCheck(fixed), "text-over-photo-contrast")).toEqual([]);
  });

  it("checks text on a photo with no overlay, and the scrim autofix makes it readable", () => {
    const s = photoSection(0.4);
    if (s.style.background?.type === "image") delete s.style.background.overlay;
    const { doc } = onePage(s);
    const issues = designCheck(doc);
    expect(only(issues, "text-over-photo-contrast").length).toBeGreaterThan(0);
    const scrim = only(issues, "photo-without-scrim")[0] as Issue;
    expect(scrim.autofix?.label).toMatch(/^Add a \d+% overlay$/);
    const fixed = designCheck(fix(doc, scrim));
    expect(only(fixed, "photo-without-scrim")).toEqual([]);
    expect(only(fixed, "text-over-photo-contrast")).toEqual([]);
  });

  it("flags an overlay color it can't resolve, and ignores media blocks", () => {
    const s = photoSection(0.8);
    if (s.style.background?.type === "image")
      s.style.background.overlay = { color: "no-such-role", opacity: 0.8 };
    expect(only(designCheck(onePage(s).doc), "photo-overlay-color")).toHaveLength(1);
    expect(photoTextChecks(img(), "solid")).toEqual([]);
    expect(photoTextChecks({ ...img(), type: "gallery" }, "solid")).toEqual([]);
  });

  it("passes with a strong scrim, and skips text on its own panel", () => {
    expect(only(designCheck(onePage(photoSection(0.8)).doc), "text-over-photo-contrast")).toEqual(
      [],
    );
    const s = photoSection(0.4);
    for (const b of s.blocks) b.style = { ...b.style, colorTheme: "dark" };
    expect(only(designCheck(onePage(s).doc), "text-over-photo-contrast")).toEqual([]);
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
      // Raw builds carry the presets' example links (/book, /retreats…): broken on this site.
      expect(designCheck(siteWith([pg])).some((i) => i.rule === "broken-link")).toBe(true);
      // Every insertion path points them at pages the site has first.
      const empty = siteWith([{ ...pg, sections: [] }]);
      pg.sections = pg.sections.map((s) => resolveInternalLinks(s, empty).value);
      const doc = siteWith([pg]);
      // Photo-background presets are designed for the dark themes only (their scrim is the
      // section background); text-over-photo contrast is checked in those themes below.
      const offDesign = new Set(
        pg.sections
          .filter((s) => !getPreset(s.preset ?? "")?.themes.includes(theme))
          .map((s) => s.id),
      );
      const errors = designCheck(doc).filter(
        (i) =>
          i.severity === "error" &&
          !(i.rule === "text-over-photo-contrast" && offDesign.has(i.section as never)),
      );
      expect(errors, theme).toEqual([]);
      // Page-composition warnings (rhythm on a 100-section page) aside, presets are clean.
      const other = designCheck(doc).filter(
        (i) =>
          !i.rule.startsWith("rhythm") &&
          // Donation / product / sign-in presets on a GitHub Pages site: a hosting note, not design.
          i.rule !== "needs-cloudflare" &&
          i.severity !== "info" &&
          !(i.rule === "text-over-photo-contrast" && offDesign.has(i.section as never)),
      );
      expect(
        other.map((i) => `${i.rule}: ${i.message}`),
        theme,
      ).toEqual([]);
      expect(sectionsOf(pg)).toBeGreaterThan(80);
    }
  });

  it("photo-background presets keep their text readable over any photo in their designed themes", () => {
    const bad: string[] = [];
    for (const pr of sectionPresets) {
      if (pr.target !== "page") continue;
      for (const theme of pr.themes) {
        const s = pr.build({ colorTheme: theme });
        if (s.style.background?.type !== "image") continue;
        const doc = siteWith([page("P", "", [s])]);
        for (const i of designCheck(doc).filter((x) => x.rule === "text-over-photo-contrast"))
          bad.push(`${pr.id} ${theme}: ${i.message}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
