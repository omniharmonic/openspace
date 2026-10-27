import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "../src/lib/crypto";
import { call } from "./helpers";
import { makePublicApp, siteWithForm } from "./public-helpers";

/** A production-shaped Hub: no DEV_MODE, no email provider (sites still on the dev GitHub). */
const PROD = {
  ...(env as unknown as Record<string, unknown>),
  DEV_MODE: "false",
  TOKEN_ENC_KEY: bytesToBase64(new Uint8Array(32).fill(9)),
};

const outboxCount = async (kind: string) =>
  (
    await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind = ?")
      .bind(kind)
      .first<{ n: number }>()
  )?.n ?? 0;

describe("a Hub without an email provider never promises an email", () => {
  it("newsletter: signup is recorded, the visitor isn't told to check their inbox, the owner confirms by hand", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    const before = await outboxCount("newsletter-confirm");
    const res = await call(
      f.app,
      `/n/${f.siteId}/subscribe`,
      { method: "POST", headers: { Accept: "application/json" }, json: { email: "a@b.example" } },
      PROD,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toMatch(/inbox|email/i);
    expect(await outboxCount("newsletter-confirm")).toBe(before);
    const sub = await env.HUB_DB.prepare(
      "SELECT id, status FROM subscribers WHERE site_id = ? AND email = 'a@b.example'",
    )
      .bind(f.siteId)
      .first<{ id: string; status: string }>();
    expect(sub?.status).toBe("pending");
    // Consent is required; then the subscriber is confirmed.
    const path = `/api/sites/${f.siteId}/subscribers/${sub?.id}/confirm`;
    expect(
      (await call(f.app, path, { method: "POST", cookie: f.cookie, json: {} }, PROD)).status,
    ).toBe(400);
    const ok = await call(
      f.app,
      path,
      { method: "POST", cookie: f.cookie, json: { consent: true } },
      PROD,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ subscriber: { status: "confirmed" } });
    expect(
      (await call(f.app, path, { method: "POST", cookie: f.cookie, json: { consent: true } }, PROD))
        .status,
    ).toBe(404);
  });

  it("member sign-in explains that no link can be sent (JSON and no-JS)", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    const json = await call(
      f.app,
      `/m/${f.siteId}/login`,
      { method: "POST", headers: { Accept: "application/json" }, json: { email: "m@b.example" } },
      PROD,
    );
    expect(json.status).toBe(503);
    const body = (await json.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/can't send email/);
    const page = await call(
      f.app,
      `/m/${f.siteId}/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=m%40b.example",
      },
      PROD,
    );
    expect(page.status).toBe(503);
    const html = await page.text();
    expect(html).toContain("Sign-in isn");
    expect(html).not.toMatch(/check your inbox/i);
  });
});
