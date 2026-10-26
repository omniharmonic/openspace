import type { Op, OpMeta } from "@openspace/ops";

/** A Design check / SEO check finding. Plain JSON: Studio, MCP and the CLI all show these. */
export type Severity = "error" | "warning" | "info";

export interface Autofix {
  /** Button label in Studio, e.g. "Use the nearest accessible color". */
  label: string;
  /** Operations that fix the issue (validated against the document they were computed for). */
  ops: Op[];
}

export interface Issue {
  /** Stable key for this finding (`rule:page:section:block…`), for de-duplication and dismissal. */
  id: string;
  /** Rule id, e.g. `contrast`, `heading-order`. */
  rule: string;
  severity: Severity;
  /** Page id (`"footer"` for the site footer); absent for site-wide issues. */
  page?: string;
  section?: string;
  block?: string;
  /** What's wrong, in plain language. */
  message: string;
  /** How to fix it, in plain language. */
  fix: string;
  autofix?: Autofix;
}

export interface CheckOptions {
  /** Actor recorded on autofix ops (default `"design-check"`). */
  actor?: string;
  /** Timestamp for autofix ops (default `Date.now()`). */
  now?: number;
}

/** Op metadata factory for autofix ops. */
export function opMeta(options: CheckOptions): () => OpMeta {
  let n = 0;
  const actor = options.actor ?? "design-check";
  const ts = options.now ?? Date.now();
  const stamp = ts.toString(36);
  return () => ({ id: `lint_${stamp}_${n++}`, actor, ts });
}

export function issue(i: Omit<Issue, "id"> & { key?: string }): Issue {
  const { key, ...rest } = i;
  const id = [rest.rule, rest.page, rest.section, rest.block, key].filter(Boolean).join(":");
  return { id, ...rest };
}

/** Errors first, then warnings, then info; stable otherwise. */
export function sortIssues(issues: Issue[]): Issue[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues
    .map((i, n) => [i, n] as const)
    .sort(([a, na], [b, nb]) => rank[a.severity] - rank[b.severity] || na - nb)
    .map(([i]) => i);
}
