/**
 * Per-connection tool context: grant checks, site/page resolution, op stamping, agent session
 * lifecycle (a snapshot before the first edit) and role filtering before ops reach the store.
 */
import {
  FOOTER,
  lockedSectionsOf,
  type Op,
  type OpBody,
  type OpIssue,
  transformForRole,
} from "@openspace/ops";
import type { BlockRegistry, Page, SiteDocument } from "@openspace/schema";
import { issueLines, ToolError } from "./errors";
import type { AgentSession, Grant, SiteStore } from "./store";

export interface ContextOptions {
  store: SiteStore;
  grant: Grant;
  registry: BlockRegistry;
  /** Clock (ms). */
  now?: () => number;
  /** Agent label for sessions ("Claude"). */
  label?: string;
}

const OP_SUBJECT: Partial<Record<Op["op"], (op: Op) => string>> = {
  "block.update": (o) => `block ${(o as { block: string }).block}`,
  "block.insert": (o) => `new ${(o as { block: { type: string } }).block.type} block`,
  "block.move": (o) => `block ${(o as { block: string }).block}`,
  "block.delete": (o) => `block ${(o as { block: string }).block}`,
  "grid.place": (o) => `block ${(o as { block: string }).block}`,
  "section.insert": (o) => `new section ${(o as { section: { id: string } }).section.id}`,
  "section.update": (o) => `section ${(o as { section: string }).section}`,
  "section.move": (o) => `section ${(o as { section: string }).section}`,
  "section.delete": (o) => `section ${(o as { section: string }).section}`,
  "page.create": (o) => `new page ${(o as { page: { id: string } }).page.id}`,
  "page.update": (o) => `page ${(o as { page: string }).page}`,
  "page.delete": (o) => `page ${(o as { page: string }).page}`,
};

export class ToolContext {
  readonly store: SiteStore;
  readonly grant: Grant;
  readonly registry: BlockRegistry;
  readonly label: string;
  private readonly clock: () => number;
  private readonly sessions = new Map<string, Promise<AgentSession>>();
  private counter = 0;

  constructor(opts: ContextOptions) {
    this.store = opts.store;
    this.grant = opts.grant;
    this.registry = opts.registry;
    this.clock = opts.now ?? (() => Date.now());
    this.label = opts.label ?? opts.grant.label ?? "Claude";
  }

  now(): number {
    return this.clock();
  }

  /** Site ids this connection may touch. */
  async allowedSites(): Promise<string[]> {
    const all = (await this.store.listSites()).map((s) => s.id);
    if (this.grant.sites === "*") return all;
    const granted = new Set(this.grant.sites);
    return all.filter((id) => granted.has(id));
  }

  /** Resolve the `site` argument (optional when the grant covers exactly one site). */
  async siteId(input?: string): Promise<string> {
    const allowed = await this.allowedSites();
    if (input) {
      if (allowed.includes(input)) return input;
      throw new ToolError(
        `This connection can't reach site "${input}". Sites available: ${allowed.join(", ") || "none"}.`,
        "forbidden",
      );
    }
    if (allowed.length === 1) return allowed[0] as string;
    if (!allowed.length) throw new ToolError("This connection has no sites.", "forbidden");
    throw new ToolError(
      `Several sites are available; pass "site" (one of: ${allowed.join(", ")}).`,
      "invalid_arguments",
    );
  }

  /** The person's role on a site (per-site `roles` first, then `role`; undefined = local owner). */
  roleFor(siteId: string): Grant["role"] {
    return this.grant.roles?.[siteId] ?? this.grant.role;
  }

  async doc(siteId: string): Promise<SiteDocument> {
    return this.store.getDocument(siteId);
  }

  /** The agent session for a site, started (with its snapshot) on first use. */
  session(siteId: string): Promise<AgentSession> {
    let s = this.sessions.get(siteId);
    if (!s) {
      s = this.store.startSession(siteId, { label: this.label, userId: this.grant.userId });
      this.sessions.set(siteId, s);
      s.catch(() => this.sessions.delete(siteId));
    }
    return s;
  }

  /** Sessions started on this connection (for `close`). */
  async startedSessions(): Promise<Array<{ siteId: string; session: AgentSession }>> {
    const out: Array<{ siteId: string; session: AgentSession }> = [];
    for (const [siteId, p] of this.sessions) {
      try {
        out.push({ siteId, session: await p });
      } catch {
        // A session that failed to start has nothing to end.
      }
    }
    return out;
  }

  async endSessions(): Promise<void> {
    for (const { siteId, session } of await this.startedSessions())
      await this.store.endSession(siteId, session.sessionId).catch(() => undefined);
    this.sessions.clear();
  }

  /** Stamp op bodies with a fresh id, the session actor and the clock. */
  stamp(bodies: readonly OpBody[], actor: string): Op[] {
    const ts = this.now();
    return bodies.map(
      (b) =>
        ({
          ...b,
          id: `mcp_${ts.toString(36)}_${(this.counter++).toString(36)}`,
          actor,
          ts,
        }) as Op,
    );
  }

  /**
   * Apply op bodies as the agent. Errors come back as a `ToolError` that names the op and the
   * offending paths so the agent can correct its call.
   */
  async apply(
    siteId: string,
    bodies: readonly OpBody[],
  ): Promise<{ doc: SiteDocument; warnings: OpIssue[]; ops: Op[]; session: AgentSession }> {
    if (!bodies.length) throw new ToolError("Nothing to change.", "no_changes");
    const session = await this.session(siteId);
    let ops = this.stamp(bodies, session.actor);
    const role = this.roleFor(siteId);
    if (role && role !== "owner" && role !== "designer") {
      const doc = await this.doc(siteId);
      const locked = lockedSectionsOf(doc);
      ops = ops.map((op) => {
        const d = transformForRole(op, role, locked, { doc, registry: this.registry });
        if (!d.allowed)
          throw new ToolError(`Not allowed for your role (${role}): ${d.reason}.`, "forbidden");
        return d.op;
      });
    }
    const r = await this.store.applyOps(siteId, ops, {
      actor: session.actor,
      session: session.sessionId,
    });
    if (!r.ok) {
      const op = ops[r.index];
      const what = op
        ? `${op.op}${OP_SUBJECT[op.op] ? ` on ${OP_SUBJECT[op.op]?.(op)}` : ""}`
        : "edit";
      const n = ops.length > 1 ? ` (step ${r.index + 1} of ${ops.length})` : "";
      throw new ToolError(
        `The change was rejected${n}: ${what}.\n${issueLines(r.errors).join("\n")}`,
        r.code === "forbidden" ? "forbidden" : "rejected",
        r.errors,
        "Nothing was changed. Correct the listed paths (ids come from get_page; field shapes from list_blocks/get_block_schema) and try again.",
      );
    }
    return { doc: r.doc, warnings: r.warnings, ops, session };
  }
}

/** Resolve a page reference: an id (`pg_…`), a slug (`""`/`/` for home, `about`, `/about/`), or a title. */
export function resolvePage(
  doc: SiteDocument,
  ref: string,
  opts: { allowFooter?: boolean } = {},
): { id: string; page: Page | null } {
  if (ref === FOOTER) {
    if (opts.allowFooter) return { id: FOOTER, page: null };
    throw new ToolError(
      'The footer is not a page here; use the block tools with page "footer".',
      "invalid_arguments",
    );
  }
  const direct = doc.pages[ref as Page["id"]];
  if (direct) return { id: direct.id, page: direct };
  const slug = ref.replace(/^\/+|\/+$/g, "");
  const pages = Object.values(doc.pages);
  const bySlug = pages.find((p) => p.slug === slug);
  if (bySlug) return { id: bySlug.id, page: bySlug };
  const byTitle = pages.filter((p) => p.title.toLowerCase() === ref.toLowerCase());
  if (byTitle.length === 1 && byTitle[0]) return { id: byTitle[0].id, page: byTitle[0] };
  throw new ToolError(
    `No page "${ref}". Pages: ${pages.map((p) => `${p.id} ("${p.title}", /${p.slug})`).join(", ")}.`,
    "not_found",
  );
}

/** Public path of a page (`/` for home). */
export const pagePathOf = (page: Page): string => (page.slug ? `/${page.slug}/` : "/");
