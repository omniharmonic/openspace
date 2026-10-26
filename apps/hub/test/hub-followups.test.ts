import { env } from "cloudflare:test";
import type { SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { FetchLike } from "../src/github/http";
import { isPrivateAddress } from "../src/mcp/ssrf";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import { call, devLogin, type TestApp } from "./helpers";
import { HUB, McpTestClient, oauthConnect, PNG_1PX, STUDIO_ORIGIN, toolText } from "./mcp-helpers";
import { addMember, createSite, RoomClient, room, setText, T, userId } from "./room-helpers";

const fakeFetch: FetchLike = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://images.example.com/dot.png")
    return new Response(PNG_1PX, { status: 200, headers: { "Content-Type": "image/png" } });
  if (url.startsWith("https://redirect.example.com/"))
    return new Response(null, {
      status: 302,
      headers: { Location: "https://169.254.169.254/latest/meta-data" },
    });
  return new Response("not found", { status: 404 });
};

const fakeDns = {
  async resolve(name: string, type: string) {
    if (type !== "A") return [];
    if (name === "internal.example.com") return ["10.1.2.3"];
    return ["93.184.216.34"];
  },
};

async function setup() {
  const app = createApp({
    services: {
      fetch: fakeFetch,
      public: { rateLimit: new MemoryRateLimiter(), dns: fakeDns },
    },
  });
  const owner = await devLogin(app, "Maya Lin");
  const site = await createSite(app, owner, "Maya Yoga");
  return { app, owner, site };
}

async function roomDoc(app: TestApp, siteId: string, cookie: string): Promise<SiteDocument> {
  const res = await call(app, `/api/sites/${siteId}/room/document`, { cookie });
  return ((await res.json()) as { document: SiteDocument }).document;
}

async function submit(app: TestApp, siteId: string, cookie: string, ops: unknown[]) {
  const res = await call(app, `/api/sites/${siteId}/room/ops`, {
    method: "POST",
    cookie,
    headers: { Origin: STUDIO_ORIGIN },
    json: { ops },
  });
  expect(res.status).toBe(200);
}

const hasText = (doc: SiteDocument, text: string) => JSON.stringify(doc).includes(text);

describe("upload_image (server-side pipeline)", () => {
  it("stores a fetched image in the site and the library, as the agent", async () => {
    const { app, owner, site } = await setup();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const up = await mcp.tool("upload_image", {
      url: "https://images.example.com/dot.png",
      alt: "A dot",
    });
    expect(up.result?.isError, toolText(up)).toBeFalsy();
    const doc = await roomDoc(app, site.id, owner);
    const media = Object.values(doc.media ?? {}) as Array<{ path: string; alt: string }>;
    const added = media.find((m) => m.alt === "A dot");
    expect(added?.path).toMatch(/^media\/\d{4}\/\d{2}\/dot-[a-z0-9]{4}\.png$/);
    // The bytes are in the draft (served by the session-auth draft media proxy).
    const file = await call(app, `/api/sites/${site.id}/media/${added?.path.slice(6)}`, {
      cookie: owner,
    });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer()).length).toBeGreaterThan(0);
  });

  it("refuses private, loopback, link-local and metadata addresses, including via DNS and redirects", async () => {
    const { app, owner, site } = await setup();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    for (const url of [
      "https://127.0.0.1/x.png",
      "https://10.0.0.5/x.png",
      "https://[::1]/x.png",
      "https://[::ffff:192.168.0.1]/x.png",
      "https://169.254.169.254/latest",
      "https://localhost/x.png",
      "https://printer.local/x.png",
      "https://metadata.google.internal/x",
      "https://internal.example.com/x.png",
      "https://redirect.example.com/x.png",
      "https://images.example.com:8443/dot.png",
      "http://images.example.com/dot.png",
    ]) {
      const r = await mcp.tool("upload_image", { url, alt: "x" });
      expect(r.result?.isError, url).toBe(true);
    }
    const doc = await roomDoc(app, site.id, owner);
    expect(Object.keys(doc.media ?? {})).toHaveLength(0);
  });

  it("classifies addresses", () => {
    for (const a of [
      "127.0.0.1",
      "10.1.1.1",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "[::1]",
    ])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])
      expect(isPrivateAddress(a), a).toBe(false);
  });
});

describe("Studio follow-ups", () => {
  it("previews a published version with ?version=<sha>", async () => {
    const { app, owner, site } = await setup();
    const versions = (await (
      await call(app, `/api/sites/${site.id}/versions`, { cookie: owner })
    ).json()) as { versions: Array<{ sha: string }> };
    const first = versions.versions[0]?.sha as string;
    await submit(app, site.id, owner, [setText(T.heroTitle, "Second version title")]);
    const pub = await call(app, `/api/sites/${site.id}/publish`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
    });
    expect(pub.status).toBe(200);
    const live = await (await call(app, `/s/${site.id}/`)).text();
    expect(live).toContain("Second version title");
    const old = await call(app, `/s/${site.id}/?version=${first.slice(0, 9)}`);
    expect(old.status).toBe(200);
    expect(old.headers.get("cache-control")).toBe("private, no-store");
    expect(await old.text()).not.toContain("Second version title");
    expect((await call(app, `/s/${site.id}/?version=deadbeef00`)).status).toBe(404);
    expect((await call(app, `/s/${site.id}/?version=../../x`)).status).toBe(404);
  });

  it("discards the draft through the room (designer+) and tells Studio who published", async () => {
    const { app, owner, site } = await setup();
    const studio = await RoomClient.connect(app, site.id, owner);
    await submit(app, site.id, owner, [setText(T.heroTitle, "Unpublished idea")]);
    expect(hasText(await roomDoc(app, site.id, owner), "Unpublished idea")).toBe(true);

    const ana = await devLogin(app, "Ana Ruiz");
    await addMember(site.id, await userId(app, ana), "editor");
    const denied = await call(app, `/api/sites/${site.id}/discard`, {
      method: "POST",
      cookie: ana,
      headers: { Origin: STUDIO_ORIGIN },
    });
    expect(denied.status).toBe(403);

    const res = await call(app, `/api/sites/${site.id}/discard`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hadChanges: boolean; applied: number; failed: number };
    expect(body).toMatchObject({ hadChanges: true, failed: 0 });
    expect(body.applied).toBeGreaterThan(0);
    expect(hasText(await roomDoc(app, site.id, owner), "Unpublished idea")).toBe(false);
    const again = (await (
      await call(app, `/api/sites/${site.id}/discard`, {
        method: "POST",
        cookie: owner,
        headers: { Origin: STUDIO_ORIGIN },
      })
    ).json()) as { hadChanges: boolean };
    expect(again.hadChanges).toBe(false);

    await submit(app, site.id, owner, [setText(T.heroTitle, "Publish me")]);
    await call(app, `/api/sites/${site.id}/publish`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
    });
    const frame = await studio.waitFor((m) => m.type === "published");
    expect(frame).toMatchObject({ actor: { kind: "human", name: "Maya Lin" } });
    studio.close();
  });

  it("accepts the WebSocket from Studio's origin with the session cookie", async () => {
    const { app, owner, site } = await setup();
    const ok = await call(app, `/api/sites/${site.id}/room`, {
      cookie: owner,
      headers: { Upgrade: "websocket", Origin: STUDIO_ORIGIN },
    });
    expect(ok.status).toBe(101);
    ok.webSocket?.accept();
    ok.webSocket?.close();
    const bad = await call(app, `/api/sites/${site.id}/room`, {
      cookie: owner,
      headers: { Upgrade: "websocket", Origin: "https://evil.example" },
    });
    expect(bad.status).toBe(403);
    const noCookie = await call(app, `/api/sites/${site.id}/room`, {
      headers: { Upgrade: "websocket", Origin: STUDIO_ORIGIN },
    });
    expect(noCookie.status).toBe(401);
  });

  it("stores Studio media uploads (multipart), dedupes, and verifies them", async () => {
    const { app, owner, site } = await setup();
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", PNG_1PX))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const upload = (meta: Record<string, unknown>, bytes: Uint8Array = PNG_1PX) => {
      const form = new FormData();
      form.set("meta", JSON.stringify(meta));
      form.set("file", new Blob([bytes], { type: "image/png" }), "dot.png");
      return call(app, `/api/sites/${site.id}/media`, {
        method: "POST",
        cookie: owner,
        headers: { Origin: STUDIO_ORIGIN, Accept: "application/json" },
        body: form,
      });
    };
    const path = `media/2026/10/dot-${sha.slice(0, 8)}.png`;
    const meta = { path, mime: "image/png", bytes: PNG_1PX.length, sha256: sha };
    const first = await upload(meta);
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({
      media: { path: meta.path, existed: false, mime: "image/png", width: 1, height: 1 },
    });
    const second = await upload(meta);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { media: { existed: boolean } }).media.existed).toBe(true);
    expect((await upload({ ...meta, sha256: "0".repeat(64) })).status).toBe(400);
    expect((await upload({ ...meta, path: "media/../openspace.json" })).status).toBe(400);
    expect((await upload({ ...meta, path: "content/site.json" })).status).toBe(400);
    expect((await upload({ ...meta, path: "media/2026/10/dot.png" })).status).toBe(400);
    expect(
      (await upload({ ...meta, path: `media/2026/10/dot-${sha.slice(0, 8)}.jpg` })).status,
    ).toBe(415);
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const svgSha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", svg))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(
      (
        await upload(
          {
            path: `media/x-${svgSha.slice(0, 8)}.svg`,
            mime: "image/svg+xml",
            bytes: svg.length,
            sha256: svgSha,
          },
          svg,
        )
      ).status,
    ).toBe(415);
    const proxied = await call(app, `/api/sites/${site.id}/${path}`, {
      cookie: owner,
    });
    expect(proxied.status).toBe(200);
    expect((await call(app, `/api/sites/${site.id}/${path}`)).status).toBe(401);
    expect(env.HUB_DB).toBeTruthy();
  });
});

describe("media upload rules (fix round 1)", () => {
  async function sha(bytes: Uint8Array) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  async function upload(
    app: TestApp,
    cookie: string,
    siteId: string,
    bytes: Uint8Array,
    ext: string,
    mime: string,
  ) {
    const h = await sha(bytes);
    const form = new FormData();
    form.set(
      "meta",
      JSON.stringify({
        path: `media/f-${h.slice(0, 8)}.${ext}`,
        mime,
        bytes: bytes.length,
        sha256: h,
      }),
    );
    form.set("file", new Blob([bytes], { type: mime }), `f.${ext}`);
    return call(app, `/api/sites/${siteId}/media`, {
      method: "POST",
      cookie,
      headers: { Origin: STUDIO_ORIGIN },
      body: form,
    });
  }
  const enc = (t: string) => new TextEncoder().encode(t);

  it("accepts clean SVGs, refuses active or outside-referencing ones and raw HEIC", async () => {
    const { app, owner, site } = await setup();
    const ok = enc(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><use href="#g"/></svg>',
    );
    expect((await upload(app, owner, site.id, ok, "svg", "image/svg+xml")).status).toBe(201);
    for (const bad of [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{}</style></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://e.example/a)"/></svg>',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    ])
      expect(
        (await upload(app, owner, site.id, enc(bad), "svg", "image/svg+xml")).status,
        bad,
      ).toBe(415);
    const heic = new Uint8Array(64);
    heic.set(enc("\0\0\0\x18ftypheic"), 0);
    expect((await upload(app, owner, site.id, heic, "heic", "image/heic")).status).toBe(415);
  });

  it("needs an editor (Studio route and room)", async () => {
    const { app, site } = await setup();
    const ana = await devLogin(app, "Ana Ruiz");
    const anaId = await userId(app, ana);
    await addMember(site.id, anaId, "contributor");
    expect((await upload(app, ana, site.id, PNG_1PX, "png", "image/png")).status).toBe(403);
    const r = await room(site.id).storeMedia(site.id, {
      userId: anaId,
      path: "media/x.png",
      bytes: PNG_1PX,
    });
    expect(r).toMatchObject({ ok: false, error: { status: 403 } });
  });
});
