/**
 * Wow-level fidelity: highest-quality assets (original renditions, SVGs kept as SVG, favicons,
 * focal points, dedup), fonts that may not be copied (nearest open match by measured shape, the
 * "Use your own font licence" item), the honest score (partial font credit, the screenshot
 * share) and the auto-tuner. Fixtures are authored here.
 */
import { readFileSync } from "node:fs";
import { componentIssues } from "@omniharmonic/openspace-lint";
import { checkComponent, type SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { setupChecklist } from "./checklist";
import { parseDocument } from "./dom";
import {
  compareLooks,
  fidelityReport,
  fontCredit,
  matchSections,
  type SectionComparison,
  withVisual,
} from "./fidelity/compare";
import { canGenerate, componentFromBlueprint, partLabels } from "./fidelity/component-gen";
import {
  categoryOf,
  metricDistance,
  nearestOpenFont,
  servedByLicensedHost,
  serviceName,
} from "./fidelity/font-match";
import { OPEN_FONT_METRICS } from "./fidelity/font-metrics";
import { fitGoogleWeights } from "./fidelity/fonts";
import { lookFromProbe } from "./fidelity/look";
import type { FontMetrics, LookProbe, ProbeSection, ProbeText } from "./fidelity/probe";
import { nearestAspect, sectionLabel, tuneRound } from "./fidelity/tune";
import { bestIcon } from "./html/icons";
import { imageFromImg } from "./html/image";
import { mapTheme } from "./map/theme";
import { MediaImporter, squarespaceRenditions } from "./media";
import { pngBytes } from "./testing";
import type { SqSite, SqTheme } from "./types";

const t = (family: string, size: number, extra: Partial<ProbeText> = {}): ProbeText => ({
  family,
  size,
  lineHeight: 1.3,
  letterSpacing: 0,
  case: "none",
  weight: 400,
  italic: false,
  ...extra,
});

const sec = (heading: string, extra: Partial<ProbeSection> = {}): ProbeSection => ({
  index: 0,
  top: 0,
  height: 500,
  background: "#ffffff",
  heading: { ...t("adobe-garamond-pro", 40), text: heading, tag: "h2", left: 160 },
  body: t("adobe-garamond-pro", 18),
  columns: 1,
  italicLines: 0,
  text: heading,
  ...extra,
});

// Shapes as Chromium draws them (the probe's canvas measurement).
const GARAMOND_PRO: FontMetrics = {
  xHeight: 0.397,
  capHeight: 0.663,
  width: 0.435,
  weights: [400],
  category: "serif",
};
const PROXIMA: FontMetrics = {
  xHeight: 0.483,
  capHeight: 0.667,
  width: 0.501,
  weights: [600],
  category: "sans-serif",
};

describe("fonts that may not be copied", () => {
  it("picks the nearest open family by measured shape, within the font's kind", () => {
    const g = nearestOpenFont("adobe-garamond-pro", GARAMOND_PRO);
    expect(g).toMatchObject({ family: "EB Garamond", category: "serif", via: "metrics" });
    expect(g.distance).toBeLessThan(0.03);
    const p = nearestOpenFont("proxima-nova", PROXIMA);
    expect(p.category).toBe("sans-serif");
    expect(OPEN_FONT_METRICS.some(([f, cat]) => f === p.family && cat === "sans-serif")).toBe(true);
    // A small-caps face gets a small-caps family.
    const sc = nearestOpenFont("v", {
      xHeight: 0.55,
      capHeight: 0.68,
      width: 0.64,
      weights: [700],
      smallCaps: true,
      category: "serif",
    });
    expect(OPEN_FONT_METRICS.find(([f]) => f === sc.family)?.[5]).toBe(true);
  });

  it("uses metric-compatible twins for system fonts and known equivalents without measurements", () => {
    expect(nearestOpenFont("Georgia")).toMatchObject({ family: "Gelasio", via: "system twin" });
    expect(nearestOpenFont("Helvetica")).toMatchObject({ family: "Arimo" });
    expect(nearestOpenFont("futura-pt")).toMatchObject({
      family: "Jost",
      category: "sans-serif",
      via: "known equivalent",
    });
    expect(nearestOpenFont("freight-sans-pro").category).toBe("sans-serif");
    expect(categoryOf("freight-text-pro")).toBe("serif");
    expect(nearestOpenFont("Mystery Grotesk").via).toBe("category");
  });

  it("tells licensed font services apart from open ones", () => {
    const hosts = servedByLicensedHost([
      "https://use.typekit.net/ik/abc.js",
      "https://p.typekit.net/p.css?s=1",
      "https://fonts.gstatic.com/s/inter/v1/a.woff2",
      "https://cloud.typography.com/123/css/fonts.css",
    ]);
    expect(hosts.sort()).toEqual(["cloud.typography.com", "p.typekit.net", "use.typekit.net"]);
    expect(serviceName("use.typekit.net")).toBe("Adobe Fonts");
    expect(metricDistance(GARAMOND_PRO, GARAMOND_PRO)).toBe(0);
  });

  it("maps the measured look to open stand-ins, notes them and asks for the owner's licence", () => {
    const theme: SqTheme = {
      colors: { accent: "#2a9d8f", white: "#ffffff" },
      fonts: { heading: { family: "adobe-garamond-pro" }, body: { family: "adobe-garamond-pro" } },
      sizes: {},
      buttons: {},
      typography: {
        heading: { family: "adobe-garamond-pro", category: "serif", weights: [400] },
        body: { family: "adobe-garamond-pro", category: "serif" },
        label: { family: "proxima-nova", category: "sans-serif", weights: [600] },
      },
      googleFonts: [],
      fontMetrics: { "adobe-garamond-pro": GARAMOND_PRO, "proxima-nova": PROXIMA },
      fontHosts: ["use.typekit.net"],
    };
    const site = {
      baseUrl: "https://bedford.example",
      title: "Bedford",
      social: [],
      nav: [],
      footer: [],
      theme,
      pages: [],
      collections: [],
      aliases: [],
      customCode: [],
      notices: [],
      platform: "squarespace",
    } as SqSite;
    const d = mapTheme(site);
    expect(d.styles.choices.typography?.heading?.family).toBe("EB Garamond");
    expect(d.styles.choices.typography?.label?.category).toBe("sans-serif");
    expect(d.notes.join(" ")).toMatch(
      /adobe-garamond-pro \(licensed from Adobe Fonts\) can.t be copied, so EB Garamond/,
    );
    expect(site.theme.fontSubstitutes?.map((f) => f.original)).toEqual([
      "adobe-garamond-pro",
      "proxima-nova",
    ]);
    const list = setupChecklist(site, { notices: [], doc: { pages: {} } } as never);
    const item = list.items.find((i) => i.id === "font-licence");
    expect(item).toMatchObject({ kind: "other", title: "Use your own font licence" });
    expect(item?.detail).toMatch(/adobe-garamond-pro \(from Adobe Fonts\)/);
    expect(item?.detail).toMatch(/Site Styles → Your fonts .*media\/fonts\//);
  });

  it("only asks Google for weights it serves (one bad weight would break every font)", async () => {
    const asked: string[] = [];
    const google = (async (u: RequestInfo | URL) => {
      const url = String(u);
      asked.push(url);
      // EB Garamond: 400–800, italics; no 300.
      const ok = !/[;@,]300/.test(url);
      return new Response(ok ? "@font-face{}" : "bad", { status: ok ? 200 : 400 });
    }) as typeof fetch;
    const f = await fitGoogleWeights(
      { family: "EB Garamond", category: "serif", weights: [300, 400, 600], italic: true },
      google,
    );
    expect(f).toEqual({
      family: "EB Garamond",
      category: "serif",
      weights: [400, 700],
      italic: true,
    });
    expect(asked[0]).toContain("family=EB+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600");
    // Offline: left as it is.
    const offline = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const same = { family: "Lora", category: "serif" as const, weights: [500] };
    expect(await fitGoogleWeights(same, offline)).toBe(same);
  });

  it("keeps every weight and the italics the page uses, and the fonts' shapes", () => {
    const probe: LookProbe = {
      url: "https://x.example/",
      viewport: 1440,
      title: "",
      presets: {
        h1: t("Lora", 48, { weight: 700 }),
        h2: t("Lora", 36, { weight: 600 }),
        body: t("Inter", 18),
        lead: t("Inter", 22, { weight: 300, italic: true }),
      },
      layout: {},
      sections: [],
      height: 1000,
      fonts: { Lora: { ...GARAMOND_PRO, weights: [600, 700] } },
      fontRequests: ["https://use.typekit.net/x.css"],
    };
    const look = lookFromProbe(probe);
    expect(look?.typography.heading?.weights).toEqual([600, 700]);
    expect(look?.typography.body?.weights).toEqual([300, 400, 600]);
    expect(look?.typography.body?.italic).toBe(true);
    expect(look?.metrics?.Lora?.xHeight).toBe(0.397);
    expect(look?.fontHosts).toEqual(["use.typekit.net"]);
  });
});

describe("the honest score", () => {
  const base: LookProbe = {
    url: "https://bedford.example/",
    viewport: 1440,
    title: "",
    presets: { h2: t("adobe-garamond-pro", 40), body: t("adobe-garamond-pro", 18) },
    layout: { contentWidth: 960 },
    sections: [sec("We conserve land")],
    height: 2000,
    fonts: { "adobe-garamond-pro": GARAMOND_PRO },
  };
  const ours = (family: string, metrics: FontMetrics): LookProbe => ({
    ...base,
    presets: { h2: t(family, 40), body: t(family, 18) },
    sections: [
      sec("We conserve land", {
        heading: { ...t(family, 40), text: "We conserve land", tag: "h2", left: 160 },
        body: t(family, 18),
      }),
    ],
    fonts: { [family]: metrics },
  });

  it("gives an open stand-in of the same shape partial credit, an unrelated font none", () => {
    const close = ours("EB Garamond", {
      ...GARAMOND_PRO,
      xHeight: 0.405,
      capHeight: 0.653,
      width: 0.437,
    });
    const far = ours("Fraunces", {
      xHeight: 0.52,
      capHeight: 0.7,
      width: 0.6,
      weights: [400],
      category: "serif",
    });
    const sans = ours("Inter", { ...GARAMOND_PRO, category: "sans-serif" });
    expect(fontCredit("adobe-garamond-pro", "EB Garamond", base, close)).toBe(0.85);
    expect(fontCredit("adobe-garamond-pro", "Fraunces", base, far)).toBeLessThan(0.5);
    expect(fontCredit("adobe-garamond-pro", "Inter", base, sans)).toBe(0);
    const a = compareLooks(base, close, "/");
    const b = compareLooks(base, far, "/");
    expect(a.checks.find((c) => c.what === "Body font")).toMatchObject({
      ok: false,
      credit: 0.85,
      imported: "EB Garamond (close stand-in)",
    });
    expect(a.score).toBeGreaterThan(b.score);
    expect(compareLooks(base, base, "/").score).toBe(100);
  });

  it("measures the screenshot similarity from what unrelated pages score, and the weaker signal counts double", () => {
    const cmp = compareLooks(base, base, "/");
    // 0.6 is what two unrelated pages' screenshots typically compare at (zero point 0.55 on a
    // computer): every check passing can't make up for pictures that look nothing alike.
    // Uncalibrated (v3.1) this page read 90/100.
    const v = withVisual(cmp, 0.6);
    const pics = (0.6 - 0.55) / 0.45;
    expect(v).toMatchObject({ structure: 100, visual: 0.6, raw: 90 });
    expect(v.score).toBe(Math.round(100 * (0.25 + 0.25 * pics + 0.5 * pics)));
    expect(v.score).toBeLessThan(40);
    expect(fidelityReport([v]).score).toBe(v.score);
    expect(fidelityReport([v]).raw).toBe(90);
  });

  it("matches the parts of an article the original split around its pictures", () => {
    const long = "One two three four five six seven eight nine ten eleven twelve thirteen";
    const o = [
      sec("", { heading: undefined, text: "One two three", words: "One two three four five six" }),
      sec("", { heading: undefined, text: "seven eight", words: "seven eight nine ten eleven" }),
    ];
    const i = [sec("", { heading: undefined, text: "One two", words: long })];
    expect(matchSections(o, i)).toEqual([0, 0]);
  });
});

describe("auto-tuning", () => {
  const doc = (): SiteDocument =>
    ({
      config: {},
      site: { title: "x" },
      styles: {
        choices: {
          palette: { brand: "#b8714a", neutral: "warm", contrast: "standard" },
          pairing: "classic-editorial",
          density: "comfortable",
          shape: "soft",
          buttons: "solid",
          motion: "subtle",
          imageTreatment: "none",
        },
      },
      pages: {
        pg_home: {
          id: "pg_home",
          title: "Home",
          slug: "",
          sections: [
            {
              id: "sec_a",
              layout: { mode: "stack", columns: { d: [7, 5] } },
              style: { colorTheme: "dark" },
              blocks: [
                { id: "blk_t", type: "heading", v: 1, fields: { text: "Power With" }, column: 0 },
                {
                  id: "blk_i",
                  type: "image",
                  v: 1,
                  fields: { image: { src: "media/a.jpg", alt: "" }, aspect: "4:5" },
                  column: 1,
                },
              ],
            },
          ],
        },
      },
      collections: {},
      collectionConfigs: {},
      media: {},
    }) as unknown as SiteDocument;
  const probe = (h2: number, extra: Partial<ProbeSection> = {}): LookProbe => ({
    url: "x",
    viewport: 1440,
    title: "",
    presets: { h2: t("Cormorant Garamond", h2) },
    layout: { contentWidth: 1200 },
    sections: [
      sec("Power With", {
        heading: { ...t("Cormorant Garamond", h2), text: "Power With", tag: "h2", left: 120 },
        background: "#0f0e0c",
        button: "#b8714a",
        image: { side: "right", widthShare: 0.3, top: 0, aspect: 0.66 },
        ...extra,
      }),
    ],
    height: 3000,
  });

  it("proposes the original's sizes, button fills per theme and image crops, one group at a time", () => {
    const original = probe(60);
    const imported = probe(42, {
      button: "#d99a76",
      image: { side: "right", widthShare: 0.3, top: 0, aspect: 0.8 },
    });
    const comparison = compareLooks(original, imported, "/");
    const m = [{ path: "/", viewport: 1440, original, imported, comparison }];
    const type = tuneRound(doc(), m, ["type"]);
    expect(type.doc.styles.choices.typography?.scale?.h2?.size).toBe(60);
    expect(type.doc.styles.overrides).toBeUndefined();
    const buttons = tuneRound(doc(), m, ["buttons"]);
    expect(buttons.doc.styles.overrides).toEqual({
      color: { dark: { accent: { $type: "color", $value: "#b8714a" } } },
    });
    expect(buttons.changes).toEqual(["buttons on dark sections #b8714a, as on the original"]);
    const sections = tuneRound(doc(), m, ["crops"]);
    const img = sections.doc.pages.pg_home?.sections[0]?.blocks[1];
    expect(img?.fields.aspect).toBe("2:3");
    // The input is never changed.
    expect(doc().styles.choices.typography).toBeUndefined();
  });

  it("sets headings in the original's other role font (capitalised label-font h2s)", () => {
    const o = (path: string): LookProbe => ({
      ...probe(60),
      url: path,
      presets: {
        h1: t("adobe-garamond-pro", 32),
        h2: t("proxima-nova", 25, { case: "uppercase", letterSpacing: 0.15 }),
        body: t("adobe-garamond-pro", 18),
        nav: t("proxima-nova", 13, { case: "uppercase" }),
      },
    });
    const imp = probe(25);
    const m = ["/", "/contact"].map((path) => ({
      path,
      viewport: 1440,
      original: o(path),
      imported: imp,
      comparison: compareLooks(o(path), imp, path),
    }));
    const r = tuneRound(doc(), m, ["type"]);
    expect(r.doc.styles.choices.typography?.scale?.h2).toMatchObject({
      font: "label",
      case: "uppercase",
      letterSpacing: 0.15,
    });
    expect(r.changes).toContain("h2: in the label font, as on the original");
  });

  it("leaves a size alone when the original isn't consistent across pages", () => {
    const a = probe(60);
    const b = probe(30);
    const imp = probe(42);
    const m = [
      {
        path: "/",
        viewport: 1440,
        original: a,
        imported: imp,
        comparison: compareLooks(a, imp, "/"),
      },
      {
        path: "/x",
        viewport: 1440,
        original: b,
        imported: imp,
        comparison: compareLooks(b, imp, "/x"),
      },
    ];
    expect(tuneRound(doc(), m, ["type"]).changes).toEqual([]);
    expect(nearestAspect(1.52)).toBe("3:2");
    expect(nearestAspect(1.2)).toBe("original");
  });
});

describe("highest-quality assets", () => {
  it("asks Squarespace's CDN for the file as uploaded first", () => {
    const u = new URL("https://images.squarespace-cdn.com/content/v1/abc/photo.jpg");
    expect(squarespaceRenditions(u, 4000, 3000, true)[0]).toBe(`${u}?format=original`);
    // Without a resizer, a known-too-large original is skipped.
    expect(squarespaceRenditions(u, 4000, 3000, false)[0]).toMatch(/format=1500w$/);
    expect(squarespaceRenditions(u, 1200, 800, false)[0]).toMatch(/format=original$/);
  });

  it("keeps an image's focal point from object-position and every <picture> source", () => {
    const html = `<picture><source type="image/webp" srcset="https://x.example/a-800.webp 800w, https://x.example/a-2600.webp 2600w"><img src="https://x.example/a-400.jpg" alt="Lake" style="object-position: 25% 70%"></picture>`;
    const pic = parseDocument(`<html><body>${html}</body></html>`);
    const find = (n: unknown): unknown => {
      const e = n as { tagName?: string; childNodes?: unknown[] };
      if (e.tagName === "picture") return e;
      for (const c of e.childNodes ?? []) {
        const r = find(c);
        if (r) return r;
      }
      return undefined;
    };
    const img = imageFromImg(find(pic) as never, "https://x.example/");
    expect(img).toMatchObject({
      url: "https://x.example/a-2600.webp",
      alt: "Lake",
      focal: [0.25, 0.7],
    });
  });

  it("picks the best site icon: SVG, then the largest PNG, never .ico", () => {
    const head = parseDocument(`<html><head>
      <link rel="icon" href="/favicon.ico">
      <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
      <link rel="apple-touch-icon" href="/apple.png">
    </head></html>`);
    expect(bestIcon(head, "https://x.example/")).toBe("https://x.example/apple.png");
    const svg = parseDocument(
      `<html><head><link rel="icon" href="/i.png"><link rel="icon" type="image/svg+xml" href="/i.svg"></head></html>`,
    );
    expect(bestIcon(svg, "https://x.example/")).toBe("https://x.example/i.svg");
  });

  it("keeps SVG marks as sanitized SVG, stores identical files once and keeps credits", async () => {
    const png = pngBytes(800, 600, "same");
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><!-- editor --><path d="M0 0h120v40H0z" fill="currentColor"/></svg>`;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("evil"))
        return new Response(
          `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
          {
            headers: { "content-type": "image/svg+xml" },
          },
        );
      if (url.endsWith(".svg"))
        return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
      return new Response(png as unknown as BodyInit, { headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    const media = new MediaImporter({
      fetch: fetchImpl,
      now: new Date("2026-10-01"),
      source: "WordPress",
    });
    const logo = await media.image({ url: "https://x.example/logo.svg#color=112233", alt: "Logo" });
    expect(logo?.src).toMatch(/^media\/2026\/10\/logo-[a-z0-9]{4}\.svg$/);
    const text = new TextDecoder().decode(media.files.get(logo?.src as string));
    expect(text).toContain('fill="#112233"');
    expect(text).not.toContain("<!--");
    expect(media.media[logo?.src as string]).toMatchObject({
      mime: "image/svg+xml",
      width: 120,
      height: 40,
    });
    const a = await media.image({
      url: "https://x.example/a.png",
      alt: "A",
      credit: "Jared Chambers",
    });
    const b = await media.image({ url: "https://cdn.example/other-name.png", alt: "B" });
    expect(b?.src).toBe(a?.src);
    expect(b?.alt).toBe("B");
    expect(media.media[a?.src as string]?.credit).toEqual({
      source: "Imported from WordPress",
      author: "Jared Chambers",
    });
    // A hostile SVG never reaches the site as SVG (and is reported).
    const evil = await media.image({ url: "https://x.example/evil.svg", alt: "" });
    expect(evil?.src ?? "").not.toMatch(/\.svg$/);
    expect(media.notices.some((n) => /couldn.t be kept as a vector/.test(n.message))).toBe(true);
  });
});

describe("the probe script", () => {
  it("measures fonts, sidebars, section buttons and long text for matching", () => {
    const src = readFileSync(new URL("./fidelity/probe.ts", import.meta.url), "utf8");
    for (const s of ["measureText", "fontRequests", "sidebar", "res.button", "words:"])
      expect(src).toContain(s);
  });
});

describe("importers → custom components", () => {
  const card = (): ProbeSection =>
    sec("", {
      heading: undefined,
      height: 385,
      text: "ABOUT Find out about our organization",
      blueprint: [
        {
          kind: "image",
          src: "https://images.example.com/bridge.jpg",
          alt: "A bridge",
          box: { x: 242, y: 1068, w: 468, h: 351 },
        },
        {
          kind: "text",
          text: "ABOUT",
          box: { x: 928, y: 1130, w: 71, h: 21 },
          style: {
            ...t("proxima-nova", 14.6, { case: "uppercase", letterSpacing: 0.2, color: "#999999" }),
            align: "center",
          },
        },
        {
          kind: "text",
          text: "Find out about our organization, mission, our methods, and the results of our decades of advocacy.",
          box: { x: 772, y: 1180, w: 384, h: 103 },
          style: { ...t("adobe-garamond-pro", 23, { color: "#222222" }), align: "center" },
        },
        {
          kind: "button",
          text: "LEARN MORE",
          href: "/about-bedford",
          box: { x: 890, y: 1321, w: 148, h: 39 },
          style: { ...t("proxima-nova", 12.3, { case: "uppercase" }), align: "center" },
        },
      ],
    });

  it("recreates a section's layout on tokens with every part an editable field", () => {
    const gen = componentFromBlueprint({
      name: "imported-home-3",
      label: "About card",
      section: card(),
      roles: { heading: "adobe-garamond-pro", body: "adobe-garamond-pro", label: "proxima-nova" },
      colors: { text: "#222222", heading: "#111111", "text-muted": "#999999" },
      link: (href) =>
        href.startsWith("/") ? { type: "url", url: `https://x.example${href}` } : undefined,
    });
    expect(gen).toBeDefined();
    const def = gen?.def as NonNullable<typeof gen>["def"];
    const check = checkComponent(def);
    expect(check.ok ? [] : check.issues).toEqual([]);
    expect(Object.keys(def.fields).sort()).toEqual(["image1", "label4", "link4", "text2", "text3"]);
    expect(gen?.fields).toMatchObject({
      image1: { src: "https://images.example.com/bridge.jpg", alt: "A bridge" },
      text2: "ABOUT",
      label4: "LEARN MORE",
      link4: { type: "url", url: "https://x.example/about-bedford" },
    });
    // Theme fonts and colours, never fixed colours or the original's CSS.
    expect(def.css).toContain("font-family: var(--os-font-label)");
    expect(def.css).toContain("color: var(--os-color-text-muted)");
    expect(def.css).not.toMatch(/#[0-9a-f]{6}/i);
    expect(def.css).toContain("@media (max-width: 767px)");
    expect(def.template).toContain('{{button link4 label=label4 variant="primary"}}');
    // Field names a non-technical owner understands (wave 4: "Text 2", "Button 4 text").
    expect(Object.fromEntries(Object.entries(def.fields).map(([k, f]) => [k, f.label]))).toEqual({
      image1: "Picture",
      text2: "Small label",
      text3: "Paragraph",
      label4: "Button",
      link4: "Button goes to",
    });
    expect(canGenerate(card())).toBe(true);
    expect(canGenerate(sec("x", { blueprint: undefined }))).toBe(false);
  });

  it("tells several parts of one kind apart by their words, and names sections by their heading", () => {
    expect(
      partLabels([
        { role: "button", text: "LEARN MORE" },
        { role: "button", text: "Donate today" },
        { role: "paragraph", text: "First paragraph about our studio" },
        { role: "paragraph", text: "Second one" },
        { role: "picture", text: "a" },
        { role: "picture", text: "b" },
      ]),
    ).toEqual([
      "Main button",
      "Button “Donate today”",
      "Paragraph “First paragraph about…”",
      "Paragraph “Second one”",
      "Picture 1",
      "Picture 2",
    ]);
    expect(sectionLabel(undefined, [{ kind: "text", text: "ABOUT" }], "Home", 3)).toBe("About");
    expect(sectionLabel("Our work", undefined, "Home", 3)).toBe("Our work");
    expect(sectionLabel(undefined, [], "Home", 3)).toBe("Home section 3");
  });

  it("the tuner swaps a low-scoring section for its component, and lint gates pass", () => {
    const original: LookProbe = {
      url: "https://x.example/",
      viewport: 1440,
      title: "",
      presets: { body: t("adobe-garamond-pro", 18), button: t("proxima-nova", 12) },
      layout: {},
      sections: [card()],
      height: 2000,
    };
    const imported: LookProbe = {
      ...original,
      sections: [sec("Find out about our organization", { columns: 2, height: 900, text: "x" })],
    };
    const comparison = compareLooks(original, imported, "/");
    comparison.sections[0] = {
      ...(comparison.sections[0] as SectionComparison),
      importedIndex: 0,
      score: 30,
    };
    const d = {
      config: {},
      site: {
        title: "x",
        footer: {
          id: "sec_f",
          layout: { mode: "stack", columns: { d: [12] } },
          style: {},
          blocks: [],
        },
      },
      styles: {
        choices: {
          palette: { brand: "#2a9d8f", neutral: "warm", contrast: "standard" },
          pairing: "classic-editorial",
          density: "comfortable",
          shape: "soft",
          buttons: "solid",
          motion: "subtle",
          imageTreatment: "none",
        },
      },
      pages: {
        pg_home: {
          id: "pg_home",
          title: "Home",
          slug: "",
          sections: [
            {
              id: "sec_a",
              layout: { mode: "stack", columns: { d: [6, 6] } },
              style: { colorTheme: "light" },
              blocks: [],
            },
          ],
        },
      },
      collections: {},
      collectionConfigs: {},
      media: {},
    } as unknown as SiteDocument;
    const r = tuneRound(
      d,
      [{ path: "/", viewport: 1440, original, imported, comparison }],
      ["components"],
    );
    expect(r.changes).toEqual(["/: section 1 recreated as a custom component"]);
    const section = r.doc.pages.pg_home?.sections[0];
    expect(section?.id).toBe("sec_a");
    expect(section?.blocks[0]?.type).toBe("component/imported-home-1");
    expect(r.doc.components?.["imported-home-1"]?.category).toBe("imported");
    expect(componentIssues(r.doc).filter((i) => i.severity === "error")).toEqual([]);
  });
});
