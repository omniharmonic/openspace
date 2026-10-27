import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CLAIM_STALE_MS } from "../src/services/idempotency";
import { call, devLogin, STUDIO } from "./helpers";

const body = { template: "basic", look: "warm", name: "Idem Yoga", tagline: "" };

async function me(app: ReturnType<typeof createApp>, cookie: string) {
  const res = await call(app, "/api/me", { cookie });
  return ((await res.json()) as { user: { id: string } }).user;
}

const post = (app: ReturnType<typeof createApp>, cookie: string, key?: string, json = body) =>
  call(app, "/api/sites", {
    method: "POST",
    cookie,
    json,
    headers: key ? { "Idempotency-Key": key } : {},
  });

async function siteCount(userId: string) {
  const row = await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM sites WHERE owner_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("POST /api/sites with Idempotency-Key", () => {
  it("answers a repeat with the site the first request made, never a second site", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Idem One");
    const user = await me(app, cookie);
    const first = await post(app, cookie, "create-key-0001");
    expect(first.status).toBe(201);
    const a = (await first.json()) as { id: string };
    const again = await post(app, cookie, "create-key-0001");
    expect(again.status).toBe(200);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(((await again.json()) as { id: string }).id).toBe(a.id);
    expect(await siteCount(user.id)).toBe(1);

    // A different key is a different request.
    const other = await post(app, cookie, "create-key-0002");
    expect(other.status).toBe(201);
    expect(await siteCount(user.id)).toBe(2);
  });

  it("keys are per person", async () => {
    const app = createApp();
    const a = await devLogin(app, "Idem Two");
    const b = await devLogin(app, "Idem Three");
    const ra = (await (await post(app, a, "shared-key-0001")).json()) as { id: string };
    const rb = await post(app, b, "shared-key-0001");
    expect(rb.status).toBe(201);
    expect(((await rb.json()) as { id: string }).id).not.toBe(ra.id);
  });

  it("says a create is in progress while the first request with the key is still running", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Idem Four");
    const user = await me(app, cookie);
    await env.HUB_DB.prepare(
      "INSERT INTO site_create_keys (user_id, key, site_id, claimed_at, created_at) VALUES (?, ?, NULL, ?, ?)",
    )
      .bind(user.id, "busy-key-0001", Date.now(), Date.now())
      .run();
    const res = await post(app, cookie, "busy-key-0001");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "create_in_progress" } });
    expect(await siteCount(user.id)).toBe(0);
  });

  it("adopts the site a request that died part-way made, and takes over a claim with none", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Idem Five");
    const user = await me(app, cookie);
    // A first create that made its site but died before answering.
    const made = (await (await post(app, cookie)).json()) as { id: string };
    const stale = Date.now() - CLAIM_STALE_MS - 1000;
    await env.HUB_DB.prepare("UPDATE sites SET created_at = ? WHERE id = ?")
      .bind(stale + 10, made.id)
      .run();
    await env.HUB_DB.prepare(
      "INSERT INTO site_create_keys (user_id, key, site_id, claimed_at, created_at) VALUES (?, ?, NULL, ?, ?)",
    )
      .bind(user.id, "died-key-0001", stale, stale)
      .run();
    const res = await post(app, cookie, "died-key-0001");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe(made.id);
    expect(await siteCount(user.id)).toBe(1);

    // A stale claim that never got as far as a site: the retry creates it.
    await env.HUB_DB.prepare(
      "INSERT INTO site_create_keys (user_id, key, site_id, claimed_at, created_at) VALUES (?, ?, NULL, ?, ?)",
    )
      .bind(user.id, "died-key-0002", stale, stale)
      .run();
    const fresh = await post(app, cookie, "died-key-0002", { ...body, name: "Other Name" });
    expect(fresh.status).toBe(201);
    expect(await siteCount(user.id)).toBe(2);
  });

  it("frees the key when the create is refused, and rejects malformed keys", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Idem Six");
    const bad = await post(app, cookie, "refused-key-01", { ...body, template: "nope" });
    expect(bad.status).toBe(404);
    const ok = await post(app, cookie, "refused-key-01");
    expect(ok.status).toBe(201);
    expect((await post(app, cookie, "no spaces allowed")).status).toBe(400);
  });

  it("lets Studio send the header cross-origin", async () => {
    const app = createApp();
    const res = await call(app, "/api/sites", {
      method: "OPTIONS",
      headers: {
        Origin: STUDIO,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,idempotency-key",
      },
    });
    expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "idempotency-key",
    );
  });
});
