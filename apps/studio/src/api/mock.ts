import { deepEqual, diff, summarize } from "@openspace/ops";
import { newId, type SiteDocument } from "@openspace/schema";
import { devSiteDocument } from "../features/editor/model/dev-site";
import type { BuildNotice, PublishError } from "../features/sync/protocol";
import { type CatalogMockState, createCatalogMock } from "./catalog-mock";
import { demoSites, TEMPLATE_FIXTURES } from "./fixtures";
import { demoCollections } from "./growth-fixtures";
import { createGrowthMock, type GrowthMockState } from "./growth-mock";
import { createManageMock, type ManageMockState } from "./manage-mock";
import { MockRoom } from "./mockRoom";
import {
  type CreateSiteInput,
  type HubApi,
  HubError,
  type PublishSchedule,
  type Session,
  type Site,
  type SiteVersion,
  type Snapshot,
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
  /** Template ids whose first publish fails (to exercise the failed state); a retry succeeds. */
  failTemplates?: string[];
  /** Refuse to create more than this many sites (exercises create errors). */
  maxSites?: number;
  /** Simulated network latency (ms). */
  latencyMs?: number;
  /** Offer the dev sign-in (Hub DEV_MODE). Default true. */
  devAuth?: boolean;
  /** Persist state in localStorage under this key (dev only). */
  persistKey?: string;
  /** Clock, overridable in tests. */
  now?: () => number;
  /** Draft room frame latency (ms); 0 = next microtask. */
  roomLatencyMs?: number;
  /** Time between publish progress steps (queued → in progress → live), ms. */
  publishStepMs?: number;
  /** How long an agent shows as editing after its last change (ms). */
  agentPresenceMs?: number;
  /** Seed blog posts, events, products and a podcast into new site drafts (default: demo mode). */
  demoContent?: boolean;
}

/** Plain-language publish failures the mock can simulate (mirrors the Hub's translations). */
export const MOCK_PUBLISH_ERRORS: Record<string, PublishError> = {
  image_too_large: {
    code: "image_too_large",
    title: "An image is too large",
    message: "One of the images on your site is bigger than the 25 MB limit.",
    fix: "revert",
  },
  missing_image: {
    code: "missing_image",
    title: "A page uses an image that was deleted",
    message: "A page still points at an image that isn’t in your media any more.",
    fix: "revert",
  },
  timed_out: {
    code: "timed_out",
    title: "Publishing took too long",
    message: "It was taking longer than usual, so we stopped. Trying again usually works.",
    fix: "retry",
  },
};

interface MockVersion extends SiteVersion {
  doc: SiteDocument;
}

interface MockSnapshot extends Snapshot {
  doc: SiteDocument;
}

interface MockState {
  user: User | null;
  sites: Site[];
  /** When each building site goes live/fails. */
  readyAt: Record<string, number>;
  /** Publish attempts per site. */
  attempts: Record<string, number>;
  seededFor: string[];
  /** Site content by site id (created from the dev fixture on first read). */
  documents?: Record<string, SiteDocument>;
  /** Draft room seq by site id. */
  roomSeq?: Record<string, number>;
  versions?: Record<string, MockVersion[]>;
  snapshots?: Record<string, MockSnapshot[]>;
  schedules?: Record<string, PublishSchedule[]>;
}

export interface MockHub extends HubApi {
  readonly kind: "mock";
  /** Inspect or mutate internal state (tests). */
  readonly state: MockState;
  /** Calls received, newest last (tests). */
  readonly calls: Array<{ method: keyof HubApi; args: unknown[] }>;
  /** Site-management state (domains, collaborators, uploads, hosting…; Task 24). */
  readonly manage: ManageMockState;
  /** Kit updates (Task 26). */
  readonly catalog: CatalogMockState;
  /** Inbox, subscribers, commerce, members and email state (Task 25). */
  readonly growth: GrowthMockState;
  /** The site's in-memory draft room (created on first use). */
  room(siteId: string): MockRoom;
  /** Make the next publish of a site fail with one of {@link MOCK_PUBLISH_ERRORS}. */
  failNextPublish(siteId: string, code?: keyof typeof MOCK_PUBLISH_ERRORS): void;
  /** The next publish of a site never reports progress (a host that stays silent). */
  hangNextPublish(siteId: string): void;
  /** Run scheduled publishes that are due. */
  runSchedules(): Promise<void>;
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
    attempts: {},
    seededFor: [],
  };

  const load = (): MockState => {
    if (!options.persistKey || typeof localStorage === "undefined") return initial;
    try {
      const raw = localStorage.getItem(options.persistKey);
      return raw ? { ...initial, ...(JSON.parse(raw) as Partial<MockState>) } : initial;
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
        const attempt = state.attempts[site.id] ?? 1;
        site.status = fail.has(site.template) && attempt === 1 ? "failed" : "live";
        delete state.readyAt[site.id];
      }
    }
  };

  const findSite = (id: string): Site => {
    settle();
    const site = state.sites.find((s) => s.id === id);
    if (!site)
      throw new HubError(
        404,
        "not_found",
        "That site doesn't exist or you don't have access to it.",
      );
    return site;
  };

  const manage = createManageMock({ calls, wait, requireUser, findSite, now });
  const catalog = createCatalogMock({
    calls,
    wait,
    requireUser,
    findSite,
    now,
    templates: () => templates,
    save: () => save(),
  });
  const demoContent = options.demoContent ?? options.sites === "demo";
  const growth = createGrowthMock({
    calls,
    wait,
    requireUser,
    findSite,
    now,
    docOf: (site) => roomFor(site).doc,
    publishItem: (site, collection, item, approver) =>
      roomFor(site)
        .collaborator({ userId: approver.id, name: approver.name })
        .edit([{ op: "collection.upsert", collection, item }]),
    approvals: manage.state.approvals,
    decideApproval: manage.api.decideApproval,
    listApprovals: manage.api.listApprovals,
  });
  // --- draft rooms, publishing and history --------------------------------------------------

  const rooms = new Map<string, MockRoom>();
  const failNext = new Map<string, string>();
  const hangNext = new Set<string>();
  let shaCounter = 0;
  const newSha = () =>
    `${now().toString(16)}${(++shaCounter).toString(16).padStart(6, "0")}a1b2c3d4e5f60718293a4b5c`
      .slice(0, 40)
      .padEnd(40, "0");
  const step = options.publishStepMs ?? 600;

  const draftOf = (site: Site): SiteDocument => {
    state.documents ??= {};
    state.documents[site.id] ??= devSiteDocument({
      siteId: site.id,
      name: site.name,
      tagline: site.tagline ?? undefined,
      url: site.url,
    });
    const draft = state.documents[site.id] as SiteDocument;
    if (demoContent && Object.keys(draft.collections).length === 0)
      Object.assign(draft, demoCollections(now()));
    return draft;
  };

  const versionsOf = (site: Site): MockVersion[] => {
    state.versions ??= {};
    state.versions[site.id] ??= [
      {
        sha: newSha(),
        summary: "Created the site",
        author: site.owner ?? null,
        date: site.createdAt,
        kind: "setup",
        status: "success",
        error: null,
        current: true,
        doc: clone(draftOf(site)),
      },
    ];
    return state.versions[site.id] as MockVersion[];
  };

  const snapshotsOf = (site: Site): MockSnapshot[] => {
    state.snapshots ??= {};
    state.snapshots[site.id] ??= [];
    return state.snapshots[site.id] as MockSnapshot[];
  };

  const schedulesOf = (siteId: string): PublishSchedule[] => {
    state.schedules ??= {};
    state.schedules[siteId] ??= [];
    return state.schedules[siteId] as PublishSchedule[];
  };

  const live = (site: Site) => versionsOf(site).find((v) => v.current) as MockVersion;

  let saveQueued = false;
  const saveSoon = () => {
    if (saveQueued) return;
    saveQueued = true;
    setTimeout(() => {
      saveQueued = false;
      save();
    }, 200);
  };

  const roomFor = (site: Site): MockRoom => {
    let room = rooms.get(site.id);
    if (!room) {
      versionsOf(site);
      state.roomSeq ??= {};
      room = new MockRoom({
        doc: draftOf(site),
        seq: state.roomSeq[site.id] ?? 0,
        now,
        latencyMs: options.roomLatencyMs ?? 0,
        agentPresenceMs: options.agentPresenceMs,
        onAccepted: (op) => growth.onRoomOp(site, op as never),
        onChange: (doc, seq) => {
          (state.documents as Record<string, SiteDocument>)[site.id] = doc;
          (state.roomSeq as Record<string, number>)[site.id] = seq;
          saveSoon();
        },
      });
      rooms.set(site.id, room);
    }
    return room;
  };

  const me = () => {
    const user = requireUser();
    return { actor: `user:${user.id}`, name: user.name, userId: user.id };
  };

  /** Publishing progress over the room, like the Hub's workflow_run webhooks. */
  const runBuild = (site: Site, version: MockVersion) => {
    const room = roomFor(site);
    const code = failNext.get(site.id);
    failNext.delete(site.id);
    const notice = (state: BuildNotice["state"], extra: Partial<BuildNotice> = {}) => {
      version.status = state;
      room.broadcast({
        type: "build",
        state,
        sha: version.sha,
        kind: version.kind,
        summary: version.summary,
        ...extra,
      });
    };
    version.status = "queued";
    if (hangNext.delete(site.id)) return;
    setTimeout(() => notice("in_progress"), step);
    setTimeout(() => {
      if (code) {
        const error = MOCK_PUBLISH_ERRORS[code] ?? (MOCK_PUBLISH_ERRORS.timed_out as PublishError);
        version.error = error;
        site.status = "failed";
        site.statusDetail = error.title;
        notice("failure", { error });
      } else {
        site.status = "live";
        site.statusDetail = null;
        notice("success", { url: site.url });
      }
      save();
    }, step * 2);
  };

  const addVersion = (site: Site, v: Omit<MockVersion, "current" | "status" | "error">) => {
    const list = versionsOf(site);
    for (const x of list) x.current = false;
    const version: MockVersion = { ...v, current: true, status: "queued", error: null };
    list.unshift(version);
    runBuild(site, version);
    save();
    return version;
  };

  const doPublish = (site: Site, author: string) => {
    const room = roomFor(site);
    const current = live(site);
    if (deepEqual(current.doc, room.doc)) return { status: "no_changes" as const };
    const ops = diff(current.doc, room.doc);
    const summary = summarize(ops, current.doc) || "Published changes";
    const version = addVersion(site, {
      sha: newSha(),
      summary,
      author,
      date: new Date(now()).toISOString(),
      kind: "publish",
      doc: clone(room.doc),
    });
    room.broadcast({ type: "published", sha: version.sha, summary, kind: "publish" });
    return { status: "published" as const, sha: version.sha, summary, build: "queued" as const };
  };

  const slugName = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const addSnapshot = (site: Site, name: string, automatic: boolean) => {
    const list = snapshotsOf(site);
    let final = name;
    for (let n = 2; list.some((x) => x.name === final); n++) final = `${name}-${n}`;
    const snap: MockSnapshot = {
      name: final,
      tag: `os/snap/${final}`,
      sha: newSha(),
      automatic,
      date: new Date(now()).toISOString(),
      doc: clone(roomFor(site).doc),
    };
    list.unshift(snap);
    save();
    return snap;
  };

  const requireRole = (site: Site, roles: string[], message: string) => {
    if (site.role && !roles.includes(site.role)) throw new HubError(403, "forbidden", message);
  };

  const hub: MockHub = {
    ...manage.api,
    ...catalog.api,
    ...growth.api,
    ...growth.overrides,
    kind: "mock",
    state,
    calls,
    manage: manage.state,
    catalog: catalog.state,
    growth: growth.state,

    room(siteId) {
      const site = state.sites.find((s) => s.id === siteId);
      if (!site) throw new Error(`No mock site ${siteId}`);
      return roomFor(site);
    },

    failNextPublish(siteId, code = "image_too_large") {
      failNext.set(siteId, code);
    },

    hangNextPublish(siteId) {
      hangNext.add(siteId);
    },

    async runSchedules() {
      const t = now();
      for (const site of state.sites)
        for (const sch of schedulesOf(site.id))
          if (sch.status === "pending" && Date.parse(sch.runAt) <= t) {
            sch.status = "done";
            doPublish(site, sch.createdBy ?? "Scheduled");
          }
      save();
    },

    async getSession(): Promise<Session> {
      calls.push({ method: "getSession", args: [] });
      await wait();
      return {
        user: state.user ? clone(state.user) : null,
        auth: { github: true, dev: options.devAuth ?? true },
      };
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

    async getDocument(id, opts) {
      calls.push({ method: "getDocument", args: [id, opts] });
      await wait();
      requireUser();
      const site = findSite(id);
      if (opts?.ref === "published")
        return { document: clone(live(site).doc), head: live(site).sha, branch: "main" };
      return { document: clone(roomFor(site).doc), head: "mock-head", branch: "os/draft" };
    },

    async getRoomDocument(id) {
      calls.push({ method: "getRoomDocument", args: [id] });
      await wait();
      requireUser();
      const room = roomFor(findSite(id));
      if (room.down)
        throw new HubError(0, "network", "Can’t reach OpenSpace. Check your connection.");
      return { document: clone(room.doc), seq: room.seq, head: room.head };
    },

    connectRoom(id, since) {
      calls.push({ method: "connectRoom", args: [id, since] });
      const user = requireUser();
      const site = findSite(id);
      return roomFor(site).connect(
        { userId: user.id, name: user.name },
        since,
        site.role ?? "owner",
      );
    },

    async undoAgentSession(id, sessionId) {
      calls.push({ method: "undoAgentSession", args: [id, sessionId] });
      await wait();
      const site = findSite(id);
      requireRole(site, ["owner", "designer", "editor"], "You can’t undo these changes.");
      const room = roomFor(site);
      const r = room.undoAgent(sessionId, me());
      return { sessionId, ...r, seq: room.seq };
    },

    async publish(id) {
      calls.push({ method: "publish", args: [id] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      requireRole(site, ["owner", "designer", "editor"], "You can’t publish this site.");
      const publish = doPublish(site, user.name);
      return { site: clone(site), publish };
    },

    async fixLastPublish(id) {
      calls.push({ method: "fixLastPublish", args: [id] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      const list = versionsOf(site);
      const failed = list[0];
      if (failed?.status !== "failure" || !failed.error)
        throw new HubError(409, "nothing_to_fix", "There’s nothing to fix right now.");
      if (failed.error.fix === "retry") {
        failed.error = null;
        runBuild(site, failed);
        return { fix: "retry", sha: failed.sha, site: clone(site) };
      }
      const good = list.find((v) => v !== failed && v.status === "success");
      if (!good)
        throw new HubError(409, "nothing_to_fix", "There’s no working version to go back to.");
      const version = addVersion(site, {
        sha: newSha(),
        summary: `Undid “${failed.summary}”`,
        author: user.name,
        date: new Date(now()).toISOString(),
        kind: "revert",
        doc: clone(good.doc),
      });
      return { fix: "revert", sha: version.sha, site: clone(site) };
    },

    async listVersions(id) {
      calls.push({ method: "listVersions", args: [id] });
      await wait();
      requireUser();
      return versionsOf(findSite(id)).map(({ doc: _d, ...v }) => clone(v));
    },

    async rollback(id, sha) {
      calls.push({ method: "rollback", args: [id, sha] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      requireRole(site, ["owner", "designer"], "Only designers and owners can roll back.");
      const list = versionsOf(site);
      const target = list.find((v) => v.sha.startsWith(sha.toLowerCase()));
      if (!target) throw new HubError(404, "not_found", "That version doesn’t exist.");
      const room = roomFor(site);
      let snapshot: string | null = null;
      if (!deepEqual(room.doc, live(site).doc))
        snapshot = addSnapshot(site, `before-rollback-${now()}`, true).name;
      const when = new Date(target.date).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      });
      const version = addVersion(site, {
        sha: newSha(),
        summary: `Rolled back to the version from ${when}`,
        author: user.name,
        date: new Date(now()).toISOString(),
        kind: "rollback",
        doc: clone(target.doc),
      });
      room.reloadAll(clone(target.doc), "rollback");
      return { sha: version.sha, summary: version.summary, snapshot, site: clone(site) };
    },

    versionPreviewUrl(id, sha) {
      const site = state.sites.find((s) => s.id === id);
      return `${site?.url ?? "https://example.org"}/?version=${sha.slice(0, 7)}`;
    },

    async listSnapshots(id) {
      calls.push({ method: "listSnapshots", args: [id] });
      await wait();
      requireUser();
      return snapshotsOf(findSite(id)).map(({ doc: _d, ...s }) => clone(s));
    },

    async createSnapshot(id, name) {
      calls.push({ method: "createSnapshot", args: [id, name] });
      await wait();
      const site = findSite(id);
      requireRole(site, ["owner", "designer", "editor"], "You can’t save snapshots.");
      const slug = slugName(name);
      if (!slug) throw new HubError(400, "invalid", "Give the snapshot a name.");
      const snap = addSnapshot(site, slug, false);
      return { name: snap.name, tag: snap.tag, sha: snap.sha };
    },

    async restoreSnapshot(id, name) {
      calls.push({ method: "restoreSnapshot", args: [id, name] });
      await wait();
      const site = findSite(id);
      requireRole(site, ["owner", "designer"], "Only designers and owners can restore snapshots.");
      const snap = snapshotsOf(site).find((s) => s.name === name);
      if (!snap) throw new HubError(404, "not_found", "That snapshot doesn’t exist.");
      const room = roomFor(site);
      const results = room.submitAs(me(), diff(room.doc, snap.doc, { ts: now() }));
      const applied = results.filter((r) => r.status === "accepted").length;
      return { applied, failed: results.length - applied, seq: room.seq };
    },

    async listSchedules(id) {
      calls.push({ method: "listSchedules", args: [id] });
      await wait();
      requireUser();
      return clone(schedulesOf(findSite(id).id));
    },

    async schedulePublish(id, at) {
      calls.push({ method: "schedulePublish", args: [id, at] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      requireRole(site, ["owner", "designer", "editor"], "You can’t publish this site.");
      const t = at.getTime();
      if (!Number.isFinite(t) || t < now() + 30_000)
        throw new HubError(400, "invalid_time", "Pick a time at least a minute from now.");
      if (t > now() + 366 * 24 * 3600_000)
        throw new HubError(400, "invalid_time", "Pick a time within the next year.");
      const sch: PublishSchedule = {
        id: newId("st").replace(/^st_/, "sch_"),
        kind: "publish",
        runAt: new Date(t).toISOString(),
        status: "pending",
        error: null,
        createdBy: user.name,
        createdAt: new Date(now()).toISOString(),
      };
      schedulesOf(site.id).push(sch);
      save();
      return clone(sch);
    },

    async cancelSchedule(id, scheduleId) {
      calls.push({ method: "cancelSchedule", args: [id, scheduleId] });
      await wait();
      const site = findSite(id);
      const sch = schedulesOf(site.id).find((x) => x.id === scheduleId && x.status === "pending");
      if (!sch) throw new HubError(404, "not_found", "That scheduled publish isn’t pending.");
      sch.status = "cancelled";
      save();
    },

    async createSite(input: CreateSiteInput) {
      calls.push({ method: "createSite", args: [input] });
      await wait();
      const user = requireUser();
      const template = templates.find((t) => t.id === input.template);
      if (!template)
        throw new HubError(
          400,
          "unknown_template",
          `There's no template called "${input.template}".`,
        );
      if (!input.name.trim()) throw new HubError(400, "invalid_name", "Give your site a name.");
      if (options.maxSites !== undefined && state.sites.length >= options.maxSites)
        throw new HubError(429, "site_limit", `You can have up to ${options.maxSites} sites.`);
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
      state.attempts[site.id] = 1;
      save();
      return clone(site);
    },

    async retryPublish(id) {
      calls.push({ method: "retryPublish", args: [id] });
      await wait();
      requireUser();
      const site = findSite(id);
      if (site.status === "building") return clone(site);
      site.status = "building";
      state.attempts[site.id] = (state.attempts[site.id] ?? 1) + 1;
      state.readyAt[site.id] = now() + buildMs;
      save();
      return clone(site);
    },

    async deleteSite(id, confirmName) {
      calls.push({ method: "deleteSite", args: [id, confirmName] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      if (site.owner !== user.login)
        throw new HubError(403, "forbidden", "Only the owner can delete this site.");
      if (confirmName.trim() !== site.name)
        throw new HubError(400, "confirm_mismatch", `Type “${site.name}” exactly to confirm.`);
      state.sites = state.sites.filter((s) => s.id !== id);
      delete state.readyAt[id];
      delete state.attempts[id];
      save();
    },

    async transferSite(id, to) {
      calls.push({ method: "transferSite", args: [id, to] });
      await wait();
      const user = requireUser();
      const site = findSite(id);
      const target = to.trim().replace(/^@/, "");
      if (!target)
        throw new HubError(
          400,
          "invalid_recipient",
          "Enter the GitHub username or email of the new owner.",
        );
      if (site.owner !== user.login)
        throw new HubError(403, "forbidden", "Only the owner can transfer this site.");
      site.owner = target;
      site.role = "designer";
      save();
      return { site: clone(site), status: "complete" };
    },
  };
  return hub;
}
