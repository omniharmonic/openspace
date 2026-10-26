import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useHub } from "./context";
import type {
  AnalyticsRange,
  CampaignInput,
  CampaignSegment,
  DiscountInput,
  GrowthSettings,
  MemberQuery,
  OrderQuery,
  SenderInput,
  ServiceSettings,
  SubmissionQuery,
  SubscriberQuery,
  TierInput,
} from "./growth-types";
import { queryKeys } from "./queries";

/** Query keys for the Task 25 surfaces. Everything is scoped by site id. */
export const growthKeys = {
  all: (id: string) => ["growth", id] as const,
  serviceSettings: (id: string) => ["growth", id, "service-settings"] as const,
  quotas: (id: string) => ["growth", id, "quotas"] as const,
  forms: (id: string) => ["growth", id, "forms"] as const,
  submissions: (id: string, q?: SubmissionQuery) => ["growth", id, "submissions", q ?? {}] as const,
  subscribers: (id: string, q?: SubscriberQuery) => ["growth", id, "subscribers", q ?? {}] as const,
  analytics: (id: string, r: AnalyticsRange) => ["growth", id, "analytics", r] as const,
  commerce: (id: string) => ["growth", id, "commerce"] as const,
  products: (id: string) => ["growth", id, "products"] as const,
  orders: (id: string, q?: OrderQuery) => ["growth", id, "orders", q ?? {}] as const,
  order: (id: string, oid: string) => ["growth", id, "order", oid] as const,
  discounts: (id: string) => ["growth", id, "discounts"] as const,
  members: (id: string, q?: MemberQuery) => ["growth", id, "members", q ?? {}] as const,
  tiers: (id: string) => ["growth", id, "tiers"] as const,
  senders: (id: string) => ["growth", id, "senders"] as const,
  campaigns: (id: string) => ["growth", id, "campaigns"] as const,
  campaign: (id: string, cid: string) => ["growth", id, "campaign", cid] as const,
  segment: (id: string, s: CampaignSegment) => ["growth", id, "segment", s] as const,
};

/** Invalidate a family of growth queries (`["growth", id, part]`). */
function useInvalidate(siteId: string) {
  const qc = useQueryClient();
  return (...parts: string[]) =>
    Promise.all(parts.map((p) => qc.invalidateQueries({ queryKey: ["growth", siteId, p] })));
}

// --- settings --------------------------------------------------------------------------------

export function useServiceSettings(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.serviceSettings(siteId),
    queryFn: () => hub.getServiceSettings(siteId),
  });
}

export function useUpdateServiceSettings(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ServiceSettings>) => hub.updateServiceSettings(siteId, patch),
    onSuccess: (settings) => qc.setQueryData(growthKeys.serviceSettings(siteId), settings),
  });
}

export function useQuotas(siteId: string) {
  const hub = useHub();
  return useQuery({ queryKey: growthKeys.quotas(siteId), queryFn: () => hub.listQuotas(siteId) });
}

// --- inbox -----------------------------------------------------------------------------------

export function useForms(siteId: string, enabled = true) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.forms(siteId),
    queryFn: () => hub.listForms(siteId),
    enabled,
  });
}

export function useSubmissions(siteId: string, query: SubmissionQuery) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.submissions(siteId, query),
    queryFn: () => hub.listSubmissions(siteId, query),
    placeholderData: keepPreviousData,
  });
}

export function useInboxActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  const invalidate = useInvalidate(siteId);
  const refresh = () => {
    void invalidate("submissions", "forms");
    void qc.invalidateQueries({ queryKey: queryKeys.sites });
  };
  return {
    setRead: useMutation({
      mutationFn: ({ id, read }: { id: string; read: boolean }) =>
        hub.setSubmissionRead(siteId, id, read),
      onSuccess: refresh,
    }),
    markRead: useMutation({
      mutationFn: (input: { ids?: string[]; all?: boolean; form?: string; read?: boolean }) =>
        hub.markSubmissionsRead(siteId, input),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (ids: string[]) => hub.deleteSubmissions(siteId, ids),
      onSuccess: refresh,
    }),
  };
}

// --- subscribers -----------------------------------------------------------------------------

export function useSubscribers(siteId: string, query: SubscriberQuery) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.subscribers(siteId, query),
    queryFn: () => hub.listSubscribers(siteId, query),
    placeholderData: keepPreviousData,
  });
}

export function useSubscriberActions(siteId: string) {
  const hub = useHub();
  const invalidate = useInvalidate(siteId);
  const done = () => void invalidate("subscribers", "segment");
  return {
    importCsv: useMutation({
      mutationFn: (input: { csv: string; tags?: string[] }) =>
        hub.importSubscribers(siteId, { ...input, consent: true }),
      onSuccess: done,
    }),
    tag: useMutation({
      mutationFn: (input: { ids: string[]; add?: string[]; remove?: string[] }) =>
        hub.tagSubscribers(siteId, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string;
        patch: { tags?: string[]; firstName?: string; status?: "unsubscribed" };
      }) => hub.updateSubscriber(siteId, id, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => hub.deleteSubscriber(siteId, id),
      onSuccess: done,
    }),
  };
}

// --- analytics -------------------------------------------------------------------------------

export function useAnalytics(siteId: string, range: AnalyticsRange) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.analytics(siteId, range),
    queryFn: () => hub.getAnalytics(siteId, range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

// --- commerce --------------------------------------------------------------------------------

export function useCommerceSettings(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.commerce(siteId),
    queryFn: () => hub.getCommerceSettings(siteId),
  });
}

export function useCommerceActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  const key = growthKeys.commerce(siteId);
  type View = Awaited<ReturnType<typeof hub.getCommerceSettings>>;
  const setPayments = (payments: View["payments"]) =>
    qc.setQueryData<View>(key, (v) => (v ? { ...v, payments } : v));
  return {
    update: useMutation({
      mutationFn: (patch: Partial<GrowthSettings>) => hub.updateCommerceSettings(siteId, patch),
      onSuccess: (settings) => qc.setQueryData<View>(key, (v) => (v ? { ...v, settings } : v)),
    }),
    connect: useMutation({
      mutationFn: (returnUrl?: string) => hub.startStripeConnect(siteId, returnUrl),
    }),
    refresh: useMutation({
      mutationFn: () => hub.refreshStripeConnect(siteId),
      onSuccess: setPayments,
    }),
    setSovereign: useMutation({
      mutationFn: (keys: { secretKey: string; webhookSecret: string }) =>
        hub.setSovereignKeys(siteId, keys),
      onSuccess: setPayments,
    }),
    clearSovereign: useMutation({
      mutationFn: () => hub.clearSovereignKeys(siteId),
      onSuccess: setPayments,
    }),
  };
}

export function useProducts(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.products(siteId),
    queryFn: () => hub.listProducts(siteId),
  });
}

export function useInventoryActions(siteId: string) {
  const hub = useHub();
  const invalidate = useInvalidate(siteId);
  const done = () => void invalidate("products");
  return {
    set: useMutation({
      mutationFn: (input: { sku: string; qty: number | null; lowStock?: number | null }) =>
        hub.setInventory(siteId, input),
      onSuccess: done,
    }),
    adjust: useMutation({
      mutationFn: ({ sku, delta }: { sku: string; delta: number }) =>
        hub.adjustInventory(siteId, sku, delta),
      onSuccess: done,
    }),
    upload: useMutation({
      mutationFn: ({ sku, file }: { sku: string; file: File }) =>
        hub.uploadProductFile(siteId, sku, file, file.name),
      onSuccess: done,
    }),
    removeFile: useMutation({
      mutationFn: (sku: string) => hub.deleteProductFile(siteId, sku),
      onSuccess: done,
    }),
  };
}

export function useOrders(siteId: string, query: OrderQuery) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.orders(siteId, query),
    queryFn: () => hub.listOrders(siteId, query),
    placeholderData: keepPreviousData,
  });
}

/** Orders a page at a time (the Hub's cursor), for "Show more". */
export function useOrdersPaged(siteId: string, query: OrderQuery) {
  const hub = useHub();
  return useInfiniteQuery({
    queryKey: [...growthKeys.orders(siteId, query), "paged"],
    queryFn: ({ pageParam }) => hub.listOrders(siteId, { ...query, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useOrder(siteId: string, orderId: string | null) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.order(siteId, orderId ?? ""),
    queryFn: () => hub.getOrder(siteId, orderId as string),
    enabled: Boolean(orderId),
  });
}

export function useOrderActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  const invalidate = useInvalidate(siteId);
  const done = (order: Awaited<ReturnType<typeof hub.getOrder>>) => {
    qc.setQueryData(growthKeys.order(siteId, order.id), order);
    void invalidate("orders", "products");
  };
  return {
    fulfill: useMutation({
      mutationFn: ({
        id,
        ...input
      }: {
        id: string;
        tracking?: string;
        notify?: boolean;
        fulfilled?: boolean;
      }) => hub.fulfillOrder(siteId, id, input),
      onSuccess: done,
    }),
    refund: useMutation({
      mutationFn: ({ id, ...input }: { id: string; amount?: number; restock?: boolean }) =>
        hub.refundOrder(siteId, id, input),
      onSuccess: done,
    }),
  };
}

export function useDiscounts(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.discounts(siteId),
    queryFn: () => hub.listDiscounts(siteId),
  });
}

export function useDiscountActions(siteId: string) {
  const hub = useHub();
  const invalidate = useInvalidate(siteId);
  const done = () => void invalidate("discounts");
  return {
    create: useMutation({
      mutationFn: (input: DiscountInput) => hub.createDiscount(siteId, input),
      onSuccess: done,
    }),
    setActive: useMutation({
      mutationFn: ({ id, active }: { id: string; active: boolean }) =>
        hub.setDiscountActive(siteId, id, active),
      onSuccess: done,
    }),
  };
}

// --- members ---------------------------------------------------------------------------------

export function useMembers(siteId: string, query: MemberQuery) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.members(siteId, query),
    queryFn: () => hub.listMembers(siteId, query),
    placeholderData: keepPreviousData,
  });
}

/** Members a page at a time (the Hub's cursor), for "Show more". */
export function useMembersPaged(siteId: string, query: MemberQuery) {
  const hub = useHub();
  return useInfiniteQuery({
    queryKey: [...growthKeys.members(siteId, query), "paged"],
    queryFn: ({ pageParam }) => hub.listMembers(siteId, { ...query, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useTiers(siteId: string) {
  const hub = useHub();
  return useQuery({ queryKey: growthKeys.tiers(siteId), queryFn: () => hub.listTiers(siteId) });
}

export function useMemberActions(siteId: string) {
  const hub = useHub();
  const invalidate = useInvalidate(siteId);
  const done = () => void invalidate("members", "tiers");
  return {
    add: useMutation({
      mutationFn: (input: {
        email: string;
        name?: string;
        tier?: string | null;
        invite?: boolean;
      }) => hub.addMember(siteId, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        patch,
      }: {
        id: string;
        patch: { name?: string; tier?: string | null; status?: "active" | "blocked" };
      }) => hub.updateMember(siteId, id, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => hub.deleteMember(siteId, id),
      onSuccess: done,
    }),
    createTier: useMutation({
      mutationFn: (input: TierInput) => hub.createTier(siteId, input),
      onSuccess: done,
    }),
    updateTier: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TierInput }) =>
        hub.updateTier(siteId, id, input),
      onSuccess: done,
    }),
    deleteTier: useMutation({
      mutationFn: (id: string) => hub.deleteTier(siteId, id),
      onSuccess: done,
    }),
  };
}

// --- email -----------------------------------------------------------------------------------

export function useSenders(siteId: string, enabled = true) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.senders(siteId),
    queryFn: () => hub.listSenders(siteId),
    enabled,
  });
}

export function useSenderActions(siteId: string) {
  const hub = useHub();
  const invalidate = useInvalidate(siteId);
  const done = () => void invalidate("senders");
  return {
    create: useMutation({
      mutationFn: (input: SenderInput) => hub.createSender(siteId, input),
      onSuccess: done,
    }),
    verify: useMutation({
      mutationFn: (id: string) => hub.verifySender(siteId, id),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => hub.deleteSender(siteId, id),
      onSuccess: done,
    }),
  };
}

export function useSegmentCount(siteId: string, segment: CampaignSegment) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.segment(siteId, segment),
    queryFn: () => hub.countSegment(siteId, segment),
    placeholderData: keepPreviousData,
  });
}

export function useCampaigns(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.campaigns(siteId),
    queryFn: () => hub.listCampaigns(siteId),
  });
}

export function useCampaign(siteId: string, campaignId: string | null) {
  const hub = useHub();
  return useQuery({
    queryKey: growthKeys.campaign(siteId, campaignId ?? ""),
    queryFn: () => hub.getCampaign(siteId, campaignId as string),
    enabled: Boolean(campaignId),
  });
}

export function useCampaignActions(siteId: string) {
  const hub = useHub();
  const invalidate = useInvalidate(siteId);
  const done = () => void invalidate("campaigns", "campaign");
  return {
    create: useMutation({
      mutationFn: (input: CampaignInput) => hub.createCampaign(siteId, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<CampaignInput> }) =>
        hub.updateCampaign(siteId, id, patch),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => hub.deleteCampaign(siteId, id),
      onSuccess: done,
    }),
    test: useMutation({
      mutationFn: ({ id, to }: { id: string; to: string }) => hub.testCampaign(siteId, id, to),
    }),
    schedule: useMutation({
      mutationFn: ({ id, sendAt }: { id: string; sendAt: string }) =>
        hub.scheduleCampaign(siteId, id, sendAt),
      onSuccess: done,
    }),
    unschedule: useMutation({
      mutationFn: (id: string) => hub.unscheduleCampaign(siteId, id),
      onSuccess: done,
    }),
    send: useMutation({
      mutationFn: (id: string) => hub.sendCampaign(siteId, id),
      onSuccess: done,
    }),
  };
}
