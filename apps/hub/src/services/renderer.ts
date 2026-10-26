import type { ImageMap } from "@openspace/renderer";
import type { Page, SiteDocument } from "@openspace/schema";
import {
  collectionsContextValueFor,
  type DeployLocation,
  ensureBlocks,
  planSite,
  renderDocument,
  renderRoute,
  type SitePlan,
} from "@openspace/site-kit/render";
import { BEHAVIOR_SOURCES } from "./behavior-sources";

/**
 * Page rendering for the Hub's dev preview (`/s/:siteId/*`, `/p/:siteId/*`, `/t/:id/*`) through
 * the one renderer (ADR-3), the same way a published build renders: site-kit plans the routes
 * (pages, collection items, lists, 404) and `renderRoute` renders them with the block library,
 * `BLOCKS_CSS` and the build-time collection data. Gated pages (members / password), which a
 * build never prerenders, go through `renderDocument` like the Cloudflare site Worker does.
 */
export type RenderMode = "published" | "draft" | "template";

export interface RenderInput {
  doc: SiteDocument;
  /** Site-relative path below the base: `""` (home), `about`, `journal/opening-day`. */
  path: string;
  mode: RenderMode;
  /** URL prefix the site is served under, e.g. `/s/st_x5x6fppn3c` (no trailing slash). */
  basePath: string;
  /** Hub origin for forms, newsletter, analytics, cart. */
  hubUrl: string;
  /** Resolved repo media (e.g. signed draft-media URLs); remote images need none. */
  imageMap?: ImageMap;
  now?: Date;
}

export interface FoundPage {
  page: Page;
  /** Behind a password or membership (never prerendered; the preview gates it). */
  gated: boolean;
}

export interface PageRenderer {
  /** The page a path shows, or null (404). Used to gate before anything renders. */
  findPage(input: Pick<RenderInput, "doc" | "path" | "now">): FoundPage | null;
  /** The complete HTML document for a path, or null (404). */
  renderPage(input: RenderInput): Promise<string | null>;
  /** Source of a `data-os-behavior` module (served at `<base>/_os/behaviors/<name>.js`). */
  behavior(name: string): Promise<string | null>;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] as string);

const routePath = (path: string) => {
  const slug = path.replace(/^\/+|\/+$/g, "").replace(/\/?index\.html$/, "");
  return slug ? `/${slug}/` : "/";
};

export class SiteKitRenderer implements PageRenderer {
  // A plan is a pure function of the document: computed once per document object (request).
  private readonly plans = new WeakMap<SiteDocument, SitePlan>();

  private plan(doc: SiteDocument, now: Date): SitePlan {
    let plan = this.plans.get(doc);
    if (!plan) {
      ensureBlocks();
      plan = planSite(doc, { now });
      this.plans.set(doc, plan);
    }
    return plan;
  }

  findPage(input: Pick<RenderInput, "doc" | "path" | "now">): FoundPage | null {
    const want = routePath(input.path);
    const plan = this.plan(input.doc, input.now ?? new Date());
    const route = plan.routes.find((r) => r.path === want && r.kind !== "notFound");
    if (route) {
      const page = plan.doc.pages[route.pageId as Page["id"]];
      if (page) return { page, gated: false };
    }
    const slug = want === "/" ? "" : want.slice(1, -1);
    const gated = Object.values(input.doc.pages).find(
      (p) => p.slug === slug && (p.access?.members || p.access?.password),
    );
    return gated ? { page: gated, gated: true } : null;
  }

  async renderPage(input: RenderInput): Promise<string | null> {
    const now = input.now ?? new Date();
    const plan = this.plan(input.doc, now);
    const location: DeployLocation = {
      site: input.hubUrl,
      base: input.basePath || "/",
      basePath: input.basePath,
      siteUrl: `${input.hubUrl}${input.basePath}/`,
    };
    const mode = input.mode === "published" ? "production" : "preview";
    const want = routePath(input.path);
    const route = plan.routes.find((r) => r.path === want && r.kind !== "notFound");
    if (route)
      return renderRoute({
        plan,
        route,
        location,
        hubUrl: input.hubUrl,
        mode,
        ogImages: false,
        ...(input.imageMap ? { imageMap: input.imageMap } : {}),
      });
    const found = this.findPage(input);
    if (!found) return null;
    // A gated page (the caller already checked access): rendered like the site Worker does.
    const doc: SiteDocument = {
      ...plan.doc,
      pages: { ...plan.doc.pages, [found.page.id]: found.page },
    };
    return renderDocument({
      doc,
      page: found.page,
      location,
      hubUrl: input.hubUrl,
      mode,
      collections: collectionsContextValueFor(plan.doc, now),
      ...(input.imageMap ? { imageMap: input.imageMap } : {}),
    });
  }

  async behavior(name: string): Promise<string | null> {
    return BEHAVIOR_SOURCES[name] ?? null;
  }
}
