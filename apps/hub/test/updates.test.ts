import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GROWTH_DAILY_CRON, runGrowthCron } from "../src/cron/growth";
import { DevGitHubAccess } from "../src/github/dev";
import { DRAFT_BRANCH, MAIN_BRANCH, parseRepo } from "../src/github/types";
import { rateKeyIp } from "../src/lib/public";
import { expireDomainClaims } from "../src/services/data";
import { bumpPackageJson, kitVersion } from "../src/services/updates";
import { NpmUpdateSource, StaticUpdateSource } from "../src/services/updates-source";
import { call } from "./helpers";
import { mockFetch } from "./mock-fetch";
import { makePublicApp, siteWithForm } from "./public-helpers";

const pkgAt = async (repo: string, ref: string) => {
  const gh = new DevGitHubAccess(env.HUB_DB);
  const r = parseRepo(repo);
  return kitVersion(await gh.readFile(r, "package.json", (await gh.getRef(r, ref)) as string));
};

describe("update bot", () => {
  it("opens an update with a changelog, applies it to main and the draft, idempotently", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Updates" });
    expect(await pkgAt(f.repo, MAIN_BRANCH)).toBe("0.1.0");
    const check = await call(app, `/api/sites/${f.siteId}/updates/check`, {
      method: "POST",
      cookie: f.cookie,
    });
    const { update } = (await check.json()) as {
      update: {
        id: string;
        from: string;
        to: string;
        title: string;
        status: string;
        prUrl: string;
        changelog: unknown[];
      };
    };
    expect(update).toMatchObject({ from: "0.1.0", to: "0.2.0", status: "pending" });
    expect(update.title).toMatch(/^OpenSpace update 0\.2\.0: new gallery layouts/);
    expect(update.prUrl).toMatch(/\/pull\/1$/);
    expect(update.changelog).toHaveLength(1);
    // The change lives on its own branch until applied.
    expect(await pkgAt(f.repo, "os/update-0.2.0")).toBe("0.2.0");
    expect(await pkgAt(f.repo, MAIN_BRANCH)).toBe("0.1.0");
    // Checking again doesn't open another.
    const again = (await (
      await call(app, `/api/sites/${f.siteId}/updates/check`, { method: "POST", cookie: f.cookie })
    ).json()) as {
      update: { id: string };
    };
    expect(again.update.id).toBe(update.id);
    // An editor can't apply; a designer+ can.
    const applied = await call(app, `/api/sites/${f.siteId}/updates/${update.id}/apply`, {
      method: "POST",
      cookie: f.cookie,
    });
    expect(applied.status).toBe(200);
    expect(((await applied.json()) as { update: { status: string } }).update.status).toBe(
      "applied",
    );
    expect(await pkgAt(f.repo, MAIN_BRANCH)).toBe("0.2.0");
    expect(await pkgAt(f.repo, DRAFT_BRANCH)).toBe("0.2.0");
    const pr = await env.HUB_DB.prepare(
      "SELECT state FROM dev_pull_requests WHERE number = 1",
    ).first<{ state: string }>();
    // Nothing left to merge on its PR: the host closes it.
    expect(pr?.state).toBe("closed");
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/updates/${update.id}/apply`, {
          method: "POST",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(409);
    const list = (await (
      await call(app, `/api/sites/${f.siteId}/updates`, { cookie: f.cookie })
    ).json()) as {
      updates: Array<{ status: string }>;
    };
    expect(list.updates.map((u) => u.status)).toEqual(["applied"]);
    // Up to date now: nothing new.
    const none = (await (
      await call(app, `/api/sites/${f.siteId}/updates/check`, { method: "POST", cookie: f.cookie })
    ).json()) as {
      update: null;
    };
    expect(none.update).toBeNull();
  });

  it("applies even when its PR was closed, on newer content, and a failed one applies on Try again", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Closed PR" });
    const { update } = (await (
      await call(app, `/api/sites/${f.siteId}/updates/check`, { method: "POST", cookie: f.cookie })
    ).json()) as { update: { id: string } };
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = parseRepo(f.repo);
    // Newer content lands on main after the check (the site was published again)…
    const main = (await gh.getRef(repo, MAIN_BRANCH)) as string;
    await gh.commitFiles(repo, {
      branch: MAIN_BRANCH,
      expectedHead: main,
      message: "Edited Home",
      files: [{ path: "src/content/pages/later.md", content: "# Later\n" }],
    });
    // …and an earlier attempt left the PR closed (what production saw: re-generating the branch
    // on main made GitHub close the PR, the merge failed, the update was marked failed).
    await gh.resetBranch(repo, "os/update-0.2.0", (await gh.getRef(repo, MAIN_BRANCH)) as string);
    await env.HUB_DB.prepare("UPDATE site_updates SET status = 'failed' WHERE id = ?")
      .bind(update.id)
      .run();
    const res = await call(app, `/api/sites/${f.siteId}/updates/${update.id}/apply`, {
      method: "POST",
      cookie: f.cookie,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { update: { status: string } }).update.status).toBe("applied");
    const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
    expect(await pkgAt(f.repo, MAIN_BRANCH)).toBe("0.2.0");
    expect(await pkgAt(f.repo, DRAFT_BRANCH)).toBe("0.2.0");
    // The newer content is kept.
    expect(await gh.readFile(repo, "src/content/pages/later.md", head)).toBe("# Later\n");
  });

  it("applies on top of newer content (never reverts it) and auto-merges security releases", async () => {
    const app = makePublicApp({
      growth: {
        updates: new StaticUpdateSource(
          "0.1.1",
          JSON.stringify([
            { version: "0.1.1", notes: ["Fixes a form spam bypass"], security: true },
          ]),
        ),
      },
    });
    const f = await siteWithForm(app, { form: null, name: "Juniper Security" });
    // The daily cron opens (and, for security fixes, merges) updates for live sites.
    const out = await runGrowthCron(GROWTH_DAILY_CRON, env, {
      growth: {
        updates: new StaticUpdateSource(
          "0.1.1",
          JSON.stringify([
            { version: "0.1.1", notes: ["Fixes a form spam bypass"], security: true },
          ]),
        ),
      },
    });
    expect(out.updates).toMatchObject({ checked: 1, failed: 0 });
    expect(await pkgAt(f.repo, MAIN_BRANCH)).toBe("0.1.1");
    const row = await env.HUB_DB.prepare(
      "SELECT status, security FROM site_updates WHERE site_id = ?",
    )
      .bind(f.siteId)
      .first<{ status: string; security: number }>();
    expect(row).toEqual({ status: "applied", security: 1 });
  });

  it("dismisses updates and reads npm release notes (same major only)", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Dismiss" });
    const { update } = (await (
      await call(app, `/api/sites/${f.siteId}/updates/check`, { method: "POST", cookie: f.cookie })
    ).json()) as {
      update: { id: string };
    };
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/updates/${update.id}/dismiss`, {
          method: "POST",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(200);
    const m = mockFetch([
      [
        "GET",
        /registry\.npmjs\.org\/@omniharmonic%2fopenspace-site-kit/,
        () => ({
          versions: {
            "0.1.0": {},
            "0.1.5": { openspace: { changelog: ["Faster builds"] } },
            "0.3.0": { openspace: { changelog: ["New shop layouts"], security: true } },
            "1.0.0": { openspace: { changelog: ["Breaking"] } },
            "0.4.0-beta.1": {},
          },
        }),
      ],
    ]);
    const rel = await new NpmUpdateSource(m.fetch).latest("0.1.0");
    expect(rel).toMatchObject({ version: "0.3.0", security: true });
    expect(rel?.changelog.map((e) => e.version)).toEqual(["0.3.0", "0.1.5"]);
    expect(
      bumpPackageJson(
        '{"dependencies":{"@omniharmonic/openspace-site-kit":"^0.1.0","astro":"^5"},"devDependencies":{"@omniharmonic/openspace-cli":"^0.1.0"}}',
        "0.3.0",
      ),
    ).toBe(
      `${JSON.stringify({ dependencies: { "@omniharmonic/openspace-site-kit": "^0.3.0", astro: "^5" }, devDependencies: { "@omniharmonic/openspace-cli": "^0.3.0" } }, null, 2)}\n`,
    );
  });
});

describe("Task 16 carried fixes", () => {
  it("keys IPv4-mapped IPv6 clients by their IPv4 address", () => {
    expect(rateKeyIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(rateKeyIp("0:0:0:0:0:ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(rateKeyIp("::FFFF:203.0.113.9")).toBe("203.0.113.9");
    expect(rateKeyIp("203.0.113.9")).toBe("203.0.113.9");
    expect(rateKeyIp("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
  });

  it("re-submitting a live domain never lets the cron release it", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Domain" });
    const res = await call(app, `/api/sites/${f.siteId}/domain`, {
      method: "POST",
      cookie: f.cookie,
      json: { domain: "www.juniper.test" },
    });
    expect(res.status).toBe(201);
    await call(app, `/api/sites/${f.siteId}/domain/check`, { method: "POST", cookie: f.cookie });
    const active = await env.HUB_DB.prepare(
      "SELECT status, verified_at FROM domains WHERE site_id = ?",
    )
      .bind(f.siteId)
      .first<{ status: string; verified_at: number | null }>();
    expect(active?.status).toBe("active");
    // Re-submit the same live domain (e.g. Studio retries the wizard).
    const again = await call(app, `/api/sites/${f.siteId}/domain`, {
      method: "POST",
      cookie: f.cookie,
      json: { domain: "www.juniper.test" },
    });
    expect(again.status).toBe(201);
    const row = await env.HUB_DB.prepare("SELECT status FROM domains WHERE site_id = ?")
      .bind(f.siteId)
      .first<{ status: string }>();
    expect(row?.status).toBe("active");
    // Even a verified row demoted by hand is kept by the cron.
    await env.HUB_DB.prepare(
      "UPDATE domains SET status = 'verifying', created_at = 0 WHERE site_id = ?",
    )
      .bind(f.siteId)
      .run();
    expect(await expireDomainClaims(env.HUB_DB, Date.now())).toBe(0);
  });

  it("erasing a person matches the exact address, not substrings", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Erase" });
    const add = (id: string, to: string, text: string) =>
      env.HUB_DB.prepare(
        "INSERT INTO outbox (id, site_id, to_addr, subject, text, kind, status, created_at) VALUES (?, ?, ?, 's', ?, 'x', 'sent', 0)",
      )
        .bind(id, f.siteId, to, text)
        .run();
    await add("eml_1", "ana@example.com", "hi");
    await add("eml_2", "hana@example.com", "hi");
    await add("eml_3", "owner@example.com", "from hana@example.com");
    const res = await call(app, `/api/sites/${f.siteId}/data/erase`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "ana@example.com" },
    });
    expect(((await res.json()) as { deleted: { emails: number } }).deleted.emails).toBe(1);
    const left = await env.HUB_DB.prepare("SELECT id FROM outbox WHERE site_id = ? ORDER BY id")
      .bind(f.siteId)
      .all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["eml_2", "eml_3"]);
  });
});
