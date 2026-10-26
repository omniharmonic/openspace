/** Transactional mail with per-site quota (architecture §8.4: 500 / month). */
import type { Site } from "@openspace/schema";
import type { SiteRow } from "../../db/sites";
import type { Services } from "../index";
import { consumeQuota, quotaExceeded, siteQuotaLimits } from "../quotas";
import type { SendResult } from "./types";

export * from "./providers";
export * from "./types";

export interface TransactionalInput {
  siteId: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Display name for the From header (defaults to the Hub sender's name). */
  fromName?: string;
}

/** Send one Hub-domain email, counting it against the site's transactional quota. */
export async function sendTransactional(
  services: Services,
  input: TransactionalInput,
): Promise<SendResult> {
  const { db, now, pub } = services;
  if (input.siteId) {
    const limits = await siteQuotaLimits(db, input.siteId, pub.quotaOverrides);
    const used = await consumeQuota(
      db,
      input.siteId,
      "transactionalEmails",
      limits.transactionalEmails,
      now(),
    );
    if (used === null) throw quotaExceeded("monthly email");
  }
  return pub.email.send({
    to: input.to,
    from: {
      email: pub.config.emailFrom.email,
      name: input.fromName ? `${input.fromName} via OpenSpace` : pub.config.emailFrom.name,
    },
    subject: input.subject,
    html: input.html,
    text: input.text,
    kind: input.kind,
    siteId: input.siteId,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  });
}

/**
 * Where a site is served: its URL (switched to the custom domain once that is active), else the
 * custom domain, else the Hub.
 */
export function siteBaseUrl(site: Pick<SiteRow, "url" | "domain">, hubUrl: string): string {
  if (site.url) return site.url.endsWith("/") ? site.url : `${site.url}/`;
  if (site.domain) return `https://${site.domain}/`;
  return `${hubUrl}/`;
}

export type EmailSite = Pick<Site, "title" | "tagline" | "logo" | "social" | "locale">;

/** Minimal `Site` branding for email templates from the Hub's site record. */
export function emailSite(site: Pick<SiteRow, "name" | "tagline">): EmailSite {
  return {
    title: site.name,
    ...(site.tagline ? { tagline: site.tagline } : {}),
    locale: "en",
  } as EmailSite;
}
