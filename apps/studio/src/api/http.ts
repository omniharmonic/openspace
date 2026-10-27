import type { RoomSocket } from "../features/sync/protocol";
import { createCatalogHttp } from "./catalog-http";
import { createGrowthHttp } from "./growth-http";
import { createManageHttp } from "./manage-http";
import {
  BUSY_MESSAGE,
  type RetryOptions,
  TRANSIENT_STATUSES,
  unreachableMessage,
  withRetry,
} from "./resilience";
import {
  type AgentUndoResult,
  type CreateSiteInput,
  type FixResult,
  type GitHubSignInParams,
  type HubApi,
  HubError,
  type PublishResponse,
  type PublishSchedule,
  type RollbackResult,
  type RoomDocumentResponse,
  type Session,
  type Site,
  type SiteDocumentResponse,
  type SiteVersion,
  type Snapshot,
  type TemplateSummary,
  type TransferResult,
  type User,
} from "./types";

export const DEFAULT_HUB_URL = "http://localhost:8787";

/** The Hub this Studio talks to (`VITE_HUB_URL`), without a trailing slash. */
export function configuredHubUrl(env: Partial<ImportMetaEnv> = import.meta.env): string {
  return (env.VITE_HUB_URL || DEFAULT_HUB_URL).replace(/\/+$/, "");
}

/** The Hub's remote MCP endpoint (OAuth sign-in), e.g. `https://hub.openspace.host/mcp`. */
export function hubMcpUrl(env: Partial<ImportMetaEnv> = import.meta.env): string {
  return `${configuredHubUrl(env)}/mcp`;
}

export interface HttpHubOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Where to send the browser for GitHub sign-in (overridable for tests). */
  navigate?: (url: string) => void;
  /** WebSocket constructor for the draft room (overridable for tests). */
  WebSocket?: typeof WebSocket;
  /** Backoff for idempotent requests on network errors / 502-504 (`false` turns it off). */
  retry?: RetryOptions | false;
}

const SIGNED_OUT: Session = { user: null, auth: { github: true, dev: false } };

export async function readError(res: Response): Promise<HubError> {
  let code = `http_${res.status}`;
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string | { code?: string; message?: string } };
    if (typeof body.error === "string") message = body.error;
    else if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // Non-JSON error body (e.g. the platform's HTML error page); keep the status text.
    if (TRANSIENT_STATUSES.has(res.status)) {
      code = "unavailable";
      message = BUSY_MESSAGE;
    }
  }
  return new HubError(res.status, code, message);
}

/** Hub client over fetch. Cookies carry the session (`credentials: "include"`). */
export function createHttpHub(options: HttpHubOptions = {}): HubApi {
  const baseUrl = (options.baseUrl ?? DEFAULT_HUB_URL).replace(/\/+$/, "");
  const baseFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const doFetch = options.retry === false ? baseFetch : withRetry(baseFetch, options.retry);
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));

  const site = (id: string) => `/api/sites/${encodeURIComponent(id)}`;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new HubError(0, "network", unreachableMessage());
    }
    if (!res.ok) throw await readError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    kind: "http",
    ...createManageHttp({ request, baseUrl, fetch: doFetch, readError }),
    ...createCatalogHttp({ request }),
    ...createGrowthHttp({ request, baseUrl, fetch: doFetch, readError }),

    async getSession() {
      try {
        return await request<Session>("GET", "/api/me");
      } catch (err) {
        if (err instanceof HubError && err.status === 401) return SIGNED_OUT;
        throw err;
      }
    },

    async devLogin(name) {
      const res = await request<{ user: User } | User>("POST", "/auth/dev/login", { name });
      return "user" in res ? res.user : res;
    },

    async startGitHubSignIn(params: GitHubSignInParams) {
      navigate(githubStartUrl(baseUrl, params));
      return null;
    },

    async logout() {
      await request<void>("POST", "/auth/logout");
    },

    async listTemplates() {
      const res = await request<{ templates: TemplateSummary[] } | TemplateSummary[]>(
        "GET",
        "/api/templates",
      );
      return Array.isArray(res) ? res : res.templates;
    },

    async listSites() {
      const res = await request<{ sites: Site[] } | Site[]>("GET", "/api/sites");
      return Array.isArray(res) ? res : res.sites;
    },

    async getSite(id) {
      const res = await request<{ site: Site } | Site>(
        "GET",
        `/api/sites/${encodeURIComponent(id)}`,
      );
      return "site" in res ? res.site : res;
    },

    async createSite(input: CreateSiteInput, opts) {
      const res = await request<{ site: Site } | Site>(
        "POST",
        "/api/sites",
        input,
        opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined,
      );
      return "site" in res ? res.site : res;
    },

    async retryPublish(id) {
      const res = await request<{ site: Site } | Site>(
        "POST",
        `/api/sites/${encodeURIComponent(id)}/publish`,
        {},
      );
      return "site" in res ? res.site : res;
    },

    async deleteSite(id, confirmName) {
      await request<void>("DELETE", `/api/sites/${encodeURIComponent(id)}`, {
        confirm: confirmName,
      });
    },

    async getDocument(id, opts) {
      const q = opts?.ref === "published" ? "?ref=published" : "";
      return request<SiteDocumentResponse>("GET", `${site(id)}/document${q}`);
    },

    async getRoomDocument(id) {
      const res = await request<RoomDocumentResponse>("GET", `${site(id)}/room/document`);
      return { document: res.document, seq: res.seq, head: res.head ?? null };
    },

    connectRoom(id, since) {
      const url = new URL(`${baseUrl}${site(id)}/room`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (since !== null) url.searchParams.set("since", String(since));
      const Ctor = options.WebSocket ?? globalThis.WebSocket;
      const ws = new Ctor(url.toString());
      const sock: RoomSocket = {
        send: (data) => ws.send(data),
        close: (code, reason) => ws.close(code, reason),
        onopen: null,
        onmessage: null,
        onclose: null,
      };
      ws.onopen = () => sock.onopen?.();
      ws.onmessage = (e) => {
        if (typeof e.data === "string") sock.onmessage?.(e.data);
      };
      ws.onclose = (e) => sock.onclose?.(e.code, e.reason);
      return sock;
    },

    async undoAgentSession(id, sessionId) {
      return request<AgentUndoResult>(
        "POST",
        `${site(id)}/room/agent-sessions/${encodeURIComponent(sessionId)}/undo`,
        {},
      );
    },

    async publish(id) {
      const res = await request<Site & { publish: PublishResponse["publish"] }>(
        "POST",
        `${site(id)}/publish`,
        {},
      );
      const { publish, ...rest } = res;
      return { site: rest as Site, publish: publish ?? null };
    },

    async fixLastPublish(id) {
      return request<FixResult>("POST", `${site(id)}/fix`, {});
    },

    async listVersions(id) {
      const res = await request<{ versions: SiteVersion[] }>("GET", `${site(id)}/versions`);
      return res.versions;
    },

    async rollback(id, sha) {
      return request<RollbackResult>("POST", `${site(id)}/rollback`, { sha });
    },

    versionPreviewUrl(id, sha) {
      return `${baseUrl}/s/${encodeURIComponent(id)}/?version=${encodeURIComponent(sha)}`;
    },

    draftMediaBase(id) {
      return `${baseUrl}${site(id)}/`;
    },

    async listSnapshots(id) {
      const res = await request<{ snapshots: Snapshot[] }>("GET", `${site(id)}/snapshots`);
      return res.snapshots;
    },

    async createSnapshot(id, name) {
      return request<{ name: string; tag: string; sha: string }>("POST", `${site(id)}/snapshots`, {
        name,
      });
    },

    async restoreSnapshot(id, name) {
      return request<{ applied: number; failed: number; seq: number }>(
        "POST",
        `${site(id)}/snapshots/${encodeURIComponent(name)}/restore`,
        {},
      );
    },

    async listSchedules(id) {
      const res = await request<{ schedules: PublishSchedule[] }>("GET", `${site(id)}/schedule`);
      return res.schedules;
    },

    async schedulePublish(id, at) {
      return request<PublishSchedule>("POST", `${site(id)}/schedule`, { at: at.toISOString() });
    },

    async cancelSchedule(id, scheduleId) {
      await request<void>("DELETE", `${site(id)}/schedule/${encodeURIComponent(scheduleId)}`);
    },

    async transferSite(id, to) {
      return request<TransferResult>("POST", `/api/sites/${encodeURIComponent(id)}/transfer`, {
        to,
      });
    },
  };
}

/** `GET /auth/github/start?template=&name=&return_to=` */
export function githubStartUrl(baseUrl: string, params: GitHubSignInParams): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/auth/github/start`);
  if (params.template) url.searchParams.set("template", params.template);
  if (params.name) url.searchParams.set("name", params.name);
  if (params.returnTo) {
    const back =
      typeof window !== "undefined"
        ? new URL(params.returnTo, window.location.origin).toString()
        : params.returnTo;
    url.searchParams.set("return_to", back);
  }
  return url.toString();
}
