import { compiledStylesFor } from "@openspace/renderer";
import { curatedPalettes } from "@openspace/theme";
import { describe, expect, it } from "vitest";
import { devSiteDocument } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import { stylesOp } from "../inspector/model/edits";
import {
  brandPatch,
  contrastIssues,
  curatedPatch,
  fixPatch,
  normaliseBrand,
  overriddenRoles,
  overridePatch,
} from "./model";

const store = () => createEditorStore({ doc: devSiteDocument(), actor: "user:test" });

describe("Site Styles ops", () => {
  it("every choice is one undoable styles.patch op", () => {
    const s = store();
    const sent: string[] = [];
    s.getState().onLocalOps((ops) => sent.push(...ops.map((o) => o.op)));
    const before = s.getState().doc.styles;
    for (const set of [
      { "choices.density": "airy" },
      { "choices.shape": "round" },
      { "choices.buttons": "pill-outline" },
      { "choices.motion": "none" },
      { "choices.imageTreatment": "arch" },
      { "choices.pairing": "newsreader-public-sans" },
      { "choices.palette.neutral": "cool" },
      { "choices.palette.contrast": "high" },
      brandPatch("#c2410c", "brand"),
      curatedPatch(curatedPalettes[2] as (typeof curatedPalettes)[number]),
    ]) {
      expect(s.getState().commit([stylesOp(set)]).ok).toBe(true);
    }
    const after = s.getState().doc.styles.choices;
    expect(after).toMatchObject({
      density: "airy",
      shape: "round",
      buttons: "pill-outline",
      motion: "none",
    });
    expect(after.palette.source).toBe("curated");
    expect(sent.every((o) => o === "styles.patch")).toBe(true);
    // The canvas restyles from the compiled tokens of the new styles object.
    expect(compiledStylesFor(s.getState().doc.styles).css).not.toBe(compiledStylesFor(before).css);
    while (s.getState().undo());
    expect(s.getState().doc.styles).toEqual(before);
  });

  it("rejects invalid choices atomically", () => {
    const s = store();
    const r = s.getState().commit([stylesOp({ "choices.density": "cosy" })]);
    expect(r.ok).toBe(false);
  });

  it("normalises brand colors people type", () => {
    expect(normaliseBrand("2F6B4F")).toBe("#2f6b4f");
    expect(normaliseBrand("#abc")).toBe("#aabbcc");
    expect(normaliseBrand("oklch(0.6 0.1 145)")).toBe("oklch(0.6 0.1 145)");
    expect(normaliseBrand("green-ish")).toBeNull();
  });
});

describe("contrast warnings", () => {
  it("lists only pairs broken by an exact color, and the one-click fix makes them pass", () => {
    const s = store();
    expect(contrastIssues(s.getState().doc.styles)).toEqual([]);
    s.getState().commit([
      stylesOp({ "overrides.color.dark.text": { $value: "#3a3a3a", $type: "color" } }),
    ]);
    const styles = s.getState().doc.styles;
    expect(overriddenRoles(styles).has("dark:text")).toBe(true);
    const issues = contrastIssues(styles);
    expect(issues.length).toBeGreaterThan(0);
    const issue = issues.find((i) => i.failure.fg === "text" && i.failure.theme === "dark");
    expect(issue?.fix?.path).toBe("overrides.color.dark.text");
    const patch = fixPatch(issue as NonNullable<typeof issue>);
    expect(patch).toBeTruthy();
    expect(s.getState().commit([stylesOp(patch as Record<string, unknown>)]).ok).toBe(true);
    expect(
      contrastIssues(s.getState().doc.styles).filter(
        (i) => i.failure.fg === "text" && i.failure.theme === "dark",
      ),
    ).toEqual([]);
  });

  it("applies color.all overrides to every theme", () => {
    const s = store();
    s.getState().commit([
      stylesOp({ "overrides.color.all.link": { $value: "#ffff00", $type: "color" } }),
    ]);
    const roles = overriddenRoles(s.getState().doc.styles);
    expect(["light", "dark", "brand"].every((t) => roles.has(`${t}:link`))).toBe(true);
  });
});

describe("DTCG overrides editor", () => {
  it("validates paths and values before saving", () => {
    expect(overridePatch("color.accent", "#123456", "color")).toEqual({
      ok: true,
      set: { "overrides.color.accent": { $value: "#123456", $type: "color" } },
    });
    expect(overridePatch("type.display.letterSpacing", "-0.02em", "dimension").ok).toBe(true);
    expect(overridePatch("color", "#123456", "color").ok).toBe(false);
    expect(overridePatch("color.accent", "red; } body { x", "color").ok).toBe(false);
    expect(overridePatch("color.accent", "url(https://x)", undefined).ok).toBe(false);
    expect(overridePatch("color.accent", "{color.accent-700}", "color").ok).toBe(true);
    expect(overridePatch("motion.fast", "120", "number")).toMatchObject({
      ok: true,
      set: { "overrides.motion.fast": { $value: 120 } },
    });
  });

  it("removes a token with an unset", () => {
    const s = store();
    s.getState().commit([
      stylesOp({ "overrides.color.accent": { $value: "#123456", $type: "color" } }),
    ]);
    s.getState().commit([stylesOp({ "overrides.color.accent": undefined })]);
    expect(JSON.stringify(s.getState().doc.styles.overrides ?? {})).not.toContain("#123456");
  });
});
