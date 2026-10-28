import type {
  Approval,
  CloudflareCheck,
  Collaborator,
  CollaboratorList,
  CollaboratorRole,
  DomainLookup,
  DomainView,
  DownloadedFile,
  ExportKind,
  HostingInfo,
  InvitationPreview,
  InviteResult,
  ManageApi,
  McpGrant,
  McpToken,
  MediaUploadResult,
  PagePasswordEntry,
  PhoneCheckInfo,
  RegistrarGuide,
  SetupInfo,
} from "./manage-types";
import { unreachableMessage } from "./resilience";
import { HubError } from "./types";

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export interface ManageHttpDeps {
  request: Request;
  baseUrl: string;
  fetch: typeof fetch;
  readError: (res: Response) => Promise<HubError>;
}

const enc = encodeURIComponent;
const site = (id: string) => `/api/sites/${enc(id)}`;

/** `{ key: value }` envelopes or bare values (the Hub uses envelopes). */
function unwrap<T>(res: unknown, key: string): T {
  if (res && typeof res === "object" && key in (res as object))
    return (res as Record<string, T>)[key] as T;
  return res as T;
}

const EXPORT_PATHS: Record<ExportKind, { path: string; filename: string }> = {
  data: { path: "/export", filename: "openspace-data.zip" },
  submissions: { path: "/submissions.csv", filename: "form-entries.csv" },
  subscribers: { path: "/subscribers.csv", filename: "subscribers.csv" },
  members: { path: "/members.csv", filename: "members.csv" },
};

/** HTTP implementation of the site-management routes (mixed into `createHttpHub`). */
export function createManageHttp({
  request,
  baseUrl,
  fetch: doFetch,
  readError,
}: ManageHttpDeps): ManageApi {
  async function raw(method: string, path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method, credentials: "include", ...init });
    } catch {
      throw new HubError(0, "network", unreachableMessage());
    }
    if (!res.ok) throw await readError(res);
    return res;
  }

  return {
    async renameSite(siteId, name) {
      await request("PATCH", site(siteId), { name });
    },

    async uploadMedia(siteId, file, meta) {
      const form = new FormData();
      form.set("meta", JSON.stringify(meta));
      form.set("file", file, meta.path.split("/").pop() ?? "file");
      const res = await raw("POST", `${site(siteId)}/media`, {
        body: form,
        headers: { Accept: "application/json" },
      });
      return unwrap<MediaUploadResult>(await res.json(), "media");
    },

    async listPagePasswords(siteId) {
      const res = await request<{ pages: PagePasswordEntry[] }>(
        "GET",
        `${site(siteId)}/page-passwords`,
      );
      return res.pages;
    },
    async setPagePassword(siteId, pageId, password) {
      await request("PUT", `${site(siteId)}/page-passwords/${enc(pageId)}`, { password });
    },
    async clearPagePassword(siteId, pageId) {
      await request("DELETE", `${site(siteId)}/page-passwords/${enc(pageId)}`);
    },

    async listRegistrars() {
      return unwrap<RegistrarGuide[]>(
        await request("GET", "/api/domains/registrars"),
        "registrars",
      );
    },
    async getDomain(siteId) {
      return unwrap<DomainView | null>(await request("GET", `${site(siteId)}/domain`), "domain");
    },
    async lookupDomain(siteId, domain) {
      return request<DomainLookup>("POST", `${site(siteId)}/domain/lookup`, { domain });
    },
    async connectDomain(siteId, domain) {
      return unwrap<DomainView>(
        await request("POST", `${site(siteId)}/domain`, { domain }),
        "domain",
      );
    },
    async checkDomain(siteId) {
      return unwrap<DomainView>(
        await request("POST", `${site(siteId)}/domain/check`, {}),
        "domain",
      );
    },
    async removeDomain(siteId) {
      await request("DELETE", `${site(siteId)}/domain`);
    },

    async listMcpTokens(siteId) {
      return unwrap<McpToken[]>(await request("GET", `${site(siteId)}/mcp/tokens`), "tokens");
    },
    async createMcpToken(siteId, label) {
      return unwrap<McpToken>(
        await request("POST", `${site(siteId)}/mcp/tokens`, { label }),
        "token",
      );
    },
    async revokeMcpToken(siteId, tokenId) {
      await request("DELETE", `${site(siteId)}/mcp/tokens/${enc(tokenId)}`);
    },
    async setMcpTokenPublish(siteId, tokenId, publish) {
      return unwrap<McpToken>(
        await request("PATCH", `${site(siteId)}/mcp/tokens/${enc(tokenId)}`, { publish }),
        "token",
      );
    },
    async listMcpGrants() {
      return unwrap<McpGrant[]>(await request("GET", "/api/mcp/grants"), "grants");
    },
    async revokeMcpGrant(grantId) {
      await request("DELETE", `/api/mcp/grants/${enc(grantId)}`);
    },
    async setMcpGrantPublish(grantId, publish) {
      return unwrap<McpGrant>(
        await request("PATCH", `/api/mcp/grants/${enc(grantId)}`, { publish }),
        "grant",
      );
    },
    async updateMcpGrant(grantId, patch) {
      return unwrap<McpGrant>(
        await request("PATCH", `/api/mcp/grants/${enc(grantId)}`, patch),
        "grant",
      );
    },
    async allowMcpGrantSite(grantId, siteId) {
      return unwrap<McpGrant>(
        await request("POST", `/api/mcp/grants/${enc(grantId)}/sites`, { site: siteId }),
        "grant",
      );
    },
    async removeMcpGrantSite(grantId, siteId) {
      return unwrap<McpGrant>(
        await request("DELETE", `/api/mcp/grants/${enc(grantId)}/sites/${enc(siteId)}`),
        "grant",
      );
    },

    async listCollaborators(siteId) {
      return request<CollaboratorList>("GET", `${site(siteId)}/collaborators`);
    },
    async getInvitation(token) {
      return request<InvitationPreview>("GET", `/api/invitations/${enc(token)}`);
    },
    async acceptInvitation(token) {
      return request<{ siteId: string; role: CollaboratorRole }>(
        "POST",
        `/api/invitations/${enc(token)}/accept`,
      );
    },
    async inviteCollaborator(siteId, input) {
      return request<InviteResult>("POST", `${site(siteId)}/collaborators`, input);
    },
    async resendInvitation(siteId, invitationId) {
      return request<InviteResult>(
        "POST",
        `${site(siteId)}/invitations/${enc(invitationId)}/resend`,
      );
    },
    async updateCollaborator(siteId, userId, patch) {
      return unwrap<Collaborator>(
        await request("PATCH", `${site(siteId)}/collaborators/${enc(userId)}`, patch),
        "collaborator",
      );
    },
    async removeCollaborator(siteId, userId) {
      await request("DELETE", `${site(siteId)}/collaborators/${enc(userId)}`);
    },
    async revokeInvitation(siteId, invitationId) {
      await request("DELETE", `${site(siteId)}/invitations/${enc(invitationId)}`);
    },
    async listApprovals(siteId, status) {
      const q = status ? `?status=${enc(status)}` : "";
      return unwrap<Approval[]>(await request("GET", `${site(siteId)}/approvals${q}`), "approvals");
    },
    async decideApproval(siteId, approvalId, decision, note, contentHash) {
      return unwrap<Approval>(
        await request(
          "POST",
          `${site(siteId)}/approvals/${enc(approvalId)}/${decision}`,
          decision === "reject" ? { note } : contentHash ? { contentHash } : {},
        ),
        "approval",
      );
    },

    async getHosting(siteId) {
      return unwrap<HostingInfo>(await request("GET", `${site(siteId)}/hosting`), "hosting");
    },
    async putHostingSecrets(siteId, secrets) {
      await request("PUT", `${site(siteId)}/hosting/secrets`, { secrets });
    },
    async switchHosting(siteId, target, url) {
      return unwrap<HostingInfo>(
        await request("POST", `${site(siteId)}/hosting`, url ? { target, url } : { target }),
        "hosting",
      );
    },
    async checkCloudflare(siteId, token, accountId) {
      return unwrap<CloudflareCheck>(
        await request(
          "POST",
          `${site(siteId)}/hosting/cloudflare/check`,
          accountId ? { token, accountId } : { token },
        ),
        "check",
      );
    },
    async getSetup(siteId) {
      return unwrap<SetupInfo>(await request("GET", `${site(siteId)}/setup`), "setup");
    },
    async phoneCheck(siteId, pages) {
      return unwrap<PhoneCheckInfo>(
        await request("POST", `${site(siteId)}/phone-check`, pages ? { pages } : {}),
        "phone",
      );
    },

    async downloadExport(siteId, kind): Promise<DownloadedFile> {
      const { path, filename } = EXPORT_PATHS[kind];
      const res = await raw("GET", `${site(siteId)}${path}`);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
      return { blob: await res.blob(), filename: named ?? filename };
    },
  };
}
