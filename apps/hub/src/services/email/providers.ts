import type { FetchLike } from "../../github/http";
import { randomId } from "../../lib/crypto";
import {
  EmailSendError,
  type EmailSender,
  formatAddress,
  type OutgoingEmail,
  type SendResult,
} from "./types";

/** Cloudflare Email Service through the Workers `send_email` binding (no API key). */
export class CloudflareEmailSender implements EmailSender {
  readonly kind = "cloudflare" as const;
  constructor(private readonly binding: SendEmail) {}

  async send(m: OutgoingEmail): Promise<SendResult> {
    try {
      const res = await this.binding.send({
        to: m.to,
        from: { email: m.from.email, name: m.from.name ?? "" },
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
      });
      return { id: res.messageId, provider: this.kind };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      throw new EmailSendError(`${e.code ?? "E_SEND"}: ${e.message ?? String(err)}`, this.kind);
    }
  }
}

/** Resend (https://resend.com) over its REST API. */
export class ResendEmailSender implements EmailSender {
  readonly kind = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike,
  ) {}

  async send(m: OutgoingEmail): Promise<SendResult> {
    const res = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: formatAddress(m.from),
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
        tags: [{ name: "kind", value: m.kind.replace(/[^A-Za-z0-9_-]/g, "_") }],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id)
      throw new EmailSendError(
        body.message ?? `Resend returned ${res.status}`,
        this.kind,
        res.status,
      );
    return { id: body.id, provider: this.kind };
  }
}

/** Postmark (https://postmarkapp.com) over its REST API. */
export class PostmarkEmailSender implements EmailSender {
  readonly kind = "postmark" as const;
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchLike,
    private readonly stream = "outbound",
  ) {}

  async send(m: OutgoingEmail): Promise<SendResult> {
    const res = await this.fetchFn("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": this.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: formatAddress(m.from),
        To: m.to,
        Subject: m.subject,
        HtmlBody: m.html,
        TextBody: m.text,
        MessageStream: this.stream,
        Tag: m.kind,
        ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
        ...(m.headers
          ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) }
          : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      MessageID?: string;
      ErrorCode?: number;
      Message?: string;
    };
    if (!res.ok || (body.ErrorCode ?? 0) !== 0 || !body.MessageID)
      throw new EmailSendError(
        body.Message ?? `Postmark returned ${res.status}`,
        this.kind,
        res.status,
      );
    return { id: body.MessageID, provider: this.kind };
  }
}

/** Dev outbox: every message lands in D1 and is viewable at `/dev/outbox` (DEV_MODE). */
export class DevOutboxSender implements EmailSender {
  readonly kind = "dev" as const;
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number,
  ) {}

  async send(m: OutgoingEmail): Promise<SendResult> {
    const id = randomId("eml");
    const at = this.now();
    await this.db
      .prepare(
        `INSERT INTO outbox (id, site_id, to_addr, from_addr, subject, html, text, kind, status,
          created_at, sent_at, reply_to, headers_json, provider)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?, 'dev')`,
      )
      .bind(
        id,
        m.siteId ?? null,
        m.to,
        formatAddress(m.from),
        m.subject,
        m.html,
        m.text,
        m.kind,
        at,
        at,
        m.replyTo ?? null,
        m.headers ? JSON.stringify(m.headers) : null,
      )
      .run();
    return { id, provider: this.kind };
  }
}
