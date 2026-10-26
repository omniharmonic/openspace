import { describe, expect, it, vi } from "vitest";
import { fontPreloads, googleFontPlan } from "./fonts";

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
    expect(plan?.files).toHaveLength(4);
    expect(plan?.css).not.toContain("fonts.gstatic.com");
    expect(plan?.css).toMatch(/url\(\/site\/_os\/fonts\/[a-z0-9]+\.woff2\)/);
    expect(plan?.cssFile).toMatch(/^_os\/fonts\/fonts\.[a-z0-9]+\.css$/);
    // Memoised: a second call (the post-build step) downloads nothing new.
    const calls = (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await googleFontPlan("https://fonts.googleapis.com/css2?family=A", "/site", f);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);
  });

  it("gives up (null) when Google Fonts can't be reached, so pages keep the link", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await googleFontPlan("https://fonts.googleapis.com/css2?family=B", "", f)).toBeNull();
  });
});

describe("fontPreloads", () => {
  it("picks the Latin upright file of each family, at most two", () => {
    expect(fontPreloads(CSS)).toEqual([
      "https://fonts.gstatic.com/s/dmsans/v17/latin.woff2",
      "https://fonts.gstatic.com/s/syne/v1/latin.woff2",
    ]);
    expect(fontPreloads(CSS, 1)).toHaveLength(1);
  });

  it("recognises Fontsource Latin files", () => {
    const css = `@font-face{font-family:'Fraunces';font-style:normal;font-weight:400;src:url(/_os/fonts/fraunces-latin-400-normal.woff2) format('woff2')}`;
    expect(fontPreloads(css)).toEqual(["/_os/fonts/fraunces-latin-400-normal.woff2"]);
  });
});
