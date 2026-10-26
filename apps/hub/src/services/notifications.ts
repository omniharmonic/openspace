/** Owner notifications for form entries: instant emails and the daily digest (FR-32). */
import { formNotificationEmail } from "@openspace/email-render";
import type { Form } from "@openspace/schema";
import type { SiteRow } from "../db/sites";
import { emailSite, sendTransactional, siteBaseUrl } from "./email";
import {
  displayEntries,
  replyToFrom,
  SPAM_THRESHOLD,
  type SubmissionData,
  type SubmissionRow,
} from "./forms";
import type { Services } from "./index";
import { getSettings, type ServiceSettings } from "./settings";

/** Studio's inbox link for an entry (Studio route `/sites/:id/inbox`). */
export function inboxUrl(services: Services, siteId: string, entryId?: string): string {
  return `${services.config.studioOrigin}/sites/${siteId}/inbox${entryId ? `?entry=${entryId}` : ""}`;
}

export async function notifyAddress(
  services: Services,
  site: SiteRow,
  settings: ServiceSettings,
): Promise<string | null> {
  if (settings.notifyEmail) return settings.notifyEmail;
  const owner = await services.db
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(site.owner_id)
    .first<{ email: string | null }>();
  return owner?.email ?? null;
}

/** Email the owner about one entry right away (notifications = "instant"). */
export async function notifyInstant(
  services: Services,
  site: SiteRow,
  form: Form,
  submissionId: string,
  data: SubmissionData,
): Promise<boolean> {
  const settings = await getSettings(services.db, site.id);
  if (settings.notifications !== "instant" || form.notifyOwner === false) return false;
  const to = await notifyAddress(services, site, settings);
  if (!to) return false;
  const replyTo = replyToFrom(form, data);
  const mail = formNotificationEmail({
    site: emailSite(site),
    baseUrl: siteBaseUrl(site, services.config.hubUrl),
    formName: form.name,
    entries: displayEntries(form, data).map(({ label, value }) => ({ label, value })),
    entryUrl: inboxUrl(services, site.id, submissionId),
    submittedAt: new Date(services.now()).toUTCString(),
    ...(replyTo ? { replyTo } : {}),
  });
  await sendTransactional(services, {
    siteId: site.id,
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    kind: "form-notification",
    ...(replyTo ? { replyTo } : {}),
  });
  await services.db
    .prepare("UPDATE submissions SET notified_at = ? WHERE id = ?")
    .bind(services.now(), submissionId)
    .run();
  return true;
}

/** One digest per site with notifications = "daily" and entries not yet notified. */
export async function sendDailyDigests(services: Services): Promise<number> {
  const { db } = services;
  const candidates = await db
    .prepare(
      `SELECT DISTINCT s.site_id FROM submissions s JOIN sites st ON st.id = s.site_id
       WHERE s.notified_at IS NULL AND st.archived_at IS NULL AND COALESCE(s.spam_score, 0) < ?`,
    )
    .bind(SPAM_THRESHOLD)
    .all<{ site_id: string }>();
  let sent = 0;
  for (const { site_id } of candidates.results) {
    const settings = await getSettings(db, site_id);
    if (settings.notifications !== "daily") continue;
    const site = await db
      .prepare("SELECT * FROM sites WHERE id = ?")
      .bind(site_id)
      .first<SiteRow>();
    if (!site) continue;
    const to = await notifyAddress(services, site, settings);
    const rows = (
      await db
        .prepare(
          `SELECT s.*, f.name AS form_name FROM submissions s
           LEFT JOIN forms f ON f.site_id = s.site_id AND f.id = s.form_id
           WHERE s.site_id = ? AND s.notified_at IS NULL AND COALESCE(s.spam_score, 0) < ?
           ORDER BY s.created_at LIMIT 200`,
        )
        .bind(site_id, SPAM_THRESHOLD)
        .all<SubmissionRow>()
    ).results;
    if (!rows.length) continue;
    if (to) {
      const entries = rows.map((r) => {
        const data = JSON.parse(r.data_json) as SubmissionData;
        return {
          label: `${r.form_name ?? r.form_id} · ${new Date(r.created_at).toUTCString()}`,
          value: displayEntries(null, data)
            .map((e) => `${e.label}: ${e.value}`)
            .join("\n"),
        };
      });
      const mail = formNotificationEmail({
        site: emailSite(site),
        baseUrl: siteBaseUrl(site, services.config.hubUrl),
        formName: "daily",
        entries,
        entryUrl: inboxUrl(services, site.id),
      });
      try {
        await sendTransactional(services, {
          siteId: site.id,
          to,
          subject: `${rows.length} new form ${rows.length === 1 ? "entry" : "entries"} for ${site.name}`,
          html: mail.html,
          text: mail.text,
          kind: "form-digest",
        });
        sent++;
      } catch {
        continue; // quota or provider failure: leave entries unnotified for the next run
      }
    }
    const now = services.now();
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      await db
        .prepare(
          `UPDATE submissions SET notified_at = ? WHERE id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(now, ...chunk)
        .run();
    }
  }
  return sent;
}
