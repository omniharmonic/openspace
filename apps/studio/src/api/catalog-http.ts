import type { CatalogApi, KitUpdate, TemplateDetail } from "./catalog-types";

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

const enc = encodeURIComponent;
const site = (id: string) => `/api/sites/${enc(id)}`;

/** Template documents and the update bot over HTTP (Hub Tasks 17 + 18). */
export function createCatalogHttp({ request }: { request: Request }): CatalogApi {
  return {
    async getTemplate(id) {
      const res = await request<TemplateDetail | { template: TemplateDetail }>(
        "GET",
        `/api/templates/${enc(id)}`,
      );
      return "template" in res ? res.template : res;
    },
    async listUpdates(siteId) {
      const res = await request<{ updates: KitUpdate[] } | KitUpdate[]>(
        "GET",
        `${site(siteId)}/updates`,
      );
      return Array.isArray(res) ? res : res.updates;
    },
    async checkForUpdate(siteId) {
      const res = await request<{ update: KitUpdate | null }>(
        "POST",
        `${site(siteId)}/updates/check`,
      );
      return res.update ?? null;
    },
    async applyUpdate(siteId, updateId) {
      const res = await request<{ update: KitUpdate }>(
        "POST",
        `${site(siteId)}/updates/${enc(updateId)}/apply`,
      );
      return res.update;
    },
    async dismissUpdate(siteId, updateId) {
      await request<{ ok: boolean }>("POST", `${site(siteId)}/updates/${enc(updateId)}/dismiss`);
    },
  };
}
