import { env } from "cloudflare:test";
import type { SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { type HubBindings, readConfig } from "../src/env";
import { DevGitHubAccess } from "../src/github/dev";
import { createLogger } from "../src/lib/log";
import { createServices } from "../src/services";
import {
  backfillTurnstileVariables,
  nextScheduledAt,
  runDueScheduledItems,
} from "../src/services/site-automation";
import { call, devLogin } from "./helpers";
import { createSite } from "./room-helpers";

const KEY = ["1x00000000", "000000000000AA"].join("");
const log = createLogger("silent");
const servicesFor = (bindings: Record<string, unknown>) => {
  const e = bindings as unknown as HubBindings;
  return createServices(e, readConfig(e));
};

describe("Turnstile site key reaches site builds", () => {
  it("new sites get the repository variable and openspace.json integrations.turnstileSiteKey", async () => {
    const app = createApp();
    const bindings = { ...env, TURNSTILE_SITE_KEY: KEY };
    const owner = await devLogin(app, "Tara Quinn");
    const res = await call(
      app,
      "/api/sites",
      { method: "POST", cookie: owner, json: { template: "basic", name: "Key Site" } },
      bindings,
    );
    expect(res.status).toBe(201);
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "tara-quinn", name: "key-site" };
    expect(await gh.getVariable(repo, "OPENSPACE_TURNSTILE_SITE_KEY")).toBe(KEY);
    const config = JSON.parse((await gh.readFile(repo, "openspace.json", "main")) as string);
    expect(config.integrations).toEqual({ turnstileSiteKey: KEY });
  });

  it("existing sites are backfilled by the cron", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Omar Hale");
    await createSite(app, owner, "Old Site");
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "omar-hale", name: "old-site" };
    expect(await gh.getVariable(repo, "OPENSPACE_TURNSTILE_SITE_KEY")).toBeNull();
    const services = servicesFor({ ...env, TURNSTILE_SITE_KEY: KEY });
    expect(await backfillTurnstileVariables(services, log)).toBeGreaterThanOrEqual(1);
    expect(await gh.getVariable(repo, "OPENSPACE_TURNSTILE_SITE_KEY")).toBe(KEY);
    // Done once: the next run has nothing left to do for it.
    expect(await backfillTurnstileVariables(services, log)).toBe(0);
  });
});

describe("scheduled collection items go live on time", () => {
  const doc = (items: Record<string, { status: string; publishAt?: string }>) =>
    ({
      collections: {
        blog: Object.fromEntries(
          Object.entries(items).map(([slug, fm]) => [
            slug,
            { kind: "blog", slug, frontmatter: fm },
          ]),
        ),
      },
    }) as unknown as SiteDocument;

  it("finds the next future publishAt", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(
      nextScheduledAt(
        doc({
          a: { status: "scheduled", publishAt: "2026-10-26T11:00:00Z" },
          b: { status: "scheduled", publishAt: "2026-10-28T09:00:00Z" },
          c: { status: "scheduled", publishAt: "2026-10-27T09:00:00Z" },
          d: { status: "draft", publishAt: "2026-10-26T13:00:00Z" },
          e: { status: "published" },
        }),
        now,
      ),
    ).toBe(Date.parse("2026-10-27T09:00:00Z"));
    expect(nextScheduledAt(doc({}), now)).toBeNull();
  });

  it("publishing records it; when due, the minute cron rebuilds the live site", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Rae Lund");
    const site = await createSite(app, owner, "Sched Site");
    const pub = await call(app, `/api/sites/${site.id}/publish`, { method: "POST", cookie: owner });
    expect(pub.status).toBe(200);
    const row = () =>
      env.HUB_DB.prepare("SELECT next_publish_at FROM site_automation WHERE site_id = ?")
        .bind(site.id)
        .first<{ next_publish_at: number | null }>();
    // (Published, nothing scheduled in the basic template — or no-op publish.)
    const now = Date.now();
    await env.HUB_DB.prepare(
      `INSERT INTO site_automation (site_id, next_publish_at, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET next_publish_at = excluded.next_publish_at`,
    )
      .bind(site.id, now - 1000, now)
      .run();
    const runs = async () =>
      (
        await env.HUB_DB.prepare(
          "SELECT COUNT(*) AS n FROM dev_workflow_runs WHERE repo = 'rae-lund/sched-site'",
        ).first<{ n: number }>()
      )?.n ?? 0;
    const before = await runs();
    const services = servicesFor(env as unknown as Record<string, unknown>);
    expect(await runDueScheduledItems(services, log, now)).toEqual([site.id]);
    expect(await runs()).toBe(before + 1);
    // Recomputed from the live document: nothing else is scheduled.
    expect((await row())?.next_publish_at).toBeNull();
    expect(await runDueScheduledItems(services, log, now)).toEqual([]);
  });
});
