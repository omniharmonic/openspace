import { blocksRegistry } from "@openspace/blocks";
import { designCheck, type Issue, type Severity, seoCheck, sortIssues } from "@openspace/lint";
import { type Op, type OpBody, transformForRole, validate } from "@openspace/ops";
import type { Page, SiteDocument } from "@openspace/schema";

/**
 * Studio's Design check (doc 04 §9) and SEO check over the whole site: the same rules and
 * autofixes Claude's `design_check`/`apply_fix` tools and `openspace check` use
 * (`@openspace/lint`). Fixes are `@openspace/ops` operations, applied through the editor store
 * like any other edit (validated, undoable, synced).
 */

export type CheckKind = "design" | "seo";

/** An op without its id/actor/ts, to commit again as a fresh local edit. */
function asBody(op: Op): OpBody {
  const { id: _i, actor: _a, ts: _t, ...body } = op;
  return body as OpBody;
}

export interface CheckedIssue extends Issue {
  kind: CheckKind;
}

export const kindOf = (issue: Issue): CheckKind =>
  issue.rule.startsWith("seo-") ? "seo" : "design";

/** Run both checks on every page (and the footer). Never throws: a rule failure is skipped. */
export function runChecks(doc: SiteDocument, now = Date.now()): CheckedIssue[] {
  const options = { actor: "design-check", now };
  const out: Issue[] = [];
  try {
    out.push(...designCheck(doc, undefined, options));
  } catch {
    // A rule that can't read this document must not take the panel down.
  }
  for (const page of Object.values(doc.pages)) {
    try {
      out.push(...seoCheck(page, doc, options));
    } catch {
      // As above.
    }
  }
  // Missing alt text is reported by both checks; show it once (the design check's, which
  // points at each image).
  const altPages = new Set(out.filter((i) => i.rule === "missing-alt").map((i) => i.page));
  const deduped = out.filter((i) => !(i.rule === "seo-image-alt" && altPages.has(i.page)));
  return sortIssues(deduped).map((i) => ({ ...i, kind: kindOf(i) }));
}

export interface IssueCounts {
  error: number;
  warning: number;
  info: number;
  /** Errors + warnings: the number on the top-bar badge. */
  attention: number;
}

export function countIssues(issues: readonly Issue[]): IssueCounts {
  const c = { error: 0, warning: 0, info: 0 };
  for (const i of issues) c[i.severity]++;
  return { ...c, attention: c.error + c.warning };
}

export interface SectionGroup {
  /** Section id, or "" for page-level issues. */
  section: string;
  label: string;
  issues: CheckedIssue[];
}

export interface PageGroup {
  /** Page id, "footer", or "" for site-wide issues. */
  page: string;
  label: string;
  /** Worst severity in the group. */
  severity: Severity;
  sections: SectionGroup[];
  count: number;
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Human label for a section: its own label, its preset's name, else its position. */
export function sectionName(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
): string | undefined {
  if (pageId === "footer") return "Footer";
  const page = doc.pages[pageId as Page["id"]];
  const index = page?.sections.findIndex((s) => s.id === sectionId) ?? -1;
  const s = page?.sections[index];
  if (!s) return undefined;
  if (s.label) return s.label;
  const category = s.preset?.split("/")[0];
  const named = category ? category.charAt(0).toUpperCase() + category.slice(1) : "Section";
  return `${named} · section ${index + 1}`;
}

/**
 * Issues grouped by page (site-wide first, then pages in navigation order, footer last) and
 * within a page by section (page-level issues first), worst first.
 */
export function groupIssues(doc: SiteDocument, issues: readonly CheckedIssue[]): PageGroup[] {
  const order = Object.values(doc.pages).map((p) => p.id as string);
  const byPage = new Map<string, CheckedIssue[]>();
  for (const i of issues) {
    const key = i.page ?? "";
    const list = byPage.get(key) ?? [];
    byPage.set(key, list);
    list.push(i);
  }
  const rankPage = (p: string) => (p === "" ? -1 : p === "footer" ? 1e6 : order.indexOf(p));
  return [...byPage.entries()]
    .sort(([a], [b]) => rankPage(a) - rankPage(b))
    .map(([page, list]) => {
      const sections = new Map<string, CheckedIssue[]>();
      for (const i of list) {
        const key = i.section ?? "";
        const s = sections.get(key) ?? [];
        sections.set(key, s);
        s.push(i);
      }
      const pageSections = doc.pages[page as Page["id"]]?.sections.map((s) => s.id as string) ?? [];
      const label =
        page === ""
          ? "Whole site"
          : page === "footer"
            ? "Footer"
            : (doc.pages[page as Page["id"]]?.title ?? "Page");
      return {
        page,
        label,
        severity: list.reduce<Severity>(
          (w, i) => (RANK[i.severity] < RANK[w] ? i.severity : w),
          "info",
        ),
        count: list.length,
        sections: [...sections.entries()]
          .sort(
            ([a], [b]) =>
              (a === "" ? -1 : pageSections.indexOf(a)) - (b === "" ? -1 : pageSections.indexOf(b)),
          )
          .map(([section, items]) => ({
            section,
            label: section === "" ? "" : (sectionName(doc, page, section) ?? "Section"),
            issues: items,
          })),
      };
    });
}

/** Locked section ids across the site (editors may only change text and images there). */
function lockedSections(doc: SiteDocument): string[] {
  const ids: string[] = [];
  for (const p of Object.values(doc.pages))
    for (const s of p.sections) if (s.locked) ids.push(s.id);
  if (doc.site.footer.locked) ids.push(doc.site.footer.id);
  return ids;
}

/** May `role` apply this autofix (the Hub would accept every op)? */
export function canFix(doc: SiteDocument, issue: Issue, role: string): boolean {
  if (!issue.autofix?.ops.length) return false;
  const r = role as Parameters<typeof transformForRole>[1];
  const locked = lockedSections(doc);
  const registry = blocksRegistry();
  return issue.autofix.ops.every(
    (op) => transformForRole(op, r, locked, { doc, registry }).allowed,
  );
}

const DESTRUCTIVE = new Set(["section.delete", "block.delete", "page.delete", "media.remove"]);

/**
 * "Safe" autofixes: ones that never remove anything (deleting an empty section is offered one
 * at a time, never in bulk).
 */
export function isSafeFix(issue: Issue): boolean {
  const fix = issue.autofix;
  if (!fix?.ops.length) return false;
  return fix.ops.every((op) => !DESTRUCTIVE.has(op.op));
}

export interface FixAllResult {
  /** Op bodies for one commit (one undo step). */
  bodies: OpBody[];
  /** Issues fixed, in order. */
  fixed: CheckedIssue[];
  /** The document after the fixes. */
  doc: SiteDocument;
}

/**
 * Apply every safe fix the role may make, recomputing the issues after each one (fixes can
 * resolve or change other issues, and ids stay valid against the changing document — the same
 * loop as MCP `apply_fix: "all"`). Returns the combined ops for a single undoable commit.
 */
export function fixAllSafe(doc: SiteDocument, role: string, now = Date.now()): FixAllResult {
  const registry = blocksRegistry();
  let cur = doc;
  const bodies: OpBody[] = [];
  const fixed: CheckedIssue[] = [];
  const tried = new Set<string>();
  for (let guard = 0; guard < 200; guard++) {
    const next = runChecks(cur, now).find(
      (i) => !tried.has(i.id) && isSafeFix(i) && canFix(cur, i, role),
    );
    if (!next?.autofix) break;
    tried.add(next.id);
    let work = cur;
    const step: OpBody[] = [];
    let ok = true;
    for (const op of next.autofix.ops) {
      const r = validate(work, op as Op, { registry, trusted: true });
      if (!r.ok) {
        ok = false;
        break;
      }
      work = r.doc;
      step.push(asBody(op as Op));
    }
    if (!ok) continue;
    cur = work;
    bodies.push(...step);
    fixed.push(next);
  }
  return { bodies, fixed, doc: cur };
}

/** The canvas item an issue points at (block first, else section), for jump-to. */
export function issueTarget(
  issue: Issue,
): { page: string; item: { kind: "block" | "section"; id: string } | null } | null {
  if (!issue.page) return null;
  if (issue.block) return { page: issue.page, item: { kind: "block", id: issue.block } };
  if (issue.section) return { page: issue.page, item: { kind: "section", id: issue.section } };
  return { page: issue.page, item: null };
}
