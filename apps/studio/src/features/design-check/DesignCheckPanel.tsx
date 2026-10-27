import type { OpBody } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import {
  CircleAlert,
  CircleCheck,
  Crosshair,
  Info,
  Pencil,
  SearchCheck,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, cx, EmptyState, Segmented, Spinner, Toggle, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import type { EditorStore } from "../editor/model/store";
import { useCanvasDocument } from "../inspector/canvasDoc";
import { useInspectorRole } from "../inspector/env";
import {
  bulkEligible,
  type CheckedIssue,
  type CheckFailure,
  type CheckKind,
  canFix,
  checkSite,
  failureWhere,
  fixAllSafe,
  groupIssues,
  issueTarget,
} from "./model";
import { checkNow, useDesignCheck } from "./store";
import "./design-check.css";

const SEVERITY_ICON = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} as const;

const SEVERITY_LABEL = { error: "Needs fixing", warning: "Worth a look", info: "Suggestion" };

const stripMeta = (op: { id?: unknown; actor?: unknown; ts?: unknown }): OpBody => {
  const { id: _i, actor: _a, ts: _t, ...body } = op;
  return body as OpBody;
};

/** Select what an issue points at and scroll the canvas to it. */
export function jumpToIssue(store: EditorStore, issue: CheckedIssue) {
  const t = issueTarget(issue);
  if (!t) return;
  const s = store.getState();
  if (t.page !== "footer" && t.page !== s.pageId) s.setPage(t.page);
  if (t.item) store.getState().select(t.item);
  const id = t.item?.id;
  // After the canvas has rendered the page.
  setTimeout(() => {
    const d = useCanvasDocument.getState().doc;
    const el = id ? d?.querySelector(`[data-os-id="${id}"]`) : null;
    if (el && "scrollIntoView" in el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    else d?.defaultView?.scrollTo?.({ top: 0, behavior: "smooth" });
  }, 80);
}

/**
 * Apply one issue's fix (recomputed against the current document, so it is never stale) as
 * one undo step. Returns whether it applied.
 */
export function applyIssueFix(store: EditorStore, issue: CheckedIssue): boolean {
  const doc = store.getState().doc;
  const result = checkSite(doc);
  const fresh = result.issues.find((i) => i.id === issue.id);
  if (!fresh && result.failures.length > 0) {
    // The check itself failed: the issue may still be there, so don't claim it's fixed.
    toast({
      tone: "danger",
      title: "Couldn’t check again",
      description: "Look this over yourself, then try the fix again.",
    });
    checkNow(doc);
    return false;
  }
  if (!fresh) {
    // Someone (or another fix) already took care of it.
    toast({ title: "Already fixed", description: "This issue is gone after checking again." });
    checkNow(doc);
    return false;
  }
  const fix = fresh.autofix;
  if (!fix) return false;
  const r = store.getState().commit(fix.ops.map(stripMeta), { label: fix.label });
  if (!r.ok) {
    toast({
      tone: "danger",
      title: "That fix no longer applies",
      description: "The page changed since the check ran. It has been checked again.",
    });
    checkNow(store.getState().doc);
    return false;
  }
  toast({
    title: fix.label,
    description: "Fixed. Undo brings it back.",
    action: { label: "Undo", onClick: () => store.getState().undo() },
  });
  return true;
}

/** Apply every safe fix the person may make, as one undo step. Returns how many issues. */
export function applyAllSafe(
  store: EditorStore,
  role: string,
  shown?: (i: CheckedIssue) => boolean,
): number {
  const { bodies, fixed } = fixAllSafe(store.getState().doc, role, Date.now(), shown);
  if (!bodies.length) return 0;
  const label = `Fix ${fixed.length} design ${fixed.length === 1 ? "issue" : "issues"}`;
  const r = store.getState().commit(bodies, { label });
  if (!r.ok) {
    toast({ tone: "danger", title: "Couldn’t apply the fixes", description: r.errors[0]?.message });
    return 0;
  }
  toast({
    title: label,
    description: fixed
      .slice(0, 3)
      .map((i) => i.autofix?.label)
      .filter(Boolean)
      .join(" · "),
    action: { label: "Undo", onClick: () => store.getState().undo() },
  });
  return fixed.length;
}

/** Rules fixed by rewriting content yourself: the action selects the block to edit. */
const EDIT_RULES: ReadonlySet<string> = new Set(["sample-content", "placeholder-text"]);

function IssueRow({
  issue,
  canApply,
  onJump,
  onFix,
}: {
  issue: CheckedIssue;
  canApply: boolean;
  onJump: (i: CheckedIssue) => void;
  onFix: (i: CheckedIssue) => void;
}) {
  const Icon = SEVERITY_ICON[issue.severity];
  const target = issueTarget(issue);
  return (
    <li className={cx("st-dc__issue", `st-dc__issue--${issue.severity}`)}>
      <Icon className="st-dc__sev" aria-label={SEVERITY_LABEL[issue.severity]} role="img" />
      <div className="st-dc__text">
        <p className="st-dc__msg">{issue.message}</p>
        <p className="st-dc__fix">{issue.fix}</p>
        <div className="st-dc__actions">
          {target && (
            <Button
              size="sm"
              variant="ghost"
              icon={EDIT_RULES.has(issue.rule) ? <Pencil /> : <Crosshair />}
              onClick={() => onJump(issue)}
            >
              {EDIT_RULES.has(issue.rule) ? "Edit" : "Show"}
            </Button>
          )}
          {issue.autofix && canApply && (
            <Button
              size="sm"
              variant="secondary"
              icon={<WandSparkles />}
              onClick={() => onFix(issue)}
            >
              {issue.autofix.label}
            </Button>
          )}
          {issue.kind === "seo" && <span className="st-dc__tag">SEO</span>}
        </div>
      </div>
    </li>
  );
}

function CheckFailures({ failures, doc }: { failures: CheckFailure[]; doc: SiteDocument }) {
  return (
    <div className="st-dc__failed" role="alert">
      {failures.map((f) => (
        <p key={`${f.check}:${f.page ?? ""}`}>
          <TriangleAlert aria-hidden="true" />
          Couldn’t check {failureWhere(doc, f)}
          {f.check === "seo" ? " for search" : ""}. Some issues may not be listed; try again after
          your next change.
        </p>
      ))}
    </div>
  );
}

export interface DesignCheckPanelProps {
  /** Where "Show" goes (default: select it and scroll the canvas to it). */
  onJump?: (issue: CheckedIssue) => void;
}

/** The Design check panel: issues by page and section, jump-to, one-click and bulk fixes. */
export function DesignCheckPanel({ onJump }: DesignCheckPanelProps) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const role = useInspectorRole();
  const issues = useDesignCheck((s) => s.issues);
  const checked = useDesignCheck((s) => s.checked);
  const stale = useDesignCheck((s) => s.stale);
  const failures = useDesignCheck((s) => s.failures);
  const [kind, setKind] = useState<CheckKind | "all">("all");
  const [showInfo, setShowInfo] = useState(false);

  const visible = useMemo(
    () => (i: CheckedIssue) =>
      (kind === "all" || i.kind === kind) && (showInfo || i.severity !== "info"),
    [kind, showInfo],
  );
  const shown = useMemo(() => issues.filter(visible), [issues, visible]);
  const groups = useMemo(() => groupIssues(doc, shown), [doc, shown]);
  // Bulk fixes touch only what's on screen, never suggestions.
  const fixable = useMemo(
    () => issues.filter((i) => bulkEligible(i, visible) && canFix(doc, i, role)).length,
    [issues, visible, doc, role],
  );
  const infoCount = issues.filter((i) => i.severity === "info").length;
  const jump = onJump ?? ((i: CheckedIssue) => jumpToIssue(api, i));

  if (!checked) {
    return (
      <div className="st-dc st-dc--loading" role="status">
        <Spinner size={14} /> Checking your site…
      </div>
    );
  }

  return (
    <div className="st-dc" data-testid="design-check">
      <div className="st-dc__bar">
        <Segmented<CheckKind | "all">
          aria-label="Which checks"
          size="sm"
          block
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "design", label: "Design" },
            { value: "seo", label: "SEO" },
          ]}
        />
        <div className="st-dc__row">
          <label className="st-dc__toggle" htmlFor="st-dc-info">
            <Toggle id="st-dc-info" size="sm" checked={showInfo} onCheckedChange={setShowInfo} />
            Suggestions{infoCount ? ` (${infoCount})` : ""}
          </label>
          {stale && <Spinner size={12} label="Checking again" />}
          <span className="st-dc__spacer" />
          <Button
            size="sm"
            variant="primary"
            icon={<WandSparkles />}
            disabled={fixable === 0}
            onClick={() => applyAllSafe(api, role, visible)}
          >
            Fix all safe{fixable ? ` (${fixable})` : ""}
          </Button>
        </div>
      </div>
      {failures.length > 0 && <CheckFailures failures={failures} doc={doc} />}
      {groups.length === 0 && failures.length > 0 ? null : groups.length === 0 ? (
        <EmptyState
          size="sm"
          icon={issues.length ? <SearchCheck /> : <CircleCheck />}
          title={issues.length ? "Nothing in this view" : "Looks good"}
          description={
            issues.length
              ? "Turn on suggestions or switch checks to see the rest."
              : "No contrast, heading, image, call-to-action or search issues on any page."
          }
        />
      ) : (
        <div className="st-dc__groups">
          {groups.map((g) => (
            <section key={g.page || "site"} className="st-dc__page" aria-label={g.label}>
              <h3 className="st-dc__page-title">
                <span className={cx("st-dc__dot", `st-dc__dot--${g.severity}`)} aria-hidden />
                {g.label}
                <span className="st-dc__count">{g.count}</span>
              </h3>
              {g.sections.map((sec) => (
                <div key={sec.section || "page"} className="st-dc__section">
                  {sec.label && <h4 className="st-dc__section-title">{sec.label}</h4>}
                  <ul className="st-dc__list">
                    {sec.issues.map((i) => (
                      <IssueRow
                        key={i.id}
                        issue={i}
                        canApply={canFix(doc, i, role)}
                        onJump={jump}
                        onFix={(x) => applyIssueFix(api, x)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** The top-bar button: issue count (errors + warnings), opens the panel. */
export function DesignCheckBadge({
  onOpen,
  className,
}: {
  onOpen: () => void;
  className?: string;
}) {
  const counts = useDesignCheck((s) => s.counts);
  const checked = useDesignCheck((s) => s.checked);
  const failed = useDesignCheck((s) => s.failures.length > 0);
  const n = counts.attention;
  const tone = counts.error ? "error" : counts.warning || failed ? "warning" : "ok";
  const label = !checked
    ? "Design check"
    : failed
      ? `Design check couldn’t check everything${n ? `; ${n} ${n === 1 ? "issue" : "issues"}` : ""}`
      : n === 0
        ? "Design check: no issues"
        : `Design check: ${n} ${n === 1 ? "issue" : "issues"}`;
  return (
    <button
      type="button"
      className={cx("st-dc-badge", `st-dc-badge--${tone}`, className)}
      onClick={onOpen}
      aria-label={label}
      title={label}
    >
      <SearchCheck aria-hidden="true" />
      {checked && (n > 0 || failed) && (
        <span className="st-dc-badge__n st-num">{n > 0 ? n : "!"}</span>
      )}
    </button>
  );
}
