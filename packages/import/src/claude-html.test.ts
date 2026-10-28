import { readFileSync } from "node:fs";
import { join } from "node:path";
import { designCheck, publishCheck } from "@omniharmonic/openspace-lint";
import {
  CURRENT_SCHEMA_VERSION,
  checkComponent,
  componentInstances,
  findBrokenLinks,
  type SiteConfig,
} from "@omniharmonic/openspace-schema";
import { compileStyles } from "@omniharmonic/openspace-theme";
import { describe, expect, it } from "vitest";
import { bundleFromFiles, bundleFromHtml, bundleFromZip, importHtmlBundle } from "./claude-html";
import { humanize } from "./claude-html/component";
import { pngBytes } from "./testing";

const FIX = join(__dirname, "__fixtures__", "claude-html");
const config: SiteConfig = {
  $schema: "https://schema.openspace.host/v1/site-config.json",
  siteId: "st_htm1test0a",
  schemaVersion: CURRENT_SCHEMA_VERSION,
  template: { id: "starter", version: "1.0.0" },
  hub: "https://hub.openspace.host",
  deploy: { target: "github-pages", url: "https://me.github.io/site/", customDomain: null },
  features: { forms: true, newsletter: false, analytics: false, search: true },
} as SiteConfig;

/** Remote images (a JPEG-looking PNG of a size) and Google Fonts answering for real families. */
const net = async (url: string) => {
  if (/images\.example/.test(url))
    return new Response(pngBytes(1200, 900) as unknown as BodyInit, {
      headers: { "content-type": "image/png" },
    });
  if (/fonts\.googleapis\.com/.test(url))
    return /Fraunces|Work\+Sans|Playfair|Inter/.test(url)
      ? new Response("@font-face { font-family: x; }", { status: 200 })
      : new Response("bad", { status: 400 });
  return new Response("not found", { status: 404 });
};

const now = new Date("2026-10-27T12:00:00Z");

describe("HTML import (a page Claude made)", () => {
  it("turns a single-file page into editable designer sections on its own look", async () => {
    const html = readFileSync(join(FIX, "bakery.html"), "utf8");
    const r = await importHtmlBundle(bundleFromHtml(html, "bakery.html"), {
      config,
      fetch: net,
      now,
    });
    const doc = r.doc;
    if (process.env.DUMP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(`${process.env.DUMP}/bakery.json`, JSON.stringify(doc, null, 2));
    }
    // Header: navigation and the button.
    expect(doc.site.title).toBe("Crumb & Kettle");
    // The page's own wordmark wins over the new site's (slug-like) name (wave 4).
    const named = await importHtmlBundle(bundleFromHtml(html, "bakery.html"), {
      config,
      fetch: net,
      now,
      title: "os-e2e-w4-crumb",
    });
    expect(named.doc.site.title).toBe("Crumb & Kettle");
    // The design-system notes describe the page, not "a design-token file" with 0 fonts.
    const notes = (doc.designSystem?.mapping?.notes ?? []).join(" ");
    expect(notes).toMatch(/Read your page’s styles: \d+ colours, its fonts \(/);
    expect(notes).not.toMatch(/design-token file|0 font roles/);
    expect(doc.site.nav.map((n) => ("label" in n ? n.label : ""))).toEqual([
      "Our bakes",
      "Story",
      "Menu",
      "Visit us",
    ]);
    expect(doc.site.header.sticky).toBe(true);
    // Every section is a component with fields; the footer too.
    const home = Object.values(doc.pages)[0];
    const names = Object.keys(doc.components ?? {});
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const def of Object.values(doc.components ?? {}))
      expect(checkComponent(def).ok, def.name).toBe(true);
    const insts = componentInstances(doc);
    const hero = insts.find((i) => JSON.stringify(i.fields).includes("Bread worth"));
    expect(hero).toBeTruthy();
    expect(JSON.stringify(hero?.fields)).toContain("waking up");
    // The hero's CSS background photo is an image field.
    expect(JSON.stringify(hero?.fields)).toMatch(/"src":"media\//);
    // Cards repeat → a list.
    const features = insts.find((i) => JSON.stringify(i.fields).includes("Sourdough"));
    const list = Object.values(features?.fields ?? {}).find(Array.isArray) as unknown[];
    expect(list?.length).toBe(3);
    // The menu list is a list too.
    const menu = insts.find((i) => JSON.stringify(i.fields).includes("Cardamom bun"));
    expect(Object.values(menu?.fields ?? {}).some((v) => Array.isArray(v) && v.length === 4)).toBe(
      true,
    );
    // The contact form became a form block after its section.
    expect(JSON.stringify(home?.sections)).toContain('"type":"form"');
    // Links: in-page anchors and email.
    expect(JSON.stringify(hero?.fields)).toContain('"type":"email"');
    expect(JSON.stringify(hero?.fields)).toMatch(/"anchor":"menu"/);
    expect(home?.sections.map((s) => s.anchor).filter(Boolean)).toEqual(
      expect.arrayContaining(["bakes", "story", "menu", "visit"]),
    );
    // Footer component.
    expect(doc.site.footer.blocks[0]?.type).toMatch(/^component\//);
    // The look: Site Styles from the page.
    const light = compileStyles(doc.styles).tokens.themes.light;
    expect(light.background).toBe("#fbf3e6");
    expect(doc.styles.choices.typography?.heading?.family).toBe("Fraunces");
    expect(doc.styles.choices.typography?.body?.family).toBe("Work Sans");
    // CSS rewritten onto tokens.
    const css = Object.values(doc.components ?? {})
      .map((c) => c.css ?? "")
      .join("\n");
    expect(css).toContain("var(--os-color-background)");
    expect(css).toContain("var(--os-font-heading)");
    // Reveal-on-scroll cards are shown (the script's class is applied statically).
    expect(
      JSON.stringify(features?.fields) + (doc.components?.[features?.name ?? ""]?.template ?? ""),
    ).toContain("visible");
    // Design-system record.
    expect(doc.designSystem?.sources?.[0]?.kind).toBe("html");
    expect(Object.keys(doc.designSystem?.components ?? {}).length).toBe(names.length);
    // Gates: no errors.
    const errors = [...designCheck(doc), ...publishCheck(doc).errors].filter(
      (i) => i.severity === "error",
    );
    expect(errors.map((e) => `${e.rule}: ${e.message}`)).toEqual([]);
    expect(r.report).toContain("## Designed sections");
  });

  it("reads a folder (or zip) of pages, stylesheets and images", async () => {
    const files: Record<string, Uint8Array | string> = {
      "studio/index.html": readFileSync(join(FIX, "studio", "index.html"), "utf8"),
      "studio/about.html": readFileSync(join(FIX, "studio", "about.html"), "utf8"),
      "studio/css/site.css": readFileSync(join(FIX, "studio", "css", "site.css"), "utf8"),
      "studio/img/portrait.png": pngBytes(800, 1000),
      "studio/img/work-1.png": pngBytes(1200, 800),
      "studio/img/work-2.png": pngBytes(1100, 800),
      "studio/img/work-3.png": pngBytes(1000, 800),
    };
    const bundle = bundleFromFiles(files, { label: "studio.zip" });
    expect(bundle.entry).toBe("index.html");
    const r = await importHtmlBundle(bundle, { config, now });
    const pages = Object.values(r.doc.pages);
    expect(pages.map((p) => p.slug).sort()).toEqual(["", "about"]);
    const about = pages.find((p) => p.slug === "about");
    expect(about?.sections.length).toBeGreaterThan(0);
    // Local pictures were carried across.
    expect([...r.files.keys()].filter((k) => k.startsWith("media/")).length).toBeGreaterThanOrEqual(
      4,
    );
    // Links between the pages became page links.
    expect(JSON.stringify(r.doc.site.nav)).toContain(about?.id as string);
    const errors = [...designCheck(r.doc), ...publishCheck(r.doc).errors].filter(
      (i) => i.severity === "error",
    );
    expect(errors.map((e) => `${e.rule}: ${e.message}`)).toEqual([]);
  });

  it("opens zips and refuses bundles without a page", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const zip = zipSync({ "site/index.html": strToU8("<h1>Hi</h1><p>There</p>") });
    expect(bundleFromZip(zip).entry).toBe("index.html");
    expect(() => bundleFromFiles({ "a.css": "body{}" })).toThrow(/no HTML page/);
  });
});

describe("in-page links (Boulder Foodshed: the header wasn't connected to the sections)", () => {
  it("keeps every menu entry, button and footer link pointing at its section", async () => {
    const html = readFileSync(join(FIX, "foodshed.html"), "utf8");
    const r = await importHtmlBundle(bundleFromHtml(html, "foodshed.html"), {
      config,
      fetch: net,
      now,
    });
    const doc = r.doc;
    if (process.env.DUMP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(`${process.env.DUMP}/foodshed.json`, JSON.stringify(doc, null, 2));
    }
    const home = Object.values(doc.pages).find((p) => p.slug === "");
    if (!home) throw new Error("no home");
    // Ids on the section, on a wrapper inside it, on a wrapper around it, on its heading.
    const anchors = home.sections.map((s) => s.anchor).filter(Boolean);
    expect(anchors).toEqual(
      expect.arrayContaining(["how-it-works", "baskets", "questions", "waitlist"]),
    );
    // The menu: entries that scroll to those sections (desktop and phone use the same items).
    const entries = doc.site.nav.map((n) =>
      n.type === "page" ? [n.label, n.anchor] : n.type === "button" ? [n.label, n.link] : [n.type],
    );
    expect(entries).toEqual([
      ["How it works", "how-it-works"],
      ["Baskets", "baskets"],
      ["Questions", "questions"],
      ["Join the waitlist", { type: "page", page: home.id, anchor: "waitlist" }],
    ]);
    // Nothing anywhere links to a part of a page that isn't there.
    expect(findBrokenLinks(doc).map((l) => `${l.kind}: ${l.message}`)).toEqual([]);
  });
});

describe("component field labels", () => {
  it("spell out shorthand and split numbers (wave 4: “Cta 2label”)", () => {
    expect(humanize("cta2Label")).toBe("Button 2 text");
    expect(humanize("cta", "link")).toBe("Button goes to");
    expect(humanize("ctaLabel")).toBe("Button text");
    expect(humanize("title")).toBe("Title");
    expect(humanize("kicker")).toBe("Small label");
    expect(humanize("heroImg")).toBe("Hero picture");
  });
});
