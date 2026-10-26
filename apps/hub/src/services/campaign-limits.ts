/**
 * Campaign volume caps with warm-up (PRD §9.3: "campaign sending … starts with low volume caps").
 *
 * Each site may send campaign mail to `limit` recipients per UTC day. A new sender starts at the
 * operator's `CAMPAIGN_DAILY_BASE` (default 100) and the limit doubles for every earlier day it
 * sent cleanly (up to `CAMPAIGN_DAILY_MAX`), so a list with good hygiene ramps up within about
 * ten sending days while a purchased list never gets far.
 *
 * Sending pauses for the site when, over the last 30 days (once at least `MIN_SAMPLE` messages
 * went out), more than 5% bounced or more than 0.3% were marked as spam. A paused site can't
 * start campaigns and queued recipients wait; it resumes on its own as the window moves on, or
 * when the operator raises it.
 */
import type { Services } from "./index";

const DAY = 86_400_000;
export const BOUNCE_PAUSE_RATE = 0.05;
export const COMPLAINT_PAUSE_RATE = 0.003;
export const MIN_SAMPLE = 50;
const DELIVERED = "('sent', 'bounced', 'complained')";

export interface CampaignQuota {
  /** Recipients this site may send to today (UTC). */
  limit: number;
  sentToday: number;
  remaining: number;
  /** Earlier days with campaign sends in the last 60 days (each doubles the limit). */
  cleanDays: number;
  /** Last 30 days. */
  window: { sent: number; bounced: number; complained: number };
  /** Set when sending is paused because of bounces or spam complaints. */
  paused: { reason: "bounces" | "complaints"; rate: number; message: string } | null;
}

export async function campaignQuota(services: Services, siteId: string): Promise<CampaignQuota> {
  const now = services.now();
  const today = Math.floor(now / DAY) * DAY;
  const { dailyBase, dailyMax } = services.operator.campaign;
  const db = services.db;
  const [todayRow, windowRow, daysRow] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM campaign_recipients WHERE site_id = ? AND sent_at >= ?
           AND status IN ('sending', 'sent', 'bounced', 'complained')`,
      )
      .bind(siteId, today)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS sent,
           SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
           SUM(CASE WHEN status = 'complained' THEN 1 ELSE 0 END) AS complained
         FROM campaign_recipients WHERE site_id = ? AND sent_at >= ? AND status IN ${DELIVERED}`,
      )
      .bind(siteId, now - 30 * DAY)
      .first<{ sent: number; bounced: number | null; complained: number | null }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT sent_at / ${DAY}) AS n FROM campaign_recipients
         WHERE site_id = ? AND sent_at >= ? AND sent_at < ? AND status IN ${DELIVERED}`,
      )
      .bind(siteId, now - 60 * DAY, today)
      .first<{ n: number }>(),
  ]);
  const window = {
    sent: windowRow?.sent ?? 0,
    bounced: windowRow?.bounced ?? 0,
    complained: windowRow?.complained ?? 0,
  };
  let paused: CampaignQuota["paused"] = null;
  if (window.sent >= MIN_SAMPLE) {
    const bounceRate = window.bounced / window.sent;
    const complaintRate = window.complained / window.sent;
    if (complaintRate > COMPLAINT_PAUSE_RATE)
      paused = {
        reason: "complaints",
        rate: complaintRate,
        message: `Sending is paused: ${pct(complaintRate)} of recent emails were marked as spam (the limit is ${pct(COMPLAINT_PAUSE_RATE)}). Only email people who asked to hear from you.`,
      };
    else if (bounceRate > BOUNCE_PAUSE_RATE)
      paused = {
        reason: "bounces",
        rate: bounceRate,
        message: `Sending is paused: ${pct(bounceRate)} of recent emails bounced (the limit is ${pct(BOUNCE_PAUSE_RATE)}). Remove old or mistyped addresses from your list.`,
      };
  }
  const cleanDays = daysRow?.n ?? 0;
  const limit = Math.min(dailyMax, dailyBase * 2 ** Math.min(cleanDays, 30));
  const sentToday = todayRow?.n ?? 0;
  return {
    limit,
    sentToday,
    remaining: paused ? 0 : Math.max(0, limit - sentToday),
    cleanDays,
    window,
    paused,
  };
}

function pct(r: number): string {
  const v = r * 100;
  return `${v < 1 ? v.toFixed(1) : Math.round(v)}%`;
}
