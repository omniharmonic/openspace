import { type ComponentDefinition, componentSection } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { healthyDoc } from "./__fixtures__/doc";
import { componentIssues, componentsKitGate, rangeAdmits } from "./components";
import { designCheck } from "./design-check";
import { publishCheck } from "./links";

const good: ComponentDefinition = {
  name: "quiet-hero",
  label: "Quiet hero",
  version: 1,
  fields: {
    headline: { kind: "text" },
    intro: { kind: "richText", optional: true },
    cta: { kind: "link", optional: true },
    ctaLabel: { kind: "text", optional: true },
  },
  defaults: {
    headline: "Breathe in",
    cta: { type: "url", url: "https://cal.com/x" },
    ctaLabel: "Book",
  },
  template: `<header class="qh"><h2>{{headline}}</h2>{{rich intro}}{{#if cta}}{{button cta label=ctaLabel}}{{/if}}</header>`,
  css: `:scope { color: var(--os-color-text); background: var(--os-color-background); }
.qh h2 { animation: up 500ms both; font-family: var(--os-font-heading); }
@keyframes up { from { transform: translateY(8px); opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .qh h2 { animation: none } }
@media (max-width: 767px) { .qh { padding: var(--os-space-md) } }`,
};

function docWith(def: ComponentDefinition, fields?: Record<string, unknown>) {
  const { doc, home } = healthyDoc();
  const section = componentSection(def, fields ? { fields } : {});
  return {
    doc: {
      ...doc,
      components: { [def.name]: def },
      pages: { ...doc.pages, [home.id]: { ...home, sections: [...home.sections, section] } },
    },
    home,
    section,
  };
}

const rules = (doc: ReturnType<typeof docWith>["doc"]) =>
  componentIssues(doc).map((i) => `${i.severity}:${i.rule}`);

describe("component quality gates", () => {
  it("a well-made component passes", () => {
    const { doc } = docWith(good);
    expect(rules(doc)).toEqual([]);
    expect(publishCheck(doc).ok).toBe(true);
  });

  it("flags animation without reduced motion (error), fixed colours and odd breakpoints (warnings)", () => {
    const { doc } = docWith({
      ...good,
      css: `.qh h2 { animation: up 1s; color: #ff0044; }
@keyframes up { from { opacity: 0 } }
@media (max-width: 900px) { .qh { width: 1200px } }`,
    });
    const r = rules(doc);
    expect(r).toContain("error:component-motion");
    expect(r).toContain("warning:component-color");
    expect(r).toContain("warning:component-breakpoints");
    const check = publishCheck(doc);
    expect(check.ok).toBe(false);
    expect(check.errors[0]?.rule).toBe("component");
  });

  it("flags mobile trouble and unused fields", () => {
    const { doc } = docWith({
      ...good,
      fields: { ...good.fields, unused: { kind: "text", optional: true } },
      css: ".qh { width: 1100px; position: fixed }",
    });
    const r = rules(doc);
    expect(r).toContain("warning:component-mobile");
    expect(r).toContain("warning:component-unused-field");
  });

  it("checks rendered output: link names, hidden focusables, heading order", () => {
    const { doc } = docWith({
      ...good,
      fields: { ...good.fields, more: { kind: "link", optional: true } },
      defaults: { ...good.defaults, more: { type: "url", url: "https://example.com" } },
      template: `<div><h2>{{headline}}</h2><h4>Skipped</h4>{{#link more}}{{/link}}<div aria-hidden="true"><a href="/x">x</a></div>{{rich intro}}{{button cta label=ctaLabel}}<svg viewBox="0 0 1 1"><path d="M0 0" /></svg></div>`,
    });
    const r = rules(doc);
    expect(r).toContain("error:component-a11y");
    expect(r).toContain("warning:component-heading-order");
    const messages = componentIssues(doc)
      .map((i) => i.message)
      .join("\n");
    expect(messages).toMatch(/link has no text/);
    expect(messages).toMatch(/hidden from screen readers but can still be focused/);
    expect(messages).toMatch(/drawing \(svg\)/);
  });

  it("flags low-contrast token pairs", () => {
    const { doc } = docWith({
      ...good,
      css: ".qh { color: var(--os-color-neutral-200); background-color: var(--os-color-neutral-100) }",
    });
    expect(rules(doc).some((r) => r.endsWith("component-contrast"))).toBe(true);
  });

  it("flags budgets and invalid definitions", () => {
    const big = docWith({ ...good, js: `// ${"x".repeat(7000)}\nroot.dataset.ok = "1";` });
    expect(rules(big.doc)).toContain("error:component-budget");
    const broken = healthyDoc().doc;
    const invalid = {
      ...broken,
      components: { "quiet-hero": { ...good, template: "<p>{{nope}}</p>" } },
    };
    expect(componentIssues(invalid).map((i) => i.rule)).toContain("component-invalid");
  });

  it("is part of the Design check", () => {
    const { doc, home } = docWith({ ...good, css: ".qh { color: red }" });
    expect(designCheck(doc, home.id).some((i) => i.rule === "component-color")).toBe(true);
  });
});

describe("site-kit gate", () => {
  it("reads lock files, ranges and installed versions", () => {
    expect(rangeAdmits("^0.1.0", "0.1.11")).toBe(true);
    expect(rangeAdmits("~0.1.4", "0.1.11")).toBe(true);
    expect(rangeAdmits("0.1.9", "0.1.11")).toBe(false);
    expect(rangeAdmits("^0.0.9", "0.1.11")).toBe(false);
    expect(rangeAdmits("workspace:*", "0.1.11")).toBe(true);
    const pkg = (range: string) =>
      JSON.stringify({ dependencies: { "@omniharmonic/openspace-site-kit": range } });
    expect(componentsKitGate({ packageJson: pkg("^0.1.0") }).ok).toBe(true);
    expect(componentsKitGate({ packageJson: pkg("0.1.10") }).ok).toBe(false);
    const lock = (v: string) =>
      JSON.stringify({
        packages: { "node_modules/@omniharmonic/openspace-site-kit": { version: v } },
      });
    expect(componentsKitGate({ packageJson: pkg("^0.1.0"), packageLock: lock("0.1.10") }).ok).toBe(
      false,
    );
    expect(componentsKitGate({ packageJson: pkg("^0.1.0"), packageLock: lock("0.1.12") }).ok).toBe(
      true,
    );
    expect(componentsKitGate({ installed: "0.1.10" }).message).toMatch(/latest OpenSpace update/);
  });

  it("blocks a publish only when the draft uses components and the kit is too old", () => {
    const { doc } = docWith(good);
    const old = {
      packageJson: JSON.stringify({
        dependencies: { "@omniharmonic/openspace-site-kit": "0.1.9" },
      }),
    };
    const r = publishCheck(doc, { siteKit: old });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.rule)).toContain("kit");
    expect(publishCheck(healthyDoc().doc, { siteKit: old }).ok).toBe(true);
  });
});
