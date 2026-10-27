import { env } from "cloudflare:test";
import type { Form } from "@omniharmonic/openspace-schema";
import { createApp } from "../src/app";
import { DevGitHubAccess } from "../src/github/dev";
import { MAIN_BRANCH, parseRepo } from "../src/github/types";
import type { ServiceOverrides } from "../src/services";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import { call, devLogin, type TestApp } from "./helpers";

export const CONTACT_FORM: Form = {
  id: "frm_c0ntact0ne",
  name: "Contact",
  fields: [
    { type: "text", name: "name", label: "Name", required: true },
    { type: "email", name: "email", label: "Email", required: true },
    { type: "phone", name: "phone", label: "Phone" },
    { type: "select", name: "topic", label: "Topic", options: ["Classes", "Retreats"] },
    { type: "checkbox", name: "interests", label: "Interests", options: ["Yoga", "Breath"] },
    { type: "checkbox", name: "updates", label: "Send me the letter" },
    { type: "date", name: "when", label: "Preferred date" },
    { type: "textarea", name: "message", label: "Message", required: true, maxLength: 2000 },
  ],
  submitLabel: "Send",
  success: { type: "message", message: "Thank you — we reply within two days." },
  notifyOwner: true,
};

export interface SiteFixture {
  app: TestApp;
  cookie: string;
  siteId: string;
  repo: string;
  url: string;
  name: string;
}

export function makePublicApp(overrides: ServiceOverrides = {}): TestApp {
  return createApp({
    services: {
      ...overrides,
      public: { rateLimit: new MemoryRateLimiter(), ...(overrides.public ?? {}) },
    },
  });
}

/** Create a dev site and add a form block (fields.form) to its published home page. */
export async function siteWithForm(
  app: TestApp,
  opts: { name?: string; user?: string; form?: Form | null } = {},
): Promise<SiteFixture> {
  const cookie = await devLogin(app, opts.user ?? "Maya Lin");
  const name = opts.name ?? "Maya Yoga";
  const res = await call(app, "/api/sites", {
    method: "POST",
    cookie,
    json: { template: "basic", name },
  });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${await res.text()}`);
  const site = (await res.json()) as { id: string; repo: string; url: string };
  if (opts.form !== null) {
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = parseRepo(site.repo);
    const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
    const page = JSON.parse((await gh.readFile(repo, "content/pages/home.json", head)) as string);
    page.sections[page.sections.length - 1].blocks.push({
      id: "blk_f0rmb10ck0",
      type: "form",
      v: 1,
      fields: { form: opts.form ?? CONTACT_FORM },
    });
    await gh.commitFiles(repo, {
      branch: MAIN_BRANCH,
      expectedHead: head,
      message: "Add contact form",
      files: [{ path: "content/pages/home.json", content: JSON.stringify(page, null, 2) }],
    });
  }
  return { app, cookie, siteId: site.id, repo: site.repo, url: site.url, name };
}

export async function outbox(app: TestApp, query = "") {
  const res = await call(app, `/dev/outbox.json${query}`);
  return (
    (await res.json()) as {
      messages: Array<{
        id: string;
        to: string;
        subject: string;
        kind: string;
        links: string[];
        headers: Record<string, string>;
        replyTo: string | null;
        siteId: string | null;
      }>;
    }
  ).messages;
}

export async function setSettings(f: SiteFixture, patch: Record<string, unknown>) {
  const res = await call(f.app, `/api/sites/${f.siteId}/services/settings`, {
    method: "PATCH",
    cookie: f.cookie,
    json: patch,
  });
  if (res.status !== 200) throw new Error(`settings failed ${res.status} ${await res.text()}`);
}

export async function setQuota(siteId: string, quotas: Record<string, number>) {
  await env.HUB_DB.prepare("UPDATE sites SET plan_flags = ? WHERE id = ?")
    .bind(JSON.stringify({ quotas }), siteId)
    .run();
}

export function postForm(
  f: SiteFixture,
  fields: Record<string, string | string[]>,
  opts: {
    json?: boolean;
    headers?: Record<string, string>;
    formId?: string;
    multipart?: boolean;
  } = {},
) {
  const path = `/f/${f.siteId}/${opts.formId ?? CONTACT_FORM.id}`;
  const headers = new Headers(opts.headers);
  if (opts.json) {
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    return call(f.app, path, { method: "POST", headers, body: JSON.stringify(fields) });
  }
  if (opts.multipart) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields))
      for (const x of Array.isArray(v) ? v : [v]) fd.append(Array.isArray(v) ? `${k}[]` : k, x);
    headers.set("Accept", "application/json");
    return call(f.app, path, { method: "POST", headers, body: fd });
  }
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields))
    for (const x of Array.isArray(v) ? v : [v]) body.append(Array.isArray(v) ? `${k}[]` : k, x);
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  return call(f.app, path, { method: "POST", headers, body: body.toString(), redirect: "manual" });
}

export const VALID = {
  name: "Ana Ruiz",
  email: "ana@example.com",
  message: "I'd love to join a Saturday class.",
};
