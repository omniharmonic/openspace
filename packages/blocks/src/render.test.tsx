import {
  BEHAVIORS,
  behaviorsInHtml,
  renderPageHtml,
  unregisterBlocks,
} from "@omniharmonic/openspace-renderer";
import { SiteDocumentSchema } from "@omniharmonic/openspace-schema";
import { HtmlValidate } from "html-validate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gridSection, page, siteWith, stackSection } from "./__fixtures__/site";
import { allBlocks, blocksStyleTag, registerAll } from "./index";

beforeAll(() => registerAll());
afterAll(() => unregisterBlocks());

/**
 * Structural HTML validation. Style-only rules are off; everything about nesting, ids, ARIA,
 * labels and attribute validity stays on.
 */
const validator = new HtmlValidate({
  extends: ["html-validate:recommended"],
  rules: {
    "no-inline-style": "off", // per-instance custom properties are set inline by design
    "attribute-boolean-style": "off",
    "attribute-empty-style": "off",
    "void-style": "off",
    "no-trailing-whitespace": "off",
    "attr-case": "off", // React emits srcSet/fetchPriority; HTML attributes are case-insensitive
    "long-title": "off",
    "no-redundant-role": "off",
    "doctype-style": "off",
    "prefer-native-element": "off",
    "no-implicit-button-type": "error",
  },
});

/** One page per block: a light stack section per variant, a dark-theme section and a grid section. */
function libraryDoc() {
  const pages = allBlocks.map((def) => {
    const variants = def.variants.length ? def.variants : [undefined];
    const sections = variants.map((variant) =>
      stackSection([def.create(variant ? { variant } : {})]),
    );
    sections.push(stackSection([def.create()], "dark-accent"));
    sections.push(gridSection([def.create()]));
    return page(def.label, def.type, sections);
  });
  return siteWith(pages);
}

const INLINE_SCRIPT_RE =
  /<script(?![^>]*\b(?:type="application\/ld\+json"|src=))[^>]*>([\s\S]*?)<\/script>/g;

describe("every block × variant renders through renderPageHtml", () => {
  const doc = libraryDoc();

  it("builds a valid site document", () => {
    const parsed = SiteDocumentSchema.safeParse(doc);
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([]);
  });

  for (const p of Object.values(doc.pages)) {
    for (const mode of ["production", "preview"] as const) {
      it(`${p.slug} (${mode})`, async () => {
        const html = renderPageHtml({ doc, pageId: p.id, mode, extraHead: blocksStyleTag() });

        // Every block rendered (no invalid/unknown notices, nothing silently dropped).
        expect(html).not.toContain('class="os-block-missing"');
        const blocks = p.sections.flatMap((s) => s.blocks);
        for (const b of blocks) expect(html).toContain(`data-os-id="${b.id}"`);

        // No inline scripts except the renderer's one-line `os-js` class toggle.
        const inline = [...html.matchAll(INLINE_SCRIPT_RE)].map((m) => m[1]);
        expect(inline).toEqual(["document.documentElement.classList.add('os-js')"]);
        // No React runtime.
        expect(html).not.toMatch(/data-reactroot|hydrateRoot|react-dom/);
        // Only known behaviors.
        for (const m of html.matchAll(/data-os-behavior="([^"]*)"/g))
          for (const name of (m[1] ?? "").split(/\s+/))
            expect(BEHAVIORS as readonly string[]).toContain(name);

        const report = await validator.validateString(html);
        const messages = report.results.flatMap((r) =>
          r.messages.map((m) => `${m.ruleId}: ${m.message} — ${m.selector ?? ""}`),
        );
        expect(messages).toEqual([]);
      });
    }
  }

  it("JSON-LD is the only other script type on the page", () => {
    const faq = Object.values(doc.pages).find((p) => p.slug === "accordion");
    if (!faq) throw new Error("accordion page missing");
    const html = renderPageHtml({ doc, pageId: faq.id });
    expect(html).toContain(
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage"',
    );
    expect(behaviorsInHtml(html)).toContain("accordion");
  });
});

describe("comparison table and pricing toggle", () => {
  const html = (block: ReturnType<(typeof allBlocks)[number]["create"]>) => {
    const p = page("T", "t", [stackSection([block])]);
    return renderPageHtml({ doc: siteWith([p]), pageId: p.id });
  };

  it("table: real headers, checks and dashes with text, a focusable scroll box", () => {
    const def = allBlocks.find((b) => b.type === "table");
    if (!def) throw new Error("no table block");
    const out = html(
      def.create({
        fields: {
          corner: "Features",
          rows: [
            { label: "Basics", group: true, cells: [] },
            {
              label: "Classes",
              group: false,
              cells: [{ value: "yes" }, { value: "no" }, { value: "3" }],
            },
          ],
        },
      }),
    );
    expect(out).toContain('<th scope="col" class="os-table__corner">Features</th>');
    expect(out).toMatch(/<th scope="colgroup" colSpan="4">Basics<\/th>/i);
    expect(out).toContain('<th scope="row" class="os-table__rowhead">Classes</th>');
    expect(out).toContain("Included</span>");
    expect(out).toContain("Not included</span>");
    expect(out).toMatch(
      /<div class="os-table__scroll" role="group" aria-label="[^"]*scrolls sideways[^"]*" tabindex="0"/,
    );
    expect(out).toContain("os-table__hint");
  });

  it("pricing: a CSS-only billing toggle appears only with both labels and a second price", () => {
    const def = allBlocks.find((b) => b.type === "pricing");
    if (!def) throw new Error("no pricing block");
    const base = def.create();
    expect(html(base)).not.toContain("os-pricing__toggle");
    const plans = (base.fields.plans as Record<string, unknown>[]).map((p, i) => ({
      ...p,
      ...(i === 1 ? { altPrice: "$99", altPeriod: "/ month, billed yearly" } : {}),
    }));
    const out = html(
      def.create({
        fields: { plans, periodLabel: "Monthly", altPeriodLabel: "Yearly", altNote: "Save 20%" },
      }),
    );
    expect(out).toContain('class="os-pricing__toggle"');
    expect(out.match(/type="radio"/g)).toHaveLength(2);
    expect(out).toMatch(/type="radio"[^>]*checked/);
    expect(out).toContain("$99");
    expect(out).toContain("os-pricing__price is-main has-alt");
    expect(out.slice(out.indexOf("os-pricing"))).not.toMatch(/data-os-behavior="[^"]*pricing/);
  });
});
