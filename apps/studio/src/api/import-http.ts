import type { ImportApi, ImportStarted, ImportView, StartStarted } from "./import-types";

type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

const enc = encodeURIComponent;

/** `/api/imports*` over HTTP. */
export function createImportHttp({ request }: { request: Request }): ImportApi {
  return {
    createImport: (input) => request<ImportStarted>("POST", "/api/imports", input),
    startSite: (input) => request<StartStarted>("POST", "/api/start", input),
    uploadPage: (input) => request<StartStarted>("POST", "/api/imports/html", input),
    convertRepo: (input) => request<ImportStarted>("POST", "/api/imports/convert", input),
    getImport: (id) => request<ImportView>("GET", `/api/imports/${enc(id)}`),
    retryImport: (id) => request<ImportView>("POST", `/api/imports/${enc(id)}/retry`, {}),
    async siteImport(siteId) {
      const res = await request<{ import: ImportView | null }>(
        "GET",
        `/api/sites/${enc(siteId)}/import`,
      );
      return res.import;
    },
  };
}
