/**
 * Operator settings (final wave B): abuse reporting, budget alerts and campaign warm-up. Kept
 * apart from `env.ts` / `public-env.ts` / `growth-env.ts` so tasks extend the Hub config without
 * touching the same lines. All optional; a dev Hub runs without any of them.
 */

export interface OperatorEnv {
  /** Where people report abuse (PRD §9.3): shown in every campaign email footer and the docs. */
  ABUSE_EMAIL?: string;
  /** Who gets budget alerts when Hub usage reaches 80% of the plan allowances (PRD §7.6). */
  ALERT_EMAIL?: string;
  /** JSON overrides for `DEFAULT_ALLOWANCES`, e.g. {"emails": 100000}. */
  PLAN_ALLOWANCES_JSON?: string;
  /** Campaign warm-up: recipients per site per UTC day before any clean history (default 100). */
  CAMPAIGN_DAILY_BASE?: string;
  /** Campaign warm-up ceiling: recipients per site per UTC day (default 50000). */
  CAMPAIGN_DAILY_MAX?: string;
}

/**
 * Monthly allowances of the Hub's Cloudflare plan (Workers Paid base, $5/month) the stewards
 * budget against, plus the email provider's monthly volume. Usage is measured from the Hub's own
 * counters, so these are lower-bound proxies for Cloudflare's billing meters.
 */
export interface PlanAllowances {
  /** Worker requests per month (Workers Paid includes 10M). */
  requests: number;
  /** Analytics Engine data points per month (10M included). */
  analyticsEvents: number;
  /** Emails per month across transactional mail and campaigns (provider plan). */
  emails: number;
  /** R2 storage in bytes (10 GB included). */
  storageBytes: number;
}

export const DEFAULT_ALLOWANCES: PlanAllowances = {
  requests: 10_000_000,
  analyticsEvents: 10_000_000,
  emails: 50_000,
  storageBytes: 10 * 1024 ** 3,
};

export interface OperatorConfig {
  abuseEmail: string | null;
  alertEmail: string | null;
  allowances: PlanAllowances;
  campaign: { dailyBase: number; dailyMax: number };
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const email = (v: string | undefined) => (v && EMAIL_RE.test(v.trim()) ? v.trim() : null);
const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : fallback;
};

export function readOperatorConfig(env: OperatorEnv): OperatorConfig {
  const allowances = { ...DEFAULT_ALLOWANCES };
  if (env.PLAN_ALLOWANCES_JSON) {
    try {
      const o = JSON.parse(env.PLAN_ALLOWANCES_JSON) as Record<string, unknown>;
      for (const k of Object.keys(allowances) as (keyof PlanAllowances)[]) {
        const v = o[k];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) allowances[k] = v;
      }
    } catch {
      /* ignore malformed overrides: defaults apply */
    }
  }
  const dailyBase = int(env.CAMPAIGN_DAILY_BASE, 100);
  return {
    abuseEmail: email(env.ABUSE_EMAIL),
    alertEmail: email(env.ALERT_EMAIL),
    allowances,
    campaign: { dailyBase, dailyMax: Math.max(dailyBase, int(env.CAMPAIGN_DAILY_MAX, 50_000)) },
  };
}
