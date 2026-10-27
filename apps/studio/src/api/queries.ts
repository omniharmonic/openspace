import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHub } from "./context";
import { isTransientError } from "./resilience";
import {
  type CreateSiteInput,
  DEFAULT_CAPABILITIES,
  type GitHubSignInParams,
  type HubCapabilities,
  HubError,
  type Site,
} from "./types";

export const queryKeys = {
  session: ["session"] as const,
  templates: ["templates"] as const,
  sites: ["sites"] as const,
  site: (id: string) => ["sites", id] as const,
};

export function useSession() {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => hub.getSession(),
    staleTime: 60_000,
  });
}

/**
 * What the Hub can deliver (email, payments, Turnstile). Read defensively: until the session
 * loads, or on an older Hub, it assumes the Hub works as it always has.
 */
export function useCapabilities(): HubCapabilities {
  const caps = useSession().data?.capabilities;
  return {
    email: { ...DEFAULT_CAPABILITIES.email, ...caps?.email },
    payments: { ...DEFAULT_CAPABILITIES.payments, ...caps?.payments },
    turnstile: { ...DEFAULT_CAPABILITIES.turnstile, ...caps?.turnstile },
    hosting: { ...DEFAULT_CAPABILITIES.hosting, ...caps?.hosting },
  };
}

/** The Hub can't send email (no provider, and not a dev Hub with an outbox). */
export function useEmailUnavailable(): boolean {
  const { email } = useCapabilities();
  return !email.configured && !email.devOutbox;
}

export function useTemplates() {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => hub.listTemplates(),
    staleTime: 5 * 60_000,
  });
}

const RECENT_MS = 10 * 60_000;
const isRecent = (iso: string) => Date.now() - Date.parse(iso) < RECENT_MS;

/** Polls while any site is still being set up. */
export function useSites(options: { enabled?: boolean; pollMs?: number } = {}) {
  const hub = useHub();
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: () => hub.listSites(),
    enabled: options.enabled ?? true,
    refetchInterval: (q) => {
      const list = q.state.data;
      if (list?.some((s) => s.status === "building")) return options.pollMs ?? 3000;
      // A site being moved in can be live (its placeholder) while the move continues.
      if (list?.some((s) => s.import && s.import.state !== "ready" && s.import.state !== "failed"))
        return (options.pollMs ?? 3000) * 2;
      // A just-made site can report "failed" before its first publish lands: look again.
      if (list?.some((s) => s.status === "failed" && isRecent(s.createdAt)))
        return (options.pollMs ?? 3000) * 4;
      return false;
    },
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
  options: {
    pollMs?: number;
    pollOnError?: boolean;
    /** Keep polling a site that isn't building (e.g. to re-check an early "failed"). */
    pollWhile?: (site: Site) => boolean;
  } = {},
) {
  const hub = useHub();
  const pollMs = options.pollMs ?? 1500;
  return useQuery({
    queryKey: queryKeys.site(id ?? ""),
    queryFn: () => hub.getSite(id as string),
    enabled: Boolean(id),
    // Polling handles errors itself when asked; otherwise ride out a temporary Hub failure.
    retry: (count, err) => !options.pollOnError && isTransientError(err) && count < 3,
    refetchInterval: (q) => {
      if (q.state.status === "error" && options.pollOnError) {
        return Math.min(pollMs * 2 ** Math.min(q.state.errorUpdateCount, 8), MAX_BACKOFF_MS);
      }
      const site = q.state.data;
      if (!site) return false;
      return site.status === "building" || options.pollWhile?.(site) ? pollMs : false;
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

export function useCreateSite(options: { retryBaseMs?: number } = {}) {
  const hub = useHub();
  const base = options.retryBaseMs ?? 2000;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...input }: CreateSiteInput & { idempotencyKey?: string }) =>
      hub.createSite(input, { idempotencyKey }),
    // With an idempotency key a repeat can't make a second site, so ride out a flaky Hub
    // (and a create that's still running from an earlier attempt) for about a minute.
    retry: (count, err) =>
      count < 6 &&
      (isTransientError(err) || (err instanceof HubError && err.code === "create_in_progress")),
    retryDelay: (attempt) => Math.min(base * 2 ** attempt, 8 * base),
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
