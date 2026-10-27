import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHub } from "./context";
import {
  type ConvertInput,
  type ImportInput,
  type ImportStarted,
  type ImportView,
  importInProgress,
  type StartInput,
  type StartStarted,
  type UploadPageInput,
} from "./import-types";
import { queryKeys } from "./queries";
import { isTransientError } from "./resilience";
import type { Site } from "./types";

export const importKeys = {
  one: (id: string) => ["imports", id] as const,
  ofSite: (siteId: string) => ["sites", siteId, "import"] as const,
};

/** A move's progress; polls while it is on its way (and while waiting for an approval). */
export function useImport(id: string | undefined, options: { pollMs?: number } = {}) {
  const hub = useHub();
  const qc = useQueryClient();
  const pollMs = options.pollMs ?? 2000;
  return useQuery({
    queryKey: importKeys.one(id ?? ""),
    queryFn: async () => {
      const v = await hub.getImport(id as string);
      // Keep the site's own record in step (the editor opens it once the move is done).
      const patch = (s: Site) =>
        s.id === v.siteId ? { ...s, import: { id: v.id, state: v.state, kind: v.kind } } : s;
      qc.setQueryData<Site>(queryKeys.site(v.siteId), (prev) => (prev ? patch(prev) : prev));
      qc.setQueryData<Site[]>(queryKeys.sites, (prev) => prev?.map(patch));
      if (!importInProgress(v.state)) {
        // The site was "being set up" while it moved: read its real status now, so the editor
        // opens on the live site instead of a stale "setting up" copy.
        await qc
          .fetchQuery({
            queryKey: queryKeys.site(v.siteId),
            queryFn: () => hub.getSite(v.siteId),
            staleTime: 0,
          })
          .catch(() => undefined);
        void qc.invalidateQueries({ queryKey: queryKeys.sites, exact: true });
      }
      return v;
    },
    enabled: Boolean(id),
    retry: (count, err) => isTransientError(err) && count < 3,
    refetchInterval: (q) => {
      if (q.state.status === "error") return Math.min(pollMs * 4, 30_000);
      const v = q.state.data;
      if (!v) return false;
      // Waiting on GitHub (install, approval) changes slowly: look less often.
      if (v.state === "waiting" || v.state === "review") return pollMs * 3;
      return importInProgress(v.state) ? pollMs : false;
    },
  });
}

/** The site's newest move (or null). */
export function useSiteImport(siteId: string | undefined) {
  const hub = useHub();
  return useQuery({
    queryKey: importKeys.ofSite(siteId ?? ""),
    queryFn: () => hub.siteImport(siteId as string),
    enabled: Boolean(siteId),
  });
}

function useStarted() {
  const qc = useQueryClient();
  return (r: ImportStarted) => {
    qc.setQueryData(importKeys.one(r.import.id), r.import);
    qc.setQueryData(queryKeys.site(r.site.id), r.site);
    qc.setQueryData<Site[]>(queryKeys.sites, (prev) => (prev ? [r.site, ...prev] : prev));
  };
}

export function useCreateImport() {
  const hub = useHub();
  const started = useStarted();
  return useMutation({
    mutationFn: (input: ImportInput) => hub.createImport(input),
    onSuccess: started,
  });
}

function useSiteStarted() {
  const qc = useQueryClient();
  return (r: StartStarted) => {
    qc.setQueryData(queryKeys.site(r.site.id), r.site);
    qc.setQueryData<Site[]>(queryKeys.sites, (prev) => (prev ? [r.site, ...prev] : prev));
  };
}

/** Start with Claude: a new site from a brief and brand material. */
export function useStartSite() {
  const hub = useHub();
  const started = useSiteStarted();
  return useMutation({
    mutationFn: (input: StartInput) => hub.startSite(input),
    onSuccess: started,
  });
}

/** Move my site → upload a page (an HTML file or zip). */
export function useUploadPage() {
  const hub = useHub();
  const started = useSiteStarted();
  return useMutation({
    mutationFn: (input: UploadPageInput) => hub.uploadPage(input),
    onSuccess: started,
  });
}

export function useConvertRepo() {
  const hub = useHub();
  const started = useStarted();
  return useMutation({
    mutationFn: (input: ConvertInput) => hub.convertRepo(input),
    onSuccess: started,
  });
}

export function useRetryImport() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hub.retryImport(id),
    onSuccess: (v: ImportView) => qc.setQueryData(importKeys.one(v.id), v),
  });
}
