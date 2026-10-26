import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { loadSiteDocument } from "../content/index";
import { fontPreloads, googleFontPlan, resolveFonts } from "./fonts";

const MEADOW = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tools/fixtures/meadow-site",
);

const CSS = `/* latin-ext */
@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/dmsans/v17/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/dmsans/v17/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* latin */
@font-face {
  font-family: 'Syne';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/syne/v1/italic.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
/* latin */
@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/syne/v1/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`;

function fakeFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.startsWith("https://fonts.googleapis.com/")) return new Response(CSS);
    return new Response(new Uint8Array([1, 2, 3]));
  }) as unknown as typeof fetch;
}

describe("Google Fonts self-hosting", () => {
  it("downloads the stylesheet and every WOFF2 once, rewriting urls under the base path", async () => {
    const f = fakeFetch();
    const plan = await googleFontPlan("https://fonts.googleapis.com/css2?family=A", "/site", f);
    expect(plan).not.toBeNull();
    expect(plan?.files.filter((x) => x.name.endsWith(".woff2"))).toHaveLength(4);
    expect(plan?.css).not.toContain("fonts.gstatic.com");
    expect(plan?.css).toMatch(/url\(\/site\/_os\/fonts\/[a-z0-9]+\.woff2\)/);
    expect(plan?.cssFile).toMatch(/^_os\/fonts\/fonts\.[a-z0-9]+\.css$/);
    // Memoised: a second call (the post-build step) downloads nothing new.
    const calls = (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await googleFontPlan("https://fonts.googleapis.com/css2?family=A", "/site", f);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);
  });

  it("ships each family's license next to the fonts", async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://fonts.googleapis.com/")) return new Response(CSS);
      if (u.includes("/ofl/dmsans/OFL.txt"))
        return new Response(
          "Copyright 2014 The DM Sans Project Authors\nSIL Open Font License, Version 1.1",
        );
      if (u.includes("raw.githubusercontent.com")) return new Response("", { status: 404 });
      return new Response(new Uint8Array([1]));
    }) as unknown as typeof fetch;
    const plan = await googleFontPlan("https://fonts.googleapis.com/css2?family=L", "", f, [
      "DM Sans",
      "Syne",
    ]);
    const text = (name: string) =>
      new TextDecoder().decode(plan?.files.find((x) => x.name === name)?.data);
    expect(text("LICENSE-dm-sans.txt")).toContain("SIL Open Font License, Version 1.1");
    expect(text("LICENSE-syne.txt")).toContain("https://fonts.google.com/specimen/Syne/license");
  });

  it("gives up (null) when Google Fonts can't be reached, so pages keep the link", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await googleFontPlan("https://fonts.googleapis.com/css2?family=B", "", f)).toBeNull();
    const { googleFonts } = await import("./fonts");
    const r = await googleFonts("https://fonts.googleapis.com/css2?family=B", "", [], f);
    expect(r.reason).toMatch(/fetch failed/);
  });
});

describe("resolveFonts", () => {
  it("never downloads unless asked (publish workflows set OPENSPACE_GOOGLE_FONTS=download)", async () => {
    const doc = await loadSiteDocument(MEADOW);
    const f = fakeFetch();
    const saved = process.env.OPENSPACE_GOOGLE_FONTS;
    delete process.env.OPENSPACE_GOOGLE_FONTS;
    try {
      const r = await resolveFonts(MEADOW, doc, "", { fetch: f });
      expect(r.plan).toBeUndefined();
      expect(r.missing.length).toBeGreaterThan(0);
      expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
      const opted = await resolveFonts(MEADOW, doc, "", { fetch: f, google: true });
      expect(opted.plan?.files.length).toBeGreaterThan(0);
    } finally {
      if (saved !== undefined) process.env.OPENSPACE_GOOGLE_FONTS = saved;
    }
  });
});

describe("fontPreloads", () => {
  it("preloads the Latin upright file of the weights headings and body use", () => {
    expect(
      fontPreloads(CSS, [
        { family: "Syne", weight: 700 },
        { family: "DM Sans", weight: 400 },
      ]),
    ).toEqual([
      "https://fonts.gstatic.com/s/syne/v1/latin.woff2",
      "https://fonts.gstatic.com/s/dmsans/v17/latin.woff2",
    ]);
    // A weight that isn't loaded isn't preloaded.
    expect(fontPreloads(CSS, [{ family: "Syne", weight: 400 }])).toEqual([]);
  });

  it("picks the Latin upright file of each family, at most two", () => {
    expect(fontPreloads(CSS)).toEqual([
      "https://fonts.gstatic.com/s/dmsans/v17/latin.woff2",
      "https://fonts.gstatic.com/s/syne/v1/latin.woff2",
    ]);
    expect(fontPreloads(CSS, undefined, 1)).toHaveLength(1);
  });

  it("recognises Fontsource Latin files", () => {
    const css = `@font-face{font-family:'Fraunces';font-style:normal;font-weight:400;src:url(/_os/fonts/fraunces-latin-400-normal.woff2) format('woff2')}`;
    expect(fontPreloads(css)).toEqual(["/_os/fonts/fraunces-latin-400-normal.woff2"]);
  });
});
