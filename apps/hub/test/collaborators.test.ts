import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { bytesToBase64, toHex } from "../src/lib/crypto";
import { runScheduled } from "../src/scheduled";
import { TRANSFER_TTL_MS } from "../src/services/sites";
import { call, devLogin } from "./helpers";
import { setup, userId } from "./room-helpers";

describe("collaborators", () => {
  it("invites by GitHub login, accepts, lists, changes role and locks, removes", async () => {
    const { app, owner, site } = await setup();
    const ana = await devLogin(app, "Ana Ruiz");
    const anaId = await userId(app, ana);

    const inv = await call(app, `/api/sites/${site.id}/collaborators`, {
      method: "POST",
      cookie: owner,
      json: { login: "ana-ruiz", role: "editor" },
    });
    expect(inv.status).toBe(201);
    const { invitation, acceptUrl } = (await inv.json()) as {
      invitation: { id: string; role: string; login: string };
      acceptUrl: string;
    };
    expect(invitation).toMatchObject({ role: "editor", login: "ana-ruiz" });
    expect(acceptUrl).toMatch(/^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]+$/);
    const token = acceptUrl.split("/").pop() as string;

    // Preview without signing in.
    const preview = await call(app, `/api/invitations/${token}`);
    expect(await preview.json()).toMatchObject({
      siteName: "Room Site",
      role: "editor",
      invitedBy: "Maya Lin",
      status: "pending",
    });
    // Someone else can't use a login-bound invitation.
    const bob = await devLogin(app, "Bob Smith");
    expect(
      (await call(app, `/api/invitations/${token}/accept`, { method: "POST", cookie: bob })).status,
    ).toBe(403);

    const accepted = await call(app, `/api/invitations/${token}/accept`, {
      method: "POST",
      cookie: ana,
    });
    expect(await accepted.json()).toMatchObject({ siteId: site.id, role: "editor" });
    // Single use.
    expect(
      (await call(app, `/api/invitations/${token}/accept`, { method: "POST", cookie: ana })).status,
    ).toBe(410);
    // Repo write access was granted (dev emulation records it).
    const collab = await env.HUB_DB.prepare(
      "SELECT permission FROM dev_collaborators WHERE repo = ? AND login = ?",
    )
      .bind("maya-lin/room-site", "ana-ruiz")
      .first<{ permission: string }>();
    expect(collab?.permission).toBe("push");
    // Ana now sees the site with her role.
    expect(await (await call(app, `/api/sites/${site.id}`, { cookie: ana })).json()).toMatchObject({
      role: "editor",
    });

    const list = (await (
      await call(app, `/api/sites/${site.id}/collaborators`, { cookie: owner })
    ).json()) as {
      collaborators: Array<{ login: string; role: string }>;
      invitations: unknown[];
    };
    expect(list.collaborators.map((c) => [c.login, c.role])).toEqual([
      ["maya-lin", "owner"],
      ["ana-ruiz", "editor"],
    ]);
    expect(list.invitations).toEqual([]);

    // Editors can't manage people.
    expect(
      (
        await call(app, `/api/sites/${site.id}/collaborators`, {
          method: "POST",
          cookie: ana,
          json: { email: "x@example.com", role: "editor" },
        })
      ).status,
    ).toBe(403);

    const patched = await call(app, `/api/sites/${site.id}/collaborators/${anaId}`, {
      method: "PATCH",
      cookie: owner,
      json: { role: "designer", lockedSections: ["sec_82grb86199"] },
    });
    expect(await patched.json()).toMatchObject({
      role: "designer",
      lockedSections: ["sec_82grb86199"],
    });
    // Nobody can be made owner by invitation/patch; the owner can't be removed.
    expect(
      (
        await call(app, `/api/sites/${site.id}/collaborators/${anaId}`, {
          method: "PATCH",
          cookie: owner,
          json: { role: "owner" },
        })
      ).status,
    ).toBe(400);
    const mayaId = await userId(app, owner);
    expect(
      (
        await call(app, `/api/sites/${site.id}/collaborators/${mayaId}`, {
          method: "DELETE",
          cookie: owner,
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await call(app, `/api/sites/${site.id}/collaborators/${anaId}`, {
          method: "DELETE",
          cookie: owner,
        })
      ).status,
    ).toBe(200);
    expect((await call(app, `/api/sites/${site.id}`, { cookie: ana })).status).toBe(404);
    expect(
      await env.HUB_DB.prepare("SELECT 1 FROM dev_collaborators WHERE login = 'ana-ruiz'").first(),
    ).toBeNull();
  });

  it("invites by email (queued mail), revokes and expires invitations", async () => {
    const { app, owner, site } = await setup();
    const res = await call(app, `/api/sites/${site.id}/collaborators`, {
      method: "POST",
      cookie: owner,
      json: { email: "Client@Example.com", role: "contributor" },
    });
    const { invitation, acceptUrl } = (await res.json()) as {
      invitation: { id: string; email: string };
      acceptUrl: string;
    };
    expect(invitation.email).toBe("client@example.com");
    const mail = await env.HUB_DB.prepare(
      "SELECT to_addr, subject, text FROM outbox WHERE kind = 'invitation'",
    ).first<{
      to_addr: string;
      subject: string;
      text: string;
    }>();
    expect(mail).toMatchObject({
      to_addr: "client@example.com",
      subject: "Maya Lin invited you to work on Room Site",
    });
    expect(mail?.text).toContain(acceptUrl);

    // Designers can't hand out more than they have; bad input is refused.
    expect(
      (
        await call(app, `/api/sites/${site.id}/collaborators`, {
          method: "POST",
          cookie: owner,
          json: { role: "editor" },
        })
      ).status,
    ).toBe(400);

    const list = (await (
      await call(app, `/api/sites/${site.id}/collaborators`, { cookie: owner })
    ).json()) as {
      invitations: Array<{ id: string }>;
    };
    expect(list.invitations.map((i) => i.id)).toEqual([invitation.id]);
    expect(
      (
        await call(app, `/api/sites/${site.id}/invitations/${invitation.id}`, {
          method: "DELETE",
          cookie: owner,
        })
      ).status,
    ).toBe(200);
    const token = acceptUrl.split("/").pop() as string;
    const someone = await devLogin(app, "Client Person");
    expect(
      (await call(app, `/api/invitations/${token}/accept`, { method: "POST", cookie: someone }))
        .status,
    ).toBe(410);

    // Expiry: a second invitation past its date can't be accepted; the cron marks it expired.
    const res2 = await call(app, `/api/sites/${site.id}/collaborators`, {
      method: "POST",
      cookie: owner,
      json: { email: "late@example.com", role: "editor" },
    });
    const late = (await res2.json()) as { invitation: { id: string }; acceptUrl: string };
    await env.HUB_DB.prepare("UPDATE invitations SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1, late.invitation.id)
      .run();
    await runScheduled(env, Date.now());
    const row = await env.HUB_DB.prepare("SELECT status FROM invitations WHERE id = ?")
      .bind(late.invitation.id)
      .first<{ status: string }>();
    expect(row?.status).toBe("expired");
    const token2 = late.acceptUrl.split("/").pop() as string;
    const r = await call(app, `/api/invitations/${token2}/accept`, {
      method: "POST",
      cookie: someone,
    });
    expect(r.status).toBe(410);
  });
});

describe("ownership transfer (pending)", () => {
  async function pendingTransfer(requestedAt: number) {
    const { app, owner, site } = await setup();
    const client = await devLogin(app, "Dev Client");
    await env.HUB_DB.prepare(
      "UPDATE sites SET transfer_to = 'dev-client', transfer_requested_at = ? WHERE id = ?",
    )
      .bind(requestedAt, site.id)
      .run();
    return { app, owner, site, client };
  }

  it("can be cancelled by the owner", async () => {
    const { app, owner, site, client } = await pendingTransfer(Date.now());
    expect(
      (await call(app, `/api/sites/${site.id}/transfer`, { method: "DELETE", cookie: client }))
        .status,
    ).toBe(404);
    const res = await call(app, `/api/sites/${site.id}/transfer`, {
      method: "DELETE",
      cookie: owner,
    });
    expect(await res.json()).toMatchObject({ transfer: null, role: "owner" });
    expect(
      (await call(app, `/api/sites/${site.id}/transfer`, { method: "DELETE", cookie: owner }))
        .status,
    ).toBe(409);
  });

  it(`expires after ${TRANSFER_TTL_MS / 86400_000} days (status poll and cron)`, async () => {
    const { app, owner, site } = await pendingTransfer(Date.now() - TRANSFER_TTL_MS - 1000);
    expect(
      await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json(),
    ).toMatchObject({
      transfer: null,
    });
    const audit = await env.HUB_DB.prepare(
      "SELECT action FROM audit_log WHERE site_id = ? AND action LIKE 'site.transfer.%'",
    )
      .bind(site.id)
      .all<{ action: string }>();
    expect(audit.results.map((a) => a.action)).toContain("site.transfer.expired");

    await env.HUB_DB.prepare(
      "UPDATE sites SET transfer_to = 'dev-client', transfer_requested_at = ? WHERE id = ?",
    )
      .bind(Date.now() - TRANSFER_TTL_MS - 1000, site.id)
      .run();
    await runScheduled(env, Date.now());
    const row = await env.HUB_DB.prepare("SELECT transfer_to FROM sites WHERE id = ?")
      .bind(site.id)
      .first();
    expect(row).toEqual({ transfer_to: null });
  });

  it("completes from the repository.transferred webhook", async () => {
    const { app, site } = await pendingTransfer(Date.now());
    const secret = ["whsec", "transfer"].join("_");
    const body = JSON.stringify({
      action: "transferred",
      repository: {
        name: "room-site",
        full_name: "dev-client/room-site",
        owner: { login: "dev-client" },
      },
      changes: { owner: { from: { user: { login: "maya-lin" } } } },
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = `sha256=${toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
    const res = await call(
      app,
      "/webhooks/github",
      {
        method: "POST",
        body,
        headers: { "x-github-event": "repository", "x-hub-signature-256": sig },
      },
      { ...(env as unknown as Record<string, unknown>), GITHUB_WEBHOOK_SECRET: secret },
    );
    expect(await res.json()).toMatchObject({ result: "transferred" });
    const row = await env.HUB_DB.prepare("SELECT repo, transfer_to FROM sites WHERE id = ?")
      .bind(site.id)
      .first();
    expect(row).toEqual({ repo: "dev-client/room-site", transfer_to: null });
  });
});

describe("setup assets", () => {
  it("deletes the setup logo from storage once the site is set up, and purges archived sites", async () => {
    const { app, owner } = await setup();
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
      4, 0, 0, 0, 4,
    ]);
    const res = await call(app, "/api/sites", {
      method: "POST",
      cookie: owner,
      json: {
        template: "basic",
        name: "Logo Site",
        logo: `data:image/png;base64,${bytesToBase64(png)}`,
      },
    });
    const site = (await res.json()) as { id: string; status: string };
    expect(site.status).toBe("live");
    const left = await env.UPLOADS.list({ prefix: `site-setup/${site.id}/` });
    expect(left.objects).toHaveLength(0);
    // The logo made it into the site.
    const files = await new DevGitHubAccess(env.HUB_DB).readFiles(
      { owner: "maya-lin", name: "logo-site" },
      "main",
    );
    expect(Object.values(files)).toContain(bytesToBase64(png));

    // Purge: an archived site past its retention is removed.
    await env.UPLOADS.put(`site-setup/${site.id}/logo`, png);
    await env.HUB_DB.prepare("UPDATE sites SET archived_at = ?, purge_at = ? WHERE id = ?")
      .bind(Date.now() - 1000, Date.now() - 1, site.id)
      .run();
    await runScheduled(env, Date.now());
    expect((await env.UPLOADS.list({ prefix: `site-setup/${site.id}/` })).objects).toHaveLength(0);
    expect(
      await env.HUB_DB.prepare("SELECT 1 FROM sites WHERE id = ?").bind(site.id).first(),
    ).toBeNull();
  });
});
