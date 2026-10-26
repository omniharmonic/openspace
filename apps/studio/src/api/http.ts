import {
  type CreateSiteInput,
  type GitHubSignInParams,
  type HubApi,
  HubError,
  type Session,
  type Site,
  type SiteDocumentResponse,
  type TemplateSummary,
  type TransferResult,
  type User,
} from "./types";

export const DEFAULT_HUB_URL = "http://localhost:8787";

export interface HttpHubOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Where to send the browser for GitHub sign-in (overridable for tests). */
  navigate?: (url: string) => void;
}

const SIGNED_OUT: Session = { user: null, auth: { github: true, dev: false } };

async function readError(res: Response): Promise<HubError> {
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
    // Non-JSON error body; keep the status text.
  }
  return new HubError(res.status, code, message);
}

/** Hub client over fetch. Cookies carry the session (`credentials: "include"`). */
export function createHttpHub(options: HttpHubOptions = {}): HubApi {
  const baseUrl = (options.baseUrl ?? DEFAULT_HUB_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new HubError(
        0,
        "network",
        `Can't reach OpenSpace at ${baseUrl}. Check your connection.`,
      );
    }
    if (!res.ok) throw await readError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    kind: "http",

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

    async createSite(input: CreateSiteInput) {
      const res = await request<{ site: Site } | Site>("POST", "/api/sites", input);
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

    async getDocument(id) {
      return request<SiteDocumentResponse>("GET", `/api/sites/${encodeURIComponent(id)}/document`);
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
