import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHub } from "./context";
import type {
  Approval,
  CollaboratorRole,
  DomainView,
  HostingTarget,
  InviteInput,
  McpGrant,
  SealedSecret,
} from "./manage-types";
import { queryKeys } from "./queries";
import type { Site } from "./types";

/** Query keys for the site-management surfaces (Task 24). */
export const manageKeys = {
  pagePasswords: (id: string) => ["page-passwords", id] as const,
  registrars: ["registrars"] as const,
  domain: (id: string) => ["domain", id] as const,
  mcpTokens: (id: string) => ["mcp-tokens", id] as const,
  mcpGrants: ["mcp-grants"] as const,
  collaborators: (id: string) => ["collaborators", id] as const,
  approvals: (id: string) => ["approvals", id] as const,
  hosting: (id: string) => ["hosting", id] as const,
};

export function useRenameSite(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => hub.renameSite(siteId, name),
    onSuccess: (_v, name) => {
      qc.setQueryData<Site>(queryKeys.site(siteId), (s) => (s ? { ...s, name } : s));
      qc.setQueryData<Site[]>(queryKeys.sites, (list) =>
        list?.map((s) => (s.id === siteId ? { ...s, name } : s)),
      );
    },
  });
}

export function usePagePasswords(siteId: string, enabled = true) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.pagePasswords(siteId),
    queryFn: () => hub.listPagePasswords(siteId),
    enabled,
  });
}

export function useSetPagePassword(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, password }: { pageId: string; password: string | null }) =>
      password === null
        ? hub.clearPagePassword(siteId, pageId)
        : hub.setPagePassword(siteId, pageId, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: manageKeys.pagePasswords(siteId) }),
  });
}

export function useRegistrars() {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.registrars,
    queryFn: () => hub.listRegistrars(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The site's custom domain. While it isn't live yet, Studio re-checks DNS every `pollMs`
 * (the wizard's live checklist; the Hub suggests 15 s).
 */
export function useDomain(siteId: string, options: { pollMs?: number } = {}) {
  const hub = useHub();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: manageKeys.domain(siteId),
    queryFn: () => hub.getDomain(siteId),
  });
  const pollMs = options.pollMs ?? 15_000;
  const waiting = query.data != null && query.data.status !== "active";
  useQuery({
    queryKey: [...manageKeys.domain(siteId), "check"],
    queryFn: async () => {
      const view = await hub.checkDomain(siteId);
      qc.setQueryData<DomainView | null>(manageKeys.domain(siteId), view);
      if (view.status === "active") void qc.invalidateQueries({ queryKey: queryKeys.site(siteId) });
      return view.checkedAt ?? Date.now();
    },
    enabled: waiting,
    refetchInterval: waiting ? pollMs : false,
    refetchIntervalInBackground: true,
    retry: false,
    gcTime: 0,
  });
  return query;
}

export function useDomainActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  const set = (view: DomainView | null) => qc.setQueryData(manageKeys.domain(siteId), view);
  return {
    lookup: useMutation({ mutationFn: (domain: string) => hub.lookupDomain(siteId, domain) }),
    connect: useMutation({
      mutationFn: (domain: string) => hub.connectDomain(siteId, domain),
      onSuccess: set,
    }),
    check: useMutation({ mutationFn: () => hub.checkDomain(siteId), onSuccess: set }),
    remove: useMutation({
      mutationFn: () => hub.removeDomain(siteId),
      onSuccess: () => {
        set(null);
        void qc.invalidateQueries({ queryKey: queryKeys.site(siteId) });
      },
    }),
  };
}

export function useMcpTokens(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.mcpTokens(siteId),
    queryFn: () => hub.listMcpTokens(siteId),
  });
}

export function useMcpGrants() {
  const hub = useHub();
  return useQuery({ queryKey: manageKeys.mcpGrants, queryFn: () => hub.listMcpGrants() });
}

export function useMcpActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  const tokens = () => qc.invalidateQueries({ queryKey: manageKeys.mcpTokens(siteId) });
  const grants = () => qc.invalidateQueries({ queryKey: manageKeys.mcpGrants });
  return {
    createToken: useMutation({
      mutationFn: (label: string) => hub.createMcpToken(siteId, label),
      onSuccess: tokens,
    }),
    revokeToken: useMutation({
      mutationFn: (id: string) => hub.revokeMcpToken(siteId, id),
      onSuccess: tokens,
    }),
    revokeGrant: useMutation({
      mutationFn: (id: string) => hub.revokeMcpGrant(id),
      onSuccess: grants,
    }),
    setPublish: useMutation({
      mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
        hub.setMcpGrantPublish(id, publish),
      onSuccess: (g) =>
        qc.setQueryData<McpGrant[]>(manageKeys.mcpGrants, (list) =>
          list?.map((x) => (x.id === g.id ? g : x)),
        ),
    }),
  };
}

export function useCollaborators(siteId: string) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.collaborators(siteId),
    queryFn: () => hub.listCollaborators(siteId),
  });
}

export function useApprovals(siteId: string, enabled = true) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.approvals(siteId),
    queryFn: () => hub.listApprovals(siteId),
    enabled,
  });
}

export function useCollaboratorActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: manageKeys.collaborators(siteId) });
  return {
    invite: useMutation({
      mutationFn: (input: InviteInput) => hub.inviteCollaborator(siteId, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({
        userId,
        ...patch
      }: {
        userId: string;
        role?: CollaboratorRole;
        lockedSections?: string[];
      }) => hub.updateCollaborator(siteId, userId, patch),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => hub.removeCollaborator(siteId, userId),
      onSuccess: refresh,
    }),
    revoke: useMutation({
      mutationFn: (invitationId: string) => hub.revokeInvitation(siteId, invitationId),
      onSuccess: refresh,
    }),
    decide: useMutation({
      mutationFn: ({
        id,
        decision,
        note,
      }: {
        id: string;
        decision: "approve" | "reject";
        note?: string;
      }) => hub.decideApproval(siteId, id, decision, note),
      onSuccess: (a) =>
        qc.setQueryData<Approval[]>(manageKeys.approvals(siteId), (list) =>
          list?.map((x) => (x.id === a.id ? a : x)),
        ),
    }),
  };
}

export function useHosting(siteId: string, enabled = true) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.hosting(siteId),
    queryFn: () => hub.getHosting(siteId),
    enabled,
  });
}

export function useHostingActions(siteId: string) {
  const hub = useHub();
  const qc = useQueryClient();
  return {
    putSecrets: useMutation({
      mutationFn: (secrets: SealedSecret[]) => hub.putHostingSecrets(siteId, secrets),
    }),
    switchTo: useMutation({
      mutationFn: (target: HostingTarget) => hub.switchHosting(siteId, target),
      onSuccess: (info) => {
        qc.setQueryData(manageKeys.hosting(siteId), info);
        qc.setQueryData<Site>(queryKeys.site(siteId), (s) =>
          s ? { ...s, deployTarget: info.target } : s,
        );
      },
    }),
  };
}
