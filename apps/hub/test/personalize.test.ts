import type { SiteId } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { personalizeDocument, rebrandFields } from "../src/services/personalize";
import { loadSiteDocument } from "../src/services/site-files";
import { basicTemplate } from "../src/templates/basic";

describe("personalize: the footer follows the new site name", () => {
  it("renames the template's sample brand in footer text, not in links", () => {
    expect(
      rebrandFields(
        {
          text: "Relay",
          items: [{ label: "© 2026 Relay Software Ltd.", href: "https://Relay.example" }],
        },
        "Relay",
        "Maya Yoga",
      ),
    ).toEqual({
      text: "Maya Yoga",
      items: [{ label: "© 2026 Maya Yoga Software Ltd.", href: "https://Relay.example" }],
    });
    expect(rebrandFields({ text: "Hello" }, "Relay", "Maya Yoga")).toBeNull();
  });

  it("creates a site whose footer wordmark is the site name", () => {
    const base = loadSiteDocument(basicTemplate.files);
    const footerText = base.site.footer.blocks[0];
    if (!footerText) throw new Error("fixture has no footer text");
    footerText.fields = {
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "© 2026 Basic" }] }],
      },
    };
    const look = basicTemplate.meta.looks[0];
    if (!look) throw new Error("fixture has no look");
    const doc = personalizeDocument(base, {
      siteId: "st_0000000000" as SiteId,
      name: "Maya Yoga",
      look,
      hubUrl: "http://localhost:8787",
      deployUrl: "http://localhost:8787/s/st_0000000000/",
      template: basicTemplate.meta,
      actor: "user:test",
      now: 0,
    });
    expect(JSON.stringify(doc.site.footer.blocks[0]?.fields)).toContain("© 2026 Maya Yoga");
    expect(JSON.stringify(doc.site.footer)).not.toContain("Basic");
  });
});
