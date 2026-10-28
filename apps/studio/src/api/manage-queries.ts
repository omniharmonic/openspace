import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHub, useOptionalHub } from "./context";
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
  setup: (id: string) => ["setup", id] as const,
  phone: (id: string, version: number) => ["phone-check", id, version] as const,
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
 * (the wizard's live checklist; the Hub suggests 15 s). Polling stops when the domain is active or
 * failed, and pauses while the tab is hidden.
 */
export function useDomain(siteId: string, options: { pollMs?: number } = {}) {
  const hub = useHub();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: manageKeys.domain(siteId),
    queryFn: () => hub.getDomain(siteId),
  });
  const pollMs = options.pollMs ?? 15_000;
  // Keep checking only while DNS is still settling: not once it's live or has failed.
  const waiting =
    query.data != null && query.data.status !== "active" && query.data.status !== "failed";
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
    // Pauses while the tab is hidden.
    refetchIntervalInBackground: false,
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
    setTokenPublish: useMutation({
      mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
        hub.setMcpTokenPublish(siteId, id, publish),
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
    resend: useMutation({
      mutationFn: async (invitationId: string) => {
        if (!hub.resendInvitation) throw new Error("This Hub can't resend invitations.");
        return hub.resendInvitation(siteId, invitationId);
      },
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

export function useHosting(
  siteId: string,
  enabled = true,
  opts: { pollWhileMoving?: number } = {},
) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.hosting(siteId),
    queryFn: () => hub.getHosting(siteId),
    enabled,
    // While a move to Cloudflare is publishing / being confirmed, keep reading: the Hub confirms
    // (or rolls back) as it's read.
    refetchInterval: (q) => {
      const s = q.state.data?.switching?.status;
      return opts.pollWhileMoving && (s === "publishing" || s === "verifying")
        ? opts.pollWhileMoving
        : false;
    },
  });
}

/** "Finish setting up": whether the site has been live yet and what the importer left to do. */
export function useSetupInfo(siteId: string, enabled = true) {
  const hub = useHub();
  return useQuery({
    queryKey: manageKeys.setup(siteId),
    queryFn: () => hub.getSetup(siteId),
    enabled,
    staleTime: 60_000,
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
      mutationFn: (input: HostingTarget | { target: HostingTarget; url?: string }) =>
        typeof input === "string"
          ? hub.switchHosting(siteId, input)
          : hub.switchHosting(siteId, input.target, input.url),
      onSuccess: (info) => {
        qc.setQueryData(manageKeys.hosting(siteId), info);
        qc.setQueryData<Site>(queryKeys.site(siteId), (s) =>
          s ? { ...s, deployTarget: info.target } : s,
        );
        void qc.invalidateQueries({ queryKey: queryKeys.site(siteId) });
      },
    }),
    check: useMutation({
      mutationFn: (input: { token: string; accountId?: string }) =>
        hub.checkCloudflare(siteId, input.token, input.accountId),
    }),
  };
}

/**
 * The Hub's Phone check for the publish dialog (draft pages measured as a phone; unchanged pages
 * come from the Hub's cache). `version` changes with the document so an edit measures again.
 */
export function usePhoneCheckQuery(siteId: string | undefined, version: number, enabled = true) {
  const hub = useOptionalHub();
  return useQuery({
    queryKey: manageKeys.phone(siteId ?? "", version),
    queryFn: () => (hub as NonNullable<typeof hub>).phoneCheck(siteId as string),
    enabled: enabled && !!siteId && !!hub,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
