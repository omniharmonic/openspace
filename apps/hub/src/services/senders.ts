/**
 * Owner sender connections for campaigns (arch §9.2): marketing mail goes out through the
 * owner's own Resend / Postmark / Amazon SES / Cloudflare Email Service account, so the commons
 * doesn't pay for it and reputation belongs to the sender. Before the first send the from-domain's
 * SPF, DKIM and DMARC are checked over DNS-over-HTTPS.
 *
 * Credentials are sealed at rest and never returned. In DEV_MODE every connection sends to the
 * dev outbox (Global Constraint 8).
 */
import { z } from "zod";
import type { FetchLike } from "../github/http";
import { randomId, randomToken, sha256Hex, timingSafeEqual, toHex } from "../lib/crypto";
import { conflict, HttpError, notFound } from "../lib/errors";
import { openSecret, sealSecret } from "../lib/seal";
import type { DnsResolver } from "./domains";
import {
  DevOutboxSender,
  EmailSendError,
  type EmailSender,
  formatAddress,
  type OutgoingEmail,
  PostmarkEmailSender,
  ResendEmailSender,
  type SendResult,
} from "./email";
import type { Services } from "./index";

export const SENDER_PROVIDERS = ["resend", "postmark", "ses", "cloudflare", "dev"] as const;
export type SenderProvider = (typeof SENDER_PROVIDERS)[number];

// ---- extra providers ------------------------------------------------------------------------------

const enc = new TextEncoder();

async function hmacRaw(key: Uint8Array | string, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

/** AWS Signature Version 4 headers for a JSON POST (SES v2). */
export async function sigV4(input: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  host: string;
  path: string;
  body: string;
  now: Date;
}): Promise<Record<string, string>> {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(input.body);
  const canonical = [
    "POST",
    input.path,
    "",
    `content-type:application/json\nhost:${input.host}\nx-amz-date:${amzDate}\n`,
    "content-type;host;x-amz-date",
    payloadHash,
  ].join("\n");
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");
  let key = await hmacRaw(`AWS4${input.secretAccessKey}`, date);
  key = await hmacRaw(key, input.region);
  key = await hmacRaw(key, input.service);
  key = await hmacRaw(key, "aws4_request");
  const signature = toHex(await hmacRaw(key, toSign));
  return {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
  };
}

/** Amazon SES (API v2 SendEmail) with SigV4 — no SDK. */
export class SesEmailSender implements EmailSender {
  readonly kind = "ses" as const;
  constructor(
    private readonly creds: { accessKeyId: string; secretAccessKey: string; region: string },
    private readonly fetchFn: FetchLike,
    private readonly now: () => number = Date.now,
  ) {}

  async send(m: OutgoingEmail): Promise<SendResult> {
    const host = `email.${this.creds.region}.amazonaws.com`;
    const path = "/v2/email/outbound-emails";
    const body = JSON.stringify({
      FromEmailAddress: formatAddress(m.from),
      Destination: { ToAddresses: [m.to] },
      ...(m.replyTo ? { ReplyToAddresses: [m.replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: m.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: m.html, Charset: "UTF-8" },
            Text: { Data: m.text, Charset: "UTF-8" },
          },
          ...(m.headers
            ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) }
            : {}),
        },
      },
    });
    const headers = await sigV4({
      ...this.creds,
      service: "ses",
      host,
      path,
      body,
      now: new Date(this.now()),
    });
    const res = await this.fetchFn(`https://${host}${path}`, { method: "POST", headers, body });
    const out = (await res.json().catch(() => ({}))) as { MessageId?: string; message?: string };
    if (!res.ok || !out.MessageId)
      throw new EmailSendError(out.message ?? `SES returned ${res.status}`, this.kind, res.status);
    return { id: out.MessageId, provider: this.kind };
  }
}

/** Cloudflare Email Service on the owner's account, over its REST API. */
export class CloudflareApiSender implements EmailSender {
  readonly kind = "cloudflare-api" as const;
  constructor(
    private readonly creds: { accountId: string; apiToken: string },
    private readonly fetchFn: FetchLike,
  ) {}

  async send(m: OutgoingEmail): Promise<SendResult> {
    const res = await this.fetchFn(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.creds.accountId)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.creds.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: m.to,
          from: { address: m.from.email, name: m.from.name ?? "" },
          subject: m.subject,
          html: m.html,
          text: m.text,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          ...(m.headers ? { headers: m.headers } : {}),
        }),
      },
    );
    const out = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: { permanent_bounces?: string[] };
    };
    if (!res.ok || out.success === false)
      throw new EmailSendError(
        out.errors?.[0]?.message ?? `Cloudflare returned ${res.status}`,
        this.kind,
        res.status,
      );
    if (out.result?.permanent_bounces?.length)
      throw new EmailSendError("permanent bounce", this.kind, 550);
    return { id: randomId("cfm"), provider: this.kind };
  }
}

// ---- connections --------------------------------------------------------------------------------

const Email = z.string().trim().toLowerCase().email().max(254);

export const SenderInputSchema = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("resend"),
    fromEmail: Email,
    fromName: z.string().trim().max(80).optional(),
    replyTo: Email.optional(),
    dkimSelector: z
      .string()
      .regex(/^[a-z0-9._-]{1,63}$/i)
      .optional(),
    credentials: z.strictObject({ apiKey: z.string().min(8).max(200) }),
    /** Resend (Svix) webhook signing secret for bounces and complaints. */
    webhookSecret: z.string().min(8).max(200).optional(),
  }),
  z.strictObject({
    provider: z.literal("postmark"),
    fromEmail: Email,
    fromName: z.string().trim().max(80).optional(),
    replyTo: Email.optional(),
    dkimSelector: z
      .string()
      .regex(/^[a-z0-9._-]{1,63}$/i)
      .optional(),
    credentials: z.strictObject({ serverToken: z.string().min(8).max(200) }),
  }),
  z.strictObject({
    provider: z.literal("ses"),
    fromEmail: Email,
    fromName: z.string().trim().max(80).optional(),
    replyTo: Email.optional(),
    dkimSelector: z
      .string()
      .regex(/^[a-z0-9._-]{1,63}$/i)
      .optional(),
    credentials: z.strictObject({
      accessKeyId: z.string().min(8).max(128),
      secretAccessKey: z.string().min(8).max(200),
      region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    }),
  }),
  z.strictObject({
    provider: z.literal("cloudflare"),
    fromEmail: Email,
    fromName: z.string().trim().max(80).optional(),
    replyTo: Email.optional(),
    dkimSelector: z
      .string()
      .regex(/^[a-z0-9._-]{1,63}$/i)
      .optional(),
    credentials: z.strictObject({
      accountId: z.string().regex(/^[0-9a-f]{32}$/),
      apiToken: z.string().min(8).max(200),
    }),
  }),
  z.strictObject({
    provider: z.literal("dev"),
    fromEmail: Email,
    fromName: z.string().trim().max(80).optional(),
    replyTo: Email.optional(),
    dkimSelector: z
      .string()
      .regex(/^[a-z0-9._-]{1,63}$/i)
      .optional(),
  }),
]);
export type SenderInput = z.infer<typeof SenderInputSchema>;

export interface SenderRow {
  id: string;
  site_id: string;
  provider: SenderProvider;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  domain: string;
  dkim_selector: string | null;
  credentials_enc: string | null;
  webhook_secret_enc: string | null;
  status: "unverified" | "verified" | "failed";
  dns_json: string | null;
  verified_at: number | null;
  checked_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface DnsCheck {
  id: "spf" | "dkim" | "dmarc";
  label: string;
  ok: boolean;
  name: string;
  expected: string;
  found: string[];
  hint?: string;
}

export interface SenderView {
  id: string;
  provider: SenderProvider;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  domain: string;
  dkimSelector: string | null;
  status: SenderRow["status"];
  checks: DnsCheck[];
  verifiedAt: string | null;
  checkedAt: string | null;
  /** Where to point the provider's bounce/complaint webhook (null: provider has none). */
  webhookUrl: string | null;
}

const aad = (siteId: string, id: string, what: string) => `sender:${siteId}:${id}:${what}`;

export function senderView(services: Services, r: SenderRow, webhookToken?: string): SenderView {
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);
  let webhookUrl: string | null = null;
  if (r.provider !== "cloudflare") {
    const base = `${services.config.hubUrl}/e/webhooks/${r.provider}/${r.id}`;
    // Postmark/SES/dev webhooks authenticate with a Hub-made token in the URL (shown once).
    webhookUrl =
      r.provider === "resend"
        ? base
        : webhookToken
          ? `${base}?token=${webhookToken}`
          : `${base}?token=…`;
  }
  return {
    id: r.id,
    provider: r.provider,
    fromEmail: r.from_email,
    fromName: r.from_name,
    replyTo: r.reply_to,
    domain: r.domain,
    dkimSelector: r.dkim_selector,
    status: r.status,
    checks: r.dns_json ? (JSON.parse(r.dns_json) as DnsCheck[]) : [],
    verifiedAt: iso(r.verified_at),
    checkedAt: iso(r.checked_at),
    webhookUrl,
  };
}

export async function listSenders(db: D1Database, siteId: string): Promise<SenderRow[]> {
  return (
    await db
      .prepare("SELECT * FROM sender_connections WHERE site_id = ? ORDER BY created_at")
      .bind(siteId)
      .all<SenderRow>()
  ).results;
}

export async function getSender(db: D1Database, siteId: string, id: string) {
  return db
    .prepare("SELECT * FROM sender_connections WHERE site_id = ? AND id = ?")
    .bind(siteId, id)
    .first<SenderRow>();
}

export async function createSender(
  services: Services,
  siteId: string,
  userId: string,
  input: SenderInput,
): Promise<SenderView> {
  if (input.provider === "dev" && !services.config.devMode)
    throw new HttpError(422, "invalid_provider", "Choose an email provider.");
  const count = (await listSenders(services.db, siteId)).length;
  if (count >= 5) throw conflict("too_many_senders", "Remove a sender before adding another.");
  const id = randomId("snd", 10);
  const now = services.now();
  const domain = input.fromEmail.split("@")[1] as string;
  const creds = "credentials" in input ? JSON.stringify(input.credentials) : null;
  // Webhook auth: Resend signs with its own (Svix) secret; for the others the Hub mints a token.
  const hookSecret =
    input.provider === "resend"
      ? (input.webhookSecret ?? null)
      : input.provider === "cloudflare"
        ? null
        : randomToken(24);
  await services.db
    .prepare(
      `INSERT INTO sender_connections (id, site_id, provider, from_email, from_name, reply_to, domain,
         dkim_selector, credentials_enc, webhook_secret_enc, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?, ?)`,
    )
    .bind(
      id,
      siteId,
      input.provider,
      input.fromEmail,
      input.fromName ?? null,
      input.replyTo ?? null,
      domain,
      input.dkimSelector ?? null,
      creds ? await sealSecret(services.config, creds, aad(siteId, id, "credentials")) : null,
      hookSecret ? await sealSecret(services.config, hookSecret, aad(siteId, id, "webhook")) : null,
      userId,
      now,
      now,
    )
    .run();
  const row = (await getSender(services.db, siteId, id)) as SenderRow;
  return senderView(
    services,
    row,
    hookSecret && input.provider !== "resend" ? hookSecret : undefined,
  );
}

export async function deleteSender(db: D1Database, siteId: string, id: string): Promise<void> {
  const busy = await db
    .prepare(
      "SELECT 1 AS x FROM campaigns WHERE site_id = ? AND sender_id = ? AND status IN ('scheduled', 'sending')",
    )
    .bind(siteId, id)
    .first();
  if (busy) throw conflict("sender_in_use", "A scheduled or sending campaign uses this sender.");
  const res = await db
    .prepare("DELETE FROM sender_connections WHERE site_id = ? AND id = ?")
    .bind(siteId, id)
    .run();
  if ((res.meta.changes ?? 0) !== 1) throw notFound("We couldn't find that sender.");
}

/** The EmailSender for a connection (dev outbox in DEV_MODE, whatever the provider). */
export async function senderFor(services: Services, row: SenderRow): Promise<EmailSender> {
  if (services.config.devMode || row.provider === "dev")
    return new DevOutboxSender(services.db, services.now);
  if (!row.credentials_enc) throw new HttpError(409, "sender_incomplete", "Reconnect this sender.");
  const c = JSON.parse(
    await openSecret(services.config, row.credentials_enc, aad(row.site_id, row.id, "credentials")),
  ) as Record<string, string>;
  switch (row.provider) {
    case "resend":
      return new ResendEmailSender(c.apiKey as string, services.fetch);
    case "postmark":
      // Postmark keeps marketing mail on a separate "broadcast" message stream.
      return new PostmarkEmailSender(c.serverToken as string, services.fetch, "broadcast");
    case "ses":
      return new SesEmailSender(
        {
          accessKeyId: c.accessKeyId as string,
          secretAccessKey: c.secretAccessKey as string,
          region: c.region as string,
        },
        services.fetch,
        services.now,
      );
    case "cloudflare":
      return new CloudflareApiSender(
        { accountId: c.accountId as string, apiToken: c.apiToken as string },
        services.fetch,
      );
  }
}

export async function senderWebhookSecret(
  services: Services,
  row: SenderRow,
): Promise<string | null> {
  if (!row.webhook_secret_enc) return null;
  return openSecret(services.config, row.webhook_secret_enc, aad(row.site_id, row.id, "webhook"));
}

// ---- DNS: SPF / DKIM / DMARC --------------------------------------------------------------------

const SPF_INCLUDE: Record<SenderProvider, string | null> = {
  resend: "include:amazonses.com",
  ses: "include:amazonses.com",
  postmark: null, // Postmark authenticates the Return-Path (pm-bounces CNAME) instead.
  cloudflare: "include:_spf.mx.cloudflare.net",
  dev: null,
};
const DEFAULT_DKIM: Partial<Record<SenderProvider, string>> = { resend: "resend" };

/** Check the from-domain's email authentication records for a provider. */
export async function checkSenderDns(
  dns: DnsResolver,
  provider: SenderProvider,
  domain: string,
  dkimSelector: string | null,
): Promise<DnsCheck[]> {
  const txt = async (name: string) => dns.resolve(name, "TXT").catch(() => [] as string[]);
  const checks: DnsCheck[] = [];
  if (provider === "postmark") {
    const name = `pm-bounces.${domain}`;
    const found = await dns.resolve(name, "CNAME").catch(() => [] as string[]);
    checks.push({
      id: "spf",
      label: "Return-Path (SPF)",
      ok: found.includes("pm.mtasv.net"),
      name,
      expected: "CNAME pm.mtasv.net",
      found,
      hint: "Add the Return-Path CNAME record Postmark shows on your sender signature page.",
    });
  } else {
    const name = provider === "resend" ? `send.${domain}` : domain;
    const found = (await txt(name)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
    const include = SPF_INCLUDE[provider];
    checks.push({
      id: "spf",
      label: "SPF",
      ok: found.length === 1 && (!include || (found[0] ?? "").toLowerCase().includes(include)),
      name,
      expected: include ? `v=spf1 ${include} ~all` : "v=spf1 …",
      found,
      ...(found.length > 1
        ? { hint: "There must be exactly one SPF record. Merge them into one." }
        : include
          ? { hint: `Add "${include}" to the SPF record.` }
          : {}),
    });
  }
  const selector = dkimSelector ?? DEFAULT_DKIM[provider] ?? null;
  if (!selector)
    checks.push({
      id: "dkim",
      label: "DKIM",
      ok: false,
      name: `<selector>._domainkey.${domain}`,
      expected: "DKIM key record",
      found: [],
      hint: "Enter the DKIM selector your email provider gave you (the part before ._domainkey).",
    });
  else {
    const name = `${selector}._domainkey.${domain}`;
    const t = (await txt(name)).filter((r) => /(^|;)\s*p=/.test(r));
    const c = t.length ? [] : await dns.resolve(name, "CNAME").catch(() => [] as string[]);
    checks.push({
      id: "dkim",
      label: "DKIM",
      ok: t.length > 0 || c.length > 0,
      name,
      expected: "TXT v=DKIM1; p=… (or the CNAME your provider gives)",
      found: [...t.map((r) => `${r.slice(0, 40)}…`), ...c],
      hint: "Copy the DKIM record from your email provider's domain settings.",
    });
  }
  const dmarcName = `_dmarc.${domain}`;
  const dmarc = (await txt(dmarcName)).filter((r) => r.toUpperCase().startsWith("V=DMARC1"));
  checks.push({
    id: "dmarc",
    label: "DMARC",
    ok: dmarc.length === 1,
    name: dmarcName,
    expected: "v=DMARC1; p=none (or stricter)",
    found: dmarc,
    hint: "Add a TXT record at _dmarc with v=DMARC1; p=none to start.",
  });
  return checks;
}

export async function verifySender(
  services: Services,
  siteId: string,
  id: string,
): Promise<SenderView> {
  const row = await getSender(services.db, siteId, id);
  if (!row) throw notFound("We couldn't find that sender.");
  const checks = await checkSenderDns(
    services.pub.dns,
    row.provider,
    row.domain,
    row.dkim_selector,
  );
  const ok = checks.every((c) => c.ok);
  const now = services.now();
  await services.db
    .prepare(
      `UPDATE sender_connections SET status = ?, dns_json = ?, checked_at = ?,
         verified_at = CASE WHEN ? THEN COALESCE(verified_at, ?) ELSE NULL END, updated_at = ?
       WHERE id = ?`,
    )
    .bind(ok ? "verified" : "failed", JSON.stringify(checks), now, ok ? 1 : 0, now, now, id)
    .run();
  return senderView(services, (await getSender(services.db, siteId, id)) as SenderRow);
}

// ---- webhook authentication -----------------------------------------------------------------------

/** Svix (Resend): `svix-signature: v1,<base64 hmac>` over `${id}.${timestamp}.${body}`. */
export async function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSec: number,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false;
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Uint8Array;
  try {
    key = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const mac = await hmacRaw(key, `${id}.${timestamp}.${body}`);
  let b = "";
  for (const x of mac) b += String.fromCharCode(x);
  const expected = btoa(b);
  let ok = false;
  for (const part of signature.split(" ")) {
    const [v, sig] = part.split(",", 2);
    if (v === "v1" && sig && (await timingSafeEqual(sig, expected))) ok = true;
  }
  return ok;
}

// SNS (SES notifications): RSA signature over the canonical string, with the signing certificate
// fetched from an amazonaws.com SNS host and its public key extracted from the X.509 DER.

/** DER TLVs between `start` and `end`: [tag, headerStart, contentStart, contentEnd]. */
function derChildren(
  buf: Uint8Array,
  start: number,
  end: number,
): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  let i = start;
  while (i < end) {
    const tag = buf[i] as number;
    let len = buf[i + 1] as number;
    let p = i + 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = len * 256 + (buf[p + k] as number);
      p += n;
    }
    if (p + len > end) throw new Error("truncated DER");
    out.push([tag, i, p, p + len]);
    i = p + len;
  }
  return out;
}

/** SubjectPublicKeyInfo (DER) of an X.509 certificate (DER). */
export function spkiFromCertificate(der: Uint8Array): Uint8Array {
  const [cert] = derChildren(der, 0, der.length);
  if (cert?.[0] !== 0x30) throw new Error("not a certificate");
  const [tbs] = derChildren(der, cert[2], cert[3]);
  if (tbs?.[0] !== 0x30) throw new Error("not a certificate");
  const fields = derChildren(der, tbs[2], tbs[3]);
  const offset = fields[0]?.[0] === 0xa0 ? 1 : 0; // optional [0] version
  // serial, signature algorithm, issuer, validity, subject, subjectPublicKeyInfo
  const spki = fields[offset + 5];
  if (spki?.[0] !== 0x30) throw new Error("no public key");
  return der.slice(spki[1], spki[3]);
}

export function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const SNS_CERT_RE = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/[A-Za-z0-9/_.-]+\.pem$/;

export function snsStringToSign(m: Record<string, string>): string | null {
  const keys =
    m.Type === "Notification"
      ? [
          "Message",
          "MessageId",
          ...(m.Subject !== undefined ? ["Subject"] : []),
          "Timestamp",
          "TopicArn",
          "Type",
        ]
      : m.Type === "SubscriptionConfirmation" || m.Type === "UnsubscribeConfirmation"
        ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
        : null;
  if (!keys) return null;
  let s = "";
  for (const k of keys) {
    if (typeof m[k] !== "string") return null;
    s += `${k}\n${m[k]}\n`;
  }
  return s;
}

export async function verifySns(
  message: Record<string, string>,
  fetchCert: (url: string) => Promise<string>,
): Promise<boolean> {
  const toSign = snsStringToSign(message);
  const certUrl = message.SigningCertURL ?? "";
  if (!toSign || !SNS_CERT_RE.test(certUrl) || !message.Signature) return false;
  const hash = message.SignatureVersion === "2" ? "SHA-256" : "SHA-1";
  try {
    const spki = spkiFromCertificate(pemToDer(await fetchCert(certUrl)));
    const key = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "RSASSA-PKCS1-v1_5", hash },
      false,
      ["verify"],
    );
    const sig = Uint8Array.from(atob(message.Signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, enc.encode(toSign));
  } catch {
    return false;
  }
}
