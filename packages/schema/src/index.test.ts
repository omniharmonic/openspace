import { describe, expect, it } from "vitest";
import * as schema from "./index";

describe("@omniharmonic/openspace-schema", () => {
  it("exports its package name", () => {
    expect(schema.name).toBe("@omniharmonic/openspace-schema");
  });

  it("exports the public API", () => {
    for (const key of [
      "newId",
      "isId",
      "resolve",
      "responsive",
      "SiteConfigSchema",
      "SiteSchema",
      "StylesSchema",
      "PageSchema",
      "SectionSchema",
      "BlockSchema",
      "RichTextDocSchema",
      "CollectionItemSchema",
      "MediaMetaSchema",
      "FormSchema",
      "SiteDocumentSchema",
      "defineBlock",
      "f",
      "createBlockRegistry",
      "toMarkdown",
      "fromMarkdown",
      "plainText",
      "migrateSite",
      "migrateBlock",
      "toJsonSchema",
      "allJsonSchemas",
      "blockFieldsJsonSchema",
      "scanForSecrets",
    ]) {
      expect(schema, key).toHaveProperty(key);
    }
  });
});
