import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GROWTH_DAILY_CRON, runGrowthCron } from "../src/cron/growth";
import { readConfig } from "../src/env";
import { DEFAULT_ALLOWANCES, readOperatorConfig } from "../src/operator-env";
import { createServices } from "../src/services";
import { checkBudget, hubUsage } from "../src/services/budget";

const NOW = Date.UTC(2031, 4, 20, 4, 0, 0);
const MONTH = "2031-05";
const allowances = { ...DEFAULT_ALLOWANCES, analyticsEvents: 1_000, emails: 100 };

function services(alertEmail: string | null) {
  return createServices(env as never, readConfig(env as never), {
    now: () => NOW,
    operator: { alertEmail, allowances },
  });
}

async function outbox() {
  return (
    await env.HUB_DB.prepare(
      "SELECT to_addr, subject, text FROM outbox WHERE kind = 'budget-alert' ORDER BY created_at",
    ).all<{ to_addr: string; subject: string; text: string }>()
  ).results;
}

describe("budget alerts (PRD 7.6)", () => {
  it("reads operator settings with safe defaults", () => {
    const c = readOperatorConfig({
      ABUSE_EMAIL: "abuse@hub.example",
      ALERT_EMAIL: "not an email",
      PLAN_ALLOWANCES_JSON: '{"emails": 5000, "requests": -1}',
      CAMPAIGN_DAILY_BASE: "50",
    });
    expect(c.abuseEmail).toBe("abuse@hub.example");
    expect(c.alertEmail).toBeNull();
    expect(c.allowances).toMatchObject({ emails: 5000, requests: DEFAULT_ALLOWANCES.requests });
    expect(c.campaign).toEqual({ dailyBase: 50, dailyMax: 50_000 });
  });

  it("measures month-to-date usage and alerts once per resource at 80%", async () => {
    await env.HUB_DB.batch([
      env.HUB_DB.prepare(
        "INSERT INTO quota_usage (site_id, resource, period, count) VALUES ('st_budget0001', 'analyticsPageviews', ?, 850)",
      ).bind(MONTH),
      env.HUB_DB.prepare(
        "INSERT INTO quota_usage (site_id, resource, period, count) VALUES ('st_budget0002', 'transactionalEmails', ?, 30)",
      ).bind(MONTH),
      // Last month doesn't count.
      env.HUB_DB.prepare(
        "INSERT INTO quota_usage (site_id, resource, period, count) VALUES ('st_budget0001', 'analyticsPageviews', '2031-04', 99999)",
      ),
    ]);
    const s = services("ops@hub.example");
    const usage = Object.fromEntries((await hubUsage(s)).map((l) => [l.resource, l]));
    expect(usage.analyticsEvents).toMatchObject({ used: 850, allowance: 1000, ratio: 0.85 });
    expect(usage.emails?.used).toBe(30);
    expect(usage.requests?.used).toBe(880);

    const fresh = await checkBudget(s);
    expect(fresh.map((l) => l.resource)).toEqual(["analyticsEvents"]);
    const mails = await outbox();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to_addr: "ops@hub.example" });
    expect(mails[0]?.text).toContain("Analytics events: 850 of 1,000 (85%)");
    const row = await env.HUB_DB.prepare(
      "SELECT used, allowance, emailed_at FROM budget_alerts WHERE resource = 'analyticsEvents' AND period = ?",
    )
      .bind(MONTH)
      .first<{ used: number; allowance: number; emailed_at: number | null }>();
    expect(row).toMatchObject({ used: 850, allowance: 1000, emailed_at: NOW });

    // Once per month: the daily cron doesn't repeat it.
    expect(await checkBudget(s)).toEqual([]);
    const cron = await runGrowthCron(GROWTH_DAILY_CRON, env as never, {
      now: () => NOW,
      operator: { alertEmail: "ops@hub.example", allowances },
    });
    expect(cron.budgetAlerts).toEqual([]);
    expect(await outbox()).toHaveLength(1);
  });

  it("records alerts without ALERT_EMAIL (no mail sent)", async () => {
    await env.HUB_DB.prepare(
      "INSERT INTO quota_usage (site_id, resource, period, count) VALUES ('st_budget0003', 'transactionalEmails', '2031-06', 95)",
    ).run();
    const s = createServices(env as never, readConfig(env as never), {
      now: () => Date.UTC(2031, 5, 2),
      operator: { alertEmail: null, allowances },
    });
    expect((await checkBudget(s)).map((l) => l.resource)).toEqual(["emails"]);
    expect((await outbox()).filter((m) => m.text.includes("2031-06"))).toHaveLength(0);
  });
});
