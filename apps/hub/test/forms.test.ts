import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { formsInDocument, parseManifest, validateSubmission } from "../src/services/forms";
import { CloudflareTurnstile, SITEVERIFY_URL } from "../src/services/turnstile";
import { call, devLogin } from "./helpers";
import { mockFetch } from "./mock-fetch";
import {
  CONTACT_FORM,
  makePublicApp,
  outbox,
  postForm,
  setQuota,
  setSettings,
  siteWithForm,
  VALID,
} from "./public-helpers";

const count = async (siteId: string) =>
  (
    await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE site_id = ?")
      .bind(siteId)
      .first<{ n: number }>()
  )?.n ?? 0;

describe("POST /f/:siteId/:formId", () => {
  it("accepts a JSON submission, stores it and notifies the owner", async () => {
    const f = await siteWithForm(makePublicApp());
    await setSettings(f, { notifyEmail: "maya@example.com" });
    const res = await postForm(
      f,
      {
        ...VALID,
        interests: ["Yoga", "Breath"],
        updates: "yes",
        when: "2026-11-02",
        topic: "Classes",
      },
      { json: true },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message: string; id: string };
    expect(body).toMatchObject({
      ok: true,
      message: CONTACT_FORM.success.type === "message" ? CONTACT_FORM.success.message : "",
    });
    const row = await env.HUB_DB.prepare("SELECT * FROM submissions WHERE id = ?")
      .bind(body.id)
      .first<{
        data_json: string;
        purge_at: number;
        created_at: number;
        notified_at: number | null;
      }>();
    expect(JSON.parse(row?.data_json ?? "{}")).toEqual({
      ...VALID,
      interests: ["Yoga", "Breath"],
      updates: true,
      when: "2026-11-02",
      topic: "Classes",
    });
    // 12-month default retention.
    expect((row?.purge_at ?? 0) - (row?.created_at ?? 0)).toBe(12 * 30 * 86_400_000);
    expect(row?.notified_at).not.toBeNull();
    const mail = await outbox(f.app, "?kind=form-notification");
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({
      to: "maya@example.com",
      subject: "New Contact submission",
      replyTo: "ana@example.com",
    });
    expect(
      mail[0]?.links.some((l) => l.includes(`/sites/${f.siteId}/inbox?entry=${body.id}`)),
    ).toBe(true);
  });

  it("redirects no-JS posts back to the page with os_form=success#anchor", async () => {
    const f = await siteWithForm(makePublicApp());
    const res = await postForm(f, { ...VALID, _source: "/about", _anchor: "blk_f0rmb10ck0-sent" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `http://localhost:8787/s/${f.siteId}/about?os_form=success#blk_f0rmb10ck0-sent`,
    );
    // A source that already includes the site's base path is kept as is.
    const again = await postForm(f, { ...VALID, _source: `/s/${f.siteId}/` });
    expect(again.headers.get("location")).toBe(
      `http://localhost:8787/s/${f.siteId}/?os_form=success`,
    );
    // Foreign absolute sources are never redirect targets.
    const evil = await postForm(f, { ...VALID, _source: "https://evil.example/phish" });
    expect(new URL(evil.headers.get("location") ?? "").origin).toBe("http://localhost:8787");
    expect(await count(f.siteId)).toBe(3);
  });

  it("accepts multipart bodies (checkbox groups as name[])", async () => {
    const f = await siteWithForm(makePublicApp());
    const res = await postForm(f, { ...VALID, interests: ["Breath"] }, { multipart: true });
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const row = await env.HUB_DB.prepare("SELECT data_json FROM submissions WHERE id = ?")
      .bind(id)
      .first<{ data_json: string }>();
    expect(JSON.parse(row?.data_json ?? "{}").interests).toEqual(["Breath"]);
  });

  it("returns field errors (JSON 422) or redirects with os_form=error", async () => {
    const f = await siteWithForm(makePublicApp());
    const res = await postForm(
      f,
      { name: "", email: "nope", message: "Hi", topic: "Other" },
      { json: true },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      ok: boolean;
      message: string;
      errors: Record<string, string>;
      error: { code: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_fields");
    expect(Object.keys(body.errors).sort()).toEqual(["email", "name", "topic"]);
    expect(body.errors.email).toBe("Please enter a valid email address.");
    const html = await postForm(f, { name: "x", _source: "/" });
    expect(html.status).toBe(303);
    expect(html.headers.get("location")).toContain("os_form=error");
    expect(await count(f.siteId)).toBe(0);
  });

  it("swallows honeypot submissions without storing or counting them", async () => {
    const f = await siteWithForm(makePublicApp());
    await setQuota(f.siteId, { formSubmissions: 1 });
    const res = await postForm(f, { ...VALID, _hp: "http://spam.example" }, { json: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(await count(f.siteId)).toBe(0);
    expect((await postForm(f, VALID, { json: true })).status).toBe(200);
  });

  it("rate-limits per IP and site", async () => {
    const f = await siteWithForm(makePublicApp());
    const headers = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 10; i++)
      expect((await postForm(f, VALID, { json: true, headers })).status).toBe(200);
    const limited = await postForm(f, VALID, { json: true, headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    // Another visitor is unaffected.
    expect(
      (await postForm(f, VALID, { json: true, headers: { "cf-connecting-ip": "203.0.113.10" } }))
        .status,
    ).toBe(200);
  });

  it("enforces the monthly quota; spam does not count", async () => {
    const f = await siteWithForm(makePublicApp());
    await setQuota(f.siteId, { formSubmissions: 2 });
    const spammy = {
      ...VALID,
      message:
        "http://a.example http://b.example http://c.example <a href=x> http://d.example http://e.example",
    };
    expect((await postForm(f, spammy, { json: true })).status).toBe(200);
    expect((await postForm(f, VALID, { json: true })).status).toBe(200);
    expect((await postForm(f, VALID, { json: true })).status).toBe(200);
    const over = await postForm(f, VALID, { json: true });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("quota_exceeded");
    // The spam entry is stored (flagged) but hidden from the inbox by default.
    const inbox = await call(f.app, `/api/sites/${f.siteId}/submissions`, { cookie: f.cookie });
    expect(((await inbox.json()) as { total: number }).total).toBe(2);
    const spam = await call(f.app, `/api/sites/${f.siteId}/submissions?spam=1`, {
      cookie: f.cookie,
    });
    expect(
      ((await spam.json()) as { submissions: Array<{ spam: boolean }> }).submissions[0]?.spam,
    ).toBe(true);
  });

  it("verifies Turnstile (dev bypass, dev-fail token, real siteverify)", async () => {
    const f = await siteWithForm(makePublicApp());
    const bad = await postForm(
      f,
      { ...VALID, "cf-turnstile-response": "dev-fail" },
      { json: true },
    );
    expect(bad.status).toBe(403);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("spam_suspected");

    const secret = ["0x4AAA", "test", "secret"].join("");
    const mock = mockFetch([
      [
        "POST",
        /challenges\.cloudflare\.com\/turnstile/,
        () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      ],
    ]);
    const real = new CloudflareTurnstile(secret, mock.fetch);
    expect(await real.verify(null, null)).toEqual({ ok: false, codes: ["missing-input-response"] });
    expect((await real.verify("tok", "198.51.100.1")).ok).toBe(false);
    expect(mock.calls[0]?.url).toBe(SITEVERIFY_URL);
    const app = makePublicApp({ public: { turnstile: real } });
    const g = await siteWithForm(app, { name: "Turnstile Site" });
    expect(
      (await postForm(g, { ...VALID, "cf-turnstile-response": "tok" }, { json: true })).status,
    ).toBe(403);
  });

  it("checks the Origin: site origins and null (sandboxed dev preview) pass, others are refused", async () => {
    const f = await siteWithForm(makePublicApp());
    const ok = await postForm(f, VALID, { json: true, headers: { Origin: "null" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("null");
    const hub = await postForm(f, VALID, {
      json: true,
      headers: { Origin: "http://localhost:8787" },
    });
    expect(hub.headers.get("access-control-allow-origin")).toBe("http://localhost:8787");
    const evil = await postForm(f, VALID, {
      json: true,
      headers: { Origin: "https://evil.example" },
    });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await call(f.app, `/f/${f.siteId}/${CONTACT_FORM.id}`, {
      method: "OPTIONS",
      headers: { Origin: "null", "Access-Control-Request-Method": "POST" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("null");
  });

  it("404s unknown sites and forms, and refuses forms removed from the site", async () => {
    const f = await siteWithForm(makePublicApp());
    expect(
      (await call(f.app, "/f/st_zzzzzzzzzz/frm_c0ntact0ne", { method: "POST", json: VALID }))
        .status,
    ).toBe(404);
    expect((await postForm(f, VALID, { json: true, formId: "frm_n0tthere0" })).status).toBe(404);
  });

  it("respects notifications=off and daily digests", async () => {
    const f = await siteWithForm(makePublicApp());
    await setSettings(f, { notifyEmail: "maya@example.com", notifications: "daily" });
    await postForm(f, VALID, { json: true });
    await postForm(f, { ...VALID, name: "Ben" }, { json: true });
    expect(await outbox(f.app, "?kind=form-notification")).toHaveLength(0);
    const { runPublicServicesCron } = await import("../src/cron/public-services");
    const out = await runPublicServicesCron("0 3 * * *", env as never);
    expect(out.formDigests).toEqual({ sent: 1, failed: 0 });
    const digests = await outbox(f.app, "?kind=form-digest");
    expect(digests[0]?.subject).toBe("2 new form entries for Maya Yoga");
    // Already notified: nothing on the next run.
    expect((await runPublicServicesCron("0 3 * * *", env as never)).formDigests).toEqual({
      sent: 0,
      failed: 0,
    });
  });
});

describe("Studio inbox API", () => {
  it("lists, searches, marks read, exports and deletes entries", async () => {
    const f = await siteWithForm(makePublicApp());
    const ids: string[] = [];
    for (const name of ["Ana Ruiz", "Ben Okafor", "Chloé Martin"]) {
      const r = await postForm(f, { ...VALID, name }, { json: true });
      ids.push(((await r.json()) as { id: string }).id);
    }
    const list = await call(f.app, `/api/sites/${f.siteId}/submissions?limit=2`, {
      cookie: f.cookie,
    });
    const page1 = (await list.json()) as {
      submissions: Array<{ id: string; formName: string; read: boolean }>;
      nextCursor: string;
      total: number;
      unread: number;
    };
    expect(page1.total).toBe(3);
    expect(page1.unread).toBe(3);
    expect(page1.submissions).toHaveLength(2);
    expect(page1.submissions[0]?.formName).toBe("Contact");
    const page2 = (await (
      await call(
        f.app,
        `/api/sites/${f.siteId}/submissions?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
        { cookie: f.cookie },
      )
    ).json()) as { submissions: unknown[]; nextCursor: string | null };
    expect(page2.submissions).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const search = (await (
      await call(f.app, `/api/sites/${f.siteId}/submissions?q=Okafor`, { cookie: f.cookie })
    ).json()) as { submissions: Array<{ data: { name: string } }> };
    expect(search.submissions.map((s) => s.data.name)).toEqual(["Ben Okafor"]);

    const patch = await call(f.app, `/api/sites/${f.siteId}/submissions/${ids[0]}`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { read: true },
    });
    expect(((await patch.json()) as { submission: { read: boolean } }).submission.read).toBe(true);
    const mark = await call(f.app, `/api/sites/${f.siteId}/submissions/mark-read`, {
      method: "POST",
      cookie: f.cookie,
      json: { all: true },
    });
    expect(((await mark.json()) as { changed: number }).changed).toBe(3);

    const forms = (await (
      await call(f.app, `/api/sites/${f.siteId}/forms`, { cookie: f.cookie })
    ).json()) as { forms: Array<{ id: string; total: number; unread: number; action: string }> };
    expect(forms.forms[0]).toMatchObject({
      id: CONTACT_FORM.id,
      total: 3,
      unread: 0,
      action: `http://localhost:8787/f/${f.siteId}/${CONTACT_FORM.id}`,
    });

    const csv = await call(f.app, `/api/sites/${f.siteId}/submissions.csv`, { cookie: f.cookie });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\r\n")[0]).toBe(
      "id,form_id,form_name,created_at,read,spam,source,name,email,updates,message",
    );
    expect(text).toContain("Chloé Martin");

    expect(
      (
        await call(f.app, `/api/sites/${f.siteId}/submissions/${ids[0]}`, {
          method: "DELETE",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(200);
    const bulk = await call(f.app, `/api/sites/${f.siteId}/submissions/delete`, {
      method: "POST",
      cookie: f.cookie,
      json: { ids: ids.slice(1) },
    });
    expect(((await bulk.json()) as { deleted: number }).deleted).toBe(2);
    expect(await count(f.siteId)).toBe(0);

    const actions = (
      await env.HUB_DB.prepare("SELECT action FROM audit_log WHERE site_id = ? ORDER BY at")
        .bind(f.siteId)
        .all<{ action: string }>()
    ).results.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "submission.read",
        "submissions.mark",
        "submissions.export",
        "submission.delete",
        "submissions.delete",
      ]),
    );
  });

  it("hides the inbox from people without a role", async () => {
    const f = await siteWithForm(makePublicApp());
    const stranger = await devLogin(f.app, "Sam Stranger");
    expect(
      (await call(f.app, `/api/sites/${f.siteId}/submissions`, { cookie: stranger })).status,
    ).toBe(404);
    expect((await call(f.app, `/api/sites/${f.siteId}/submissions`)).status).toBe(401);
  });
});

describe("forms manifest and validation", () => {
  it("parses a published /_os/forms.json (array or record) and skips invalid forms", () => {
    expect(parseManifest({ version: 1, forms: [CONTACT_FORM] })[0]?.form.id).toBe(CONTACT_FORM.id);
    const rec = parseManifest({
      forms: { [CONTACT_FORM.id]: { ...CONTACT_FORM, redirectHref: "/thanks" } },
    });
    expect(rec[0]?.redirectHref).toBe("/thanks");
    const bad = parseManifest({
      forms: [{ ...CONTACT_FORM, fields: [{ type: "password", name: "pw", label: "Password" }] }],
    });
    expect(bad).toEqual([]);
  });

  it("finds forms anywhere in the document and resolves page redirects", () => {
    const form = {
      ...CONTACT_FORM,
      success: {
        type: "redirect" as const,
        link: { type: "page" as const, page: "pg_0kwdyvhkbk" },
      },
    };
    const doc = {
      site: { footer: { blocks: [{ fields: { form } }] } },
      pages: { pg_0kwdyvhkbk: { slug: "thanks", sections: [] } },
    } as never;
    expect(formsInDocument(doc)).toEqual([{ form, redirectHref: "/thanks/" }]);
  });

  it("validates each FR-30 field type", () => {
    const r = validateSubmission(CONTACT_FORM, {
      ...VALID,
      when: "2026-02-30",
      phone: "call me",
      interests: ["Pilates"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["interests", "phone", "when"]);
    const ok = validateSubmission(CONTACT_FORM, {
      ...VALID,
      phone: "+1 (555) 010-2030",
      updates: "on",
    });
    expect(ok).toEqual({ ok: true, data: { ...VALID, phone: "+1 (555) 010-2030", updates: true } });
  });
});
