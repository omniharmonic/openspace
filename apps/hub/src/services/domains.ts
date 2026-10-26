/**
 * Custom domains (architecture §7.3, PRD FR-50/51) for the GitHub Pages target.
 *
 * 1. `lookupDomain` — RDAP registrar + nameserver lookup → registrar-specific instructions and the
 *    exact records (four apex A records for GitHub Pages + `www` CNAME to `<owner>.github.io`).
 * 2. `connectDomain` — sets the Pages custom domain (GitHub then redirects apex ⇄ www, FR-51).
 * 3. `checkDomain` — DNS-over-HTTPS checklist (Studio polls every 15 s); once DNS is right and
 *    GitHub has issued the certificate it enforces HTTPS, commits `openspace.json`
 *    `deploy.customDomain` (which flips the Astro base to "/") and republishes.
 *
 * NOTE: the `openspace.json` commit goes straight through `GitHubAccess.commitFiles` on `main`
 * and the draft branch. Once Task 15's DraftRoom owns the draft, this should go through the room
 * (as a config change) so an open editing session doesn't overwrite it.
 */
import { HostnameSchema, type SiteConfig, SiteConfigSchema } from "@openspace/schema";
import { audit } from "../db/audit";
import { type SiteRow, updateSite } from "../db/sites";
import type { User } from "../db/users";
import type { FetchLike } from "../github/http";
import {
  DRAFT_BRANCH,
  type GitHubAccess,
  MAIN_BRANCH,
  PUBLISH_WORKFLOW,
  parseRepo,
} from "../github/types";
import { badRequest, conflict, HttpError, notFound } from "../lib/errors";
import { DOMAIN_CLAIM_TTL_MS, expireDomainClaims } from "./data";
import type { Services } from "./index";
import { GENERIC_GUIDE, guideFor, publicGuide } from "./registrars";
import { CONFIG_PATH } from "./site-files";

export const GITHUB_PAGES_IPV4 = [
  "185.199.108.153",
  "185.199.109.153",
  "185.199.110.153",
  "185.199.111.153",
];
export const GITHUB_PAGES_IPV6 = [
  "2606:50c0:8000::153",
  "2606:50c0:8001::153",
  "2606:50c0:8002::153",
  "2606:50c0:8003::153",
];

// ---- hostnames ----------------------------------------------------------------------------------

/** Two-label public suffixes common enough to matter for apex detection. */
const MULTI_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "id.au",
  "co.nz",
  "org.nz",
  "net.nz",
  "co.za",
  "org.za",
  "com.br",
  "net.br",
  "org.br",
  "co.jp",
  "ne.jp",
  "or.jp",
  "co.in",
  "net.in",
  "org.in",
  "firm.in",
  "com.mx",
  "org.mx",
  "com.ar",
  "com.co",
  "com.tr",
  "com.sg",
  "com.hk",
  "com.tw",
  "com.cn",
  "co.kr",
  "or.kr",
  "co.il",
  "org.il",
  "com.es",
  "com.pl",
  "co.at",
  "or.at",
]);

export function normalizeHostname(input: string): string {
  let h = input.trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
  h = h.replace(/:\d+$/, "").replace(/\.$/, "");
  const parsed = HostnameSchema.safeParse(h);
  if (!parsed.success) throw badRequest("That doesn't look like a domain name, e.g. mayayoga.com.");
  return h;
}

/** The registrable domain (apex) of a hostname. */
export function apexOf(host: string): string {
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const n = MULTI_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-n).join(".");
}

// ---- RDAP ------------------------------------------------------------------------------------------

export interface RdapResult {
  registrar: string | null;
  nameservers: string[];
}

export interface RdapClient {
  lookup(apex: string): Promise<RdapResult | null>;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, unknown, string, unknown]>];
  entities?: RdapEntity[];
}

export function parseRdap(body: unknown): RdapResult {
  const b = (body ?? {}) as { entities?: RdapEntity[]; nameservers?: Array<{ ldhName?: string }> };
  let registrar: string | null = null;
  const walk = (list: RdapEntity[] | undefined) => {
    for (const e of list ?? []) {
      if (!registrar && e.roles?.includes("registrar")) {
        const fn = e.vcardArray?.[1]?.find((p) => p[0] === "fn");
        if (fn && typeof fn[3] === "string") registrar = fn[3];
      }
      walk(e.entities);
    }
  };
  walk(b.entities);
  return {
    registrar,
    nameservers: (b.nameservers ?? []).map((n) => (n.ldhName ?? "").toLowerCase()).filter(Boolean),
  };
}

export class HttpRdapClient implements RdapClient {
  constructor(
    private readonly fetchFn: FetchLike,
    private readonly base = "https://rdap.org/domain/",
  ) {}

  async lookup(apex: string): Promise<RdapResult | null> {
    try {
      const res = await this.fetchFn(`${this.base}${encodeURIComponent(apex)}`, {
        headers: { Accept: "application/rdap+json, application/json" },
      });
      if (!res.ok) return null;
      return parseRdap(await res.json());
    } catch {
      return null;
    }
  }
}

// ---- DNS over HTTPS --------------------------------------------------------------------------------

export type DnsType = "A" | "AAAA" | "CNAME" | "TXT";
const TYPE_NUM: Record<DnsType, number> = { A: 1, CNAME: 5, AAAA: 28, TXT: 16 };

export interface DnsResolver {
  /** Record data for `name`/`type` (CNAME targets without the trailing dot). */
  resolve(name: string, type: DnsType): Promise<string[]>;
}

/** Cloudflare's DoH JSON API. */
export class DohResolver implements DnsResolver {
  constructor(
    private readonly fetchFn: FetchLike,
    private readonly endpoint = "https://cloudflare-dns.com/dns-query",
  ) {}

  async resolve(name: string, type: DnsType): Promise<string[]> {
    const url = `${this.endpoint}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await this.fetchFn(url, { headers: { Accept: "application/dns-json" } });
    if (!res.ok) throw new HttpError(502, "dns_unavailable", "We couldn't check DNS just now.");
    const body = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return (body.Answer ?? [])
      .filter((a) => a.type === TYPE_NUM[type])
      .map((a) =>
        type === "TXT"
          ? // TXT data comes quoted and may be split into several strings: "v=spf1 " "-all".
            (a.data
              .match(/"((?:[^"\\]|\\.)*)"/g)
              ?.map((q) => q.slice(1, -1))
              .join("") ?? a.data)
          : a.data.replace(/\.$/, "").toLowerCase(),
      );
  }
}

/**
 * Dev resolver: reserved names (`*.test`, `*.example`, `*.localhost`, `*.invalid`) resolve as if
 * configured correctly, so the wizard can be demonstrated offline; anything else goes to `next`.
 */
export class DevDnsResolver implements DnsResolver {
  constructor(
    private readonly pagesHost: (name: string) => Promise<string>,
    private readonly next: DnsResolver,
  ) {}

  async resolve(name: string, type: DnsType): Promise<string[]> {
    if (!/\.(test|example|localhost|invalid)$/.test(name)) return this.next.resolve(name, type);
    if (type === "A") return name.startsWith("www.") ? [] : [...GITHUB_PAGES_IPV4];
    if (type === "CNAME") {
      if (name.startsWith("pm-bounces.")) return ["pm.mtasv.net"];
      return name.startsWith("www.") ? [await this.pagesHost(name)] : [];
    }
    if (type === "TXT") {
      // Email authentication for owner senders (Task 18), configured as a provider would ask.
      if (name.startsWith("_dmarc.")) return ["v=DMARC1; p=none"];
      if (name.includes("._domainkey."))
        return ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0"];
      return [
        "v=spf1 include:amazonses.com include:spf.mtasv.net include:_spf.mx.cloudflare.net ~all",
      ];
    }
    return [];
  }
}

/** Dev: the `<owner>.github.io` host of the site a (reserved) hostname is connected to. */
export function devPagesHostLookup(db: D1Database) {
  return async (name: string): Promise<string> => {
    const apex = apexOf(name);
    const row = await db
      .prepare(
        `SELECT s.repo FROM domains d JOIN sites s ON s.id = d.site_id
         WHERE d.hostname IN (?, ?) LIMIT 1`,
      )
      .bind(apex, `www.${apex}`)
      .first<{ repo: string }>();
    return row ? pagesHostFor(row.repo) : "dev.github.io";
  };
}

// ---- records and checklist -----------------------------------------------------------------------

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME";
  /** Relative host: "@" for the apex, "www", or a subdomain label. */
  host: string;
  name: string;
  value: string;
  optional?: boolean;
}

export function pagesHostFor(repo: string): string {
  return `${parseRepo(repo).owner.toLowerCase()}.github.io`;
}

export function recordsFor(hostname: string, repo: string): DnsRecord[] {
  const apex = apexOf(hostname);
  const pagesHost = pagesHostFor(repo);
  const isApexOrWww = hostname === apex || hostname === `www.${apex}`;
  if (!isApexOrWww) {
    const label = hostname.slice(0, -(apex.length + 1));
    return [{ type: "CNAME", host: label, name: hostname, value: pagesHost }];
  }
  return [
    ...GITHUB_PAGES_IPV4.map((ip) => ({ type: "A" as const, host: "@", name: apex, value: ip })),
    { type: "CNAME", host: "www", name: `www.${apex}`, value: pagesHost },
    ...GITHUB_PAGES_IPV6.map((ip) => ({
      type: "AAAA" as const,
      host: "@",
      name: apex,
      value: ip,
      optional: true,
    })),
  ];
}

export interface ChecklistItem {
  id: "apex" | "www" | "subdomain" | "https";
  label: string;
  ok: boolean;
  expected: string[];
  found: string[];
  hint?: string;
}

export async function dnsChecklist(
  resolver: DnsResolver,
  hostname: string,
  repo: string,
): Promise<ChecklistItem[]> {
  const apex = apexOf(hostname);
  const pagesHost = pagesHostFor(repo);
  if (hostname !== apex && hostname !== `www.${apex}`) {
    const found = await resolver.resolve(hostname, "CNAME");
    return [
      {
        id: "subdomain",
        label: `${hostname} points to GitHub`,
        ok: found.includes(pagesHost),
        expected: [pagesHost],
        found,
      },
    ];
  }
  const [a, www] = await Promise.all([
    resolver.resolve(apex, "A"),
    resolver.resolve(`www.${apex}`, "CNAME"),
  ]);
  const missing = GITHUB_PAGES_IPV4.filter((ip) => !a.includes(ip));
  const extra = a.filter((ip) => !GITHUB_PAGES_IPV4.includes(ip));
  return [
    {
      id: "apex",
      label: `${apex} points to GitHub`,
      ok: missing.length === 0 && extra.length === 0,
      expected: GITHUB_PAGES_IPV4,
      found: a,
      ...(extra.length
        ? { hint: `Remove the other A record${extra.length > 1 ? "s" : ""}: ${extra.join(", ")}.` }
        : missing.length && a.length
          ? {
              hint: `Add the missing address${missing.length > 1 ? "es" : ""}: ${missing.join(", ")}.`,
            }
          : {}),
    },
    {
      id: "www",
      label: `www.${apex} points to GitHub`,
      ok: www.includes(pagesHost),
      expected: [pagesHost],
      found: www,
    },
  ];
}

/** Plain-language progress line for the checklist (§7.3 step 3). */
export function progressMessage(items: ChecklistItem[], status: DomainStatus): string {
  if (status === "active") return "Your domain is connected and secure.";
  const dns = items.filter((i) => i.id !== "https");
  const done = dns.filter((i) => i.ok);
  const waiting = dns.filter((i) => !i.ok);
  if (waiting.length === 0)
    return status === "verifying"
      ? "DNS looks right — waiting for the security certificate (this can take up to an hour)."
      : "DNS looks right.";
  const prefix = done.map((i) => `✓ ${i.label.replace(/ points to GitHub$/, "")} points to GitHub`);
  const rest = waiting
    .map((i) => (i.id === "apex" ? "the main domain" : i.id === "www" ? "www" : i.label))
    .join(" and ");
  return [...prefix, `waiting for ${rest}`].join(" — ");
}

// ---- persistence -----------------------------------------------------------------------------------

export type DomainStatus = "pending" | "verifying" | "active" | "failed";

export interface DomainRow {
  site_id: string;
  hostname: string;
  status: DomainStatus;
  dns_json: string | null;
  https: number;
  created_at: number;
  verified_at: number | null;
  registrar: string | null;
  checked_at: number | null;
}

export interface DomainView {
  hostname: string;
  apex: string;
  status: DomainStatus;
  https: boolean;
  registrar: string | null;
  records: DnsRecord[];
  checklist: ChecklistItem[];
  message: string;
  createdAt: string;
  verifiedAt: string | null;
  checkedAt: string | null;
}

function view(row: DomainRow, repo: string): DomainView {
  const checklist = row.dns_json ? (JSON.parse(row.dns_json) as ChecklistItem[]) : [];
  return {
    hostname: row.hostname,
    apex: apexOf(row.hostname),
    status: row.status,
    https: row.https === 1,
    registrar: row.registrar,
    records: recordsFor(row.hostname, repo),
    checklist,
    message: progressMessage(checklist, row.status),
    createdAt: new Date(row.created_at).toISOString(),
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
  };
}

async function domainRow(db: D1Database, siteId: string): Promise<DomainRow | null> {
  return db
    .prepare("SELECT * FROM domains WHERE site_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(siteId)
    .first<DomainRow>();
}

// ---- operations ------------------------------------------------------------------------------------

export interface DomainDeps {
  services: Services;
  rdap: RdapClient;
  dns: DnsResolver;
}

export async function lookupDomain(deps: DomainDeps, site: SiteRow, input: string) {
  const hostname = normalizeHostname(input);
  const apex = apexOf(hostname);
  const rdap = await deps.rdap.lookup(apex);
  const guide = guideFor(rdap?.registrar ?? null, rdap?.nameservers ?? []);
  return {
    hostname,
    apex,
    registrar: rdap?.registrar ?? null,
    nameservers: rdap?.nameservers ?? [],
    guide: publicGuide(guide ?? GENERIC_GUIDE),
    records: recordsFor(hostname, site.repo),
  };
}

export async function getDomain(services: Services, site: SiteRow): Promise<DomainView | null> {
  const row = await domainRow(services.db, site.id);
  return row ? view(row, site.repo) : null;
}

function requirePagesTarget(site: SiteRow) {
  if (site.deploy_target !== "github-pages")
    throw new HttpError(
      409,
      "not_supported",
      "Custom domains for the Cloudflare target are connected in your Cloudflare account.",
    );
}

export async function connectDomain(
  deps: DomainDeps,
  site: SiteRow,
  user: User,
  input: string,
): Promise<DomainView> {
  requirePagesTarget(site);
  const { services } = deps;
  const hostname = normalizeHostname(input);
  const now = services.now();
  const taken = await services.db
    .prepare("SELECT site_id, status, created_at, verified_at FROM domains WHERE hostname = ?")
    .bind(hostname)
    .first<{ site_id: string; status: string; created_at: number; verified_at: number | null }>();
  if (taken && taken.site_id !== site.id) {
    // An unverified claim older than 7 days is released; anything else belongs to that site.
    if (
      taken.status === "active" ||
      taken.verified_at !== null ||
      now - taken.created_at < DOMAIN_CLAIM_TTL_MS
    )
      throw conflict("domain_taken", "That domain is already connected to another site.");
    await expireDomainClaims(services.db, now);
  }
  const rdap = await deps.rdap.lookup(apexOf(hostname));
  const gh = services.github({ site, user });
  await gh.setPagesDomain(parseRepo(site.repo), hostname);
  await services.db.batch([
    services.db
      .prepare("DELETE FROM domains WHERE site_id = ? AND hostname != ?")
      .bind(site.id, hostname),
    services.db
      .prepare(
        `INSERT INTO domains (site_id, hostname, status, https, created_at, registrar)
         VALUES (?, ?, 'pending', 0, ?, ?)
         ON CONFLICT (site_id, hostname) DO UPDATE SET
           -- Re-submitting keeps a live domain live. created_at is never reset: an unverified
           -- claim keeps its original 7-day clock, so re-submitting can't squat a name forever.
           -- (expireDomainClaims never touches verified rows.)
           status = CASE WHEN domains.status = 'active' OR domains.verified_at IS NOT NULL
                         THEN domains.status ELSE 'pending' END,
           registrar = excluded.registrar`,
      )
      .bind(site.id, hostname, now, rdap?.registrar ?? null),
  ]);
  // Public endpoints accept the new domain's origin straight away (CORS allowlist).
  await updateSite(services.db, site.id, { domain: hostname }, now);
  await audit(
    services.db,
    { siteId: site.id, actor: user.id, action: "domain.connect", meta: { hostname } },
    now,
  );
  const row = await domainRow(services.db, site.id);
  if (!row) throw notFound();
  return view(row, site.repo);
}

/** Update `openspace.json` deploy.customDomain on main and the draft branch. */
export async function commitCustomDomain(
  gh: GitHubAccess,
  site: SiteRow,
  hostname: string | null,
  user: User | null,
): Promise<boolean> {
  const repo = parseRepo(site.repo);
  let changed = false;
  for (const branch of [MAIN_BRANCH, DRAFT_BRANCH]) {
    const head = await gh.getRef(repo, branch);
    if (!head) continue;
    const raw = await gh.readFile(repo, CONFIG_PATH, head);
    if (!raw) continue;
    const current = SiteConfigSchema.parse(JSON.parse(raw));
    if (current.deploy.customDomain === hostname) continue;
    // Validate the result against the schema (ADR-2: no unvalidated config writes).
    const config: SiteConfig = SiteConfigSchema.parse({
      ...current,
      deploy: { ...current.deploy, customDomain: hostname },
    });
    await gh.commitFiles(repo, {
      branch,
      expectedHead: head,
      message: hostname ? `Use custom domain ${hostname}` : "Remove custom domain",
      files: [{ path: CONFIG_PATH, content: `${JSON.stringify(config, null, 2)}\n` }],
      ...(user ? { author: { name: user.name ?? user.login } } : {}),
    });
    if (branch === MAIN_BRANCH) changed = true;
  }
  return changed;
}

export async function checkDomain(
  deps: DomainDeps,
  site: SiteRow,
  user: User,
): Promise<DomainView> {
  const { services } = deps;
  const row = await domainRow(services.db, site.id);
  if (!row) throw notFound("No custom domain is connected.");
  const now = services.now();
  const gh = services.github({ site, user });
  const repo = parseRepo(site.repo);
  const items = await dnsChecklist(deps.dns, row.hostname, site.repo);
  const dnsOk = items.every((i) => i.ok);
  let status: DomainStatus = row.status === "active" ? "active" : "pending";
  let https = row.https === 1;
  if (dnsOk && status !== "active") {
    status = "verifying";
    const pages = await gh.getPages(repo);
    if (pages && pages.cname !== row.hostname) await gh.setPagesDomain(repo, row.hostname);
    const certificate = pages?.certificate ?? "none";
    if (certificate === "errored") status = "failed";
    if (certificate === "approved") {
      if (!pages?.httpsEnforced) await gh.setPagesHttps(repo, true);
      https = true;
      const changed = await commitCustomDomain(gh, site, row.hostname, user);
      if (changed)
        await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
      // Dev keeps serving the Hub preview, so the site URL only changes on real GitHub.
      if (gh.kind !== "dev")
        await updateSite(services.db, site.id, { url: `https://${row.hostname}/` }, now);
      status = "active";
      await audit(
        services.db,
        {
          siteId: site.id,
          actor: user.id,
          action: "domain.activate",
          meta: { hostname: row.hostname },
        },
        now,
      );
    }
    items.push({
      id: "https",
      label: "Security certificate",
      ok: certificate === "approved",
      expected: ["approved"],
      found: [certificate],
      ...(certificate === "errored"
        ? { hint: "GitHub couldn't issue the certificate. Check the records, then try again." }
        : {}),
    });
  }
  await services.db
    .prepare(
      `UPDATE domains SET status = ?, https = ?, dns_json = ?, checked_at = ?,
         verified_at = COALESCE(verified_at, ?) WHERE site_id = ? AND hostname = ?`,
    )
    .bind(
      status,
      https ? 1 : 0,
      JSON.stringify(items),
      now,
      status === "active" ? now : null,
      site.id,
      row.hostname,
    )
    .run();
  const updated = await domainRow(services.db, site.id);
  return view(updated ?? row, site.repo);
}

export async function removeDomain(services: Services, site: SiteRow, user: User): Promise<void> {
  const row = await domainRow(services.db, site.id);
  if (!row) throw notFound("No custom domain is connected.");
  const gh = services.github({ site, user });
  const repo = parseRepo(site.repo);
  await gh.setPagesDomain(repo, null);
  const changed = await commitCustomDomain(gh, site, null, user);
  if (changed) await gh.dispatchWorkflow(repo, { workflow: PUBLISH_WORKFLOW, ref: MAIN_BRANCH });
  const pages = await gh.getPages(repo).catch(() => null);
  const now = services.now();
  await services.db.prepare("DELETE FROM domains WHERE site_id = ?").bind(site.id).run();
  await updateSite(
    services.db,
    site.id,
    { domain: null, ...(pages?.url ? { url: pages.url } : {}) },
    now,
  );
  await audit(
    services.db,
    { siteId: site.id, actor: user.id, action: "domain.remove", meta: { hostname: row.hostname } },
    now,
  );
}
