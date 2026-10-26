import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { DevGitHubAccess } from "../src/github/dev";
import { call, devLogin } from "./helpers";
import { STUDIO_ORIGIN } from "./mcp-helpers";
import { createSite, op } from "./room-helpers";

const runs = async (repo: string) =>
  (
    await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM dev_workflow_runs WHERE repo = ?")
      .bind(repo)
      .first<{ n: number }>()
  )?.n ?? 0;

describe("Cloudflare Worker secrets", () => {
  it("the Hub creates the session key on the switch, keeps page passwords in sync and rebuilds on changes", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Ines Ward");
    const site = await createSite(app, owner, "Secret Site");
    const repo = { owner: "ines-ward", name: "secret-site" };
    const gh = new DevGitHubAccess(env.HUB_DB);
    for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"])
      await gh.setSecret(repo, name, "x");
    const post = (path: string, init: Parameters<typeof call>[2]) =>
      call(app, `/api/sites/${site.id}${path}`, {
        cookie: owner,
        headers: { Origin: STUDIO_ORIGIN },
        ...init,
      });
    expect(await gh.listSecretNames(repo)).not.toContain("OS_SESSION_SECRET");
    const sw = await post("/hosting", { method: "POST", json: { target: "cloudflare" } });
    expect(sw.status).toBe(200);
    const names = await gh.listSecretNames(repo);
    expect(names).toContain("OS_SESSION_SECRET");
    expect(names).toContain("OS_PAGE_PASSWORDS");
    const sessionSet = await env.HUB_DB.prepare(
      "SELECT updated_at FROM dev_secrets WHERE repo = ? AND name = 'OS_SESSION_SECRET'",
    )
      .bind("ines-ward/secret-site")
      .first<{ updated_at: number }>();

    // A password change rewrites OS_PAGE_PASSWORDS and starts a publish of the live site.
    const before = await runs("ines-ward/secret-site");
    const pageId = "pg_secretpg01";
    const pw = await post(`/page-passwords/${pageId}`, {
      method: "PUT",
      json: { password: "lotus-flower" },
    });
    expect(pw.status).toBe(200);
    expect(await runs("ines-ward/secret-site")).toBe(before + 1);

    // Publishing a document where that page isn't password-protected drops its password.
    await post("/room/ops", {
      method: "POST",
      json: {
        ops: [
          op({
            op: "page.create",
            page: { id: pageId, title: "Notes", slug: "notes", sections: [] },
          }),
        ],
      },
    });
    expect((await post("/publish", { method: "POST" })).status).toBe(200);
    const left = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM page_passwords WHERE site_id = ?",
    )
      .bind(site.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
    // The session key is generated once, never rotated by a publish.
    const sessionAfter = await env.HUB_DB.prepare(
      "SELECT updated_at FROM dev_secrets WHERE repo = ? AND name = 'OS_SESSION_SECRET'",
    )
      .bind("ines-ward/secret-site")
      .first<{ updated_at: number }>();
    expect(sessionAfter?.updated_at).toBe(sessionSet?.updated_at);
  });
});

describe("rollback to a version with a password page that has no password", () => {
  it("names the pages nobody can open until a password is set", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Uma Reyes");
    const site = await createSite(app, owner, "Rollback Pw");
    const post = (path: string, json?: unknown) =>
      call(app, `/api/sites/${site.id}${path}`, {
        method: "POST",
        cookie: owner,
        headers: { Origin: STUDIO_ORIGIN },
        ...(json === undefined ? {} : { json }),
      });
    const pageId = "pg_rbpwpage01";
    await post("/room/ops", {
      ops: [
        op({
          op: "page.create",
          page: {
            id: pageId,
            title: "Retreat",
            slug: "retreat",
            access: { password: true },
            sections: [],
          },
        }),
      ],
    });
    const v2 = (await (await post("/publish")).json()) as { publish: { sha: string } };
    await post("/room/ops", {
      ops: [op({ op: "page.update", page: pageId, unset: ["access"] })],
    });
    expect((await post("/publish")).status).toBe(200);
    const res = await post("/rollback", { sha: v2.publish.sha });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pagesWithoutPassword: unknown }).pagesWithoutPassword).toEqual([
      { id: pageId, title: "Retreat" },
    ]);
  });
});
