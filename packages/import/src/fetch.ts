/**
 * Polite HTTP for importing a site its owner is moving: one request at a time per host with a
 * pause between requests, Retry-After on 429/503, robots.txt honoured, an identifying
 * User-Agent, and every request logged for the import report.
 */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export const USER_AGENT =
  "OpenSpace-Importer/0.1 (+https://github.com/omniharmonic/openspace; site owner migration)";

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/** Rules that apply to us: the `*` group (we do not claim any crawler's identity). */
export function parseRobots(text: string, agent = "openspace-importer"): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = (m[1] as string).toLowerCase();
    const value = (m[2] as string).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value) current.disallow.push(value);
    if (key === "allow" && value) current.allow.push(value);
  }
  const mine = groups.filter((g) => g.agents.includes(agent));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
  };
}

function patternMatch(pattern: string, path: string): number {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    `^${body
      .split("*")
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}${anchored ? "$" : ""}`,
  );
  return re.test(path) ? body.length : -1;
}

/** Longest matching rule wins; Allow wins ties (RFC 9309). */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string): boolean {
  let best = -1;
  let allowed = true;
  for (const p of rules.disallow) {
    const n = patternMatch(p, pathAndQuery);
    if (n > best) {
      best = n;
      allowed = false;
    }
  }
  for (const p of rules.allow) {
    const n = patternMatch(p, pathAndQuery);
    if (n >= best && n >= 0) {
      best = n;
      allowed = true;
    }
  }
  return allowed;
}

export interface SiteFetcherOptions {
  fetch?: FetchFn;
  /** Pause between requests to the site itself (ms, default 300). */
  delayMs?: number;
  /** Pause between image downloads from the CDN (ms, default 50). */
  cdnDelayMs?: number;
  /** Honour robots.txt (default true). */
  robots?: boolean;
  /**
   * Requests robots.txt would refuse but the owner explicitly allowed (e.g. Squarespace's
   * `?format=json` with `--owner`).
   */
  ownerAllows?: (url: URL) => boolean;
  /** Called once per network request (progress). */
  onRequest?: (url: string) => void;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export interface FetchedText {
  url: string;
  status: number;
  text: string;
  contentType: string;
}

export class RobotsDisallowed extends Error {
  constructor(readonly url: string) {
    super(`robots.txt asks automated tools not to fetch ${url}`);
  }
}

export class SiteFetcher {
  private readonly fetchFn: FetchFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly lastByHost = new Map<string, number>();
  private readonly queueByHost = new Map<string, Promise<unknown>>();
  private readonly robotsByHost = new Map<string, Promise<RobotsRules | undefined>>();
  /** Every URL requested, in order (the report lists counts). */
  readonly requested: string[] = [];
  readonly skippedByRobots: string[] = [];

  constructor(private readonly opts: SiteFetcherOptions = {}) {
    this.fetchFn = opts.fetch ?? ((u, i) => fetch(u, i));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async robots(u: URL): Promise<RobotsRules | undefined> {
    if (this.opts.robots === false) return undefined;
    let p = this.robotsByHost.get(u.host);
    if (!p) {
      p = this.raw(new URL("/robots.txt", u).toString())
        .then(async (res) => (res.ok ? parseRobots(await res.text()) : undefined))
        .catch(() => undefined);
      this.robotsByHost.set(u.host, p);
    }
    return p;
  }

  /** Whether robots.txt (or the owner's explicit permission) lets us fetch `url`. */
  async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    if (this.opts.ownerAllows?.(u)) return true;
    const rules = await this.robots(u);
    return !rules || robotsAllows(rules, `${u.pathname}${u.search}`);
  }

  private isCdn(host: string): boolean {
    return /squarespace-cdn\.com$|static1\.squarespace\.com$|sqspcdn\.com$/.test(host);
  }

  /** One request, serialized per host with a pause, retried on 429/503. */
  private raw(url: string, init: RequestInit = {}): Promise<Response> {
    const u = new URL(url);
    const host = u.host;
    const delay = this.isCdn(host) ? (this.opts.cdnDelayMs ?? 50) : (this.opts.delayMs ?? 300);
    const run = async (): Promise<Response> => {
      for (let attempt = 0; ; attempt++) {
        const wait = (this.lastByHost.get(host) ?? 0) + delay - Date.now();
        if (wait > 0) await this.sleep(wait);
        this.lastByHost.set(host, Date.now());
        this.requested.push(url);
        this.opts.onRequest?.(url);
        const res = await this.fetchFn(url, {
          ...init,
          headers: { "user-agent": USER_AGENT, accept: "*/*", ...(init.headers ?? {}) },
        });
        if ((res.status === 429 || res.status === 503) && attempt < (this.opts.maxRetries ?? 3)) {
          const after = Number(res.headers.get("retry-after"));
          await res.body?.cancel().catch(() => undefined);
          await this.sleep(
            Number.isFinite(after) && after > 0 ? Math.min(after, 60) * 1000 : 2000 * (attempt + 1),
          );
          continue;
        }
        return res;
      }
    };
    const prev = this.queueByHost.get(host) ?? Promise.resolve();
    const next = prev.then(run, run);
    this.queueByHost.set(
      host,
      next.catch(() => undefined),
    );
    return next;
  }

  /** GET text. Undefined for 404/410; throws RobotsDisallowed when robots.txt refuses. */
  async text(url: string): Promise<FetchedText | undefined> {
    if (!(await this.allowed(url))) {
      this.skippedByRobots.push(url);
      throw new RobotsDisallowed(url);
    }
    const res = await this.raw(url);
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => undefined);
      return undefined;
    }
    const text = await res.text();
    return {
      url: res.url || url,
      status: res.status,
      text,
      contentType: res.headers.get("content-type") ?? "",
    };
  }

  async json<T = unknown>(url: string): Promise<T | undefined> {
    const r = await this.text(url);
    if (!r || r.status >= 400) return undefined;
    try {
      return JSON.parse(r.text) as T;
    } catch {
      return undefined;
    }
  }

  /** A `fetch` for image downloads that goes through the same politeness queue. */
  readonly fetchForMedia: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    this.raw(String(input instanceof Request ? input.url : input), init)) as typeof fetch;
}
