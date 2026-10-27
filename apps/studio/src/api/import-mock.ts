import type {
  ConvertInput,
  ImportApi,
  ImportInput,
  ImportState,
  ImportStep,
  ImportView,
} from "./import-types";
import { githubAddress } from "./import-types";
import { type HubApi, HubError, type Site, type User } from "./types";

/**
 * In-memory "Move my site" for the mock Hub: the move advances one step every `stepMs` (read →
 * pages → checks → publish → ready), an address containing `fail.` fails while bringing pages
 * across, and an in-place conversion waits for the pull request to be merged (`merge(id)`, or
 * automatically after `autoMergeMs` when set).
 */

export interface MockImport {
  id: string;
  siteId: string;
  kind: "url" | "convert";
  source: string;
  startedAt: number;
  attempt: number;
  mergedAt: number | null;
}

export interface ImportMockState {
  imports: Record<string, MockImport>;
}

export interface ImportMockContext {
  calls: Array<{ method: keyof HubApi; args: unknown[] }>;
  wait: () => Promise<unknown>;
  requireUser: () => User;
  findSite: (id: string) => Site;
  addSite: (site: Site) => void;
  now: () => number;
  save: () => void;
  stepMs?: number;
  autoMergeMs?: number;
}

const DEMO_ATTENTION = [
  {
    title: "Forms and newsletter",
    items: [
      "Newsletter signup recreated. Subscribers are not moved: export your list from your old site and import it here. (/, /contact)",
    ],
  },
  {
    title: "Images and files",
    items: [
      "2 images were too small to look sharp on large screens; replace them when you can. (/about)",
    ],
  },
];

const DEMO_CHECKLIST = [
  {
    id: "newsletter",
    kind: "newsletter",
    title: "Bring your newsletter subscribers",
    detail:
      "Sign-up forms came across, but subscribers stay with your old site. Export them there and import them here.",
  },
  {
    id: "domain",
    kind: "domain",
    title: "Use your own web address",
    detail:
      "Your new site is live on a free address. When you're happy with it, we'll help you point your domain at it.",
  },
];

function labelOf(source: string): string {
  const gh = githubAddress(source);
  if (gh && !/github\.io/i.test(source)) return `${gh.owner}/${gh.repo}`;
  try {
    return new URL(/^[a-z]+:\/\//i.test(source) ? source : `https://${source}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return source;
  }
}

function nameFrom(source: string): string {
  const gh = githubAddress(source);
  const base = gh
    ? gh.repo.replace(/\.github\.io$/i, "") || gh.owner
    : labelOf(source).split(".").slice(0, -1).join(" ") || labelOf(source);
  return base
    .replace(/[-_.]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function createImportMock(ctx: ImportMockContext): {
  api: ImportApi;
  state: ImportMockState;
  merge(id: string): void;
} {
  const state: ImportMockState = { imports: {} };
  const stepMs = ctx.stepMs ?? 1200;
  let counter = 0;

  const view = (m: MockImport): ImportView => {
    const site = ctx.findSite(m.siteId);
    const t = ctx.now();
    const fails = /fail\./i.test(m.source);
    let k = Math.floor((t - m.startedAt) / stepMs);
    if (
      m.kind === "convert" &&
      m.mergedAt === null &&
      ctx.autoMergeMs !== undefined &&
      t - m.startedAt >= 3 * stepMs + ctx.autoMergeMs
    )
      m.mergedAt = m.startedAt + 3 * stepMs + ctx.autoMergeMs;
    let state: ImportState;
    let phase: string | null = null;
    if (fails && k >= 1) {
      state = "failed";
      phase = "importing";
    } else if (m.kind === "convert" && m.mergedAt === null) {
      k = Math.min(k, 3);
      state = k >= 3 ? "review" : "running";
      phase = ["reading", "importing", "checking", "saved"][k] ?? "saved";
    } else if (m.kind === "convert" && m.mergedAt !== null) {
      state = t - m.mergedAt >= stepMs ? "ready" : "publishing";
      phase = "publishing";
    } else {
      state = k >= 4 ? "ready" : k >= 3 ? "publishing" : "running";
      phase = ["reading", "importing", "checking", "publishing"][Math.min(k, 3)] ?? "publishing";
    }
    if (state === "ready" && site.status !== "live") site.status = "live";
    site.import = { id: m.id, state, kind: m.kind };
    const counts =
      !fails && (k >= 2 || state === "ready")
        ? { pages: 6, items: 4, media: 23, redirects: 9 }
        : null;
    const order: ImportStep["id"][] =
      m.kind === "convert"
        ? ["read", "pages", "check", "approve", "publish"]
        : ["read", "pages", "check", "publish"];
    const labels: Record<ImportStep["id"], string> = {
      read: m.kind === "convert" ? "Reading your site's files" : "Reading your site",
      pages: "Bringing pages across",
      check: "Checking everything",
      approve: "Waiting for you to approve the change on GitHub",
      publish: "Publishing your new site",
    };
    const activeIdx =
      state === "ready"
        ? order.length
        : state === "review"
          ? order.indexOf("approve")
          : state === "publishing"
            ? order.indexOf("publish")
            : state === "failed"
              ? 1
              : Math.min(k, 2);
    const steps: ImportStep[] = order.map((id, i) => ({
      id,
      label: labels[id],
      ...(id === "pages" && counts
        ? { detail: `${counts.pages} pages, ${counts.items} items, ${counts.media} images` }
        : {}),
      state:
        state === "failed" && i === activeIdx
          ? "failed"
          : i < activeIdx
            ? "done"
            : i === activeIdx
              ? "active"
              : "todo",
    }));
    const headline =
      state === "ready"
        ? `${site.name} is live. Ready to review.`
        : state === "failed"
          ? `The move stopped while bringing pages across: Couldn't read ${m.source}. Check the address and that the site is public.`
          : state === "review"
            ? "Your site is ready to switch over. Approve the change on GitHub to finish."
            : state === "publishing"
              ? "Publishing your new site…"
              : phase === "importing"
                ? "Bringing pages across…"
                : phase === "checking"
                  ? "6 pages and 23 images came across. Checking everything…"
                  : "Reading your site…";
    return {
      id: m.id,
      siteId: m.siteId,
      kind: m.kind,
      source: m.source,
      state,
      phase,
      headline,
      steps,
      counts,
      attention: state === "ready" ? DEMO_ATTENTION : [],
      checklist: state === "ready" ? DEMO_CHECKLIST : [],
      report: state === "ready" ? "# Import report\n" : null,
      error: state === "failed" ? headline : null,
      pullRequest:
        m.kind === "convert" && (state === "review" || m.mergedAt !== null)
          ? { number: 1, url: `https://github.com/${site.repo}/pull/1` }
          : null,
      siteUrl: state === "ready" ? site.url : null,
      studioUrl: `/sites/${site.id}`,
      connectUrl: null,
      createdAt: new Date(m.startedAt).toISOString(),
      finishedAt: state === "ready" || state === "failed" ? new Date(t).toISOString() : null,
    };
  };

  const start = (user: User, kind: "url" | "convert", source: string, name?: string) => {
    const id = `imp_mock${(++counter).toString(36).padStart(6, "0")}`;
    const siteName = (name?.trim() || nameFrom(source) || "My site").slice(0, 80);
    const gh = githubAddress(source);
    const slug =
      siteName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "site";
    const repo = kind === "convert" && gh ? `${gh.owner}/${gh.repo}` : `${user.login}/${slug}`;
    const site: Site = {
      id: `st_mv${(Date.now() % 1e8).toString(36)}${counter}`,
      name: siteName,
      tagline: null,
      repo,
      status: "building",
      url: `https://${user.login}.github.io/${slug}/`,
      template: "import",
      look: null,
      createdAt: new Date(ctx.now()).toISOString(),
      inboxCount: 0,
      updateAvailable: false,
      owner: user.login,
      role: "owner",
      import: { id, state: "running", kind },
    };
    ctx.addSite(site);
    const m: MockImport = {
      id,
      siteId: site.id,
      kind,
      source,
      startedAt: ctx.now(),
      attempt: 1,
      mergedAt: null,
    };
    state.imports[id] = m;
    ctx.save();
    return { site: structuredClone(site), import: view(m) };
  };

  const find = (id: string) => {
    const m = state.imports[id];
    if (!m) throw new HubError(404, "not_found", "We couldn't find that move.");
    return m;
  };

  const validUrl = (url: string) => {
    if (githubAddress(url)) return;
    let u: URL;
    try {
      u = new URL(/^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    } catch {
      throw new HubError(
        400,
        "invalid_url",
        "That doesn't look like a web address. Try something like www.example.com.",
      );
    }
    if (!u.hostname.includes(".") || /^(?:localhost|127\.|10\.|192\.168\.)/.test(u.hostname))
      throw new HubError(
        400,
        "invalid_url",
        "That address isn't a public website. Use the address people visit.",
      );
  };

  return {
    state,
    merge(id) {
      const m = find(id);
      m.mergedAt = ctx.now();
      ctx.save();
    },
    api: {
      async createImport(input: ImportInput) {
        ctx.calls.push({ method: "createImport", args: [input] });
        await ctx.wait();
        const user = ctx.requireUser();
        if (input.confirmOwnership !== true)
          throw new HubError(
            400,
            "invalid_input",
            "Confirm that this is your site (or that you're moving it for its owner).",
          );
        validUrl(input.url);
        return start(user, "url", input.url.trim(), input.name);
      },
      async convertRepo(input: ConvertInput) {
        ctx.calls.push({ method: "convertRepo", args: [input] });
        await ctx.wait();
        const user = ctx.requireUser();
        if (!githubAddress(input.repo))
          throw new HubError(
            400,
            "not_github",
            "That isn't a GitHub repository or GitHub Pages site.",
          );
        return start(user, "convert", input.repo.trim());
      },
      async getImport(id) {
        ctx.calls.push({ method: "getImport", args: [id] });
        await ctx.wait();
        ctx.requireUser();
        return view(find(id));
      },
      async retryImport(id) {
        ctx.calls.push({ method: "retryImport", args: [id] });
        await ctx.wait();
        ctx.requireUser();
        const m = find(id);
        m.attempt += 1;
        m.startedAt = ctx.now();
        ctx.save();
        return view(m);
      },
      async siteImport(siteId) {
        ctx.calls.push({ method: "siteImport", args: [siteId] });
        await ctx.wait();
        ctx.requireUser();
        const m = Object.values(state.imports).find((x) => x.siteId === siteId);
        return m ? view(m) : null;
      },
    },
  };
}
