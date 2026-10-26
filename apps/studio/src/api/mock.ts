import { newId } from "@openspace/schema";
import { demoSites, TEMPLATE_FIXTURES } from "./fixtures";
import {
  type CreateSiteInput,
  type HubApi,
  HubError,
  type Session,
  type Site,
  type TemplateSummary,
  type User,
} from "./types";

export interface MockHubOptions {
  /** Signed-in user at start (default: signed out). */
  user?: User | null;
  /** Sites the user already has. `"demo"` seeds a few Site Gardener examples on sign-in. */
  sites?: Site[] | "demo";
  templates?: TemplateSummary[];
  /** How long a new site stays "building" before it goes live (ms). */
  buildMs?: number;
  /** Template ids whose first publish fails (to exercise the failed state). */
  failTemplates?: string[];
  /** Simulated network latency (ms). */
  latencyMs?: number;
  /** Offer the dev sign-in (Hub DEV_MODE). Default true. */
  devAuth?: boolean;
  /** Persist state in localStorage under this key (dev only). */
  persistKey?: string;
  /** Clock, overridable in tests. */
  now?: () => number;
}

interface MockState {
  user: User | null;
  sites: Site[];
  /** When each building site goes live/fails. */
  readyAt: Record<string, number>;
  seededFor: string[];
}

export interface MockHub extends HubApi {
  readonly kind: "mock";
  /** Inspect or mutate internal state (tests). */
  readonly state: MockState;
  /** Calls received, newest last (tests). */
  readonly calls: Array<{ method: keyof HubApi; args: unknown[] }>;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "my-site"
  );
}

function userFromName(name: string, prefix = "dev"): User {
  const login = slugify(name) || "you";
  return { id: `${prefix}_${login}`, login, name: name.trim() || "You", avatarUrl: null };
}

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Hub with the same contract as the HTTP client. */
export function createMockHub(options: MockHubOptions = {}): MockHub {
  const now = options.now ?? Date.now;
  const buildMs = options.buildMs ?? 4000;
  const latency = options.latencyMs ?? 0;
  const templates = options.templates ?? TEMPLATE_FIXTURES;
  const fail = new Set(options.failTemplates ?? []);
  const seedDemo = options.sites === "demo";

  const initial: MockState = {
    user: options.user ?? null,
    sites: Array.isArray(options.sites) ? clone(options.sites) : [],
    readyAt: {},
    seededFor: [],
  };

  const load = (): MockState => {
    if (!options.persistKey || typeof localStorage === "undefined") return initial;
    try {
      const raw = localStorage.getItem(options.persistKey);
      return raw ? (JSON.parse(raw) as MockState) : initial;
    } catch {
      return initial;
    }
  };
  const state = load();
  const save = () => {
    if (!options.persistKey || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(options.persistKey, JSON.stringify(state));
    } catch {
      // Storage full or blocked; the mock keeps working in memory.
    }
  };

  const calls: MockHub["calls"] = [];
  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

  const signIn = (user: User) => {
    state.user = user;
    if (seedDemo && !state.seededFor.includes(user.id)) {
      state.sites.push(...demoSites(user.login, now()));
      state.seededFor.push(user.id);
    }
    save();
    return clone(user);
  };

  const requireUser = (): User => {
    if (!state.user) throw new HubError(401, "unauthenticated", "Sign in to continue.");
    return state.user;
  };

  /** Advance building sites whose time has come. */
  const settle = () => {
    const t = now();
    for (const site of state.sites) {
      const ready = state.readyAt[site.id];
      if (site.status === "building" && ready !== undefined && t >= ready) {
        site.status = fail.has(site.template) ? "failed" : "live";
        delete state.readyAt[site.id];
      }
    }
  };

  const findSite = (id: string): Site => {
    settle();
    const site = state.sites.find((s) => s.id === id);
    if (!site) throw new HubError(404, "not_found", "That site doesn't exist or you don't have access to it.");
    return site;
  };

  const hub: MockHub = {
    kind: "mock",
    state,
    calls,

    async getSession(): Promise<Session> {
      calls.push({ method: "getSession", args: [] });
      await wait();
      return { user: state.user ? clone(state.user) : null, auth: { github: true, dev: options.devAuth ?? true } };
    },

    async devLogin(name) {
      calls.push({ method: "devLogin", args: [name] });
      await wait();
      if (!name.trim()) throw new HubError(400, "invalid_name", "Enter a name to sign in.");
      return signIn(userFromName(name));
    },

    async startGitHubSignIn(params) {
      calls.push({ method: "startGitHubSignIn", args: [params] });
      await wait();
      return signIn({ id: "gh_1001", login: "sam-rivera", name: "Sam Rivera", avatarUrl: null });
    },

    async logout() {
      calls.push({ method: "logout", args: [] });
      await wait();
      state.user = null;
      save();
    },

    async listTemplates() {
      calls.push({ method: "listTemplates", args: [] });
      await wait();
      return clone(templates);
    },

    async listSites() {
      calls.push({ method: "listSites", args: [] });
      await wait();
      requireUser();
      settle();
      save();
      return clone([...state.sites].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },

    async getSite(id) {
      calls.push({ method: "getSite", args: [id] });
      await wait();
      requireUser();
      const site = findSite(id);
      save();
      return clone(site);
    },

    async createSite(input: CreateSiteInput) {
      calls.push({ method: "createSite", args: [input] });
      await wait();
      const user = requireUser();
      const template = templates.find((t) => t.id === input.template);
      if (!template) throw new HubError(400, "unknown_template", `There's no template called "${input.template}".`);
      if (!input.name.trim()) throw new HubError(400, "invalid_name", "Give your site a name.");
      const slug = slugify(input.name);
      const taken = state.sites.some((s) => s.repo === `${user.login}/${slug}`);
      const finalSlug = taken ? `${slug}-${state.sites.length + 1}` : slug;
      const site: Site = {
        id: newId("st"),
        name: input.name.trim(),
        tagline: input.tagline.trim() || null,
        repo: `${user.login}/${finalSlug}`,
        status: "building",
        url: `https://${user.login}.github.io/${finalSlug}`,
        template: template.id,
        look: input.look,
        createdAt: new Date(now()).toISOString(),
        inboxCount: 0,
        updateAvailable: false,
        owner: user.login,
        role: "owner",
      };
      state.sites.push(site);
      state.readyAt[site.id] = now() + buildMs;
      save();
      return clone(site);
    },

    async transferSite(id, to) {
      calls.push({ method: "transferSite", args: [id, to] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      const target = to.trim().replace(/^@/, "");
      if (!target) throw new HubError(400, "invalid_recipient", "Enter the GitHub username or email of the new owner.");
      if (site.owner !== user.login) throw new HubError(403, "forbidden", "Only the owner can transfer this site.");
      site.owner = target;
      site.role = "designer";
      save();
      return { site: clone(site), status: "complete" };
    },
  };
  return hub;
}
