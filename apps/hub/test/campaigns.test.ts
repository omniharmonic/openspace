import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { consumeCampaignBatch } from "../src/cron/growth";
import type { CampaignJob } from "../src/growth-env";
import { randomId } from "../src/lib/crypto";
import { runScheduled } from "../src/scheduled";
import {
  checkSenderDns,
  snsStringToSign,
  spkiFromCertificate,
  verifySns,
  verifySvix,
} from "../src/services/senders";
import { makeGrowthApp } from "./growth-helpers";
import { call, type TestApp } from "./helpers";
import { type SiteFixture, siteWithForm } from "./public-helpers";

/** An https Hub (RFC 8058 needs https URLs); DEV_MODE stays on via ALLOW_DEV_MODE. */
const HTTPS = {
  ...(env as unknown as Record<string, unknown>),
  HUB_URL: "https://hub.test",
  ALLOW_DEV_MODE: "true",
};

const text = (id: string, t: string) => ({
  id,
  type: "text",
  v: 1,
  fields: {
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
    },
  },
});
const BODY = {
  blocks: [
    { id: "blk_head000001", type: "heading", v: 1, fields: { text: "Autumn retreat", level: 1 } },
    text("blk_text000001", "Three quiet days by the lake. Places are limited."),
    {
      id: "blk_btn0000001",
      type: "button",
      v: 1,
      fields: {
        label: "Reserve a place",
        link: { type: "url", url: "https://juniper.example/retreats?from=mail" },
      },
    },
  ],
};

async function addSubscriber(siteId: string, email: string, status: string, tags: string[]) {
  const id = randomId("sub");
  await env.HUB_DB.prepare(
    "INSERT INTO subscribers (id, site_id, email, status, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, siteId, email, status, JSON.stringify(tags), Date.now())
    .run();
  return id;
}

async function campaignSite(app: TestApp): Promise<SiteFixture> {
  const f = await siteWithForm(app, { form: null, name: "Juniper Letters" });
  await addSubscriber(f.siteId, "ana@example.com", "confirmed", ["retreats"]);
  await addSubscriber(f.siteId, "lee@example.com", "confirmed", ["retreats", "classes"]);
  await addSubscriber(f.siteId, "sam@example.com", "confirmed", ["classes"]);
  await addSubscriber(f.siteId, "pat@example.com", "pending", ["retreats"]);
  await addSubscriber(f.siteId, "kim@example.com", "unsubscribed", ["retreats"]);
  return f;
}

async function mails(siteId: string, kind = "campaign") {
  const rows = await env.HUB_DB.prepare(
    "SELECT to_addr, subject, html, text, headers_json FROM outbox WHERE site_id = ? AND kind = ? ORDER BY to_addr",
  )
    .bind(siteId, kind)
    .all<{
      to_addr: string;
      subject: string;
      html: string;
      text: string;
      headers_json: string | null;
    }>();
  return rows.results.map((r) => ({
    ...r,
    headers: JSON.parse(r.headers_json ?? "{}") as Record<string, string>,
  }));
}

async function createCampaign(app: TestApp, f: SiteFixture, extra: Record<string, unknown> = {}) {
  const res = await call(
    app,
    `/api/sites/${f.siteId}/campaigns`,
    {
      method: "POST",
      cookie: f.cookie,
      json: {
        subject: "Autumn retreat",
        preheader: "Three quiet days",
        body: BODY,
        segment: { tags: ["retreats"] },
        ...extra,
      },
    },
    HTTPS,
  );
  if (res.status !== 201) throw new Error(`create ${res.status} ${await res.text()}`);
  return ((await res.json()) as { campaign: { id: string } }).campaign.id;
}

describe("campaigns", () => {
  it("sends to the tag segment only, with RFC 8058 one-click unsubscribe", async () => {
    const app = makeGrowthApp();
    const f = await campaignSite(app);
    const id = await createCampaign(app, f);
    const count = await call(app, `/api/sites/${f.siteId}/segments/count?tag=retreats`, {
      cookie: f.cookie,
    });
    expect(await count.json()).toEqual({ count: 2 });
    const preview = await call(app, `/api/sites/${f.siteId}/campaigns/${id}/preview`, {
      method: "POST",
      cookie: f.cookie,
    });
    const pv = (await preview.json()) as { html: string; recipients: number };
    expect(pv.recipients).toBe(2);
    expect(pv.html).toContain("Three quiet days by the lake");
    const sent = await call(
      app,
      `/api/sites/${f.siteId}/campaigns/${id}/send`,
      { method: "POST", cookie: f.cookie },
      HTTPS,
    );
    expect(sent.status).toBe(202);
    expect(
      ((await sent.json()) as { campaign: { status: string; recipients: number } }).campaign,
    ).toMatchObject({
      status: "sent",
      recipients: 2,
    });
    const out = await mails(f.siteId);
    expect(out.map((m) => m.to_addr)).toEqual(["ana@example.com", "lee@example.com"]);
    for (const m of out) {
      expect(m.subject).toBe("Autumn retreat");
      expect(m.headers["List-Unsubscribe"]).toMatch(
        /^<https:\/\/hub\.test\/n\/unsubscribe\/sub_[0-9a-z]+\.[A-Za-z0-9_-]+>$/,
      );
      expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(m.html).toContain(m.headers["List-Unsubscribe"]?.slice(1, -1));
      expect(m.html).not.toContain("{{os_");
      expect(m.text).not.toContain("{{os_");
      // Links go through the tracker; no open pixel unless asked for.
      expect(m.html).toMatch(
        /href="https:\/\/hub\.test\/e\/c\/rcp_[0-9a-f]+\.[A-Za-z0-9_-]{22}\/0"/,
      );
      expect(m.html).not.toContain("juniper.example/retreats");
      expect(m.html).not.toContain("/e/o/");
    }
    // Sending again is refused; stats are kept.
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/campaigns/${id}/send`, {
          method: "POST",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/campaigns/${id}`, {
          method: "DELETE",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(409);

    // One-click unsubscribe from the header URL works (POST, as mail clients do).
    const unsub = new URL(out[0]?.headers["List-Unsubscribe"]?.slice(1, -1) as string);
    const u = await call(app, unsub.pathname, { method: "POST" }, HTTPS);
    expect(u.status).toBe(200);
    const st = await env.HUB_DB.prepare(
      "SELECT status FROM subscribers WHERE site_id = ? AND email = 'ana@example.com'",
    )
      .bind(f.siteId)
      .first<{ status: string }>();
    expect(st?.status).toBe("unsubscribed");
  });

  it("tracks clicks only to links in the campaign (no open redirect)", async () => {
    const app = makeGrowthApp();
    const f = await campaignSite(app);
    const id = await createCampaign(app, f, { trackOpens: true });
    await call(
      app,
      `/api/sites/${f.siteId}/campaigns/${id}/send`,
      { method: "POST", cookie: f.cookie },
      HTTPS,
    );
    const [m] = await mails(f.siteId);
    const link = m?.html.match(/https:\/\/hub\.test\/(e\/c\/[^"]+)/)?.[1] as string;
    const click = await call(app, `/${link}`, { redirect: "manual" }, HTTPS);
    expect(click.status).toBe(302);
    expect(click.headers.get("location")).toBe("https://juniper.example/retreats?from=mail");
    const [, , token] = link.split("/");
    for (const bad of [
      `/e/c/${token}/7`,
      `/e/c/${token}/-1`,
      `/e/c/${token}/x`,
      `/e/c/${(token as string).slice(0, -2)}AA/0`,
      "/e/c/rcp_00.AAAAAAAAAAAAAAAAAAAAAA/0",
    ]) {
      const r = await call(app, bad, { redirect: "manual" }, HTTPS);
      expect(r.status).toBe(404);
      expect(r.headers.get("location")).toBeNull();
    }
    const pixel = m?.html.match(/https:\/\/hub\.test(\/e\/o\/[^"]+)/)?.[1] as string;
    const gif = await call(app, pixel, {}, HTTPS);
    expect(gif.headers.get("content-type")).toBe("image/gif");
    const stats = (await (
      await call(app, `/api/sites/${f.siteId}/campaigns/${id}/stats`, { cookie: f.cookie })
    ).json()) as {
      stats: {
        sent: number;
        opened: number;
        clicked: number;
        links: Array<{ url: string; clicks: number }>;
      };
    };
    expect(stats.stats).toMatchObject({ sent: 2, opened: 1, clicked: 1 });
    expect(stats.stats.links).toEqual([
      { url: "https://juniper.example/retreats?from=mail", clicks: 1, uniqueClicks: 1 },
    ]);
  });

  it("schedules through the minute cron", async () => {
    const app = makeGrowthApp();
    const f = await campaignSite(app);
    const id = await createCampaign(app, f, {
      segment: { tags: ["retreats", "classes"], match: "all" },
    });
    const soon = await call(app, `/api/sites/${f.siteId}/campaigns/${id}/schedule`, {
      method: "POST",
      cookie: f.cookie,
      json: { sendAt: new Date(Date.now() + 5_000).toISOString() },
    });
    expect(soon.status).toBe(422);
    const sendAt = Date.now() + 10 * 60_000;
    const ok = await call(app, `/api/sites/${f.siteId}/campaigns/${id}/schedule`, {
      method: "POST",
      cookie: f.cookie,
      json: { sendAt: new Date(sendAt).toISOString() },
    });
    expect(((await ok.json()) as { campaign: { status: string } }).campaign.status).toBe(
      "scheduled",
    );
    // Not editable while scheduled.
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/campaigns/${id}`, {
          method: "PATCH",
          cookie: f.cookie,
          json: { subject: "x" },
        })
      ).status,
    ).toBe(409);
    await runScheduled(env, Date.now());
    expect(await mails(f.siteId)).toHaveLength(0);
    await runScheduled(env, sendAt + 1000);
    const out = await mails(f.siteId);
    expect(out.map((m) => m.to_addr)).toEqual(["lee@example.com"]);
    const view = (await (
      await call(app, `/api/sites/${f.siteId}/campaigns/${id}`, { cookie: f.cookie })
    ).json()) as {
      campaign: { status: string };
    };
    expect(view.campaign.status).toBe("sent");
  });

  it("fans out through the Queue when one is bound", async () => {
    const jobs: CampaignJob[] = [];
    const queue = { send: async (j: CampaignJob) => void jobs.push(j) };
    const app = makeGrowthApp({ growth: { queue } });
    const f = await campaignSite(app);
    const id = await createCampaign(app, f);
    const res = await call(app, `/api/sites/${f.siteId}/campaigns/${id}/send`, {
      method: "POST",
      cookie: f.cookie,
    });
    expect(((await res.json()) as { campaign: { status: string } }).campaign.status).toBe(
      "sending",
    );
    expect(jobs).toEqual([{ kind: "campaign-batch", campaignId: id, siteId: f.siteId }]);
    expect(await mails(f.siteId)).toHaveLength(0);
    const acked: string[] = [];
    await consumeCampaignBatch(
      {
        queue: "openspace-campaigns",
        messages: jobs.map((body, i) => ({
          id: String(i),
          body,
          timestamp: new Date(),
          attempts: 1,
          ack: () => acked.push(String(i)),
          retry: () => undefined,
        })),
      } as unknown as MessageBatch<CampaignJob>,
      env,
      { growth: { queue } },
    );
    expect(acked).toEqual(["0"]);
    expect(await mails(f.siteId)).toHaveLength(2);
  });

  it("connects owner senders without exposing credentials and checks SPF/DKIM/DMARC", async () => {
    const app = makeGrowthApp();
    const f = await campaignSite(app);
    const apiKey = ["re", "live", "abcdefghijklmnopqrstuv"].join("_");
    const res = await call(app, `/api/sites/${f.siteId}/senders`, {
      method: "POST",
      cookie: f.cookie,
      json: {
        provider: "resend",
        fromEmail: "Letters@Juniper.test",
        fromName: "Juniper",
        credentials: { apiKey },
        webhookSecret: `whsec_${btoa("resend-webhook-signing-key")}`,
      },
    });
    expect(res.status).toBe(201);
    const { sender } = (await res.json()) as {
      sender: { id: string; status: string; webhookUrl: string };
    };
    expect(sender.status).toBe("unverified");
    const list = await (
      await call(app, `/api/sites/${f.siteId}/senders`, { cookie: f.cookie })
    ).text();
    expect(list).not.toContain(apiKey);
    const row = await env.HUB_DB.prepare(
      "SELECT credentials_enc FROM sender_connections WHERE id = ?",
    )
      .bind(sender.id)
      .first<{ credentials_enc: string }>();
    expect(row?.credentials_enc).not.toContain(apiKey);
    const verified = await call(app, `/api/sites/${f.siteId}/senders/${sender.id}/verify`, {
      method: "POST",
      cookie: f.cookie,
    });
    const v = (await verified.json()) as {
      sender: { status: string; checks: Array<{ id: string; ok: boolean; name: string }> };
    };
    expect(v.sender.status).toBe("verified");
    expect(v.sender.checks.map((c) => [c.id, c.ok, c.name])).toEqual([
      ["spf", true, "send.juniper.test"],
      ["dkim", true, "resend._domainkey.juniper.test"],
      ["dmarc", true, "_dmarc.juniper.test"],
    ]);
    // Only owners connect senders.
    expect(
      (
        await call(app, `/api/sites/${f.siteId}/senders`, {
          method: "POST",
          json: { provider: "dev", fromEmail: "a@b.test" },
        })
      ).status,
    ).toBe(401);
  });

  it("reports failing DNS with hints", async () => {
    const records: Record<string, string[]> = {
      "TXT example.org": ["v=spf1 include:_spf.google.com ~all"],
      "TXT _dmarc.example.org": [],
    };
    const dns = { resolve: async (n: string, t: string) => records[`${t} ${n}`] ?? [] };
    const checks = await checkSenderDns(dns, "ses", "example.org", null);
    expect(checks.map((c) => [c.id, c.ok])).toEqual([
      ["spf", false],
      ["dkim", false],
      ["dmarc", false],
    ]);
    expect(checks[0]?.hint).toContain("include:amazonses.com");
    expect(checks[1]?.hint).toContain("selector");
  });

  it("handles bounce and complaint webhooks with per-provider authentication", async () => {
    const app = makeGrowthApp();
    const f = await campaignSite(app);
    const secret = `whsec_${btoa("resend-webhook-signing-key")}`;
    const resend = (await (
      await call(app, `/api/sites/${f.siteId}/senders`, {
        method: "POST",
        cookie: f.cookie,
        json: {
          provider: "resend",
          fromEmail: "letters@juniper.test",
          credentials: { apiKey: "key-1234567890" },
          webhookSecret: secret,
        },
      })
    ).json()) as { sender: { id: string } };
    await call(app, `/api/sites/${f.siteId}/senders/${resend.sender.id}/verify`, {
      method: "POST",
      cookie: f.cookie,
    });
    const id = await createCampaign(app, f, { senderId: resend.sender.id });
    await call(app, `/api/sites/${f.siteId}/campaigns/${id}/send`, {
      method: "POST",
      cookie: f.cookie,
    });
    const rc = await env.HUB_DB.prepare(
      "SELECT message_id FROM campaign_recipients WHERE campaign_id = ? AND email = 'lee@example.com'",
    )
      .bind(id)
      .first<{ message_id: string }>();
    const body = JSON.stringify({
      type: "email.bounced",
      data: { email_id: rc?.message_id, to: ["lee@example.com"], bounce: { type: "Permanent" } },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
    const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`msg_1.${ts}.${body}`)),
    );
    const sig = `v1,${btoa(String.fromCharCode(...mac))}`;
    const post = (headers: Record<string, string>, b = body) =>
      call(app, `/e/webhooks/resend/${resend.sender.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: b,
      });
    expect(
      (await post({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": "v1,AAAA" }))
        .status,
    ).toBe(401);
    expect(
      (await post({ "svix-id": "msg_2", "svix-timestamp": ts, "svix-signature": sig })).status,
    ).toBe(401);
    expect(
      (
        await post(
          { "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": sig },
          body.replace("lee", "ana"),
        )
      ).status,
    ).toBe(401);
    const ok = await post({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": sig });
    expect(await ok.json()).toEqual({ ok: true, recorded: 1 });
    const lee = await env.HUB_DB.prepare(
      "SELECT status, suppressed_reason FROM subscribers WHERE site_id = ? AND email = 'lee@example.com'",
    )
      .bind(f.siteId)
      .first<{ status: string; suppressed_reason: string }>();
    expect(lee).toEqual({ status: "unsubscribed", suppressed_reason: "bounce" });
    const stats = (await (
      await call(app, `/api/sites/${f.siteId}/campaigns/${id}/stats`, { cookie: f.cookie })
    ).json()) as {
      stats: { bounced: number };
    };
    expect(stats.stats.bounced).toBe(1);

    // Postmark: Hub-minted token (shown once in the webhook URL).
    const pm = (await (
      await call(app, `/api/sites/${f.siteId}/senders`, {
        method: "POST",
        cookie: f.cookie,
        json: {
          provider: "postmark",
          fromEmail: "letters@juniper.test",
          credentials: { serverToken: "pm-token-123456" },
        },
      })
    ).json()) as { sender: { id: string; webhookUrl: string } };
    const hook = new URL(pm.sender.webhookUrl);
    const complaint = JSON.stringify({
      RecordType: "SpamComplaint",
      Email: "ana@example.com",
      MessageID: "x",
    });
    const noToken = await call(app, hook.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: complaint,
    });
    expect(noToken.status).toBe(401);
    const withToken = await call(app, `${hook.pathname}${hook.search}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: complaint,
    });
    expect(await withToken.json()).toEqual({ ok: true, recorded: 1 });
    const ana = await env.HUB_DB.prepare(
      "SELECT suppressed_reason FROM subscribers WHERE site_id = ? AND email = 'ana@example.com'",
    )
      .bind(f.siteId)
      .first<{ suppressed_reason: string }>();
    expect(ana?.suppressed_reason).toBe("complaint");
    // Basic auth works too; listing senders never shows the token again.
    const basic = await call(app, hook.pathname, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`openspace:${hook.searchParams.get("token")}`)}`,
      },
      body: complaint,
    });
    expect(basic.status).toBe(200);
    const listed = await (
      await call(app, `/api/sites/${f.siteId}/senders`, { cookie: f.cookie })
    ).text();
    expect(listed).not.toContain(hook.searchParams.get("token") as string);
  });
});

describe("webhook signature primitives", () => {
  it("verifies Svix signatures with tolerance", async () => {
    const secret = `whsec_${btoa("k")}`;
    const now = 1_800_000_000;
    const k = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("k"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = new Uint8Array(
      await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`id.${now}.{}`)),
    );
    const sig = `v1,${btoa(String.fromCharCode(...mac))}`;
    expect(
      await verifySvix(
        secret,
        { id: "id", timestamp: String(now), signature: `v1,bad ${sig}` },
        "{}",
        now,
      ),
    ).toBe(true);
    expect(
      await verifySvix(
        secret,
        { id: "id", timestamp: String(now), signature: sig },
        "{}",
        now + 301,
      ),
    ).toBe(false);
  });

  it("verifies SNS (SES) signatures against the signing certificate's key", async () => {
    const pair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const spki = new Uint8Array(
      (await crypto.subtle.exportKey("spki", pair.publicKey)) as ArrayBuffer,
    );
    const tlv = (tag: number, content: Uint8Array) => {
      const len = content.length;
      const head = len < 0x80 ? [len] : len < 0x100 ? [0x81, len] : [0x82, len >> 8, len & 0xff];
      return new Uint8Array([tag, ...head, ...content]);
    };
    const cat = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap((p) => [...p]));
    const empty = new Uint8Array(0);
    const tbs = tlv(
      0x30,
      cat(
        tlv(0xa0, tlv(0x02, new Uint8Array([2]))),
        tlv(0x02, new Uint8Array([1])),
        tlv(0x30, empty),
        tlv(0x30, empty),
        tlv(0x30, empty),
        tlv(0x30, empty),
        spki,
      ),
    );
    const der = tlv(0x30, cat(tbs, tlv(0x30, empty), tlv(0x03, new Uint8Array([0]))));
    expect([...spkiFromCertificate(der)]).toEqual([...spki]);
    let bin = "";
    for (const b of der) bin += String.fromCharCode(b);
    const pem = `-----BEGIN CERTIFICATE-----\n${btoa(bin)}\n-----END CERTIFICATE-----`;
    const msg: Record<string, string> = {
      Type: "Notification",
      MessageId: "m-1",
      TopicArn: "arn:aws:sns:us-east-1:123:ses",
      Message: JSON.stringify({ notificationType: "Complaint" }),
      Timestamp: "2026-10-26T00:00:00.000Z",
      SignatureVersion: "2",
      SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem",
    };
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        pair.privateKey,
        new TextEncoder().encode(snsStringToSign(msg) as string),
      ),
    );
    msg.Signature = btoa(String.fromCharCode(...sig));
    const fetchCert = async () => pem;
    expect(await verifySns(msg, fetchCert)).toBe(true);
    expect(await verifySns({ ...msg, Message: "{}" }, fetchCert)).toBe(false);
    // The certificate must come from an amazonaws.com SNS host.
    expect(
      await verifySns({ ...msg, SigningCertURL: "https://evil.example/cert.pem" }, fetchCert),
    ).toBe(false);
  });
});
