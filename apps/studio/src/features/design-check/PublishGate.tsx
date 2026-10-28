import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { CircleAlert, Smartphone, TriangleAlert, WandSparkles } from "lucide-react";
import { useMemo } from "react";
import { Button, cx } from "../../ui";
import { measuredPhoneIssues, usePhoneCheck } from "../phone/model";
import { checkSite, failureWhere, kindOf } from "./model";
import { useDesignCheck } from "./store";

/**
 * The Design check as a soft gate in the publish dialog: what still needs attention, with a
 * way to review it. Publishing stays allowed — the owner decides — except for links to pages
 * that don't exist: the Hub refuses those (they would fail the site's publish run), so they are
 * listed first and called out.
 */
export function PublishGate({
  doc,
  onReview,
  phoneChecking,
  onFixPhones,
}: {
  doc: SiteDocument;
  onReview: () => void;
  /** The Hub is measuring every page as a phone right now. */
  phoneChecking?: boolean;
  /** "Fix for phones" (the editor applies every phone fix as one change). */
  onFixPhones?: () => void;
}) {
  const checked = useDesignCheck((s) => s.checked);
  const latest = useDesignCheck((s) => s.issues);
  const latestFailures = useDesignCheck((s) => s.failures);
  const phonePages = usePhoneCheck((s) => s.pages);
  // The dialog can open right after an edit: make sure the results are for this document.
  const { issues, failures } = useMemo(() => {
    void phonePages;
    const base = checked === doc ? { issues: latest, failures: latestFailures } : checkSite(doc);
    const measured = measuredPhoneIssues(doc).map((i) => ({ ...i, kind: kindOf(i) }));
    const known = new Set(base.issues.map((i) => i.id));
    return { ...base, issues: [...base.issues, ...measured.filter((i) => !known.has(i.id))] };
  }, [checked, latest, latestFailures, doc, phonePages]);
  const phone = issues.filter((i) => i.kind === "phone" && i.severity !== "info");
  const phoneFixable = phone.some((i) => i.autofix);
  const blockers = issues.filter((i) => i.rule === "broken-link" && i.severity === "error");
  const attention = [
    ...blockers,
    ...issues.filter((i) => i.severity !== "info" && !blockers.includes(i)),
  ];
  if (!attention.length && !failures.length) return null;
  const sample = new Set(
    issues
      .filter((i) => i.rule === "sample-content" || i.rule === "placeholder-text")
      .map((i) => i.section ?? i.id),
  ).size;
  const errors = attention.filter((i) => i.severity === "error").length;
  const Icon = errors ? CircleAlert : TriangleAlert;
  const n = attention.length;
  return (
    <section
      className={cx("st-dc-gate", errors > 0 && "st-dc-gate--error")}
      aria-label="Design check"
    >
      <p className="st-dc-gate__title">
        <Icon aria-hidden="true" />
        {n > 0
          ? `Design check found ${n} ${n === 1 ? "thing" : "things"} to look at`
          : "Design check couldn’t check everything"}
      </p>
      {blockers.length > 0 && (
        <p className="st-dc-gate__note">
          {blockers.length === 1 ? "A link leads" : `${blockers.length} links lead`} to a page your
          site doesn’t have. Publishing will stop until{" "}
          {blockers.length === 1 ? "it points" : "they point"} at a page that exists.
        </p>
      )}
      {sample > 0 && (
        <p className="st-dc-gate__note">
          {sample === 1 ? "A section still has" : `${sample} sections still have`} sample content
          from a design — people, quotes, prices or details that aren’t about your site. Replace{" "}
          {sample === 1 ? "it" : "them"} before publishing.
        </p>
      )}
      {phone.length > 0 && (
        <div className="st-dc-gate__note st-dc-gate__phone">
          <p>
            <Smartphone aria-hidden="true" />{" "}
            {phone.length === 1
              ? "1 thing doesn’t work well on phones"
              : `${phone.length} things don’t work well on phones`}
            {phoneChecking ? " (checking every page on a phone…)" : "."} Most visitors will see your
            site on a phone.
          </p>
          {phoneFixable && onFixPhones && (
            <Button size="sm" variant="secondary" icon={<WandSparkles />} onClick={onFixPhones}>
              Fix for phones
            </Button>
          )}
        </div>
      )}
      {failures.length > 0 && (
        <p className="st-dc-gate__note">
          Couldn’t check {failures.map((f) => failureWhere(doc, f)).join(", ")}. Look it over
          yourself before publishing.
        </p>
      )}
      {n > 0 && (
        <ul className="st-dc-gate__list">
          {attention.slice(0, 3).map((i) => (
            <li key={i.id}>{i.message}</li>
          ))}
          {n > 3 && <li>…and {n - 3} more</li>}
        </ul>
      )}
      <div className="st-dc-gate__actions">
        <Button size="sm" variant="secondary" onClick={onReview}>
          Review issues
        </Button>
      </div>
    </section>
  );
}
