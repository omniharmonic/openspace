import type {
  Approval,
  Collaborator,
  DnsRecord,
  DomainCheckItem,
  DomainView,
  ExportKind,
  HostingInfo,
  Invitation,
  ManageApi,
  McpGrant,
  McpToken,
  RegistrarGuide,
} from "./manage-types";
import { type HubApi, HubError, type Site, type User } from "./types";

/**
 * In-memory implementation of the site-management routes for the mock Hub (dev + tests).
 * Behaviour mirrors the Hub's documented contracts (Tasks 15, 16, 18) and the planned routes
 * (media upload, MCP tokens/grants, hosting) closely enough to drive every Studio flow offline.
 */

export interface ManageMockState {
  /** Uploaded files by site → path → sha256 + size. */
  media: Record<string, Record<string, { sha256: string; bytes: number; mime: string }>>;
  pagePasswords: Record<string, Record<string, string>>;
  domains: Record<string, DomainView & { checks: number }>;
  tokens: Record<string, McpToken[]>;
  grants: McpGrant[] | null;
  collaborators: Record<string, Collaborator[]>;
  invitations: Record<string, Invitation[]>;
  approvals: Record<string, Approval[]>;
  /** Sealed secrets as received (ciphertext only — what the Hub would relay to GitHub). */
  secrets: Record<string, Record<string, { encryptedValue: string; keyId: string }>>;
  /** The "repo" Actions public key handed to Studio. Tests may replace it with their own pair. */
  actionsKey: { keyId: string; key: string };
  /** Make the next upload fail (tests the retry queue). */
  failUploads: number;
}

export interface ManageMockContext {
  calls: Array<{ method: keyof HubApi; args: unknown[] }>;
  wait: () => Promise<unknown>;
  requireUser: () => User;
  findSite: (id: string) => Site;
  now: () => number;
}

const clone = <T>(v: T): T => structuredClone(v);

/** `record[key]`, created with `init()` when missing. */
function bucket<T>(record: Record<string, T>, key: string, init: () => NoInfer<T>): T {
  const found = record[key];
  if (found !== undefined) return found;
  const made = init();
  record[key] = made;
  return made;
}

export const GITHUB_PAGES_IPV4 = [
  "185.199.108.153",
  "185.199.109.153",
  "185.199.110.153",
  "185.199.111.153",
];
const GITHUB_PAGES_IPV6 = [
  "2606:50c0:8000::153",
  "2606:50c0:8001::153",
  "2606:50c0:8002::153",
  "2606:50c0:8003::153",
];

const guide = (
  id: string,
  name: string,
  dnsUrl: string,
  steps: string[],
  watchOut: string[] = [],
): RegistrarGuide => ({ id, name, dnsUrl, hostApex: "@", steps, watchOut });

/** The eight illustrated registrars plus the generic guide (mirrors the Hub's list). */
export const MOCK_REGISTRARS: RegistrarGuide[] = [
  guide(
    "namecheap",
    "Namecheap",
    "https://ap.www.namecheap.com/domains/list/",
    [
      "Sign in to Namecheap and open Domain List.",
      "Click Manage next to your domain, then open the Advanced DNS tab.",
      "Under Host Records, click Add New Record for each record below (Host “@” for the main domain, “www” for www).",
      "Click the green check mark to save each record.",
    ],
    [
      "Delete the default “URL Redirect Record” and “parkingpage” CNAME if they are there.",
      "Nameservers must be set to “Namecheap BasicDNS” for these records to take effect.",
    ],
  ),
  guide(
    "godaddy",
    "GoDaddy",
    "https://dcc.godaddy.com/control/portfolio",
    [
      "Sign in to GoDaddy and open your Domain Portfolio.",
      "Select your domain, then choose DNS.",
      "Click Add New Record and add each record below (Name “@” for the main domain).",
      "For www, edit the existing CNAME record named “www” instead of adding a second one.",
    ],
    [
      "Delete the default A record that points to “Parked”.",
      "Turn off Domain Forwarding if it is on.",
    ],
  ),
  guide(
    "cloudflare",
    "Cloudflare",
    "https://dash.cloudflare.com/",
    [
      "Sign in to Cloudflare and select your domain.",
      "Open DNS → Records and click Add record for each record below (Name “@” for the main domain).",
      "Set Proxy status to “DNS only” (grey cloud) for these records.",
      "Click Save.",
    ],
    ["Records left “Proxied” (orange cloud) stop the security certificate from being issued."],
  ),
  guide(
    "squarespace",
    "Squarespace Domains (formerly Google Domains)",
    "https://account.squarespace.com/domains",
    [
      "Sign in to Squarespace and open Domains.",
      "Choose your domain, then DNS → DNS Settings.",
      "Under Custom records, click Add record for each record below.",
      "Save.",
    ],
  ),
  guide("porkbun", "Porkbun", "https://porkbun.com/account/domainsSpeedy", [
    "Sign in to Porkbun and open Domain Management.",
    "Click DNS next to your domain.",
    "Add each record below (leave Host blank for the main domain).",
  ]),
  guide("hover", "Hover", "https://www.hover.com/control_panel", [
    "Sign in to Hover and choose your domain.",
    "Open the DNS tab and click Add A Record / Add CNAME Record for each record below.",
  ]),
  guide("gandi", "Gandi", "https://admin.gandi.net/domain/", [
    "Sign in to Gandi and open Domain names.",
    "Choose your domain, then DNS Records → Add record.",
    "Add each record below, then save.",
  ]),
  guide("namecom", "Name.com", "https://www.name.com/account/domain", [
    "Sign in to Name.com and open My Domains.",
    "Choose your domain, then Manage DNS Records.",
    "Add each record below (leave Host blank for the main domain).",
  ]),
];

const GENERIC: RegistrarGuide = guide(
  "other",
  "your domain provider",
  "",
  [
    "Sign in where you bought your domain.",
    "Find the DNS settings (sometimes called “DNS records”, “Zone editor” or “Advanced DNS”).",
    "Add each record below exactly as shown.",
  ],
  ["Remove any existing “parking” or “forwarding” records for the same names."],
);

function apexOf(hostname: string): string {
  const parts = hostname.split(".");
  return parts.slice(-2).join(".");
}

export function normalizeDomainInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function pagesHost(site: Site): string {
  return `${(site.owner ?? site.repo.split("/")[0] ?? "you").toLowerCase()}.github.io`;
}

function recordsFor(hostname: string, site: Site): DnsRecord[] {
  const apex = apexOf(hostname);
  const target = pagesHost(site);
  if (hostname !== apex && hostname !== `www.${apex}`) {
    return [
      { type: "CNAME", host: hostname.slice(0, -(apex.length + 1)), name: hostname, value: target },
    ];
  }
  return [
    ...GITHUB_PAGES_IPV4.map((ip) => ({ type: "A", host: "@", name: apex, value: ip })),
    { type: "CNAME", host: "www", name: `www.${apex}`, value: target },
    ...GITHUB_PAGES_IPV6.map((ip) => ({
      type: "AAAA",
      host: "@",
      name: apex,
      value: ip,
      optional: true,
    })),
  ];
}

/** Which registrar a domain is "at" in the mock (deterministic; `.test` → Namecheap). */
function registrarFor(apex: string): RegistrarGuide | null {
  if (apex.endsWith(".invalid")) return null;
  if (apex.endsWith(".test")) return MOCK_REGISTRARS[0] ?? null;
  let h = 0;
  for (const ch of apex) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MOCK_REGISTRARS[h % MOCK_REGISTRARS.length] ?? null;
}

function checklistFor(view: DomainView, site: Site, stage: number): DomainCheckItem[] {
  const target = pagesHost(site);
  const apex = view.apex;
  if (view.hostname !== apex && view.hostname !== `www.${apex}`) {
    return [
      {
        id: "subdomain",
        label: `${view.hostname} points to GitHub`,
        ok: stage >= 1,
        expected: [target],
        found: stage >= 1 ? [target] : [],
      },
      {
        id: "https",
        label: "Security certificate (HTTPS)",
        ok: stage >= 2,
        expected: [],
        found: [],
      },
    ];
  }
  return [
    {
      id: "www",
      label: `www.${apex} points to GitHub`,
      ok: stage >= 1,
      expected: [target],
      found: stage >= 1 ? [target] : [],
      hint: stage >= 1 ? undefined : "Add the CNAME record for www.",
    },
    {
      id: "apex",
      label: `${apex} points to GitHub`,
      ok: stage >= 2,
      expected: GITHUB_PAGES_IPV4,
      found: stage >= 2 ? GITHUB_PAGES_IPV4 : stage >= 1 ? [] : ["198.51.100.7"],
      hint: stage >= 2 ? undefined : "Add the four A records for the main domain (@).",
    },
    { id: "https", label: "Security certificate (HTTPS)", ok: stage >= 3, expected: [], found: [] },
  ];
}

function messageFor(view: DomainView): string {
  const pending = view.checklist.find((c) => !c.ok);
  const done = view.checklist.filter((c) => c.ok && c.id !== "https");
  if (!pending) return `✓ ${view.hostname} is connected and secure.`;
  if (pending.id === "https")
    return "✓ Your domain points to your site — waiting for the security certificate.";
  if (done.length) return `✓ ${done[0]?.label} — waiting for the main domain.`;
  return "Waiting for your new records. Changes usually show up within a few minutes, sometimes up to an hour.";
}

function randomToken(len = 24): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function createManageMock(ctx: ManageMockContext): {
  api: ManageApi;
  state: ManageMockState;
} {
  const { calls, wait, requireUser, findSite, now } = ctx;
  const state: ManageMockState = {
    media: {},
    pagePasswords: {},
    domains: {},
    tokens: {},
    grants: null,
    collaborators: {},
    invitations: {},
    approvals: {},
    secrets: {},
    // 32 bytes; a real repository key comes from GitHub's `actions/secrets/public-key`.
    actionsKey: {
      keyId: "568250167242549743",
      key: "0lQuclhy5ouoJjqtaVnApZTG5UQTPR2uVwXIrBjrebA=",
    },
    failUploads: 0,
  };

  const call = async (method: keyof HubApi, args: unknown[]) => {
    calls.push({ method, args });
    await wait();
    return requireUser();
  };

  const canManage = (site: Site) => site.role === "owner" || site.role === "designer";
  const isOwner = (site: Site, user: User) => site.role === "owner" || site.owner === user.login;
  const forbid = (message: string) => new HubError(403, "forbidden", message);

  const collaboratorsOf = (site: Site, user: User): Collaborator[] => {
    state.collaborators[site.id] ??= [
      {
        userId: user.id,
        login: site.owner ?? user.login,
        name: site.owner === user.login || !site.owner ? user.name : null,
        avatarUrl: user.avatarUrl,
        role: "owner",
        lockedSections: [],
        since: site.createdAt,
      },
      {
        userId: "gh_2002",
        login: "jordan-lee",
        name: "Jordan Lee",
        avatarUrl: null,
        role: "editor",
        lockedSections: [],
        since: site.createdAt,
      },
    ];
    return state.collaborators[site.id] as Collaborator[];
  };

  const approvalsOf = (site: Site): Approval[] => {
    state.approvals[site.id] ??= [
      {
        id: "apr_1",
        collection: "journal",
        slug: "spring-retreat-recap",
        title: "Spring retreat recap",
        submittedBy: { userId: "gh_3003", login: "rae-okafor", name: "Rae Okafor" },
        status: "pending",
        note: null,
        createdAt: iso(now() - 86_400_000),
        updatedAt: iso(now() - 86_400_000),
        decidedAt: null,
      },
    ];
    return state.approvals[site.id] as Approval[];
  };

  const hostingOf = (site: Site): HostingInfo => ({
    target: site.deployTarget === "cloudflare" ? "cloudflare" : "github-pages",
    url: site.url,
    actionsPublicKey: clone(state.actionsKey),
    secrets: Object.keys(state.secrets[site.id] ?? {}),
    switching: null,
  });

  const api: ManageApi = {
    async renameSite(siteId, name) {
      await call("renameSite", [siteId, name]);
      const site = findSite(siteId);
      if (!name.trim()) throw new HubError(400, "invalid_name", "Give your site a name.");
      site.name = name.trim().slice(0, 80);
    },

    async uploadMedia(siteId, file, meta) {
      await call("uploadMedia", [siteId, file, meta]);
      findSite(siteId);
      if (state.failUploads > 0) {
        state.failUploads--;
        throw new HubError(0, "network", "Can't reach OpenSpace. Check your connection.");
      }
      if (file.size !== meta.bytes)
        throw new HubError(400, "size_mismatch", "The file didn't arrive in one piece. Try again.");
      const files = bucket(state.media, siteId, () => ({}));
      const existing = files[meta.path];
      if (existing && existing.sha256 === meta.sha256)
        return { path: meta.path, bytes: meta.bytes, existed: true };
      files[meta.path] = { sha256: meta.sha256, bytes: meta.bytes, mime: meta.mime };
      return { path: meta.path, bytes: meta.bytes };
    },

    async listPagePasswords(siteId) {
      await call("listPagePasswords", [siteId]);
      findSite(siteId);
      return Object.keys(state.pagePasswords[siteId] ?? {}).map((pageId) => ({
        pageId,
        updatedAt: iso(now()),
      }));
    },
    async setPagePassword(siteId, pageId, password) {
      await call("setPagePassword", [siteId, pageId, "•••"]);
      const site = findSite(siteId);
      if (!canManage(site)) throw forbid("Only owners and designers can set page passwords.");
      if (password.length < 4 || password.length > 200)
        throw new HubError(400, "invalid_password", "Use a password between 4 and 200 characters.");
      bucket(state.pagePasswords, siteId, () => ({}))[pageId] = "pbkdf2$mock";
    },
    async clearPagePassword(siteId, pageId) {
      await call("clearPagePassword", [siteId, pageId]);
      findSite(siteId);
      delete state.pagePasswords[siteId]?.[pageId];
    },

    async listRegistrars() {
      calls.push({ method: "listRegistrars", args: [] });
      await wait();
      return clone(MOCK_REGISTRARS);
    },
    async getDomain(siteId) {
      await call("getDomain", [siteId]);
      findSite(siteId);
      const d = state.domains[siteId];
      if (!d) return null;
      const { checks: _c, ...view } = d;
      return clone(view);
    },
    async lookupDomain(siteId, input) {
      await call("lookupDomain", [siteId, input]);
      const site = findSite(siteId);
      const hostname = normalizeDomainInput(input);
      if (!HOSTNAME_RE.test(hostname))
        throw new HubError(400, "invalid_domain", "Enter a domain like mayayoga.com.");
      if (/(^|\.)(github\.io|workers\.dev|pages\.dev|openspace\.host)$/.test(hostname))
        throw new HubError(
          400,
          "bad_request",
          "That's a GitHub Pages address, which your site already has. Enter a domain you bought, e.g. mayayoga.com.",
        );
      const apex = apexOf(hostname);
      const reg = registrarFor(apex);
      return {
        hostname,
        apex,
        registrar: reg?.name ?? null,
        nameservers: reg ? [`ns1.${reg.id}.example`, `ns2.${reg.id}.example`] : [],
        guide: clone(reg ?? GENERIC),
        records: recordsFor(hostname, site),
      };
    },
    async connectDomain(siteId, input) {
      await call("connectDomain", [siteId, input]);
      const site = findSite(siteId);
      if (!canManage(site)) throw forbid("Only owners and designers can connect a domain.");
      if (site.deployTarget === "cloudflare")
        throw new HubError(
          409,
          "not_supported",
          "Sites hosted on Cloudflare connect their domain in the Cloudflare dashboard for now.",
        );
      const hostname = normalizeDomainInput(input);
      if (!HOSTNAME_RE.test(hostname))
        throw new HubError(400, "invalid_domain", "Enter a domain like mayayoga.com.");
      const taken = Object.entries(state.domains).some(
        ([id, d]) => id !== siteId && d.hostname === hostname,
      );
      if (taken)
        throw new HubError(409, "domain_taken", "Another site is already using that domain.");
      const apex = apexOf(hostname);
      const view: DomainView & { checks: number } = {
        hostname,
        apex,
        status: "pending",
        https: false,
        registrar: registrarFor(apex)?.name ?? null,
        records: recordsFor(hostname, site),
        checklist: [],
        message: "",
        createdAt: iso(now()),
        verifiedAt: null,
        checkedAt: null,
        checks: 0,
      };
      view.checklist = checklistFor(view, site, 0);
      view.message = messageFor(view);
      state.domains[siteId] = view;
      site.domain = hostname;
      const { checks: _c, ...out } = view;
      return clone(out);
    },
    async checkDomain(siteId) {
      await call("checkDomain", [siteId]);
      const site = findSite(siteId);
      const d = state.domains[siteId];
      if (!d) throw new HubError(404, "no_domain", "There's no domain connected to this site yet.");
      if (d.status !== "active") {
        d.checks++;
        const subdomain = d.hostname !== d.apex && d.hostname !== `www.${d.apex}`;
        const stage = subdomain ? Math.min(d.checks, 2) : Math.min(d.checks, 3);
        d.checklist = checklistFor(d, site, stage);
        const allOk = d.checklist.every((c) => c.ok);
        const dnsOk = d.checklist.filter((c) => c.id !== "https").every((c) => c.ok);
        d.https = allOk;
        d.status = allOk ? "active" : dnsOk ? "verifying" : "pending";
        if (allOk) {
          d.verifiedAt = iso(now());
          site.url = `https://${d.hostname}/`;
        }
        d.message = messageFor(d);
      }
      d.checkedAt = iso(now());
      const { checks: _c, ...out } = d;
      return clone(out);
    },
    async removeDomain(siteId) {
      await call("removeDomain", [siteId]);
      const site = findSite(siteId);
      delete state.domains[siteId];
      site.domain = null;
    },

    async listMcpTokens(siteId) {
      await call("listMcpTokens", [siteId]);
      findSite(siteId);
      return clone(state.tokens[siteId] ?? []);
    },
    async createMcpToken(siteId, label) {
      await call("createMcpToken", [siteId, label]);
      findSite(siteId);
      const secret = `osmcp_${randomToken(32)}`;
      const base = "http://localhost:8787/mcp/t/";
      const token: McpToken = {
        id: `mcpt_${randomToken(10)}`,
        label: label.trim() || "Claude",
        // Like the Hub: lists only ever show the link masked; the full one comes back once.
        url: `${base}osmcp_…${secret.slice(-4)}`,
        createdAt: iso(now()),
        lastUsedAt: null,
        publish: false,
      };
      bucket(state.tokens, siteId, () => []).push(token);
      return { ...clone(token), url: `${base}${secret}` };
    },
    async revokeMcpToken(siteId, tokenId) {
      await call("revokeMcpToken", [siteId, tokenId]);
      findSite(siteId);
      state.tokens[siteId] = (state.tokens[siteId] ?? []).filter((t) => t.id !== tokenId);
    },
    async setMcpTokenPublish(siteId, tokenId, publish) {
      await call("setMcpTokenPublish", [siteId, tokenId, publish]);
      const site = findSite(siteId);
      if (site.role !== "owner")
        throw new HubError(403, "forbidden", "Only the site owner can do that.");
      const t = (state.tokens[siteId] ?? []).find((x) => x.id === tokenId);
      if (!t) throw new HubError(404, "not_found", "That link was already turned off.");
      t.publish = publish;
      return clone(t);
    },
    async listMcpGrants() {
      await call("listMcpGrants", []);
      state.grants ??= [
        {
          id: "grant_claude",
          clientName: "Claude",
          sites: [],
          publish: false,
          createdAt: iso(now() - 3 * 86_400_000),
          lastUsedAt: iso(now() - 3_600_000),
        },
      ];
      return clone(state.grants);
    },
    async revokeMcpGrant(grantId) {
      await call("revokeMcpGrant", [grantId]);
      state.grants = (state.grants ?? []).filter((g) => g.id !== grantId);
    },
    async setMcpGrantPublish(grantId, publish) {
      await call("setMcpGrantPublish", [grantId, publish]);
      const g = state.grants?.find((x) => x.id === grantId);
      if (!g) throw new HubError(404, "not_found", "That connection was already removed.");
      g.publish = publish;
      return clone(g);
    },

    async listCollaborators(siteId) {
      const user = await call("listCollaborators", [siteId]);
      const site = findSite(siteId);
      return {
        collaborators: clone(collaboratorsOf(site, user)),
        invitations: canManage(site)
          ? clone((state.invitations[siteId] ?? []).filter((i) => i.status === "pending"))
          : [],
      };
    },
    async inviteCollaborator(siteId, input) {
      const user = await call("inviteCollaborator", [siteId, input]);
      const site = findSite(siteId);
      if (!canManage(site)) throw forbid("Only owners and designers can invite people.");
      const email = input.email?.trim().toLowerCase() || null;
      const login = input.login?.trim().replace(/^@/, "") || null;
      if (!email && !login)
        throw new HubError(400, "invalid_invite", "Enter an email address or GitHub username.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new HubError(400, "invalid_email", "That email address doesn't look right.");
      if (login && collaboratorsOf(site, user).some((c) => c.login === login))
        throw new HubError(409, "already_collaborator", `${login} already works on this site.`);
      const acceptUrl = `http://localhost:5173/invite/${randomToken(20)}`;
      const invitation: Invitation = {
        acceptUrl,
        id: `inv_${randomToken(8)}`,
        email,
        login,
        role: input.role,
        status: "pending",
        invitedBy: user.login,
        createdAt: iso(now()),
        expiresAt: iso(now() + 14 * 86_400_000),
      };
      bucket(state.invitations, siteId, () => []).push(invitation);
      return { invitation: clone(invitation), acceptUrl, emailed: Boolean(email) };
    },
    async resendInvitation(siteId, invitationId) {
      await call("resendInvitation", [siteId, invitationId]);
      const site = findSite(siteId);
      if (!canManage(site)) throw forbid("Only owners and designers can resend invitations.");
      const inv = (state.invitations[siteId] ?? []).find(
        (i) => i.id === invitationId && i.status === "pending",
      );
      if (!inv) throw new HubError(404, "not_found", "That invitation isn't waiting any more.");
      inv.expiresAt = iso(now() + 14 * 86_400_000);
      inv.acceptUrl ??= `http://localhost:5173/invite/${randomToken(20)}`;
      return { invitation: clone(inv), acceptUrl: inv.acceptUrl, emailed: Boolean(inv.email) };
    },
    async updateCollaborator(siteId, userId, patch) {
      const user = await call("updateCollaborator", [siteId, userId, patch]);
      const site = findSite(siteId);
      if (!canManage(site)) throw forbid("Only owners and designers can change roles.");
      const c = collaboratorsOf(site, user).find((x) => x.userId === userId);
      if (!c) throw new HubError(404, "not_found", "That person isn't on this site any more.");
      if (c.role === "owner" && patch.role)
        throw new HubError(400, "owner_role", "Transfer ownership to change the owner's role.");
      if (patch.role) c.role = patch.role;
      if (patch.lockedSections) c.lockedSections = [...patch.lockedSections];
      return clone(c);
    },
    async removeCollaborator(siteId, userId) {
      const user = await call("removeCollaborator", [siteId, userId]);
      const site = findSite(siteId);
      const list = collaboratorsOf(site, user);
      const c = list.find((x) => x.userId === userId);
      if (c?.role === "owner") throw new HubError(400, "owner", "The owner can't be removed.");
      if (!canManage(site) && userId !== user.id)
        throw forbid("Only owners and designers can remove people.");
      state.collaborators[siteId] = list.filter((x) => x.userId !== userId);
    },
    async revokeInvitation(siteId, invitationId) {
      await call("revokeInvitation", [siteId, invitationId]);
      findSite(siteId);
      const inv = state.invitations[siteId]?.find((i) => i.id === invitationId);
      if (inv) inv.status = "revoked";
    },
    async listApprovals(siteId, status) {
      await call("listApprovals", [siteId, status]);
      const site = findSite(siteId);
      return clone(approvalsOf(site).filter((a) => !status || a.status === status));
    },
    async decideApproval(siteId, approvalId, decision, note) {
      await call("decideApproval", [siteId, approvalId, decision, note]);
      const site = findSite(siteId);
      if (site.role === "contributor") throw forbid("Editors approve contributions.");
      const a = approvalsOf(site).find((x) => x.id === approvalId);
      if (!a) throw new HubError(404, "not_found", "That submission is gone.");
      a.status = decision === "approve" ? "approved" : "rejected";
      a.note = note ?? null;
      a.decidedAt = iso(now());
      a.updatedAt = a.decidedAt;
      return clone(a);
    },

    async getHosting(siteId) {
      await call("getHosting", [siteId]);
      return hostingOf(findSite(siteId));
    },
    async putHostingSecrets(siteId, secrets) {
      const user = await call("putHostingSecrets", [siteId, secrets]);
      const site = findSite(siteId);
      if (!isOwner(site, user)) throw forbid("Only the owner can change hosting.");
      for (const s of secrets) {
        if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(s.name))
          throw new HubError(400, "invalid_secret", `“${s.name}” isn't a valid secret name.`);
        if (s.keyId !== state.actionsKey.keyId)
          throw new HubError(409, "stale_key", "The encryption key changed. Try again.");
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s.encryptedValue))
          throw new HubError(400, "invalid_secret", "Secrets must be sealed before sending.");
        bucket(state.secrets, siteId, () => ({}))[s.name] = {
          encryptedValue: s.encryptedValue,
          keyId: s.keyId,
        };
      }
    },
    async switchHosting(siteId, target) {
      const user = await call("switchHosting", [siteId, target]);
      const site = findSite(siteId);
      if (!isOwner(site, user)) throw forbid("Only the owner can change hosting.");
      if (target === "cloudflare") {
        const have = state.secrets[siteId] ?? {};
        if (!have.CLOUDFLARE_API_TOKEN || !have.CLOUDFLARE_ACCOUNT_ID)
          throw new HubError(
            409,
            "missing_secrets",
            "Add your Cloudflare token and account ID first.",
          );
        if (state.domains[siteId])
          state.domains[siteId].message = "Move your domain to Cloudflare to finish the switch.";
      }
      site.deployTarget = target;
      return hostingOf(site);
    },

    async downloadExport(siteId, kind: ExportKind) {
      await call("downloadExport", [siteId, kind]);
      const site = findSite(siteId);
      const files: Record<ExportKind, [string, string, string]> = {
        data: ["openspace-data.zip", "application/zip", `README.txt\n${site.name} — exported data`],
        submissions: [
          "form-entries.csv",
          "text/csv",
          "id,form_id,form_name,created_at,read,spam,source\n",
        ],
        subscribers: [
          "subscribers.csv",
          "text/csv",
          "id,email,first_name,status,tags,created_at\n",
        ],
        members: [
          "members.csv",
          "text/csv",
          "id,email,name,tier,status,paid,created_at,last_login_at\n",
        ],
      };
      const [filename, type, body] = files[kind];
      return { blob: new Blob([body], { type }), filename };
    },
  };

  return { api, state };
}
