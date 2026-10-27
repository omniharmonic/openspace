import { blockText } from "@omniharmonic/openspace-lint";
import { deepEqual } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { loadTemplate } from "@omniharmonic/openspace-templates";
import { describe, expect, it } from "vitest";
import { createEditorStore } from "../editor/model/store";
import { lookSiteStyles, planLook, presetParts, previewLook } from "./mapping";

function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error("missing");
  return v;
}
const meadow = () => must(loadTemplate("meadow")).doc;
const harbor = () => must(loadTemplate("harbor"));

/** Every block's words, by id: content must never change with a look. */
function words(doc: SiteDocument): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of Object.values(doc.pages))
    for (const s of p.sections) for (const b of s.blocks) out[b.id] = blockText(b);
  return out;
}

describe("Try a new look: mapping", () => {
  it("parses preset references", () => {
    expect(presetParts("hero/split-image@2")).toEqual({
      category: "hero",
      base: "hero/split-image",
    });
    expect(presetParts(undefined)).toBeNull();
  });

  it("applies the look's Site Styles and the template's section themes and variants", () => {
    const current = meadow();
    const t = harbor();
    const look = t.meta.looks[1]?.styles ?? must(t.meta.looks[0]).styles;
    const plan = planLook(current, t.doc, look);
    const { doc, bodies } = previewLook(current, plan);

    // Every planned op is valid against the site (nothing dropped).
    expect(bodies).toHaveLength(plan.bodies.length);
    expect(doc.styles.choices).toEqual(look.choices);
    expect(doc.site.header.variant).toBe(t.doc.site.header.variant);

    // Matched sections follow their counterpart's color theme.
    const sections = new Map(
      Object.values(t.doc.pages).flatMap((p) => p.sections.map((s) => [s.id, s] as const)),
    );
    const matched = plan.matches.filter((m) => m.page !== "footer");
    expect(matched.length).toBeGreaterThan(5);
    for (const m of matched) {
      const after = doc.pages[m.page as never]?.sections.find((s) => s.id === m.section);
      const twin = sections.get(m.counterpart as never);
      expect(after?.style.colorTheme).toEqual(twin?.style.colorTheme);
      // hero → hero, contact → contact…
      expect(presetParts(twin?.preset)?.category).toBe(m.category);
    }

    // Content is untouched: same pages, same sections in the same order, same words.
    expect(Object.keys(doc.pages)).toEqual(Object.keys(current.pages));
    for (const p of Object.values(current.pages))
      expect(doc.pages[p.id]?.sections.map((s) => s.id)).toEqual(p.sections.map((s) => s.id));
    expect(words(doc)).toEqual(words(current));
    expect(doc.site.nav).toEqual(current.site.nav);
    expect(doc.site.title).toBe(current.site.title);
  });

  it("keeps sections without a counterpart as they are", () => {
    const current = meadow();
    const home = must(Object.values(current.pages).find((p) => p.slug === ""));
    const loose = must(home.sections[1]);
    // A section that isn't from a preset has nothing to follow.
    delete (loose as { preset?: string }).preset;
    const t = harbor();
    const plan = planLook(current, t.doc, must(t.meta.looks[0]).styles);
    expect(plan.unmatched).toContainEqual({ page: home.id, section: loose.id });
    const { doc } = previewLook(current, plan);
    const after = doc.pages[home.id]?.sections[1];
    expect(after?.style).toEqual(loose.style);
    expect(after?.blocks).toEqual(loose.blocks);
  });

  it("keeps the owner's exact tweaks only when asked", () => {
    const current = meadow();
    current.styles.overrides = {
      color: { accent: { $value: "#7a1f5c", $type: "color" } },
    } as never;
    const look = must(harbor().meta.looks[0]).styles;
    expect(lookSiteStyles(current.styles, look, { keepTweaks: true }).overrides).toEqual(
      current.styles.overrides,
    );
    expect(lookSiteStyles(current.styles, look).overrides).toEqual(look.overrides);
  });

  it("is one undo step in the editor, and a second application changes nothing", () => {
    const current = meadow();
    const t = harbor();
    const look = must(t.meta.looks[2]).styles;
    const store = createEditorStore({ doc: current, actor: "user:test" });
    const { bodies } = previewLook(current, planLook(current, t.doc, look));
    const r = store.getState().commit(bodies, { label: "Use the Harbor look" });
    expect(r.ok).toBe(true);
    expect(store.getState().undoStack).toHaveLength(1);

    const again = planLook(store.getState().doc, t.doc, look);
    expect(again.bodies).toEqual([]);

    store.getState().undo();
    expect(deepEqual(store.getState().doc, current)).toBe(true);
  });

  it("maps every template onto every other without an invalid op", () => {
    const ids = ["meadow", "signal", "atelier", "link"];
    for (const from of ids)
      for (const to of ids) {
        if (from === to) continue;
        const current = must(loadTemplate(from)).doc;
        const t = must(loadTemplate(to));
        for (const l of t.meta.looks) {
          const plan = planLook(current, t.doc, l.styles);
          expect(previewLook(current, plan).bodies).toHaveLength(plan.bodies.length);
        }
      }
  });
});
