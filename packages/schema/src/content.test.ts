import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { IDS, siteFixture } from "./__fixtures__/site";
import { BlockSchema } from "./block";
import { CollectionConfigSchema, CollectionItemSchema } from "./collections";
import { SiteConfigSchema } from "./config";
import { SiteDocumentSchema } from "./document";
import { FormSchema } from "./form";
import { MediaMetaSchema } from "./media";
import { PageSchema } from "./page";
import { ImageValueSchema, LinkSchema, MediaSrcSchema } from "./primitives";
import { SectionSchema } from "./section";
import { SiteSchema } from "./site";
import { StylesSchema } from "./styles";

/** Clone the fixture, apply a mutation, and return the result. */
function mutate<T>(value: T, fn: (draft: T) => void): T {
  const draft = structuredClone(value);
  fn(draft);
  return draft;
}

function expectValid(schema: z.ZodType, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2));
}

function expectInvalid(schema: z.ZodType, value: unknown, messageIncludes?: string) {
  const r = schema.safeParse(value);
  expect(r.success).toBe(false);
  if (messageIncludes && !r.success) {
    expect(r.error.issues.map((i) => i.message).join("\n")).toContain(messageIncludes);
  }
}

const doc = siteFixture();
const home = doc.pages[IDS.home];
if (!home) throw new Error("fixture");
const hero = home.sections[0];
const grid = home.sections[1];
if (!hero || !grid) throw new Error("fixture");

describe("SiteDocument", () => {
  it("accepts the fixture", () => expectValid(SiteDocumentSchema, doc));

  it("rejects mismatched page keys and duplicate slugs", () => {
    expectInvalid(
      SiteDocumentSchema,
      mutate(doc, (d) => {
        const about = d.pages[IDS.about];
        if (about) about.slug = "";
      }),
      "also used by",
    );
    expectInvalid(
      SiteDocumentSchema,
      mutate(doc, (d) => {
        const p = d.pages[IDS.about];
        if (p) d.pages.pg_0000000000 = p;
      }),
      "does not match its key",
    );
  });

  it("rejects block ids reused across pages", () => {
    expectInvalid(
      SiteDocumentSchema,
      mutate(doc, (d) => {
        const block = d.pages[IDS.about]?.sections[0]?.blocks[0];
        if (block) block.id = IDS.heading;
      }),
      "is used in both",
    );
  });

  it("rejects mismatched collection and media keys", () => {
    expectInvalid(
      SiteDocumentSchema,
      mutate(doc, (d) => {
        const item = d.collections.journal?.["2026-10-26-opening-day"];
        if (item) item.slug = "other";
      }),
      "does not match its key",
    );
    expectInvalid(
      SiteDocumentSchema,
      mutate(doc, (d) => {
        const m = d.media["media/2026/10/hero-k3f9.jpg"];
        if (m) m.path = "media/x.jpg";
      }),
      "does not match its key",
    );
  });
});

describe("SiteConfig", () => {
  it("accepts the fixture and localhost hubs", () => {
    expectValid(SiteConfigSchema, doc.config);
    expectValid(SiteConfigSchema, { ...doc.config, hub: "http://localhost:8787" });
    expectValid(SiteConfigSchema, {
      ...doc.config,
      deploy: { target: "cloudflare", url: "https://maya.pages.dev", customDomain: "mayayoga.com" },
    });
  });
  it("rejects bad ids, targets, versions and extra keys", () => {
    expectInvalid(SiteConfigSchema, { ...doc.config, siteId: "st_01JB3Q8W2N" });
    expectInvalid(SiteConfigSchema, {
      ...doc.config,
      deploy: { ...doc.config.deploy, target: "netlify" },
    });
    expectInvalid(SiteConfigSchema, { ...doc.config, template: { id: "meadow", version: "1.2" } });
    expectInvalid(SiteConfigSchema, { ...doc.config, schemaVersion: 0 });
    expectInvalid(SiteConfigSchema, {
      ...doc.config,
      deploy: { ...doc.config.deploy, customDomain: "https://x.com" },
    });
    expectInvalid(SiteConfigSchema, {
      ...doc.config,
      features: { ...doc.config.features, members: true },
    });
    expectInvalid(SiteConfigSchema, { ...doc.config, stripeSecret: "x" });
  });
});

describe("Site", () => {
  it("accepts the fixture", () => expectValid(SiteSchema, doc.site));
  it("accepts a minimal site", () => {
    expectValid(SiteSchema, {
      title: "Hearth",
      nav: [],
      header: {
        variant: "minimal",
        sticky: false,
        transparentOnHero: false,
        mobileMenu: "fullscreen",
      },
      footer: {
        id: IDS.footer,
        layout: { mode: "stack", columns: { d: [12] } },
        style: {},
        blocks: [],
      },
      locale: "en",
    });
  });
  it("rejects invalid nav, header and redirects", () => {
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) => {
        s.header.variant = "mega" as never;
      }),
    );
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) => {
        s.nav.push({
          type: "folder",
          label: "A",
          items: [{ type: "folder", label: "B", items: [] }],
        } as never);
      }),
    );
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) => s.nav.push({ type: "page", page: "pg_about" } as never)),
    );
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) =>
        s.nav.push({ type: "link", label: "x", href: "javascript:alert(1)" } as never),
      ),
    );
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) => s.redirects?.push({ from: "/classes", to: "/other", status: 302 })),
      "Duplicate redirect",
    );
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) => {
        s.locale = "english";
      }),
    );
    expectInvalid(
      SiteSchema,
      mutate(doc.site, (s) =>
        s.social?.push({ network: "myspace", url: "https://myspace.com/x" } as never),
      ),
    );
  });
});

describe("Styles", () => {
  it("accepts the fixture and choices without overrides", () => {
    expectValid(StylesSchema, doc.styles);
    expectValid(StylesSchema, { choices: doc.styles.choices });
  });
  it("rejects bad choices and malformed DTCG overrides", () => {
    expectInvalid(
      StylesSchema,
      mutate(doc.styles, (s) => {
        s.choices.palette.brand = "green";
      }),
    );
    expectInvalid(
      StylesSchema,
      mutate(doc.styles, (s) => {
        s.choices.density = "roomy" as never;
      }),
    );
    expectInvalid(StylesSchema, { ...doc.styles, overrides: { color: { accent: "red" } } });
    expectInvalid(StylesSchema, {
      ...doc.styles,
      overrides: { color: { accent: { $value: "red", $type: "colour" } } },
    });
    expectInvalid(
      StylesSchema,
      { ...doc.styles, overrides: { "bad.name": { $value: 1 } } },
      "Invalid token name",
    );
  });
});

describe("Page", () => {
  it("accepts the fixture pages", () => {
    for (const page of Object.values(doc.pages)) expectValid(PageSchema, page);
  });
  it("rejects invalid slugs, seo and gating", () => {
    expectInvalid(PageSchema, { ...home, slug: "/about" });
    expectInvalid(PageSchema, { ...home, slug: "About Us" });
    expectValid(PageSchema, { ...home, slug: "services/yoga-therapy" });
    expectInvalid(PageSchema, { ...home, seo: { description: "x".repeat(400) } });
    expectInvalid(PageSchema, { ...home, access: { password: "hunter2" } });
    expectValid(PageSchema, { ...home, access: { members: true }, hidden: true });
  });
  it("rejects duplicate section ids and block ids across sections", () => {
    expectInvalid(PageSchema, { ...home, sections: [hero, hero] }, "Duplicate section id");
    expectInvalid(
      PageSchema,
      mutate(home, (p) => {
        const s = p.sections[1];
        const b = s?.blocks[0];
        if (s && b && s.layout.mode === "grid") {
          const item = s.layout.items[b.id];
          delete s.layout.items[b.id];
          b.id = IDS.heading;
          if (item) s.layout.items[IDS.heading] = item;
        }
      }),
      "also used in another section",
    );
  });
});

describe("Section", () => {
  it("accepts stack and grid sections", () => {
    expectValid(SectionSchema, hero);
    expectValid(SectionSchema, grid);
  });
  it("validates stack columns", () => {
    const withCols = (d: number[]) => ({ ...hero, layout: { mode: "stack", columns: { d } } });
    expectInvalid(SectionSchema, withCols([7, 4]), "add up to 12");
    expectInvalid(SectionSchema, withCols([3, 3, 3, 1, 2]));
    expectValid(SectionSchema, withCols([3, 3, 3, 3]));
    expectInvalid(
      SectionSchema,
      { ...hero, layout: { mode: "stack", columns: { d: [12] } } },
      "Column 1 does not exist",
    );
    expectValid(SectionSchema, { ...hero, layout: { ...hero.layout, order: { m: [1, 0] } } });
    expectInvalid(
      SectionSchema,
      { ...hero, layout: { ...hero.layout, order: { m: [1, 1] } } },
      "distinct",
    );
  });
  it("validates grid placements", () => {
    const g = grid.layout;
    if (g.mode !== "grid") throw new Error("fixture");
    const withItem = (rect: object) => ({
      ...grid,
      layout: { ...g, items: { ...g.items, [IDS.c1]: rect } },
    });
    expectInvalid(
      SectionSchema,
      withItem({ d: { x: 20, y: 1, w: 10, h: 2 } }),
      "overflows the 24-column grid",
    );
    expectInvalid(
      SectionSchema,
      withItem({ d: { x: 1, y: 1, w: 10, h: 2 }, m: { x: 2, y: 1, w: 8, h: 2 } }),
      "8-column",
    );
    expectInvalid(SectionSchema, withItem({ d: { x: 0, y: 1, w: 10, h: 2 } }));
    expectInvalid(
      SectionSchema,
      withItem({ d: { x: 1, y: 10, w: 10, h: 10 } }),
      "past the last row",
    );
    expectValid(SectionSchema, withItem({ d: { x: 1, y: 1, w: 24, h: 2, bleed: "both", z: 3 } }));
    expectInvalid(
      SectionSchema,
      { ...grid, blocks: grid.blocks.slice(0, 1) },
      "not a block in this section",
    );
    expectInvalid(
      SectionSchema,
      { ...grid, layout: { ...g, items: { [IDS.c1]: g.items[IDS.c1] } } },
      "has no grid placement",
    );
  });
  it("validates style and background", () => {
    expectInvalid(SectionSchema, { ...hero, style: { colorTheme: "neon" } });
    expectInvalid(SectionSchema, { ...hero, style: { padding: { d: "huge" } } });
    expectInvalid(SectionSchema, { ...hero, style: { minHeight: { d: "80" } } });
    expectValid(SectionSchema, { ...hero, style: { minHeight: { d: "100svh", m: "480px" } } });
    expectValid(SectionSchema, {
      ...hero,
      style: { background: { type: "gradient", from: "accent-200", to: "#fff", angle: 135 } },
    });
    expectValid(SectionSchema, {
      ...hero,
      style: {
        background: {
          type: "video",
          src: "media/2026/10/loop.mp4",
          poster: "media/2026/10/loop.jpg",
        },
      },
    });
    expectInvalid(SectionSchema, {
      ...hero,
      style: { background: { type: "image", src: "C:/photo.jpg" } },
    });
    expectInvalid(SectionSchema, {
      ...hero,
      style: { background: { type: "color", color: "rebeccapurple" } },
    });
    expectInvalid(SectionSchema, { ...hero, preset: "hero" });
    expectValid(SectionSchema, {
      ...hero,
      locked: true,
      hidden: false,
      anchor: "intro",
      label: "Hero",
    });
  });
});

describe("Block", () => {
  const block = hero.blocks[2];
  it("accepts block instances", () => expectValid(BlockSchema, block));
  it("rejects malformed instances", () => {
    expectInvalid(BlockSchema, { ...block, id: "blk_a3" });
    expectInvalid(BlockSchema, { ...block, type: "Image" });
    expectValid(BlockSchema, { ...block, type: "acme/map" });
    expectInvalid(BlockSchema, { ...block, v: 0 });
    expectInvalid(BlockSchema, { ...block, column: 4 });
    expectInvalid(BlockSchema, { ...block, style: { radius: "huge" } });
    expectInvalid(BlockSchema, { ...block, style: { color: "red" } });
    expectValid(BlockSchema, {
      ...block,
      style: { typography: { quote: "lead" }, align: { d: "center" } },
    });
  });
});

describe("primitives", () => {
  it("accepts media paths and https URLs as image src", () => {
    expectValid(MediaSrcSchema, "media/2026/10/hero-k3f9.jpg");
    expectValid(MediaSrcSchema, "https://images.unsplash.com/photo-1506126613408?w=2400&q=80");
    expectInvalid(MediaSrcSchema, "http://images.unsplash.com/photo.jpg");
    expectInvalid(MediaSrcSchema, "/media/x.jpg");
    expectInvalid(MediaSrcSchema, "media/../secrets.jpg");
    expectInvalid(MediaSrcSchema, "media/.hidden.jpg");
    expectInvalid(MediaSrcSchema, "media/2026/noext");
    expectInvalid(ImageValueSchema, { src: "media/a.jpg" }); // alt required
    expectInvalid(ImageValueSchema, { src: "media/a.jpg", alt: "", focal: [1.2, 0] });
  });
  it("validates every link type", () => {
    for (const link of [
      { type: "page", page: IDS.about, anchor: "team" },
      { type: "item", collection: "journal", slug: "2026-10-26-opening-day" },
      { type: "url", url: "https://example.com", newTab: true },
      { type: "url", url: "/schedule" },
      { type: "email", email: "hello@mayayoga.com" },
      { type: "phone", phone: "+1 (303) 555-0100" },
      { type: "file", src: "media/2026/10/menu.pdf" },
      { type: "anchor", section: IDS.hero },
    ]) {
      expectValid(LinkSchema, link);
    }
    expectInvalid(LinkSchema, { type: "url", url: "javascript:alert(1)" });
    expectInvalid(LinkSchema, { type: "url", url: "//evil.com" });
    expectInvalid(LinkSchema, { type: "email", email: "nope" });
    expectInvalid(LinkSchema, { type: "page", page: IDS.hero });
    expectInvalid(LinkSchema, { type: "ftp", url: "ftp://x" });
  });
});

describe("CollectionItem", () => {
  const blog = doc.collections.journal?.["2026-10-26-opening-day"];
  it("accepts every kind", () => {
    expectValid(CollectionItemSchema, blog);
    expectValid(CollectionItemSchema, {
      kind: "events",
      slug: "full-moon-flow",
      frontmatter: {
        title: "Full moon flow",
        status: "published",
        start: "2026-11-05T19:00:00-07:00",
        end: "2026-11-05T20:30:00-07:00",
        timezone: "America/Denver",
        location: { name: "Maya Yoga", address: "1420 Pearl Street, Boulder" },
      },
      body: "",
    });
    expectValid(CollectionItemSchema, {
      kind: "portfolio",
      slug: "harbor-rebrand",
      frontmatter: {
        title: "Harbor rebrand",
        status: "draft",
        year: 2025,
        gallery: [{ src: "media/2025/03/harbor-1.jpg", alt: "Harbor signage" }],
      },
      body: "",
    });
    expectValid(CollectionItemSchema, {
      kind: "podcast",
      slug: "episode-12",
      frontmatter: {
        title: "Breath as an anchor",
        status: "scheduled",
        publishAt: "2026-11-01T08:00:00Z",
        date: "2026-11-01",
        audio: { src: "https://cdn.example.com/ep12.mp3", duration: 2710, mime: "audio/mpeg" },
        episode: 12,
        season: 2,
      },
      body: "Show notes.",
    });
    expectValid(CollectionItemSchema, {
      kind: "products",
      slug: "cork-block",
      frontmatter: {
        title: "Cork block",
        status: "published",
        price: { amount: 2400, currency: "USD" },
        options: [{ name: "Size", values: ["Standard", "Wide"] }],
        variants: [{ options: { Size: "Wide" }, price: { amount: 2800, currency: "USD" } }],
      },
      body: "",
    });
  });
  it("rejects invalid frontmatter", () => {
    expectInvalid(
      CollectionItemSchema,
      mutate(blog, (b) => {
        (b as { kind: string }).kind = "news";
      }),
    );
    expectInvalid(
      CollectionItemSchema,
      mutate(blog, (b) => {
        (b?.frontmatter as { date: string }).date = "26/10/2026";
      }),
    );
    expectInvalid(
      CollectionItemSchema,
      mutate(blog, (b) => {
        (b?.frontmatter as { status: string }).status = "scheduled";
      }),
      "publishAt",
    );
    expectInvalid(
      CollectionItemSchema,
      {
        kind: "events",
        slug: "x",
        frontmatter: { title: "X", status: "published", start: "2026-11-05", end: "2026-11-04" },
        body: "",
      },
      "ends before it starts",
    );
    expectInvalid(CollectionItemSchema, {
      kind: "products",
      slug: "x",
      frontmatter: { title: "X", status: "published", price: { amount: 24.5, currency: "USD" } },
      body: "",
    });
    expectInvalid(
      CollectionItemSchema,
      {
        kind: "products",
        slug: "x",
        frontmatter: {
          title: "X",
          status: "published",
          price: { amount: 100, currency: "USD" },
          compareAtPrice: { amount: 200, currency: "EUR" },
        },
        body: "",
      },
      "one currency",
    );
  });
  it("validates _collection.json", () => {
    expectValid(CollectionConfigSchema, {
      kind: "blog",
      label: "Journal",
      list: { layout: "cards", pageSize: 12, sort: "date-desc" },
      categories: [{ slug: "news", label: "News" }],
      feed: { enabled: true },
    });
    expectInvalid(CollectionConfigSchema, {
      kind: "blog",
      label: "J",
      list: { layout: "cards", pageSize: 0, sort: "date-desc" },
    });
  });
});

describe("MediaMeta", () => {
  const meta = doc.media["media/2026/10/hero-k3f9.jpg"];
  it("accepts the fixture and non-image media", () => {
    expectValid(MediaMetaSchema, meta);
    expectValid(MediaMetaSchema, {
      id: "med_a0d10a0d10",
      path: "media/2026/10/ep12.mp3",
      kind: "audio",
      mime: "audio/mpeg",
      bytes: 1000,
      duration: 2710,
      createdAt: "2026-10-20T15:04:05.000Z",
    });
  });
  it("requires image dimensions and consistent MIME types", () => {
    expectInvalid(MediaMetaSchema, { ...meta, width: undefined }, "width and height");
    expectInvalid(MediaMetaSchema, { ...meta, mime: "video/mp4" }, "does not match kind");
    expectInvalid(MediaMetaSchema, {
      ...meta,
      placeholder: `data:image/webp;base64,${"A".repeat(2000)}`,
    });
    expectInvalid(MediaMetaSchema, { ...meta, id: "img_1" });
  });
});

describe("Form", () => {
  const form = {
    id: IDS.form,
    name: "Contact",
    fields: [
      { type: "text", name: "name", label: "Your name", required: true },
      { type: "email", name: "email", label: "Email", required: true },
      { type: "phone", name: "phone", label: "Phone" },
      { type: "textarea", name: "message", label: "Message", maxLength: 2000 },
      { type: "select", name: "class", label: "Class", options: ["Morning flow", "Restorative"] },
      { type: "checkbox", name: "consent", label: "I agree to be contacted" },
      { type: "radio", name: "level", label: "Experience", options: ["New", "Some", "Lots"] },
      { type: "date", name: "visit", label: "Preferred date" },
    ],
    submitLabel: "Send",
    success: { type: "message", message: "Thanks — Maya will reply within a day." },
  };
  it("accepts every allowed field type", () => expectValid(FormSchema, form));
  it("forbids password and card fields", () => {
    expectInvalid(
      FormSchema,
      { ...form, fields: [{ type: "password", name: "pw", label: "Password" }] },
      "never collect passwords or card details",
    );
    expectInvalid(
      FormSchema,
      { ...form, fields: [{ type: "card-number", name: "cc", label: "Card" }] },
      "not allowed",
    );
    expectInvalid(
      FormSchema,
      { ...form, fields: [{ type: "text", name: "card_number", label: "Number" }] },
      "never collect",
    );
    expectInvalid(
      FormSchema,
      { ...form, fields: [{ type: "text", name: "secret", label: "Choose a password" }] },
      "never collect",
    );
    expectInvalid(
      FormSchema,
      { ...form, fields: [{ type: "text", name: "cvv", label: "CVV" }] },
      "never collect",
    );
  });
  it("rejects other invalid forms", () => {
    expectInvalid(FormSchema, { ...form, fields: [] });
    expectInvalid(
      FormSchema,
      { ...form, fields: [form.fields[0], form.fields[0]] },
      "Duplicate field name",
    );
    expectInvalid(FormSchema, {
      ...form,
      fields: [{ type: "select", name: "x", label: "X", options: [] }],
    });
    expectInvalid(
      FormSchema,
      { ...form, fields: [{ type: "file", name: "x", label: "X" }] },
      "Unknown form field type",
    );
    expectInvalid(FormSchema, {
      ...form,
      fields: [{ type: "text", name: "Full Name", label: "X" }],
    });
    expectValid(FormSchema, {
      ...form,
      success: { type: "redirect", link: { type: "page", page: IDS.about } },
    });
  });
});
