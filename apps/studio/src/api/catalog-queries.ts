import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KitUpdate } from "./catalog-types";
import { useHub } from "./context";
import { queryKeys } from "./queries";
import { isTransientError } from "./resilience";
import type { Site } from "./types";

/** Query keys for template documents and kit updates (Task 26). */
export const catalogKeys = {
  template: (id: string) => ["template-document", id] as const,
  updates: (siteId: string) => ["updates", siteId] as const,
};

/**
 * A template's document, fetched once and kept for the session (templates change only with a
 * Hub release). `enabled` lets galleries fetch only what scrolls into view.
 */
export function useTemplateDetail(id: string | undefined, options: { enabled?: boolean } = {}) {
  const hub = useHub();
  return useQuery({
    queryKey: catalogKeys.template(id ?? ""),
    queryFn: () => hub.getTemplate(id as string),
    enabled: Boolean(id) && (options.enabled ?? true),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    // A busy Hub (503) is worth riding out; a missing template isn't.
    retry: (count, err) => (isTransientError(err) ? count < 4 : count < 1),
  });
}

export function useSiteUpdates(siteId: string | undefined, options: { enabled?: boolean } = {}) {
  const hub = useHub();
  return useQuery({
    queryKey: catalogKeys.updates(siteId ?? ""),
    queryFn: () => hub.listUpdates(siteId as string),
    enabled: Boolean(siteId) && (options.enabled ?? true),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** The newest update still waiting to be applied (or one whose apply failed). */
export function pendingUpdate(updates: readonly KitUpdate[] | undefined): KitUpdate | undefined {
  return updates?.find((u) => u.status === "pending" || u.status === "failed");
}

function markApplied(qc: ReturnType<typeof useQueryClient>, siteId: string) {
  qc.setQueryData<Site>(queryKeys.site(siteId), (s) => (s ? { ...s, updateAvailable: false } : s));
  qc.setQueryData<Site[]>(queryKeys.sites, (list) =>
    list?.map((s) => (s.id === siteId ? { ...s, updateAvailable: false } : s)),
  );
}

export function useApplyUpdate(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updateId: string) => hub.applyUpdate(siteId, updateId),
    onSuccess: (update) => {
      qc.setQueryData<KitUpdate[]>(catalogKeys.updates(siteId), (list) =>
        list?.map((u) => (u.id === update.id ? update : u)),
      );
      markApplied(qc, siteId);
    },
    onError: () => void qc.invalidateQueries({ queryKey: catalogKeys.updates(siteId) }),
  });
}

export function useDismissUpdate(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updateId: string) => hub.dismissUpdate(siteId, updateId),
    onSuccess: (_v, updateId) => {
      qc.setQueryData<KitUpdate[]>(catalogKeys.updates(siteId), (list) =>
        list?.map((u) => (u.id === updateId ? { ...u, status: "dismissed" } : u)),
      );
      markApplied(qc, siteId);
    },
  });
}

export function useCheckForUpdate(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => hub.checkForUpdate(siteId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: catalogKeys.updates(siteId) }),
  });
}
