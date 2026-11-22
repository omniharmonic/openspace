import { describe, expect, it } from "vitest";
import { devSiteDocument } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import { stylesOp } from "../inspector/model/edits";
import { catalogFont, FONT_CATALOG, previewCssUrl } from "./font-catalog";
import {
  type FontPick,
  fontsInUse,
  roleFont,
  roleFontPatch,
  roleForTextStyle,
  tidyFamily,
} from "./roleFonts";

const UPLOADED = {
  family: "Studio Grotesk",
  category: "sans-serif" as const,
  files: [
    { src: "media/fonts/studio-grotesk-400-abcd1234.woff2", weight: 400, style: "normal" as const },
  ],
  license: { webUse: true as const },
};

function store() {
  const s = createEditorStore({ doc: devSiteDocument(), actor: "user:test" });
  const r = s.getState().commit([stylesOp({ fonts: [UPLOADED] })], { label: "seed" });
  expect(r.ok).toBe(true);
  return s;
}

function pick(s: ReturnType<typeof store>, role: "heading" | "body" | "label", p: FontPick) {
  const r = s.getState().commit([stylesOp(roleFontPatch(role, p))], { label: "t" });
  expect(r.ok, JSON.stringify(!r.ok && r.errors)).toBe(true);
  return s.getState().doc.styles;
}

describe("role fonts", () => {
  it("reads the pairing's fonts until a role is changed", () => {
    const styles = store().getState().doc.styles;
    expect(roleFont(styles, "heading").source).toBe("pairing");
    expect(roleFont(styles, "body").source).toBe("pairing");
    // Curated pairings have no label font: labels follow the text font.
    expect(roleFont(styles, "label")).toMatchObject({ followsText: true });
  });

  it("switches a role between Google, uploaded and pairing fonts with one valid patch each", () => {
    const s = store();
    let styles = pick(s, "heading", { kind: "google", family: "Playfair Display" });
    expect(roleFont(styles, "heading")).toEqual({ family: "Playfair Display", source: "google" });
    expect(styles.choices.typography?.heading?.category).toBe("serif");

    styles = pick(s, "heading", { kind: "uploaded", family: "Studio Grotesk" });
    expect(roleFont(styles, "heading")).toEqual({ family: "Studio Grotesk", source: "uploaded" });
    // The Google font underneath is gone, so removing the upload falls back to the pairing.
    expect(styles.choices.typography?.heading).toBeUndefined();

    styles = pick(s, "heading", { kind: "google", family: "Caveat" });
    expect(styles.choices.headingFont).toBeUndefined();
    expect(styles.choices.typography?.heading?.family).toBe("Caveat");

    styles = pick(s, "heading", { kind: "pairing" });
    expect(roleFont(styles, "heading").source).toBe("pairing");
  });

  it("gives labels their own font or lets them follow the text", () => {
    const s = store();
    let styles = pick(s, "label", { kind: "google", family: "DM Mono" });
    expect(roleFont(styles, "label")).toEqual({ family: "DM Mono", source: "google" });
    expect(styles.choices.typography?.label).toEqual({ family: "DM Mono", category: "monospace" });
    styles = pick(s, "label", { kind: "pairing" });
    expect(roleFont(styles, "label").followsText).toBe(true);
    expect(() => roleFontPatch("label", { kind: "uploaded", family: "Studio Grotesk" })).toThrow();
  });

  it("lists the fonts in use once each", () => {
    const s = store();
    const styles = pick(s, "label", { kind: "google", family: "Inter" });
    const used = fontsInUse(styles);
    expect(used).toContain("Inter");
    expect(new Set(used.map((f) => f.toLowerCase())).size).toBe(used.length);
  });

  it("maps text styles to the role they draw from", () => {
    expect(roleForTextStyle("h2")).toBe("heading");
    expect(roleForTextStyle("display")).toBe("heading");
    expect(roleForTextStyle("eyebrow")).toBe("label");
    expect(roleForTextStyle("body")).toBe("body");
    expect(roleForTextStyle(null)).toBe("body");
  });
});

describe("font catalog", () => {
  it("has every pairing family once, sorted, with valid names", () => {
    const names = FONT_CATALOG.map((f) => f.family.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(catalogFont("fraunces")?.kind).toBe("serif");
    for (const f of FONT_CATALOG) expect(f.family).toMatch(/^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/);
  });

  it("loads previews as one small Google Fonts request", () => {
    const url = previewCssUrl(["DM Sans", "Lora"]);
    expect(url).toContain("family=DM+Sans&family=Lora");
    expect(url).toContain("&text=");
  });

  it("tidies typed family names", () => {
    expect(tidyFamily("  playfair   display ")).toBe("Playfair Display");
  });
});

describe("text styles", () => {
  it("reads defaults, tunes a size (phone follows), and resets", async () => {
    const { resolveStep, sizePatch, resetStepPatch, scaleAllPatch, stepPatch } = await import(
      "./typeStyles"
    );
    const s = store();
    const before = resolveStep(s.getState().doc.styles, "h1");
    expect(before.tuned).toBe(false);
    expect(before.size).toBeGreaterThan(resolveStep(s.getState().doc.styles, "h2").size);
    const commit = (set: Record<string, unknown>) =>
      expect(s.getState().commit([stylesOp(set)], { label: "t" }).ok).toBe(true);
    commit(sizePatch("h1", 64));
    let h1 = resolveStep(s.getState().doc.styles, "h1");
    expect(h1).toMatchObject({ size: 64, mobileAuto: true, tuned: true });
    expect(h1.sizeMobile).toBeLessThan(64);
    commit(stepPatch("h1", "lineHeight", 1.25));
    commit(stepPatch("h1", "case", "uppercase"));
    h1 = resolveStep(s.getState().doc.styles, "h1");
    expect(h1).toMatchObject({ lineHeight: 1.25, case: "uppercase" });
    commit(resetStepPatch("h1"));
    expect(resolveStep(s.getState().doc.styles, "h1")).toEqual(before);
    // Everything larger: every style grows, within its range, in one valid patch.
    commit(scaleAllPatch(s.getState().doc.styles, 1.1));
    expect(resolveStep(s.getState().doc.styles, "body").size).toBeGreaterThan(
      resolveStep(store().getState().doc.styles, "body").size,
    );
  });

  it("finds the text styles a block's rich text uses", async () => {
    const { textStylesIn } = await import("./typeStyles");
    const fields = { text: { kind: "richText" } } as never;
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { preset: "eyebrow" }, content: [] },
        { type: "heading", attrs: { level: 1, preset: "display" }, content: [] },
        { type: "paragraph", content: [] },
      ],
    };
    expect(textStylesIn(fields, { text: doc })).toEqual(["display", "body", "eyebrow"]);
  });
});
