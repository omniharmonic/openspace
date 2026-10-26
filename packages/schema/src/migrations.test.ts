import { describe, expect, it } from "vitest";
import { siteFixture } from "./__fixtures__/site";
import { SiteDocumentSchema } from "./document";
import {
  CURRENT_SCHEMA_VERSION,
  migrateSite,
  type SiteContentLike,
  siteMigrationRegistry,
} from "./migrations";

describe("migrateSite", () => {
  it("is a no-op for current content", () => {
    const doc = siteFixture();
    const r = migrateSite(doc);
    expect(r).toMatchObject({
      from: CURRENT_SCHEMA_VERSION,
      to: CURRENT_SCHEMA_VERSION,
      applied: [],
    });
    expect(SiteDocumentSchema.safeParse(r.content).success).toBe(true);
  });

  it("runs migrations in order without mutating the input", () => {
    const migrations = siteMigrationRegistry([
      {
        from: 2,
        description: "rename site.name → site.title",
        up: (c) => {
          const site = c.site as { name?: string; title?: string };
          site.title = site.name;
          delete site.name;
          return c;
        },
      },
      {
        from: 1,
        description: "add locale",
        up: (c) => ({ ...c, site: { ...(c.site as object), locale: "en" } }),
      },
    ]);
    const input: SiteContentLike = { config: { schemaVersion: 1 }, site: { name: "Maya" } };
    const r = migrateSite(input, { migrations, target: 3 });
    expect(r.content).toEqual({
      config: { schemaVersion: 3 },
      site: { title: "Maya", locale: "en" },
    });
    expect(r.applied).toEqual(["1 → 2: add locale", "2 → 3: rename site.name → site.title"]);
    expect(input).toEqual({ config: { schemaVersion: 1 }, site: { name: "Maya" } });
  });

  it("refuses newer content, missing steps and bad versions", () => {
    expect(() => migrateSite({ config: { schemaVersion: CURRENT_SCHEMA_VERSION + 1 } })).toThrow(
      /newer/,
    );
    expect(() =>
      migrateSite({ config: { schemaVersion: 1 } }, { migrations: new Map(), target: 2 }),
    ).toThrow(/No migration from schemaVersion 1/);
    expect(() => migrateSite({ config: { schemaVersion: 0 } })).toThrow(
      /valid config.schemaVersion/,
    );
    expect(() =>
      siteMigrationRegistry([
        { from: 1, description: "a", up: (c) => c },
        { from: 1, description: "b", up: (c) => c },
      ]),
    ).toThrow(/Two migrations/);
  });
});
