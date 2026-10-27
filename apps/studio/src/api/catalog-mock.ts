import { lookPreview } from "../features/templates/lookPreview";
import type { CatalogApi, KitUpdate, TemplateDetail } from "./catalog-types";
import { type HubApi, HubError, type Site, type TemplateSummary, type User } from "./types";

/**
 * In-memory template documents and update bot for the mock Hub (dev + tests). Template
 * documents come from the real registry (`@omniharmonic/openspace-templates`), loaded on first use so it
 * never weighs on the default bundle or on tests that don't render templates.
 */

type Registry = typeof import("@omniharmonic/openspace-templates");
let registry: Promise<Registry> | null = null;
const loadRegistry = () => {
  registry ??= import("@omniharmonic/openspace-templates");
  return registry;
};

/** The registry's gallery data in the Hub's `/api/templates` shape. */
export async function registryTemplates(): Promise<TemplateSummary[]> {
  const r = await loadRegistry();
  return r.listTemplates().map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    persona: m.persona,
    mood: m.mood,
    version: m.version,
    sample: m.sample,
    thumbnailUrl: m.thumbnailUrl,
    previewUrl: null,
    looks: m.looks.map((l) => ({
      id: l.id,
      name: l.name,
      styles: lookPreview(l.styles),
      siteStyles: l.styles,
    })),
  }));
}

export interface CatalogMockState {
  /** Update records by site id, newest first. */
  updates: Record<string, KitUpdate[]>;
  /** The kit version each site is on. */
  kitVersion: Record<string, string>;
  /** Make the next apply fail (tests the failed state). */
  failNextApply: boolean;
}

export interface CatalogMockContext {
  calls: Array<{ method: keyof HubApi; args: unknown[] }>;
  wait: () => Promise<unknown>;
  requireUser: () => User;
  findSite: (id: string) => Site;
  now: () => number;
  /** The gallery as the mock serves it. */
  templates: () => TemplateSummary[];
  /** Persist mock state (dev). */
  save: () => void;
}

const clone = <T>(v: T): T => structuredClone(v);

export const MOCK_KIT_FROM = "1.0.0";
export const MOCK_KIT_TO = "1.1.0";

/** The update the mock offers to sites marked `updateAvailable`. */
function offeredUpdate(siteId: string, at: number): KitUpdate {
  return {
    id: `upd_${siteId}_${MOCK_KIT_TO.replaceAll(".", "")}`,
    from: MOCK_KIT_FROM,
    to: MOCK_KIT_TO,
    title: `OpenSpace update ${MOCK_KIT_TO}: new gallery layouts, faster pages`,
    changelog: [
      {
        version: MOCK_KIT_TO,
        notes: [
          "New gallery layouts: masonry with captions and a filmstrip slideshow",
          "Pages load faster on phones: images are sized more precisely",
          "Forms show clearer messages when a field is missing",
        ],
      },
      {
        version: "1.0.1",
        notes: ["Fixed the mobile menu closing when a folder is tapped"],
        security: false,
      },
    ],
    security: false,
    status: "pending",
    prUrl: null,
    error: null,
    createdAt: new Date(at).toISOString(),
    appliedAt: null,
  };
}

export function createCatalogMock(ctx: CatalogMockContext): {
  api: CatalogApi;
  state: CatalogMockState;
} {
  const { calls, wait, requireUser, findSite, now } = ctx;
  const state: CatalogMockState = { updates: {}, kitVersion: {}, failNextApply: false };

  const updatesOf = (site: Site): KitUpdate[] => {
    let list = state.updates[site.id];
    if (!list) {
      list = site.updateAvailable ? [offeredUpdate(site.id, now())] : [];
      state.updates[site.id] = list;
    }
    return list;
  };

  const requireDesigner = (site: Site) => {
    if (site.role && site.role !== "owner" && site.role !== "designer")
      throw new HubError(403, "forbidden", "Only owners and designers can update the site.");
  };

  const findUpdate = (site: Site, id: string): KitUpdate => {
    const u = updatesOf(site).find((x) => x.id === id);
    if (!u) throw new HubError(404, "not_found", "That update doesn't exist.");
    return u;
  };

  const api: CatalogApi = {
    async getTemplate(id) {
      calls.push({ method: "getTemplate", args: [id] });
      await wait();
      const r = await loadRegistry();
      const loaded = r.loadTemplate(id);
      const listed = ctx.templates().find((t) => t.id === id);
      if (!loaded || !listed) throw new HubError(404, "not_found", "That template doesn't exist.");
      const regLooks = loaded.meta.looks;
      const detail: TemplateDetail = {
        ...clone(listed),
        looks: listed.looks.map((l, i) => {
          const match = regLooks.find((x) => x.id === l.id) ?? regLooks[i] ?? regLooks[0];
          return { ...clone(l), siteStyles: l.siteStyles ?? match?.styles };
        }),
        document: loaded.doc,
      };
      return detail;
    },

    async listUpdates(siteId) {
      calls.push({ method: "listUpdates", args: [siteId] });
      await wait();
      requireUser();
      return clone(updatesOf(findSite(siteId)));
    },

    async checkForUpdate(siteId) {
      calls.push({ method: "checkForUpdate", args: [siteId] });
      await wait();
      requireUser();
      const site = findSite(siteId);
      requireDesigner(site);
      return clone(updatesOf(site).find((u) => u.status === "pending") ?? null);
    },

    async applyUpdate(siteId, updateId) {
      calls.push({ method: "applyUpdate", args: [siteId, updateId] });
      await wait();
      requireUser();
      const site = findSite(siteId);
      requireDesigner(site);
      const u = findUpdate(site, updateId);
      if (u.status !== "pending" && u.status !== "failed")
        throw new HubError(409, "update_not_pending", "This update was already handled.");
      if (state.failNextApply) {
        state.failNextApply = false;
        u.status = "failed";
        u.error = "The update couldn't be combined with your latest changes. Try again.";
        throw new HubError(409, "update_failed", u.error);
      }
      u.status = "applied";
      u.error = null;
      u.appliedAt = new Date(now()).toISOString();
      state.kitVersion[site.id] = u.to;
      site.updateAvailable = false;
      ctx.save();
      return clone(u);
    },

    async dismissUpdate(siteId, updateId) {
      calls.push({ method: "dismissUpdate", args: [siteId, updateId] });
      await wait();
      requireUser();
      const site = findSite(siteId);
      requireDesigner(site);
      const u = findUpdate(site, updateId);
      u.status = "dismissed";
      site.updateAvailable = false;
      ctx.save();
    },
  };

  return { api, state };
}
