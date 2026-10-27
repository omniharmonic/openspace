/**
 * Forms (architecture §9.1, PRD FR-30..32): the forms manifest, validation, submissions and the
 * Studio inbox.
 *
 * Manifest sources, in order:
 * - dev GitHub emulation: derived from the published document (every value in the content that
 *   parses as `FormSchema` — the `form` block keeps it in `fields.form`), cached in `forms` by the
 *   `main` head SHA;
 * - production: the site's published `/_os/forms.json` (cached in `forms` by content hash), with
 *   the cached rows and then the published document as fallbacks.
 *
 * Assumed `/_os/forms.json` shape (site-kit, Task 10):
 *   `{ "version": 1, "hash"?: string, "forms": Form[] | Record<formId, Form> }`, where each form
 *   may carry an extra `"redirectHref"` (the resolved success-redirect URL or path).
 */
import {
  type Form,
  FormSchema,
  formRedirectHref,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import type { SiteRow } from "../db/sites";
import { MAIN_BRANCH, parseRepo } from "../github/types";
import { sha256Hex } from "../lib/crypto";
import type { FieldValues } from "../lib/public";
import { downloadUrl } from "./form-uploads";
import { gatedContext, loadOpenedDocument } from "./gated-content";
import type { Services } from "./index";

export interface ManifestForm {
  form: Form;
  /** Absolute URL or site path to send people to after a no-JS submission (success redirect). */
  redirectHref: string | null;
}

// ---- manifest -------------------------------------------------------------------------------------

/** Every form defined anywhere in a document (deep scan for `FormSchema`-shaped values). */
export function formsInDocument(doc: SiteDocument): ManifestForm[] {
  const found = new Map<string, ManifestForm>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && o.id.startsWith("frm_") && Array.isArray(o.fields)) {
      const parsed = FormSchema.safeParse(o);
      if (parsed.success && !found.has(parsed.data.id)) {
        const redirectHref = formRedirectHref(parsed.data, doc.pages);
        found.set(parsed.data.id, { form: parsed.data, redirectHref });
      }
      return;
    }
    for (const x of Object.values(o)) visit(x, depth + 1);
  };
  visit(doc.site, 0);
  visit(doc.pages, 0);
  return [...found.values()];
}

/** Parse a published `/_os/forms.json`. Invalid entries are skipped. */
export function parseManifest(body: unknown): ManifestForm[] {
  const b = (body ?? {}) as { forms?: unknown };
  const list = Array.isArray(b.forms)
    ? b.forms
    : b.forms && typeof b.forms === "object"
      ? Object.values(b.forms)
      : [];
  const out: ManifestForm[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const { redirectHref, ...rest } = raw as Record<string, unknown>;
    const parsed = FormSchema.safeParse(rest);
    if (parsed.success)
      out.push({
        form: parsed.data,
        redirectHref: typeof redirectHref === "string" ? redirectHref : null,
      });
  }
  return out;
}

interface FormRow {
  id: string;
  site_id: string;
  name: string | null;
  schema_json: string | null;
  schema_hash: string | null;
  source_ref: string | null;
  notify: string | null;
}

function rowToManifest(row: FormRow): ManifestForm | null {
  if (!row.schema_json) return null;
  try {
    const v = JSON.parse(row.schema_json) as ManifestForm;
    const parsed = FormSchema.safeParse(v.form);
    return parsed.success ? { form: parsed.data, redirectHref: v.redirectHref ?? null } : null;
  } catch {
    return null;
  }
}

async function cachedForms(db: D1Database, siteId: string): Promise<FormRow[]> {
  return (await db.prepare("SELECT * FROM forms WHERE site_id = ?").bind(siteId).all<FormRow>())
    .results;
}

async function storeManifest(
  services: Services,
  siteId: string,
  forms: ManifestForm[],
  sourceRef: string,
): Promise<void> {
  const { db } = services;
  const now = services.now();
  const stmts: D1PreparedStatement[] = [];
  for (const f of forms) {
    const json = JSON.stringify(f);
    stmts.push(
      db
        .prepare(
          `INSERT INTO forms (id, site_id, name, schema_json, schema_hash, source_ref, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (site_id, id) DO UPDATE SET name = excluded.name, schema_json = excluded.schema_json,
             schema_hash = excluded.schema_hash, source_ref = excluded.source_ref, updated_at = excluded.updated_at`,
        )
        .bind(f.form.id, siteId, f.form.name, json, await sha256Hex(json), sourceRef, now),
    );
  }
  // Forms removed from the site keep their row (entries still reference the name) but lose
  // their schema, so new submissions to them are refused.
  stmts.push(
    db
      .prepare(
        "UPDATE forms SET schema_json = NULL, source_ref = ? WHERE site_id = ? AND source_ref IS NOT ?",
      )
      .bind(sourceRef, siteId, sourceRef),
  );
  await db.batch(stmts);
}

async function manifestFromDocument(services: Services, site: SiteRow): Promise<ManifestForm[]> {
  const gh = services.github({ site });
  const repo = parseRepo(site.repo);
  const head = await gh.getRef(repo, MAIN_BRANCH);
  if (!head) return [];
  const rows = await cachedForms(services.db, site.id);
  if (rows.length && rows.every((r) => r.source_ref === head))
    return rows.map(rowToManifest).filter((f): f is ManifestForm => f !== null);
  // Forms on members-only pages count too (their content is opened from the Hub's storage).
  const files = await gh.readFiles(repo, head, { textOnly: true });
  const forms = formsInDocument(await loadOpenedDocument(gatedContext(services, site.id), files));
  await storeManifest(services, site.id, forms, head);
  return forms;
}

async function manifestFromSite(
  services: Services,
  site: SiteRow,
  baseUrl: string,
): Promise<ManifestForm[] | null> {
  try {
    const res = await services.fetch(new URL("_os/forms.json", baseUrl).toString(), {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 60, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    const text = await res.text();
    const body = JSON.parse(text) as { hash?: unknown };
    const hash = typeof body.hash === "string" ? body.hash : await sha256Hex(text);
    const rows = await cachedForms(services.db, site.id);
    if (rows.length && rows.every((r) => r.source_ref === hash))
      return rows.map(rowToManifest).filter((f): f is ManifestForm => f !== null);
    const forms = parseManifest(body);
    await storeManifest(services, site.id, forms, hash);
    return forms;
  } catch {
    return null;
  }
}

/** The site's current forms. */
export async function loadManifest(
  services: Services,
  site: SiteRow,
  baseUrl: string,
): Promise<ManifestForm[]> {
  if (services.config.useDevGitHub) return manifestFromDocument(services, site);
  const fromSite = await manifestFromSite(services, site, baseUrl);
  if (fromSite) return fromSite;
  const cached = (await cachedForms(services.db, site.id))
    .map(rowToManifest)
    .filter((f): f is ManifestForm => f !== null);
  if (cached.length) return cached;
  return manifestFromDocument(services, site).catch(() => []);
}

// ---- validation -----------------------------------------------------------------------------------

export type SubmissionValue = string | string[] | boolean;
export type SubmissionData = Record<string, SubmissionValue>;

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;
const PHONE_RE = /^\+?[\d\s().-]{5,30}$/;
const TRUE_VALUES = new Set(["yes", "on", "true", "1"]);

export function validateSubmission(
  form: Form,
  values: FieldValues,
): { ok: true; data: SubmissionData } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const data: SubmissionData = {};
  for (const field of form.fields) {
    const raw = values[field.name];
    const list = (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw])
      .map((v) => v.trim())
      .filter((v) => v !== "");
    const one = list[list.length - 1] ?? "";
    const label = field.label;
    const requiredMsg = `Please fill in ${label}.`;
    switch (field.type) {
      case "checkbox": {
        if (field.options) {
          const bad = list.find((v) => !field.options?.includes(v));
          if (bad) errors[field.name] = `Please choose from the listed options for ${label}.`;
          else if (field.required && !list.length)
            errors[field.name] = `Please choose at least one option for ${label}.`;
          else if (list.length) data[field.name] = [...new Set(list)];
        } else {
          const checked = TRUE_VALUES.has(one.toLowerCase());
          if (field.required && !checked) errors[field.name] = `Please tick ${label}.`;
          else data[field.name] = checked;
        }
        break;
      }
      case "select": {
        const chosen = field.multiple ? [...new Set(list)] : one ? [one] : [];
        if (chosen.some((v) => !field.options.includes(v)))
          errors[field.name] = `Please choose from the listed options for ${label}.`;
        else if (field.required && !chosen.length) errors[field.name] = requiredMsg;
        else if (chosen.length) data[field.name] = field.multiple ? chosen : (chosen[0] as string);
        break;
      }
      case "radio": {
        if (one && !field.options.includes(one))
          errors[field.name] = `Please choose from the listed options for ${label}.`;
        else if (field.required && !one) errors[field.name] = requiredMsg;
        else if (one) data[field.name] = one;
        break;
      }
      default: {
        if (!one) {
          if (field.required) errors[field.name] = requiredMsg;
          break;
        }
        const max =
          field.type === "textarea"
            ? (field.maxLength ?? 10_000)
            : field.type === "text"
              ? (field.maxLength ?? 1_000)
              : 320;
        if (one.length > max)
          errors[field.name] = `${label} is too long (${max} characters at most).`;
        else if (field.type === "email" && !EMAIL_RE.test(one))
          errors[field.name] = "Please enter a valid email address.";
        else if (field.type === "phone" && !PHONE_RE.test(one))
          errors[field.name] = "Please enter a valid phone number.";
        else if (field.type === "date" && !isIsoDate(one))
          errors[field.name] = "Please enter a valid date.";
        else data[field.name] = one;
      }
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Cheap content filter: link-stuffed or script-y entries are kept but flagged as spam. */
export function spamScore(data: SubmissionData): number {
  const text = Object.values(data)
    .flat()
    .filter((v): v is string => typeof v === "string")
    .join("\n");
  const links = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  let score = 0;
  if (links >= 5) score += 0.6;
  else if (links >= 3) score += 0.3;
  if (/<a\s+href|\[url=|<script/i.test(text)) score += 0.5;
  return Math.min(1, score);
}

export const SPAM_THRESHOLD = 0.7;

/** Display label/value pairs for notifications and CSV. */
export function displayEntries(
  form: Form | null,
  data: SubmissionData,
): Array<{ name: string; label: string; value: string }> {
  const fmt = (v: SubmissionValue | undefined) =>
    v === undefined
      ? ""
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : Array.isArray(v)
          ? v.join(", ")
          : v;
  const known = form?.fields ?? [];
  const out = known.map((f) => ({ name: f.name, label: f.label, value: fmt(data[f.name]) }));
  for (const [k, v] of Object.entries(data))
    if (!known.some((f) => f.name === k)) out.push({ name: k, label: k, value: fmt(v) });
  return out;
}

export function replyToFrom(form: Form | null, data: SubmissionData): string | undefined {
  const emailField = form?.fields.find((f) => f.type === "email");
  const v = emailField ? data[emailField.name] : undefined;
  return typeof v === "string" && EMAIL_RE.test(v) ? v : undefined;
}

// ---- inbox ----------------------------------------------------------------------------------------

export interface SubmissionRow {
  id: string;
  site_id: string;
  form_id: string;
  data_json: string;
  files: string | null;
  spam_score: number | null;
  read_at: number | null;
  created_at: number;
  purge_at: number | null;
  source: string | null;
  notified_at: number | null;
  form_name?: string | null;
}

export interface SubmissionView {
  id: string;
  formId: string;
  formName: string | null;
  data: SubmissionData;
  read: boolean;
  spam: boolean;
  source: string | null;
  createdAt: string;
  purgeAt: string | null;
  /** Uploaded files (file fields); `url` is a signed, short-lived download link. */
  files?: Array<{
    field: string;
    id: string;
    name: string;
    type: string;
    size: number;
    url?: string;
  }>;
}

export function toSubmissionView(r: SubmissionRow): SubmissionView {
  let data: SubmissionData = {};
  try {
    data = JSON.parse(r.data_json) as SubmissionData;
  } catch {
    /* keep empty */
  }
  let files: SubmissionView["files"];
  try {
    const parsed = r.files ? (JSON.parse(r.files) as SubmissionView["files"]) : undefined;
    if (Array.isArray(parsed) && parsed.length) files = parsed;
  } catch {
    /* no files */
  }
  return {
    ...(files ? { files } : {}),
    id: r.id,
    formId: r.form_id,
    formName: r.form_name ?? null,
    data,
    read: r.read_at !== null,
    spam: (r.spam_score ?? 0) >= SPAM_THRESHOLD,
    source: r.source,
    createdAt: new Date(r.created_at).toISOString(),
    purgeAt: r.purge_at ? new Date(r.purge_at).toISOString() : null,
  };
}

export interface InboxQuery {
  form?: string;
  q?: string;
  unread?: boolean;
  spam?: boolean;
  limit: number;
  /** created_at|id of the last row of the previous page. */
  cursor?: string;
}

const SELECT_SUB = `SELECT s.*, f.name AS form_name FROM submissions s
  LEFT JOIN forms f ON f.site_id = s.site_id AND f.id = s.form_id`;

export async function listSubmissions(db: D1Database, siteId: string, q: InboxQuery) {
  const where = ["s.site_id = ?"];
  const args: unknown[] = [siteId];
  if (q.form) {
    where.push("s.form_id = ?");
    args.push(q.form);
  }
  if (q.unread) where.push("s.read_at IS NULL");
  where.push(
    q.spam ? `s.spam_score >= ${SPAM_THRESHOLD}` : `COALESCE(s.spam_score, 0) < ${SPAM_THRESHOLD}`,
  );
  if (q.q) {
    where.push("s.data_json LIKE ? ESCAPE '\\'");
    args.push(`%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  const base = [...where];
  const baseArgs = [...args];
  if (q.cursor) {
    const [at, id] = q.cursor.split("|");
    where.push("(s.created_at < ? OR (s.created_at = ? AND s.id < ?))");
    args.push(Number(at), Number(at), id ?? "");
  }
  const rows = await db
    .prepare(
      `${SELECT_SUB} WHERE ${where.join(" AND ")} ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    )
    .bind(...args, q.limit + 1)
    .all<SubmissionRow>();
  const page = rows.results.slice(0, q.limit);
  const last = page[page.length - 1];
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN s.read_at IS NULL THEN 1 ELSE 0 END) AS unread
       FROM submissions s WHERE ${base.join(" AND ")}`,
    )
    .bind(...baseArgs)
    .first<{ total: number; unread: number | null }>();
  return {
    submissions: page.map(toSubmissionView),
    nextCursor: rows.results.length > q.limit && last ? `${last.created_at}|${last.id}` : null,
    total: counts?.total ?? 0,
    unread: counts?.unread ?? 0,
  };
}

export async function getSubmission(db: D1Database, siteId: string, id: string) {
  return db
    .prepare(`${SELECT_SUB} WHERE s.site_id = ? AND s.id = ?`)
    .bind(siteId, id)
    .first<SubmissionRow>();
}

export async function allSubmissions(db: D1Database, siteId: string, formId?: string) {
  const rows = await db
    .prepare(
      `${SELECT_SUB} WHERE s.site_id = ?${formId ? " AND s.form_id = ?" : ""} ORDER BY s.created_at DESC`,
    )
    .bind(...(formId ? [siteId, formId] : [siteId]))
    .all<SubmissionRow>();
  return rows.results;
}

/** Add signed download links to the files of inbox entries. */
export async function withFileLinks<T extends { submissions: SubmissionView[] } | SubmissionView>(
  services: Services,
  siteId: string,
  value: T,
): Promise<T> {
  const views: SubmissionView[] =
    "submissions" in value ? value.submissions : [value as SubmissionView];
  for (const v of views)
    if (v.files)
      v.files = await Promise.all(
        v.files.map(async (f) => ({ ...f, url: await downloadUrl(services, siteId, f.id) })),
      );
  return value;
}
