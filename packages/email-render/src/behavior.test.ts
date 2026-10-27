import { type Block, type Site, type Styles, StylesSchema } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import {
  buildEmailTheme,
  EmailRenderError,
  formNotificationEmail,
  magicLinkEmail,
  orderReceiptEmail,
  renderEmail,
  unsubscribeHeaders,
} from "./index";

const styles: Styles = StylesSchema.parse({
  choices: {
    palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
    pairing: "fraunces-hanken",
    density: "airy",
    shape: "soft",
    buttons: "pill-solid",
    motion: "subtle",
    imageTreatment: "arch",
  },
});
const site = { title: "Maya Yoga", locale: { lang: "en" } } as unknown as Site;
const baseUrl = "https://maya.example";

let id = 0;
const b = (type: string, fields: Record<string, unknown>): Block => ({
  id: `blk_x${++id}` as Block["id"],
  type,
  v: 1,
  fields,
});
const p = (text: string, marks?: unknown[]) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text, marks }] }],
});
const textOf = (bl: Block[]) => renderEmail({ blocks: bl, baseUrl }).text;
const htmlOf = (bl: Block[], extra = {}) => renderEmail({ blocks: bl, baseUrl, ...extra }).html;

describe("buttons", () => {
  it("wraps buttons in a full-width table so following text does not float beside", () => {
    const html = htmlOf([b("button", { label: "Go", link: { type: "url", url: "/go" } })]);
    expect(html).not.toMatch(/<table[^>]*align="(left|right)"/);
    expect(html).toContain('<td align="left"><table');
  });
  it("renders secondary action and note", () => {
    const html = htmlOf([
      b("button", {
        label: "A",
        link: { type: "url", url: "/a" },
        secondaryLabel: "B",
        secondaryLink: { type: "url", url: "/b" },
        note: "Free first class",
      }),
    ]);
    expect(html).toContain("https://maya.example/b");
    expect(html).toContain("Free first class");
  });
});

describe("receipt currencies", () => {
  const base = {
    site,
    styles,
    baseUrl,
    orderNumber: "7",
    items: [{ name: "Tea", quantity: 3, unitAmount: 1000 }],
    total: 3000,
  };
  it("uses the currency's minor-unit exponent", () => {
    expect(orderReceiptEmail({ ...base, currency: "JPY" }).text).toMatch(/Total: ¥3,000/);
    expect(orderReceiptEmail({ ...base, currency: "BHD" }).text).toMatch(/Total: BHD\s?3\.000/);
    expect(orderReceiptEmail({ ...base, currency: "EUR", locale: "de-DE" }).text).toContain(
      "Total: 30,00",
    );
    expect(orderReceiptEmail({ ...base, currency: "USD" }).text).toContain("Total: $30.00");
  });
  it("normalises quantities and reuses pipeline text", () => {
    const r = orderReceiptEmail({
      ...base,
      currency: "USD",
      items: [{ name: "Tea", quantity: 2.9, unitAmount: 500 }],
      total: 1000,
    });
    expect(r.text).toContain("2 x Tea - $10.00");
    expect(r.text).toContain("Sent by Maya Yoga");
  });
});

describe("unsubscribe handling", () => {
  it("throws when unsubscribeUrl or viewInBrowserUrl is unusable", () => {
    for (const bad of ["javascript:alert(1)", "not a url", "", "mailto:a@b.co", "/x"]) {
      expect(() => renderEmail({ blocks: [], unsubscribeUrl: bad })).toThrow(EmailRenderError);
    }
    expect(() => renderEmail({ blocks: [], viewInBrowserUrl: "javascript:1" })).toThrow(
      EmailRenderError,
    );
    expect(() => renderEmail({ blocks: [], unsubscribeUrl: { mergeTag: '"><x' } })).toThrow(
      EmailRenderError,
    );
  });
  it("emits ESP merge tags verbatim only via the explicit option", () => {
    const r = renderEmail({ blocks: [], unsubscribeUrl: { mergeTag: "{{unsubscribe_url}}" } });
    expect(r.html).toContain('href="{{unsubscribe_url}}"');
    expect(r.text).toContain("Unsubscribe: {{unsubscribe_url}}");
  });
  it("builds RFC 8058 headers", () => {
    expect(unsubscribeHeaders("https://maya.example/u/1")).toEqual({
      "List-Unsubscribe": "<https://maya.example/u/1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(
      unsubscribeHeaders("https://maya.example/u/1", { mailto: "unsub@maya.example" })[
        "List-Unsubscribe"
      ],
    ).toBe("<https://maya.example/u/1>, <mailto:unsub@maya.example>");
    expect(() => unsubscribeHeaders("http://maya.example/u")).toThrow(EmailRenderError);
    expect(() => unsubscribeHeaders("https://x.example/>\r\nBcc: a")).toThrow(EmailRenderError);
    expect(() => unsubscribeHeaders("https://x.example/", { mailto: "bad" })).toThrow(
      EmailRenderError,
    );
  });
});

describe("warnings", () => {
  it("surfaces theme compile failure instead of silently falling back", () => {
    const r = renderEmail({ blocks: [], styles: { choices: null } as unknown as Styles });
    expect(r.warnings.some((w) => w.code === "theme-error")).toBe(true);
  });
  it("lists skipped blocks and unresolved page links", () => {
    const r = renderEmail({
      baseUrl,
      blocks: [
        b("mystery", {}),
        b("button", { label: "Page", link: { type: "page", page: "pg_abc" } }),
      ],
    });
    expect(r.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["unknown-block", "unresolved-link"]),
    );
    expect(r.warnings.find((w) => w.code === "unknown-block")?.path).toBe("blocks[0]");
  });
  it("resolves page links through resolveLink", () => {
    const r = renderEmail({
      baseUrl,
      blocks: [b("button", { label: "Page", link: { type: "page", page: "pg_abc" } })],
      resolveLink: (l) => (l.type === "page" ? "/about" : undefined),
    });
    expect(r.html).toContain('href="https://maya.example/about"');
    expect(r.warnings).toEqual([]);
  });
});

describe("rich text and blocks", () => {
  const li = (t: string) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  });
  it("renders lists, blockquotes and hard breaks in text", () => {
    const text = textOf([
      b("text", {
        content: {
          type: "doc",
          content: [
            { type: "orderedList", content: [li("One"), li("Two")] },
            {
              type: "blockquote",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Wise words" }] }],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "a" },
                { type: "hardBreak" },
                { type: "text", text: "b" },
              ],
            },
          ],
        },
      }),
    ]);
    expect(text).toContain("1. One\n2. Two");
    expect(text).toContain("> Wise words");
    expect(text).toContain("a\nb");
  });
  it("skips empty headings", () => {
    const html = htmlOf([
      b("text", { content: { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] } }),
      b("heading", { text: "  " }),
    ]);
    expect(html).not.toContain("<h2");
  });
  it("quote does not rewrite code-mark fonts", () => {
    const html = htmlOf([b("quote", { quote: p("x = 1", [{ type: "code" }]) })]);
    expect(html).toContain("<code style=\"font-family:'Courier New'");
  });
  it("never upscales images beyond their intrinsic width", () => {
    const html = htmlOf([
      b("image", { image: { src: "https://i.example/a.png", alt: "", width: 200 } }),
    ]);
    expect(html).toContain('width="200"');
    expect(html).toContain("max-width:200px");
  });
  it("spacer and line honour real fields", () => {
    const html = htmlOf([
      b("spacer", { height: "xl" }),
      b("line", { thickness: "bold", length: "half", color: "accent" }),
    ]);
    expect(html).toContain("height:48px");
    expect(html).toContain('width="50%"');
    expect(html).toContain("height:4px");
  });
  it("renders the postal address in footer and text", () => {
    const r = renderEmail({ blocks: [], postalAddress: ["1 Main St", "Boulder, CO"] });
    expect(r.html.split("1 Main St &middot; Boulder, CO").length - 1).toBe(1);
    expect(r.text).toContain("1 Main St, Boulder, CO");
  });
  it("dark palette values come from the dark theme and are mirrored for Outlook", () => {
    const { theme } = buildEmailTheme(styles);
    const html = htmlOf([], { styles });
    expect(html).toContain(`.os-bg{background-color:${theme.dark.background} !important}`);
    expect(html).toContain(
      `[data-ogsb] .os-bg{background-color:${theme.dark.background} !important}`,
    );
    expect(html).toContain("[data-ogsb] .os-outline{");
    expect(html).toContain("[data-ogsb] .os-rule{");
    expect(theme.dark.background).not.toBe(theme.light.background);
  });
});

describe("template details", () => {
  it("pluralises expiry and uses replyTo", () => {
    const m = magicLinkEmail({
      site,
      styles,
      baseUrl,
      url: "https://maya.example/a",
      expiresInMinutes: 1,
    });
    expect(m.text).toContain("expires in 1 minute and");
    const r = formNotificationEmail({
      site,
      styles,
      baseUrl,
      formName: "Contact",
      entries: [{ label: "Name", value: "Sam" }],
      replyTo: "sam@example.com",
    });
    expect(r.html).toContain("mailto:sam@example.com");
    expect(() =>
      formNotificationEmail({ site, baseUrl, formName: "C", entries: [], replyTo: "bad" }),
    ).toThrow(EmailRenderError);
  });
});

describe("round 2", () => {
  it("rejects scheme-prefixed merge tags", () => {
    for (const tag of ["javascript:alert(1)", "data:x", "https:evil"]) {
      expect(() => renderEmail({ blocks: [], unsubscribeUrl: { mergeTag: tag } })).toThrow(
        EmailRenderError,
      );
    }
  });
  it("social-links follows source: site vs custom", () => {
    const withSite = {
      ...site,
      social: [{ network: "instagram", url: "https://instagram.com/maya" }],
    } as unknown as Site;
    const custom = [{ network: "x", url: "https://x.com/custom" }];
    const run = (source: string) =>
      renderEmail({
        baseUrl,
        site: withSite,
        blocks: [b("social-links", { source, profiles: custom })],
      }).html;
    expect(run("site")).toContain("instagram.com/maya");
    expect(run("site")).not.toContain("x.com/custom");
    expect(run("custom")).toContain("x.com/custom");
    expect(run("custom")).not.toContain("instagram.com/maya");
  });
  it("spacer none is zero; unknown tokens warn", () => {
    expect(htmlOf([b("spacer", { height: "none" })])).not.toContain("mso-line-height-rule");
    const r = renderEmail({
      baseUrl,
      blocks: [b("spacer", { height: "huge" }), b("line", { thickness: "thick", color: "nope" })],
    });
    expect(r.warnings.filter((w) => w.code === "invalid-field").length).toBe(3);
  });
  it("NaN expiry falls back to 15 minutes", () => {
    const m = magicLinkEmail({
      site,
      baseUrl,
      url: "https://maya.example/a",
      expiresInMinutes: Number.NaN,
    });
    expect(m.text).toContain("expires in 15 minutes");
    expect(m.text).not.toContain("NaN");
  });
  it("adds row spacing in 2-per-row column layouts", () => {
    const item = (h: string) => ({ heading: h, body: p(h) });
    const html = htmlOf([
      b("columns", { columns: "4", items: [item("a"), item("b"), item("c"), item("d")] }),
    ]);
    expect(html.split("padding-bottom:16px;").length - 1).toBe(2);
  });
});
