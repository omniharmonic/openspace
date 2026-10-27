import { presetSection, sectionPresets } from "@omniharmonic/openspace-blocks";
import {
  lockedSectionsOf,
  type Op,
  type OpBody,
  transformForRole,
} from "@omniharmonic/openspace-ops";
import { newId, type Page, type Section, type SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { PAGE_TEMPLATES } from "../../pages/pageTemplates";
import { NOT_FOUND_TEMPLATE } from "../../settings/AdvancedSettings";
import { devSiteDocument } from "./dev-site";
import { STARTERS } from "./starters";

/** M-5 as an Editor: everything Studio offers is allowed; arbitrary looks are not. */
const doc: SiteDocument = devSiteDocument();
const home = Object.values(doc.pages)[0] as Page;
const check = (body: OpBody) =>
  transformForRole(
    { ...body, id: "op_test", actor: "user:ed", ts: 1 } as unknown as Op,
    "editor",
    lockedSectionsOf(doc),
    {
      doc,
      presetSection,
    },
  );

describe("Editor looks (M-5)", () => {
  it("allows every page template, including Blank and the 404 page", () => {
    for (const t of [...PAGE_TEMPLATES, NOT_FOUND_TEMPLATE]) {
      const page = {
        id: newId("pg"),
        title: t.title,
        slug: `${t.slug}-x`,
        sections: t.build(),
      } as Page;
      expect(check({ op: "page.create", page } as OpBody), t.id).toMatchObject({ allowed: true });
    }
  });

  it("allows every '+' starter and every gallery preset, in any color theme", () => {
    for (const s of STARTERS)
      expect(
        check({ op: "section.insert", page: home.id, at: "end", section: s.build() } as OpBody),
        s.id,
      ).toMatchObject({ allowed: true });
    for (const p of sectionPresets.filter((x) => x.target === "page"))
      for (const theme of ["light", "dark-accent"] as const)
        expect(
          check({
            op: "section.insert",
            page: home.id,
            at: "end",
            section: p.build({ colorTheme: theme }),
          } as OpBody),
          `${p.id} ${theme}`,
        ).toMatchObject({ allowed: true });
  });

  it("still refuses arbitrary styled or grid sections, even with a forged ref", () => {
    const base = STARTERS[0]?.build() as Section;
    const styled = { ...base, style: { ...base.style, padding: { d: "3xl" } } } as Section;
    const forged = { ...styled, preset: "starter/stack-12@1" } as Section;
    for (const section of [styled, forged])
      expect(
        check({ op: "section.insert", page: home.id, at: "end", section } as OpBody),
      ).toMatchObject({ allowed: false });
  });
});
