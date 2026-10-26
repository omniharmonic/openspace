/**
 * Form file uploads (PRD §5.2, P4). A file field's file goes to the Hub's private R2 bucket on
 * every hosting target (a visitor's file never lands in the site's public repository):
 *
 * 1. JS path: the form behavior asks `POST /f/:site/:form/uploads` for an upload address (type
 *    and size are checked against the published form), PUTs the bytes to the signed
 *    `PUT /f/:site/u/:id?exp&sig` address, and submits the upload id in place of the file.
 * 2. No-JS path: a multipart post carries the file itself; the Hub stores it the same way.
 *
 * On submission the ids are attached to the entry (`submissions.files`); the inbox gets signed,
 * short-lived download links. Unattached uploads expire after a day and every file is deleted
 * with its submission (retention purge or inbox delete).
 */
import { DEFAULT_FILE_MAX_MB, type Form, type FormField, fileFieldAccept } from "@openspace/schema";
import type { SiteRow } from "../db/sites";
import { randomId, timingSafeEqual } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { hmacB64 } from "../lib/seal";
import { requireHmacKey } from "../public-env";
import type { Services } from "./index";
import { siteQuotaLimits } from "./quotas";

type FileField = Extract<FormField, { type: "file" }>;
const PENDING_TTL = 24 * 60 * 60 * 1000;
const UPLOAD_LINK_TTL = 15 * 60 * 1000;
const DOWNLOAD_LINK_TTL = 60 * 60 * 1000;

export interface UploadedFile {
  field: string;
  id: string;
  name: string;
  type: string;
  size: number;
}

interface UploadRow {
  id: string;
  site_id: string;
  form_id: string;
  field: string;
  name: string;
  type: string;
  size: number;
  status: "pending" | "uploaded" | "attached";
  submission_id: string | null;
  created_at: number;
  expires_at: number;
}

export const uploadKey = (siteId: string, id: string) => `form-uploads/${siteId}/${id}`;

function fileField(form: Form, name: string): FileField {
  const field = form.fields.find((f) => f.name === name);
  if (field?.type !== "file")
    throw new HttpError(422, "invalid_fields", "This form doesn't take a file there.");
  return field;
}

/** The visitor's file name, made safe for display and Content-Disposition. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .trim()
    .slice(-120);
  return clean || "file";
}

/** Type and size checks for one file against its field; returns a visitor-facing problem. */
export function checkFile(
  field: FileField,
  name: string,
  type: string,
  size: number,
): string | null {
  const max = (field.maxSizeMb ?? DEFAULT_FILE_MAX_MB) * 1024 * 1024;
  if (!Number.isFinite(size) || size <= 0) return "That file is empty.";
  if (size > max) return `This file is larger than ${max / 1024 / 1024} MB.`;
  const { types, extensions } = fileFieldAccept(field);
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!types.includes(type.toLowerCase()) || !extensions.includes(ext))
    return "This kind of file isn't accepted here.";
  return null;
}

async function uploadBytesUsed(db: D1Database, siteId: string): Promise<number> {
  const r = await db
    .prepare(
      "SELECT COALESCE(SUM(size), 0) AS n FROM form_uploads WHERE site_id = ? AND status != 'pending'",
    )
    .bind(siteId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function checkQuota(services: Services, siteId: string, size: number): Promise<void> {
  const limits = await siteQuotaLimits(services.db, siteId, services.pub.quotaOverrides);
  if ((await uploadBytesUsed(services.db, siteId)) + size > limits.uploadBytes)
    throw new HttpError(
      429,
      "quota_exceeded",
      "This form can't take more files right now. Please contact the site owner directly.",
    );
}

const sig = (services: Services, purpose: string, id: string, exp: number) =>
  hmacB64(requireHmacKey(services.pub.config), `${purpose}:${id}:${exp}`, 32);

async function verifySig(
  services: Services,
  purpose: string,
  id: string,
  exp: string | undefined,
  given: string | undefined,
): Promise<boolean> {
  const e = Number(exp);
  if (!given || !Number.isFinite(e) || e < services.now()) return false;
  return timingSafeEqual(await sig(services, purpose, id, e), given);
}

/** Step 1 (JS path): reserve an upload and hand out its signed address. */
export async function createUpload(
  services: Services,
  site: SiteRow,
  form: Form,
  input: { field: string; name: string; type: string; size: number },
): Promise<{ id: string; uploadUrl: string; expiresAt: string }> {
  const field = fileField(form, input.field);
  const name = cleanFileName(input.name);
  const problem = checkFile(field, name, input.type, input.size);
  if (problem) throw new HttpError(422, "invalid_file", problem);
  await checkQuota(services, site.id, input.size);
  const now = services.now();
  const id = randomId("upl");
  await services.db
    .prepare(
      `INSERT INTO form_uploads (id, site_id, form_id, field, name, type, size, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      id,
      site.id,
      form.id,
      field.name,
      name,
      input.type.toLowerCase(),
      input.size,
      now,
      now + PENDING_TTL,
    )
    .run();
  const exp = now + UPLOAD_LINK_TTL;
  const s = await sig(services, "put", id, exp);
  return {
    id,
    uploadUrl: `${services.config.hubUrl}/f/${site.id}/u/${id}?exp=${exp}&sig=${encodeURIComponent(s)}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/** Step 2 (JS path): store the bytes for a reserved upload. */
export async function receiveUpload(
  services: Services,
  siteId: string,
  id: string,
  query: { exp?: string; sig?: string },
  req: Request,
): Promise<void> {
  if (!(await verifySig(services, "put", id, query.exp, query.sig)))
    throw new HttpError(
      403,
      "invalid_signature",
      "This upload link has expired. Please try again.",
    );
  const row = await services.db
    .prepare("SELECT * FROM form_uploads WHERE id = ? AND site_id = ?")
    .bind(id, siteId)
    .first<UploadRow>();
  if (!row || row.status !== "pending")
    throw new HttpError(409, "upload_used", "This upload link was already used.");
  const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (type !== row.type)
    throw new HttpError(422, "invalid_file", "This kind of file isn't accepted here.");
  const bytes = new Uint8Array(await readLimited(req, row.size));
  if (bytes.byteLength !== row.size)
    throw new HttpError(
      422,
      "invalid_file",
      "The file didn't arrive completely. Please try again.",
    );
  await services.uploads.put(uploadKey(siteId, id), bytes, {
    httpMetadata: { contentType: row.type },
  });
  await services.db
    .prepare("UPDATE form_uploads SET status = 'uploaded' WHERE id = ? AND status = 'pending'")
    .bind(id)
    .run();
}

async function readLimited(req: Request, max: number): Promise<ArrayBuffer> {
  if (Number(req.headers.get("content-length") ?? 0) > max)
    throw new HttpError(413, "too_large", "This file is larger than you said.");
  if (!req.body) return new ArrayBuffer(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, "too_large", "This file is larger than you said.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

/** No-JS path: a file that came with the submission itself. Returns its upload id. */
export async function storeDirect(
  services: Services,
  site: SiteRow,
  form: Form,
  fieldName: string,
  file: File,
): Promise<string> {
  const field = fileField(form, fieldName);
  const name = cleanFileName(file.name);
  const problem = checkFile(field, name, file.type, file.size);
  if (problem) throw new HttpError(422, "invalid_fields", problem, { [fieldName]: problem });
  await checkQuota(services, site.id, file.size);
  const now = services.now();
  const id = randomId("upl");
  await services.uploads.put(uploadKey(site.id, id), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type.toLowerCase() },
  });
  await services.db
    .prepare(
      `INSERT INTO form_uploads (id, site_id, form_id, field, name, type, size, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?)`,
    )
    .bind(
      id,
      site.id,
      form.id,
      field.name,
      name,
      file.type.toLowerCase(),
      file.size,
      now,
      now + PENDING_TTL,
    )
    .run();
  return id;
}

/**
 * Check the upload ids a submission names for its file fields: each must be an uploaded,
 * unattached file of this site, form and field. Returns the files, or field errors.
 */
export async function resolveUploads(
  services: Services,
  siteId: string,
  form: Form,
  values: Record<string, unknown>,
): Promise<{ ok: true; files: UploadedFile[] } | { ok: false; errors: Record<string, string> }> {
  const files: UploadedFile[] = [];
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    if (field.type !== "file") continue;
    const raw = values[field.name];
    const id = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as string | undefined;
    if (!id || typeof id !== "string" || id.trim() === "") {
      if (field.required) errors[field.name] = `Please add ${field.label}.`;
      continue;
    }
    const row = /^upl_[0-9a-z]+$/.test(id)
      ? await services.db
          .prepare(
            "SELECT * FROM form_uploads WHERE id = ? AND site_id = ? AND form_id = ? AND field = ?",
          )
          .bind(id, siteId, form.id, field.name)
          .first<UploadRow>()
      : null;
    if (!row || row.status !== "uploaded") {
      errors[field.name] = "The file didn't upload. Please choose it again.";
      continue;
    }
    files.push({ field: field.name, id: row.id, name: row.name, type: row.type, size: row.size });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, files };
}

export async function attachUploads(
  services: Services,
  submissionId: string,
  files: UploadedFile[],
): Promise<void> {
  if (!files.length) return;
  await services.db.batch(
    files.map((f) =>
      services.db
        .prepare(
          "UPDATE form_uploads SET status = 'attached', submission_id = ? WHERE id = ? AND status = 'uploaded'",
        )
        .bind(submissionId, f.id),
    ),
  );
}

/** A signed, short-lived download address for the inbox. */
export async function downloadUrl(services: Services, siteId: string, id: string): Promise<string> {
  const exp = services.now() + DOWNLOAD_LINK_TTL;
  const s = await sig(services, "get", id, exp);
  return `${services.config.hubUrl}/f/${siteId}/d/${id}?exp=${exp}&sig=${encodeURIComponent(s)}`;
}

/** Serve an attached upload for a signed download link (always as an attachment). */
export async function serveDownload(
  services: Services,
  siteId: string,
  id: string,
  query: { exp?: string; sig?: string },
): Promise<Response> {
  if (!(await verifySig(services, "get", id, query.exp, query.sig)))
    throw new HttpError(
      403,
      "invalid_signature",
      "This download link has expired. Open the entry again.",
    );
  const row = await services.db
    .prepare("SELECT * FROM form_uploads WHERE id = ? AND site_id = ? AND status = 'attached'")
    .bind(id, siteId)
    .first<UploadRow>();
  const obj = row ? await services.uploads.get(uploadKey(siteId, id)) : null;
  if (!row || !obj) throw new HttpError(404, "not_found", "This file is no longer kept.");
  const ascii = row.name.replace(/[^\x20-\x7e]/g, "_");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Content-Length": String(row.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Delete the files of the given submissions (or of a whole site) from R2 and the table. */
export async function deleteUploadsFor(
  services: Services,
  where: { siteId: string; submissionIds?: string[] },
): Promise<number> {
  const rows = where.submissionIds
    ? where.submissionIds.length
      ? (
          await services.db
            .prepare(
              `SELECT id, site_id FROM form_uploads WHERE site_id = ? AND submission_id IN (${where.submissionIds.map(() => "?").join(", ")})`,
            )
            .bind(where.siteId, ...where.submissionIds)
            .all<{ id: string; site_id: string }>()
        ).results
      : []
    : (
        await services.db
          .prepare("SELECT id, site_id FROM form_uploads WHERE site_id = ?")
          .bind(where.siteId)
          .all<{ id: string; site_id: string }>()
      ).results;
  return removeRows(services, rows);
}

async function removeRows(
  services: Services,
  rows: Array<{ id: string; site_id: string }>,
): Promise<number> {
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    await services.uploads.delete(slice.map((r) => uploadKey(r.site_id, r.id)));
    await services.db.batch(
      slice.map((r) => services.db.prepare("DELETE FROM form_uploads WHERE id = ?").bind(r.id)),
    );
  }
  return rows.length;
}

/**
 * Retention: files whose submission is gone (purged or deleted) and uploads never attached to a
 * submission within a day.
 */
export async function purgeUploads(services: Services): Promise<number> {
  const rows = await services.db
    .prepare(
      `SELECT u.id, u.site_id FROM form_uploads u
       WHERE (u.status != 'attached' AND u.expires_at < ?)
          OR (u.status = 'attached' AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.id = u.submission_id))
       LIMIT 5000`,
    )
    .bind(services.now())
    .all<{ id: string; site_id: string }>();
  return removeRows(services, rows.results);
}

export async function uploadBytesForSite(db: D1Database, siteId: string): Promise<number> {
  return uploadBytesUsed(db, siteId);
}
