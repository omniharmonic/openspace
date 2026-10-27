import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { planSite, renderRoute } from "@omniharmonic/openspace-site-kit";
import type { AxeResults } from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { loadTemplate, TEMPLATE_IDS } from "../index";

/**
 * axe-core over every owner page of every template (rendered exactly as a build would). The
 * DOM here has no layout or painted images, so axe's colour-contrast rule can't judge text over
 * photographs; the Design check's `text-over-photo-contrast` rule is the guard for that. Every
 * other rule must report no serious or critical violations.
 */

const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

async function axe(html: string): Promise<AxeResults> {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(AXE_SOURCE);
  const w = dom.window as unknown as {
    axe: { run: (ctx: unknown, opts: unknown) => Promise<AxeResults> };
  };
  try {
    return await w.axe.run(dom.window.document, {
      rules: { "color-contrast": { enabled: false } },
      resultTypes: ["violations"],
    });
  } finally {
    dom.window.close();
  }
}

it("axe runs in this DOM (a control page with real violations)", async () => {
  const r = await axe(
    `<!doctype html><html><head><title>x</title></head><body><main><img src="a.png"><button></button></main></body></html>`,
  );
  expect(r.violations.map((v) => v.id)).toEqual(
    expect.arrayContaining(["image-alt", "button-name", "html-has-lang"]),
  );
});

describe.each(TEMPLATE_IDS)("template %s accessibility", (id) => {
  it("has no serious or critical axe violations on any page", async () => {
    const t = loadTemplate(id);
    if (!t) throw new Error(id);
    const plan = planSite(t.doc, { now: new Date("2026-10-26T12:00:00Z") });
    const location = {
      site: "https://example.github.io",
      base: `/${id}`,
      basePath: `/${id}`,
      siteUrl: `https://example.github.io/${id}/`,
    };
    const problems: string[] = [];
    for (const route of plan.routes.filter((r) => r.kind === "page")) {
      const html = renderRoute({ plan, route, location, ogImages: false });
      const result = await axe(html);
      for (const v of result.violations)
        if (v.impact === "serious" || v.impact === "critical")
          problems.push(
            `${route.path} ${v.id} (${v.impact}): ${v.help} — ${v.nodes
              .slice(0, 2)
              .map((n) => n.target.join(" "))
              .join(", ")}`,
          );
    }
    expect(problems.join("\n")).toBe("");
  }, 120_000);
});
