import { describe, expect, it } from "vitest";
import { allJsonSchemas, DOCUMENT_SCHEMAS, schemaUrl, toJsonSchema } from "./json-schema";

describe("JSON Schema export", () => {
  const all = allJsonSchemas();

  it("exports every top-level document", () => {
    expect(Object.keys(all).sort()).toEqual(Object.keys(DOCUMENT_SCHEMAS).sort());
    for (const [name, schema] of Object.entries(all)) {
      expect(schema.$id).toBe(schemaUrl(name as keyof typeof DOCUMENT_SCHEMAS));
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      // round-trips through JSON (no functions, no undefined)
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    }
  });

  it("names shared definitions instead of anonymous refs", () => {
    const page = toJsonSchema("page");
    const defs = Object.keys(page.$defs as object);
    expect(defs).toEqual(
      expect.arrayContaining(["Page", "Section", "Block", "StackLayout", "GridLayout", "MediaSrc"]),
    );
    expect(defs.some((d) => d.startsWith("__schema"))).toBe(false);
    expect(page.$ref).toBe("#/$defs/Page");
  });

  it("represents recursive rich text with refs", () => {
    const rt = JSON.stringify(toJsonSchema("rich-text"));
    expect(rt).toContain('"$ref":"#/$defs/RichTextBlockNode"');
    expect(rt).toContain('"const":"hardBreak"');
  });

  it("keeps constraints agents rely on", () => {
    const config = JSON.stringify(toJsonSchema("site-config"));
    expect(config).toContain("^st_[0123456789abcdefghjkmnpqrstvwxyz]{10}$");
    expect(config).toContain('"enum":["github-pages","cloudflare"]');
    const doc = toJsonSchema("site-document") as { $defs: Record<string, unknown> };
    expect(Object.keys(doc.$defs)).toEqual(
      expect.arrayContaining([
        "SiteConfig",
        "Site",
        "Styles",
        "Page",
        "CollectionItem",
        "MediaMeta",
      ]),
    );
    const form = JSON.stringify(toJsonSchema("form"));
    expect(form).not.toContain('"password"');
  });
});
