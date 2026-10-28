import { PROBE_SCRIPT, parseProbe } from "@omniharmonic/openspace-import";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPlaywright } from "./mcp/screenshot";

// biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
let browser: any = null;
beforeAll(async () => {
  const pw = await loadPlaywright();
  if (!("chromium" in pw)) return;
  browser = await pw.chromium.launch({ headless: true }).catch(() => null);
}, 60_000);
afterAll(async () => {
  await browser?.close();
}, 60_000);

/** Run the look probe on `html` in real Chromium (skipped where no browser is installed). */
async function probeHtml(
  t: { skip: () => void },
  html: string,
  width = 1440,
): Promise<ReturnType<typeof parseProbe> | null> {
  if (!browser) {
    t.skip();
    return null;
  }
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
    return parseProbe(await page.evaluate(PROBE_SCRIPT));
  } finally {
    await page.close();
  }
}

const SECTIONS = `<main>
  <section style="height:400px"><h2>Welcome to the studio</h2><p>Some words about the studio and what it does for people.</p></section>
  <section style="height:400px"><h2>Our classes</h2><p>More words about the classes we teach every week, all year.</p></section>
</main>`;

describe("look probe: corrected measurements", () => {
  it("finds navigation in a header whose colour theme is named brand (strict v3 doesn't)", async (t) => {
    const p = await probeHtml(
      t,
      `<header class="os-header os-theme-brand"><a class="os-header__brand" href="/">Studio</a>
        <nav><a href="/about">About us</a> <a href="/classes">Classes</a> <a href="/visit">Visit</a></nav></header>${SECTIONS}`,
    );
    if (!p) return;
    expect(p.presets.nav).toBeUndefined();
    expect(p.corrections?.nav?.family).toBeTruthy();
  }, 60_000);

  it("keeps a real logo box out of the navigation", async (t) => {
    const p = await probeHtml(
      t,
      `<header><div class="navbar-brand"><a href="/home-page">Studio name</a></div>
        <nav><a href="/about">About us</a> <a href="/classes">Classes</a></nav></header>${SECTIONS}`,
    );
    if (!p) return;
    expect(p.presets.nav).toBeDefined();
    expect(p.corrections).toBeUndefined();
  }, 60_000);

  it("counts only the slides on screen as columns (strict v3 counts them all)", async (t) => {
    const slide = (n: number) =>
      `<div style="flex:0 0 100%;scroll-snap-align:start"><p>Slide number ${n} with a caption long enough to count.</p></div>`;
    const p = await probeHtml(
      t,
      `<main><section style="height:400px"><h2>Lookbook</h2>
        <div style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;width:100%">${slide(1)}${slide(2)}${slide(3)}</div>
      </section><section style="height:400px"><h2>Three columns</h2><div style="display:flex">
        <p style="flex:1">A first column of words, long enough.</p><p style="flex:1">A second column of words, long enough.</p><p style="flex:1">A third column of words, long enough.</p>
      </div></section></main>`,
    );
    if (!p) return;
    const [lookbook, grid] = p.sections;
    expect(lookbook?.columns).toBeGreaterThan(1);
    expect(lookbook?.columnsOnScreen).toBe(1);
    expect(grid?.columns).toBe(3);
    expect(grid?.columnsOnScreen).toBeUndefined();
  }, 60_000);

  it("counts a map's tiles as one picture, and keeps a clearfix row's columns", async (t) => {
    const px = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
    const tile = (x: number) =>
      `<img src="${px}" style="position:absolute;left:${x}px;top:0;width:256px;height:256px">`;
    const p = await probeHtml(
      t,
      `<main><section style="height:400px"><h2>Call or visit</h2>
        <div style="position:relative;overflow:hidden;width:600px;height:300px">${tile(-100)}${tile(156)}${tile(412)}${tile(668)}</div>
      </section><section style="height:400px"><h2>Three columns</h2><div style="overflow:hidden">
        <p style="float:left;width:30%">A first column of words, long enough.</p><p style="float:left;width:30%">A second column of words, long enough.</p><p style="float:left;width:30%">A third column of words, long enough.</p>
      </div></section></main>`,
    );
    if (!p) return;
    const [map, row] = p.sections;
    expect(map?.columns).toBeGreaterThan(1);
    expect(map?.columnsOnScreen).toBe(1);
    expect(row?.columns).toBe(3);
    expect(row?.columnsOnScreen).toBeUndefined();
  }, 60_000);
});
