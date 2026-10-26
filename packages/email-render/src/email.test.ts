import { type Block, type Site, type Styles, StylesSchema } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import {
  campaignEmail,
  confirmSubscriptionEmail,
  formNotificationEmail,
  magicLinkEmail,
  orderReceiptEmail,
  renderEmail,
  safeUrl,
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

const site = {
  title: "Maya Yoga",
  tagline: "Slow flow",
  logo: { src: "media/logo.png", alt: "Maya Yoga logo", width: 120 },
  social: [
    { network: "instagram", url: "https://instagram.com/maya" },
    { network: "email", url: "mailto:hi@maya.example" },
  ],
  locale: { lang: "en" },
} as unknown as Site;

const baseUrl = "https://maya.example";
let id = 0;
const b = (type: string, fields: Record<string, unknown>): Block => ({
  id: `blk_${++id}` as Block["id"],
  type,
  v: 1,
  fields,
});
const doc = (text: string, marks?: unknown[]) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text, marks }] }],
});

const blocks: Block[] = [
  b("text", {
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Autumn schedule" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Join us " },
            { type: "text", text: "this week", marks: [{ type: "bold" }] },
            { type: "text", text: " or see the " },
            { type: "text", text: "studio", marks: [{ type: "link", attrs: { href: "/studio" } }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Mon 7am" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Wed 6pm" }] }],
            },
          ],
        },
      ],
    },
  }),
  b("image", { src: "media/hero.jpg", alt: "Studio", link: { type: "url", url: "/classes" } }),
  b("button", { label: "Book a class", link: { type: "url", url: "https://maya.example/book" } }),
  b("line", {}),
  b("spacer", { size: "md" }),
  b("quote", { quote: doc("Life changing."), name: "Sam", role: "Student" }),
  b("columns", {
    columns: [
      [b("text", { content: doc("Left column") })],
      [b("button", { label: "Right", link: { type: "url", url: "/right" }, variant: "secondary" })],
    ],
  }),
  b("social-links", {}),
];

const links = (html: string) =>
  [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1] as string);

function expectSafe(html: string) {
  expect(html.toLowerCase()).not.toContain("<script");
  const noQuoted = html.replace(/"[^"]*"/g, '""');
  expect(noQuoted).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/javascript:/i);
  for (const l of links(html)) {
    expect(l, `link ${l}`).toMatch(/^(https?:\/\/|mailto:)/);
  }
}

describe("renderEmail", () => {
  const out = renderEmail({
    blocks,
    styles,
    site,
    baseUrl,
    preheader: "New classes this autumn",
    unsubscribeUrl: "https://maya.example/unsubscribe?t=abc",
    viewInBrowserUrl: "https://maya.example/news/autumn",
  });

  it("matches snapshots", () => {
    expect(out.html).toMatchSnapshot();
    expect(out.text).toMatchSnapshot();
  });

  it("is email-safe: no scripts, absolute links, 600px, dark mode", () => {
    expectSafe(out.html);
    expect(out.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(out.html).toContain("prefers-color-scheme:dark");
    expect(out.html).toContain("max-width:600px");
    expect(out.html).toContain('role="presentation"');
    expect(out.html).not.toContain("var(--");
    expect(out.html).toContain("https://maya.example/media/hero.jpg");
    expect(out.html).toContain("https://maya.example/studio");
    expect(out.html).toContain("Unsubscribe");
    expect(out.html).toContain("New classes this autumn");
  });

  it("produces a plain-text alternative", () => {
    expect(out.text).toContain("Book a class: https://maya.example/book");
    expect(out.text).toContain("Unsubscribe: https://maya.example/unsubscribe?t=abc");
    expect(out.text).toContain("studio (https://maya.example/studio)");
    expect(out.text).not.toMatch(/<[a-z]/);
  });

  it("renders without styles/site", () => {
    const r = renderEmail({ blocks: [b("text", { content: doc("hi") })] });
    expect(r.html).toContain("hi");
    expectSafe(r.html);
  });

  it("escapes malicious content", () => {
    const evil = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';
    const r = renderEmail({
      baseUrl,
      site: { ...site, title: evil } as Site,
      preheader: evil,
      blocks: [
        b("text", {
          content: doc(evil, [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        }),
        b("text", {
          content: doc("x", [
            { type: "link", attrs: { href: 'https://a.example/"onmouseover="x' } },
          ]),
        }),
        b("image", { src: "javascript:alert(1)", alt: evil }),
        b("image", {
          src: "https://i.example/a.png",
          alt: evil,
          link: { type: "url", url: "data:text/html,<script>" },
        }),
        b("button", { label: evil, link: { type: "url", url: "javascript:alert(1)" } }),
        b("button", { label: evil, link: { type: "url", url: "https://ok.example/?a=1&b=<2>" } }),
        b("quote", { quote: doc(evil), name: evil, role: evil }),
        b("social-links", {
          profiles: [
            { network: "x", url: "javascript:alert(1)" },
            { network: evil, url: "https://x.example" },
          ],
        }),
        b("nonexistent", { html: evil }),
        b("os-internal/html", { html: "<script>1</script>", text: "" }),
      ],
      unsubscribeUrl: "javascript:alert(1)",
    });
    expectSafe(r.html);
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).not.toContain("Unsubscribe");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("a=1&amp;b=%3C2%3E");
  });
});

describe("safeUrl", () => {
  it("accepts and resolves only http(s)/mailto", () => {
    expect(safeUrl("/a?b=1", "https://x.example")).toBe("https://x.example/a?b=1");
    expect(safeUrl("media/a.png", "https://x.example/")).toBe("https://x.example/media/a.png");
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    for (const bad of [
      "javascript:x",
      "JaVa\nScript:x",
      "data:text/html,x",
      "//evil.example",
      "tel:1",
      "ftp://x",
      "",
      "/rel",
    ]) {
      expect(safeUrl(bad)).toBeNull();
    }
  });
});

describe("templates", () => {
  const common = { site, styles, baseUrl };

  it("confirmSubscriptionEmail", () => {
    const r = confirmSubscriptionEmail({
      ...common,
      confirmUrl: "https://hub.example/confirm?t=1",
    });
    expect(r.subject).toBe("Confirm your subscription to Maya Yoga");
    expect(r.html).toContain("https://hub.example/confirm?t=1");
    expect(r.text).toContain("https://hub.example/confirm?t=1");
    expect(r.html).not.toContain("Unsubscribe");
    expectSafe(r.html);
    expect(r).toMatchSnapshot();
  });

  it("formNotificationEmail escapes submitter input", () => {
    const evil = "<script>alert(1)</script>";
    const r = formNotificationEmail({
      ...common,
      formName: "Contact",
      entries: [
        { label: "Name", value: evil },
        { label: "Message", value: "Hello\nthere & <b>friend</b>" },
      ],
      entryUrl: "https://studio.example/inbox/1",
      submittedAt: "2026-10-26 10:00 UTC",
    });
    expect(r.subject).toBe("New Contact submission");
    expectSafe(r.html);
    expect(r.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(r.html).toContain("View in inbox");
    expect(r.text).toContain("Message: Hello\nthere & <b>friend</b>");
    expect(r).toMatchSnapshot();
  });

  it("magicLinkEmail", () => {
    const r = magicLinkEmail({
      ...common,
      url: "https://maya.example/_os/auth/callback?token=abc",
      expiresInMinutes: 10,
    });
    expect(r.subject).toContain("sign-in link");
    expect(r.html).toContain("expires in 10 minutes");
    expectSafe(r.html);
    expect(r).toMatchSnapshot();
  });

  it("orderReceiptEmail", () => {
    const r = orderReceiptEmail({
      ...common,
      orderNumber: "1042",
      currency: "usd",
      items: [
        { name: "Yoga mat <script>", quantity: 2, unitAmount: 4500, variant: "Sage" },
        { name: "Strap", quantity: 1, unitAmount: 1200 },
      ],
      subtotal: 10200,
      shipping: 600,
      tax: 0,
      total: 10800,
      shippingAddress: ["Sam Student", "1 Main St", "Boulder, CO"],
      orderUrl: "https://maya.example/orders/1042",
    });
    expect(r.html).toContain("$108.00");
    expect(r.html).toContain("Yoga mat &lt;script&gt;");
    expectSafe(r.html);
    expect(r.text).toContain("Total: $108.00");
    expect(r).toMatchSnapshot();
  });

  it("campaignEmail resolves/validates the unsubscribe URL", () => {
    const r = campaignEmail({
      ...common,
      subject: "Autumn\r\nBcc: x@evil.example",
      blocks,
      unsubscribeUrl: "https://maya.example/u/1",
    });
    expect(r.subject).toBe("Autumn Bcc: x@evil.example");
    expect(r.html).toContain("https://maya.example/u/1");
    expectSafe(r.html);
    expect(() =>
      campaignEmail({ ...common, subject: "s", blocks, unsubscribeUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(
      campaignEmail({ ...common, subject: "s", blocks, unsubscribeUrl: "/u/1" }).html,
    ).toContain("https://maya.example/u/1");
  });
});
