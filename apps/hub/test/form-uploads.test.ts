import { env } from "cloudflare:test";
import type { Form } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/env";
import { createServices } from "../src/services";
import { cleanFileName, purgeUploads, uploadKey } from "../src/services/form-uploads";
import { call } from "./helpers";
import { makePublicApp, postForm, siteWithForm } from "./public-helpers";

const APPLY: Form = {
  id: "frm_app1yn0w00",
  name: "Apply",
  fields: [
    { type: "email", name: "email", label: "Email", required: true },
    { type: "file", name: "cv", label: "Your CV", required: true, accept: ["pdf"], maxSizeMb: 1 },
  ],
  submitLabel: "Apply",
  success: { type: "message", message: "Thanks, we'll be in touch." },
};

const PDF = new TextEncoder().encode("%PDF-1.4\n% a tiny test file\n");

async function reserve(f: Awaited<ReturnType<typeof siteWithForm>>, body: Record<string, unknown>) {
  return call(f.app, `/f/${f.siteId}/${APPLY.id}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

async function put(
  f: Awaited<ReturnType<typeof siteWithForm>>,
  url: string,
  type = "application/pdf",
  bytes = PDF,
) {
  const u = new URL(url);
  return call(f.app, `${u.pathname}${u.search}`, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: bytes,
  });
}

type Inbox = {
  submissions: Array<{
    id: string;
    data: Record<string, unknown>;
    files?: Array<{ field: string; name: string; size: number; url: string; id: string }>;
  }>;
};

describe("form file uploads (PRD 5.2, P4)", () => {
  it("uploads through a signed address, attaches to the entry and serves signed downloads", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: APPLY });
    const res = await reserve(f, {
      field: "cv",
      name: "Ana Ruiz CV.pdf",
      type: "application/pdf",
      size: PDF.byteLength,
    });
    expect(res.status).toBe(201);
    const { id, uploadUrl } = (await res.json()) as { id: string; uploadUrl: string };
    expect(id).toMatch(/^upl_/);
    // A tampered signature is refused; the real one stores the bytes once.
    expect((await put(f, uploadUrl.replace(/sig=[^&]+/, "sig=AAAA"))).status).toBe(403);
    expect((await put(f, uploadUrl, "text/html")).status).toBe(422);
    expect((await put(f, uploadUrl)).status).toBe(200);
    expect((await put(f, uploadUrl)).status).toBe(409);

    const sent = await postForm(
      f,
      { email: "ana@example.com", cv: id },
      { json: true, formId: APPLY.id },
    );
    expect(sent.status).toBe(200);
    // The same upload can't be attached to a second entry.
    const again = await postForm(
      f,
      { email: "eve@example.com", cv: id },
      { json: true, formId: APPLY.id },
    );
    expect(again.status).toBe(422);

    const inbox = (await (
      await call(app, `/api/sites/${f.siteId}/submissions?limit=10`, { cookie: f.cookie })
    ).json()) as Inbox;
    const entry = inbox.submissions[0];
    expect(entry?.data.cv).toBe("Ana Ruiz CV.pdf");
    const file = entry?.files?.[0];
    expect(file).toMatchObject({ field: "cv", name: "Ana Ruiz CV.pdf", size: PDF.byteLength });
    const dl = new URL(file?.url as string);
    const got = await call(app, `${dl.pathname}${dl.search}`);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-disposition")).toContain("attachment;");
    expect(got.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(PDF);
    expect((await call(app, `${dl.pathname}?exp=${Date.now() + 1000}&sig=nope`)).status).toBe(403);

    // Deleting the entry deletes the file.
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/submissions/${entry?.id}`, {
          method: "DELETE",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(200);
    expect(await env.UPLOADS.get(uploadKey(f.siteId, id))).toBeNull();
  });

  it("checks type, size and the required file", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: APPLY });
    const bad = await reserve(f, {
      field: "cv",
      name: "x.exe",
      type: "application/x-msdownload",
      size: 10,
    });
    expect(bad.status).toBe(422);
    const big = await reserve(f, {
      field: "cv",
      name: "big.pdf",
      type: "application/pdf",
      size: 2 * 1024 * 1024,
    });
    expect(big.status).toBe(422);
    expect(((await big.json()) as { message: string }).message).toMatch(/larger than 1 MB/);
    const notFile = await reserve(f, {
      field: "email",
      name: "a.pdf",
      type: "application/pdf",
      size: 10,
    });
    expect(notFile.status).toBe(422);
    const missing = await postForm(
      f,
      { email: "ana@example.com" },
      { json: true, formId: APPLY.id },
    );
    expect(missing.status).toBe(422);
    expect(((await missing.json()) as { errors: Record<string, string> }).errors.cv).toMatch(
      /Your CV/,
    );
    const forged = await postForm(
      f,
      { email: "ana@example.com", cv: "upl_doesnotexist" },
      { json: true, formId: APPLY.id },
    );
    expect(forged.status).toBe(422);
  });

  it("takes the file itself from a no-JS multipart post", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: APPLY });
    const fd = new FormData();
    fd.append("email", "lee@example.com");
    fd.append("cv", new File([PDF], "lee.pdf", { type: "application/pdf" }));
    const res = await call(app, `/f/${f.siteId}/${APPLY.id}`, {
      method: "POST",
      body: fd,
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("os_form=success");
    const inbox = (await (
      await call(app, `/api/sites/${f.siteId}/submissions?limit=10`, { cookie: f.cookie })
    ).json()) as Inbox;
    expect(inbox.submissions[0]?.files?.[0]).toMatchObject({
      name: "lee.pdf",
      size: PDF.byteLength,
    });
    // A file of the wrong kind sends the visitor back with an error.
    const wrong = new FormData();
    wrong.append("email", "lee@example.com");
    wrong.append("cv", new File(["<html>"], "page.html", { type: "text/html" }));
    const back = await call(app, `/f/${f.siteId}/${APPLY.id}`, {
      method: "POST",
      body: wrong,
      redirect: "manual",
    });
    expect(back.headers.get("location")).toContain("os_form=error");
  });

  it("purges uploads that never reached an entry, and counts stored bytes in the quota", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: APPLY });
    const r = (await (
      await reserve(f, {
        field: "cv",
        name: "a.pdf",
        type: "application/pdf",
        size: PDF.byteLength,
      })
    ).json()) as { id: string; uploadUrl: string };
    await put(f, r.uploadUrl);
    const quotas = (await (
      await call(app, `/api/sites/${f.siteId}/quotas`, { cookie: f.cookie })
    ).json()) as { quotas: Array<{ resource: string; used: number }> };
    expect(quotas.quotas.find((q) => q.resource === "uploadBytes")?.used).toBe(PDF.byteLength);
    const later = createServices(env as never, readConfig(env as never), {
      now: () => Date.now() + 2 * 86_400_000,
    });
    expect(await purgeUploads(later)).toBeGreaterThanOrEqual(1);
    expect(await env.UPLOADS.get(uploadKey(f.siteId, r.id))).toBeNull();
  });

  it("cleans visitor file names", () => {
    expect(cleanFileName("C:\\Users\\ana\\My CV.pdf")).toBe("My CV.pdf");
    expect(cleanFileName('../../etc/"passwd"\n.pdf')).toBe("passwd.pdf");
    expect(cleanFileName("")).toBe("file");
  });

  it("needs Turnstile (or proof from a verified reservation); the entry counts as verified", async () => {
    // A Turnstile that accepts exactly one token, once.
    const spent = new Set<string>();
    const turnstile = {
      async verify(token: string | null) {
        if (token !== "good-token" || spent.has(token)) return { ok: false, codes: ["invalid"] };
        spent.add(token);
        return { ok: true, codes: [] };
      },
    };
    const TWO: Form = {
      ...APPLY,
      fields: [
        ...APPLY.fields,
        { type: "file", name: "letter", label: "Cover letter", accept: ["pdf"] },
      ],
    };
    const app = makePublicApp({ public: { turnstile: turnstile as never } });
    const f = await siteWithForm(app, { form: TWO });
    const meta = { type: "application/pdf", size: PDF.byteLength };
    expect((await reserve(f, { field: "cv", name: "a.pdf", ...meta })).status).toBe(403);
    const first = (await (
      await reserve(f, { field: "cv", name: "a.pdf", ...meta, token: "good-token" })
    ).json()) as { id: string; uploadUrl: string };
    // The token is spent: the second file shows the first reservation as proof.
    expect(
      (await reserve(f, { field: "letter", name: "b.pdf", ...meta, token: "good-token" })).status,
    ).toBe(403);
    const second = await reserve(f, { field: "letter", name: "b.pdf", ...meta, proof: first.id });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { id: string; uploadUrl: string };
    // No chaining: a proof-derived reservation is never a proof itself, and a root vouches only
    // for the form's other file fields (here one).
    expect(
      (await reserve(f, { field: "letter", name: "c.pdf", ...meta, proof: secondBody.id })).status,
    ).toBe(403);
    expect(
      (await reserve(f, { field: "letter", name: "d.pdf", ...meta, proof: first.id })).status,
    ).toBe(403);
    await put(f, first.uploadUrl);
    await put(f, secondBody.uploadUrl);
    // No token left for the entry itself: the verified upload vouches for it.
    const sent = await postForm(
      f,
      { email: "ana@example.com", cv: first.id, letter: secondBody.id },
      { json: true, formId: TWO.id },
    );
    expect(sent.status).toBe(200);
    // The root vouched for that one entry: another entry can't reuse it.
    const again = await postForm(
      f,
      { email: "eve@example.com", cv: first.id, letter: secondBody.id },
      { json: true, formId: TWO.id },
    );
    expect(again.status).toBe(403);
  });

  it("infers a missing MIME type from the extension and counts open reservations in the quota", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: APPLY });
    const r = await reserve(f, { field: "cv", name: "cv.PDF", type: "", size: PDF.byteLength });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { type: string; uploadUrl: string };
    expect(body.type).toBe("application/pdf");
    expect((await put(f, body.uploadUrl, body.type)).status).toBe(200);
    await env.HUB_DB.prepare("UPDATE sites SET plan_flags = ? WHERE id = ?")
      .bind(JSON.stringify({ quotas: { uploadBytes: PDF.byteLength * 2 } }), f.siteId)
      .run();
    // One more open reservation fits; the next doesn't, even though nothing was uploaded.
    expect(
      (
        await reserve(f, {
          field: "cv",
          name: "x.pdf",
          type: "application/pdf",
          size: PDF.byteLength,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await reserve(f, {
          field: "cv",
          name: "y.pdf",
          type: "application/pdf",
          size: PDF.byteLength,
        })
      ).status,
    ).toBe(429);
  });

  it("attaches an upload to one entry only, even when two posts race", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: APPLY });
    const r = (await (
      await reserve(f, {
        field: "cv",
        name: "a.pdf",
        type: "application/pdf",
        size: PDF.byteLength,
      })
    ).json()) as { id: string; uploadUrl: string };
    await put(f, r.uploadUrl);
    const [a, b] = await Promise.all([
      postForm(f, { email: "ana@example.com", cv: r.id }, { json: true, formId: APPLY.id }),
      postForm(f, { email: "eve@example.com", cv: r.id }, { json: true, formId: APPLY.id }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
    const rows = await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE site_id = ?")
      .bind(f.siteId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });
});
