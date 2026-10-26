import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHub } from "./context";
import type { CreateSiteInput, GitHubSignInParams, Site } from "./types";

export const queryKeys = {
  session: ["session"] as const,
  templates: ["templates"] as const,
  sites: ["sites"] as const,
  site: (id: string) => ["sites", id] as const,
};

export function useSession() {
  const hub = useHub();
  return useQuery({ queryKey: queryKeys.session, queryFn: () => hub.getSession(), staleTime: 60_000 });
}

export function useTemplates() {
  const hub = useHub();
  return useQuery({ queryKey: queryKeys.templates, queryFn: () => hub.listTemplates(), staleTime: 5 * 60_000 });
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

/** Polls while the site is still being set up. */
export function useSite(id: string | undefined, options: { pollMs?: number } = {}) {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.site(id ?? ""),
    queryFn: () => hub.getSite(id as string),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === "building" ? (options.pollMs ?? 1500) : false),
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

export function useTransferSite() {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => hub.transferSite(id, to),
    onSuccess: ({ site }) => {
      qc.setQueryData(queryKeys.site(site.id), site);
      qc.setQueryData<Site[]>(queryKeys.sites, (prev) => prev?.map((s) => (s.id === site.id ? site : s)));
    },
  });
}
