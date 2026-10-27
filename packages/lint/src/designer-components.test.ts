import { designerComponents, designerSection } from "@omniharmonic/openspace-blocks";
import { renderPageHtml } from "@omniharmonic/openspace-renderer";
import {
  checkComponent,
  describeComponentIssues,
  resolveInternalLinks,
} from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { healthyDoc } from "./__fixtures__/doc";
import { componentIssues } from "./components";
import { publishCheck } from "./links";

// The opt-in "Designer components" library must pass every gate it imposes on sites.
describe.each(designerComponents.map((d) => [d.name, d] as const))("%s", (_name, def) => {
  it("is a valid definition", () => {
    const r = checkComponent(def);
    if (!r.ok) throw new Error(describeComponentIssues(r.issues).join("\n"));
  });

  for (const theme of ["light", "dark", "brand"] as const)
    it(`passes the quality gates with no findings (${theme} section)`, () => {
      const { doc, home } = healthyDoc();
      // Sample links are pointed at pages the site has, as the gallery does on insert.
      const section = resolveInternalLinks(designerSection(def, { colorTheme: theme }), doc).value;
      const site = {
        ...doc,
        components: { [def.name]: def },
        pages: {
          ...doc.pages,
          [home.id]: { ...home, sections: [section, ...home.sections.slice(1)] },
        },
      };
      expect(componentIssues(site).map((i) => `${i.severity} ${i.rule}: ${i.message}`)).toEqual([]);
      expect(publishCheck(site).errors).toEqual([]);
      const html = renderPageHtml({ doc: site, pageId: home.id });
      expect(html).toContain(`data-os-component="${def.name}"`);
      expect(html).toContain('<style data-os="components">');
      if (def.js) expect(html).toContain(`data-os-component-js="${def.name}"`);
      // Every image is sized (no layout shift) and described.
      for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
        expect(img).toMatch(/\bwidth="\d+"/);
        expect(img).toMatch(/\balt="/);
      }
    });
});
