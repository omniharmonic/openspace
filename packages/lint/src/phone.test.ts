import { blocksRegistry, headingBlock } from "@omniharmonic/openspace-blocks";
import { applyAll, validate } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import {
  gridSection,
  h,
  healthyDoc,
  img,
  p,
  page,
  siteWith,
  stackSection,
} from "./__fixtures__/doc";
import {
  designCheck,
  fixForPhones,
  type Issue,
  isPhoneIssue,
  PHONE_PROBE_SCRIPT,
  type PhoneProbeResult,
  phoneCheck,
  phoneIssuesFromProbe,
  phonePx,
  wideRules,
} from "./index";

const only = (issues: Issue[], rule: string) => issues.filter((i) => i.rule === rule);
const registry = blocksRegistry();

function fix(doc: SiteDocument, i: Issue | undefined): SiteDocument {
  expect(i?.autofix, i?.rule).toBeDefined();
  let next = doc;
  for (const op of i?.autofix?.ops ?? []) {
    const v = validate(next, op, { registry });
    expect(v.ok ? [] : v.errors).toEqual([]);
    next = applyAll(next, [op]);
  }
  return next;
}

const LONG =
  "We started in a borrowed room with twelve mats and a kettle, and we still keep classes small enough that the teacher knows every name in the room.";

const heading = (text: string, level: "h1" | "h2" = "h1", size = "display") =>
  headingBlock.create({
    fields: { text, level, size, eyebrow: undefined, subheading: undefined } as never,
  });

describe("phoneCheck (static)", () => {
  it("passes a healthy page", () => {
    expect(phoneCheck(healthyDoc().doc)).toEqual([]);
  });

  it("flags text columns squeezed side by side on phones and stacks them", () => {
    const s = stackSection(
      [
        { ...p(LONG), column: 0 },
        { ...p(LONG), column: 1 },
      ],
      "light",
      [6, 6],
    );
    (s.layout as { columns: { d: number[]; m?: number[] } }).columns.m = [6, 6];
    const pg = page("Home", "", [s]);
    const doc = siteWith([pg]);
    const issue = only(phoneCheck(doc), "phone-columns")[0];
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toMatch(/squeezed/);
    const fixed = fix(doc, issue);
    expect(only(phoneCheck(fixed), "phone-columns")).toEqual([]);
  });

  it("doesn't flag desktop columns without phone columns (they stack by default)", () => {
    const s = stackSection(
      [
        { ...p(LONG), column: 0 },
        { ...p(LONG), column: 1 },
      ],
      "light",
      [6, 6],
    );
    expect(only(phoneCheck(siteWith([page("Home", "", [s])])), "phone-columns")).toEqual([]);
  });

  it("places blocks added on desktop for phones, keeping existing phone placements", () => {
    const a = h("Our classes", 1);
    const b = p("Small classes for every body.");
    const c = p("Added later on desktop.");
    const s = gridSection([
      [a, { x: 1, y: 1, w: 12, h: 3 }, { x: 1, y: 1, w: 8, h: 3 }],
      [b, { x: 1, y: 4, w: 12, h: 3 }, { x: 1, y: 5, w: 8, h: 3 }],
      [c, { x: 13, y: 1, w: 12, h: 3 }],
    ]);
    const doc = siteWith([page("Home", "", [s])]);
    const issue = only(phoneCheck(doc), "phone-layout-missing")[0];
    expect(issue?.message).toMatch(/added on desktop/);
    const fixed = fix(doc, issue);
    expect(only(phoneCheck(fixed), "phone-layout-missing")).toEqual([]);
    const layout = fixed.pages[Object.keys(fixed.pages)[0] as never]?.sections[0]?.layout;
    if (layout?.mode !== "grid") throw new Error("grid");
    expect(layout.items[a.id]?.m).toEqual({ x: 1, y: 1, w: 8, h: 3 });
    expect(layout.items[c.id]?.m).toBeDefined();
  });

  it("flags a grid whose fallback phone order differs from its reading order", () => {
    const eyebrow = p("Classes");
    const photo = img();
    const title = h("Slow yoga", 1);
    const s = gridSection([
      [photo, { x: 13, y: 1, w: 12, h: 20 }],
      [eyebrow, { x: 2, y: 3, w: 8, h: 2 }],
      [title, { x: 1, y: 6, w: 11, h: 4 }],
    ]);
    const doc = siteWith([page("Home", "", [s])]);
    const issue = only(phoneCheck(doc), "phone-layout-order")[0];
    expect(issue).toBeDefined();
    expect(only(phoneCheck(fix(doc, issue)), "phone-layout-order")).toEqual([]);
  });

  it("flags text squeezed into a narrow phone column in a grid", () => {
    const a = p(LONG);
    const b = img();
    const s = gridSection([
      [a, { x: 1, y: 1, w: 12, h: 6 }, { x: 1, y: 1, w: 3, h: 12 }],
      [b, { x: 13, y: 1, w: 12, h: 6 }, { x: 4, y: 1, w: 5, h: 12 }],
    ]);
    const doc = siteWith([page("Home", "", [s])]);
    const issue = only(phoneCheck(doc), "phone-narrow-text")[0];
    expect(issue?.block).toBe(a.id);
    expect(only(phoneCheck(fix(doc, issue)), "phone-narrow-text")).toEqual([]);
  });

  it("flags phone padding that empties the screen and tightens it on phones only", () => {
    const s = stackSection([h("Welcome", 1), p(LONG)]);
    s.style.padding = { d: "3xl", m: "3xl" };
    const doc = siteWith([page("Home", "", [s])]);
    doc.styles.choices.density = "airy";
    const issue = only(phoneCheck(doc), "phone-padding")[0];
    expect(issue?.message).toMatch(/empty space/);
    const fixed = fix(doc, issue);
    const pad = Object.values(fixed.pages)[0]?.sections[0]?.style.padding;
    expect(pad).toEqual({ d: "3xl", m: "lg" });
    expect(only(phoneCheck(fixed), "phone-padding")).toEqual([]);
  });

  it("doesn't flag big desktop padding without a phone value (it comes down by default)", () => {
    const s = stackSection([h("Welcome", 1), p(LONG)]);
    s.style.padding = { d: "3xl" };
    expect(only(phoneCheck(siteWith([page("Home", "", [s])])), "phone-padding")).toEqual([]);
  });

  it("shortens photo sections that fill a phone screen, on phones only", () => {
    const s = stackSection([h("Bedford", 1)]);
    s.style.background = {
      type: "image",
      src: "media/x.jpg",
      overlay: { color: "background", opacity: 0.6 },
    };
    s.style.minHeight = { d: "88vh", m: "80svh" };
    const doc = siteWith([page("Home", "", [s])]);
    const issue = only(phoneCheck(doc), "phone-tall-photo")[0];
    expect(issue).toBeDefined();
    const fixed = fix(doc, issue);
    expect(Object.values(fixed.pages)[0]?.sections[0]?.style.minHeight).toEqual({
      d: "88vh",
      m: "70svh",
    });
    expect(only(phoneCheck(fixed), "phone-tall-photo")).toEqual([]);
  });

  it("flags heading words too long for a phone line and sets a phone-only size", () => {
    const hd = heading("Incomprehensibilities everywhere", "h1", "display");
    const s = stackSection([hd, p(LONG)]);
    const doc = siteWith([page("Home", "", [s])]);
    const issue = only(phoneCheck(doc), "phone-long-word")[0];
    expect(issue?.message).toContain("Incomprehensibilities");
    const fixed = fix(doc, issue);
    const b = Object.values(fixed.pages)[0]?.sections[0]?.blocks[0];
    expect((b?.fields as { size?: string } | undefined)?.size).toBe("display");
    expect((b?.fields as { phoneSize?: string } | undefined)?.phoneSize).toBeDefined();
    expect(only(phoneCheck(fixed), "phone-long-word")).toEqual([]);
  });

  it("leaves ordinary headings alone", () => {
    const s = stackSection([heading("A slower kind of yoga studio")]);
    expect(only(phoneCheck(siteWith([page("Home", "", [s])])), "phone-long-word")).toEqual([]);
  });

  it("flags a tall phone logo", () => {
    const { doc } = healthyDoc();
    doc.site.header.logoHeight = { d: 96 };
    const issue = only(phoneCheck(doc), "phone-logo")[0];
    expect(issue).toBeDefined();
    const fixed = fix(doc, issue);
    expect(fixed.site.header.logoHeight).toEqual({ d: 96, m: 40 });
  });

  it("flags custom CSS fixed wider than a phone, but not inside wide-screen media queries", () => {
    expect(wideRules(".a{width:640px}")).toEqual(["width: 640px"]);
    expect(wideRules(".a{max-width:640px}")).toEqual([]);
    expect(wideRules("@media (min-width: 768px){.a{width:640px}} .b{min-width:30rem}")).toEqual([
      "min-width: 30rem",
    ]);
    const { doc } = healthyDoc();
    doc.site.customCss = ".hero{width:900px}";
    expect(only(phoneCheck(doc), "phone-fixed-width")[0]?.severity).toBe("warning");
  });

  it("is part of the Design check", () => {
    const { doc } = healthyDoc();
    doc.site.customCss = ".hero{width:900px}";
    expect(designCheck(doc).some(isPhoneIssue)).toBe(true);
  });

  it("reads phone sizes from fluid tokens", () => {
    expect(phonePx("clamp(2rem, 1rem + 2vw, 3rem)")).toBe(32);
    expect(phonePx("18px")).toBe(18);
    expect(phonePx("var(--x)")).toBeUndefined();
  });
});

describe("phoneIssuesFromProbe (rendered)", () => {
  const setup = () => {
    const a = p("First words of a story");
    const b = p("Second words over it");
    const s = gridSection([
      [a, { x: 1, y: 1, w: 12, h: 4 }, { x: 1, y: 1, w: 8, h: 4 }],
      [b, { x: 13, y: 1, w: 12, h: 4 }, { x: 1, y: 2, w: 8, h: 4 }],
    ]);
    const photo = stackSection([h("Visit us", 2)]);
    photo.style.background = {
      type: "image",
      src: "media/x.jpg",
      overlay: { color: "background", opacity: 0.2 },
    };
    const pg = page("Home", "", [s, photo]);
    return { doc: siteWith([pg]), pg, s, a, b, photo };
  };
  const result = (findings: PhoneProbeResult["findings"], width = 390): PhoneProbeResult => ({
    width,
    height: 780,
    scrollWidth: width,
    findings,
  });

  it("turns overlaps into an error with a re-stack fix, once across widths", () => {
    const { doc, pg, s, b } = setup();
    const f = {
      kind: "overlap" as const,
      section: s.id,
      block: b.id,
      area: "main" as const,
      tag: "p",
      text: "Second",
    };
    const issues = phoneIssuesFromProbe(doc, pg.id, [result([f], 390), result([f], 360)]);
    expect(issues).toHaveLength(1);
    const i = issues[0] as Issue;
    expect(i.rule).toBe("phone-overlap");
    expect(i.severity).toBe("error");
    expect(i.message).toMatch(/on top of each other/);
    expect(i.autofix?.label).toBe("Re-stack for phones");
    fix(doc, i);
  });

  it("raises the photo overlay for text over a photo", () => {
    const { doc, pg, photo } = setup();
    const issues = phoneIssuesFromProbe(doc, pg.id, [
      result([
        {
          kind: "photo-contrast",
          section: photo.id,
          area: "main",
          tag: "h2",
          text: "Visit us",
          value: 2.1,
          limit: 3,
        },
      ]),
    ]);
    const fixed = fix(doc, issues[0]);
    const bg = Object.values(fixed.pages)[0]?.sections[1]?.style.background;
    expect(bg?.type === "image" && bg.overlay?.opacity).toBe(0.35);
  });

  it("puts the words first on phones when the main button is below the first screen", () => {
    const photo = img();
    const title = h("Handmade pottery", 1);
    const s = gridSection([
      [photo, { x: 1, y: 1, w: 12, h: 20 }, { x: 1, y: 1, w: 8, h: 20 }],
      [title, { x: 13, y: 4, w: 12, h: 4 }, { x: 1, y: 21, w: 8, h: 4 }],
    ]);
    const pg = page("Home", "", [s]);
    const doc = siteWith([pg]);
    const [i] = phoneIssuesFromProbe(doc, pg.id, [
      result([
        {
          kind: "cta-below-fold",
          section: s.id,
          area: "main",
          tag: "a",
          text: "Visit",
          value: 900,
          limit: 780,
        },
      ]),
    ]);
    expect(i?.severity).toBe("warning");
    expect(i?.autofix?.label).toBe("Put the words first on phones");
    const fixed = fix(doc, i);
    const layout = Object.values(fixed.pages)[0]?.sections[0]?.layout;
    if (layout?.mode !== "grid") throw new Error("grid");
    expect(layout.items[title.id]?.m?.y).toBe(1);
    expect((layout.items[photo.id]?.m?.y ?? 0) > 1).toBe(true);
  });

  it("explains findings without a fix in plain language", () => {
    const { doc, pg } = setup();
    const [i] = phoneIssuesFromProbe(doc, pg.id, [
      result([
        { kind: "tap-target", area: "footer", tag: "a", text: "Privacy", value: 20, limit: 44 },
      ]),
    ]);
    expect(i?.page).toBe("footer");
    expect(i?.message).toContain("“Privacy”");
    expect(i?.message).not.toMatch(/DOM|CSS|selector/);
    expect(i?.autofix).toBeUndefined();
  });
});

describe("fixForPhones", () => {
  it("fixes every phone issue it can in one change, without touching desktop", () => {
    const s1 = stackSection(
      [
        { ...p(LONG), column: 0 },
        { ...p(LONG), column: 1 },
      ],
      "light",
      [6, 6],
    );
    (s1.layout as { columns: { d: number[]; m?: number[] } }).columns.m = [4, 8];
    s1.style.padding = { d: "3xl", m: "3xl" };
    s1.blocks.push(p(LONG));
    const doc = siteWith([page("Home", "", [s1])]);
    doc.styles.choices.density = "airy";
    const before = phoneCheck(doc).filter((i) => i.autofix);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const r = fixForPhones(doc, {
      validateOp: (d, op) => {
        const v = validate(d, op, { registry });
        return v.ok ? v.doc : null;
      },
    });
    expect(r.fixed.length).toBe(before.length);
    expect(phoneCheck(r.doc).filter((i) => i.autofix)).toEqual([]);
    const sec = Object.values(r.doc.pages)[0]?.sections[0];
    expect(sec?.style.padding?.d).toBe("3xl");
    expect(sec?.layout.mode === "stack" && sec.layout.columns.d).toEqual([6, 6]);
  });
});

describe("the probe", () => {
  it("is a self-contained script", () => {
    expect(PHONE_PROBE_SCRIPT.startsWith("(async () => {")).toBe(true);
    // It must parse as JavaScript (it is evaluated in browsers as is).
    expect(() => new Function(`return ${PHONE_PROBE_SCRIPT}`)).not.toThrow();
  });
});
