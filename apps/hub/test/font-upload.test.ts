import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { sniffFont } from "../src/routes/media";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import { call, devLogin, type TestApp } from "./helpers";
import { STUDIO_ORIGIN } from "./mcp-helpers";
import { addMember, createSite, userId } from "./room-helpers";

const sha = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

function font(tag: string): Uint8Array {
  const b = new Uint8Array(256);
  b.set(new TextEncoder().encode(tag), 0);
  b[200] = 7;
  return b;
}

async function upload(
  app: TestApp,
  cookie: string,
  siteId: string,
  bytes: Uint8Array,
  path: (h: string) => string,
  mime: string,
) {
  const h = await sha(bytes);
  const form = new FormData();
  form.set(
    "meta",
    JSON.stringify({ path: path(h.slice(0, 8)), mime, bytes: bytes.length, sha256: h }),
  );
  form.set("file", new Blob([bytes], { type: mime }), "font");
  return call(app, `/api/sites/${siteId}/media`, {
    method: "POST",
    cookie,
    headers: { Origin: STUDIO_ORIGIN },
    body: form,
  });
}

describe("font uploads (PRD 5.1)", () => {
  it("sniffs WOFF2, OpenType and TrueType", () => {
    expect(sniffFont(font("wOF2"))).toBe("font/woff2");
    expect(sniffFont(font("OTTO"))).toBe("font/otf");
    expect(sniffFont(new Uint8Array([0, 1, 0, 0, 9]))).toBe("font/ttf");
    expect(sniffFont(font("%PDF"))).toBeNull();
  });

  it("stores fonts in media/fonts/ for designers only", async () => {
    const app = createApp({ services: { public: { rateLimit: new MemoryRateLimiter() } } });
    const owner = await devLogin(app, "Maya Lin");
    const site = await createSite(app, owner, "Maya Yoga");
    const woff2 = font("wOF2");
    const ok = await upload(
      app,
      owner,
      site.id,
      woff2,
      (h) => `media/fonts/studio-${h}.woff2`,
      "font/woff2",
    );
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { media: { mime: string } }).media.mime).toBe("font/woff2");
    // Not a font, wrong folder, or an editor: refused.
    expect(
      (
        await upload(
          app,
          owner,
          site.id,
          font("%PDF"),
          (h) => `media/fonts/x-${h}.woff2`,
          "font/woff2",
        )
      ).status,
    ).toBe(415);
    expect(
      (await upload(app, owner, site.id, font("OTTO"), (h) => `media/2026/x-${h}.otf`, "font/otf"))
        .status,
    ).toBe(400);
    const ed = await devLogin(app, "Ed Itor");
    await addMember(site.id, await userId(app, ed), "editor");
    expect(
      (await upload(app, ed, site.id, font("OTTO"), (h) => `media/fonts/y-${h}.otf`, "font/otf"))
        .status,
    ).toBe(403);
  });
});
