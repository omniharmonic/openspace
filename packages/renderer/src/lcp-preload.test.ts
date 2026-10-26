import { describe, expect, it } from "vitest";
import { lcpImagePreload } from "./html";

describe("lcpImagePreload", () => {
  it("preloads the high-priority image covering most of a phone screen", () => {
    const body = `<main>
      <picture><img src="/a.jpg" srcset="/a-480.jpg 480w, /a-960.jpg 960w" sizes="(min-width: 1200px) 34vw, calc((100vw - 48px) * 0.625)" width="800" height="800" fetchpriority="high"></picture>
      <picture><img src="/b.jpg" srcset="/b-480.jpg 480w, /b-960.jpg 960w" sizes="(min-width: 1200px) 34vw, calc(100vw - 48px)" width="840" height="560" fetchpriority="high"></picture>
      <img src="/c.jpg" loading="lazy">
    </main>`;
    expect(lcpImagePreload(body)).toBe(
      '<link rel="preload" as="image" imagesrcset="/b-480.jpg 480w, /b-960.jpg 960w" imagesizes="(min-width: 1200px) 34vw, calc(100vw - 48px)" fetchpriority="high">',
    );
  });

  it("names the picture's first modern source with its type", () => {
    const body = `<picture><source type="image/avif" srcset="/h.avif 960w" sizes="100vw"><source type="image/webp" srcset="/h.webp 960w" sizes="100vw"><img src="/h.jpg" srcset="/h.jpg 960w" sizes="100vw" fetchpriority="high"></picture>`;
    expect(lcpImagePreload(body)).toBe(
      '<link rel="preload" as="image" imagesrcset="/h.avif 960w" imagesizes="100vw" type="image/avif" fetchpriority="high">',
    );
  });

  it("falls back to href without a srcset, and to nothing without a high-priority image", () => {
    expect(lcpImagePreload('<img src="/x.png" fetchpriority="high">')).toBe(
      '<link rel="preload" as="image" href="/x.png" fetchpriority="high">',
    );
    expect(lcpImagePreload('<img src="/x.png" loading="lazy">')).toBe("");
  });
});
