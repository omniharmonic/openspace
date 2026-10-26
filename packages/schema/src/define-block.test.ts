import { describe, expect, expectTypeOf, it } from "vitest";
import { IDS, siteFixture } from "./__fixtures__/site";
import type { Block } from "./block";
import { createBlockRegistry } from "./block-registry";
import { defineBlock } from "./define-block";
import { f } from "./fields";
import { isId } from "./ids";
import { blockFieldsJsonSchema } from "./json-schema";
import { migrateBlock } from "./migrations";
import type { ImageValue } from "./primitives";
import { fromMarkdown } from "./richtext";
import type { RichTextDoc } from "./richtext-schema";

const testimonial = defineBlock({
  type: "testimonial",
  version: 2,
  category: "social-proof",
  label: "Testimonial",
  icon: "quote",
  fields: {
    quote: f.richText({ marks: ["bold", "italic"], blocks: ["paragraph"], maxLength: 600 }),
    name: f.text({ maxLength: 80, ai: "The person's real name." }),
    role: f.text({ optional: true, help: "Job title or relationship" }),
    photo: f.image({ optional: true, aspect: "1:1" }),
    rating: f.number({ min: 0, max: 5, integer: true, optional: true }),
  },
  variants: ["card", "large", "minimal"],
  styleSlots: ["colorTheme", "padding", "radius", "border", "typography.quote", "align"],
  defaults: {
    variant: "card",
    fields: { name: "Alex Rivera", quote: fromMarkdown("Maya's classes changed how I *breathe*.") },
  },
  ai: {
    purpose: "A short quote from a client or customer, attributed to a named person.",
    whenToUse: "Social proof near a call to action or on a services page.",
    avoid: "Inventing testimonials. Ask the owner for real quotes.",
  },
  migrate: {
    1: (v1) => ({ ...v1, rating: undefined, name: v1.author ?? v1.name, author: undefined }),
  },
  render: ({ fields, variant }) =>
    `<figure class="os-testimonial is-${variant}">${fields.name}</figure>`,
});

const kitchenSink = defineBlock({
  type: "kitchen-sink",
  version: 1,
  category: "data",
  label: "Kitchen sink",
  icon: "box",
  fields: {
    title: f.text({ default: "Hello" }),
    body: f.richText({ optional: true }),
    video: f.media({ kinds: ["video"], optional: true }),
    cta: f.link({ allow: ["page", "url"], optional: true }),
    size: f.select({ options: ["sm", "md", { value: "lg", label: "Large" }], default: "md" }),
    show: f.boolean({ default: true }),
    accent: f.color({ optional: true }),
    exact: f.color({ allowCustom: true, optional: true }),
    faqs: f.list({
      fields: { question: f.text({ maxLength: 120 }), answer: f.richText() },
      max: 3,
      itemLabel: "question",
      default: [],
    }),
    posts: f.reference({ collectionKinds: ["blog"], maxItems: 2, optional: true }),
    form: f.form({ optional: true }),
    embed: f.embed({ allow: ["url"], optional: true }),
  },
  ai: { purpose: "Test block", whenToUse: "Tests" },
  render: () => null,
});

describe("defineBlock", () => {
  it("infers field value types", () => {
    type Props = Parameters<typeof testimonial.render>[0];
    expectTypeOf<Props["fields"]["name"]>().toEqualTypeOf<string>();
    expectTypeOf<Props["fields"]["quote"]>().toEqualTypeOf<RichTextDoc>();
    expectTypeOf<Props["fields"]["photo"]>().toEqualTypeOf<ImageValue | undefined>();
    expectTypeOf<Props["variant"]>().toEqualTypeOf<"card" | "large" | "minimal">();
    type Sink = Parameters<typeof kitchenSink.render>[0]["fields"];
    expectTypeOf<Sink["size"]>().toEqualTypeOf<"sm" | "md" | "lg">();
    expectTypeOf<Sink["faqs"]>().toEqualTypeOf<{ question: string; answer: RichTextDoc }[]>();
  });

  it("produces serializable metadata with labels and defaults", () => {
    const meta = testimonial.meta;
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
    expect(meta.fields.name).toMatchObject({
      kind: "text",
      label: "Name",
      maxLength: 80,
      optional: false,
    });
    expect(meta.fields.photo).toMatchObject({ kind: "image", aspect: "1:1", optional: true });
    expect(meta.fields.quote).toMatchObject({
      kind: "richText",
      marks: ["bold", "italic"],
      blocks: ["paragraph"],
    });
    expect(meta.defaults.variant).toBe("card");
    expect(meta.ai.avoid).toContain("Inventing");
    const sink = kitchenSink.meta.fields;
    expect(sink.size).toMatchObject({
      options: [
        { value: "sm", label: "Sm" },
        { value: "md", label: "Md" },
        { value: "lg", label: "Large" },
      ],
      default: "md",
    });
    expect(sink.faqs).toMatchObject({ kind: "list", itemLabel: "question", max: 3 });
    expect(sink.faqs?.kind === "list" && sink.faqs.fields.question).toMatchObject({
      kind: "text",
      label: "Question",
    });
    expect(kitchenSink.meta.defaults.fields).toEqual({
      title: "Hello",
      size: "md",
      show: true,
      faqs: [],
    });
  });

  it("creates valid instances from defaults", () => {
    const block = testimonial.create({ column: 1 });
    expect(isId(block.id, "blk")).toBe(true);
    expect(block).toMatchObject({ type: "testimonial", v: 2, variant: "card", column: 1 });
    expect(testimonial.validate(block).success).toBe(true);
    const sink = kitchenSink.create();
    expect(sink.fields).toEqual({ title: "Hello", size: "md", show: true, faqs: [] });
    expect(() => defineBlock({ ...testimonial, type: "t2", defaults: {} }).create()).toThrow(
      /quote|name/,
    );
  });

  it("validates instances: fields, marks, variants, style slots, version", () => {
    const good = testimonial.create();
    const issues = (b: Block) => {
      const r = testimonial.validate(b);
      return r.success ? [] : r.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    };
    expect(issues({ ...good, fields: { ...good.fields, name: 3 } })[0]).toMatch(/^fields\.name/);
    expect(issues({ ...good, fields: { ...good.fields, extra: 1 } }).length).toBe(1);
    expect(
      issues({ ...good, fields: { ...good.fields, quote: fromMarkdown("**ok** ~~no~~") } })[0],
    ).toContain('"strike" mark is not allowed');
    expect(
      issues({ ...good, fields: { ...good.fields, quote: fromMarkdown("- a list") } })[0],
    ).toContain("bulletList");
    expect(
      issues({ ...good, fields: { ...good.fields, quote: fromMarkdown("x".repeat(601)) } })[0],
    ).toContain("600");
    expect(issues({ ...good, fields: { ...good.fields, name: "two\nlines" } })[0]).toContain(
      "single line",
    );
    expect(issues({ ...good, fields: { ...good.fields, rating: 4.5 } }).length).toBe(1);
    expect(issues({ ...good, variant: "huge" })[0]).toContain("Unknown variant");
    expect(issues({ ...good, style: { shadow: "lg" } })[0]).toContain('"shadow" style');
    expect(issues({ ...good, style: { typography: { quote: "lead" }, radius: "lg" } })).toEqual([]);
    expect(issues({ ...good, style: { typography: { name: "lead" } } })[0]).toContain(
      "typography.name",
    );
    expect(issues({ ...good, v: 1 })[0]).toContain("needs migrating");
    expect(issues({ ...good, v: 3 })[0]).toContain("newer");
    expect(issues({ ...good, type: "text" })[0]).toContain("Expected block type");
  });

  it("validates field builders", () => {
    const base = kitchenSink.create();
    const ok = (fields: object) =>
      kitchenSink.validate({ ...base, fields: { ...base.fields, ...fields } }).success;
    expect(ok({ cta: { type: "page", page: IDS.home } })).toBe(true);
    expect(ok({ cta: { type: "email", email: "a@b.co" } })).toBe(false);
    expect(ok({ video: { kind: "video", src: "media/a.mp4" } })).toBe(true);
    expect(ok({ video: { kind: "audio", src: "media/a.mp3" } })).toBe(false);
    expect(ok({ accent: "accent-500" })).toBe(true);
    expect(ok({ accent: "#ff0000" })).toBe(false);
    expect(ok({ exact: "#ff0000" })).toBe(true);
    expect(ok({ size: "xl" })).toBe(false);
    expect(ok({ faqs: [{ question: "Q?", answer: fromMarkdown("A.") }] })).toBe(true);
    expect(ok({ faqs: Array(4).fill({ question: "Q?", answer: fromMarkdown("A.") }) })).toBe(false);
    expect(ok({ posts: { collection: "journal", items: ["a", "b"] } })).toBe(true);
    expect(ok({ posts: { collection: "journal", items: ["a", "b", "c"] } })).toBe(false);
    expect(ok({ embed: { type: "url", url: "https://youtube.com/watch?v=x" } })).toBe(true);
    expect(ok({ embed: { type: "code", code: "<script></script>" } })).toBe(false);
    expect(
      ok({
        form: {
          id: IDS.form,
          name: "Contact",
          fields: [{ type: "password", name: "pw", label: "Password" }],
          submitLabel: "Send",
          success: { type: "message", message: "Thanks" },
        },
      }),
    ).toBe(false);
  });

  it("rejects invalid definitions", () => {
    const base = { ...testimonial, type: "x" };
    expect(() => defineBlock({ ...base, type: "Bad Type" })).toThrow(/invalid block type/);
    expect(() => defineBlock({ ...base, version: 0 })).toThrow(/version/);
    expect(() => defineBlock({ ...base, variants: ["a", "a"] as never })).toThrow(
      /duplicate variants/,
    );
    expect(() => defineBlock({ ...base, styleSlots: ["glow" as never] })).toThrow(
      /unknown style slot/,
    );
    expect(() => defineBlock({ ...base, defaults: { variant: "nope" as never } })).toThrow(
      /default variant/,
    );
    expect(() => defineBlock({ ...base, defaults: { fields: { name: 5 as never } } })).toThrow(
      /invalid default fields/,
    );
    expect(() => defineBlock({ ...base, defaults: { style: { shadow: "lg" } } })).toThrow(
      /undeclared slot/,
    );
    expect(() => defineBlock({ ...base, migrate: { 2: (x) => x } })).toThrow(/migration key/);
    expect(() => f.text({ maxLength: 3, default: "toolong" })).toThrow(/Invalid default/);
    expect(() => f.select({ options: [] })).toThrow(/at least one/);
    expect(() => f.list({ fields: { a: f.text() }, itemLabel: "b" as never })).toThrow(/itemLabel/);
  });

  it("migrates blocks between versions", () => {
    const v1: Block = {
      id: "blk_0000000001",
      type: "testimonial",
      v: 1,
      fields: { quote: fromMarkdown("Hi"), author: "Sam", rating: 5 },
    };
    const migrated = migrateBlock(testimonial, v1);
    expect(migrated).toEqual({
      id: v1.id,
      type: "testimonial",
      v: 2,
      fields: { quote: fromMarkdown("Hi"), name: "Sam" },
    });
    expect(v1.fields.author).toBe("Sam"); // input untouched
    expect(testimonial.validate(migrated).success).toBe(true);
    expect(migrateBlock(testimonial, migrated)).toBe(migrated);
    expect(() => migrateBlock(testimonial, { ...v1, v: 9 })).toThrow(/newer/);
    expect(() => migrateBlock(testimonial, { ...v1, type: "text" })).toThrow(/Cannot migrate/);
  });

  it("emits a JSON Schema for block fields with descriptions", () => {
    const schema = blockFieldsJsonSchema(testimonial);
    expect(schema).toMatchObject({
      type: "object",
      title: "Testimonial",
      additionalProperties: false,
    });
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.name).toMatchObject({
      type: "string",
      maxLength: 80,
      title: "Name",
      description: "The person's real name.",
    });
    expect(props.role?.description).toBe("Job title or relationship");
    expect(schema.required).toEqual(["quote", "name"]);
    expect(JSON.stringify(blockFieldsJsonSchema(kitchenSink))).toContain('"enum":["sm","md","lg"]');
  });
});

describe("block registry", () => {
  const text = defineBlock({
    type: "text",
    version: 1,
    category: "text",
    label: "Text",
    icon: "type",
    fields: { content: f.richText() },
    ai: { purpose: "Body copy", whenToUse: "Anywhere" },
    render: () => null,
  });
  const button = defineBlock({
    type: "button",
    version: 1,
    category: "navigation",
    label: "Button",
    icon: "mouse-pointer-click",
    fields: {
      label: f.text({ maxLength: 40 }),
      link: f.link(),
      variant: f.select({ options: ["primary", "secondary"] }),
    },
    ai: { purpose: "A call to action", whenToUse: "One primary action per screenful" },
    render: () => null,
  });
  const image = defineBlock({
    type: "image",
    version: 1,
    category: "media",
    label: "Image",
    icon: "image",
    fields: { image: f.image() },
    styleSlots: ["radius"],
    ai: { purpose: "A photo", whenToUse: "Visual interest" },
    render: () => null,
  });
  const registry = createBlockRegistry([text, button, image, testimonial]);

  it("looks up definitions and lists metadata", () => {
    expect(registry.types()).toEqual(["text", "button", "image", "testimonial"]);
    expect(registry.get("image")).toBe(image);
    expect(registry.has("map")).toBe(false);
    expect(registry.meta().map((m) => m.type)).toContain("testimonial");
    expect(() => createBlockRegistry([text, text])).toThrow(/defined twice/);
  });

  it("validates every block in a document", () => {
    expect(registry.validateDocument(siteFixture())).toEqual([]);
    const broken = siteFixture();
    const hero = broken.pages[IDS.home]?.sections[0];
    if (hero?.blocks[2]) hero.blocks[2].style = { shadow: "lg" };
    if (hero?.blocks[1]) hero.blocks[1].type = "map";
    const issues = registry.validateDocument(broken);
    expect(issues.map((i) => i.path.join("."))).toEqual([
      `pages.${IDS.home}.sections.0.blocks.1.type`,
      `pages.${IDS.home}.sections.0.blocks.2.style.shadow`,
    ]);
    expect(issues[0]?.blockId).toBe(IDS.button);
  });

  it("migrates via the registry", () => {
    const old: Block = {
      id: "blk_0000000002",
      type: "testimonial",
      v: 1,
      fields: { quote: fromMarkdown("x"), author: "A" },
    };
    expect(registry.migrate(old).v).toBe(2);
    const unknown: Block = { ...old, type: "map" };
    expect(registry.migrate(unknown)).toBe(unknown);
  });
});
