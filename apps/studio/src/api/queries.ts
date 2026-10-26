import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHub } from "./context";
import type { CreateSiteInput, GitHubSignInParams, Site } from "./types";

export const queryKeys = {
  session: ["session"] as const,
  templates: ["templates"] as const,
  sites: ["sites"] as const,
  site: (id: string) => ["sites", id] as const,
  document: (id: string) => ["document", id] as const,
};

export function useSession() {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => hub.getSession(),
    staleTime: 60_000,
  });
}

export function useTemplates() {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => hub.listTemplates(),
    staleTime: 5 * 60_000,
  });
}

/** Polls while any site is still being set up. */
export function useSites(options: { enabled?: boolean; pollMs?: number } = {}) {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: () => hub.listSites(),
    enabled: options.enabled ?? true,
    refetchInterval: (q) =>
      q.state.data?.some((s) => s.status === "building") ? (options.pollMs ?? 3000) : false,
  });
}

/** Longest wait between polls after repeated errors. */
const MAX_BACKOFF_MS = 30_000;

/**
 * Polls while the site is still being set up. With `pollOnError`, a failed
 * poll doesn't end polling: it backs off (doubling, capped) and tries again.
 */
export function useSite(
  id: string | undefined,
  options: { pollMs?: number; pollOnError?: boolean } = {},
) {
  const hub = useHub();
  const pollMs = options.pollMs ?? 1500;
  return useQuery({
    queryKey: queryKeys.site(id ?? ""),
    queryFn: () => hub.getSite(id as string),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (q) => {
      if (q.state.status === "error" && options.pollOnError) {
        return Math.min(pollMs * 2 ** Math.min(q.state.errorUpdateCount, 8), MAX_BACKOFF_MS);
      }
      return q.state.data?.status === "building" ? pollMs : false;
    },
  });
}

export function useDevLogin() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => hub.devLogin(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.session }),
  });
}

export function useGitHubSignIn() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: GitHubSignInParams) => hub.startGitHubSignIn(params),
    onSuccess: (user) => {
      if (user) return qc.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useLogout() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => hub.logout(),
    onSuccess: () => {
      qc.removeQueries({ queryKey: queryKeys.sites });
      return qc.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useCreateSite() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSiteInput) => hub.createSite(input),
    onSuccess: (site) => {
      qc.setQueryData(queryKeys.site(site.id), site);
      qc.setQueryData<Site[]>(queryKeys.sites, (prev) => (prev ? [site, ...prev] : prev));
    },
  });
}

export function useRetryPublish() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hub.retryPublish(id),
    onSuccess: (site) => {
      qc.setQueryData(queryKeys.site(site.id), site);
      qc.setQueryData<Site[]>(queryKeys.sites, (prev) =>
        prev?.map((s) => (s.id === site.id ? site : s)),
      );
    },
  });
}

export function useDeleteSite() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
      hub.deleteSite(id, confirmName),
    onSuccess: (_void, { id }) => {
      qc.removeQueries({ queryKey: queryKeys.site(id), exact: true });
      qc.setQueryData<Site[]>(queryKeys.sites, (prev) => prev?.filter((s) => s.id !== id));
    },
  });
}

export function useTransferSite() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => hub.transferSite(id, to),
    onSuccess: ({ site }) => {
      qc.setQueryData(queryKeys.site(site.id), site);
      qc.setQueryData<Site[]>(queryKeys.sites, (prev) =>
        prev?.map((s) => (s.id === site.id ? site : s)),
      );
    },
  });
}

/**
 * The site's content for the editor. Loaded once per editing session: after that the editor's
 * document store (and, later, the draft room) owns it, so it is never refetched underneath.
 */
export function useSiteDocument(id: string | undefined, options: { enabled?: boolean } = {}) {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.document(id ?? ""),
    queryFn: () => hub.getDocument(id as string),
    enabled: Boolean(id) && (options.enabled ?? true),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
