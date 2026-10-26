/**
 * Email campaigns (arch §9.2, PRD §5.5): composed from email-safe blocks, rendered by
 * `@openspace/email-render`, sent through the owner's own sender to confirmed subscribers in a
 * tag segment. Every message carries an RFC 8058 one-click unsubscribe (headers + footer link).
 *
 * Sending: the campaign is claimed (`draft|scheduled → sending`), its recipients are frozen into
 * `campaign_recipients`, and batches are claimed with `UPDATE … RETURNING` so concurrent workers
 * (Queue consumers, the cron, an inline send) never mail anyone twice. Clicks go through
 * `/e/c/<recipient>.<sig>/<n>`, which only redirects to link n of THIS campaign's frozen list.
 */
import { campaignEmail } from "@openspace/email-render";
import { type Block, BlockSchema } from "@openspace/schema";
import { z } from "zod";
import type { SiteRow } from "../db/sites";
import { getSite } from "../db/sites";
import { randomId, timingSafeEqual } from "../lib/crypto";
import { conflict, HttpError, notFound } from "../lib/errors";
import type { Logger } from "../lib/log";
import { hmacB64 } from "../lib/seal";
import { requireHmacKey } from "../public-env";
import { DevOutboxSender, type EmailSender, emailSite, siteBaseUrl } from "./email";
import type { Services } from "./index";
import { listUnsubscribeHeaders, TagSchema, unsubscribeUrl } from "./newsletter";
import { getSender, type SenderRow, senderFor } from "./senders";

export const BATCH_SIZE = 50;
/** Recipients sent inline per request when there is no Queue (the cron continues the rest). */
export const INLINE_BUDGET = 500;
const UNSUB_TAG = "{{os_unsubscribe}}";
const TRACK_TAG = "{{os_track}}";

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "canceled";

export const SegmentSchema = z.strictObject({
  tags: z.array(TagSchema).max(20).default([]),
  match: z.enum(["any", "all"]).default("any"),
});

export const CampaignInputSchema = z.strictObject({
  subject: z.string().trim().min(1).max(200),
  preheader: z.string().trim().max(200).nullable().optional(),
  body: z.strictObject({ blocks: z.array(BlockSchema).max(200) }),
  segment: SegmentSchema.optional(),
  senderId: z.string().max(40).nullable().optional(),
  trackOpens: z.boolean().optional(),
});
export const CampaignPatchSchema = CampaignInputSchema.partial();

interface CampaignRow {
  id: string;
  site_id: string;
  subject: string | null;
  body_json: string | null;
  status: CampaignStatus;
  send_at: number | null;
  stats_json: string | null;
  created_at: number | null;
  preheader: string | null;
  segment_json: string | null;
  sender_id: string | null;
  links_json: string | null;
  recipients: number;
  error: string | null;
  created_by: string | null;
  updated_at: number | null;
  started_at: number | null;
  finished_at: number | null;
}

interface Body {
  blocks: Block[];
  trackOpens?: boolean;
}

function body(r: CampaignRow): Body {
  try {
    const v = JSON.parse(r.body_json ?? "{}") as Body;
    return { blocks: Array.isArray(v.blocks) ? v.blocks : [], trackOpens: v.trackOpens === true };
  } catch {
    return { blocks: [] };
  }
}

function segment(r: CampaignRow): z.infer<typeof SegmentSchema> {
  try {
    return SegmentSchema.parse(JSON.parse(r.segment_json ?? "{}"));
  } catch {
    return { tags: [], match: "any" };
  }
}

export interface CampaignView {
  id: string;
  subject: string;
  preheader: string | null;
  body: { blocks: Block[] };
  segment: z.infer<typeof SegmentSchema>;
  senderId: string | null;
  trackOpens: boolean;
  status: CampaignStatus;
  sendAt: string | null;
  recipients: number;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

function view(r: CampaignRow): CampaignView {
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
  const b = body(r);
  return {
    id: r.id,
    subject: r.subject ?? "",
    preheader: r.preheader,
    body: { blocks: b.blocks },
    segment: segment(r),
    senderId: r.sender_id,
    trackOpens: !!b.trackOpens,
    status: r.status,
    sendAt: iso(r.send_at),
    recipients: r.recipients,
    error: r.error,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
  };
}

async function row(db: D1Database, siteId: string, id: string) {
  return db
    .prepare("SELECT * FROM campaigns WHERE site_id = ? AND id = ?")
    .bind(siteId, id)
    .first<CampaignRow>();
}

async function requireCampaign(db: D1Database, siteId: string, id: string) {
  const r = await row(db, siteId, id);
  if (!r) throw notFound("We couldn't find that campaign.");
  return r;
}

async function checkSender(db: D1Database, siteId: string, senderId: string | null | undefined) {
  if (senderId && !(await getSender(db, siteId, senderId)))
    throw new HttpError(422, "invalid_sender", "That sender isn't connected to this site.");
}

// ---- CRUD ---------------------------------------------------------------------------------------

export async function listCampaigns(db: D1Database, siteId: string): Promise<CampaignView[]> {
  const rows = await db
    .prepare("SELECT * FROM campaigns WHERE site_id = ? ORDER BY created_at DESC LIMIT 200")
    .bind(siteId)
    .all<CampaignRow>();
  return rows.results.map(view);
}

export async function getCampaign(db: D1Database, siteId: string, id: string) {
  return view(await requireCampaign(db, siteId, id));
}

export async function createCampaign(
  services: Services,
  siteId: string,
  userId: string,
  input: z.infer<typeof CampaignInputSchema>,
): Promise<CampaignView> {
  await checkSender(services.db, siteId, input.senderId);
  const id = randomId("cmp", 10);
  const now = services.now();
  await services.db
    .prepare(
      `INSERT INTO campaigns (id, site_id, subject, body_json, status, created_at, preheader, segment_json,
         sender_id, created_by, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      siteId,
      input.subject,
      JSON.stringify({ blocks: input.body.blocks, trackOpens: input.trackOpens === true }),
      now,
      input.preheader ?? null,
      JSON.stringify(input.segment ?? { tags: [], match: "any" }),
      input.senderId ?? null,
      userId,
      now,
    )
    .run();
  return getCampaign(services.db, siteId, id);
}

export async function updateCampaign(
  services: Services,
  siteId: string,
  id: string,
  patch: z.infer<typeof CampaignPatchSchema>,
): Promise<CampaignView> {
  const r = await requireCampaign(services.db, siteId, id);
  if (r.status !== "draft")
    throw conflict("not_editable", "Only drafts can be edited. Unschedule it first.");
  await checkSender(services.db, siteId, patch.senderId);
  const b = body(r);
  const res = await services.db
    .prepare(
      `UPDATE campaigns SET subject = ?, preheader = ?, body_json = ?, segment_json = ?, sender_id = ?,
         updated_at = ? WHERE id = ? AND status = 'draft'`,
    )
    .bind(
      patch.subject ?? r.subject,
      patch.preheader !== undefined ? patch.preheader : r.preheader,
      JSON.stringify({
        blocks: patch.body?.blocks ?? b.blocks,
        trackOpens: patch.trackOpens ?? b.trackOpens ?? false,
      }),
      patch.segment ? JSON.stringify(patch.segment) : r.segment_json,
      patch.senderId !== undefined ? patch.senderId : r.sender_id,
      services.now(),
      id,
    )
    .run();
  if ((res.meta.changes ?? 0) !== 1) throw conflict("not_editable", "Only drafts can be edited.");
  return getCampaign(services.db, siteId, id);
}

export async function deleteCampaign(db: D1Database, siteId: string, id: string): Promise<void> {
  const res = await db
    .prepare(
      "DELETE FROM campaigns WHERE site_id = ? AND id = ? AND status IN ('draft', 'scheduled', 'canceled')",
    )
    .bind(siteId, id)
    .run();
  if ((res.meta.changes ?? 0) !== 1)
    throw conflict("not_deletable", "Sent campaigns are kept for their stats.");
}

// ---- segments -----------------------------------------------------------------------------------

function segmentWhere(seg: z.infer<typeof SegmentSchema>): { sql: string; args: string[] } {
  if (!seg.tags.length) return { sql: "", args: [] };
  const exists = "EXISTS (SELECT 1 FROM json_each(s.tags) WHERE json_each.value = ?)";
  return {
    sql: ` AND (${seg.tags.map(() => exists).join(seg.match === "all" ? " AND " : " OR ")})`,
    args: seg.tags,
  };
}

export async function segmentCount(
  db: D1Database,
  siteId: string,
  seg: z.infer<typeof SegmentSchema>,
): Promise<number> {
  const w = segmentWhere(seg);
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM subscribers s WHERE s.site_id = ? AND s.status = 'confirmed'${w.sql}`,
    )
    .bind(siteId, ...w.args)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

// ---- rendering ----------------------------------------------------------------------------------

export interface RenderedCampaign {
  subject: string;
  html: string;
  text: string;
  warnings: Array<{ code: string; message: string }>;
  /** Tracked http(s) links, in order (the click redirect only goes to these). */
  links: string[];
}

/**
 * Render once with merge tags; recipients get their own unsubscribe URL and tracking token by
 * string substitution (rendering per recipient would be far too slow for a list).
 */
export function renderCampaign(
  services: Services,
  site: SiteRow,
  r: Pick<CampaignRow, "id" | "subject" | "preheader" | "body_json">,
  opts: { track: boolean; trackOpens: boolean },
): RenderedCampaign {
  const b = body(r as CampaignRow);
  const out = campaignEmail({
    site: emailSite(site),
    baseUrl: siteBaseUrl(site, services.config.hubUrl),
    subject: r.subject ?? "",
    blocks: b.blocks,
    ...(r.preheader ? { preheader: r.preheader } : {}),
    unsubscribeUrl: { mergeTag: UNSUB_TAG },
  });
  const links: string[] = [];
  let html = out.html;
  if (opts.track) {
    html = html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url: string) => {
      const decoded = url.replace(/&amp;/g, "&");
      let idx = links.indexOf(decoded);
      if (idx < 0) {
        if (links.length >= 200) return `href="${url}"`;
        idx = links.push(decoded) - 1;
      }
      return `href="${services.config.hubUrl}/e/c/${TRACK_TAG}/${idx}"`;
    });
    if (opts.trackOpens)
      html = html.replace(
        /<\/body>/i,
        `<img src="${services.config.hubUrl}/e/o/${TRACK_TAG}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px"></body>`,
      );
  }
  return {
    subject: out.subject,
    html,
    text: out.text,
    warnings: out.warnings.map((w) => ({ code: w.code, message: w.message })),
    links,
  };
}

async function trackToken(services: Services, recipientId: string): Promise<string> {
  const key = requireHmacKey(services.pub.config);
  return `${recipientId}.${await hmacB64(key, `track:${recipientId}`, 22)}`;
}

export async function verifyTrackToken(services: Services, token: string): Promise<string | null> {
  const m = token.match(/^(rcp_[0-9a-z]+)\.([A-Za-z0-9_-]{22})$/);
  if (!m) return null;
  const key = requireHmacKey(services.pub.config);
  return (await timingSafeEqual(m[2] as string, await hmacB64(key, `track:${m[1]}`, 22)))
    ? (m[1] as string)
    : null;
}

export async function previewCampaign(services: Services, site: SiteRow, id: string) {
  const r = await requireCampaign(services.db, site.id, id);
  const rendered = renderCampaign(services, site, r, { track: false, trackOpens: false });
  const unsub = `${services.config.hubUrl}/n/unsubscribe/preview`;
  return {
    subject: rendered.subject,
    html: rendered.html.split(UNSUB_TAG).join(unsub),
    text: rendered.text.split(UNSUB_TAG).join(unsub),
    warnings: rendered.warnings,
    recipients: await segmentCount(services.db, site.id, segment(r)),
  };
}

// ---- senders ------------------------------------------------------------------------------------

async function campaignSender(
  services: Services,
  site: SiteRow,
  r: CampaignRow,
): Promise<{ sender: EmailSender; from: { email: string; name: string }; replyTo: string | null }> {
  let conn: SenderRow | null = r.sender_id
    ? await getSender(services.db, site.id, r.sender_id)
    : null;
  if (!conn) {
    // The site's only verified sender is the default.
    const all = (
      await services.db
        .prepare(
          "SELECT * FROM sender_connections WHERE site_id = ? AND status = 'verified' ORDER BY created_at LIMIT 1",
        )
        .bind(site.id)
        .all<SenderRow>()
    ).results;
    conn = all[0] ?? null;
  }
  if (!conn) {
    if (services.config.devMode)
      // Dev: campaigns work with no setup; mail lands in the dev outbox.
      return {
        sender: new DevOutboxSender(services.db, services.now),
        from: { email: services.pub.config.emailFrom.email, name: site.name },
        replyTo: null,
      };
    throw conflict("sender_required", "Connect your email sender before sending a campaign.");
  }
  if (conn.status !== "verified" && conn.provider !== "dev")
    throw conflict(
      "sender_unverified",
      "Your sending domain isn't verified yet. Check its SPF, DKIM and DMARC records.",
    );
  return {
    sender: await senderFor(services, conn),
    from: { email: conn.from_email, name: conn.from_name ?? site.name },
    replyTo: conn.reply_to,
  };
}

export async function sendTest(services: Services, site: SiteRow, id: string, to: string) {
  const r = await requireCampaign(services.db, site.id, id);
  const { sender, from, replyTo } = await campaignSender(services, site, r);
  const rendered = renderCampaign(services, site, r, { track: false, trackOpens: false });
  const unsub = siteBaseUrl(site, services.config.hubUrl);
  return sender.send({
    to,
    from,
    subject: `[Test] ${rendered.subject}`,
    html: rendered.html.split(UNSUB_TAG).join(unsub),
    text: rendered.text.split(UNSUB_TAG).join(unsub),
    kind: "campaign-test",
    siteId: site.id,
    ...(replyTo ? { replyTo } : {}),
  });
}

// ---- schedule / send ----------------------------------------------------------------------------

export async function scheduleCampaign(
  services: Services,
  site: SiteRow,
  id: string,
  sendAt: number,
): Promise<CampaignView> {
  const r = await requireCampaign(services.db, site.id, id);
  if (sendAt < services.now() + 60_000)
    throw new HttpError(422, "invalid_date", "Choose a time at least a minute from now.");
  await campaignSender(services, site, r); // fail early when no usable sender
  const res = await services.db
    .prepare(
      "UPDATE campaigns SET status = 'scheduled', send_at = ?, updated_at = ? WHERE id = ? AND status IN ('draft', 'scheduled')",
    )
    .bind(sendAt, services.now(), id)
    .run();
  if ((res.meta.changes ?? 0) !== 1)
    throw conflict("not_schedulable", "This campaign was already sent.");
  return getCampaign(services.db, site.id, id);
}

export async function unscheduleCampaign(services: Services, siteId: string, id: string) {
  const res = await services.db
    .prepare(
      "UPDATE campaigns SET status = 'draft', send_at = NULL, updated_at = ? WHERE site_id = ? AND id = ? AND status = 'scheduled'",
    )
    .bind(services.now(), siteId, id)
    .run();
  if ((res.meta.changes ?? 0) !== 1)
    throw conflict("not_scheduled", "This campaign isn't scheduled.");
  return getCampaign(services.db, siteId, id);
}

/**
 * Start sending: claim the campaign, freeze its links and recipients, then fan out (Queue) or
 * send inline in batches up to `INLINE_BUDGET` (the minute cron finishes larger lists).
 */
export async function startCampaign(
  services: Services,
  site: SiteRow,
  id: string,
  log?: Logger,
): Promise<CampaignView> {
  const r = await requireCampaign(services.db, site.id, id);
  await campaignSender(services, site, r);
  if (!body(r).blocks.length) throw new HttpError(422, "empty_campaign", "Add some content first.");
  const now = services.now();
  const claim = await services.db
    .prepare(
      "UPDATE campaigns SET status = 'sending', started_at = ?, updated_at = ?, error = NULL WHERE id = ? AND status IN ('draft', 'scheduled')",
    )
    .bind(now, now, id)
    .run();
  if ((claim.meta.changes ?? 0) !== 1)
    throw conflict("already_sent", "This campaign is already sending.");
  const rendered = renderCampaign(services, site, r, {
    track: true,
    trackOpens: !!body(r).trackOpens,
  });
  const w = segmentWhere(segment(r));
  await services.db.batch([
    services.db
      .prepare("UPDATE campaigns SET links_json = ? WHERE id = ?")
      .bind(JSON.stringify(rendered.links), id),
    services.db
      .prepare(
        `INSERT INTO campaign_recipients (id, campaign_id, site_id, subscriber_id, email, status)
         SELECT 'rcp_' || lower(hex(randomblob(10))), ?, s.site_id, s.id, s.email, 'queued'
         FROM subscribers s WHERE s.site_id = ? AND s.status = 'confirmed'${w.sql}
         ON CONFLICT (campaign_id, subscriber_id) DO NOTHING`,
      )
      .bind(id, site.id, ...w.args),
    services.db
      .prepare(
        "UPDATE campaigns SET recipients = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?) WHERE id = ?",
      )
      .bind(id, id),
  ]);
  if (services.growth.queue) {
    const total = (await row(services.db, site.id, id))?.recipients ?? 0;
    const jobs = Math.max(1, Math.ceil(total / BATCH_SIZE));
    for (let i = 0; i < Math.min(jobs, 100); i++)
      await services.growth.queue.send({ kind: "campaign-batch", campaignId: id, siteId: site.id });
  } else await runCampaign(services, site.id, id, INLINE_BUDGET, log);
  return getCampaign(services.db, site.id, id);
}

/** Send up to `budget` queued recipients of a campaign; finishes it when none are left. */
export async function runCampaign(
  services: Services,
  siteId: string,
  id: string,
  budget = BATCH_SIZE,
  log?: Logger,
): Promise<{ sent: number; failed: number; done: boolean }> {
  const site = await getSite(services.db, siteId);
  const r = site ? await row(services.db, siteId, id) : null;
  if (!site || !r || r.status !== "sending") return { sent: 0, failed: 0, done: true };
  let sender: Awaited<ReturnType<typeof campaignSender>>;
  try {
    sender = await campaignSender(services, site, r);
  } catch (err) {
    await finish(services, id, "failed", err instanceof Error ? err.message : "sender unavailable");
    return { sent: 0, failed: 0, done: true };
  }
  const rendered = renderCampaign(services, site, r, {
    track: true,
    trackOpens: !!body(r).trackOpens,
  });
  let sent = 0;
  let failed = 0;
  while (sent + failed < budget) {
    const batch = await services.db
      .prepare(
        `UPDATE campaign_recipients SET status = 'sending', sent_at = ?
         WHERE id IN (SELECT id FROM campaign_recipients WHERE campaign_id = ? AND status = 'queued' LIMIT ?)
         RETURNING id, subscriber_id, email`,
      )
      .bind(services.now(), id, Math.min(BATCH_SIZE, budget - sent - failed))
      .all<{ id: string; subscriber_id: string; email: string }>();
    if (!batch.results.length) break;
    for (let i = 0; i < batch.results.length; i += 5) {
      const slice = batch.results.slice(i, i + 5);
      const results = await Promise.all(
        slice.map((rc) =>
          sendOne(services, site, r, rendered, sender, rc).catch((e) => e as Error),
        ),
      );
      for (const res of results) res instanceof Error ? failed++ : sent++;
    }
  }
  const left = await services.db
    .prepare(
      "SELECT COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = ? AND status IN ('queued', 'sending')",
    )
    .bind(id)
    .first<{ n: number }>();
  const done = (left?.n ?? 0) === 0;
  if (done) await finish(services, id, "sent", null);
  if (failed) log?.warn("campaign sends failed", { campaign: id, failed });
  return { sent, failed, done };
}

async function sendOne(
  services: Services,
  site: SiteRow,
  r: CampaignRow,
  rendered: RenderedCampaign,
  s: Awaited<ReturnType<typeof campaignSender>>,
  rc: { id: string; subscriber_id: string; email: string },
): Promise<void> {
  // Someone who unsubscribed (or bounced) since the send started is skipped.
  const sub = await services.db
    .prepare("SELECT status FROM subscribers WHERE id = ? AND site_id = ?")
    .bind(rc.subscriber_id, site.id)
    .first<{ status: string }>();
  if (sub?.status !== "confirmed") {
    await services.db
      .prepare("UPDATE campaign_recipients SET status = 'skipped' WHERE id = ?")
      .bind(rc.id)
      .run();
    return;
  }
  const unsub = await unsubscribeUrl(services, rc.subscriber_id);
  const token = await trackToken(services, rc.id);
  const html = rendered.html.split(UNSUB_TAG).join(unsub).split(TRACK_TAG).join(token);
  const text = rendered.text.split(UNSUB_TAG).join(unsub);
  try {
    const res = await s.sender.send({
      to: rc.email,
      from: s.from,
      subject: rendered.subject,
      html,
      text,
      kind: "campaign",
      siteId: site.id,
      ...(s.replyTo ? { replyTo: s.replyTo } : {}),
      headers: {
        ...(listUnsubscribeHeaders(unsub) ?? {}),
        "X-OpenSpace-Campaign": r.id,
      },
    });
    await services.db
      .prepare(
        "UPDATE campaign_recipients SET status = 'sent', message_id = ?, sent_at = ? WHERE id = ?",
      )
      .bind(res.id, services.now(), rc.id)
      .run();
  } catch (err) {
    const bounced = (err as { status?: number }).status === 550;
    await services.db
      .prepare("UPDATE campaign_recipients SET status = ?, error = ? WHERE id = ?")
      .bind(
        bounced ? "bounced" : "failed",
        err instanceof Error ? err.message.slice(0, 300) : "send failed",
        rc.id,
      )
      .run();
    if (bounced) await suppress(services.db, site.id, rc.email, "bounce", services.now());
    throw err;
  }
}

async function finish(
  services: Services,
  id: string,
  status: CampaignStatus,
  error: string | null,
) {
  const now = services.now();
  await services.db
    .prepare(
      "UPDATE campaigns SET status = ?, finished_at = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'sending'",
    )
    .bind(status, now, error, now, id)
    .run();
}

/** Minute cron: start due scheduled campaigns and continue unfinished ones (no Queue). */
export async function runDueCampaigns(services: Services, now: number, log?: Logger) {
  const due = await services.db
    .prepare(
      "SELECT id, site_id FROM campaigns WHERE status = 'scheduled' AND send_at <= ? LIMIT 10",
    )
    .bind(now)
    .all<{ id: string; site_id: string }>();
  let started = 0;
  for (const c of due.results) {
    const site = await getSite(services.db, c.site_id);
    if (!site || site.archived_at) continue;
    try {
      await startCampaign(services, site, c.id, log);
      started++;
    } catch (err) {
      log?.warn("scheduled campaign could not start", { campaign: c.id, err });
      await services.db
        .prepare(
          "UPDATE campaigns SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'scheduled'",
        )
        .bind(err instanceof Error ? err.message.slice(0, 300) : "failed", now, c.id)
        .run();
    }
  }
  // Recipients stuck in 'sending' (a worker died mid-batch) are marked failed, never resent.
  await services.db
    .prepare(
      "UPDATE campaign_recipients SET status = 'failed', error = 'interrupted' WHERE status = 'sending' AND sent_at < ?",
    )
    .bind(now - 15 * 60 * 1000)
    .run();
  let continued = 0;
  if (!services.growth.queue) {
    const sending = await services.db
      .prepare("SELECT id, site_id FROM campaigns WHERE status = 'sending' LIMIT 5")
      .all<{ id: string; site_id: string }>();
    for (const c of sending.results) {
      await runCampaign(services, c.site_id, c.id, INLINE_BUDGET, log);
      continued++;
    }
  }
  return { started, continued };
}

// ---- stats + tracking ---------------------------------------------------------------------------

export async function campaignStats(db: D1Database, siteId: string, id: string) {
  const r = await requireCampaign(db, siteId, id);
  const counts = await db
    .prepare(
      `SELECT status, COUNT(*) AS n, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
         SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked
       FROM campaign_recipients WHERE campaign_id = ? GROUP BY status`,
    )
    .bind(id)
    .all<{ status: string; n: number; opened: number; clicked: number }>();
  const by: Record<string, number> = {};
  let opened = 0;
  let clicked = 0;
  for (const c of counts.results) {
    by[c.status] = c.n;
    opened += c.opened ?? 0;
    clicked += c.clicked ?? 0;
  }
  const links: string[] = r.links_json ? (JSON.parse(r.links_json) as string[]) : [];
  const clicks = await db
    .prepare(
      "SELECT link_idx, COUNT(*) AS n, COUNT(DISTINCT recipient_id) AS u FROM campaign_clicks WHERE campaign_id = ? GROUP BY link_idx",
    )
    .bind(id)
    .all<{ link_idx: number; n: number; u: number }>();
  const delivered = (by.sent ?? 0) + (by.complained ?? 0);
  return {
    recipients: r.recipients,
    sent: by.sent ?? 0,
    delivered,
    failed: by.failed ?? 0,
    bounced: by.bounced ?? 0,
    complained: by.complained ?? 0,
    skipped: by.skipped ?? 0,
    queued: (by.queued ?? 0) + (by.sending ?? 0),
    opened,
    clicked,
    openRate: delivered ? opened / delivered : 0,
    clickRate: delivered ? clicked / delivered : 0,
    trackOpens: !!body(r).trackOpens,
    links: links.map((url, i) => {
      const c = clicks.results.find((x) => x.link_idx === i);
      return { url, clicks: c?.n ?? 0, uniqueClicks: c?.u ?? 0 };
    }),
  };
}

/** The click target for a tracking token — only a link frozen into that campaign. */
export async function trackClick(
  services: Services,
  token: string,
  idx: number,
): Promise<string | null> {
  const rid = await verifyTrackToken(services, token);
  if (!rid) return null;
  const rc = await services.db
    .prepare(
      `SELECT r.id, r.campaign_id, c.links_json FROM campaign_recipients r JOIN campaigns c ON c.id = r.campaign_id
       WHERE r.id = ?`,
    )
    .bind(rid)
    .first<{ id: string; campaign_id: string; links_json: string | null }>();
  if (!rc) return null;
  const links = rc.links_json ? (JSON.parse(rc.links_json) as string[]) : [];
  const url = Number.isInteger(idx) && idx >= 0 ? links[idx] : undefined;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const now = services.now();
  await services.db.batch([
    services.db
      .prepare(
        "INSERT INTO campaign_clicks (campaign_id, recipient_id, link_idx, at) VALUES (?, ?, ?, ?)",
      )
      .bind(rc.campaign_id, rc.id, idx, now),
    services.db
      .prepare(
        "UPDATE campaign_recipients SET clicked_at = COALESCE(clicked_at, ?), opened_at = COALESCE(opened_at, ?) WHERE id = ?",
      )
      .bind(now, now, rc.id),
  ]);
  return url;
}

export async function trackOpen(services: Services, token: string): Promise<void> {
  const rid = await verifyTrackToken(services, token);
  if (!rid) return;
  await services.db
    .prepare("UPDATE campaign_recipients SET opened_at = COALESCE(opened_at, ?) WHERE id = ?")
    .bind(services.now(), rid)
    .run();
}

// ---- bounces + complaints -----------------------------------------------------------------------

async function suppress(
  db: D1Database,
  siteId: string,
  email: string,
  reason: "bounce" | "complaint",
  now: number,
) {
  await db
    .prepare(
      `UPDATE subscribers SET status = 'unsubscribed', suppressed_reason = ?, unsubscribed_at = COALESCE(unsubscribed_at, ?),
         updated_at = ? WHERE site_id = ? AND lower(email) = ?`,
    )
    .bind(reason, now, now, siteId, email.trim().toLowerCase())
    .run();
}

/**
 * A provider reported a bounce or complaint. Hard bounces and complaints suppress the address
 * for this site (status unsubscribed + reason); soft bounces only mark the recipient row.
 */
export async function recordDeliveryEvent(
  services: Services,
  sender: SenderRow,
  e: {
    messageId: string | null;
    email: string | null;
    kind: "bounce" | "complaint";
    permanent: boolean;
  },
): Promise<boolean> {
  const db = services.db;
  const rc = e.messageId
    ? await db
        .prepare("SELECT id, email FROM campaign_recipients WHERE message_id = ? AND site_id = ?")
        .bind(e.messageId, sender.site_id)
        .first<{ id: string; email: string }>()
    : null;
  const email = rc?.email ?? e.email;
  if (!email) return false;
  if (rc)
    await db
      .prepare("UPDATE campaign_recipients SET status = ? WHERE id = ?")
      .bind(e.kind === "complaint" ? "complained" : "bounced", rc.id)
      .run();
  if (e.kind === "complaint" || e.permanent)
    await suppress(db, sender.site_id, email, e.kind, services.now());
  return true;
}
