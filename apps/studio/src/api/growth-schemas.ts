import { BlockSchema } from "@openspace/schema";
import { z } from "zod";

/**
 * Request-body schemas the Hub validates (mirrored from `apps/hub/src/services/campaigns.ts`,
 * `senders.ts` and `newsletter.ts`). Studio checks bodies against these before sending, and the
 * mock Hub refuses anything the real Hub would refuse, so tests catch contract drift.
 */

export const TagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} _.-]+$/u, { message: "Tags may use letters, numbers, spaces, - _ ." });

export const SegmentSchema = z.strictObject({
  tags: z.array(TagSchema).max(20).default([]),
  match: z.enum(["any", "all"]).default("any"),
});

export const CampaignInputSchema = z.strictObject({
  subject: z.string().trim().min(1).max(200),
  preheader: z.string().trim().max(200).nullable().optional(),
  body: z.strictObject({ blocks: z.array(BlockSchema).max(200) }),
  segment: SegmentSchema.optional(),
  senderId: z.string().max(40).nullable().optional(),
  trackOpens: z.boolean().optional(),
});
export const CampaignPatchSchema = CampaignInputSchema.partial();

const Email = z.string().trim().toLowerCase().email().max(254);
const common = {
  fromEmail: Email,
  fromName: z.string().trim().max(80).optional(),
  replyTo: Email.optional(),
  dkimSelector: z
    .string()
    .regex(/^[a-z0-9._-]{1,63}$/i)
    .optional(),
};

export const SenderInputSchema = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("resend"),
    ...common,
    credentials: z.strictObject({ apiKey: z.string().min(8).max(200) }),
    /** Resend (Svix) webhook signing secret for bounces and complaints. */
    webhookSecret: z.string().min(8).max(200).optional(),
  }),
  z.strictObject({
    provider: z.literal("postmark"),
    ...common,
    credentials: z.strictObject({ serverToken: z.string().min(8).max(200) }),
  }),
  z.strictObject({
    provider: z.literal("ses"),
    ...common,
    credentials: z.strictObject({
      accessKeyId: z.string().min(8).max(128),
      secretAccessKey: z.string().min(8).max(200),
      region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    }),
  }),
  z.strictObject({
    provider: z.literal("cloudflare"),
    ...common,
    credentials: z.strictObject({
      accountId: z.string().regex(/^[0-9a-f]{32}$/),
      apiToken: z.string().min(8).max(200),
    }),
  }),
  z.strictObject({ provider: z.literal("dev"), ...common }),
]);

/** First problem in plain words (for the UI and the mock's 400s). */
export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return "Check the details and try again.";
  const path = i.path.join(".");
  if (path === "subject") return "Give the email a subject.";
  if (path.startsWith("credentials"))
    return "Fill in every key from your provider (they look too short).";
  if (path === "fromEmail" || path === "replyTo") return "That email address doesn't look right.";
  if (path.startsWith("segment")) return "Tags may use letters, numbers, spaces, - _ .";
  return `${path ? `${path}: ` : ""}${i.message}`;
}
