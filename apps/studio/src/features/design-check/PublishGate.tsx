import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Button, cx } from "../../ui";
import { checkSite, failureWhere } from "./model";
import { useDesignCheck } from "./store";

/**
 * The Design check as a soft gate in the publish dialog: what still needs attention, with a
 * way to review it. Publishing stays allowed — the owner decides — except for links to pages
 * that don't exist: the Hub refuses those (they would fail the site's publish run), so they are
 * listed first and called out.
 */
export function PublishGate({ doc, onReview }: { doc: SiteDocument; onReview: () => void }) {
  const checked = useDesignCheck((s) => s.checked);
  const latest = useDesignCheck((s) => s.issues);
  const latestFailures = useDesignCheck((s) => s.failures);
  // The dialog can open right after an edit: make sure the results are for this document.
  const { issues, failures } = useMemo(
    () => (checked === doc ? { issues: latest, failures: latestFailures } : checkSite(doc)),
    [checked, latest, latestFailures, doc],
  );
  const blockers = issues.filter((i) => i.rule === "broken-link" && i.severity === "error");
  const attention = [
    ...blockers,
    ...issues.filter((i) => i.severity !== "info" && !blockers.includes(i)),
  ];
  if (!attention.length && !failures.length) return null;
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
