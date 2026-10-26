/**
 * `EmailSender`: Hub-domain transactional mail (opt-in confirmations, form notifications,
 * digests, magic links). Owner-sender campaign mail is Task 18 and does not go through here.
 */

export interface EmailAddressLike {
  email: string;
  name?: string;
}

export interface OutgoingEmail {
  to: string;
  from: EmailAddressLike;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Extra headers (e.g. RFC 8058 List-Unsubscribe). */
  headers?: Record<string, string>;
  /** What kind of mail this is (confirm, form-notification, digest…) — for logs and the outbox. */
  kind: string;
  siteId?: string | null;
}

export interface SendResult {
  id: string;
  provider: string;
}

export interface EmailSender {
  /** `ses` and `cloudflare-api` are owner senders for campaigns (Task 18). */
  readonly kind: "cloudflare" | "resend" | "postmark" | "dev" | "ses" | "cloudflare-api";
  send(message: OutgoingEmail): Promise<SendResult>;
}

/** A provider rejected the message (bad address, unverified domain, rate limit…). */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

export function formatAddress(a: EmailAddressLike): string {
  return a.name ? `${a.name.replace(/["<>\r\n]/g, "")} <${a.email}>` : a.email;
}
