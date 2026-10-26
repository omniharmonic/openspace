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

  const fields = await parseFields(c);
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
    const blocked = await gate(
      c,
      site,
      "form",
      single(fields["cf-turnstile-response"]) ?? single(fields._turnstile),
    );
    if (blocked) return fail(blocked);

    const manifest = await loadManifest(services, site, base);
    const entry = manifest.find((f) => f.form.id === formId);
    if (!entry)
      return fail({
        status: 404,
        code: "form_not_found",
        message: "This form isn't accepting entries.",
      });
    const result = validateSubmission(entry.form, fields);
    if (!result.ok)
      return fail({
        status: 422,
        code: "invalid_fields",
        message:
          Object.keys(result.errors).length === 1
            ? "Please fix the highlighted field."
            : "Please fix the highlighted fields.",
        errors: result.errors,
      });

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
    await services.db
      .prepare(
        `INSERT INTO submissions (id, site_id, form_id, data_json, spam_score, created_at, purge_at, source, notified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
