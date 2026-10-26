/** Per-site settings for the public services (stored in `service_settings`). */
import { z } from "zod";

export const ServiceSettingsSchema = z.strictObject({
  /** Where form notifications go; null = the owner's account email. */
  notifyEmail: z.email().nullable(),
  /** instant: one email per entry · daily: one digest a day · off. */
  notifications: z.enum(["instant", "daily", "off"]),
  /** Months to keep form entries (1–12, capped by the Hub quota). */
  retentionMonths: z.int().min(1).max(12),
  analyticsEnabled: z.boolean(),
  /** Weekly analytics summary email to the owner. */
  weeklyDigest: z.boolean(),
});
export type ServiceSettings = z.infer<typeof ServiceSettingsSchema>;

export const PatchServiceSettingsSchema = ServiceSettingsSchema.partial();

export const DEFAULT_SETTINGS: ServiceSettings = {
  notifyEmail: null,
  notifications: "instant",
  retentionMonths: 12,
  analyticsEnabled: true,
  weeklyDigest: false,
};

export async function getSettings(db: D1Database, siteId: string): Promise<ServiceSettings> {
  const row = await db
    .prepare("SELECT settings_json FROM service_settings WHERE site_id = ?")
    .bind(siteId)
    .first<{ settings_json: string }>();
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = PatchServiceSettingsSchema.safeParse(JSON.parse(row.settings_json));
    return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function patchSettings(
  db: D1Database,
  siteId: string,
  patch: Partial<ServiceSettings>,
  now: number,
): Promise<ServiceSettings> {
  const next = { ...(await getSettings(db, siteId)), ...patch };
  await db
    .prepare(
      `INSERT INTO service_settings (site_id, settings_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
    )
    .bind(siteId, JSON.stringify(next), now)
    .run();
  return next;
}
