/**
 * `POST /f/:siteId/:formId` — public form submissions (architecture §9.1, PRD FR-30/31).
 *
 * Order: site → origin → body → honeypot → rate limit (IP + site) → Turnstile → manifest →
 * validation → quota (spam doesn't count) → store → notify. JS posts (Accept: application/json)
 * get JSON; no-JS posts are redirected to `<_source>?os_form=success#<_anchor>` (or `=error`).
 */
import type { Context } from "hono";
import { Hono } from "hono";
import { randomId } from "../../lib/crypto";
import { HttpError } from "../../lib/errors";
import {
  allowedOrigins,
  background,
  cleanUrlInput,
  failureBody,
  originAllowed,
  type PublicFailure,
  parseFields,
  publicErrors,
  publicSite,
  publicSiteCors,
  rememberReturn,
  returnUrl,
  single,
  sitePath,
  wantsJson,
} from "../../lib/public";
import { siteBaseUrl } from "../../services/email";
import {
  attachUploads,
  createUpload,
  proofRoot,
  receiveUpload,
  resolveUploads,
  serveDownload,
  storeDirect,
  submissionHasVerifiedUpload,
  type UploadedFile,
} from "../../services/form-uploads";
import { loadManifest, SPAM_THRESHOLD, spamScore, validateSubmission } from "../../services/forms";
import { notifyInstant } from "../../services/notifications";
import { consumeQuota, quotaGuard, siteQuotaLimits } from "../../services/quotas";
import { getSettings } from "../../services/settings";
import type { AppEnv } from "../../types";
import { gate } from "./gate";

export const publicFormRoutes = new Hono<AppEnv>();

const MONTH = 30 * 24 * 60 * 60 * 1000;

publicFormRoutes.use("/f/:siteId/*", publicSiteCors(), publicErrors("os_form"));

/** `GET /f/config` — public settings site-kit/blocks need (Turnstile site key). */
publicFormRoutes.get("/f/config", (c) =>
  c.json({ turnstileSiteKey: c.var.services.pub.config.turnstile.siteKey }),
);

interface Outcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  redirect: string;
}

function respond(c: Context<AppEnv>, json: boolean, o: Outcome) {
  if (json) return c.json(o.body, o.status as 200);
  return c.redirect(o.redirect, 303);
}

publicFormRoutes.post("/f/:siteId/:formId", quotaGuard("formSubmissions"), async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  const formId = c.req.param("formId");
  const json = wantsJson(c);
  const base = siteBaseUrl(site, services.config.hubUrl);
  const allowed = allowedOrigins(site, c.var.config);
  const referer = c.req.header("referer") ?? null;

  if (!originAllowed(c.req.header("origin"), site, c.var.config))
    throw new HttpError(403, "forbidden_origin", "Submissions from this website aren't accepted.");

  // No-JS posts with file fields arrive as multipart with the files themselves (up to 25 MB each).
  const multipart = (c.req.header("content-type") ?? "").toLowerCase().includes("multipart/");
  const files = new Map<string, File>();
  let manifest: Awaited<ReturnType<typeof loadManifest>> | null = null;
  let takesFiles = false;
  if (multipart) {
    manifest = await loadManifest(services, site, base);
    takesFiles = !!manifest
      .find((f) => f.form.id === formId)
      ?.form.fields.some((x) => x.type === "file");
  }
  const fields = await parseFields(c, takesFiles ? { max: 52 * 1024 * 1024, files } : {});
  const source = single(fields._source);
  const anchor = single(fields._anchor);
  rememberReturn(c, source, anchor);
  const back = (status: "success" | "error") =>
    returnUrl(base, allowed, source, referer, "os_form", status, anchor);
  const fail = (f: PublicFailure): Outcome => ({
    ok: false,
    status: f.status,
    body: failureBody(f),
    redirect: back("error"),
  });

  const outcome = await (async (): Promise<Outcome> => {
    // Honeypot: bots fill every field. Pretend success; store nothing; count nothing.
    if (single(fields._hp)) {
      return {
        ok: true,
        status: 200,
        body: { ok: true, message: "Thanks!" },
        redirect: back("success"),
      };
    }
    manifest ??= await loadManifest(services, site, base);
    const entry = manifest.find((f) => f.form.id === formId);
    // A file upload of this form that passed Turnstile carries the proof (the token was spent
    // reserving it); otherwise the submission's own token is checked.
    const viaUpload = entry
      ? await submissionHasVerifiedUpload(services, site.id, entry.form, fields)
      : false;
    const blocked = await gate(
      c,
      site,
      "form",
      single(fields["cf-turnstile-response"]) ?? single(fields._turnstile),
      viaUpload ? { turnstile: false } : {},
    );
    if (blocked) return fail(blocked);
    if (!entry)
      return fail({
        status: 404,
        code: "form_not_found",
        message: "This form isn't accepting entries.",
      });
    // File fields: files sent with a no-JS post are stored now; then every file field must name
    // an uploaded file of this form (the JS path uploaded it already).
    const fileErrors: Record<string, string> = {};
    for (const field of entry.form.fields) {
      const file = field.type === "file" ? files.get(field.name) : undefined;
      if (!file) continue;
      try {
        fields[field.name] = await storeDirect(services, site, entry.form, field.name, file);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        fileErrors[field.name] = err.message;
      }
    }
    const uploads = await resolveUploads(services, site.id, entry.form, fields);
    const result = validateSubmission(entry.form, fields);
    const errors = {
      ...(result.ok ? {} : result.errors),
      ...(uploads.ok ? {} : uploads.errors),
      ...fileErrors,
    };
    if (!result.ok || Object.keys(errors).length)
      return fail({
        status: 422,
        code: "invalid_fields",
        message:
          Object.keys(errors).length === 1
            ? "Please fix the highlighted field."
            : "Please fix the highlighted fields.",
        errors,
      });
    const uploaded: UploadedFile[] = uploads.ok ? uploads.files : [];
    // Entries show the file's name; the inbox links it through `files`.
    for (const u of uploaded) result.data[u.field] = u.name;

    const score = spamScore(result.data);
    const isSpam = score >= SPAM_THRESHOLD;
    const now = services.now();
    if (!isSpam) {
      const limits = await siteQuotaLimits(services.db, site.id, services.pub.quotaOverrides);
      const used = await consumeQuota(
        services.db,
        site.id,
        "formSubmissions",
        limits.formSubmissions,
        now,
      );
      if (used === null)
        return fail({
          status: 429,
          code: "quota_exceeded",
          message:
            "This form can't take more entries this month. Please contact the site owner directly.",
        });
    }
    const settings = await getSettings(services.db, site.id);
    const limits = await siteQuotaLimits(services.db, site.id, services.pub.quotaOverrides);
    const months = Math.min(settings.retentionMonths, limits.storedSubmissionsMonths);
    const id = randomId("sbm");
    // Each file belongs to one entry: a racing second post with the same upload is refused.
    if (!(await attachUploads(services, id, uploaded)))
      return fail({
        status: 422,
        code: "invalid_fields",
        message: "That file was already sent with another entry. Please choose it again.",
        errors: Object.fromEntries(
          uploaded.map((u) => [u.field, "This file was already sent. Please choose it again."]),
        ),
      });
    await services.db
      .prepare(
        `INSERT INTO submissions (id, site_id, form_id, data_json, spam_score, created_at, purge_at, source, notified_at, files)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        site.id,
        formId,
        JSON.stringify(result.data),
        score,
        now,
        now + months * MONTH,
        source?.slice(0, 300) ?? null,
        isSpam || settings.notifications === "off" || entry.form.notifyOwner === false ? now : null,
        uploaded.length ? JSON.stringify(uploaded) : null,
      )
      .run();
    if (!isSpam) await background(c, notifyInstant(services, site, entry.form, id, result.data));

    const s = entry.form.success;
    const message = s.type === "message" ? s.message : "Thanks — your message was sent.";
    const redirectTo = s.type === "redirect" ? resolveRedirect(entry.redirectHref, base) : null;
    return {
      ok: true,
      status: 200,
      body: { ok: true, id, message, ...(redirectTo ? { redirect: redirectTo } : {}) },
      redirect: redirectTo ?? back("success"),
    };
  })();
  return respond(c, json, outcome);
});

/**
 * Success-redirect target: a site path (joined below the base path, same origin enforced) or an
 * absolute http(s) URL the owner chose in the form settings.
 */
function resolveRedirect(href: string | null, base: string): string | null {
  const h = cleanUrlInput(href);
  if (!h) return null;
  if (h.startsWith("/")) return sitePath(base, h)?.toString() ?? null;
  try {
    const u = new URL(h);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// ---- file uploads (PRD §5.2, P4) -------------------------------------------------------------

/** `POST /f/:siteId/:formId/uploads` — reserve an upload for a file field (JS path, step 1). */
publicFormRoutes.post("/f/:siteId/:formId/uploads", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  if (!originAllowed(c.req.header("origin"), site, c.var.config))
    throw new HttpError(403, "forbidden_origin", "Uploads from this website aren't accepted.");
  const body = (await c.req.json().catch(() => null)) as {
    field?: unknown;
    name?: unknown;
    type?: unknown;
    size?: unknown;
    /** The form's Turnstile token (first file of a submit). */
    token?: unknown;
    /** An earlier verified reservation of this submit (further files). */
    proof?: unknown;
  } | null;
  const formId = c.req.param("formId");
  const base = siteBaseUrl(site, services.config.hubUrl);
  const entry = (await loadManifest(services, site, base)).find((f) => f.form.id === formId);
  if (!entry) throw new HttpError(404, "form_not_found", "This form isn't accepting entries.");
  // Reservations have their own rate bucket, and need Turnstile, or proof from a root reserved
  // with Turnstile for the same submit (only for the form's other file fields; no chaining).
  const fileFields = entry.form.fields.filter((f) => f.type === "file").length;
  const root = body?.proof
    ? await proofRoot(services, site.id, formId, body.proof, fileFields - 1)
    : null;
  const blocked = await gate(
    c,
    site,
    "upload",
    typeof body?.token === "string" ? body.token : null,
    root ? { turnstile: false } : {},
  );
  if (blocked) return c.json(failureBody(blocked), blocked.status as 429);
  if (
    !body ||
    typeof body.field !== "string" ||
    typeof body.name !== "string" ||
    typeof body.type !== "string" ||
    typeof body.size !== "number"
  )
    throw new HttpError(400, "invalid_request", "Send the file's field, name, type and size.");
  const upload = await createUpload(services, site, entry.form, {
    field: body.field,
    name: body.name,
    type: body.type,
    size: body.size,
    verified: !root,
    proofOf: root,
  });
  return c.json(upload, 201);
});

/** `PUT /f/:siteId/u/:id?exp&sig` — the file's bytes for a reserved upload (JS path, step 2). */
publicFormRoutes.put("/f/:siteId/u/:id", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  await receiveUpload(
    services,
    site.id,
    c.req.param("id"),
    { exp: c.req.query("exp"), sig: c.req.query("sig") },
    c.req.raw,
  );
  return c.json({ ok: true });
});

/** `GET /f/:siteId/d/:id?exp&sig` — signed, short-lived download for the inbox. */
publicFormRoutes.get("/f/:siteId/d/:id", async (c) =>
  serveDownload(c.var.services, c.req.param("siteId"), c.req.param("id"), {
    exp: c.req.query("exp"),
    sig: c.req.query("sig"),
  }),
);
