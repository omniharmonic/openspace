import { isPhoneIssue } from "@omniharmonic/openspace-lint";
import { CircleCheck, Smartphone, WandSparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button, Spinner, toast } from "../../ui";
import { useDesignCheck } from "../design-check/store";
import { useEditorUi } from "../editor/editor-store";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import type { EditorStore } from "../editor/model/store";
import { useCanvasDocument } from "../inspector/canvasDoc";
import { useInspectorRole } from "../inspector/env";
import { measuredPhoneIssues, planPhoneFixes, recordPhoneProbe, usePhoneCheck } from "./model";
import { markCanvas, measureCanvas } from "./probe";
import "./phone.css";

/** Pause after the last edit before the phone preview is measured again. */
export const PHONE_MEASURE_DEBOUNCE_MS = 900;

/** "Fix everything for phones" as one undoable change. Returns how many fixes were made. */
export function applyPhoneFixes(store: EditorStore, role: string): number {
  const plan = planPhoneFixes(store.getState().doc, role);
  if (!plan.bodies.length) {
    toast({
      title: "Nothing to fix automatically",
      description: plan.remaining.length
        ? "What's left needs a small edit: each issue says what to do."
        : "Your pages already work well on phones.",
    });
    return 0;
  }
  const r = store.getState().commit(plan.bodies, { label: "Fix for phones" });
  if (!r.ok) {
    toast({ tone: "danger", title: "Couldn’t fix for phones", description: r.errors[0]?.message });
    return 0;
  }
  toast({
    title: "Fixed for phones",
    description: `${plan.labels.slice(0, 3).join(" · ")} — desktop stays as you designed it.`,
    action: { label: "Undo", onClick: () => store.getState().undo() },
  });
  return plan.labels.length;
}

/**
 * Shown under the canvas while it is laid out as a phone: measures the page as a phone after
 * each pause in editing, outlines what doesn't work on phones, and offers "Fix for phones".
 */
export function PhoneCheckBar() {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const breakpoint = useEditorUi((s) => s.breakpoint);
  const frame = useCanvasDocument((s) => s.doc);
  const measuring = usePhoneCheck((s) => s.measuring);
  const measured = usePhoneCheck((s) => s.pages[pageId]);
  const statics = useDesignCheck((s) => s.issues);
  const onPhone = breakpoint === "mobile";

  useEffect(() => {
    if (!onPhone || !frame) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      usePhoneCheck.getState().setMeasuring(true);
      const result = await measureCanvas(frame);
      usePhoneCheck.getState().setMeasuring(false);
      if (!cancelled && result) recordPhoneProbe(doc, pageId, [result]);
    }, PHONE_MEASURE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onPhone, frame, doc, pageId]);

  const issues = useMemo(() => {
    const here = statics.filter(
      (i) =>
        isPhoneIssue(i) &&
        i.severity !== "info" &&
        (!i.page || i.page === pageId || i.page === "footer"),
    );
    const live = measured?.doc === doc ? measuredPhoneIssues(doc, pageId) : [];
    return [...here, ...live.filter((i) => i.severity !== "info")];
  }, [statics, measured, doc, pageId]);

  // Outline what needs attention on the phone canvas; clear the marks elsewhere.
  useEffect(() => {
    if (!frame) return;
    const ids = onPhone
      ? [...new Set(issues.map((i) => i.block ?? i.section).filter((x): x is string => !!x))]
      : [];
    markCanvas(frame, ids);
  }, [frame, onPhone, issues]);

  if (!onPhone) return null;
  const n = issues.length;
  const fixable = issues.some((i) => i.autofix);
  return (
    <div className="st-phone-bar" role="status" data-testid="phone-check">
      <Smartphone aria-hidden="true" />
      {n === 0 ? (
        <span className="st-phone-bar__msg">
          {measuring && !measured ? (
            <>
              <Spinner size={12} /> Checking this page on a phone…
            </>
          ) : (
            <>
              <CircleCheck aria-hidden="true" className="st-phone-bar__ok" /> Looks great on phones
            </>
          )}
        </span>
      ) : (
        <span className="st-phone-bar__msg">
          {n === 1
            ? "1 thing doesn’t work well on phones"
            : `${n} things don’t work well on phones`}
          {measuring ? <Spinner size={12} label="Checking again" /> : null}
        </span>
      )}
      {n > 0 && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useEditorUi.getState().showLeftPanel("check")}
          >
            Review
          </Button>
          {fixable && (
            <Button
              size="sm"
              variant="primary"
              icon={<WandSparkles />}
              onClick={() => applyPhoneFixes(api, role)}
            >
              Fix for phones
            </Button>
          )}
        </>
      )}
    </div>
  );
}
