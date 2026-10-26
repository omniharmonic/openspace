import { type APIRequestContext, type APIResponse, expect, request } from "@playwright/test";
import { HUB_URL, STUDIO_URL } from "./env";

/** A unique, human-looking name per call so every test gets fresh dev users and sites. */
let seq = 0;
export function unique(base: string): string {
  seq += 1;
  const tag = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}${seq}`;
  return `${base} ${tag}`;
}

export interface SiteView {
  id: string;
  name: string;
  status: string;
  url: string | null;
  role?: string;
  repo?: string;
  [k: string]: unknown;
}

async function ok<T>(res: APIResponse, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what} → ${res.status()} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as unknown as T;
}

/**
 * Hub API client for one signed-in dev user (its own cookie jar). Used to arrange data and to
 * assert Hub-side state; the flows under test are still driven through Studio and the live site.
 */
export class Hub {
  constructor(
    readonly api: APIRequestContext,
    readonly user: { id: string; login: string; name: string },
  ) {}

  /** Sign a new dev user in (fresh cookie jar). */
  static async login(name: string): Promise<Hub> {
    const api = await request.newContext({ baseURL: HUB_URL });
    const user = await devLogin(api, name);
    return new Hub(api, user);
  }

  async get<T = Record<string, unknown>>(path: string): Promise<T> {
    return ok<T>(await this.api.get(path), `GET ${path}`);
  }
  async post<T = Record<string, unknown>>(path: string, data?: unknown): Promise<T> {
    return ok<T>(await this.api.post(path, { data: data ?? {} }), `POST ${path}`);
  }
  async patch<T = Record<string, unknown>>(path: string, data?: unknown): Promise<T> {
    return ok<T>(await this.api.patch(path, { data: data ?? {} }), `PATCH ${path}`);
  }
  async put<T = Record<string, unknown>>(path: string, data?: unknown): Promise<T> {
    return ok<T>(await this.api.put(path, { data: data ?? {} }), `PUT ${path}`);
  }
  async del<T = Record<string, unknown>>(path: string, data?: unknown): Promise<T> {
    return ok<T>(await this.api.delete(path, { data }), `DELETE ${path}`);
  }

  /** Create a site through the real Hub (DevGitHub) and wait until it is live. */
  async createSite(input: {
    name: string;
    template?: string;
    look?: string;
    tagline?: string;
  }): Promise<SiteView> {
    const created: SiteView = await this.post<SiteView>("/api/sites", {
      template: "meadow",
      ...input,
    });
    await expect
      .poll(async () => (await this.site(created.id)).status, { timeout: 30_000 })
      .toBe("live");
    return this.site(created.id);
  }

  async site(id: string): Promise<SiteView> {
    const res = await this.get<SiteView & { site?: SiteView }>(`/api/sites/${id}`);
    return res.site ?? res;
  }

  /** The room's live draft document (what Studio edits). */
  async draft(siteId: string): Promise<{ document: SiteDoc; seq: number; head: string }> {
    return this.get(`/api/sites/${siteId}/room/document`);
  }

  /** Submit ops to the draft room as this person (HTTP fallback path of the room). */
  async ops(siteId: string, ops: unknown[]) {
    const res = await this.post<{ results: { status: string; message?: string }[]; seq: number }>(
      `/api/sites/${siteId}/room/ops`,
      { ops },
    );
    for (const r of res.results) expect(r.status, JSON.stringify(r)).toBe("accepted");
    return res;
  }

  async publish(siteId: string) {
    return this.post<SiteView & { publish: { status: string; sha?: string } | null }>(
      `/api/sites/${siteId}/publish`,
    );
  }

  /** Invite `other` (by login) with `role` and accept as them. */
  async addCollaborator(siteId: string, other: Hub, role: "designer" | "editor" | "contributor") {
    const { acceptUrl } = await this.post<{ acceptUrl: string }>(`/api/sites/${siteId}/collaborators`, {
      login: other.user.login,
      role,
    });
    const token = acceptUrl.split("/invite/")[1];
    await other.post(`/api/invitations/${token}/accept`);
  }

  async dispose() {
    await this.api.dispose();
  }
}

export async function devLogin(api: APIRequestContext, name: string) {
  const res = await api.post(`${HUB_URL}/auth/dev/login`, {
    data: { name },
    headers: { origin: STUDIO_URL },
  });
  const body = await ok<{ user: { id: string; login: string; name: string } }>(res, "dev login");
  return body.user;
}

/** Minimal shape of the parts of a SiteDocument the specs read. */
export interface SiteDoc {
  site: { title: string; tagline?: string; [k: string]: unknown };
  styles: Record<string, unknown> & { colors?: unknown; fonts?: unknown };
  pages: Record<
    string,
    {
      id: string;
      slug: string;
      title: string;
      sections: Array<{
        id: string;
        preset?: string;
        layout: { mode: string; [k: string]: unknown };
        blocks: Array<{ id: string; type: string; fields: Record<string, unknown> }>;
        [k: string]: unknown;
      }>;
      [k: string]: unknown;
    }
  >;
  media?: Record<string, { mime?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** Plain (anonymous) request context against the Hub: public endpoints, dev outbox, cron. */
export async function anonHub(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: HUB_URL });
}

/** Run a cron trigger on the dev Hub (`wrangler dev --test-scheduled`). */
export async function runCron(cron = "* * * * *") {
  const api = await anonHub();
  const res = await api.get(`/__scheduled?cron=${encodeURIComponent(cron)}`);
  expect(res.ok(), await res.text()).toBe(true);
  await api.dispose();
}

export interface OutboxMessage {
  id: string;
  siteId: string | null;
  to: string;
  from: string;
  subject: string;
  kind: string;
  createdAt: string;
  headers: Record<string, string>;
  text: string;
  links: string[];
}

/** Wait for a message in the dev outbox (`/dev/outbox.json`). */
export async function waitForMail(filter: {
  to: string;
  kind?: string;
  subject?: RegExp;
}): Promise<OutboxMessage> {
  const api = await anonHub();
  let found: OutboxMessage | undefined;
  await expect
    .poll(
      async () => {
        const q = new URLSearchParams({
          to: filter.to,
          ...(filter.kind ? { kind: filter.kind } : {}),
        });
        const res = await api.get(`/dev/outbox.json?${q}`);
        const { messages } = (await res.json()) as { messages: OutboxMessage[] };
        found = messages.find((m) => !filter.subject || filter.subject.test(m.subject));
        return !!found;
      },
      { timeout: 20_000, message: `mail to ${filter.to} (${filter.kind ?? "any"})` },
    )
    .toBe(true);
  await api.dispose();
  return found as OutboxMessage;
}

/** First page / section / block helpers over a document. */
export function homePage(doc: SiteDoc) {
  const home = Object.values(doc.pages).find((p) => p.slug === "");
  if (!home) throw new Error("no home page");
  return home;
}

export function allBlocks(doc: SiteDoc) {
  return Object.values(doc.pages).flatMap((p) =>
    p.sections.flatMap((s) => s.blocks.map((b) => ({ page: p, section: s, block: b }))),
  );
}

/** Extract every text string from a rich-text doc or plain value (for "contains" checks). */
export function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textOf).join(" ");
  return "";
}
